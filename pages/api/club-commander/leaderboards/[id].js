/**
 * Single Leaderboard API
 * Reference: IMPLEMENTATION_PHASES.md - Phase 5
 * GET /api/club-commander/leaderboards/[id] - Get leaderboard with entries
 * PUT /api/club-commander/leaderboards/[id] - Update leaderboard
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'Leaderboard ID required' });
  }

  if (req.method === 'GET') {
    return getLeaderboard(req, res, id);
  }

  if (req.method === 'PUT') {
    return updateLeaderboard(req, res, id);
  }

  res.setHeader('Allow', ['GET', 'PUT']);
  return res.status(405).json({ error: 'Method not allowed' });
}

async function getLeaderboard(req, res, id) {
  try {
    const { data: leaderboard, error } = await supabase
      .from('captain_leaderboards')
      .select(`
        *,
        poker_venues:venue_id (id, name, city, state)
      `)
      .eq('id', id)
      .single();

    if (error || !leaderboard) {
      return res.status(404).json({ error: 'Leaderboard not found' });
    }

    // Get entries with rankings
    const { data: entries } = await supabase
      .from('captain_leaderboard_entries')
      .select(`
        *,
        profiles:player_id (id, display_name, avatar_url)
      `)
      .eq('leaderboard_id', id)
      .order('rank', { ascending: true, nullsFirst: false })
      .order('score', { ascending: false });

    return res.status(200).json({
      leaderboard,
      entries: entries || [],
      total_entries: entries?.length || 0
    });
  } catch (error) {
    console.error('Get leaderboard error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function updateLeaderboard(req, res, id) {
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

    // Get leaderboard to check venue
    const { data: existing } = await supabase
      .from('captain_leaderboards')
      .select('venue_id')
      .eq('id', id)
      .single();

    if (!existing) {
      return res.status(404).json({ error: 'Leaderboard not found' });
    }

    // Check if user is staff at this venue
    const { data: staff } = await supabase
      .from('captain_staff')
      .select('id, role')
      .eq('venue_id', existing.venue_id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (!staff) {
      return res.status(403).json({ error: 'You are not authorized to update this leaderboard' });
    }

    const updates = {};
    const allowedFields = [
      'name', 'description', 'period_type', 'start_date', 'end_date',
      'prizes', 'min_hours', 'min_sessions', 'eligible_games',
      'rules_description', 'status', 'settings'
    ];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    const { data: leaderboard, error } = await supabase
      .from('captain_leaderboards')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({ leaderboard });
  } catch (error) {
    console.error('Update leaderboard error:', error);
    return res.status(500).json({ error: error.message });
  }
}
