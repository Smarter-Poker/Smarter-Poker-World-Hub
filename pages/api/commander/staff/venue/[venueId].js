/**
 * Commander Staff at Venue API - GET /api/commander/staff/venue/:venueId
 * Get all staff at a specific venue
 * Reference: API_REFERENCE.md - Staff Management section
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
    });
  }

  const { venueId } = req.query;

  if (!venueId) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Venue ID required' }
    });
  }

  try {
    // Verify manager authentication
    const staffSession = req.headers['x-staff-session'];
    if (!staffSession) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_REQUIRED', message: 'Staff authentication required' }
      });
    }

    let sessionData;
    try {
      sessionData = JSON.parse(staffSession);
    } catch {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_SESSION', message: 'Invalid session format' }
      });
    }

    // Try to find the staff member: by staff record id first, then by user_id + venue
    let authStaff = null;
    if (sessionData.id) {
      const { data, error: err } = await supabase
        .from('commander_staff')
        .select('id, venue_id, role, is_active')
        .eq('id', sessionData.id)
        .eq('is_active', true)
        .single();
      if (!err && data) authStaff = data;
    }
    if (!authStaff && sessionData.user_id) {
      const { data, error: err } = await supabase
        .from('commander_staff')
        .select('id, venue_id, role, is_active')
        .eq('user_id', sessionData.user_id)
        .eq('venue_id', venueId)
        .eq('is_active', true)
        .limit(1);
      if (!err && data?.[0]) authStaff = data[0];
    }
    // Fallback: if session claims owner/manager role and has correct venue, allow access
    if (!authStaff && sessionData.role && ['owner', 'manager'].includes(sessionData.role) && String(sessionData.venue_id) === String(venueId)) {
      authStaff = { id: sessionData.id || sessionData.user_id, venue_id: parseInt(venueId), role: sessionData.role, is_active: true };
    }

    if (!authStaff) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_STAFF', message: 'Staff member not found or inactive' }
      });
    }

    // Verify staff belongs to this venue and has manager role
    if (String(authStaff.venue_id) !== String(venueId)) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Not authorized for this venue' }
      });
    }

    if (!['owner', 'manager'].includes(authStaff.role)) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Manager role required' }
      });
    }

    const { data: staff, error } = await supabase
      .from('commander_staff')
      .select(`
        id,
        role,
        permissions,
        is_active,
        display_name,
        pin_code,
        email,
        phone,
        hired_at,
        created_at,
        profiles (
          id,
          display_name,
          avatar_url
        )
      `)
      .eq('venue_id', venueId)
      .eq('is_active', true)
      .order('role', { ascending: true });

    if (error) {
      console.error('Commander venue staff query error:', error);
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
    console.error('Commander venue staff API error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}
