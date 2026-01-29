/**
 * Club Commander Staff at Venue API - GET /api/club-commander/staff/venue/:venueId
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
    // TODO: Add manager authentication check (Step 1.3)

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
      console.error('Club Commander venue staff query error:', error);
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
    console.error('Club Commander venue staff API error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}
