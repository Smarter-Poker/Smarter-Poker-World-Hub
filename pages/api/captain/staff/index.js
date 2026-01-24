/**
 * Captain Staff API - GET/POST /api/captain/staff
 * List or add staff members
 * Reference: API_REFERENCE.md - Staff Management section
 */
import { createClient } from '@supabase/supabase-js';

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

    // TODO: Add manager authentication check (Step 1.3)

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
      .eq('is_active', true)
      .order('role', { ascending: true });

    if (error) {
      console.error('Captain staff list error:', error);
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
    console.error('Captain staff GET error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}

async function handlePost(req, res) {
  try {
    // TODO: Add manager authentication check (Step 1.3)

    const {
      venue_id,
      user_id,
      role,
      permissions = {},
      pin_code
    } = req.body;

    // Validation
    if (!venue_id || !user_id || !role) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'venue_id, user_id, and role are required'
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

    // Verify user exists
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

    // Check if already staff at this venue
    const { data: existing } = await supabase
      .from('captain_staff')
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

    // Create staff record
    const { data: staff, error: insertError } = await supabase
      .from('captain_staff')
      .insert({
        venue_id,
        user_id,
        role,
        permissions,
        pin_code: pin_code || null,
        is_active: true
      })
      .select()
      .single();

    if (insertError) {
      console.error('Captain staff insert error:', insertError);
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
    console.error('Captain staff POST error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}
