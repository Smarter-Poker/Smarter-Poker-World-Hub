/**
 * 🏅 TRAINING ACHIEVEMENTS API
 * ═══════════════════════════════════════════════════════════════════════════
 * Get user achievements and check for new unlocks
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { notifyAchievementUnlock } from '../../../src/utils/trainingNotifications';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { getServerUser } from '../../../src/lib/serverAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── Auth: verify JWT identity ──
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });
    const userId = user.id; // From JWT, not request

    // GET: Fetch user achievements
    if (req.method === 'GET') {

        try {
            // Get all achievement definitions
            const { data: definitions } = await supabase
                .from('training_achievement_definitions')
                .select('*')
                .order('category', { ascending: true })
                .limit(100);

            // Get user's unlocked achievements
            const { data: userAchievements } = await supabase
                .from('training_user_achievements')
                .select('achievement_id, unlocked_at, progress')
                .eq('user_id', userId)
                .limit(100);

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
            console.error('[Achievements] Error:', error.message);
            return res.status(500).json({ success: false, error: 'Failed to fetch achievements' });
        }
    }

    // POST: Check and unlock achievements
    if (req.method === 'POST') {
        const { stats } = req.body;
        // userId is from JWT (set at top of handler)

        try {
            const newlyUnlocked = [];

            // Get cumulative stats from database
            const { data: leaderboardData } = await supabase
                .from('training_leaderboard')
                .select('sessions_completed, questions_correct, accuracy, perfect_rounds, total_xp')
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
                totalXp: leaderboardData?.total_xp || 0,
                // Perfect rounds from leaderboard (cumulative)
                perfectRounds: leaderboardData?.perfect_rounds || 0
            };


            // Get all definitions
            const { data: definitions } = await supabase
                .from('training_achievement_definitions')
                .select('*');

            // Get already unlocked
            const { data: existing } = await supabase
                .from('training_user_achievements')
                .select('achievement_id')
                .eq('user_id', userId)
                .limit(100);

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
                    await supabase
                        .from('training_user_achievements')
                        .insert({
                            user_id: userId,
                            achievement_id: def.id,
                            progress: def.threshold
                        });

                    // Award diamonds via logging RPC
                    if (def.diamond_reward > 0) {
                        await supabase.rpc('add_diamonds_to_balance', {
                            p_user_id: userId,
                            p_amount: def.diamond_reward,
                            p_type: 'achievement',
                            p_description: `${def.name} achievement — ${def.diamond_reward}💎`,
                            p_reference_id: def.id
                        });
                    }

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
            console.error('[Achievements] Unlock error:', error.message);
            return res.status(500).json({ success: false, error: 'Failed to check achievements' });
        }
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
}
