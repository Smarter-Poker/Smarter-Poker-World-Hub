/**
 * Commander Seat Player API - POST /api/commander/waitlist/:id/seat [Staff]
 * Seat a player from the waitlist
 * Reference: API_REFERENCE.md - Waitlist section
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
    });
  }

  const { id } = req.query;

  if (!id) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Waitlist entry ID required' }
    });
  }

  try {
    // Verify staff authentication
    const staffSession = req.headers['x-staff-session'];
    if (!staffSession) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_REQUIRED', message: 'Staff authentication required' }
      });
    }

    let sessionData;
    try {
      sessionData = JSON.parse(staffSession);
    } catch {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_SESSION', message: 'Invalid session format' }
      });
    }

    // Verify staff exists and is active
    const { data: staff, error: staffError } = await supabase
      .from('commander_staff')
      .select('id, venue_id, role, is_active')
      .eq('id', sessionData.id)
      .eq('is_active', true)
      .single();

    if (staffError || !staff) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_STAFF', message: 'Staff member not found or inactive' }
      });
    }

    const { game_id, seat_number, buyin_amount } = req.body;

    // Validation
    if (!game_id || !seat_number) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'game_id and seat_number are required'
        }
      });
    }

    // Verify entry exists and is waiting/called
    const { data: entry, error: fetchError } = await supabase
      .from('commander_waitlist')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !entry) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Waitlist entry not found' }
      });
    }

    if (!['waiting', 'called'].includes(entry.status)) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Entry is not eligible to be seated' }
      });
    }

    // Verify game exists and is running
    const { data: game, error: gameError } = await supabase
      .from('commander_games')
      .select('id, status, venue_id, current_players')
      .eq('id', game_id)
      .single();

    if (gameError || !game) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Game not found' }
      });
    }

    if (!['waiting', 'running'].includes(game.status)) {
      return res.status(400).json({
        success: false,
        error: { code: 'GAME_CLOSED', message: 'Game is not available for seating' }
      });
    }

    // Verify seat is available
    const { data: existingSeat, error: seatError } = await supabase
      .from('commander_seats')
      .select('id, status')
      .eq('game_id', game_id)
      .eq('seat_number', seat_number)
      .single();

    if (seatError || !existingSeat) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Seat not found' }
      });
    }

    if (existingSeat.status !== 'empty') {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Seat is not available' }
      });
    }

    const now = new Date().toISOString();

    // Update seat to occupied
    const { error: seatUpdateError } = await supabase
      .from('commander_seats')
      .update({
        player_id: entry.player_id || null,
        player_name: entry.player_name || 'Player',
        status: 'occupied',
        buyin_amount: buyin_amount || null,
        seated_at: now
      })
      .eq('id', existingSeat.id);

    if (seatUpdateError) {
      console.error('Commander seat update error:', seatUpdateError);
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to update seat' }
      });
    }

    // Update waitlist entry to seated
    const { data: updatedEntry, error: entryUpdateError } = await supabase
      .from('commander_waitlist')
      .update({
        status: 'seated',
        seated_at: now
      })
      .eq('id', id)
      .select()
      .single();

    if (entryUpdateError) {
      console.error('Commander waitlist update error:', entryUpdateError);
    }

    // Update game player count and status
    const gameUpdates = {
      current_players: (game.current_players || 0) + 1
    };
    if (game.status === 'waiting') {
      gameUpdates.status = 'running';
      gameUpdates.started_at = now;
    }
    await supabase
      .from('commander_games')
      .update(gameUpdates)
      .eq('id', game_id);

    // Calculate wait time and log to history
    const waitTimeMinutes = Math.round(
      (new Date(now) - new Date(entry.created_at)) / (1000 * 60)
    );

    await supabase
      .from('commander_waitlist_history')
      .insert({
        venue_id: entry.venue_id,
        player_id: entry.player_id || null,
        game_type: entry.game_type,
        stakes: entry.stakes,
        wait_time_minutes: waitTimeMinutes,
        was_seated: true,
        signup_method: entry.signup_method
      });

    // Award XP to player for getting seated
    if (entry.player_id) {
      const XP_FOR_SEATED = 25; // Base XP for getting seated
      const DIAMOND_FOR_SEATED = 1; // Bonus diamond for using Commander

      // Create or update player session
      const { data: existingSession } = await supabase
        .from('commander_player_sessions')
        .select('id, xp_earned, diamonds_earned')
        .eq('venue_id', entry.venue_id)
        .eq('player_id', entry.player_id)
        .is('check_out_at', null)
        .single();

      if (existingSession) {
        // Update existing session with XP
        await supabase
          .from('commander_player_sessions')
          .update({
            xp_earned: (existingSession.xp_earned || 0) + XP_FOR_SEATED,
            diamonds_earned: (existingSession.diamonds_earned || 0) + DIAMOND_FOR_SEATED
          })
          .eq('id', existingSession.id);
      } else {
        // Create new session with XP
        await supabase
          .from('commander_player_sessions')
          .insert({
            venue_id: entry.venue_id,
            player_id: entry.player_id,
            check_in_at: now,
            xp_earned: XP_FOR_SEATED,
            diamonds_earned: DIAMOND_FOR_SEATED,
            games_played: [{
              game_id,
              game_type: entry.game_type,
              stakes: entry.stakes,
              started_at: now
            }]
          });
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        entry: updatedEntry,
        seat_number,
        game_id,
        wait_time_minutes: waitTimeMinutes
      }
    });
  } catch (error) {
    console.error('Commander waitlist seat API error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}
