import { getServerUserWithFallback } from '../../src/lib/serverAuth';
/**
 * TRAINING ACHIEVEMENTS API
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Get user achievements and check for new unlocks
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { notifyAchievementUnlock } from '../../../src/utils/trainingNotifications';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { withTiming } from '../../../src/utils/trainingApiUtils';
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
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
          if (!applyRateLimit(req, res, LIMITS.write)) return;
      }

      const supabase = getSupabase();

      // ●● Auth: verify JWT identity ●●
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });
      const userId = user.id; // From JWT, not request

      // GET: Fetch user achievements
      if (req.method === 'GET') {
          res.setHeader('Cache-Control', 'private, max-age=60, stale-while-revalidate=120');

          try {
              // Parallel fetch: definitions and user achievements are independent
              const [{ data: definitions }, { data: userAchievements }] = await Promise.all([
                  supabase
                      .from('training_achievement_definitions')
                      .select('*')
                      .order('category', { ascending: true })
                      .limit(100),
                  supabase
                      .from('training_user_achievements')
                      .select('achievement_id, unlocked_at, progress')
                      .eq('user_id', userId)
                      .limit(100)
              ]);

              const unlockedMap = new Map(
                  (userAchievements || []).map(a => [a.achievement_id, a])
              );

              // Combine into response
              const achievements = (definitions || []).map(def => ({
                  ...def,
                  unlocked: unlockedMap.has(def.id),
                  unlockedAt: unlockedMap.get(def.id)?.unlocked_at,
                  progress: unlockedMap.get(def.id)?.progress || 0
              }));

              // Group by category
              const byCategory = achievements.reduce((acc, ach) => {
                  if (!acc[ach.category]) acc[ach.category] = [];
                  acc[ach.category].push(ach);
                  return acc;
              }, {});

              return res.status(200).json({
                  success: true,
                  achievements,
                  byCategory,
                  totalUnlocked: userAchievements?.length || 0,
                  totalAchievements: definitions?.length || 0
              });

          } catch (error) {
              console.warn('[Achievements] Error:', error.message);
              return res.status(500).json({ success: false, error: 'Failed to fetch achievements' });
          }
      }

      // POST: Check and unlock achievements
      if (req.method === 'POST') {
          const bodySize = JSON.stringify(req.body || {}).length;
          if (bodySize > 10240) return res.status(413).json({ success: false, error: 'Request body too large' });
          const { stats } = req.body;
          // userId is from JWT (set at top of handler)

          try {
              const newlyUnlocked = [];

              // Get cumulative stats from database
              const { data: leaderboardData } = await supabase
                  .from('training_leaderboard')
                  .select('sessions_completed, questions_correct, accuracy, perfect_rounds, gtow_score_avg')
                  .eq('user_id', userId)
                  .eq('period_type', 'alltime')
                  .maybeSingle();

              const { data: streakData } = await supabase
                  .from('training_streaks')
                  .select('current_streak, longest_streak')
                  .eq('user_id', userId)
                  .maybeSingle();

              // Merge client stats with cumulative DB stats
              const cumulativeStats = {
                  accuracy: stats?.accuracy || 0,
                  currentStreak: streakData?.current_streak || 0,
                  longestStreak: streakData?.longest_streak || 0,
                  totalSessions: leaderboardData?.sessions_completed || 0,
                  totalCorrect: leaderboardData?.questions_correct || 0,
                  // 2026-07-19: total_xp column removed (XP retired) — mastery
                  // progress now proxies cumulative correct answers
                  totalXp: leaderboardData?.questions_correct || 0,
                  // Perfect rounds from leaderboard (cumulative)
                  perfectRounds: leaderboardData?.perfect_rounds || 0
              };

              // Parallel fetch: definitions and existing unlocks are independent
              const [{ data: definitions }, { data: existing }] = await Promise.all([
                  supabase
                      .from('training_achievement_definitions')
                      .select('id, category, threshold, diamond_reward, name, icon'),
                  supabase
                      .from('training_user_achievements')
                      .select('achievement_id')
                      .eq('user_id', userId)
                      .limit(100)
              ]);

              const unlockedIds = new Set((existing || []).map(e => e.achievement_id));

              // Check each achievement
              for (const def of definitions || []) {
                  if (unlockedIds.has(def.id)) continue;

                  let shouldUnlock = false;
                  let progress = 0;

                  switch (def.category) {
                      case 'accuracy':
                          if (def.id === 'first_perfect' && cumulativeStats.accuracy === 100) {
                              shouldUnlock = true;
                          } else if (def.id.includes('flawless')) {
                              progress = cumulativeStats.perfectRounds || 0;
                              shouldUnlock = progress >= def.threshold;
                          }
                          break;

                      case 'streak':
                          progress = cumulativeStats.currentStreak || 0;
                          shouldUnlock = progress >= def.threshold;
                          break;

                      case 'volume':
                          progress = cumulativeStats.totalSessions || 0;
                          shouldUnlock = progress >= def.threshold;
                          break;

                      case 'mastery':
                          progress = cumulativeStats.totalXp || 0;
                          shouldUnlock = progress >= def.threshold;
                          break;
                  }

                  if (shouldUnlock) {
                      const { error: err_training_user_achievements_lpsrq } = await supabase
                        .from('training_user_achievements')
                        .upsert({
                              user_id: userId,
                              achievement_id: def.id,
                              progress: def.threshold
                          }, { onConflict: 'user_id,achievement_id', ignoreDuplicates: true });
                      if (err_training_user_achievements_lpsrq) console.warn('[Supabase] Silent mutation failed in training_user_achievements:', err_training_user_achievements_lpsrq.message);

                      // Award diamonds via logging RPC
                      // Note: Supabase RPC returns {data, error} and does NOT throw, so the
                      // previous try/catch never caught RPC failures. A failed credit
                      // would mark the achievement as unlocked (upsert above) without
                      // paying the diamond reward — and the upsert's unique constraint
                      // would prevent any retry.
                      let diamondCreditFailed = false;
                      if (def.diamond_reward > 0) {
                          const { error: rpcErr } = await supabase.rpc('add_diamonds_to_balance', {
                              p_user_id: userId,
                              p_amount: def.diamond_reward,
                              p_type: 'achievement',
                              p_description: `${def.name} achievement — ${def.diamond_reward}diamonds`,
                              p_reference_id: def.id
                          });

                          if (rpcErr) {
                              // Roll back the achievement upsert so the user can retry.
                              try {
                                  const { error: err_training_user_achievements_2blu4 } = await supabase
                                    .from('training_user_achievements')
                                    .delete()
                                      .eq('user_id', userId)
                                      .eq('achievement_id', def.id);
                                  if (err_training_user_achievements_2blu4) console.warn('[Supabase] Silent mutation failed in training_user_achievements:', err_training_user_achievements_2blu4.message);
                              } catch (rbErr) {
                                  console.warn('[Achievements] Rollback delete failed:', rbErr?.message || rbErr);
                              }
                              console.warn('[Achievements] Diamond RPC failed (rolled back so user can retry):', rpcErr);
                              diamondCreditFailed = true;
                          }
                      }

                      // Skip notification + newlyUnlocked if credit failed and rolled back
                      if (diamondCreditFailed) continue;

                      // Send push notification
                      await notifyAchievementUnlock(userId, {
                          id: def.id,
                          name: def.name,
                          icon: def.icon,
                          diamondReward: def.diamond_reward
                      }).catch(e => console.warn('[Achievements] Push failed:', e.message));

                      newlyUnlocked.push({
                          ...def,
                          justUnlocked: true
                      });
                  }
              }

              return res.status(200).json({
                  success: true,
                  newlyUnlocked,
                  diamondsAwarded: newlyUnlocked.reduce((sum, a) => sum + a.diamond_reward, 0)
              });

          } catch (error) {
              console.warn('[Achievements] Unlock error:', error.message);
              return res.status(500).json({ success: false, error: 'Failed to check achievements' });
          }
      }

      return res.status(405).json({ success: false, error: 'Method not allowed' });

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
