import { createClient } from '../../../../src/lib/supabaseServerClient';
import { guardManager } from '../../../../src/lib/commander/auth';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  try {
  const _g = await guardManager(req, res); if (!_g) return;

  if (req.method === 'GET') {
    const { status } = req.query;
    let query = supabase.from('commander_leads').select('*').order('created_at', { ascending: false });
    if (status && status !== 'all') query = query.eq('status', status);
    const { data, error } = await query;
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true, data: { leads: data } });
  }

  if (req.method === 'PATCH') {
    const { id, status, notes } = req.body;
    if (!id) return res.status(400).json({ success: false, error: 'id required' });
    const updates = {};
    if (status) updates.status = status;
    if (notes !== undefined) updates.notes = notes;
    const { data, error } = await supabase.from('commander_leads').update(updates).eq('id', id).select().maybeSingle();
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true, data: { lead: data } });
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('[pages/api/commander/admin/leads.js]', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
