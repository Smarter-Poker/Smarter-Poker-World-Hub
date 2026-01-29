/**
 * Start Stream API
 * POST /api/commander/streaming/:tableId/start
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

  const { tableId } = req.query;
  const { venue_id, platforms = ['youtube'], delay_minutes = 15, overlay_config } = req.body;

  if (!venue_id) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_FIELDS', message: 'venue_id required' }
    });
  }

  try {
    // Check if stream already exists for this table
    const { data: existing } = await supabase
      .from('commander_streams')
      .select('id')
      .eq('table_id', tableId)
      .eq('status', 'live')
      .single();

    if (existing) {
      return res.status(400).json({
        success: false,
        error: { code: 'ALREADY_STREAMING', message: 'Table is already streaming' }
      });
    }

    // Create or update stream record
    const { data: stream, error } = await supabase
      .from('commander_streams')
      .upsert({
        venue_id,
        table_id: tableId,
        status: 'live',
        platforms,
        delay_minutes,
        overlay_config: overlay_config || {},
        started_at: new Date().toISOString(),
        viewer_count: 0
      }, {
        onConflict: 'table_id'
      })
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({
      success: true,
      data: { stream }
    });
  } catch (error) {
    console.error('Start stream error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to start stream' }
    });
  }
}
