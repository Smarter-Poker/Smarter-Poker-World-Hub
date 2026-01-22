/**
 * GET /api/training/progress
 * Returns user's training progress for a game
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
    const { gameId, userId } = req.query;

    // Return empty progress if no user (not logged in)
    if (!userId) {
        return res.status(200).json({
            current_level: 1,
            highest_level_unlocked: 1,
            health_chips: 100,
            total_hands_played: 0,
            total_correct: 0,
            total_rounds_completed: 0
        });
    }

    try {
        // Get user session for this game
        const { data: session, error } = await supabase
            .from('god_mode_user_session')
            .select('*')
            .eq('user_id', userId)
            .eq('game_id', gameId)
            .single();

        if (error || !session) {
            // No session yet - return defaults
            return res.status(200).json({
                current_level: 1,
                highest_level_unlocked: 1,
                health_chips: 100,
                total_hands_played: 0,
                total_correct: 0,
                total_rounds_completed: 0
            });
        }

        return res.status(200).json(session);

    } catch (err) {
        console.error('Error fetching progress:', err);
        return res.status(200).json({
            current_level: 1,
            highest_level_unlocked: 1,
            health_chips: 100,
            total_hands_played: 0,
            total_correct: 0,
            total_rounds_completed: 0
        });
    }
}
