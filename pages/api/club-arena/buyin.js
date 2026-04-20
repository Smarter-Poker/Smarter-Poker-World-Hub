/**
 * POST /api/club-arena/buyin
 * 
 * Player converts diamonds → club chips (buy-in).
 * Atomic: deduct diamonds from profile, add chips to club_members,
 * record chip_transaction — all server-side with service_role.
 * 
 * Rate: 38 diamonds = 100 chips (75% Cheaper Law)
 * 
 * Body: { clubId, chipAmount }
 * Auth: Bearer token
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { checkSettlementLock, sendLockedResponse } from '../../../src/lib/settlement-lock';
const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');
const { logAudit, extractIP } = require('../../../src/lib/club-arena/auditLogger');
const { safeErrorResponse } = require('../../../src/lib/club-arena/sanitize');
import { BuyInRequestSchema, Orb1HeadersSchema } from '../../../src/contracts/orb1_escrow';
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
  const supabaseAdmin = getSupabase(); // FIX: was undefined — alias to getSupabase() for settlement-lock, audit, velocity, notify
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    // 1. Zod Contract Validation (Headers)
    const headerParse = Orb1HeadersSchema.safeParse(req.headers);
    if (!headerParse.success) {
      return res.status(400).json({ success: false, error: 'Missing or invalid Idempotency Key / Auth header' });
    }
    const idempotencyKey = headerParse.data['x-idempotency-key'];
    const token = headerParse.data.authorization.replace('Bearer ', '');

    // 2. Auth Verification
    const { data: { user }, error: authError } = await getSupabase().auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

    // 3. Zod Contract Validation (Payload)
    const bodyParse = BuyInRequestSchema.safeParse(req.body);
    if (!bodyParse.success) {
      return res.status(400).json({ success: false, error: 'Invalid payload schema', details: bodyParse.error.errors });
    }
    const { clubId, chipAmount: amount } = bodyParse.data;

    // Rate limit
    if (!applyRateLimit(req, res, 'club-arena/buyin')) return;

    // Settlement lock check — block during Monday 4:00-4:10 AM CST
    const lockCheck = await checkSettlementLock(supabaseAdmin, clubId);
    if (lockCheck.locked) return sendLockedResponse(res, lockCheck);

    // 75% Cheaper Law: 38 diamonds = 100 chips
    const diamondCost = Math.ceil((amount / 100) * 38);

    try {
      // Phase 2: Domain Logic Row Locking
      // Atomic buy-in via RPC — handles idempotency cache layer and TOCTOU races
      const { data: result, error: rpcErr } = await getSupabase().rpc('orb1_buyin_transaction', {
        p_user_id: user.id,
        p_club_id: clubId,
        p_chip_amount: amount,
        p_diamond_cost: diamondCost,
        p_idempotency_key: idempotencyKey
      });

      if (rpcErr) throw rpcErr;

      if (!result?.success) {
        const status = result?.error === 'Insufficient diamonds' ? 400
          : result?.error === 'Not a club member' ? 404
            : result?.error === 'Profile not found' ? 404 : 409;
        return res.status(status).json(result);
      }

      // Only log if not cached hit
      if (!result.cached) {
        logAudit(supabaseAdmin, { actionType: 'buyin', userId: user.id, clubId, amount, ip: extractIP(req), details: { diamondCost, chipAmount: amount, ...result } });
      }

      return res.status(200).json(result);
    } catch (err) {
      console.error('[buyin]', err);
      return res.status(500).json(safeErrorResponse(err, 'Buy-in failed'));
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) {}
    console.error('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
