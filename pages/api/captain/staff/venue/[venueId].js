/**
 * Captain Staff at Venue API - GET /api/captain/staff/venue/:venueId
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

    const { data: authStaff, error: staffError } = await supabase
      .from('captain_staff')
      .select('id, venue_id, role, is_active')
      .eq('id', sessionData.id)
      .eq('is_active', true)
      .single();

    if (staffError || !authStaff) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_STAFF', message: 'Staff member not found or inactive' }
      });
    }

    // Verify staff belongs to this venue and has manager role
    if (authStaff.venue_id !== parseInt(venueId)) {
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
      .from('captain_staff')
      .select(`
        id,
        role,
        permissions,
        is_active,
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
      console.error('Captain venue staff query error:', error);
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
    console.error('Captain venue staff API error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}
