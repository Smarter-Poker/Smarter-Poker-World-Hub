/**
 * Floor Calls API
 * POST /api/commander/floor-calls - Create a new floor call
 * GET  /api/commander/floor-calls - List active floor calls
 * PUT  /api/commander/floor-calls - Acknowledge/resolve a floor call
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  try {
    // GET - List floor calls
    if (req.method === 'GET') {
      const { venue_id, status } = req.query;
      let query = supabase.from('commander_floor_calls').select('*').order('created_at', { ascending: false }).limit(50);
      if (venue_id) query = query.eq('venue_id', venue_id);
      if (status) query = query.eq('status', status);
      else query = query.in('status', ['pending', 'acknowledged', 'en_route']);

      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json({ success: true, data });
    }

    // POST - Create floor call
    if (req.method === 'POST') {
      const { venue_id, table_number, reason, description, priority, called_by } = req.body;
      if (!table_number || !reason) {
        return res.status(400).json({ success: false, error: 'table_number and reason required' });
      }

      const { data, error } = await supabase.from('commander_floor_calls').insert({
        venue_id: venue_id || '00000000-0000-0000-0000-000000000000',
        table_number,
        reason,
        description: description || '',
        priority: priority || 'normal',
        called_by: called_by || 'dealer',
        status: 'pending'
      }).select().single();

      if (error) throw error;

      // Also log to activity feed
      await supabase.from('commander_activity_log').insert({
        venue_id: venue_id || '00000000-0000-0000-0000-000000000000',
        event_type: priority === 'urgent' ? 'incident' : 'floor_call',
        message: `Floor call at Table ${table_number}: ${reason}`,
        detail: description,
        table_number
      }).catch(() => {});

      return res.status(201).json({ success: true, data });
    }

    // PUT - Acknowledge or resolve
    if (req.method === 'PUT') {
      const { id, status, responded_by, resolution } = req.body;
      if (!id || !status) {
        return res.status(400).json({ success: false, error: 'id and status required' });
      }

      const updates = { status };
      if (status === 'acknowledged' || status === 'en_route') {
        updates.responded_by = responded_by;
        updates.responded_at = new Date().toISOString();
      }
      if (status === 'resolved') {
        updates.resolution = resolution || '';
        if (!updates.responded_at) updates.responded_at = new Date().toISOString();
      }

      const { data, error } = await supabase.from('commander_floor_calls')
        .update(updates).eq('id', id).select().single();

      if (error) throw error;
      return res.status(200).json({ success: true, data });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Floor calls error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
