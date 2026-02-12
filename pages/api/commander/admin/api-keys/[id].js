import { createClient } from '@supabase/supabase-js';
import { guardManager } from '../../../../../src/lib/commander/auth';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  const _g = await guardManager(req, res); if (!_g) return;
  const { id } = req.query;

  if (req.method === 'DELETE') {
    const { error } = await supabase.from('commander_api_keys').update({ is_active: false }).eq('id', id);
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true });
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
