/**
 * POST /api/club-arena/results
 * Webhook endpoint for receiving game results from club.smarter.poker
 *
 * Authentication: API key in X-API-Key header
 *
 * Body: {
 *   player_id: UUID (internal) or external_player_id: string,
 *   club_id: string,
 *   club_name?: string,
 *   game_type: 'tournament' | 'cash' | 'sit-n-go' | 'spin-n-go',
 *   game_id?: string,
 *   placement: number,
 *   total_players: number,
 *   buy_in: number,
 *   winnings: number,
 *   hands_played?: number,
 *   duration_minutes?: number,
 *   game_data?: object
 * }
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Hash API key for lookup
function hashApiKey(key) {
    return crypto.createHash('sha256').update(key).digest('hex');
}

// Validate API key
async function validateApiKey(apiKey) {
    if (!apiKey) return null;

    const keyHash = hashApiKey(apiKey);

    const { data, error } = await supabaseAdmin
        .from('arena_api_keys')
        .select('*')
        .eq('key_hash', keyHash)
        .eq('is_active', true)
        .single();

    if (error || !data) return null;

    // Check expiration
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
        return null;
    }

    // Update last used
    await supabaseAdmin
        .from('arena_api_keys')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', data.id);

    return data;
}

// Resolve external player ID to internal player ID
async function resolvePlayerId(playerId, externalPlayerId) {
    // If we have internal player ID, verify it exists
    if (playerId) {
        const { data } = await supabaseAdmin
            .from('profiles')
            .select('id')
            .eq('id', playerId)
            .single();

        if (data) return data.id;
    }

    // Try to find by external ID (could be stored in profile metadata)
    if (externalPlayerId) {
        const { data } = await supabaseAdmin
            .from('profiles')
            .select('id')
            .eq('external_club_id', externalPlayerId)
            .single();

        if (data) return data.id;
    }

    return null;
}

export default async function handler(req, res) {
    // Only accept POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Validate API key
        const apiKey = req.headers['x-api-key'];
        const keyData = await validateApiKey(apiKey);

        if (!keyData) {
            return res.status(401).json({
                error: 'Invalid or missing API key',
                hint: 'Provide a valid API key in the X-API-Key header'
            });
        }

        // Check permissions
        if (!keyData.permissions.includes('submit_results')) {
            return res.status(403).json({ error: 'API key lacks submit_results permission' });
        }

        // Parse and validate body
        const {
            player_id,
            external_player_id,
            club_id,
            club_name,
            game_type,
            game_id,
            placement,
            total_players,
            buy_in,
            winnings,
            hands_played = 0,
            duration_minutes = 0,
            game_data = {}
        } = req.body;

        // Validate required fields
        if (!club_id) {
            return res.status(400).json({ error: 'club_id is required' });
        }
        if (!game_type || !['tournament', 'cash', 'sit-n-go', 'spin-n-go'].includes(game_type)) {
            return res.status(400).json({
                error: 'game_type must be one of: tournament, cash, sit-n-go, spin-n-go'
            });
        }
        if (typeof placement !== 'number' || placement < 1) {
            return res.status(400).json({ error: 'placement must be a positive number' });
        }
        if (typeof total_players !== 'number' || total_players < 1) {
            return res.status(400).json({ error: 'total_players must be a positive number' });
        }
        if (typeof buy_in !== 'number' || buy_in < 0) {
            return res.status(400).json({ error: 'buy_in must be a non-negative number' });
        }
        if (typeof winnings !== 'number' || winnings < 0) {
            return res.status(400).json({ error: 'winnings must be a non-negative number' });
        }

        // Resolve player ID
        const resolvedPlayerId = await resolvePlayerId(player_id, external_player_id);

        if (!resolvedPlayerId && !external_player_id) {
            return res.status(400).json({
                error: 'Either player_id or external_player_id is required',
                hint: 'Provide a valid internal player_id or an external_player_id for unlinked players'
            });
        }

        // If we have a resolved player, use the RPC function
        if (resolvedPlayerId) {
            const { data, error } = await supabaseAdmin.rpc('record_club_arena_result', {
                p_player_id: resolvedPlayerId,
                p_club_id: club_id,
                p_club_name: club_name || club_id,
                p_game_type: game_type,
                p_game_id: game_id || null,
                p_placement: placement,
                p_total_players: total_players,
                p_buy_in: buy_in,
                p_winnings: winnings,
                p_hands_played: hands_played,
                p_duration_minutes: duration_minutes,
                p_game_data: game_data
            });

            if (error) {
                console.error('Error recording result:', error);
                return res.status(500).json({ error: error.message });
            }

            return res.status(200).json({
                success: true,
                ...data,
                player_linked: true
            });
        }

        // If no resolved player, store with external_player_id only
        const { data, error } = await supabaseAdmin
            .from('club_arena_results')
            .insert({
                external_player_id,
                club_id,
                club_name: club_name || club_id,
                game_type,
                game_id,
                placement,
                total_players,
                buy_in,
                winnings,
                hands_played,
                duration_minutes,
                game_data,
                verified: true
            })
            .select('id')
            .single();

        if (error) {
            console.error('Error storing unlinked result:', error);
            return res.status(500).json({ error: error.message });
        }

        return res.status(200).json({
            success: true,
            result_id: data.id,
            net_profit: winnings - buy_in,
            poy_points_earned: 0,
            player_linked: false,
            hint: 'Result stored but player not linked. POY points will be awarded when player links their account.'
        });

    } catch (err) {
        console.error('Webhook error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
