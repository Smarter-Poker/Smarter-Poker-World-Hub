/**
 * Leaderboards API
 * Reference: IMPLEMENTATION_PHASES.md - Phase 5
 * GET /api/commander/leaderboards - List leaderboards
 * POST /api/commander/leaderboards - Create leaderboard
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return listLeaderboards(req, res);
  }

  if (req.method === 'POST') {
    return createLeaderboard(req, res);
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: 'Method not allowed' });
}

async function listLeaderboards(req, res) {
  try {
    const { venue_id, status = 'active', limit = 20 } = req.query;

    let query = supabase
      .from('commander_leaderboards')
      .select(`
        *,
        poker_venues:venue_id (id, name)
      `)
      .order('start_date', { ascending: false })
      .limit(parseInt(limit));

    if (venue_id) {
      query = query.eq('venue_id', parseInt(venue_id));
    }

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) throw error;

    return res.status(200).json({ leaderboards: data });
  } catch (error) {
    console.error('List leaderboards error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function createLeaderboard(req, res) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization required' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const { venue_id } = req.body;

    if (!venue_id) {
      return res.status(400).json({ error: 'Venue ID required' });
    }

    // Check if user is staff at this venue
    const { data: staff } = await supabase
      .from('commander_staff')
      .select('id, role')
      .eq('venue_id', parseInt(venue_id))
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (!staff) {
      return res.status(403).json({ error: 'You are not authorized to create leaderboards' });
    }

    const {
      name,
      description,
      leaderboard_type,
      period_type = 'monthly',
      start_date,
      end_date,
      prizes = [],
      min_hours,
      min_sessions,
      eligible_games,
      rules_description,
      status = 'upcoming',
      settings = {}
    } = req.body;

    if (!name || !leaderboard_type || !start_date || !end_date) {
      return res.status(400).json({ error: 'Name, type, start date, and end date are required' });
    }

    const { data: leaderboard, error } = await supabase
      .from('commander_leaderboards')
      .insert({
        venue_id: parseInt(venue_id),
        name,
        description,
        leaderboard_type,
        period_type,
        start_date,
        end_date,
        prizes,
        min_hours,
        min_sessions,
        eligible_games,
        rules_description,
        status,
        settings
      })
      .select(`
        *,
        poker_venues:venue_id (id, name)
      `)
      .single();

    if (error) throw error;

    return res.status(201).json({ leaderboard });
  } catch (error) {
    console.error('Create leaderboard error:', error);
    return res.status(500).json({ error: error.message });
  }
}
