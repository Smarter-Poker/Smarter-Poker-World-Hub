/**
 * Single Staff API - PATCH/DELETE /api/commander/staff/[id]
 * Update or deactivate a staff member
 * Reference: API_REFERENCE.md - Staff Management section
 */
import { createClient } from '@supabase/supabase-js';
import { verifyManagerSession } from '../../../../src/lib/commander/auth';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const VALID_ROLES = ['owner', 'manager', 'dualrate', 'floor', 'cashier', 'brush', 'dealer', 'security'];

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

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

    const { role, permissions, pin_code, is_active, display_name, email, phone, id_type, id_number, id_state, id_expiry, date_of_birth } = req.body;

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
    if (display_name !== undefined) updates.display_name = display_name;
    if (email !== undefined) updates.email = email;
    if (phone !== undefined) updates.phone = phone;
    if (id_type !== undefined) updates.id_type = id_type;
    if (id_number !== undefined) updates.id_number = id_number;
    if (id_state !== undefined) updates.id_state = id_state;
    if (id_expiry !== undefined) updates.id_expiry = id_expiry;
    if (date_of_birth !== undefined) updates.date_of_birth = date_of_birth;
    if (pin_code !== undefined) {
      // Check for duplicate PIN at this venue (exclude self)
      if (pin_code) {
        const { data: existingPin } = await supabase
          .from('commander_staff')
          .select('id')
          .eq('venue_id', target.venue_id)
          .eq('pin_code', pin_code)
          .eq('is_active', true)
          .neq('id', id)
          .limit(1);
        if (existingPin?.length > 0) {
          return res.status(400).json({
            success: false,
            error: { code: 'DUPLICATE_PIN', message: 'This PIN is already in use by another employee at this venue' }
          });
        }
      }
      updates.pin_code = pin_code;
    }
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
