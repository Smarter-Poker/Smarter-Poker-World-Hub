import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');

// The database independently checks its current revision, so a stale server
// cannot acknowledge an older document after a newer revision is installed.
const TERMS_REVISION = '2026-11-16-87a8e57589a09136';
let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
    _supabase = createClient(url, key);
  }
  return _supabase;
}

/** POST { termsRevision }. Acceptance is idempotent in the original DB RPC. */
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });
    if (!applyRateLimit(req, res, 'club-arena/accept-tos')) return;
    if (typeof req.headers.authorization !== 'string' || !/^Bearer\s+\S+$/i.test(req.headers.authorization)) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || typeof req.body.termsRevision !== 'string') {
      return res.status(400).json({ success: false, error: 'Refresh Club Arena to accept the current terms', refreshRequired: true });
    }
    if (req.body.termsRevision !== TERMS_REVISION) {
      return res.status(409).json({ success: false, error: 'Terms have changed. Refresh Club Arena before accepting', refreshRequired: true });
    }

    const supabase = getSupabase();
    const { user, error, status } = await getServerUserWithFallback(req, supabase);
    if (error || !user?.id) {
      return res.status(status === 503 ? 503 : 401).json({ success: false, error: status === 503 ? 'Authentication unavailable' : 'Invalid token' });
    }
    // No process-local response cache can bypass current auth/revision checks.
    // The row-locked RPC binds this authenticated user and returns stored data.
    const { data, error: acceptanceError } = await supabase.rpc('fn_ca_accept_terms_revision', {
      p_user_id: user.id,
      p_terms_revision: TERMS_REVISION,
    });
    if (acceptanceError?.code === '22023') {
      return res.status(409).json({ success: false, error: 'Terms have changed. Refresh Club Arena before accepting', refreshRequired: true });
    }
    if (acceptanceError?.code === 'P0002') {
      return res.status(409).json({ success: false, error: 'Your profile is unavailable for terms acceptance' });
    }
    if (acceptanceError || !data || typeof data !== 'object' || Array.isArray(data)
        || data.termsRevision !== TERMS_REVISION || typeof data.acceptedAt !== 'string'
        || !Number.isFinite(Date.parse(data.acceptedAt))) {
      return res.status(503).json({ success: false, error: 'Terms acceptance could not be verified' });
    }
    return res.status(200).json({ success: true, termsRevision: data.termsRevision, acceptedAt: data.acceptedAt });
  } catch (error) {
    try { reportApiError(error, req); } catch (_reportError) { /* reporting cannot acknowledge acceptance */ }
    if (!res.headersSent) return res.status(503).json({ success: false, error: 'Terms acceptance could not be verified' });
  }
}
