/**
 * Single Incident API - GET/PATCH /api/commander/incidents/[id]
 * View or update/resolve an incident
 * Reference: ENHANCEMENTS.md - Incident Reporting System
 */
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '../../../../src/lib/commander/auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Incident ID required' }
    });
  }

  if (req.method === 'GET') {
    return handleGet(req, res, id);
  } else if (req.method === 'PATCH') {
    return handlePatch(req, res, id);
  }

  return res.status(405).json({
    success: false,
    error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
  });
}

async function handleGet(req, res, id) {
  try {
    const { data: incident, error } = await supabase
      .from('commander_incidents')
      .select(`
        *,
        reported_by_staff:commander_staff!reported_by (id, name, role),
        resolved_by_staff:commander_staff!resolved_by (id, name, role),
        involved_player:profiles!player_id (id, display_name, avatar_url)
      `)
      .eq('id', id)
      .single();

    if (error || !incident) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Incident not found' }
      });
    }

    // Require staff auth at the incident's venue
    const staff = await requireStaff(req, res, incident.venue_id);
    if (!staff) return;

    return res.status(200).json({
      success: true,
      data: { incident }
    });
  } catch (error) {
    console.error('Get incident error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to fetch incident' }
    });
  }
}

async function handlePatch(req, res, id) {
  try {
    // Fetch existing incident to get venue_id
    const { data: existing, error: fetchError } = await supabase
      .from('commander_incidents')
      .select('id, venue_id, incident_status')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Incident not found' }
      });
    }

    // Require staff auth at the incident's venue
    const staff = await requireStaff(req, res, existing.venue_id);
    if (!staff) return;

    const {
      incident_type,
      severity,
      description,
      action_taken,
      incident_status,
      resolution,
      player_id,
      table_id
    } = req.body;

    const updates = {};
    if (incident_type !== undefined) updates.incident_type = incident_type;
    if (severity !== undefined) updates.severity = severity;
    if (description !== undefined) updates.description = description;
    if (action_taken !== undefined) updates.action_taken = action_taken;
    if (player_id !== undefined) updates.player_id = player_id;
    if (table_id !== undefined) updates.table_id = table_id;

    // Handle resolution/status change
    if (incident_status !== undefined) {
      updates.incident_status = incident_status;
      if (incident_status === 'resolved') {
        updates.resolved_by = staff.id;
        updates.resolved_at = new Date().toISOString();
      }
    }
    if (resolution !== undefined) updates.resolution = resolution;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'No valid fields to update' }
      });
    }

    const { data: incident, error: updateError } = await supabase
      .from('commander_incidents')
      .update(updates)
      .eq('id', id)
      .select(`
        *,
        reported_by_staff:commander_staff!reported_by (id, name, role),
        resolved_by_staff:commander_staff!resolved_by (id, name, role),
        involved_player:profiles!player_id (id, display_name, avatar_url)
      `)
      .single();

    if (updateError) {
      console.error('Update incident error:', updateError);
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to update incident' }
      });
    }

    return res.status(200).json({
      success: true,
      data: { incident }
    });
  } catch (error) {
    console.error('Patch incident error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to update incident' }
    });
  }
}
