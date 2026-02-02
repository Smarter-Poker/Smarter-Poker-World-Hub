/**
 * 🎯 TRAINING DAILY CHALLENGE CRON
 * ═══════════════════════════════════════════════════════════════════════════
 * Runs daily at 06:00 UTC to generate new training challenges
 * Selects random games from each category for the daily challenge
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
    // Verify cron secret for production
    if (process.env.NODE_ENV === 'production') {
        const authHeader = req.headers.authorization;
        if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
    }

    if (!supabaseUrl || !supabaseKey) {
        return res.status(500).json({ error: 'Missing Supabase configuration' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        console.log('[TrainingDailyChallenge] Starting daily challenge generation...');

        // Get today's date
        const today = new Date();
        const challengeDate = today.toISOString().split('T')[0];

        // Check if today's challenge already exists
        const { data: existing } = await supabase
            .from('training_daily_challenges')
            .select('id')
            .eq('challenge_date', challengeDate)
            .maybeSingle();

        if (existing) {
            console.log('[TrainingDailyChallenge] Challenge already exists for today');
            return res.status(200).json({
                success: true,
                message: 'Challenge already exists for today',
                date: challengeDate
            });
        }

        // Select a random game from one of the harder categories
        // Rotate through categories based on day of week
        const categories = ['MTT', 'CASH', 'ADVANCED', 'SPINS', 'PSYCHOLOGY'];
        const dayOfWeek = today.getDay();
        const selectedCategory = categories[dayOfWeek % categories.length];

        // Game IDs by category (picking mid-to-hard games)
        const challengeGames = {
            MTT: ['mtt-004', 'mtt-010', 'mtt-013', 'mtt-015', 'mtt-021'],
            CASH: ['cash-005', 'cash-008', 'cash-012', 'cash-014', 'cash-021'],
            ADVANCED: ['adv-002', 'adv-005', 'adv-007', 'adv-014', 'adv-018'],
            SPINS: ['spins-002', 'spins-005', 'spins-007', 'spins-010'],
            PSYCHOLOGY: ['psy-003', 'psy-004', 'psy-007', 'psy-016', 'psy-020']
        };

        const categoryGames = challengeGames[selectedCategory] || challengeGames.MTT;
        const randomIndex = Math.floor(Math.random() * categoryGames.length);
        const selectedGameId = categoryGames[randomIndex];

        // Determine level (3-7 for daily challenges, medium-hard difficulty)
        const level = 3 + Math.floor(Math.random() * 5); // Levels 3-7

        // Insert the daily challenge
        const { data: challenge, error } = await supabase
            .from('training_daily_challenges')
            .insert({
                challenge_date: challengeDate,
                game_id: selectedGameId,
                level: level,
                required_accuracy: 80,
                bonus_xp_multiplier: 2.0,
                bonus_diamonds: 50
            })
            .select()
            .single();

        if (error) {
            console.error('[TrainingDailyChallenge] Error creating challenge:', error);
            return res.status(500).json({ error: 'Failed to create challenge', details: error.message });
        }

        console.log(`[TrainingDailyChallenge] Created challenge: ${selectedGameId} Level ${level}`);

        return res.status(200).json({
            success: true,
            message: 'Daily challenge created',
            challenge: {
                date: challengeDate,
                gameId: selectedGameId,
                level: level,
                category: selectedCategory
            }
        });

    } catch (err) {
        console.error('[TrainingDailyChallenge] Unexpected error:', err);
        return res.status(500).json({ error: 'Internal server error', details: err.message });
    }
}
