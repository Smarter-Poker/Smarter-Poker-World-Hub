import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * API: Save Training Progress
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
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
import { safeAward } from '../../../src/lib/rewards/awardGuard';

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
/**
 * Record leaderboard stats for all four periods (daily/weekly/monthly/alltime)
 * via the atomic fn_training_leaderboard_record RPC.
 *
 * 2026-08-09: the previous implementation was a SELECT -> compute ->
 * UPDATE/INSERT round-trip per period. Two sessions finishing close together
 * both read the same "existing" row and the second write clobbered the first
 * (lost sessions_completed / questions_answered / questions_correct
 * increments). public.fn_training_leaderboard_record now does the whole
 * increment as one INSERT ... ON CONFLICT (user_id, period_type, period_key)
 * DO UPDATE server-side: sessions_completed +1, answered/correct accumulate,
 * accuracy recomputed from the accumulated totals, perfect_rounds +1 when
 * p_is_perfect, best_streak = greatest(old, new), gtow_score_avg = running
 * mean over sessions that supplied a score, ev_loss_total accumulates,
 * score_scale = 2.
 *
 * Period-key formats are UNCHANGED and must stay in lockstep with
 * update-leaderboard.js: dailyKey ISO date, weeklyKey YYYY-W##, monthlyKey
 * YYYY-MM, and the literal 'alltime'. (update-leaderboard.js itself is a dead
 * path: its sole caller is GameSession.tsx, which no page or component
 * imports -- re-verified by grep 2026-08-09. See the note in that file.)
 *
 * This endpoint's request body carries `streak` (mapped to p_best_streak) but
 * no GTOW score and no EV loss -- both callers (useProgression.ts and
 * useGTOTrainer.js) omit them -- so p_gtow_score / p_ev_loss are explicit
 * nulls. The function skips the running average and the EV total for null
 * inputs rather than polluting them with zeros.
 *
 * Returns { attempted, failed } so the caller can report partial or total
 * failure instead of silently claiming leaderboard success.
 */
async function upsertLeaderboard(sb, userId, { answered, correct, bestStreak = null, gtowScore = null, evLoss = null }) {
    const now = new Date();
    const dailyKey = now.toISOString().split('T')[0];
    const weekNum = Math.ceil((now.getDate() + new Date(now.getFullYear(), now.getMonth(), 1).getDay()) / 7);
    const weeklyKey = `${now.getFullYear()}-W${weekNum.toString().padStart(2, '0')}`;
    const monthlyKey = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;

    const periods = [
        { type: 'daily', key: dailyKey },
        { type: 'weekly', key: weeklyKey },
        { type: 'monthly', key: monthlyKey },
        { type: 'alltime', key: 'alltime' },
    ];

    const a = Number(answered) || 0;
    const c = Number(correct) || 0;
    const isPerfect = a > 0 && c === a;
    const streakInt = (bestStreak === null || bestStreak === undefined || bestStreak === '')
        ? null
        : (Number.isFinite(Number(bestStreak)) ? Math.max(0, Math.round(Number(bestStreak))) : null);

    const results = await Promise.allSettled(periods.map(async (period) => {
        const { error } = await sb.rpc('fn_training_leaderboard_record', {
            p_user_id: userId,
            p_period_type: period.type,
            p_period_key: period.key,
            p_answered: a,
            p_correct: c,
            p_is_perfect: isPerfect,
            p_best_streak: streakInt,
            p_gtow_score: (gtowScore === null || gtowScore === undefined) ? null : Number(gtowScore),
            p_ev_loss: (evLoss === null || evLoss === undefined) ? null : Number(evLoss),
        });
        if (error) throw new Error(`${period.type}/${period.key}: ${error.message}`);
    }));

    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length > 0) {
        console.warn(
            `[SaveProgress] leaderboard RPC failed for ${failed.length}/${periods.length} periods:`,
            failed.map((f) => f.reason?.message || String(f.reason))
        );
    }
    return { attempted: periods.length, failed: failed.length };
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
          const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
          const _authUser = authData?.user;
          if (authErr || !_authUser) return res.status(401).json({ success: false, error: 'Invalid token' });
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

          // ●●● MASTERY GATE: Server-side mastery verification ●●●
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

              // 3. Record leaderboard stats -- one atomic RPC per period.
              // Assume total failure until the RPC batch reports otherwise so a
              // thrown error cannot masquerade as leaderboard success below.
              let leaderboardResult = { attempted: 4, failed: 4 };
              try {
                  leaderboardResult = await upsertLeaderboard(getSupabase(), userId, {
                      answered: questionsAnswered,
                      correct: questionsCorrect,
                      bestStreak: streak,
                      gtowScore: null, // not carried by this endpoint's request body
                      evLoss: null,    // not carried by this endpoint's request body
                  });
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
                      // Award via award_diamonds_v2 (training_reward catalog key).
                      // Amount passed in metadata.reward_diamonds; 1,500 ◆/month family ceiling applies.
                      const { ok: rpcOk, data: rpcData, error: rpcErr } = await safeAward(getSupabase(), {
                          p_user_id: userId,
                          p_action_key: 'training_reward',
                          p_reference_id: `progress_${userId}_${gameId}_${level}_${new Date().toISOString().slice(0, 10)}`,
                          p_metadata: {
                              reward_diamonds: diamondsEarned,
                              game_id: gameId,
                              level,
                              _source: 'api/training/save-progress',
                          },
                      });
                      if (!rpcOk) {
                          console.warn('[SaveProgress] award_diamonds_v2 error (existing-progress branch):', rpcErr);
                          _diamondsAwardError = rpcErr?.message || String(rpcErr);
                      } else {
                          const result = rpcData && typeof rpcData === 'object' ? rpcData : {};
                          _diamondsActuallyAwarded = result.success ? (Number(result.awarded) || 0) : 0;
                          if (!result.success) _diamondsAwardError = result.reason || 'capped';
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
                  leaderboard: {
                      success: leaderboardResult.failed < leaderboardResult.attempted,
                      periodsUpdated: leaderboardResult.attempted - leaderboardResult.failed,
                      periodsFailed: leaderboardResult.failed,
                  },
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

              // 3. Record leaderboard stats -- one atomic RPC per period.
              // Assume total failure until the RPC batch reports otherwise so a
              // thrown error cannot masquerade as leaderboard success below.
              let leaderboardResult = { attempted: 4, failed: 4 };
              try {
                  leaderboardResult = await upsertLeaderboard(getSupabase(), userId, {
                      answered: questionsAnswered,
                      correct: questionsCorrect,
                      bestStreak: streak,
                      gtowScore: null, // not carried by this endpoint's request body
                      evLoss: null,    // not carried by this endpoint's request body
                  });
              } catch (lbError) {
                  console.warn('Leaderboard upsert failed:', lbError.message);
              }

              // 4. Award diamonds to profile balance.
              // Phase 63: same fix as the existing-progress branch above.
              let _diamondsActuallyAwarded2 = 0;
              let _diamondsAwardError2 = null;
              if (diamondsEarned > 0) {
                  try {
                      // Award via award_diamonds_v2 (training_reward catalog key) — new-progress branch.
                      const { ok: rpcOk, data: rpcData, error: rpcErr } = await safeAward(getSupabase(), {
                          p_user_id: userId,
                          p_action_key: 'training_reward',
                          p_reference_id: `progress_${userId}_${gameId}_${level}_${new Date().toISOString().slice(0, 10)}`,
                          p_metadata: {
                              reward_diamonds: diamondsEarned,
                              game_id: gameId,
                              level,
                              _source: 'api/training/save-progress',
                          },
                      });
                      if (!rpcOk) {
                          console.warn('[SaveProgress] award_diamonds_v2 error (new-progress branch):', rpcErr);
                          _diamondsAwardError2 = rpcErr?.message || String(rpcErr);
                      } else {
                          const result = rpcData && typeof rpcData === 'object' ? rpcData : {};
                          _diamondsActuallyAwarded2 = result.success ? (Number(result.awarded) || 0) : 0;
                          if (!result.success) _diamondsAwardError2 = result.reason || 'capped';
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
                  leaderboard: {
                      success: leaderboardResult.failed < leaderboardResult.attempted,
                      periodsUpdated: leaderboardResult.attempted - leaderboardResult.failed,
                      periodsFailed: leaderboardResult.failed,
                  },
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
