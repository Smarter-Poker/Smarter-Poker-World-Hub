/**
 * Commander Live Games API - GET /api/commander/games/live [Public]
 * Get all currently running games
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

  try {
    const { venue_id, game_type, stakes, limit = 100 } = req.query;

    let query = supabase
      .from('commander_games')
      .select(`
        *,
        poker_venues (
          id,
          name,
          city,
          state
        ),
        commander_tables (
          id,
          table_number,
          table_name
        )
      `)
      .in('status', ['waiting', 'running'])
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    // Filter by venue
    if (venue_id) {
      query = query.eq('venue_id', venue_id);
    }

    // Filter by game type
    if (game_type) {
      query = query.eq('game_type', game_type.toLowerCase());
    }

    // Filter by stakes
    if (stakes) {
      query = query.eq('stakes', stakes);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Commander live games query error:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to fetch games' }
      });
    }

    // Get waitlist counts for each game
    const games = await Promise.all((data || []).map(async (game) => {
      const { count } = await supabase
        .from('commander_waitlist')
        .select('id', { count: 'exact', head: true })
        .eq('venue_id', game.venue_id)
        .eq('game_type', game.game_type)
        .eq('stakes', game.stakes)
        .eq('status', 'waiting');

      return {
        ...game,
        waitlist_count: count || 0
      };
    }));

    return res.status(200).json({
      success: true,
      data: { games }
    });
  } catch (error) {
    console.error('Commander live games API error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}
