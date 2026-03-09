/**
 * POST /api/club-arena/cancel-my-cashout
 * Player cancels their own pending cashout request.
 * Body: { cashoutId }
 * Auth: Bearer token (must be the cashout requester)
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

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

  const { cashoutId } = req.body;
  if (!cashoutId) return res.status(400).json({ success: false, error: 'cashoutId required' });

  try {
    // Fetch cashout — must be owned by this user and still pending
    const { data: cashout } = await supabaseAdmin
      .from('cashout_requests')
      .select('id, user_id, club_id, amount, status')
      .eq('id', cashoutId)
      .maybeSingle();

    if (!cashout) return res.status(404).json({ success: false, error: 'Cashout not found' });
    if (cashout.user_id !== user.id) return res.status(403).json({ success: false, error: 'Not your cashout' });
    if (cashout.status !== 'pending') {
      return res.status(400).json({ success: false, error: `Cannot cancel — status is ${cashout.status}` });
    }

    // Mark cashout as cancelled FIRST (prevents double-cancel race)
    const { data: cancelled, error: cancelErr } = await supabaseAdmin
      .from('cashout_requests')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), agent_note: 'Cancelled by player' })
      .eq('id', cashoutId)
      .eq('status', 'pending') // Guard: only cancel if still pending
      .select('id')
      .maybeSingle();

    if (cancelErr || !cancelled) {
      return res.status(409).json({ success: false, error: 'Cashout already processed or cancelled' });
    }

    // Return chips atomically via RPC
    const { data: newBalance, error: creditErr } = await supabaseAdmin
      .rpc('fn_credit_chips', {
        p_club_id: cashout.club_id,
        p_user_id: user.id,
        p_amount: cashout.amount,
      });

    if (creditErr) {
      // Rollback status change if credit fails
      await supabaseAdmin.from('cashout_requests')
        .update({ status: 'pending', cancelled_at: null, agent_note: null })
        .eq('id', cashoutId);
      throw creditErr;
    }

    // Record transaction
    await supabaseAdmin.from('chip_transactions').insert({
      club_id: cashout.club_id,
      from_user_id: user.id,
      to_user_id: user.id,
      amount: cashout.amount,
      transaction_type: 'cashout_cancelled',
      notes: 'Player cancelled cashout — chips returned',
    });

    return res.status(200).json({
      success: true,
      returned: cashout.amount,
      message: `Cashout cancelled — ${cashout.amount.toLocaleString()} chips returned`,
    });
  } catch (err) {
    console.error('[cancel-my-cashout]', err);
    return res.status(500).json({ success: false, error: 'Cancel failed' });
  }
}
