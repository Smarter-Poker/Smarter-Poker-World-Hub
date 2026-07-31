import { getServerUserWithFallback } from '../../src/lib/serverAuth';
/**
 * GET /api/training/get-sessions
 * Fetches recent training sessions for a user/game.
 *
 * Query params:
 * - gameId: Game identifier
 * - limit: Max sessions to return (default 10)
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { sanitizeParam, clampPagination, withTiming } from '../../../src/utils/trainingApiUtils';
import { reportApiError } from '../../../src/lib/sentryWrap';

// ●● Lazy Supabase getter (SSG-safe) ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
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
export default async function handler(req, res) {
  try {
      withTiming(res);
      if (!applyRateLimit(req, res, LIMITS.read)) return;

      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

      if (req.method !== 'GET') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      res.setHeader('Cache-Control', 'private, max-age=10, stale-while-revalidate=30');

      const { gameId: rawGameId, limit: rawLimit = '50', sessionId: rawSessionId } = req.query;
      const gameId = rawGameId ? sanitizeParam(rawGameId, 100) : null;
      const sessionId = rawSessionId ? sanitizeParam(rawSessionId, 100) : null;
      const { limit: boundedLimit } = clampPagination(rawLimit, 1);

      try {
          // ●●● PHASE 15: Session detail mode — return full hand_history for replay ●●●
          if (sessionId) {
              const { data: session, error: detailErr } = await getSupabase()
                  .from('training_sessions')
                  .select('id, game_id, game_name, gtow_score, hands_played, total_ev_loss, mistake_count, accuracy, correct_count, best_streak, level_passed, level, hand_history, position_stats, classification_counts, avg_ev_loss_per_hand, avg_frequency_diff, trainer_config, created_at')
                  .eq('user_id', user.id)
                  .eq('id', sessionId)
                  .maybeSingle();

              if (detailErr) {
                  console.warn('[GetSessions] Detail query failed:', detailErr.message);
                  return res.status(404).json({ success: false, error: 'Session not found' });
              }

              if (!session) {
                  return res.status(404).json({ success: false, error: 'Session not found' });
              }

              return res.status(200).json({ success: true, session });
          }

          // Try training_sessions first (rich data — select only frontend-consumed columns)
          let query = getSupabase()
              .from('training_sessions')
              .select('id, game_id, game_name, gtow_score, hands_played, total_ev_loss, mistake_count, accuracy, correct_count, best_streak, level_passed, level, created_at')
              .eq('user_id', user.id)
              .order('created_at', { ascending: false })
              .limit(boundedLimit);

          // Only filter by game_id if provided
          if (gameId) {
              query = query.eq('game_id', gameId);
          }

          const { data: sessions, error: sessErr } = await query;

          if (!sessErr && sessions && sessions.length > 0) {
              return res.status(200).json({ success: true, sessions });
          }

          // Fallback to training_level_history
          let histQuery = getSupabase()
              .from('training_level_history')
              .select('id, game_id, accuracy_percentage, questions_answered, questions_correct, best_streak, passed, level, created_at')
              .eq('user_id', user.id)
              .order('created_at', { ascending: false })
              .limit(boundedLimit);

          if (gameId) {
              histQuery = histQuery.eq('game_id', gameId);
          }

          const { data: history, error: histErr } = await histQuery;

          if (histErr) {
              console.warn('[GetSessions] History query failed:', histErr.message);
              return res.status(200).json({ success: true, sessions: [] });
          }

          // Normalize history format
          const normalized = (history || []).map(h => ({
              id: h.id,
              game_id: h.game_id,
              gtow_score: h.accuracy_percentage,
              hands_played: h.questions_answered,
              total_ev_loss: 0,
              mistake_count: 0,
              accuracy: h.accuracy_percentage,
              correct_count: h.questions_correct,
              best_streak: h.best_streak || 0,
              level_passed: h.passed,
              level: h.level,
              created_at: h.created_at,
          }));

          return res.status(200).json({ success: true, sessions: normalized });

      } catch (err) {
          console.warn('[GetSessions] Error:', err);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
