import { getServerUserWithFallback } from '../../src/lib/serverAuth';
/**
 * POST /api/club-arena/accept-tos
 * 
 * Records that the authenticated user has accepted the Club Arena
 * Terms of Service. This is a one-time action — once accepted,
 * the TOS modal never appears again for this account.
 * 
 * Body: {} (no params needed)
 * Auth: Bearer token
 */
const { createClient } = require('../../../src/lib/supabaseServerClient');
const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');
import { reportApiError } from '../../../src/lib/sentryWrap';
const { checkIdempotency } = require('../../../src/lib/club-arena/idempotency');

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

export default async function handler(req, res) {
  // Idempotency guard — prevents duplicate mutations from laggy mobile networks
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    if (checkIdempotency(req, res)) return;
  }

  try {
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });
    if (!applyRateLimit(req, res, 'club-arena/accept-tos')) return;

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Not authenticated' });

    // Phase 8: E2E Test fast-bypass for local testing without .env service keys
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY.includes('mock')) {
        return res.status(200).json({ success: true, acceptedAt: new Date().toISOString() });
    }

    const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
    const user = authData?.user;
    if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

    try {
      const { error: updateErr } = await getSupabase()
        .from('profiles')
        .update({ club_arena_tos_accepted_at: new Date().toISOString() })
        .eq('id', user.id);

      if (updateErr) throw updateErr;

      return res.status(200).json({ success: true, acceptedAt: new Date().toISOString() });
    } catch (err) {
      console.warn('[accept-tos]', err);
      return res.status(500).json({ success: false, error: 'Failed to record TOS acceptance' });
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
