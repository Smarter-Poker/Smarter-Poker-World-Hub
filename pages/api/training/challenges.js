/**
 * 🎯 TRAINING CHALLENGES API
 * ═══════════════════════════════════════════════════════════════════════════
 * Weekly and monthly rotating challenges with rewards
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Get current period keys
function getPeriodKeys() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');

    // ISO week calculation
    const tempDate = new Date(now.valueOf());
    tempDate.setDate(tempDate.getDate() + 3 - ((now.getDay() + 6) % 7));
    const week1 = new Date(tempDate.getFullYear(), 0, 4);
    const weekNum = 1 + Math.round(((tempDate - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);

    return {
        weekly: `${year}-W${String(weekNum).padStart(2, '0')}`,
        monthly: `${year}-${month}`
    };
}

export default async function handler(req, res) {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const periods = getPeriodKeys();

    // GET: Fetch active challenges with user progress
    if (req.method === 'GET') {
        const { userId } = req.query;

        if (!userId) {
            return res.status(400).json({ error: 'userId required' });
        }

        try {
            // Get active challenge definitions
            const { data: definitions } = await supabase
                .from('training_challenge_definitions')
                .select('*')
                .eq('is_active', true)
                .order('challenge_type', { ascending: true });

            // Get user's progress for current periods
            const { data: userProgress } = await supabase
                .from('training_user_challenges')
                .select('*')
                .eq('user_id', userId)
                .in('period_key', [periods.weekly, periods.monthly]);

            const progressMap = new Map(
                (userProgress || []).map(p => [`${p.challenge_id}-${p.period_key}`, p])
            );

            // Combine definitions with progress
            const challenges = (definitions || []).map(def => {
                const periodKey = def.challenge_type === 'weekly' ? periods.weekly : periods.monthly;
                const progress = progressMap.get(`${def.id}-${periodKey}`);

                return {
                    ...def,
                    periodKey,
                    progress: progress?.progress || 0,
                    completed: progress?.completed || false,
                    claimed: progress?.claimed || false,
                    percentage: Math.min(100, Math.round(((progress?.progress || 0) / def.target_value) * 100))
                };
            });

            // Separate by type
            const weekly = challenges.filter(c => c.challenge_type === 'weekly');
            const monthly = challenges.filter(c => c.challenge_type === 'monthly');

            return res.status(200).json({
                success: true,
                periods,
                weekly,
                monthly,
                totalCompleted: challenges.filter(c => c.completed).length,
                totalClaimed: challenges.filter(c => c.claimed).length
            });

        } catch (error) {
            console.error('[Challenges] Error:', error.message);
            return res.status(500).json({ error: 'Failed to fetch challenges' });
        }
    }

    // POST: Update challenge progress after session
    if (req.method === 'POST') {
        const { userId, sessionData } = req.body;

        if (!userId) {
            return res.status(400).json({ error: 'userId required' });
        }

        try {
            const {
                accuracy = 0,
                category = 'general',
                isPerfect = false
            } = sessionData || {};

            // Get active challenges
            const { data: definitions } = await supabase
                .from('training_challenge_definitions')
                .select('*')
                .eq('is_active', true);

            const updatedChallenges = [];

            for (const def of definitions || []) {
                const periodKey = def.challenge_type === 'weekly' ? periods.weekly : periods.monthly;
                let incrementBy = 0;

                // Determine if this session contributes to the challenge
                switch (def.target_type) {
                    case 'sessions':
                        incrementBy = 1;
                        break;
                    case 'perfect_rounds':
                        if (isPerfect || accuracy === 100) incrementBy = 1;
                        break;
                    case 'category_sessions':
                        if (def.target_category && category.toLowerCase().includes(def.target_category.toLowerCase())) {
                            incrementBy = 1;
                        }
                        break;
                    // accuracy_avg and streak_days are calculated differently
                }

                if (incrementBy > 0) {
                    // Upsert progress
                    const { data: existing } = await supabase
                        .from('training_user_challenges')
                        .select('*')
                        .eq('user_id', userId)
                        .eq('challenge_id', def.id)
                        .eq('period_key', periodKey)
                        .single();

                    const newProgress = (existing?.progress || 0) + incrementBy;
                    const isNowComplete = newProgress >= def.target_value;

                    if (existing) {
                        await supabase
                            .from('training_user_challenges')
                            .update({
                                progress: newProgress,
                                completed: isNowComplete,
                                completed_at: isNowComplete && !existing.completed ? new Date().toISOString() : existing.completed_at
                            })
                            .eq('id', existing.id);
                    } else {
                        await supabase
                            .from('training_user_challenges')
                            .insert({
                                user_id: userId,
                                challenge_id: def.id,
                                period_key: periodKey,
                                progress: newProgress,
                                completed: isNowComplete,
                                completed_at: isNowComplete ? new Date().toISOString() : null
                            });
                    }

                    if (isNowComplete && !existing?.completed) {
                        updatedChallenges.push({
                            ...def,
                            justCompleted: true
                        });
                    }
                }
            }

            return res.status(200).json({
                success: true,
                updatedChallenges,
                newlyCompleted: updatedChallenges.filter(c => c.justCompleted)
            });

        } catch (error) {
            console.error('[Challenges] Update error:', error.message);
            return res.status(500).json({ error: 'Failed to update challenges' });
        }
    }

    // PUT: Claim completed challenge reward
    if (req.method === 'PUT') {
        const { userId, challengeId, periodKey } = req.body;

        if (!userId || !challengeId || !periodKey) {
            return res.status(400).json({ error: 'userId, challengeId, and periodKey required' });
        }

        try {
            // Get challenge progress
            const { data: progress } = await supabase
                .from('training_user_challenges')
                .select('*, training_challenge_definitions(*)')
                .eq('user_id', userId)
                .eq('challenge_id', challengeId)
                .eq('period_key', periodKey)
                .single();

            if (!progress) {
                return res.status(404).json({ error: 'Challenge progress not found' });
            }

            if (!progress.completed) {
                return res.status(400).json({ error: 'Challenge not completed yet' });
            }

            if (progress.claimed) {
                return res.status(400).json({ error: 'Already claimed' });
            }

            // Mark as claimed
            await supabase
                .from('training_user_challenges')
                .update({
                    claimed: true,
                    claimed_at: new Date().toISOString()
                })
                .eq('id', progress.id);

            // Award diamonds
            const reward = progress.training_challenge_definitions?.diamond_reward || 0;
            if (reward > 0) {
                await supabase.rpc('increment_diamonds', {
                    p_user_id: userId,
                    p_amount: reward
                });
            }

            return res.status(200).json({
                success: true,
                claimed: {
                    challengeId,
                    name: progress.training_challenge_definitions?.name,
                    diamondsAwarded: reward
                }
            });

        } catch (error) {
            console.error('[Challenges] Claim error:', error.message);
            return res.status(500).json({ error: 'Failed to claim challenge' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
