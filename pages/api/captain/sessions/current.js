/**
 * Current Session API
 * GET /api/captain/sessions/current - Get player's active session
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
    // Find active session for this player
    const { data: session, error } = await supabase
      .from('captain_sessions')
      .select(`
        id,
        venue_id,
        game_id,
        check_in_time,
        check_out_time,
        poker_venues:venue_id (id, name),
        captain_games:game_id (
          id,
          game_type,
          stakes,
          captain_tables:table_id (id, table_number)
        ),
        captain_seats:seat_id (id, seat_number)
      `)
      .eq('player_id', user.id)
      .is('check_out_time', null)
      .order('check_in_time', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    if (!session) {
      return res.status(200).json({
        success: true,
        data: { session: null }
      });
    }

    // Format response
    const formattedSession = {
      id: session.id,
      venue_id: session.venue_id,
      venue_name: session.poker_venues?.name || 'Unknown Venue',
      game_id: session.game_id,
      game_type: session.captain_games?.game_type || 'nlhe',
      stakes: session.captain_games?.stakes || 'Unknown',
      table_id: session.captain_games?.captain_tables?.id,
      table_number: session.captain_games?.captain_tables?.table_number,
      seat_number: session.captain_seats?.seat_number,
      check_in_time: session.check_in_time
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
