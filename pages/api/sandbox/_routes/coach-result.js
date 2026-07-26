/**
 * POST /api/sandbox/coach-result
 * Persists a Socratic Coach Mode result to sandbox_coach_results.
 * Called from sandbox.js after coach verdict is received.
 */
import { createClient } from '../../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

const STREETS = ['preflop', 'flop', 'turn', 'river'];

/** Trim an optional free-text field to N chars; null when absent. */
function clampOptional(value, max) {
    if (value === undefined || value === null || value === '') return null;
    return String(value).slice(0, max);
}

export default async function handler(req, res) {
  try {
      // Unbounded writes feed the leaderboard/session-stats aggregations —
      // limit before doing any work.
      if (!applyRateLimit(req, res, LIMITS.write)) return;

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      try {
          const supabase = getSupabase();

          // Authenticate
          let userId = null;
          const authHeader = req.headers.authorization;
          if (authHeader?.startsWith('Bearer ')) {
              const token = authHeader.replace('Bearer ', '');
              try {
                  const { data: authData } = await supabase.auth.getUser(token);
                  const user = authData?.user;
                  if (user) userId = user.id;
              } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
          }

          // Guest submissions are allowed but not stored
          if (!userId) {
              return res.status(200).json({ success: true, stored: false, reason: 'guest' });
          }

          const {
              hand, position, street, board,
              userPick, gtoAction, isCorrect, evDelta, sessionId,
          } = req.body || {};

          if (!hand || !userPick) {
              return res.status(400).json({ success: false, error: 'Missing required fields: hand, userPick' });
          }
          if (typeof hand !== 'string' || typeof userPick !== 'string') {
              return res.status(400).json({ success: false, error: 'hand and userPick must be strings' });
          }
          for (const [key, val] of Object.entries({ position, street, board, gtoAction })) {
              if (val !== undefined && val !== null && typeof val !== 'string') {
                  return res.status(400).json({ success: false, error: `${key} must be a string` });
              }
          }

          // Street is stored lowercase — every reader (macro-analysis,
          // session-stats) buckets on the lowercase form.
          const rawStreet = String(street || 'preflop').toLowerCase().trim();
          // Drill rows carry values like 'flop_cbet' — keep the street prefix.
          const normalizedStreet = STREETS.find(s => rawStreet.startsWith(s)) || 'preflop';

          const { data, error } = await supabase
              .from('sandbox_coach_results')
              .insert({
                  user_id: userId,
                  session_id: sessionId || null,
                  hero_hand: hand.slice(0, 40),
                  hero_position: clampOptional(position, 40),
                  street: normalizedStreet,
                  board: clampOptional(board, 60),
                  user_pick: userPick.slice(0, 40),
                  gto_action: clampOptional(gtoAction, 40),
                  is_correct: typeof isCorrect === 'boolean' ? isCorrect : null,
                  ev_delta: typeof evDelta === 'number' && isFinite(evDelta) ? evDelta : null,
              })
              .select('id')
              .maybeSingle();

          if (error) {
              console.warn('[coach-result] Insert error:', error.message);
              if (error.code === '42P01') {
                  return res.status(200).json({ success: true, stored: false, reason: 'table_missing' });
              }
              return res.status(500).json({ success: false, error: 'Internal server error' });
          }

          return res.status(200).json({ success: true, id: data?.id });
      } catch (err) {
          console.warn('[coach-result] Handler error:', err);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
