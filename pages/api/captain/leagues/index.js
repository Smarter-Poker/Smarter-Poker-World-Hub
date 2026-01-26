/**
 * Leagues API
 * GET /api/captain/leagues - List all leagues
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

  try {
    const { status, limit = 50 } = req.query;

    let query = supabase
      .from('captain_leagues')
      .select(`
        id,
        name,
        description,
        organizer_id,
        venues,
        season_start,
        season_end,
        scoring_system,
        prize_pool,
        status,
        created_at
      `)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (status) {
      query = query.eq('status', status);
    }

    const { data: leagues, error } = await query;

    if (error) {
      console.error('Leagues fetch error:', error);
      throw error;
    }

    // Get player counts for each league
    const leagueIds = (leagues || []).map(l => l.id);
    const { data: standingsCounts } = await supabase
      .from('captain_league_standings')
      .select('league_id')
      .in('league_id', leagueIds.length > 0 ? leagueIds : ['none']);

    const playerCounts = {};
    (standingsCounts || []).forEach(s => {
      playerCounts[s.league_id] = (playerCounts[s.league_id] || 0) + 1;
    });

    const enrichedLeagues = (leagues || []).map(league => ({
      ...league,
      player_count: playerCounts[league.id] || 0,
      events_count: 0 // Would come from events table
    }));

    return res.status(200).json({
      success: true,
      data: { leagues: enrichedLeagues }
    });

  } catch (error) {
    console.error('Leagues error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to fetch leagues' }
    });
  }
}
