import { getServerUserWithFallback } from '../../src/lib/serverAuth';
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
    const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
    const user = authData?.user;
    if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

    // 3. Zod Contract Validation (Payload)
    const bodyParse = BuyInRequestSchema.safeParse(req.body);
    if (!bodyParse.success) {
      return res.status(400).json({ success: false, error: 'Invalid payload schema', details: bodyParse.error.errors });
    }
    const { clubId, chipAmount: amount } = bodyParse.data;

    // Rate limit
    if (!applyRateLimit(req, res, 'club-arena/buyin')) return;

    // Round 70: Blacklist enforcement gate. Banned users cannot buy in.
    // Checks blacklists for (user, club) AND (user, union via club->union_id).
    // Active = expires_at IS NULL OR expires_at > now().
    try {
      const { data: club } = await supabaseAdmin
        .from('clubs')
        .select('union_id')
        .eq('id', clubId)
        .maybeSingle();

      const banQuery = supabaseAdmin
        .from('blacklists')
        .select('id, reason, expires_at')
        .eq('user_id', user.id)
        .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString());

      // Match either club-level or union-level ban
      const orParts = [`club_id.eq.${clubId}`];
      if (club?.union_id) orParts.push(`union_id.eq.${club.union_id}`);
      const { data: bans } = await banQuery.or(orParts.join(','));

      if (bans && bans.length > 0) {
        return res.status(403).json({
          success: false,
          error: 'banned',
          reason: bans[0].reason || 'Banned from this club',
          expires_at: bans[0].expires_at,
        });
      }
    } catch (banErr) {
      // Never block buyin on blacklist-check error — log and proceed.
      // (Belt-and-suspenders: even if Supabase blips during the gate check,
      // legitimate buyins shouldn't be denied; a miss here is no worse than
      // the pre-Round-70 baseline.)
      console.warn('[buyin] blacklist check skipped:', banErr?.message || banErr);
    }

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
      console.warn('[buyin]', err);
      return res.status(500).json(safeErrorResponse(err, 'Buy-in failed'));
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
