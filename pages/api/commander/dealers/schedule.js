/**
 * Dealer Schedule API - GET/POST /api/commander/dealers/schedule
 * View and create dealer rotation assignments
 * Reference: ENHANCEMENTS.md - Dealer Management Suite
 */
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '../../../../src/lib/commander/auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return handleList(req, res);
  } else if (req.method === 'POST') {
    return handleCreate(req, res);
  }

  return res.status(405).json({
    success: false,
    error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
  });
}

async function handleList(req, res) {
  const { venue_id, dealer_id, date, active_only } = req.query;

  if (!venue_id) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_FIELDS', message: 'venue_id required' }
    });
  }

  // Require staff auth
  const staff = await requireStaff(req, res, venue_id);
  if (!staff) return;

  try {
    let query = supabase
      .from('commander_dealer_rotations')
      .select(`
        *,
        commander_dealers (id, name, skill_level, certified_games),
        commander_tables (id, table_number, status)
      `)
      .eq('venue_id', venue_id)
      .order('started_at', { ascending: false });

    if (dealer_id) {
      query = query.eq('dealer_id', dealer_id);
    }

    if (date) {
      query = query.gte('started_at', `${date}T00:00:00`)
        .lt('started_at', `${date}T23:59:59`);
    }

    if (active_only === 'true') {
      query = query.is('ended_at', null);
    }

    const { data: rotations, error } = await query;

    if (error) throw error;

    return res.status(200).json({
      success: true,
      data: { rotations: rotations || [] }
    });
  } catch (error) {
    console.error('List dealer schedule error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to fetch dealer schedule' }
    });
  }
}

async function handleCreate(req, res) {
  const { venue_id, dealer_id, table_id } = req.body;

  if (!venue_id || !dealer_id || !table_id) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_FIELDS', message: 'venue_id, dealer_id, and table_id required' }
    });
  }

  // Require manager auth to assign dealers
  const staff = await requireStaff(req, res, venue_id, ['owner', 'manager', 'floor']);
  if (!staff) return;

  try {
    // Verify dealer exists and belongs to venue
    const { data: dealer, error: dealerError } = await supabase
      .from('commander_dealers')
      .select('id, name, status')
      .eq('id', dealer_id)
      .eq('venue_id', venue_id)
      .single();

    if (dealerError || !dealer) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Dealer not found at this venue' }
      });
    }

    if (dealer.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Dealer is not active' }
      });
    }

    // Verify table exists and belongs to venue
    const { data: table, error: tableError } = await supabase
      .from('commander_tables')
      .select('id, table_number')
      .eq('id', table_id)
      .eq('venue_id', venue_id)
      .single();

    if (tableError || !table) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Table not found at this venue' }
      });
    }

    // End any current rotation for this dealer
    await supabase
      .from('commander_dealer_rotations')
      .update({ ended_at: new Date().toISOString() })
      .eq('dealer_id', dealer_id)
      .eq('venue_id', venue_id)
      .is('ended_at', null);

    // End any current rotation at this table
    await supabase
      .from('commander_dealer_rotations')
      .update({ ended_at: new Date().toISOString() })
      .eq('table_id', table_id)
      .eq('venue_id', venue_id)
      .is('ended_at', null);

    // Create new rotation
    const { data: rotation, error: insertError } = await supabase
      .from('commander_dealer_rotations')
      .insert({
        venue_id,
        dealer_id,
        table_id,
        started_at: new Date().toISOString()
      })
      .select(`
        *,
        commander_dealers (id, name, skill_level),
        commander_tables (id, table_number)
      `)
      .single();

    if (insertError) throw insertError;

    return res.status(201).json({
      success: true,
      data: { rotation }
    });
  } catch (error) {
    console.error('Create dealer rotation error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to create dealer rotation' }
    });
  }
}
