/**
 * Activity Log API
 * GET  /api/commander/activity - List recent activity events
 * POST /api/commander/activity - Log a new activity event
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { guardWriteStaff } from '../../../src/lib/commander/auth';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

  // Auth guard: require staff auth for write operations
  const _authResult = await guardWriteStaff(req, res);
  if (!_authResult) return;

  try {
    if (req.method === 'GET') {
      const { venue_id, event_type, limit: lim } = req.query;
      let query = supabase.from('commander_activity_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(Math.min(parseInt(lim) || 50, 500));

      if (venue_id) query = query.eq('venue_id', venue_id);
      if (event_type) query = query.eq('event_type', event_type);

      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json({ success: true, data });
    }

    if (req.method === 'POST') {
      const { venue_id, event_type, message, detail, actor_id, actor_name, member_id, table_number, metadata } = req.body;
      if (!event_type || !message) {
        return res.status(400).json({ success: false, error: 'event_type and message required' });
      }

      const { data, error } = await supabase.from('commander_activity_log').insert({
        venue_id: venue_id || '00000000-0000-0000-0000-000000000000',
        event_type,
        message,
        detail: detail || '',
        actor_id,
        actor_name,
        member_id,
        table_number,
        metadata: metadata || {}
      }).select().single();

      if (error) throw error;
      return res.status(201).json({ success: true, data });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('Activity log error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
