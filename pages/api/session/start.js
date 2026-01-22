/**
 * 🎮 GOD MODE ENGINE — Session Start API
 * ═══════════════════════════════════════════════════════════════════════════
 * POST /api/session/start
 *
 * Initializes a new training session for a user and game.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { user_id, game_id, level = 1 } = req.body;

        if (!game_id) {
            return res.status(400).json({ error: 'Missing game_id' });
        }

        // Generate a session ID (use user_id if provided, otherwise anonymous)
        const sessionId = uuidv4();
        const effectiveUserId = user_id || `anon_${uuidv4()}`;

        // Get game info from registry
        let gameName = 'Training Game';
        let engineType = 'PIO';
        let gameConfig = {};

        const { data: game, error: gameError } = await supabase
            .from('game_registry')
            .select('*')
            .eq('slug', game_id)
            .single();

        if (game) {
            gameName = game.title || game.name || gameName;
            engineType = game.engine_type || engineType;
            gameConfig = game.config || {};
        }

        // Try to get or create user session record
        let currentLevel = level;
        let currentHp = 100;

        if (user_id) {
            // Check for existing session/progress
            const { data: existingSession } = await supabase
                .from('god_mode_user_session')
                .select('*')
                .eq('user_id', user_id)
                .eq('game_id', game_id)
                .single();

            if (existingSession) {
                currentLevel = Math.max(level, existingSession.current_level || 1);
                currentHp = existingSession.health_chips || 100;
            }

            // Create or update session record
            const { error: upsertError } = await supabase
                .from('god_mode_user_session')
                .upsert({
                    user_id: user_id,
                    game_id: game_id,
                    session_id: sessionId,
                    current_level: currentLevel,
                    health_chips: currentHp,
                    round_hand_count: 0,
                    round_correct_count: 0,
                    total_hands_played: existingSession?.total_hands_played || 0,
                    total_correct: existingSession?.total_correct || 0,
                    highest_level_unlocked: existingSession?.highest_level_unlocked || 1,
                    updated_at: new Date().toISOString(),
                }, {
                    onConflict: 'user_id,game_id'
                });

            if (upsertError) {
                console.warn('Failed to upsert session:', upsertError.message);
            }
        }

        // Return session data
        return res.status(200).json({
            session_id: sessionId,
            game_name: gameName,
            engine_type: engineType,
            current_level: currentLevel,
            current_hp: currentHp,
            config: gameConfig,
        });

    } catch (error) {
        console.error('Session start error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
