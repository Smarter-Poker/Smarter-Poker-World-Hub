/**
 * Captain Waitlist Join API - POST /api/captain/waitlist/join
 * Join a venue waitlist
 * Reference: API_REFERENCE.md - Waitlist section
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Average wait time per position (minutes) - simple initial estimate
const AVERAGE_WAIT_PER_POSITION = 15;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
    });
  }

  try {
    const {
      venue_id,
      game_type,
      stakes,
      player_id,
      player_name,
      player_phone,
      signup_method = 'app'
    } = req.body;

    // Validation
    if (!venue_id || !game_type || !stakes) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'venue_id, game_type, and stakes are required'
        }
      });
    }

    // For walk-ins without player_id, require name
    if (!player_id && !player_name) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Either player_id or player_name is required'
        }
      });
    }

    // Verify venue exists and has Captain enabled
    const { data: venue, error: venueError } = await supabase
      .from('poker_venues')
      .select('id, captain_enabled, name')
      .eq('id', venue_id)
      .single();

    if (venueError || !venue) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Venue not found' }
      });
    }

    if (!venue.captain_enabled) {
      return res.status(400).json({
        success: false,
        error: { code: 'VENUE_NOT_CAPTAIN', message: 'Venue is not using Captain' }
      });
    }

    // Check if player already on this waitlist (if player_id provided)
    if (player_id) {
      const { data: existing } = await supabase
        .from('captain_waitlist')
        .select('id')
        .eq('venue_id', venue_id)
        .eq('game_type', game_type)
        .eq('stakes', stakes)
        .eq('player_id', player_id)
        .eq('status', 'waiting')
        .single();

      if (existing) {
        return res.status(400).json({
          success: false,
          error: { code: 'ALREADY_ON_WAITLIST', message: 'Player already on this waitlist' }
        });
      }

      // RESPONSIBLE GAMING: Check for self-exclusions
      const { data: exclusion } = await supabase
        .from('captain_self_exclusions')
        .select('id, exclusion_type, expires_at')
        .eq('player_id', player_id)
        .or(`venue_id.eq.${venue_id},scope.eq.network`)
        .is('lifted_at', null)
        .or('expires_at.is.null,expires_at.gt.now()')
        .limit(1)
        .single();

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

      // RESPONSIBLE GAMING: Check spending limits
      const { data: limits } = await supabase
        .from('captain_spending_limits')
        .select('daily_limit, weekly_limit, monthly_limit, session_duration_limit')
        .eq('player_id', player_id)
        .single();

      if (limits) {
        // Check if player has exceeded daily sessions (simple check)
        const today = new Date().toISOString().split('T')[0];
        const { count: todaySessions } = await supabase
          .from('captain_player_sessions')
          .select('id', { count: 'exact' })
          .eq('player_id', player_id)
          .gte('check_in_at', today);

        // If player has more than 3 sessions today and has limits set, warn them
        if (todaySessions >= 3 && limits.daily_limit) {
          // Log responsible gaming check
          console.log(`Responsible gaming: Player ${player_id} has ${todaySessions} sessions today`);
        }
      }
    }

    // Get next position using the database function
    const { data: positionResult, error: positionError } = await supabase
      .rpc('get_next_waitlist_position', {
        p_venue_id: venue_id,
        p_game_type: game_type,
        p_stakes: stakes
      });

    const position = positionError ? 1 : positionResult;

    // Calculate estimated wait time
    const estimated_wait_minutes = position * AVERAGE_WAIT_PER_POSITION;

    // Find matching game_id if there's an active game
    const { data: activeGame } = await supabase
      .from('captain_games')
      .select('id')
      .eq('venue_id', venue_id)
      .eq('game_type', game_type)
      .eq('stakes', stakes)
      .in('status', ['waiting', 'running'])
      .single();

    // Create waitlist entry
    const { data: entry, error: insertError } = await supabase
      .from('captain_waitlist')
      .insert({
        venue_id,
        game_id: activeGame?.id || null,
        game_type,
        stakes,
        player_id: player_id || null,
        player_name: player_name || null,
        player_phone: player_phone || null,
        position,
        signup_method,
        status: 'waiting',
        estimated_wait_minutes
      })
      .select()
      .single();

    if (insertError) {
      console.error('Captain waitlist insert error:', insertError);
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to join waitlist' }
      });
    }

    // Award XP for joining waitlist (5 XP)
    if (player_id) {
      const XP_FOR_WAITLIST_JOIN = 5;

      // Get or create player session for XP tracking
      const { data: existingSession } = await supabase
        .from('captain_player_sessions')
        .select('id, xp_earned')
        .eq('venue_id', venue_id)
        .eq('player_id', player_id)
        .is('check_out_at', null)
        .single();

      if (existingSession) {
        await supabase
          .from('captain_player_sessions')
          .update({
            xp_earned: (existingSession.xp_earned || 0) + XP_FOR_WAITLIST_JOIN
          })
          .eq('id', existingSession.id);
      } else {
        await supabase
          .from('captain_player_sessions')
          .insert({
            venue_id,
            player_id,
            check_in_at: new Date().toISOString(),
            xp_earned: XP_FOR_WAITLIST_JOIN,
            games_played: []
          });
      }
    }

    return res.status(201).json({
      success: true,
      data: {
        entry,
        position,
        estimated_wait: estimated_wait_minutes
      }
    });
  } catch (error) {
    console.error('Captain waitlist API error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}
