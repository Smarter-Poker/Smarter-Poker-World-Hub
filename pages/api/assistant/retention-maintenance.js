import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { withCronHealth } from '../../../src/lib/cronHealth';
import { validateCronAuth } from '../../../src/utils/cron-auth';

export const config = { maxDuration: 60 };

let _admin = null;
function getAdmin() {
  if (_admin) return _admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _admin = createClient(url, key, { auth: { persistSession: false } });
  return _admin;
}

async function retentionHandler(req, res) {
  if (!validateCronAuth(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  res.setHeader('Cache-Control', 'no-store');

  const admin = getAdmin();
  if (!admin) return res.status(500).json({ status: 'unconfigured', error: 'Missing Supabase Environment Variables' });

  const started = Date.now();
  const { data, error } = await admin.rpc('apply_personal_assistant_retention_batch', { p_limit: 250 });
  if (error) {
    console.warn('[assistant/retention-maintenance] sweep failed:', error.message);
    return res.status(500).json({ status: 'error', error: 'Personal Assistant Retention Sweep Failed' });
  }
  return res.status(200).json({ status: 'ok', ...(data || {}), durationMs: Date.now() - started });
}

const monitoredHandler = withCronHealth('personal-assistant-retention', retentionHandler);

export default async function handler(req, res) {
  if (!applyRateLimit(req, res, LIMITS.write)) return;
  try {
    return await monitoredHandler(req, res);
  } catch (error) {
    console.warn('[assistant/retention-maintenance] unexpected failure:', error?.message || error);
    if (res.headersSent) return undefined;
    return res.status(500).json({ status: 'error', error: 'Personal Assistant Retention Sweep Failed' });
  }
}
