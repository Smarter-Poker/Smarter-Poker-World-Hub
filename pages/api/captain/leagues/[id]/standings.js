/**
 * League Standings API
 * GET /api/captain/leagues/[id]/standings
 * Per API_REFERENCE.md
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
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Only GET allowed' }
    });
  }

  const { id } = req.query;
  const { limit = 100 } = req.query;

  try {
    // Get standings with player info
    const { data: standings, error } = await supabase
      .from('captain_league_standings')
      .select(`
        id,
        player_id,
        points,
        events_played,
        cashes,
        wins,
        earnings,
        updated_at,
        profiles (
          display_name,
          avatar_url
        )
      `)
      .eq('league_id', id)
      .order('points', { ascending: false })
      .limit(parseInt(limit));

    if (error) {
      console.error('Standings fetch error:', error);
      throw error;
    }

    const formattedStandings = (standings || []).map(entry => ({
      player_id: entry.player_id,
      player_name: entry.profiles?.display_name || 'Player',
      avatar_url: entry.profiles?.avatar_url,
      points: entry.points || 0,
      events_played: entry.events_played || 0,
      cashes: entry.cashes || 0,
      wins: entry.wins || 0,
      earnings: entry.earnings || 0
    }));

    return res.status(200).json({
      success: true,
      data: { standings: formattedStandings }
    });

  } catch (error) {
    console.error('Standings error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to fetch standings' }
    });
  }
}
