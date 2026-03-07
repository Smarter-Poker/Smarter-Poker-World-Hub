import { createClient } from '../../../../../../src/lib/supabaseServerClient';
import { guardManager } from '../../../../../../src/lib/commander/auth';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  const _g = await guardManager(req, res); if (!_g) return;
  const { id } = req.query;

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('commander_venue_settings').select('*').eq('venue_id', id).single();
    if (error) return res.json({ success: true, data: { settings: {} } });
    return res.json({ success: true, data: { settings: data } });
  }

  if (req.method === 'PATCH') {
    const { data, error } = await supabase
      .from('commander_venue_settings')
      .upsert({ venue_id: id, ...req.body }, { onConflict: 'venue_id' })
      .select()
      .single();
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true, data: { settings: data } });
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
