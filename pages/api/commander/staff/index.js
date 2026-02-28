/**
 * Commander Staff API - GET/POST /api/commander/staff
 * List or add staff members
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
  switch (req.method) {
    case 'GET':
      return handleGet(req, res);
    case 'POST':
      return handlePost(req, res);
    default:
      return res.status(405).json({
        success: false,
        error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
      });
  }
}

async function handleGet(req, res) {
  try {
    const { venue_id } = req.query;

    if (!venue_id) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'venue_id is required' }
      });
    }

    // Verify manager authentication
    const authResult = await verifyManagerSession(req, venue_id);
    if (authResult.error) {
      return res.status(authResult.error.status).json({
        success: false,
        error: { code: authResult.error.code, message: authResult.error.message }
      });
    }

    const { data: staff, error } = await supabase
      .from('commander_staff')
      .select(`
        *,
        profiles (
          id,
          display_name,
          avatar_url
        )
      `)
      .eq('venue_id', venue_id)
      .eq('is_active', true)
      .order('role', { ascending: true });

    if (error) {
      console.error('Commander staff list error:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to fetch staff' }
      });
    }

    return res.status(200).json({
      success: true,
      data: { staff: staff || [] }
    });
  } catch (error) {
    console.error('Commander staff GET error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}

async function handlePost(req, res) {
  try {
    const { venue_id: bodyVenueId } = req.body;

    // Verify manager authentication
    const authResult = await verifyManagerSession(req, bodyVenueId);
    if (authResult.error) {
      return res.status(authResult.error.status).json({
        success: false,
        error: { code: authResult.error.code, message: authResult.error.message }
      });
    }

    const {
      venue_id,
      user_id,
      display_name,
      email,
      phone,
      role,
      permissions = {},
      pin_code
    } = req.body;

    // Validation — require venue_id, role, and either user_id or display_name
    if (!venue_id || !role) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'venue_id and role are required'
        }
      });
    }

    if (!user_id && !display_name) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Either user_id or display_name is required'
        }
      });
    }

    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`
        }
      });
    }

    // Verify venue exists
    const { data: venue, error: venueError } = await supabase
      .from('poker_venues')
      .select('id')
      .eq('id', venue_id)
      .single();

    if (venueError || !venue) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Venue not found' }
      });
    }

    // If user_id provided, verify user exists and check for duplicates
    if (user_id) {
      const { data: user, error: userError } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user_id)
        .single();

      if (userError || !user) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'User not found' }
        });
      }

      const { data: existing } = await supabase
        .from('commander_staff')
        .select('id')
        .eq('venue_id', venue_id)
        .eq('user_id', user_id)
        .single();

      if (existing) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'User is already staff at this venue' }
        });
      }
    }

    // Create staff record — user_id is optional for name-only employees
    // Check for duplicate PIN at this venue
    if (pin_code) {
      const { data: existingPin } = await supabase
        .from('commander_staff')
        .select('id')
        .eq('venue_id', venue_id)
        .eq('pin_code', pin_code)
        .eq('is_active', true)
        .limit(1);
      if (existingPin?.length > 0) {
        return res.status(400).json({
          success: false,
          error: { code: 'DUPLICATE_PIN', message: 'This PIN is already in use by another employee at this venue' }
        });
      }
    }

    const staffRecord = {
      venue_id,
      role,
      permissions,
      pin_code: pin_code || null,
      is_active: true,
      display_name: display_name || null,
      email: email || null,
      phone: phone || null
    };
    if (user_id) {
      staffRecord.user_id = user_id;
    }

    const { data: staff, error: insertError } = await supabase
      .from('commander_staff')
      .insert(staffRecord)
      .select()
      .single();

    if (insertError) {
      console.error('Commander staff insert error:', insertError);
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to add staff member' }
      });
    }

    return res.status(201).json({
      success: true,
      data: { staff }
    });
  } catch (error) {
    console.error('Commander staff POST error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}
