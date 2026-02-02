/**
 * Join League API
 * POST /api/commander/leagues/[id]/join
 * Per API_REFERENCE.md
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Only POST allowed' }
    });
  }

  const { id } = req.query;

  // Require authentication
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({
      success: false,
      error: { code: 'AUTH_REQUIRED', message: 'Authentication required' }
    });
  }

  try {
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_REQUIRED', message: 'Invalid token' }
      });
    }

    // Check if league exists
    const { data: league, error: leagueError } = await supabase
      .from('commander_leagues')
      .select('id, status')
      .eq('id', id)
      .single();

    if (leagueError || !league) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'League not found' }
      });
    }

    // Check if already joined
    const { data: existing } = await supabase
      .from('commander_league_standings')
      .select('id')
      .eq('league_id', id)
      .eq('player_id', user.id)
      .single();

    if (existing) {
      return res.status(400).json({
        success: false,
        error: { code: 'ALREADY_JOINED', message: 'Already a member of this league' }
      });
    }

    // Join the league
    const { data: standing, error: joinError } = await supabase
      .from('commander_league_standings')
      .insert({
        league_id: id,
        player_id: user.id,
        points: 0,
        events_played: 0,
        cashes: 0,
        wins: 0,
        earnings: 0
      })
      .select()
      .single();

    if (joinError) {
      console.error('Join error:', joinError);
      throw joinError;
    }

    return res.status(200).json({
      success: true,
      data: { standing }
    });

  } catch (error) {
    console.error('Join league error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to join league' }
    });
  }
}
