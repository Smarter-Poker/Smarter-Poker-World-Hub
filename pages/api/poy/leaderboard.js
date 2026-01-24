/**
 * GET /api/poy/leaderboard
 * Get Player of the Year leaderboard
 *
 * Query params:
 *   year: number (default: current year)
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

    const currentYear = new Date().getFullYear();
    const { year = currentYear, limit = 50 } = req.query;

    try {
        const { data, error } = await supabaseAdmin.rpc('get_poy_leaderboard', {
            p_season_year: parseInt(year),
            p_limit: parseInt(limit)
        });

        if (error) {
            console.error('POY leaderboard error:', error);
            return res.status(500).json({ error: error.message });
        }

        return res.status(200).json({
            season_year: parseInt(year),
            leaderboard: data || [],
            updated_at: new Date().toISOString()
        });
    } catch (err) {
        console.error('API error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
