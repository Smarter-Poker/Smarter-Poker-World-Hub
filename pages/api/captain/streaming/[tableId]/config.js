/**
 * Streaming Config API
 * PATCH /api/captain/streaming/[tableId]/config - Update stream configuration
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
    });
  }

  const { tableId } = req.query;
  const { venue_id, platforms, delay_minutes, overlay_config } = req.body;

  if (!venue_id) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_FIELDS', message: 'venue_id required' }
    });
  }

  try {
    // Check if table exists
    const { data: table, error: tableError } = await supabase
      .from('captain_tables')
      .select('id, venue_id')
      .eq('id', tableId)
      .eq('venue_id', parseInt(venue_id))
      .single();

    if (tableError || !table) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Table not found' }
      });
    }

    // Update or insert stream config
    const { data: existingStream } = await supabase
      .from('captain_streams')
      .select('id')
      .eq('table_id', tableId)
      .single();

    let result;
    if (existingStream) {
      // Update existing
      const { data, error } = await supabase
        .from('captain_streams')
        .update({
          platforms: platforms || [],
          delay_minutes: delay_minutes || 15,
          overlay_config: overlay_config || {},
          updated_at: new Date().toISOString()
        })
        .eq('table_id', tableId)
        .select()
        .single();

      if (error) throw error;
      result = data;
    } else {
      // Insert new
      const { data, error } = await supabase
        .from('captain_streams')
        .insert({
          table_id: tableId,
          venue_id: parseInt(venue_id),
          platforms: platforms || [],
          delay_minutes: delay_minutes || 15,
          overlay_config: overlay_config || {},
          status: 'offline'
        })
        .select()
        .single();

      if (error) throw error;
      result = data;
    }

    return res.status(200).json({
      success: true,
      data: { stream: result }
    });
  } catch (error) {
    console.error('Update stream config error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to update stream config' }
    });
  }
}
