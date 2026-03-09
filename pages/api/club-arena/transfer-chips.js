/**
 * POST /api/club-arena/transfer-chips
 * Transfer chips between members within the same club.
 * Body: { clubId, toUserId, amount, note? }
 * Auth: Bearer token (sender = authenticated user)
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { checkSettlementLock, sendLockedResponse } from '../../../src/lib/settlement-lock';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { notifyUser } from '../../../src/lib/club-arena/notify';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, error: 'Auth required' });

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

  const { clubId, toUserId, amount: rawAmount, note } = req.body;
  const amount = Math.floor(Number(rawAmount));

  if (!clubId || !toUserId) return res.status(400).json({ success: false, error: 'clubId and toUserId required' });
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) {
    return res.status(400).json({ success: false, error: 'amount must be 1-10,000,000' });
  }
  if (toUserId === user.id) return res.status(400).json({ success: false, error: 'Cannot transfer to yourself' });

  // Settlement lock
  const lockCheck = await checkSettlementLock(supabaseAdmin, clubId);
  if (lockCheck.locked) return sendLockedResponse(res, lockCheck);

  try {
    // Verify both users are active members
    const { data: sender } = await supabaseAdmin
      .from('club_members').select('chip_balance, role')
      .eq('club_id', clubId).eq('user_id', user.id).eq('status', 'active').maybeSingle();
    if (!sender) return res.status(403).json({ success: false, error: 'You are not a member of this club' });

    const { data: receiver } = await supabaseAdmin
      .from('club_members').select('chip_balance, role')
      .eq('club_id', clubId).eq('user_id', toUserId).eq('status', 'active').maybeSingle();
    if (!receiver) return res.status(404).json({ success: false, error: 'Recipient not found in this club' });

    if ((sender.chip_balance || 0) < amount) {
      return res.status(400).json({
        success: false, error: 'Insufficient chips',
        available: sender.chip_balance || 0, requested: amount,
      });
    }

    // Atomic transfer via Supabase RPC (SELECT FOR UPDATE + atomic balance changes)
    const { data: rpcResult, error: rpcErr } = await supabaseAdmin
      .rpc('fn_transfer_chips', {
        p_club_id: clubId,
        p_from_user_id: user.id,
        p_to_user_id: toUserId,
        p_amount: amount,
      });

    if (rpcErr) throw rpcErr;
    if (!rpcResult?.success) {
      const status = rpcResult?.error === 'Insufficient balance' ? 400
        : rpcResult?.error?.includes('not found') ? 404 : 500;
      return res.status(status).json({
        success: false, error: rpcResult?.error || 'Transfer failed',
        available: rpcResult?.available, requested: rpcResult?.requested,
      });
    }

    // Record transactions (fire-and-forget — transfer already atomic)
    supabaseAdmin.from('chip_transactions').insert([
      {
        club_id: clubId, from_user_id: user.id, to_user_id: toUserId,
        amount: -amount, transaction_type: 'transfer_out',
        notes: note || `Transfer to player`,
      },
      {
        club_id: clubId, from_user_id: user.id, to_user_id: toUserId,
        amount, transaction_type: 'transfer_in',
        notes: note || `Transfer from player`,
      },
    ]).then(() => {}).catch(() => {});

    // Notify recipient
    notifyUser(supabaseAdmin, {
      userId: toUserId, type: 'chip_transfer',
      title: `💰 ${amount.toLocaleString()} Chips Received`,
      message: `A player sent you ${amount.toLocaleString()} chips${note ? ` — ${note}` : ''}.`,
      data: { clubId, amount, fromUserId: user.id },
      pushUrl: `/hub/club-arena/cashier?club=${clubId}`,
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      transferred: amount,
      senderBalance: rpcResult.sender_balance,
    });
  } catch (err) {
    console.error('[transfer-chips]', err);
    return res.status(500).json({ success: false, error: 'Transfer failed', details: err.message });
  }
}
