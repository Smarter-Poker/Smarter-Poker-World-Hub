import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
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
import { runTrainingPersistenceQuery } from '../../../src/lib/training/trainingPersistence.mjs';
import {
    projectTrainingLevelHistory,
    projectTrainingSessionEvidence,
} from '../../../src/lib/training/sessionEvidence.mjs';

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

// A training_sessions row is eligible for product-facing history only when it
// was projected from a sealed, non-practice server attempt. The legacy table
// has no practice_only column, so the attempt relation is the authority.
const VERIFIED_ATTEMPT_SELECT = 'training_attempts!training_sessions_attempt_fk!inner(id, user_id, status, practice_only)';

export default async function handler(req, res) {
  try {
      withTiming(res);
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      res.setHeader('Vary', 'Authorization');
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

      const { gameId: rawGameId, limit: rawLimit = '50', sessionId: rawSessionId } = req.query;
      const gameId = rawGameId ? sanitizeParam(rawGameId, 100) : null;
      const sessionId = rawSessionId ? sanitizeParam(rawSessionId, 100) : null;
      const { limit: boundedLimit } = clampPagination(rawLimit, 1);

      try {
          // ●●● PHASE 15: Session detail mode — return full hand_history for replay ●●●
          if (sessionId) {
              const { data: session, error: detailErr } = await runTrainingPersistenceQuery(
                  () => getSupabase()
                      .from('training_sessions')
                      .select(`id, game_id, game_name, gtow_score, score_scale, hands_played, total_ev_loss, mistake_count, accuracy, correct_count, best_streak, level_passed, level, hand_history, position_stats, classification_counts, avg_ev_loss_per_hand, avg_ev_loss_per_mistake, avg_frequency_diff, trainer_config, attempt_id, created_at, ${VERIFIED_ATTEMPT_SELECT}`)
                      .eq('user_id', user.id)
                      .eq('training_attempts.user_id', user.id)
                      .eq('training_attempts.status', 'completed')
                      .eq('id', sessionId)
                      .not('attempt_id', 'is', null)
                      .eq('training_attempts.practice_only', false)
                      .maybeSingle(),
                  { label: 'TrainingSessions.detail' },
              );

              if (detailErr) {
                  console.warn('[GetSessions] Detail query failed:', detailErr.message);
                  return res.status(503).json({
                      success: false,
                      unavailable: true,
                      code: 'TRAINING_SESSION_HISTORY_UNAVAILABLE',
                      error: 'Training session history is temporarily unavailable',
                  });
              }

              if (!session) {
                  return res.status(404).json({ success: false, error: 'Session not found' });
              }

              return res.status(200).json({
                  success: true,
                  session: projectTrainingSessionEvidence(session),
              });
          }

          // Try training_sessions first (rich data — select only frontend-consumed columns)
          const buildSessionQuery = () => {
              let query = getSupabase()
                  .from('training_sessions')
                  .select(`id, game_id, game_name, gtow_score, score_scale, hands_played, total_ev_loss, mistake_count, accuracy, correct_count, best_streak, level_passed, level, hand_history, position_stats, classification_counts, attempt_id, created_at, ${VERIFIED_ATTEMPT_SELECT}`)
                  .eq('user_id', user.id)
                  .eq('training_attempts.user_id', user.id)
                  .eq('training_attempts.status', 'completed')
                  .not('attempt_id', 'is', null)
                  .eq('training_attempts.practice_only', false)
                  .order('created_at', { ascending: false })
                  .limit(boundedLimit);
              if (gameId) query = query.eq('game_id', gameId);
              return query;
          };

          const { data: sessions, error: sessErr } = await runTrainingPersistenceQuery(
              buildSessionQuery,
              { label: 'TrainingSessions.list' },
          );

          if (sessErr) {
              console.warn('[GetSessions] Canonical session query failed:', sessErr.message);
              return res.status(503).json({
                  success: false,
                  unavailable: true,
                  code: 'TRAINING_SESSION_HISTORY_UNAVAILABLE',
                  error: 'Training session history is temporarily unavailable',
              });
          }

          if (!sessErr && sessions && sessions.length > 0) {
              return res.status(200).json({
                  success: true,
                  sessions: sessions.map(projectTrainingSessionEvidence),
              });
          }

          // Fallback to training_level_history
          const buildHistoryQuery = () => {
              let query = getSupabase()
                  .from('training_level_history')
                  // completed_at is aliased to keep the public response shape.
                  .select('id, game_id, accuracy_percentage, questions_answered, questions_correct, best_streak, passed, level, created_at:completed_at')
                  .eq('user_id', user.id)
                  .not('attempt_id', 'is', null)
                  .eq('practice_only', false)
                  .order('completed_at', { ascending: false })
                  .limit(boundedLimit);
              if (gameId) query = query.eq('game_id', gameId);
              return query;
          };

          const { data: history, error: histErr } = await runTrainingPersistenceQuery(
              buildHistoryQuery,
              { label: 'TrainingSessions.levelHistory' },
          );

          if (histErr) {
              console.warn('[GetSessions] History query failed:', histErr.message);
              return res.status(503).json({
                  success: false,
                  unavailable: true,
                  code: 'TRAINING_SESSION_HISTORY_UNAVAILABLE',
                  error: 'Training session history is temporarily unavailable',
              });
          }

          const normalized = (history || []).map(projectTrainingLevelHistory);

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
