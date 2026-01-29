/**
 * Commander Verify PIN API - POST /api/commander/staff/verify-pin
 * Verify staff PIN for terminal login
 * Reference: API_REFERENCE.md - Staff Management section
 */
import { createClient } from '@supabase/supabase-js';
import { DEFAULT_PERMISSIONS } from '../../../../src/lib/commander/auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
    });
  }

  try {
    const { venue_id, pin_code } = req.body;

    // Validation
    if (!venue_id || !pin_code) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'venue_id and pin_code are required'
        }
      });
    }

    // Find staff member with this PIN at this venue
    const { data: staff, error } = await supabase
      .from('commander_staff')
      .select('*')
      .eq('venue_id', venue_id)
      .eq('pin_code', pin_code)
      .eq('is_active', true)
      .single();

    if (error || !staff) {
      return res.status(200).json({
        success: true,
        data: {
          valid: false,
          staff: null,
          permissions: null
        }
      });
    }

    // Merge custom permissions with default permissions for role
    const permissions = {
      ...DEFAULT_PERMISSIONS[staff.role],
      ...(staff.permissions || {})
    };

    return res.status(200).json({
      success: true,
      data: {
        valid: true,
        staff: {
          id: staff.id,
          role: staff.role,
          user_id: staff.user_id,
          display_name: staff.role.charAt(0).toUpperCase() + staff.role.slice(1)
        },
        permissions
      }
    });
  } catch (error) {
    console.error('Commander verify PIN error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}
