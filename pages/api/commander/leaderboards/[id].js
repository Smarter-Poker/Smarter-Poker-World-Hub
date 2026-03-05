/**
 * Single Leaderboard API
 * Reference: IMPLEMENTATION_PHASES.md - Phase 5
 * GET /api/commander/leaderboards/[id] - Get leaderboard with entries
 * PUT /api/commander/leaderboards/[id] - Update leaderboard
 */
import { createClient } from '@supabase/supabase-js';
import { guardWriteStaff, verifyStaffSession } from '../../../../src/lib/commander/auth';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // CDN cache: fresh for 30s, serve stale up to 120s
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');
  }

  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

  const _g = await guardWriteStaff(req, res); if (!_g) return;

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
      .from('commander_leaderboards')
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
      .from('commander_leaderboard_entries')
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
    // Staff already validated by guardWriteStaff — get venue from staff session
    const staffResult = await verifyStaffSession(req);
    if (staffResult.error) {
      return res.status(staffResult.error.status || 401).json({ error: staffResult.error.message });
    }
    const staff = staffResult.staff;

    // Get leaderboard to check venue
    const { data: existing } = await supabase
      .from('commander_leaderboards')
      .select('venue_id')
      .eq('id', id)
      .single();

    if (!existing) {
      return res.status(404).json({ error: 'Leaderboard not found' });
    }

    // Verify staff is authorized for this venue
    if (staff.venue_id && staff.venue_id !== existing.venue_id) {
      return res.status(403).json({ error: 'Not authorized for this venue' });
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
      .from('commander_leaderboards')
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
