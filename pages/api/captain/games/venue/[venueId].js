/**
 * Captain Games at Venue API - GET /api/captain/games/venue/:venueId [Public]
 * Get all games at a specific venue
 * Reference: API_REFERENCE.md - Games section
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
    });
  }

  const { venueId } = req.query;

  if (!venueId) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Venue ID required' }
    });
  }

  try {
    // Get games
    const { data: games, error: gamesError } = await supabase
      .from('captain_games')
      .select(`
        *,
        captain_tables (
          id,
          table_number,
          table_name,
          max_seats
        ),
        captain_seats (
          id,
          seat_number,
          status,
          player_name
        )
      `)
      .eq('venue_id', venueId)
      .in('status', ['waiting', 'running', 'breaking'])
      .order('created_at', { ascending: false });

    if (gamesError) {
      console.error('Captain venue games query error:', gamesError);
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to fetch games' }
      });
    }

    // Get all tables at venue
    const { data: tables, error: tablesError } = await supabase
      .from('captain_tables')
      .select('*')
      .eq('venue_id', venueId)
      .order('table_number', { ascending: true });

    if (tablesError) {
      console.error('Captain venue tables query error:', tablesError);
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to fetch tables' }
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        games: games || [],
        tables: tables || []
      }
    });
  } catch (error) {
    console.error('Captain venue games API error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}
