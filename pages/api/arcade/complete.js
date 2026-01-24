/**
 * POST /api/arcade/complete
 * Complete an arcade game session and calculate winnings
 * Also awards POY (Player of the Year) points for performance
 */

import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// POY point configuration for arcade
const POY_ARCADE_POINTS = {
    game_win: 10,
    perfect_score: 50,
    win_streak_5: 100,
    win_streak_10: 250,
};

// Award POY points based on arcade performance
async function awardArcadePOYPoints(userId, sessionId, result) {
    if (!result.won) return 0;

    let totalPoints = 0;
    const reasons = [];
    const seasonYear = new Date().getFullYear();

    // Base points for winning
    totalPoints += POY_ARCADE_POINTS.game_win;
    reasons.push('Arcade win');

    // Perfect score bonus (100% accuracy)
    if (result.accuracy >= 1.0) {
        totalPoints += POY_ARCADE_POINTS.perfect_score;
        reasons.push('Perfect score');
    }

    // Streak milestone bonuses
    if (result.streak === 5) {
        totalPoints += POY_ARCADE_POINTS.win_streak_5;
        reasons.push('5-game streak');
    } else if (result.streak === 10) {
        totalPoints += POY_ARCADE_POINTS.win_streak_10;
        reasons.push('10-game streak');
    }

    if (totalPoints > 0) {
        try {
            // Use RPC function if available
            await supabaseAdmin.rpc('update_poy_from_arcade', {
                p_player_id: userId,
                p_points: totalPoints,
                p_reason: reasons.join(', '),
                p_source_id: sessionId
            });
        } catch (rpcError) {
            // Fallback: direct insert/update
            console.log('POY RPC not available, using direct update');

            // Get current points
            const { data: existing } = await supabaseAdmin
                .from('poy_rankings')
                .select('diamond_arcade_points')
                .eq('player_id', userId)
                .eq('season_year', seasonYear)
                .single();

            const currentPoints = existing?.diamond_arcade_points || 0;

            // Upsert rankings
            await supabaseAdmin
                .from('poy_rankings')
                .upsert({
                    player_id: userId,
                    season_year: seasonYear,
                    diamond_arcade_points: currentPoints + totalPoints
                }, {
                    onConflict: 'player_id,season_year'
                });

            // Record history
            await supabaseAdmin
                .from('poy_point_history')
                .insert({
                    player_id: userId,
                    season_year: seasonYear,
                    points_earned: totalPoints,
                    point_source: 'diamond_arcade',
                    source_id: sessionId,
                    description: reasons.join(', ')
                });
        }
    }

    return totalPoints;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { sessionId, score, correctCount, timeSpentMs, multiplier = 1 } = req.body;

    if (!sessionId) {
        return res.status(400).json({ error: 'Missing sessionId' });
    }

    try {
        // Get session info for POY tracking
        const { data: session } = await supabaseAdmin
            .from('arcade_sessions')
            .select('user_id')
            .eq('id', sessionId)
            .single();

        // Complete the game
        const { data, error } = await supabaseAdmin.rpc('complete_arcade_game', {
            p_session_id: sessionId,
            p_score: score || 0,
            p_correct_count: correctCount || 0,
            p_time_spent_ms: timeSpentMs || 0,
            p_multiplier: multiplier
        });

        if (error) {
            console.error('Complete game error:', error);
            return res.status(500).json({ error: error.message });
        }

        // Award POY points if game was won
        let poyPointsAwarded = 0;
        if (data.won && session?.user_id) {
            try {
                poyPointsAwarded = await awardArcadePOYPoints(
                    session.user_id,
                    sessionId,
                    data
                );
            } catch (poyError) {
                console.error('POY points error (non-blocking):', poyError);
            }
        }

        return res.status(200).json({
            ...data,
            poy_points_earned: poyPointsAwarded
        });
    } catch (err) {
        console.error('API error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
