/**
 * Captain Seat Player API - POST /api/captain/waitlist/:id/seat [Staff]
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
    // TODO: Add staff authentication check (Step 1.3)

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
      .from('captain_waitlist')
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
      .from('captain_games')
      .select('id, status, venue_id')
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
      .from('captain_seats')
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
      .from('captain_seats')
      .update({
        player_id: entry.player_id || null,
        player_name: entry.player_name || 'Player',
        status: 'occupied',
        buyin_amount: buyin_amount || null,
        seated_at: now
      })
      .eq('id', existingSeat.id);

    if (seatUpdateError) {
      console.error('Captain seat update error:', seatUpdateError);
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to update seat' }
      });
    }

    // Update waitlist entry to seated
    const { data: updatedEntry, error: entryUpdateError } = await supabase
      .from('captain_waitlist')
      .update({
        status: 'seated',
        seated_at: now
      })
      .eq('id', id)
      .select()
      .single();

    if (entryUpdateError) {
      console.error('Captain waitlist update error:', entryUpdateError);
    }

    // Calculate wait time and log to history
    const waitTimeMinutes = Math.round(
      (new Date(now) - new Date(entry.created_at)) / (1000 * 60)
    );

    await supabase
      .from('captain_waitlist_history')
      .insert({
        venue_id: entry.venue_id,
        player_id: entry.player_id || null,
        game_type: entry.game_type,
        stakes: entry.stakes,
        wait_time_minutes: waitTimeMinutes,
        was_seated: true,
        signup_method: entry.signup_method
      });

    // TODO: Award XP to player (Phase 2 - Step 2.6)

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
    console.error('Captain waitlist seat API error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}
