/**
 * 🏅 TRAINING ACHIEVEMENTS API
 * ═══════════════════════════════════════════════════════════════════════════
 * Get user achievements and check for new unlocks
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
    const supabase = createClient(supabaseUrl, supabaseKey);

    // GET: Fetch user achievements
    if (req.method === 'GET') {
        const { userId } = req.query;

        if (!userId) {
            return res.status(400).json({ error: 'userId required' });
        }

        try {
            // Get all achievement definitions
            const { data: definitions } = await supabase
                .from('training_achievement_definitions')
                .select('*')
                .order('category', { ascending: true });

            // Get user's unlocked achievements
            const { data: userAchievements } = await supabase
                .from('training_user_achievements')
                .select('achievement_id, unlocked_at, progress')
                .eq('user_id', userId);

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
            return res.status(500).json({ error: 'Failed to fetch achievements' });
        }
    }

    // POST: Check and unlock achievements
    if (req.method === 'POST') {
        const { userId, stats } = req.body;

        if (!userId || !stats) {
            return res.status(400).json({ error: 'userId and stats required' });
        }

        try {
            const newlyUnlocked = [];

            // Get all definitions
            const { data: definitions } = await supabase
                .from('training_achievement_definitions')
                .select('*');

            // Get already unlocked
            const { data: existing } = await supabase
                .from('training_user_achievements')
                .select('achievement_id')
                .eq('user_id', userId);

            const unlockedIds = new Set((existing || []).map(e => e.achievement_id));

            // Check each achievement
            for (const def of definitions || []) {
                if (unlockedIds.has(def.id)) continue;

                let shouldUnlock = false;
                let progress = 0;

                switch (def.category) {
                    case 'accuracy':
                        if (def.id === 'first_perfect' && stats.accuracy === 100) {
                            shouldUnlock = true;
                        } else if (def.id.includes('flawless')) {
                            progress = stats.perfectRounds || 0;
                            shouldUnlock = progress >= def.threshold;
                        }
                        break;

                    case 'streak':
                        progress = stats.currentStreak || 0;
                        shouldUnlock = progress >= def.threshold;
                        break;

                    case 'volume':
                        progress = stats.totalSessions || 0;
                        shouldUnlock = progress >= def.threshold;
                        break;

                    case 'mastery':
                        progress = stats.totalCorrect || 0;
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

                    // Award diamonds
                    if (def.diamond_reward > 0) {
                        await supabase.rpc('increment_diamonds', {
                            p_user_id: userId,
                            p_amount: def.diamond_reward
                        });
                    }

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
            return res.status(500).json({ error: 'Failed to check achievements' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
