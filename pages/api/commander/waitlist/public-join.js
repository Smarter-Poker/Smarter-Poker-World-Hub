/**
 * Public Waitlist Join API — POST /api/commander/waitlist/public-join
 * Allows authenticated players to add themselves to a venue waitlist via web.
 * Sets signup_method = 'web' automatically.
 * Does NOT require staff auth — only Supabase user auth.
 */
import { createClient } from '@supabase/supabase-js';
import { guardUser } from '../../../../src/lib/commander/auth';
import { captureException } from '../../../../src/lib/commander/errorMonitoring';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const AVERAGE_WAIT_PER_POSITION = 15;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    // Require logged-in user (not staff)
    const user = await guardUser(req, res);
    if (!user) return;

    try {
        const { venue_id, game_type, stakes, player_phone } = req.body;

        // Validation
        if (!venue_id || !game_type || !stakes) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'venue_id, game_type, and stakes are required' }
            });
        }

        // Verify venue exists and has Commander enabled
        const { data: venue, error: venueError } = await supabase
            .from('poker_venues')
            .select('id, commander_enabled, name')
            .eq('id', venue_id)
            .single();

        if (venueError || !venue) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Venue not found' }
            });
        }

        if (!venue.commander_enabled) {
            return res.status(400).json({
                success: false,
                error: { code: 'VENUE_NOT_COMMANDER', message: 'Venue is not using Commander' }
            });
        }

        // Check if player already on this waitlist
        const { data: existing } = await supabase
            .from('commander_waitlist')
            .select('id')
            .eq('venue_id', venue_id)
            .eq('game_type', game_type)
            .eq('stakes', stakes)
            .eq('player_id', user.id)
            .eq('status', 'waiting')
            .maybeSingle();

        if (existing) {
            return res.status(400).json({
                success: false,
                error: { code: 'ALREADY_ON_WAITLIST', message: 'You are already on this waitlist' }
            });
        }

        // Check self-exclusions
        const { data: exclusion } = await supabase
            .from('commander_self_exclusions')
            .select('id, exclusion_type, expires_at')
            .eq('player_id', user.id)
            .or(`venue_id.eq.${venue_id},scope.eq.network`)
            .is('lifted_at', null)
            .or('expires_at.is.null,expires_at.gt.now()')
            .limit(1)
            .maybeSingle();

        if (exclusion) {
            return res.status(403).json({
                success: false,
                error: {
                    code: 'SELF_EXCLUDED',
                    message: 'You have an active self-exclusion and cannot join at this time.',
                    exclusion_type: exclusion.exclusion_type,
                    expires_at: exclusion.expires_at
                }
            });
        }

        // Get player's display name from profile
        const { data: profile } = await supabase
            .from('profiles')
            .select('display_name, full_name, phone')
            .eq('id', user.id)
            .single();

        const playerName = profile?.display_name || profile?.full_name || user.email?.split('@')[0] || 'Web Player';
        const playerPhone = player_phone || profile?.phone || null;

        // Get next position
        const { data: positionResult, error: positionError } = await supabase
            .rpc('get_next_waitlist_position', {
                p_venue_id: venue_id,
                p_game_type: game_type,
                p_stakes: stakes
            });

        const position = positionError ? 1 : positionResult;
        const estimated_wait_minutes = position * AVERAGE_WAIT_PER_POSITION;

        // Find matching active game
        const { data: activeGame } = await supabase
            .from('commander_games')
            .select('id')
            .eq('venue_id', venue_id)
            .eq('game_type', game_type)
            .eq('stakes', stakes)
            .in('status', ['waiting', 'running'])
            .single();

        // Insert waitlist entry
        const { data: entry, error: insertError } = await supabase
            .from('commander_waitlist')
            .insert({
                venue_id,
                game_id: activeGame?.id || null,
                game_type,
                stakes,
                player_id: user.id,
                player_name: playerName,
                player_phone: playerPhone,
                position,
                signup_method: 'web',
                status: 'waiting',
                estimated_wait_minutes
            })
            .select()
            .single();

        if (insertError) {
            console.error('Public waitlist join insert error:', insertError);
            return res.status(500).json({
                success: false,
                error: { code: 'DATABASE_ERROR', message: 'Failed to join waitlist' }
            });
        }

        return res.status(201).json({
            success: true,
            data: {
                entry,
                position,
                estimated_wait: estimated_wait_minutes,
                check_in_deadline: new Date(Date.now() + 60 * 60 * 1000).toISOString()
            }
        });
    } catch (error) {
        captureException(error, { action: 'waitlist_public_join', endpoint: '/api/commander/waitlist/public-join' });
        return res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
        });
    }
}
