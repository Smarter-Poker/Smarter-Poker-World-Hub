/**
 * Captain Table API - GET/PATCH/DELETE /api/captain/tables/:id
 * Get, update, or delete a table
 * Reference: Phase 2 - Table CRUD
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const VALID_STATUSES = ['available', 'in_use', 'reserved', 'maintenance'];

async function verifyStaffAuth(req, res) {
  const staffSession = req.headers['x-staff-session'];
  if (!staffSession) {
    return { error: { status: 401, code: 'AUTH_REQUIRED', message: 'Staff authentication required' } };
  }

  let sessionData;
  try {
    sessionData = JSON.parse(staffSession);
  } catch {
    return { error: { status: 401, code: 'INVALID_SESSION', message: 'Invalid session format' } };
  }

  const { data: staff, error: staffError } = await supabase
    .from('captain_staff')
    .select('id, venue_id, role, is_active')
    .eq('id', sessionData.id)
    .eq('is_active', true)
    .single();

  if (staffError || !staff) {
    return { error: { status: 401, code: 'INVALID_STAFF', message: 'Staff member not found or inactive' } };
  }

  return { staff };
}

export default async function handler(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Table ID required' }
    });
  }

  switch (req.method) {
    case 'GET':
      return handleGet(req, res, id);
    case 'PATCH':
      return handlePatch(req, res, id);
    case 'DELETE':
      return handleDelete(req, res, id);
    default:
      return res.status(405).json({
        success: false,
        error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
      });
  }
}

async function handleGet(req, res, tableId) {
  try {
    const { data: table, error } = await supabase
      .from('captain_tables')
      .select(`
        *,
        captain_games (
          id,
          game_type,
          stakes,
          status,
          current_players,
          max_players,
          started_at,
          captain_seats (
            id,
            seat_number,
            player_name,
            status,
            seated_at
          )
        )
      `)
      .eq('id', tableId)
      .single();

    if (error || !table) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Table not found' }
      });
    }

    return res.status(200).json({
      success: true,
      data: { table }
    });
  } catch (error) {
    console.error('Captain table GET error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}

async function handlePatch(req, res, tableId) {
  try {
    // Verify staff authentication
    const authResult = await verifyStaffAuth(req, res);
    if (authResult.error) {
      return res.status(authResult.error.status).json({
        success: false,
        error: { code: authResult.error.code, message: authResult.error.message }
      });
    }

    const { table_name, max_seats, status, features, position_x, position_y } = req.body;

    // Verify table exists
    const { data: existing, error: fetchError } = await supabase
      .from('captain_tables')
      .select('id, status, current_game_id')
      .eq('id', tableId)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Table not found' }
      });
    }

    const updates = {};

    if (table_name !== undefined) updates.table_name = table_name;
    if (max_seats !== undefined) updates.max_seats = max_seats;
    if (features !== undefined) updates.features = features;
    if (position_x !== undefined) updates.position_x = position_x;
    if (position_y !== undefined) updates.position_y = position_y;

    if (status !== undefined) {
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: `Invalid status. Must be: ${VALID_STATUSES.join(', ')}` }
        });
      }
      // Can't change to available if game is running
      if (status === 'available' && existing.current_game_id) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Cannot set to available while game is running' }
        });
      }
      updates.status = status;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'No valid fields to update' }
      });
    }

    const { data: table, error: updateError } = await supabase
      .from('captain_tables')
      .update(updates)
      .eq('id', tableId)
      .select()
      .single();

    if (updateError) {
      console.error('Captain table PATCH error:', updateError);
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to update table' }
      });
    }

    return res.status(200).json({
      success: true,
      data: { table }
    });
  } catch (error) {
    console.error('Captain table PATCH error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}

async function handleDelete(req, res, tableId) {
  try {
    // Verify staff authentication
    const authResult = await verifyStaffAuth(req, res);
    if (authResult.error) {
      return res.status(authResult.error.status).json({
        success: false,
        error: { code: authResult.error.code, message: authResult.error.message }
      });
    }

    // Verify table exists and is not in use
    const { data: table, error: fetchError } = await supabase
      .from('captain_tables')
      .select('id, status, current_game_id')
      .eq('id', tableId)
      .single();

    if (fetchError || !table) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Table not found' }
      });
    }

    if (table.current_game_id || table.status === 'in_use') {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Cannot delete table while game is running' }
      });
    }

    const { error: deleteError } = await supabase
      .from('captain_tables')
      .delete()
      .eq('id', tableId);

    if (deleteError) {
      console.error('Captain table DELETE error:', deleteError);
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to delete table' }
      });
    }

    return res.status(200).json({
      success: true,
      data: { message: 'Table deleted successfully' }
    });
  } catch (error) {
    console.error('Captain table DELETE error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}
