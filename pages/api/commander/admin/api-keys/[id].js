import { createClient } from '../../../../../src/lib/supabaseServerClient';
import { guardManager } from '../../../../../src/lib/commander/auth';
import { applyRateLimit, LIMITS } from '../../../../../src/lib/apiRateLimit';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  } else {
    if (!applyRateLimit(req, res, LIMITS.read)) return;
  }

  try {
  const _g = await guardManager(req, res); if (!_g) return;
  const { id } = req.query;

  if (req.method === 'DELETE') {
    const { error } = await supabase.from('commander_api_keys').update({ is_active: false }).eq('id', id);
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true });
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('[pages/api/commander/admin/api-keys/[id].js]', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
