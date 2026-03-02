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
    // Require JWT auth for write operations
    if (req.method !== 'GET') {
        const _token = req.headers.authorization?.replace('Bearer ', '');
        if (!_token) return res.status(401).json({ error: 'Authentication required' });
        const { data: { user: _authUser }, error: _authErr } = await supabaseAdmin.auth.getUser(_token);
        if (_authErr || !_authUser) return res.status(401).json({ error: 'Invalid token' });
        if (req.body) req.body.userId = req.body.userId || _authUser.id;
    }
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
