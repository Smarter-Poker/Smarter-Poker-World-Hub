/**
 * POST /api/arcade/start
 * Start a new arcade game session
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

    const { userId, gameId } = req.body;

    if (!userId || !gameId) {
        return res.status(400).json({ error: 'Missing userId or gameId' });
    }

    try {
        const { data, error } = await supabaseAdmin.rpc('start_arcade_game', {
            p_user_id: userId,
            p_game_id: gameId
        });

        if (error) {
            console.error('Start game error:', error);
            return res.status(500).json({ error: error.message });
        }

        return res.status(200).json(data);
    } catch (err) {
        console.error('API error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
