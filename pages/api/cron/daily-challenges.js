/**
 * Daily Challenges Generator
 * ═══════════════════════════════════════════════════════════════════════════
 * Generates daily training challenges for all users
 * 
 * Cron: Runs daily at midnight UTC
 * 
 * Creates a new challenge entry with:
 * - Random game from the 100 game library
 * - Level scaling (1-10 based on day of month)
 * - Accuracy requirements and diamond rewards
 */

import { createClient } from '@supabase/supabase-js';

const TRAINING_GAMES = [
    'raise-first-in',
    '3bet-defense',
    'board-texture-analysis',
    'cbet-strategy',
    'pot-odds-math',
    'position-awareness',
    'range-construction',
    'bluff-catching',
    'value-betting',
    'tournament-icm'
];

export const config = {
    maxDuration: 30
};

export default async function handler(req, res) {
    // Verify cron secret
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    try {
        const today = new Date();
        const challengeDate = today.toISOString().split('T')[0];

        // Check if challenge already exists for today
        const { data: existing } = await supabase
            .from('training_daily_challenges')
            .select('id')
            .eq('challenge_date', challengeDate)
            .single();

        if (existing) {
            return res.status(200).json({
                message: 'Daily challenge already exists for today',
                challengeDate
            });
        }

        // Generate today's challenge
        const dayOfMonth = today.getDate();
        const dayOfWeek = today.getDay();

        // Rotate through games based on day of year
        const dayOfYear = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
        const gameIndex = dayOfYear % TRAINING_GAMES.length;
        const gameId = TRAINING_GAMES[gameIndex];

        // Scale level based on day of month (creates variety)
        const level = Math.min(((dayOfMonth % 10) || 10), 10);

        // Weekend challenges are harder but more rewarding
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const requiredAccuracy = isWeekend ? 90 : 85;
        const bonusDiamonds = isWeekend ? 100 : 50;

        // Insert the daily challenge
        const { data: challenge, error } = await supabase
            .from('training_daily_challenges')
            .insert({
                challenge_date: challengeDate,
                game_id: gameId,
                level: level,
                required_accuracy: requiredAccuracy,
                bonus_xp_multiplier: isWeekend ? 3.0 : 2.0,
                bonus_diamonds: bonusDiamonds
            })
            .select()
            .single();

        if (error) {
            console.error('Error creating daily challenge:', error);
            return res.status(500).json({ error: error.message });
        }

        console.log(`✅ Created daily challenge for ${challengeDate}:`, challenge);

        return res.status(200).json({
            success: true,
            challenge: {
                date: challengeDate,
                game: gameId,
                level,
                requiredAccuracy,
                bonusDiamonds
            }
        });

    } catch (error) {
        console.error('Daily challenges cron error:', error);
        return res.status(500).json({ error: error.message });
    }
}
