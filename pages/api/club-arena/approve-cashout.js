/**
 * POST /api/club-arena/approve-cashout
 * 
 * Agent (or owner) approves or denies a player's cashout request.
 * On approve: completes the cashout (chips→diamonds).
 * On deny: returns held chips to the player.
 * 
 * Body: { cashoutId, action: 'approve' | 'deny', note? }
 * Auth: Bearer token (agent who owns the player, or club owner/admin)
 */
import { createClient } from '@supabase/supabase-js';

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

  const { cashoutId, action, note } = req.body;
  if (!cashoutId || !['approve', 'deny'].includes(action)) {
    return res.status(400).json({ error: 'cashoutId and action (approve/deny) required' });
  }

  try {
    // 1. Get cashout request
    const { data: cashout, error: coErr } = await supabaseAdmin
      .from('cashout_requests')
      .select('*')
      .eq('id', cashoutId)
      .single();

    if (coErr || !cashout) return res.status(404).json({ error: 'Cashout request not found' });
    if (cashout.status !== 'pending') {
      return res.status(409).json({ error: `Cashout already ${cashout.status}` });
    }

    // 2. Verify caller is the assigned agent or club owner/admin
    const { data: callerMember } = await supabaseAdmin
      .from('club_members')
      .select('role')
      .eq('club_id', cashout.club_id)
      .eq('user_id', user.id)
      .single();

    const isAgent = cashout.agent_id === user.id;
    const isAdmin = ['owner', 'admin'].includes(callerMember?.role);
    if (!isAgent && !isAdmin) {
      return res.status(403).json({ error: 'Not authorized to approve this cashout' });
    }

    if (action === 'approve') {
      // 3a. APPROVE: Convert chips to diamonds
      // Rate: 100 chips = 38 diamonds
      const diamondsReturned = Math.floor((cashout.amount / 100) * 38);

      // Add diamonds to player's profile
      const { data: playerProfile } = await supabaseAdmin
        .from('profiles')
        .select('diamonds')
        .eq('id', cashout.player_id)
        .single();

      const currentDiamonds = playerProfile?.diamonds || 0;
      await supabaseAdmin
        .from('profiles')
        .update({ diamonds: currentDiamonds + diamondsReturned })
        .eq('id', cashout.player_id);

      // Update cashout status
      await supabaseAdmin
        .from('cashout_requests')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          agent_note: note || 'Approved',
        })
        .eq('id', cashoutId);

      // Record completion transaction
      await supabaseAdmin.from('chip_transactions').insert({
        club_id: cashout.club_id,
        from_user_id: cashout.player_id,
        to_user_id: cashout.player_id,
        amount: cashout.amount,
        transaction_type: 'send',
        notes: `Cashout completed: ${cashout.amount.toLocaleString()} chips → ${diamondsReturned} diamonds`,
        related_cashout_id: cashoutId,
      });

      return res.status(200).json({
        success: true,
        action: 'approved',
        amount: cashout.amount,
        diamondsReturned,
        playerId: cashout.player_id,
      });

    } else {
      // 3b. DENY: Return held chips to player
      const { data: playerMember } = await supabaseAdmin
        .from('club_members')
        .select('chip_balance')
        .eq('club_id', cashout.club_id)
        .eq('user_id', cashout.player_id)
        .single();

      const currentChips = playerMember?.chip_balance || 0;
      await supabaseAdmin
        .from('club_members')
        .update({ chip_balance: currentChips + cashout.amount })
        .eq('club_id', cashout.club_id)
        .eq('user_id', cashout.player_id);

      // Update cashout status
      await supabaseAdmin
        .from('cashout_requests')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          agent_note: note || 'Denied by agent',
        })
        .eq('id', cashoutId);

      return res.status(200).json({
        success: true,
        action: 'denied',
        amount: cashout.amount,
        chipsReturned: cashout.amount,
        playerId: cashout.player_id,
      });
    }
  } catch (err) {
    console.error('[approve-cashout]', err);
    return res.status(500).json({ error: 'Cashout action failed', details: err.message });
  }
}
