/**
 * Dealer Rotations API
 * POST /api/commander/dealers/rotations - Create/manage dealer rotation
 * GET /api/commander/dealers/rotations - Get current rotations
 */
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '../../../../src/lib/commander/auth';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

  if (req.method === 'GET') {
    return getRotations(req, res);
  }

  if (req.method === 'POST') {
    return createRotation(req, res);
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({
    success: false,
    error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
  });
}

async function getRotations(req, res) {
  const { venue_id } = req.query;

  if (!venue_id) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_FIELDS', message: 'venue_id is required' }
    });
  }

  // Light auth for GET (read-only) — matches tables API pattern
  const staffSession = req.headers['x-staff-session'];
  if (!staffSession) {
    return res.status(401).json({
      success: false,
      error: { code: 'AUTH_REQUIRED', message: 'Staff authentication required' }
    });
  }
  let sessionData;
  try {
    sessionData = JSON.parse(staffSession);
    if (String(sessionData.venue_id) !== String(venue_id)) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Venue mismatch' }
      });
    }
  } catch {
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_SESSION', message: 'Invalid session format' }
    });
  }

  try {
    // Get active dealer assignments — only dealer_id FK exists in rotations table
    // table_number and dealer_name are stored directly as columns
    let rotations = [];
    try {
      const result = await supabase
        .from('commander_dealer_rotations')
        .select(`
          id,
          started_at,
          ended_at,
          dealer_name,
          table_number,
          dealer_id,
          commander_dealers:dealer_id (id, name, employee_id)
        `)
        .eq('venue_id', venue_id)
        .is('ended_at', null)
        .order('started_at', { ascending: false });

      if (result.error) throw result.error;
      rotations = result.data || [];
    } catch (joinErr) {
      // Fallback: simple query without FK join
      const result = await supabase
        .from('commander_dealer_rotations')
        .select('*')
        .eq('venue_id', venue_id)
        .is('ended_at', null)
        .order('started_at', { ascending: false });

      if (result.error) throw result.error;
      rotations = result.data || [];
    }

    return res.status(200).json({
      success: true,
      data: { rotations: rotations || [] }
    });
  } catch (error) {
    console.error('Get rotations error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to get rotations' }
    });
  }
}

async function createRotation(req, res) {
  const { venue_id, dealer_id, table_id, game_id, action } = req.body;

  if (!venue_id || !dealer_id) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_FIELDS', message: 'venue_id and dealer_id are required' }
    });
  }

  // Require floor staff or higher to manage rotations
  const staff = await requireStaff(req, res, venue_id, ['owner', 'manager', 'floor']);
  if (!staff) return;

  try {
    // Verify dealer belongs to venue
    const { data: dealer, error: dealerError } = await supabase
      .from('commander_dealers')
      .select('id, name')
      .eq('id', dealer_id)
      .eq('venue_id', venue_id)
      .eq('is_active', true)
      .single();

    // Look up table_number from table_id for complete rotation records
    let resolvedTableNumber = null;
    if (table_id) {
      const { data: tbl } = await supabase
        .from('commander_tables')
        .select('table_number')
        .eq('id', parseInt(table_id))
        .single();
      resolvedTableNumber = tbl?.table_number || null;
    }

    if (dealerError || !dealer) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Dealer not found' }
      });
    }

    // Handle different actions
    if (action === 'push') {
      // End current assignment
      await supabase
        .from('commander_dealer_rotations')
        .update({ ended_at: new Date().toISOString() })
        .eq('dealer_id', dealer_id)
        .is('ended_at', null);

      // Create new assignment if table provided
      if (table_id) {
        const { data: assignment, error } = await supabase
          .from('commander_dealer_rotations')
          .insert({
            venue_id: venue_id,
            dealer_id,
            dealer_name: dealer.name,
            table_id: parseInt(table_id),
            table_number: resolvedTableNumber,
            game_id: game_id ? parseInt(game_id) : null,
            started_at: new Date().toISOString()
          })
          .select()
          .single();

        if (error) throw error;

        return res.status(201).json({
          success: true,
          data: { assignment, message: `${dealer.name} pushed to table ${table_id}` }
        });
      }

      return res.status(200).json({
        success: true,
        data: { message: `${dealer.name} pushed off table` }
      });
    }

    if (action === 'break') {
      // End current assignment and mark dealer on break
      await supabase
        .from('commander_dealer_rotations')
        .update({ ended_at: new Date().toISOString() })
        .eq('dealer_id', dealer_id)
        .is('ended_at', null);

      await supabase
        .from('commander_dealers')
        .update({
          current_status: 'on_break',
          break_started_at: new Date().toISOString()
        })
        .eq('id', dealer_id);

      return res.status(200).json({
        success: true,
        data: { message: `${dealer.name} is now on break` }
      });
    }

    if (action === 'return') {
      // Return from break
      await supabase
        .from('commander_dealers')
        .update({
          current_status: 'available',
          break_started_at: null
        })
        .eq('id', dealer_id);

      return res.status(200).json({
        success: true,
        data: { message: `${dealer.name} returned from break` }
      });
    }

    // Default: assign to table
    if (!table_id) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_FIELDS', message: 'table_id is required for assignment' }
      });
    }

    // End any current assignment for this dealer
    await supabase
      .from('commander_dealer_rotations')
      .update({ ended_at: new Date().toISOString() })
      .eq('dealer_id', dealer_id)
      .is('ended_at', null);

    // End any current assignment for this table
    await supabase
      .from('commander_dealer_rotations')
      .update({ ended_at: new Date().toISOString() })
      .eq('table_id', parseInt(table_id))
      .is('ended_at', null);

    // Create new assignment
    const { data: assignment, error } = await supabase
      .from('commander_dealer_rotations')
      .insert({
        venue_id: venue_id,
        dealer_id,
        dealer_name: dealer.name,
        table_id: parseInt(table_id),
        table_number: resolvedTableNumber,
        game_id: game_id ? parseInt(game_id) : null,
        started_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    return res.status(201).json({
      success: true,
      data: { assignment, message: `${dealer.name} assigned to table` }
    });
  } catch (error) {
    console.error('Create rotation error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to create rotation' }
    });
  }
}
