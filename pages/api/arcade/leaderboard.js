/**
 * GET /api/arcade/leaderboard
 * Get arcade leaderboard for a specific period
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

    const { period = 'daily', limit = 20 } = req.query;

    try {
        const { data, error } = await supabaseAdmin.rpc('get_arcade_leaderboard', {
            p_period: period,
            p_limit: parseInt(limit)
        });

        if (error) {
            console.error('Leaderboard error:', error);
            return res.status(500).json({ error: error.message });
        }

        return res.status(200).json(data || []);
    } catch (err) {
        console.error('API error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
