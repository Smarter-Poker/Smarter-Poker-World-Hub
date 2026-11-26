import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';
import { executeSingleHandAudit } from '../../../../src/lib/personal-assistant/handAuditRouteCore.mjs';
import { getServerUserWithFallback } from '../../../../src/lib/serverAuth';
import { createClient } from '../../../../src/lib/supabaseServerClient';

export const config = { maxDuration: 30 };

let _supabase = null;
export function _setSupabaseForTesting(client) {
  _supabase = client;
}

function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Hand Audit Service Configuration Is Unavailable.');
    _supabase = createClient(url, key);
  }
  return _supabase;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vary', 'Authorization');

  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const limit = req.method === 'GET' ? (LIMITS.read || { max: 60, windowMs: 60_000 }) : LIMITS.write;
  if (!applyRateLimit(req, res, limit)) return;

  try {
    return await executeSingleHandAudit(req, res, {
      getDb: getSupabase,
      getUser: getServerUserWithFallback,
    });
  } catch (error) {
    console.warn('[assistant/leaks/hand-audit] unhandled failure:', error?.message || error);
    return res.status(503).json({
      success: false,
      error: 'Hand Audit Is Temporarily Unavailable.',
    });
  }
}
