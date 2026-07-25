/**
 * API: Save Training Progress
 * ═══════════════════════════════════════════════════════════════════════════
 * Saves user progress after completing a level
 * 
 * POST /api/training/save-progress
 * 
 * Body:
 * {
 *   userId: string,
 *   gameId: string,
 *   level: number,
 *   questionsAnswered: number,
 *   questionsCorrect: number,
 *   accuracy: number,
 *   passed: boolean,
 *   streak: number,
 *   diamondsEarned: number,
 *   timeSpentSeconds: number
 * }
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { withRetry } from '../../../src/lib/supabaseRetry';
import { withTiming } from '../../../src/utils/trainingApiUtils';
import { getMasteryGate } from '../../../src/guards/MasteryGate';
import { reportApiError } from '../../../src/lib/sentryWrap';

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
/**
 * Upsert leaderboard entry for user
 * Updates both 'daily' and 'all_time' leaderboards
 */
async function upsertLeaderboard(sb, userId, gameId, diamondsEarned, accuracy, passed) {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const periodEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

    for (const leaderboardType of ['daily', 'all_time']) {
        // Check if entry exists
        const { data: existing } = await sb
            .from('training_leaderboard')
            .select('id, total_games_completed, average_accuracy, total_mastery_points')
            .eq('user_id', userId)
            .eq('leaderboard_type', leaderboardType)
            .maybeSingle();

        if (existing) {
            // Update existing entry.
            // Only fold accuracy into the running average when the denominator
            // grows (passed) — otherwise failed sessions inflate the average.
            const gamesCompleted = existing.total_games_completed || 0;
            const existingAvg = existing.average_accuracy || 0;
            const newGamesCompleted = gamesCompleted + (passed ? 1 : 0);
            const newAccuracy = passed
                ? ((existingAvg * gamesCompleted) + accuracy) / newGamesCompleted
                : existingAvg;

            await sb.from('training_leaderboard')
                .update({
                    total_games_completed: newGamesCompleted,
                    total_mastery_points: (existing.total_mastery_points || 0) + diamondsEarned,
                    average_accuracy: Math.round(newAccuracy),
                    updated_at: now.toISOString(),
                })
                .eq('id', existing.id);
        } else {
            // Insert new entry
            await sb.from('training_leaderboard').insert({
                user_id: userId,
                leaderboard_type: leaderboardType,
                game_id: gameId,
                total_games_completed: passed ? 1 : 0,
                total_mastery_points: diamondsEarned,
                average_accuracy: accuracy,
                period_start: leaderboardType === 'daily' ? periodStart : null,
                period_end: leaderboardType === 'daily' ? periodEnd : null,
            });
        }
    }
}

export default async function handler(req, res) {
  try {
      withTiming(res);
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
          if (!applyRateLimit(req, res, LIMITS.write)) return;
      }

      // Require JWT auth for write operations
      if (req.method !== 'GET') {
          const _token = req.headers.authorization?.replace('Bearer ', '');
          if (!_token) return res.status(401).json({ success: false, error: 'Authentication required' });
          const { data: authData, error: _authErr } = await getSupabase().auth.getUser(_token);
          const _authUser = authData?.user;
          if (_authErr || !_authUser) return res.status(401).json({ success: false, error: 'Invalid token' });
          if (req.body) req.body.userId = _authUser.id;
      }

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      // Body size guard (50KB max)
      const bodySize = JSON.stringify(req.body || {}).length;
      if (bodySize > 51200) {
          return res.status(413).json({ success: false, error: 'Request body too large' });
      }

      try {
          const {
              userId,
              gameId,
              level,
              questionsAnswered,
              questionsCorrect,
              accuracy,
              passed,
              streak,
              diamondsEarned: rawDiamonds,
              timeSpentSeconds
          } = req.body;

          // SECURITY: Server-side diamond cap — prevents client-side economy abuse
          // Max legitimate training reward: ~100 diamonds (perfect accuracy + streak + level bonuses)
          const diamondsEarned = Math.max(0, Math.min(parseInt(rawDiamonds, 10) || 0, 100));

          // Validation
          if (!userId || !gameId || !level) {
              return res.status(400).json({ success: false, error: 'Missing required fields' });
          }

          // ═══ MASTERY GATE: Server-side mastery verification ═══
          // Don't trust client `passed` — run MasteryGate.checkMastery() server-side
          const masteryGate = getMasteryGate();
          const masteryResult = masteryGate.checkMastery(
              userId,
              level,
              questionsCorrect || 0,
              questionsAnswered || 0
          );
          // Override client-side `passed` with server-verified result
          const serverVerifiedPassed = masteryResult.achieved;
          const masteryToken = masteryResult.masteryToken || null;

          // 1. Save level completion to history (with retry for transient failures)
          const { data: levelHistory, error: historyError } = await withRetry(
              () => getSupabase()
                  .from('training_level_history')
                  .insert({
                      user_id: userId,
                      game_id: gameId,
                      level: level,
                      questions_answered: questionsAnswered,
                      questions_correct: questionsCorrect,
                      accuracy_percentage: accuracy,
                      passed: serverVerifiedPassed,
                      time_spent_seconds: timeSpentSeconds,
                      best_streak: streak,
                      diamonds_earned: diamondsEarned
                  })
                  .select()
                  .maybeSingle(),
              { label: 'SaveProgress:history' }
          );

          if (historyError) {
              console.warn('Error saving level history:', historyError);
          }

          // 2. Update or create training_progress
          const { data: existingProgress } = await getSupabase()
              .from('training_progress')
              .select('hands_played, correct_answers, total_answers, current_streak, best_streak')
              .eq('user_id', userId)
              .eq('game_id', gameId)
              .maybeSingle();

          if (existingProgress) {
              // Update existing progress
              const { data: updatedProgress, error: updateError } = await withRetry(
                  () => getSupabase()
                      .from('training_progress')
                      .update({
                          level: serverVerifiedPassed ? Math.min(level + 1, 12) : level,
                          hands_played: (existingProgress.hands_played || 0) + questionsAnswered,
                          correct_answers: (existingProgress.correct_answers || 0) + questionsCorrect,
                          total_answers: (existingProgress.total_answers || 0) + questionsAnswered,
                          current_streak: streak,
                          best_streak: Math.max(streak, existingProgress.best_streak || 0),
                          last_played_at: new Date().toISOString()
                      })
                      .eq('user_id', userId)
                      .eq('game_id', gameId)
                      .select()
                      .maybeSingle(),
                  { label: 'SaveProgress:update' }
              );

              if (updateError) {
                  console.warn('Error updating progress:', updateError);
                  return res.status(500).json({ success: false, error: 'Failed to update progress' });
              }

              // 3. Upsert leaderboard entry
              try {
                  await upsertLeaderboard(getSupabase(), userId, gameId, diamondsEarned, accuracy, serverVerifiedPassed);
              } catch (lbError) {
                  console.warn('Leaderboard upsert failed:', lbError.message);
              }

              // 4. Award diamonds to profile balance.
              // Phase 63: was using try/await without { error } destructure —
              // supabase-js does NOT throw on DB errors, so RPC failures
              // (insufficient permissions, constraint violations, etc.)
              // were silently swallowed and `diamondsAwarded` claimed in the
              // response was a lie. Now captures rpcErr and reports
              // diamondsAwarded:0 + diamondsAwardError to the client.
              // Also drops Date.now() from reference_id — it made every
              // retry credit again instead of dedup-ing at the DB.
              let _diamondsActuallyAwarded = 0;
              let _diamondsAwardError = null;
              if (diamondsEarned > 0) {
                  try {
                      const { error: rpcErr } = await getSupabase().rpc('add_diamonds_to_balance', {
                          p_user_id: userId,
                          p_amount: diamondsEarned,
                          p_type: 'training_reward',
                          p_description: `Training: ${gameId} L${level} — ${diamondsEarned}diamonds`,
                          p_reference_id: `progress_${userId}_${gameId}_${level}_${new Date().toISOString().slice(0, 10)}`
                      });
                      if (rpcErr) {
                          console.warn('[SaveProgress] Diamond RPC error:', rpcErr.message);
                          _diamondsAwardError = rpcErr.message;
                      } else {
                          _diamondsActuallyAwarded = diamondsEarned;
                      }
                  } catch (e) {
                      console.warn('[SaveProgress] Diamond award threw:', e.message);
                      _diamondsAwardError = e.message;
                  }
              }

              return res.status(200).json({
                  success: true,
                  progress: updatedProgress,
                  levelHistory: levelHistory,
                  diamondsAwarded: _diamondsActuallyAwarded,
                  ...(_diamondsAwardError && { diamondsAwardError: _diamondsAwardError }),
                  mastery: {
                      passed: serverVerifiedPassed,
                      status: masteryResult.status,
                      accuracy: masteryResult.accuracyPercent,
                      masteryToken: masteryToken,
                      nextLevelUnlocked: masteryResult.nextLevelUnlocked || null,
                      message: masteryResult.message,
                  }
              });
          } else {
              // Create new progress
              const { data: newProgress, error: insertError } = await withRetry(
                  () => getSupabase()
                      .from('training_progress')
                      .insert({
                          user_id: userId,
                          game_id: gameId,
                          level: serverVerifiedPassed ? Math.min(level + 1, 12) : level,
                          hands_played: questionsAnswered,
                          correct_answers: questionsCorrect,
                          total_answers: questionsAnswered,
                          current_streak: streak,
                          best_streak: streak,
                          last_played_at: new Date().toISOString()
                      })
                      .select()
                      .maybeSingle(),
                  { label: 'SaveProgress:insert' }
              );

              if (insertError) {
                  console.warn('Error creating progress:', JSON.stringify(insertError, null, 2));
                  console.warn('Insert payload:', { userId, gameId, level, questionsAnswered, questionsCorrect });
                  return res.status(500).json({
                      success: false, error: 'Failed to create progress'
                  });
              }

              // 3. Upsert leaderboard entry
              try {
                  await upsertLeaderboard(getSupabase(), userId, gameId, diamondsEarned, accuracy, serverVerifiedPassed);
              } catch (lbError) {
                  console.warn('Leaderboard upsert failed:', lbError.message);
              }

              // 4. Award diamonds to profile balance.
              // Phase 63: same fix as the existing-progress branch above.
              let _diamondsActuallyAwarded2 = 0;
              let _diamondsAwardError2 = null;
              if (diamondsEarned > 0) {
                  try {
                      const { error: rpcErr } = await getSupabase().rpc('add_diamonds_to_balance', {
                          p_user_id: userId,
                          p_amount: diamondsEarned,
                          p_type: 'training_reward',
                          p_description: `Training: ${gameId} L${level} — ${diamondsEarned}diamonds`,
                          p_reference_id: `progress_${userId}_${gameId}_${level}_${new Date().toISOString().slice(0, 10)}`
                      });
                      if (rpcErr) {
                          console.warn('[SaveProgress] Diamond RPC error:', rpcErr.message);
                          _diamondsAwardError2 = rpcErr.message;
                      } else {
                          _diamondsActuallyAwarded2 = diamondsEarned;
                      }
                  } catch (e) {
                      console.warn('[SaveProgress] Diamond award threw:', e.message);
                      _diamondsAwardError2 = e.message;
                  }
              }

              return res.status(200).json({
                  success: true,
                  progress: newProgress,
                  levelHistory: levelHistory,
                  diamondsAwarded: _diamondsActuallyAwarded2,
                  ...(_diamondsAwardError2 && { diamondsAwardError: _diamondsAwardError2 }),
                  mastery: {
                      passed: serverVerifiedPassed,
                      status: masteryResult.status,
                      accuracy: masteryResult.accuracyPercent,
                      masteryToken: masteryToken,
                      nextLevelUnlocked: masteryResult.nextLevelUnlocked || null,
                      message: masteryResult.message,
                  }
              });
          }

      } catch (error) {
          console.warn('Error in save-progress:', error);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
