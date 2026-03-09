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

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No auth token' });

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

  const { clubId, chipAmount: rawChipAmount } = req.body;
  const amount = Math.floor(Number(rawChipAmount));
  if (!clubId || !Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) {
    return res.status(400).json({ error: 'clubId and valid positive chipAmount required' });
  }

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

    return res.status(200).json(result);
  } catch (err) {
    console.error('[buyin]', err);
    return res.status(500).json({ error: 'Buy-in failed', details: err.message });
  }
}
