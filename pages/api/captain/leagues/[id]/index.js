/**
 * League Detail API
 * GET /api/captain/leagues/[id] - Get league details
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

  try {
    // Get league details
    const { data: league, error: leagueError } = await supabase
      .from('captain_leagues')
      .select('*')
      .eq('id', id)
      .single();

    if (leagueError || !league) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'League not found' }
      });
    }

    // Get player count
    const { count: playerCount } = await supabase
      .from('captain_league_standings')
      .select('*', { count: 'exact', head: true })
      .eq('league_id', id);

    // Check if current user is joined (if authenticated)
    let isJoined = false;
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        const { data: membership } = await supabase
          .from('captain_league_standings')
          .select('id')
          .eq('league_id', id)
          .eq('player_id', user.id)
          .single();
        isJoined = !!membership;
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        league: {
          ...league,
          player_count: playerCount || 0
        },
        events: [], // Would come from events table
        is_joined: isJoined
      }
    });

  } catch (error) {
    console.error('League detail error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to fetch league' }
    });
  }
}
