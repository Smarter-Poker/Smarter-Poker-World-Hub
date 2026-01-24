/**
 * POST /api/poy/award-points
 * Award POY points to a player (internal use / admin)
 *
 * Body: {
 *   player_id: UUID,
 *   points: number,
 *   source: 'diamond_arcade' | 'club_arena' | 'tournament' | 'achievement' | 'bonus',
 *   reason: string,
 *   source_id?: string
 * }
 */

import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // This endpoint should be protected - check for service key or admin
    const authHeader = req.headers.authorization;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // Simple auth check - in production, use proper admin auth
    if (!authHeader || !authHeader.includes(serviceKey?.slice(0, 20))) {
        // Allow requests from same server (internal calls)
        const isInternalCall = req.headers['x-internal-call'] === process.env.INTERNAL_SECRET;
        if (!isInternalCall) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
    }

    const {
        player_id,
        points,
        source,
        reason,
        source_id = null
    } = req.body;

    // Validate
    if (!player_id) {
        return res.status(400).json({ error: 'player_id is required' });
    }
    if (typeof points !== 'number' || points <= 0) {
        return res.status(400).json({ error: 'points must be a positive number' });
    }
    if (!source || !['diamond_arcade', 'club_arena', 'tournament', 'achievement', 'bonus'].includes(source)) {
        return res.status(400).json({
            error: 'source must be one of: diamond_arcade, club_arena, tournament, achievement, bonus'
        });
    }
    if (!reason) {
        return res.status(400).json({ error: 'reason is required' });
    }

    try {
        const seasonYear = new Date().getFullYear();

        // Determine which column to update based on source
        const columnMap = {
            'diamond_arcade': 'diamond_arcade_points',
            'club_arena': 'club_arena_points',
            'tournament': 'tournament_points',
            'achievement': 'achievement_points',
            'bonus': 'bonus_points'
        };
        const column = columnMap[source];

        // Update POY rankings
        const { error: rankError } = await supabaseAdmin
            .from('poy_rankings')
            .upsert({
                player_id,
                season_year: seasonYear,
                [column]: points
            }, {
                onConflict: 'player_id,season_year',
                ignoreDuplicates: false
            });

        if (rankError) {
            // If upsert failed, try update with increment
            const { data: existing } = await supabaseAdmin
                .from('poy_rankings')
                .select(column)
                .eq('player_id', player_id)
                .eq('season_year', seasonYear)
                .single();

            if (existing) {
                await supabaseAdmin
                    .from('poy_rankings')
                    .update({
                        [column]: (existing[column] || 0) + points,
                        updated_at: new Date().toISOString()
                    })
                    .eq('player_id', player_id)
                    .eq('season_year', seasonYear);
            } else {
                await supabaseAdmin
                    .from('poy_rankings')
                    .insert({
                        player_id,
                        season_year: seasonYear,
                        [column]: points
                    });
            }
        }

        // Record history
        const { error: historyError } = await supabaseAdmin
            .from('poy_point_history')
            .insert({
                player_id,
                season_year: seasonYear,
                points_earned: points,
                point_source: source,
                source_id,
                description: reason
            });

        if (historyError) {
            console.error('Error recording history:', historyError);
        }

        return res.status(200).json({
            success: true,
            player_id,
            points_awarded: points,
            source,
            reason
        });
    } catch (err) {
        console.error('Award points error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
