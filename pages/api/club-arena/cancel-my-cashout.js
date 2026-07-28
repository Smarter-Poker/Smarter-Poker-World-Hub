/**
 * POST /api/club-arena/cancel-my-cashout
 * Player cancels their own pending cashout request.
 * Body: { cashoutId }
 * Auth: Bearer token (must be the cashout requester)
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
const { isUUID, rejectBadPayload } = require('../../../src/lib/club-arena/validate');
const { checkIdempotency, cacheResponse } = require('../../../src/lib/club-arena/idempotency');
import { reportApiError } from '../../../src/lib/sentryWrap';

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
  try {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });

    // RED TEAM: Payload size + field allowlist
    if (rejectBadPayload(req, res, ['cashoutId', 'clubId'])) return;

    // CONCURRENCY: Idempotency guard — dedup rapid double-taps
    if (checkIdempotency(req, res)) return;

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Auth required' });

    const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
    const user = authData?.user;
    if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

    const { cashoutId } = req.body;
    // RED TEAM: Strict UUID validation
    if (!isUUID(cashoutId)) return res.status(400).json({ success: false, error: 'Invalid cashoutId format' });

    try {
      // Fetch cashout — must be owned by this user and still pending
      const { data: cashout } = await getSupabase()
        .from('cashout_requests')
        .select('id, player_id, club_id, amount, status')
        .eq('id', cashoutId)
        .maybeSingle();

      if (!cashout) return res.status(404).json({ success: false, error: 'Cashout not found' });
      if (cashout.player_id !== user.id) return res.status(403).json({ success: false, error: 'Not your cashout' });
      if (cashout.status !== 'pending') {
        return res.status(400).json({ success: false, error: `Cannot cancel — status is ${cashout.status}` });
      }

      // Atomic cancellation (updates status + credits player chips + logs transaction)
      const { data: rpcResult, error: rpcErr } = await getSupabase().rpc('fn_cancel_cashout_atomic', {
        p_cashout_id: cashoutId,
        p_user_id: user.id,
        p_is_agent: false,
        p_note: 'Cancelled by player'
      });

      if (rpcErr || !rpcResult?.success) {
        return res.status(409).json({ success: false, error: rpcResult?.error || 'Cancellation failed', details: rpcErr?.message });
      }

      // Transaction already recorded atomically inside fn_cancel_cashout_atomic

      cacheResponse(req, 200, {
        success: true,
        returned: cashout.amount,
        message: `Cashout cancelled — ${cashout.amount.toLocaleString()} chips returned`,
      });

      return res.status(200).json({
        success: true,
        returned: cashout.amount,
        message: `Cashout cancelled — ${cashout.amount.toLocaleString()} chips returned`,
      });
    } catch (err) {
      console.warn('[cancel-my-cashout]', err);
      return res.status(500).json({ success: false, error: 'Cancel failed' });
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
