/**
 * GET /api/games/[slug]
 * Returns game data from game_registry table
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
    const { slug } = req.query;

    if (!slug) {
        return res.status(400).json({ error: 'Missing slug parameter' });
    }

    try {
        // Try to find game by slug
        const { data: game, error } = await supabase
            .from('game_registry')
            .select('*')
            .eq('slug', slug)
            .single();

        if (error || !game) {
            // Try by ID as fallback
            const { data: gameById } = await supabase
                .from('game_registry')
                .select('*')
                .eq('id', slug)
                .single();

            if (!gameById) {
                return res.status(404).json({ error: 'Game not found', slug });
            }

            return res.status(200).json(gameById);
        }

        return res.status(200).json(game);

    } catch (err) {
        console.error('Error fetching game:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
