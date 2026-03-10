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
const { checkIdempotency, cacheResponse } = require('../../../src/lib/club-arena/idempotency');
const { isUUID, validateAmount, rejectBadPayload } = require('../../../src/lib/club-arena/validate');

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // RED TEAM: Payload size + field allowlist (shared utility)
  if (rejectBadPayload(req, res, ['clubId', 'chipAmount'])) return;

  // Idempotency guard — prevent double-charges on laggy mobile networks
  if (checkIdempotency(req, res)) return;

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No auth token' });

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

  const { clubId, chipAmount: rawChipAmount } = req.body;

  // RED TEAM: Strict UUID validation (blocks SQL injection via clubId)
  if (!isUUID(clubId)) return res.status(400).json({ error: 'Invalid clubId format' });

  // RED TEAM: Strict amount validation (min 100, max 100M, no fractionals)
  const amtResult = validateAmount(rawChipAmount, 100, 100_000_000);
  if (!amtResult.valid) return res.status(400).json({ error: amtResult.error });
  const amount = amtResult.value;

  // Rate limit
  if (!applyRateLimit(req, res, 'club-arena/buyin')) return;

  // Settlement lock check — block during Monday 4:00-4:10 AM CST
  const lockCheck = await checkSettlementLock(supabaseAdmin, clubId);
  if (lockCheck.locked) return sendLockedResponse(res, lockCheck);

  // 75% Cheaper Law: 38 diamonds = 100 chips
  const diamondCost = Math.ceil((amount / 100) * 38);

  try {
    // Atomic buy-in via RPC — prevents TOCTOU race on diamonds/chips
    const { data: result, error: rpcErr } = await supabaseAdmin.rpc('fn_atomic_buyin', {
      p_user_id: user.id,
      p_club_id: clubId,
      p_chip_amount: amount,
      p_diamond_cost: diamondCost,
    });

    if (rpcErr) throw rpcErr;

    if (!result?.success) {
      const status = result?.error === 'Insufficient diamonds' ? 400
        : result?.error === 'Not a club member' ? 404
          : result?.error === 'Profile not found' ? 404 : 400;
      return res.status(status).json(result);
    }

    cacheResponse(req, 200, result);
    return res.status(200).json(result);
  } catch (err) {
    console.error('[buyin]', err);
    return res.status(500).json(safeErrorResponse(err, 'Buy-in failed'));
  }
}
