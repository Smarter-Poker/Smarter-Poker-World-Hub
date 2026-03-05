/**
 * Floor Calls API
 * POST /api/commander/floor-calls - Create a new floor call
 * GET  /api/commander/floor-calls - List floor calls (with filters)
 * PUT  /api/commander/floor-calls - Acknowledge/resolve a floor call
 */
import { createClient } from '@supabase/supabase-js';
import { guardWriteStaff } from '../../../src/lib/commander/auth';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const VALID_REASONS = [
  'dispute', 'chip_fill', 'buyin', 'player_issue',
  'security', 'maintenance', 'dealer_relief', 'floor_assistance', 'other'
];

const VALID_PRIORITIES = ['urgent', 'high', 'normal', 'low'];
const VALID_STATUSES = ['pending', 'acknowledged', 'en_route', 'resolved', 'cancelled'];

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

  // Auth guard: require staff auth for all operations
  const staffResult = await guardWriteStaff(req, res);
  if (!staffResult) return;

  try {
    // GET - List floor calls with filters
    if (req.method === 'GET') {
      const { venue_id, status, reason, priority, responded_by, limit = '50' } = req.query;

      let query = supabase
        .from('commander_floor_calls')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(parseInt(limit));

      if (venue_id) query = query.eq('venue_id', venue_id);

      if (status) {
        // Support comma-separated statuses: status=pending,acknowledged
        const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
        if (statuses.length === 1) {
          query = query.eq('status', statuses[0]);
        } else if (statuses.length > 1) {
          query = query.in('status', statuses);
        }
      } else {
        query = query.in('status', ['pending', 'acknowledged', 'en_route']);
      }

      if (reason) query = query.eq('reason', reason);
      if (priority) query = query.eq('priority', priority);
      if (responded_by) query = query.eq('responded_by', responded_by);

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

      const safeReason = VALID_REASONS.includes(reason) ? reason : 'other';
      const safePriority = VALID_PRIORITIES.includes(priority) ? priority : 'normal';

      const { data, error } = await supabase.from('commander_floor_calls').insert({
        venue_id: venue_id || null,
        table_number,
        reason: safeReason,
        description: description || '',
        priority: safePriority,
        called_by: called_by || 'staff',
        status: 'pending'
      }).select().single();

      if (error) throw error;

      // Also log to activity feed (non-blocking)
      await supabase.from('commander_activity_log').insert({
        venue_id: venue_id || null,
        event_type: safePriority === 'urgent' ? 'incident' : 'floor_call',
        message: `Floor call at Table ${table_number}: ${safeReason.replace(/_/g, ' ')}`,
        detail: description || '',
        table_number
      }).catch(() => { });

      return res.status(201).json({ success: true, data });
    }

    // PUT - Acknowledge, en_route, resolve, or cancel
    if (req.method === 'PUT') {
      const { id, status, responded_by, resolution } = req.body;
      if (!id || !status) {
        return res.status(400).json({ success: false, error: 'id and status required' });
      }
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({ success: false, error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
      }

      // Fetch existing call for response time computation
      const { data: existing } = await supabase
        .from('commander_floor_calls')
        .select('created_at, responded_at')
        .eq('id', id)
        .single();

      const now = new Date().toISOString();
      const updates = { status };

      if (status === 'acknowledged' || status === 'en_route') {
        if (responded_by) updates.responded_by = responded_by;
        if (!existing?.responded_at) {
          updates.responded_at = now;
        }
      }

      if (status === 'resolved') {
        updates.resolution = resolution || '';
        updates.resolved_at = now;
        if (!existing?.responded_at) {
          updates.responded_at = now;
        }
        // Compute response time (seconds from creation to resolution)
        if (existing?.created_at) {
          updates.response_time_seconds = Math.round(
            (new Date(now) - new Date(existing.created_at)) / 1000
          );
        }
      }

      if (status === 'cancelled') {
        updates.resolved_at = now;
        updates.resolution = resolution || 'Cancelled';
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
