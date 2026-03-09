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

    // Return chips to player balance
    const { data: member } = await supabaseAdmin
      .from('club_members')
      .select('chip_balance')
      .eq('club_id', cashout.club_id)
      .eq('user_id', user.id)
      .maybeSingle();

    await supabaseAdmin
      .from('club_members')
      .update({ chip_balance: (member?.chip_balance || 0) + cashout.amount })
      .eq('club_id', cashout.club_id)
      .eq('user_id', user.id);

    // Mark cashout as cancelled
    await supabaseAdmin
      .from('cashout_requests')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), agent_note: 'Cancelled by player' })
      .eq('id', cashoutId);

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
