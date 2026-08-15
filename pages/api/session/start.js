import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * GOD MODE ENGINE - Session Start API
 * ===========================================================================
 * POST /api/session/start
 *
 * Initializes a new training session for a user and game.
 * ===========================================================================
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { randomUUID } from 'crypto';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
  try {
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
          if (!applyRateLimit(req, res, LIMITS.write)) return;
      }

      // Require JWT auth for write operations
      if (req.method !== 'GET') {
          const _token = req.headers.authorization?.replace('Bearer ', '');
          if (!_token) return res.status(401).json({ error: 'Authentication required' });
          const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
          const _authUser = authData?.user;
          if (authErr || !_authUser) return res.status(401).json({ error: 'Invalid token' });
          if (req.body) req.body.userId = _authUser.id;
      }
      if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
      }

      try {
          const { game_id, level = 1 } = req.body;
          // BUG #272 FIX: Always use authenticated user ID, not client-supplied user_id.
          // The auth middleware sets req.body.userId (camelCase) but this code was
          // reading user_id (snake_case) from the body, ignoring the JWT identity.
          const user_id = req.body.userId; // Set by auth middleware from JWT

          if (!game_id) {
              return res.status(400).json({ error: 'Missing game_id' });
          }

          // Generate a session ID
          const sessionId = randomUUID();
          const effectiveUserId = user_id; // Always authenticated, no anonymous fallback

          // Get game info from registry
          let gameName = 'Training Game';
          let engineType = 'PIO';
          let gameConfig = {};

          const { data: game, error: gameError } = await getSupabase()
              .from('game_registry')
              .select('*')
              .eq('slug', game_id)
              .maybeSingle();

          if (game) {
              gameName = game.title || game.name || gameName;
              engineType = game.engine_type || engineType;
              gameConfig = game.config || {};
          }

          // Try to get or create user session record
          let currentLevel = level;
          let currentHp = 100;

          // 2026-08-15 follow-up to the CHECK 13 fix: god_mode_user_session.game_id
          // is a uuid referencing game_registry — querying it with the request's
          // SLUG fails on type. Use the registry row resolved above; without a
          // registry row there is nothing to persist against.
          const gameUUID = game?.id || null;
          if (user_id && gameUUID) {
              // Check for existing session/progress
              const { data: existingSession } = await getSupabase()
                  .from('god_mode_user_session')
                  .select('*')
                  .eq('user_id', user_id)
                  .eq('game_id', gameUUID)
                  .maybeSingle();

              if (existingSession) {
                  currentLevel = Math.max(level, existingSession.current_level || 1);
                  currentHp = existingSession.health_chips || 100;
              }

              // Create or update session record
              const { error: upsertError } = await getSupabase()
                  .from('god_mode_user_session')
                  // 2026-08-15 CHECK 13 fix: this wrote session_id,
                  // round_hand_count and round_correct_count — none exist on
                  // god_mode_user_session (real: current_round_hands_played /
                  // current_round_correct; no session id column) — so the upsert
                  // 42703'd on every session start and progress (level, HP,
                  // totals) NEVER persisted. sessionId still goes back to the
                  // client in the response; it just isn't a DB column.
                  .upsert({
                      user_id: user_id,
                      game_id: gameUUID,
                      current_level: currentLevel,
                      health_chips: currentHp,
                      current_round_hands_played: 0,
                      current_round_correct: 0,
                      total_hands_played: existingSession?.total_hands_played || 0,
                      total_correct: existingSession?.total_correct || 0,
                      highest_level_unlocked: existingSession?.highest_level_unlocked || 1,
                      updated_at: new Date().toISOString(),
                  }, {
                      onConflict: 'user_id,game_id'
                  });

              // HIGH FIX #3: Add error logging to empty error handler
              if (upsertError) {
                  console.warn('[Session] Upsert error:', upsertError.message);
              }
          }

          // Return session data
          return res.status(200).json({
              session_id: sessionId,
              game_name: gameName,
              engine_type: engineType,
              current_level: currentLevel,
              current_hp: currentHp,
              config: gameConfig,
          });

      } catch (error) {
          console.warn('Session start error:', error);
          return res.status(500).json({ error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}