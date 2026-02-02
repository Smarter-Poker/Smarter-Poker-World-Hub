/**
 * POST /api/arcade/complete
 * Complete an arcade game session and calculate winnings
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

    const { sessionId, score, correctCount, timeSpentMs, multiplier = 1 } = req.body;

    if (!sessionId) {
        return res.status(400).json({ error: 'Missing sessionId' });
    }

    try {
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

        return res.status(200).json(data);
    } catch (err) {
        console.error('API error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
