/**
 * Stop Stream API
 * POST /api/captain/streaming/:tableId/stop
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

  try {
    const { data: stream, error } = await supabase
      .from('captain_streams')
      .update({
        status: 'offline',
        ended_at: new Date().toISOString()
      })
      .eq('table_id', tableId)
      .eq('status', 'live')
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'No active stream found' }
        });
      }
      throw error;
    }

    return res.status(200).json({
      success: true,
      data: { stream }
    });
  } catch (error) {
    console.error('Stop stream error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to stop stream' }
    });
  }
}
