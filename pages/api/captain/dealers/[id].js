/**
 * Dealer Detail API
 * GET /api/captain/dealers/:id
 * PATCH /api/captain/dealers/:id
 * DELETE /api/captain/dealers/:id
 */
import { createClient } from '@supabase/supabase-js';

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
    const { data: dealer, error } = await supabase
      .from('captain_dealers')
      .select(`
        *,
        profiles (id, display_name, avatar_url),
        captain_dealer_rotations (
          id,
          table_id,
          start_time,
          end_time,
          captain_tables (id, table_number)
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
  const updates = req.body;

  try {
    const { data: dealer, error } = await supabase
      .from('captain_dealers')
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
  try {
    const { error } = await supabase
      .from('captain_dealers')
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
