/**
 * Single Staff API - PATCH/DELETE /api/commander/staff/[id]
 * Update or deactivate a staff member
 * Reference: API_REFERENCE.md - Staff Management section
 */
import { createClient } from '@supabase/supabase-js';
import { verifyManagerSession } from '../../../../src/lib/commander/auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const VALID_ROLES = ['owner', 'manager', 'floor', 'brush', 'dealer'];

export default async function handler(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Staff ID required' }
    });
  }

  switch (req.method) {
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

async function handlePatch(req, res, id) {
  try {
    // Fetch the target staff member to get venue_id
    const { data: target, error: fetchError } = await supabase
      .from('commander_staff')
      .select('id, venue_id, role')
      .eq('id', id)
      .single();

    if (fetchError || !target) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Staff member not found' }
      });
    }

    // Verify requesting user is a manager at the same venue
    const authResult = await verifyManagerSession(req, target.venue_id);
    if (authResult.error) {
      return res.status(authResult.error.status).json({
        success: false,
        error: { code: authResult.error.code, message: authResult.error.message }
      });
    }

    // Prevent demoting yourself
    if (authResult.staff.id === id && req.body.role && req.body.role !== authResult.staff.role) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Cannot change your own role' }
      });
    }

    const { role, permissions, pin_code, is_active } = req.body;

    // Validate role if provided
    if (role && !VALID_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` }
      });
    }

    const updates = {};
    if (role !== undefined) updates.role = role;
    if (permissions !== undefined) updates.permissions = permissions;
    if (pin_code !== undefined) updates.pin_code = pin_code;
    if (is_active !== undefined) updates.is_active = is_active;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'No valid fields to update' }
      });
    }

    const { data: staff, error: updateError } = await supabase
      .from('commander_staff')
      .update(updates)
      .eq('id', id)
      .select(`
        *,
        profiles (
          id,
          display_name,
          avatar_url
        )
      `)
      .single();

    if (updateError) {
      console.error('Commander staff update error:', updateError);
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to update staff member' }
      });
    }

    return res.status(200).json({
      success: true,
      data: { staff }
    });
  } catch (error) {
    console.error('Commander staff PATCH error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}

async function handleDelete(req, res, id) {
  try {
    // Fetch the target staff member to get venue_id
    const { data: target, error: fetchError } = await supabase
      .from('commander_staff')
      .select('id, venue_id, role')
      .eq('id', id)
      .single();

    if (fetchError || !target) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Staff member not found' }
      });
    }

    // Verify requesting user is a manager at the same venue
    const authResult = await verifyManagerSession(req, target.venue_id);
    if (authResult.error) {
      return res.status(authResult.error.status).json({
        success: false,
        error: { code: authResult.error.code, message: authResult.error.message }
      });
    }

    // Prevent removing yourself
    if (authResult.staff.id === id) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Cannot remove yourself' }
      });
    }

    // Soft delete - deactivate rather than hard delete
    const { data: staff, error: deleteError } = await supabase
      .from('commander_staff')
      .update({ is_active: false })
      .eq('id', id)
      .select()
      .single();

    if (deleteError) {
      console.error('Commander staff delete error:', deleteError);
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to remove staff member' }
      });
    }

    return res.status(200).json({
      success: true,
      data: { staff, message: 'Staff member deactivated' }
    });
  } catch (error) {
    console.error('Commander staff DELETE error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}
