import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { setPrivateCommerceResponse } from '../../../src/lib/store/privateCommerceResponse';
import { getMarketplaceReadiness } from './readiness';

let client = null;
function getClient() {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Store operations database is not configured');
  client = createClient(url, key);
  return client;
}

async function requireOperator(req, res, supabase) {
  if (!req.headers?.authorization?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Authorization required' });
    return null;
  }
  const { user, error } = await getServerUserWithFallback(req, supabase);
  if (error || !user?.id) {
    res.status(401).json({ success: false, error: 'Invalid session' });
    return null;
  }
  const { data, error: profileError } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError || data?.is_admin !== true) {
    res.status(403).json({ success: false, error: 'Store operator access required' });
    return null;
  }
  return user;
}

export default async function handler(req, res) {
  setPrivateCommerceResponse(res);
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ success: false, error: 'GET only' });
  }
  if (!applyRateLimit(req, res, LIMITS.read)) return;
  try {
    const supabase = getClient();
    const operator = await requireOperator(req, res, supabase);
    if (!operator) return;
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const [{ data: summary, error }, readiness] = await Promise.all([
      supabase.rpc('marketplace_operations_summary', { p_since: since }),
      getMarketplaceReadiness({ force: true }),
    ]);
    if (error) throw error;
    if (!summary?.success) throw new Error(summary?.error || 'Operations summary unavailable');
    return res.status(200).json({ success: true, data: { summary, readiness } });
  } catch (error) {
    console.warn('[store-operations-summary]', error?.message || error);
    return res.status(503).json({ success: false, error: 'Operations summary unavailable' });
  }
}
