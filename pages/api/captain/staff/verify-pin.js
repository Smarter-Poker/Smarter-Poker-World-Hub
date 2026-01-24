/**
 * Captain Verify PIN API - POST /api/captain/staff/verify-pin
 * Verify staff PIN for terminal login
 * Reference: API_REFERENCE.md - Staff Management section
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Default permissions by role
const DEFAULT_PERMISSIONS = {
  owner: {
    manage_staff: true,
    manage_games: true,
    manage_waitlist: true,
    manage_settings: true,
    view_analytics: true,
    send_notifications: true
  },
  manager: {
    manage_staff: true,
    manage_games: true,
    manage_waitlist: true,
    manage_settings: true,
    view_analytics: true,
    send_notifications: true
  },
  floor: {
    manage_staff: false,
    manage_games: true,
    manage_waitlist: true,
    manage_settings: false,
    view_analytics: false,
    send_notifications: true
  },
  brush: {
    manage_staff: false,
    manage_games: false,
    manage_waitlist: true,
    manage_settings: false,
    view_analytics: false,
    send_notifications: true
  },
  dealer: {
    manage_staff: false,
    manage_games: false,
    manage_waitlist: false,
    manage_settings: false,
    view_analytics: false,
    send_notifications: false
  }
};

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
      .from('captain_staff')
      .select(`
        *,
        profiles (
          id,
          display_name,
          avatar_url
        )
      `)
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
          display_name: staff.profiles?.display_name || 'Staff',
          avatar_url: staff.profiles?.avatar_url
        },
        permissions
      }
    });
  } catch (error) {
    console.error('Captain verify PIN error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}
