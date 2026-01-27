/**
 * Current Session API
 * GET /api/captain/sessions/current - Get player's active session
 * Returns the player's current seat location if they are seated at a game
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
    });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({
      success: false,
      error: { code: 'AUTH_REQUIRED', message: 'Authentication required' }
    });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' }
    });
  }

  try {
    // Find player's current seat (where they are actively seated in a running game)
    const { data: seats, error } = await supabase
      .from('captain_seats')
      .select(`
        id,
        seat_number,
        seated_at,
        game_id,
        captain_games (
          id,
          venue_id,
          game_type,
          stakes,
          status,
          table_id
        )
      `)
      .eq('player_id', user.id)
      .eq('status', 'occupied')
      .order('seated_at', { ascending: false });

    if (error) {
      throw error;
    }

    // Filter for active games
    const activeSeat = seats?.find(s =>
      s.captain_games && ['waiting', 'running'].includes(s.captain_games.status)
    );

    if (!activeSeat) {
      return res.status(200).json({
        success: true,
        data: { session: null }
      });
    }

    // Get table info
    let tableInfo = null;
    if (activeSeat.captain_games.table_id) {
      const { data: table } = await supabase
        .from('captain_tables')
        .select('id, table_number, table_name')
        .eq('id', activeSeat.captain_games.table_id)
        .single();
      tableInfo = table;
    }

    // Get venue info
    const { data: venue } = await supabase
      .from('poker_venues')
      .select('id, name')
      .eq('id', activeSeat.captain_games.venue_id)
      .single();

    // Format response
    const formattedSession = {
      id: activeSeat.id,
      venue_id: activeSeat.captain_games.venue_id,
      venue_name: venue?.name || 'Unknown Venue',
      game_id: activeSeat.captain_games.id,
      game_type: activeSeat.captain_games.game_type,
      stakes: activeSeat.captain_games.stakes,
      table_id: tableInfo?.id,
      table_number: tableInfo?.table_number,
      seat_number: activeSeat.seat_number,
      check_in_time: activeSeat.seated_at
    };

    return res.status(200).json({
      success: true,
      data: { session: formattedSession }
    });
  } catch (error) {
    console.error('Get current session error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to get current session' }
    });
  }
}
