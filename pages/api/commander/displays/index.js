/**
 * Table Display Management API
 * GET /api/commander/displays - List displays for venue
 * POST /api/commander/displays - Register new display
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return handleGet(req, res);
  } else if (req.method === 'POST') {
    return handlePost(req, res);
  }

  return res.status(405).json({
    success: false,
    error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
  });
}

async function handleGet(req, res) {
  const { venue_id } = req.query;

  if (!venue_id) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_VENUE', message: 'venue_id required' }
    });
  }

  try {
    const { data: displays, error } = await supabase
      .from('commander_table_displays')
      .select(`
        *,
        commander_tables (
          id,
          table_number,
          table_name
        )
      `)
      .eq('venue_id', venue_id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return res.status(200).json({
      success: true,
      data: { displays }
    });
  } catch (error) {
    console.error('Get displays error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to fetch displays' }
    });
  }
}

async function handlePost(req, res) {
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
      error: { code: 'INVALID_SESSION', message: 'Invalid session' }
    });
  }

  const {
    venue_id,
    table_id,
    device_id,
    device_name,
    device_type = 'tablet',
    display_mode = 'rotation',
    rotation_screens = ['waitlist', 'promotions', 'high_hand'],
    rotation_interval = 30
  } = req.body;

  if (!venue_id || !device_id) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_FIELDS', message: 'venue_id and device_id required' }
    });
  }

  try {
    // Check if device already registered
    const { data: existing } = await supabase
      .from('commander_table_displays')
      .select('id')
      .eq('device_id', device_id)
      .single();

    if (existing) {
      // Update existing
      const { data: display, error } = await supabase
        .from('commander_table_displays')
        .update({
          venue_id,
          table_id,
          device_name,
          device_type,
          display_mode,
          rotation_screens,
          rotation_interval,
          is_online: true,
          last_heartbeat: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;

      return res.status(200).json({
        success: true,
        data: { display, updated: true }
      });
    }

    // Create new
    const { data: display, error } = await supabase
      .from('commander_table_displays')
      .insert({
        venue_id,
        table_id,
        device_id,
        device_name: device_name || `Display ${device_id.slice(-4)}`,
        device_type,
        display_mode,
        rotation_screens,
        rotation_interval,
        is_online: true,
        last_heartbeat: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    return res.status(201).json({
      success: true,
      data: { display, created: true }
    });
  } catch (error) {
    console.error('Register display error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to register display' }
    });
  }
}
