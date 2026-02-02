/**
 * Incidents API
 * GET /api/commander/incidents - List incidents
 * POST /api/commander/incidents - Report incident
 */
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '../../../../src/lib/commander/auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return handleList(req, res);
  } else if (req.method === 'POST') {
    return handleCreate(req, res);
  }

  return res.status(405).json({
    success: false,
    error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
  });
}

async function handleList(req, res) {
  const { venue_id, status, severity, date_from, date_to, limit = 50 } = req.query;

  if (!venue_id) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_FIELDS', message: 'venue_id required' }
    });
  }

  // Require staff auth to view incidents
  const staff = await requireStaff(req, res, venue_id);
  if (!staff) return;

  try {
    let query = supabase
      .from('commander_incidents')
      .select(`
        *,
        reported_by_staff:commander_staff!reported_by (id, name, role),
        resolved_by_staff:commander_staff!resolved_by (id, name, role),
        involved_player:profiles!player_id (id, display_name, avatar_url)
      `)
      .eq('venue_id', venue_id)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (status) query = query.eq('incident_status', status);
    if (severity) query = query.eq('severity', severity);
    if (date_from) query = query.gte('created_at', date_from);
    if (date_to) query = query.lte('created_at', date_to);

    const { data: incidents, error } = await query;

    if (error) throw error;

    return res.status(200).json({
      success: true,
      data: { incidents: incidents || [] }
    });
  } catch (error) {
    console.error('List incidents error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to fetch incidents' }
    });
  }
}

async function handleCreate(req, res) {
  const {
    venue_id,
    player_id,
    table_id,
    incident_type,
    severity = 'medium',
    description,
    action_taken
  } = req.body;

  if (!venue_id || !incident_type || !description) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_FIELDS', message: 'venue_id, incident_type, and description required' }
    });
  }

  // Require staff auth to create incidents
  const staff = await requireStaff(req, res, venue_id);
  if (!staff) return;

  // Verify venue exists
  const { data: venue } = await supabase
    .from('poker_venues')
    .select('id')
    .eq('id', venue_id)
    .single();

  if (!venue) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Venue not found' }
    });
  }

  try {
    const { data: incident, error } = await supabase
      .from('commander_incidents')
      .insert({
        venue_id,
        reported_by: staff.id,
        player_id,
        table_id,
        incident_type,
        severity,
        description,
        action_taken,
        incident_status: 'open'
      })
      .select()
      .single();

    if (error) throw error;

    return res.status(201).json({
      success: true,
      data: { incident }
    });
  } catch (error) {
    console.error('Create incident error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to create incident' }
    });
  }
}
