/**
 * 🔥 TRAINING STREAK API
 * ═══════════════════════════════════════════════════════════════════════════
 * Track daily training streaks and award milestone rewards
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Streak milestone rewards
const STREAK_MILESTONES = [
    { days: 3, diamonds: 25, name: '3-Day Streak' },
    { days: 7, diamonds: 75, name: 'Week Warrior' },
    { days: 14, diamonds: 150, name: 'Two Week Champion' },
    { days: 30, diamonds: 400, name: 'Monthly Master' },
    { days: 60, diamonds: 800, name: 'Double Month Legend' },
    { days: 100, diamonds: 2000, name: 'Century Grinder' },
    { days: 365, diamonds: 10000, name: 'Year of Dedication' },
];

export default async function handler(req, res) {
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── Auth: verify JWT identity ──
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Auth required' });
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });
    const userId = user.id; // From JWT, not request

    // GET: Fetch user streak
    if (req.method === 'GET') {

        try {
            const { data: streak } = await supabase
                .from('training_streaks')
                .select('*')
                .eq('user_id', userId)
                .single();

            if (!streak) {
                return res.status(200).json({
                    success: true,
                    streak: {
                        currentStreak: 0,
                        longestStreak: 0,
                        lastTrainingDate: null,
                        nextMilestone: STREAK_MILESTONES[0]
                    }
                });
            }

            // Find next milestone
            const claimedDays = streak.milestones_claimed || [];
            const nextMilestone = STREAK_MILESTONES.find(m =>
                !claimedDays.includes(m.days) && m.days > streak.current_streak
            );

            // Find claimable milestones
            const claimable = STREAK_MILESTONES.filter(m =>
                !claimedDays.includes(m.days) && m.days <= streak.current_streak
            );

            return res.status(200).json({
                success: true,
                streak: {
                    currentStreak: streak.current_streak,
                    longestStreak: streak.longest_streak,
                    lastTrainingDate: streak.last_training_date,
                    streakStartDate: streak.streak_start_date,
                    nextMilestone,
                    claimableMilestones: claimable,
                    allMilestones: STREAK_MILESTONES.map(m => ({
                        ...m,
                        claimed: claimedDays.includes(m.days),
                        achieved: m.days <= streak.current_streak
                    }))
                }
            });

        } catch (error) {
            console.error('[Streak] Error:', error.message);
            return res.status(500).json({ error: 'Failed to fetch streak' });
        }
    }

    // POST: Record training activity (call after session)
    if (req.method === 'POST') {
        const { action } = req.body;
        // userId from JWT (set at top of handler)

        try {
            const today = new Date().toISOString().split('T')[0];

            // Get current streak
            const { data: existing } = await supabase
                .from('training_streaks')
                .select('*')
                .eq('user_id', userId)
                .single();

            if (!existing) {
                // Create new streak
                await supabase
                    .from('training_streaks')
                    .insert({
                        user_id: userId,
                        current_streak: 1,
                        longest_streak: 1,
                        last_training_date: today,
                        streak_start_date: today,
                        milestones_claimed: []
                    });

                return res.status(200).json({
                    success: true,
                    currentStreak: 1,
                    streakUpdated: true,
                    message: 'Streak started! 🔥'
                });
            }

            // Check if already trained today
            if (existing.last_training_date === today) {
                return res.status(200).json({
                    success: true,
                    currentStreak: existing.current_streak,
                    streakUpdated: false,
                    message: 'Already trained today'
                });
            }

            // Check if streak continues or breaks
            const lastDate = new Date(existing.last_training_date);
            const todayDate = new Date(today);
            const daysDiff = Math.floor((todayDate - lastDate) / (1000 * 60 * 60 * 24));

            let newStreak, message;
            if (daysDiff === 1) {
                // Streak continues
                newStreak = existing.current_streak + 1;
                message = `${newStreak} day streak! 🔥`;
            } else {
                // Streak broken
                newStreak = 1;
                message = 'New streak started! 🔥';
            }

            const newLongest = Math.max(existing.longest_streak, newStreak);

            await supabase
                .from('training_streaks')
                .update({
                    current_streak: newStreak,
                    longest_streak: newLongest,
                    last_training_date: today,
                    streak_start_date: daysDiff === 1 ? existing.streak_start_date : today,
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', userId);

            // Check for newly achieved milestones
            const newMilestones = STREAK_MILESTONES.filter(m =>
                m.days <= newStreak && !(existing.milestones_claimed || []).includes(m.days)
            );

            return res.status(200).json({
                success: true,
                currentStreak: newStreak,
                longestStreak: newLongest,
                streakUpdated: true,
                message,
                newMilestones
            });

        } catch (error) {
            console.error('[Streak] Update error:', error.message);
            return res.status(500).json({ error: 'Failed to update streak' });
        }
    }

    // PUT: Claim milestone reward
    if (req.method === 'PUT') {
        const { milestoneDays } = req.body;
        // userId from JWT (set at top of handler)

        if (!milestoneDays) {
            return res.status(400).json({ error: 'milestoneDays required' });
        }

        try {
            const milestone = STREAK_MILESTONES.find(m => m.days === milestoneDays);
            if (!milestone) {
                return res.status(400).json({ error: 'Invalid milestone' });
            }

            const { data: streak } = await supabase
                .from('training_streaks')
                .select('*')
                .eq('user_id', userId)
                .single();

            if (!streak || streak.current_streak < milestoneDays) {
                return res.status(400).json({ error: 'Milestone not achieved' });
            }

            if ((streak.milestones_claimed || []).includes(milestoneDays)) {
                return res.status(400).json({ error: 'Already claimed' });
            }

            // Claim it
            const newClaimed = [...(streak.milestones_claimed || []), milestoneDays];

            await supabase
                .from('training_streaks')
                .update({ milestones_claimed: newClaimed })
                .eq('user_id', userId);

            // Award diamonds via logging RPC
            await supabase.rpc('add_diamonds_to_balance', {
                p_user_id: userId,
                p_amount: milestone.diamonds,
                p_type: 'streak_reward',
                p_description: `${milestone.name} — ${milestone.diamonds}💎 reward`,
                p_reference_id: `streak_${userId}_${milestoneDays}`
            });

            return res.status(200).json({
                success: true,
                claimed: milestone,
                diamondsAwarded: milestone.diamonds
            });

        } catch (error) {
            console.error('[Streak] Claim error:', error.message);
            return res.status(500).json({ error: 'Failed to claim milestone' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
