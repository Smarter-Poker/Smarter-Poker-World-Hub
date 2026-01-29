/**
 * Dealer Rotations API
 * POST /api/commander/dealers/rotations - Create/manage dealer rotation
 * GET /api/commander/dealers/rotations - Get current rotations
 */
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '../../../../src/lib/commander/auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
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

  // Require staff auth
  const staff = await requireStaff(req, res, venue_id);
  if (!staff) return;

  try {
    // Get active dealer assignments
    const { data: rotations, error } = await supabase
      .from('commander_dealer_assignments')
      .select(`
        id,
        started_at,
        ended_at,
        commander_dealers:dealer_id (id, display_name, employee_id),
        commander_tables:table_id (id, table_number),
        commander_games:game_id (id, game_type, stakes)
      `)
      .eq('venue_id', parseInt(venue_id))
      .is('ended_at', null)
      .order('started_at', { ascending: false });

    if (error) throw error;

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
      .select('id, display_name')
      .eq('id', dealer_id)
      .eq('venue_id', parseInt(venue_id))
      .eq('is_active', true)
      .single();

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
        .from('commander_dealer_assignments')
        .update({ ended_at: new Date().toISOString() })
        .eq('dealer_id', dealer_id)
        .is('ended_at', null);

      // Create new assignment if table provided
      if (table_id) {
        const { data: assignment, error } = await supabase
          .from('commander_dealer_assignments')
          .insert({
            venue_id: parseInt(venue_id),
            dealer_id,
            table_id: parseInt(table_id),
            game_id: game_id ? parseInt(game_id) : null,
            started_at: new Date().toISOString()
          })
          .select()
          .single();

        if (error) throw error;

        return res.status(201).json({
          success: true,
          data: { assignment, message: `${dealer.display_name} pushed to table ${table_id}` }
        });
      }

      return res.status(200).json({
        success: true,
        data: { message: `${dealer.display_name} pushed off table` }
      });
    }

    if (action === 'break') {
      // End current assignment and mark dealer on break
      await supabase
        .from('commander_dealer_assignments')
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
        data: { message: `${dealer.display_name} is now on break` }
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
        data: { message: `${dealer.display_name} returned from break` }
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
      .from('commander_dealer_assignments')
      .update({ ended_at: new Date().toISOString() })
      .eq('dealer_id', dealer_id)
      .is('ended_at', null);

    // End any current assignment for this table
    await supabase
      .from('commander_dealer_assignments')
      .update({ ended_at: new Date().toISOString() })
      .eq('table_id', parseInt(table_id))
      .is('ended_at', null);

    // Create new assignment
    const { data: assignment, error } = await supabase
      .from('commander_dealer_assignments')
      .insert({
        venue_id: parseInt(venue_id),
        dealer_id,
        table_id: parseInt(table_id),
        game_id: game_id ? parseInt(game_id) : null,
        started_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    return res.status(201).json({
      success: true,
      data: { assignment, message: `${dealer.display_name} assigned to table` }
    });
  } catch (error) {
    console.error('Create rotation error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to create rotation' }
    });
  }
}
