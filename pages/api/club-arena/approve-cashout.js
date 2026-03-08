/**
 * POST /api/club-arena/approve-cashout
 * 
 * Agent (or owner) approves or cancels a player's cashout request.
 * 
 * On APPROVE: completes the cashout (held chips => diamonds to player).
 * On CANCEL:  returns held/escrowed chips back to player's balance.
 * 
 * Agents can ONLY remove chips from a player account via:
 *   1. Approving a cashout request (this endpoint)
 *   2. Clawback within 10 min of distributing (/api/club-arena/clawback-chips)
 * 
 * Body: { cashoutId, action: 'approve' | 'cancel', note? }
 * Auth: Bearer token (agent who owns the player, or club owner/admin)
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');
import { checkSettlementLock, sendLockedResponse } from '../../../src/lib/settlement-lock';
import { getServerUser } from '../../../src/lib/serverAuth';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, error: 'No auth token' });

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

  const { cashoutId, action, note } = req.body;
  if (!cashoutId || !['approve', 'cancel'].includes(action)) {
    return res.status(400).json({ success: false, error: 'cashoutId and action (approve/cancel) required' });
  }

  // Rate limit
  if (!applyRateLimit(req, res, 'club-arena/approve-cashout')) return;

  try {
    // ═════════════════════════════════════════════════════════════
    // 1. Get cashout request — select ALL fields used downstream
    //    BUG FIX: was .select('id') — cashout.club_id, .agent_id, .player_id,
    //    .amount were all undefined, breaking auth, chip transfer, and notifications
    // ═════════════════════════════════════════════════════════════
    const { data: cashout, error: coErr } = await supabaseAdmin
      .from('cashout_requests')
      .select('id, club_id, player_id, agent_id, amount, status')
      .eq('id', cashoutId)
      .maybeSingle();

    if (coErr || !cashout) return res.status(404).json({ success: false, error: 'Cashout request not found' });

    // Settlement lock check — block during Monday 4:00-4:10 AM CST
    // Must happen BEFORE claiming status, otherwise a lock leaves it orphaned
    const lockCheck = await checkSettlementLock(supabaseAdmin, cashout.club_id);
    if (lockCheck.locked) return sendLockedResponse(res, lockCheck);

    // Atomic status claim — prevents concurrent double-processing
    const { data: claimed, error: claimErr } = await supabaseAdmin
      .from('cashout_requests')
      .update({ status: action === 'approve' ? 'completing' : 'cancelling' })
      .eq('id', cashoutId)
      .eq('status', 'pending')  // Only succeeds if still pending
      .select('id')
      .maybeSingle();

    if (claimErr || !claimed) {
      return res.status(409).json({ success: false, error: 'Cashout already processed or claimed by another request' });
    }

    // ═════════════════════════════════════════════════════════════
    // 2. Verify caller is the assigned agent or club owner/admin
    // ═════════════════════════════════════════════════════════════
    const { data: callerMember } = await supabaseAdmin
      .from('club_members')
      .select('role')
      .eq('club_id', cashout.club_id)
      .eq('user_id', user.id)
      .maybeSingle();

    const isAgent = cashout.agent_id === user.id;
    const isAdmin = ['owner', 'admin'].includes(callerMember?.role);
    if (!isAgent && !isAdmin) {
      // Union admin fallback
      const { data: clubInfo } = await supabaseAdmin.from('clubs').select('union_id').eq('id', cashout.club_id).maybeSingle();
      let unionAuth = false;
      if (clubInfo?.union_id) {
        const { data: ua } = await supabaseAdmin.from('union_admins').select('role').eq('union_id', clubInfo.union_id).eq('user_id', user.id).maybeSingle();
        unionAuth = !!ua;
      }
      if (!unionAuth) {
        return res.status(403).json({ success: false, error: 'Not authorized to act on this cashout' });
      }
    }

    // Get player & agent names for notifications
    const { data: playerProfile } = await supabaseAdmin
      .from('profiles')
      .select('username, display_name')
      .eq('id', cashout.player_id)
      .maybeSingle();
    const playerName = playerProfile?.display_name || playerProfile?.username || 'Player';

    const { data: agentProfile } = await supabaseAdmin
      .from('profiles')
      .select('username, display_name')
      .eq('id', user.id)
      .maybeSingle();
    const agentName = agentProfile?.display_name || agentProfile?.username || 'Your agent';

    // ═════════════════════════════════════════════════════════════
    // APPROVE: Held chips => diamonds
    // ═════════════════════════════════════════════════════════════
    if (action === 'approve') {
      // Rate: 100 chips = 38 diamonds
      const diamondsReturned = Math.floor((cashout.amount / 100) * 38);

      // Atomic diamond credit via RPC
      const { error: creditErr } = await supabaseAdmin.rpc('fn_credit_diamonds', {
        p_user_id: cashout.player_id,
        p_amount: diamondsReturned,
      });

      if (creditErr) {
        // Revert status claim
        await supabaseAdmin.from('cashout_requests')
          .update({ status: 'pending' }).eq('id', cashoutId);
        throw creditErr;
      }

      // BUG #161 FIX: Return cashed-out chips to club treasury.
      // The chips were debited from player during request-cashout (fn_debit_chips).
      // On approval, those chips need to go back to the club's chip_treasury,
      // otherwise total chip supply permanently shrinks on every cashout.
      const { error: treasuryErr } = await supabaseAdmin.rpc('fn_credit_treasury', {
        p_club_id: cashout.club_id,
        p_amount: cashout.amount,
      });

      if (treasuryErr) {
        console.error('[approve-cashout] Treasury credit failed (non-fatal):', treasuryErr.message);
        // Non-fatal: the cashout still completes. Treasury will be corrected
        // during next settlement reconciliation.
      }

      // Mark cashout completed (from 'completing' => 'completed')
      await supabaseAdmin
        .from('cashout_requests')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          agent_note: note || 'Approved',
        })
        .eq('id', cashoutId);

      // Record transaction
      await supabaseAdmin.from('chip_transactions').insert({
        club_id: cashout.club_id,
        from_user_id: cashout.player_id,
        to_user_id: cashout.agent_id,
        amount: cashout.amount,
        transaction_type: 'cashout_approved',
        notes: `Cashout approved: ${cashout.amount.toLocaleString()} chips => ${diamondsReturned} diamonds`,
      });

      // Notify player: message + push
      await notifyPlayer(cashout, playerName, agentName,
        `[CASHOUT APPROVED]

${agentName} approved your cashout of ${cashout.amount.toLocaleString()} chips.
You received ${diamondsReturned} diamonds.`,
        `[OK] Cashout approved! ${cashout.amount.toLocaleString()} chips => ${diamondsReturned} diamonds`
      );

      return res.status(200).json({
        success: true,
        action: 'approved',
        amount: cashout.amount,
        diamondsReturned,
        playerId: cashout.player_id,
      });
    }

    // ═════════════════════════════════════════════════════════════
    // CANCEL: Return held chips to player's balance
    // ═════════════════════════════════════════════════════════════
    if (action === 'cancel') {
      // Atomic chip credit via RPC
      const { error: creditErr } = await supabaseAdmin.rpc('fn_credit_chips', {
        p_club_id: cashout.club_id,
        p_user_id: cashout.player_id,
        p_amount: cashout.amount,
      });

      if (creditErr) {
        // Revert status claim
        await supabaseAdmin.from('cashout_requests')
          .update({ status: 'pending' }).eq('id', cashoutId);
        throw creditErr;
      }

      // Get new balance for response
      const { data: playerMember } = await supabaseAdmin
        .from('club_members')
        .select('chip_balance')
        .eq('club_id', cashout.club_id)
        .eq('user_id', cashout.player_id)
        .maybeSingle();

      // Mark cashout cancelled (from 'cancelling' => 'cancelled')
      await supabaseAdmin
        .from('cashout_requests')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          agent_note: note || 'Cancelled by agent',
        })
        .eq('id', cashoutId);

      // Record refund transaction
      await supabaseAdmin.from('chip_transactions').insert({
        club_id: cashout.club_id,
        from_user_id: cashout.agent_id,
        to_user_id: cashout.player_id,
        amount: cashout.amount,
        transaction_type: 'cashout_cancelled',
        notes: `Cashout cancelled: ${cashout.amount.toLocaleString()} chips returned to player`,
      });

      // Notify player: message + push
      await notifyPlayer(cashout, playerName, agentName,
        `[CASHOUT CANCELLED]

${agentName} cancelled your cashout request for ${cashout.amount.toLocaleString()} chips.\nYour chips have been returned to your balance.${note ? `\n\nNote: ${note}` : ''}`,
        `Cashout cancelled. ${cashout.amount.toLocaleString()} chips returned to your balance.`
      );

      return res.status(200).json({
        success: true,
        action: 'cancelled',
        amount: cashout.amount,
        chipsReturned: cashout.amount,
        playerNewBalance: playerMember?.chip_balance || 0,
        playerId: cashout.player_id,
      });
    }
  } catch (err) {
    console.error('[approve-cashout]', err);
    return res.status(500).json({ success: false, error: 'Cashout action failed', details: err.message });
  }
}

/**
 * Send in-app message + push notification to the player
 */
async function notifyPlayer(cashout, playerName, agentName, messageText, pushText) {
  // In-app message
  // Rate limit

  try {
    const { data: convId } = await supabaseAdmin.rpc('fn_get_or_create_conversation', {
      user1_id: cashout.agent_id,
      user2_id: cashout.player_id,
    });
    if (convId) {
      await supabaseAdmin.rpc('fn_send_message', {
        p_conversation_id: convId,
        p_sender_id: cashout.agent_id,
        p_content: messageText,
      });
    }
  } catch (e) {
    console.warn('[approve-cashout] Message notification failed:', e.message);
  }

  // Push notification
  // Rate limit

  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');

    if (baseUrl) {
      await fetch(`${baseUrl}/api/notifications/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': process.env.ADMIN_ROUTE_SECRET || '',
        },
        body: JSON.stringify({
          userId: cashout.player_id,
          title: pushText.startsWith('[CASHOUT APPROVED]') ? 'Cashout Approved' : 'Cashout Cancelled',
          message: pushText,
          url: '/hub/club-arena/cashier',
        }),
      });
    }
  } catch (e) {
    console.warn('[approve-cashout] Push notification failed:', e.message);
  }
}
