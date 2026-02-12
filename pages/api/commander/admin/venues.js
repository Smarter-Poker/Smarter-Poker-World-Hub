import { createClient } from '@supabase/supabase-js';
import { guardManager } from '../../../../src/lib/commander/auth';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  const _g = await guardManager(req, res); if (!_g) return;

  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const { summary } = req.query;
  const select = summary === 'true' ? 'id, name, city, state, status, created_at' : '*';
  const { data, error } = await supabase.from('venues').select(select).order('name');
  if (error) return res.status(500).json({ success: false, error: error.message });
  return res.json({ success: true, data: { venues: data } });
}
