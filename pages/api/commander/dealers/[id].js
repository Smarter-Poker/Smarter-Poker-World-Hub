/**
 * Dealer Detail API
 * GET /api/commander/dealers/:id
 * PATCH /api/commander/dealers/:id
 * DELETE /api/commander/dealers/:id
 */
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '../../../../src/lib/commander/auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { id } = req.query;

  if (req.method === 'GET') {
    return handleGet(req, res, id);
  } else if (req.method === 'PATCH') {
    return handleUpdate(req, res, id);
  } else if (req.method === 'DELETE') {
    return handleDelete(req, res, id);
  }

  return res.status(405).json({
    success: false,
    error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
  });
}

async function handleGet(req, res, id) {
  try {
    // First get dealer to find venue_id
    const { data: dealerCheck } = await supabase
      .from('commander_dealers')
      .select('venue_id')
      .eq('id', id)
      .single();

    if (!dealerCheck) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Dealer not found' }
      });
    }

    // Require staff auth at this venue
    const staff = await requireStaff(req, res, dealerCheck.venue_id);
    if (!staff) return;

    const { data: dealer, error } = await supabase
      .from('commander_dealers')
      .select(`
        *,
        profiles (id, display_name, avatar_url),
        commander_dealer_rotations (
          id,
          table_id,
          start_time,
          end_time,
          commander_tables (id, table_number)
        )
      `)
      .eq('id', id)
      .single();

    if (error || !dealer) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Dealer not found' }
      });
    }

    return res.status(200).json({
      success: true,
      data: { dealer }
    });
  } catch (error) {
    console.error('Get dealer error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to fetch dealer' }
    });
  }
}

async function handleUpdate(req, res, id) {
  // First get dealer to find venue_id
  const { data: dealerCheck } = await supabase
    .from('commander_dealers')
    .select('venue_id')
    .eq('id', id)
    .single();

  if (!dealerCheck) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Dealer not found' }
    });
  }

  // Require manager auth to update dealers
  const staff = await requireStaff(req, res, dealerCheck.venue_id, ['owner', 'manager']);
  if (!staff) return;

  const updates = req.body;

  try {
    const { data: dealer, error } = await supabase
      .from('commander_dealers')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({
      success: true,
      data: { dealer }
    });
  } catch (error) {
    console.error('Update dealer error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to update dealer' }
    });
  }
}

async function handleDelete(req, res, id) {
  // First get dealer to find venue_id
  const { data: dealerCheck } = await supabase
    .from('commander_dealers')
    .select('venue_id')
    .eq('id', id)
    .single();

  if (!dealerCheck) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Dealer not found' }
    });
  }

  // Require manager auth to delete dealers
  const staff = await requireStaff(req, res, dealerCheck.venue_id, ['owner', 'manager']);
  if (!staff) return;

  try {
    const { error } = await supabase
      .from('commander_dealers')
      .update({ status: 'inactive' })
      .eq('id', id);

    if (error) throw error;

    return res.status(200).json({
      success: true,
      data: { message: 'Dealer deactivated' }
    });
  } catch (error) {
    console.error('Delete dealer error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to delete dealer' }
    });
  }
}
