import { createClient } from '@supabase/supabase-js';
import { guardManager } from '../../../../src/lib/commander/auth';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  const _g = await guardManager(req, res); if (!_g) return;

  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const { venue_id, page = 1, limit = 50, action, staff_id } = req.query;
  if (!venue_id) return res.status(400).json({ success: false, error: 'venue_id required' });

  let query = supabase
    .from('commander_audit_logs')
    .select('*', { count: 'exact' })
    .eq('venue_id', venue_id)
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (action) query = query.eq('action', action);
  if (staff_id) query = query.eq('staff_id', staff_id);

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ success: false, error: error.message });

  return res.json({ success: true, data: { logs: data, total: count, page: Number(page), limit: Number(limit) } });
}
