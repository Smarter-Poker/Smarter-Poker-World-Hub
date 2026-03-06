/**
 * Leaderboards API
 * Reference: IMPLEMENTATION_PHASES.md - Phase 5
 * GET /api/commander/leaderboards - List leaderboards
 * POST /api/commander/leaderboards - Create leaderboard
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
      .limit(Math.min(parseInt(limit) || 50, 500));

    if (venue_id) {
      query = query.eq('venue_id', venue_id);
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
    // Staff already validated by guardWriteStaff — get venue from staff session
    const staffResult = await verifyStaffSession(req);
    if (staffResult.error) {
      return res.status(staffResult.error.status || 401).json({ error: staffResult.error.message });
    }
    const staff = staffResult.staff;

    const { venue_id } = req.body;

    if (!venue_id) {
      return res.status(400).json({ error: 'Venue ID required' });
    }

    // Verify staff is authorized for this venue
    if (staff.venue_id && staff.venue_id !== parseInt(venue_id)) {
      return res.status(403).json({ error: 'Not authorized for this venue' });
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
        venue_id: venue_id,
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
