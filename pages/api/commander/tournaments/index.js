/**
 * Tournament CRUD API
 * Reference: IMPLEMENTATION_PHASES.md - Phase 3
 * GET /api/commander/tournaments - List tournaments
 * POST /api/commander/tournaments - Create tournament
 */
import { createClient } from '@supabase/supabase-js';
import { captureException } from '../../../../src/lib/commander/errorMonitoring';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return listTournaments(req, res);
  }

  if (req.method === 'POST') {
    return createTournament(req, res);
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } });
}

async function listTournaments(req, res) {
  try {
    const { venue_id, status, from_date, to_date, limit = 50 } = req.query;

    let query = supabase
      .from('commander_tournaments')
      .select(`
        *,
        poker_venues (id, name, city, state)
      `)
      .order('scheduled_start', { ascending: true })
      .limit(parseInt(limit));

    if (venue_id) {
      query = query.eq('venue_id', parseInt(venue_id));
    }

    if (status) {
      if (status === 'upcoming') {
        query = query.in('status', ['scheduled', 'registration']);
      } else if (status === 'active') {
        query = query.in('status', ['running', 'paused', 'final_table']);
      } else {
        query = query.eq('status', status);
      }
    }

    if (from_date) {
      query = query.gte('scheduled_start', from_date);
    }

    if (to_date) {
      query = query.lte('scheduled_start', to_date);
    }

    const { data, error } = await query;

    if (error) throw error;

    return res.status(200).json({ success: true, data: { tournaments: data } });
  } catch (error) {
    captureException(error, { action: 'list_tournaments', endpoint: '/api/commander/tournaments' });
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
}

async function createTournament(req, res) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authorization required' } });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ success: false, error: { code: 'AUTH_INVALID', message: 'Invalid token' } });
    }

    const {
      venue_id,
      name,
      description,
      tournament_type,
      buyin_amount,
      buyin_fee,
      starting_chips,
      scheduled_start,
      registration_opens,
      late_registration_levels,
      min_entries,
      max_entries,
      guaranteed_pool,
      blind_structure,
      break_schedule,
      payout_structure,
      allows_rebuys,
      rebuy_amount,
      rebuy_chips,
      max_rebuys,
      rebuy_end_level,
      allows_addon,
      addon_amount,
      addon_chips,
      addon_at_break,
      bounty_amount,
      broadcast_to_smarter,
      series_id,
      settings
    } = req.body;

    if (!venue_id || !name || !tournament_type || !buyin_amount || !starting_chips || !scheduled_start) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Required fields: venue_id, name, tournament_type, buyin_amount, starting_chips, scheduled_start' }
      });
    }

    // Verify user is staff at this venue
    const { data: staff, error: staffError } = await supabase
      .from('commander_staff')
      .select('id, role')
      .eq('venue_id', parseInt(venue_id))
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (staffError || !staff) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'You are not staff at this venue' } });
    }

    const { data: tournament, error } = await supabase
      .from('commander_tournaments')
      .insert({
        venue_id: parseInt(venue_id),
        name,
        description,
        tournament_type,
        buyin_amount,
        buyin_fee: buyin_fee || 0,
        starting_chips,
        scheduled_start,
        registration_opens,
        late_registration_levels: late_registration_levels || 6,
        min_entries: min_entries || 2,
        max_entries,
        guaranteed_pool,
        blind_structure: blind_structure || [],
        break_schedule: break_schedule || [],
        payout_structure: payout_structure || [],
        allows_rebuys: allows_rebuys || false,
        rebuy_amount,
        rebuy_chips,
        max_rebuys,
        rebuy_end_level,
        allows_addon: allows_addon || false,
        addon_amount,
        addon_chips,
        addon_at_break,
        bounty_amount,
        broadcast_to_smarter: broadcast_to_smarter !== false,
        series_id,
        settings: settings || {},
        created_by: staff.id
      })
      .select()
      .single();

    if (error) throw error;

    return res.status(201).json({ success: true, data: { tournament } });
  } catch (error) {
    captureException(error, { action: 'create_tournament', endpoint: '/api/commander/tournaments', venue_id: req.body?.venue_id });
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
}
