/**
 * GET /api/club-arena/leaderboard
 * Get Club Arena leaderboard for a specific period
 *
 * Query params:
 *   period: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'alltime' (default: 'weekly')
 *   limit: number (default: 50)
 */

import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { period = 'weekly', limit = 50 } = req.query;

    // Validate period
    const validPeriods = ['daily', 'weekly', 'monthly', 'yearly', 'alltime'];
    if (!validPeriods.includes(period)) {
        return res.status(400).json({
            error: `Invalid period. Must be one of: ${validPeriods.join(', ')}`
        });
    }

    try {
        const { data, error } = await supabaseAdmin.rpc('get_club_arena_leaderboard', {
            p_period: period,
            p_limit: parseInt(limit)
        });

        if (error) {
            console.error('Leaderboard error:', error);
            return res.status(500).json({ error: error.message });
        }

        return res.status(200).json({
            period,
            leaderboard: data || [],
            updated_at: new Date().toISOString()
        });
    } catch (err) {
        console.error('API error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
