/**
 * GET /api/training/progress
 * Returns user's training progress for a game
 * BUG #284 FIX: Was accepting userId from query params (IDOR).
 * Now uses JWT auth to enforce identity.
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { sanitizeParam, withTiming } from '../../../src/utils/trainingApiUtils';
import { getLevel } from '../../../src/config/LevelRegistry';

// ── Lazy Supabase getter (SSG-safe) ─────────────────────────────
let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        _supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
    }
    return _supabase;
}
const DEFAULT_PROGRESS = {
    current_level: 1,
    highest_level_unlocked: 1,
    health_chips: 100,
    total_hands_played: 0,
    total_correct: 0,
    total_rounds_completed: 0
};

export default async function handler(req, res) {
  try {
      withTiming(res);
      if (!applyRateLimit(req, res, LIMITS.read)) return;

      if (req.method !== 'GET') {
          return res.status(405).json({ success: false, error: 'GET only' });
      }

      const gameId = sanitizeParam(req.query.gameId, 100);

      // Auth: require JWT, use authenticated user ID (not query param)
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(200).json(DEFAULT_PROGRESS); // Anonymous = defaults

      const { data: { user }, error: authErr } = await getSupabase().auth.getUser(token);
      if (authErr || !user) return res.status(200).json(DEFAULT_PROGRESS);

      const userId = user.id; // From JWT, not query param

      try {
          // Get user session for this game
          const { data: session, error } = await getSupabase()
              .from('god_mode_user_session')
              .select('current_level, highest_level_unlocked, health_chips, total_hands_played, total_correct, total_rounds_completed')
              .eq('user_id', userId)
              .eq('game_id', gameId)
              .maybeSingle();

          if (error || !session) {
              return res.status(200).json(DEFAULT_PROGRESS);
          }

          // ═══ LEVEL REGISTRY: Enrich response with level metadata ═══
          const currentLevelDef = getLevel(session.current_level || 1);
          const enrichedSession = {
              ...session,
              levelMeta: currentLevelDef ? {
                  name: currentLevelDef.name,
                  tier: currentLevelDef.tier,
                  masteryThreshold: currentLevelDef.masteryThreshold,
                  diamondMultiplier: currentLevelDef.diamondMultiplier,
                  accentColor: currentLevelDef.accentColor,
              } : null,
          };

          return res.status(200).json(enrichedSession);

      } catch (err) {
          console.error('Error fetching progress:', err);
          return res.status(200).json(DEFAULT_PROGRESS);
      }

  } catch (err) {
    console.error('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
