/**
 * Commander Games API - POST /api/commander/games
 * Create a new game
 * Reference: API_REFERENCE.md - Games section
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const VALID_GAME_TYPES = ['nlh', 'plo', 'plo5', 'mixed', 'limit', 'stud', 'razz', 'other'];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
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

    const {
      venue_id,
      table_id,
      game_type,
      stakes,
      min_buyin,
      max_buyin,
      max_players = 9,
      is_must_move = false,
      parent_game_id,
      settings = {}
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

    if (!VALID_GAME_TYPES.includes(game_type)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `Invalid game_type. Must be one of: ${VALID_GAME_TYPES.join(', ')}`
        }
      });
    }

    // Verify venue exists and has Commander enabled
    const { data: venue, error: venueError } = await supabase
      .from('poker_venues')
      .select('id, commander_enabled')
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

    // If table_id provided, verify table is available
    if (table_id) {
      const { data: table, error: tableError } = await supabase
        .from('commander_tables')
        .select('id, status')
        .eq('id', table_id)
        .single();

      if (tableError || !table) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Table not found' }
        });
      }

      if (table.status !== 'available') {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Table is not available' }
        });
      }
    }

    // Create the game
    const { data: game, error: gameError } = await supabase
      .from('commander_games')
      .insert({
        venue_id,
        table_id: table_id || null,
        game_type,
        stakes,
        min_buyin: min_buyin || null,
        max_buyin: max_buyin || null,
        max_players,
        is_must_move,
        parent_game_id: parent_game_id || null,
        settings,
        status: 'waiting',
        current_players: 0
      })
      .select()
      .single();

    if (gameError) {
      console.error('Commander game create error:', gameError);
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to create game' }
      });
    }

    // Update table status if table was assigned
    if (table_id) {
      await supabase
        .from('commander_tables')
        .update({
          status: 'in_use',
          current_game_id: game.id
        })
        .eq('id', table_id);
    }

    // Create empty seats for the game
    const seats = [];
    for (let i = 1; i <= max_players; i++) {
      seats.push({
        game_id: game.id,
        seat_number: i,
        status: 'empty'
      });
    }

    await supabase.from('commander_seats').insert(seats);

    return res.status(201).json({
      success: true,
      data: { game }
    });
  } catch (error) {
    console.error('Commander games API error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}
