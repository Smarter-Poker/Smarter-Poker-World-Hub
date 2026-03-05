import { createClient } from '@supabase/supabase-js';
import { guardUser } from '../../../../../src/lib/commander/auth';
import { applyRateLimit, LIMITS } from '../../../../../src/lib/apiRateLimit';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

  if (req.method !== 'GET') { const _u = await guardUser(req, res); if (!_u) return; }
  const { id } = req.query;

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('commander_home_rsvps').select('*').eq('id', id).single();
    if (error) return res.status(404).json({ success: false, error: 'RSVP not found' });
    return res.json({ success: true, data: { rsvp: data } });
  }

  if (req.method === 'PATCH') {
    const { status } = req.body;
    const { data, error } = await supabase.from('commander_home_rsvps').update({ status }).eq('id', id).select().single();
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true, data: { rsvp: data } });
  }

  if (req.method === 'DELETE') {
    const { error } = await supabase.from('commander_home_rsvps').delete().eq('id', id);
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true });
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
