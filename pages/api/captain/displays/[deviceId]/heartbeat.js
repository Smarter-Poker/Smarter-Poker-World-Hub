/**
 * Display Heartbeat API
 * POST /api/captain/displays/:deviceId/heartbeat
 * Updates display online status and returns any config changes
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Only POST allowed' }
    });
  }

  const { deviceId } = req.query;

  try {
    // Update heartbeat
    const { data: display, error } = await supabase
      .from('captain_table_displays')
      .update({
        is_online: true,
        last_heartbeat: new Date().toISOString()
      })
      .eq('device_id', deviceId)
      .select('id, display_mode, rotation_screens, rotation_interval, config, updated_at')
      .single();

    if (error || !display) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Display not registered' }
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        display_id: display.id,
        config: {
          display_mode: display.display_mode,
          rotation_screens: display.rotation_screens,
          rotation_interval: display.rotation_interval,
          custom: display.config
        },
        last_config_update: display.updated_at
      }
    });
  } catch (error) {
    console.error('Heartbeat error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Heartbeat failed' }
    });
  }
}
