/**
 * Captain Service Request API - GET/PATCH /api/captain/services/:id
 * Get or update a service request
 * Reference: Phase 2 - Service Requests
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const VALID_STATUSES = ['pending', 'acknowledged', 'in_progress', 'completed', 'cancelled'];

export default async function handler(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Request ID required' }
    });
  }

  switch (req.method) {
    case 'GET':
      return handleGet(req, res, id);
    case 'PATCH':
      return handlePatch(req, res, id);
    default:
      return res.status(405).json({
        success: false,
        error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
      });
  }
}

async function handleGet(req, res, requestId) {
  try {
    const { data: request, error } = await supabase
      .from('captain_service_requests')
      .select(`
        *,
        captain_games (
          id,
          game_type,
          stakes,
          captain_tables (
            table_number,
            table_name
          )
        ),
        captain_seats (
          seat_number
        ),
        captain_staff (
          id,
          role,
          profiles (
            display_name
          )
        )
      `)
      .eq('id', requestId)
      .single();

    if (error || !request) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Service request not found' }
      });
    }

    return res.status(200).json({
      success: true,
      data: { request }
    });
  } catch (error) {
    console.error('Captain service GET error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}

async function handlePatch(req, res, requestId) {
  try {
    // Verify staff authentication
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

    const { data: staff, error: staffError } = await supabase
      .from('captain_staff')
      .select('id, venue_id, role, is_active')
      .eq('id', sessionData.id)
      .eq('is_active', true)
      .single();

    if (staffError || !staff) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_STAFF', message: 'Staff member not found or inactive' }
      });
    }

    const { status, assigned_to, notes } = req.body;

    // Get current request
    const { data: request, error: fetchError } = await supabase
      .from('captain_service_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (fetchError || !request) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Service request not found' }
      });
    }

    const updates = {};

    if (status !== undefined) {
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: `Invalid status. Must be: ${VALID_STATUSES.join(', ')}` }
        });
      }
      updates.status = status;

      // Set timestamps based on status
      if (status === 'acknowledged' && !request.acknowledged_at) {
        updates.acknowledged_at = new Date().toISOString();
      }
      if (status === 'completed' && !request.completed_at) {
        updates.completed_at = new Date().toISOString();
      }
    }

    if (assigned_to !== undefined) updates.assigned_to = assigned_to;
    if (notes !== undefined) updates.notes = notes;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'No valid fields to update' }
      });
    }

    const { data: updated, error: updateError } = await supabase
      .from('captain_service_requests')
      .update(updates)
      .eq('id', requestId)
      .select()
      .single();

    if (updateError) {
      console.error('Captain service PATCH error:', updateError);
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to update service request' }
      });
    }

    return res.status(200).json({
      success: true,
      data: { request: updated }
    });
  } catch (error) {
    console.error('Captain service PATCH error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}
