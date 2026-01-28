/**
 * Display Config API
 * GET /api/captain/displays/:deviceId/config - Get display config
 * PATCH /api/captain/displays/:deviceId/config - Update display config
 * DELETE /api/captain/displays/:deviceId/config - Remove display
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { deviceId } = req.query;

  if (req.method === 'GET') {
    return handleGet(req, res, deviceId);
  } else if (req.method === 'PATCH') {
    return handlePatch(req, res, deviceId);
  } else if (req.method === 'DELETE') {
    return handleDelete(req, res, deviceId);
  }

  return res.status(405).json({
    success: false,
    error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
  });
}

async function handleGet(req, res, deviceId) {
  try {
    const { data: display, error } = await supabase
      .from('captain_table_displays')
      .select(`
        *,
        captain_tables (
          id,
          table_number,
          table_name
        )
      `)
      .eq('device_id', deviceId)
      .single();

    if (error || !display) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Display not found' }
      });
    }

    return res.status(200).json({
      success: true,
      data: { display }
    });
  } catch (error) {
    console.error('Get config error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to get config' }
    });
  }
}

async function handlePatch(req, res, deviceId) {
  // Verify staff authentication
  const staffSession = req.headers['x-staff-session'];
  if (!staffSession) {
    return res.status(401).json({
      success: false,
      error: { code: 'AUTH_REQUIRED', message: 'Staff authentication required' }
    });
  }

  const {
    table_id,
    device_name,
    device_type,
    display_mode,
    rotation_screens,
    rotation_interval,
    config
  } = req.body;

  try {
    const updates = { updated_at: new Date().toISOString() };

    if (table_id !== undefined) updates.table_id = table_id;
    if (device_name !== undefined) updates.device_name = device_name;
    if (device_type !== undefined) updates.device_type = device_type;
    if (display_mode !== undefined) updates.display_mode = display_mode;
    if (rotation_screens !== undefined) updates.rotation_screens = rotation_screens;
    if (rotation_interval !== undefined) updates.rotation_interval = rotation_interval;
    if (config !== undefined) updates.config = config;

    const { data: display, error } = await supabase
      .from('captain_table_displays')
      .update(updates)
      .eq('device_id', deviceId)
      .select()
      .single();

    if (error || !display) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Display not found' }
      });
    }

    return res.status(200).json({
      success: true,
      data: { display }
    });
  } catch (error) {
    console.error('Update config error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to update config' }
    });
  }
}

async function handleDelete(req, res, deviceId) {
  // Verify staff authentication
  const staffSession = req.headers['x-staff-session'];
  if (!staffSession) {
    return res.status(401).json({
      success: false,
      error: { code: 'AUTH_REQUIRED', message: 'Staff authentication required' }
    });
  }

  try {
    const { error } = await supabase
      .from('captain_table_displays')
      .delete()
      .eq('device_id', deviceId);

    if (error) throw error;

    return res.status(200).json({
      success: true,
      data: { message: 'Display removed' }
    });
  } catch (error) {
    console.error('Delete display error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to remove display' }
    });
  }
}
