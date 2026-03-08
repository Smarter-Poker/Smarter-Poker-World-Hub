import { createClient } from '../../../../src/lib/supabaseServerClient';
import { guardManager } from '../../../../src/lib/commander/auth';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (!applyRateLimit(req, res, LIMITS.read)) return;

  try {
  const _g = await guardManager(req, res); if (!_g) return;

  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const { summary } = req.query;
  const select = summary === 'true' ? 'id, name, city, state, status, created_at' : '*';
  const { data, error } = await supabase.from('venues').select(select).order('name');
  if (error) return res.status(500).json({ success: false, error: error.message });
  return res.json({ success: true, data: { venues: data } });
  } catch (err) {
    console.error('[pages/api/commander/admin/venues.js]', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
