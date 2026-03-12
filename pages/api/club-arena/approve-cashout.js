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
const { checkIdempotency, cacheResponse } = require('../../../src/lib/club-arena/idempotency');
const { runStandardGuards } = require('../../../src/lib/club-arena/redteam-validation');
const { logAudit, extractIP } = require('../../../src/lib/club-arena/auditLogger');
const { safeErrorResponse } = require('../../../src/lib/club-arena/sanitize');

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });

  // CONCURRENCY: Idempotency guard — prevent double-tap cashout race
  if (checkIdempotency(req, res)) return;

  // ── RED TEAM: Payload size + field allowlist + UUID validation ──
  const guardErr = runStandardGuards(req.body, {
    maxBodySize: 512,
    allowedFields: new Set(['cashoutId', 'action', 'note']),
    uuids: { cashoutId: req.body?.cashoutId },
  });
  if (guardErr) return res.status(guardErr.status).json({ success: false, error: guardErr.error });

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

    // The atomic RPCs now handle the status claim and verify the cashout is 'pending'.
    // We only need the lockCheck pre-flight here.

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
        if (ua) {
            unionAuth = true;
        } else {
            // Owner fallback
            const { data: union } = await supabaseAdmin.from('unions').select('id').eq('id', clubInfo.union_id).eq('owner_id', user.id).maybeSingle();
            if (union) unionAuth = true;
        }
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
      // BUG-06 FIX: Math.round for fairness (was Math.floor — systematically shortchanged players)
      const diamondsReturned = Math.round((cashout.amount / 100) * 38);

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

      // Step 2: Atomic approval (updates request status + credits treasury + logs transaction)
      const { data: rpcResult, error: rpcErr } = await supabaseAdmin.rpc('fn_approve_cashout_atomic', {
        p_cashout_id: cashoutId,
        p_agent_id: user.id,
        p_agent_note: note || 'Approved'
      });

      if (rpcErr || !rpcResult?.success) {
        throw rpcErr || new Error(rpcResult?.error || 'Atomic approval failed');
      }

      // Notify player: message + push
      await notifyPlayer(cashout, playerName, agentName,
        `[CASHOUT APPROVED]

${agentName} approved your cashout of ${cashout.amount.toLocaleString()} chips.
You received ${diamondsReturned} diamonds.`,
        `[OK] Cashout approved! ${cashout.amount.toLocaleString()} chips => ${diamondsReturned} diamonds`
      );

      logAudit(supabaseAdmin, { actionType: 'cashout_approved', userId: user.id, targetUserId: cashout.player_id, clubId: cashout.club_id, amount: cashout.amount, ip: extractIP(req), details: { cashoutId, diamondsReturned, agentNote: note || 'Approved' } });
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
      // Atomic cancellation (updates status + credits player chips + logs transaction)
      const { data: rpcResult, error: rpcErr } = await supabaseAdmin.rpc('fn_cancel_cashout_atomic', {
        p_cashout_id: cashoutId,
        p_user_id: user.id,
        p_is_agent: true,
        p_note: note || 'Cancelled by agent'
      });

      if (rpcErr || !rpcResult?.success) {
        return res.status(409).json({ success: false, error: rpcResult?.error || 'Cancellation failed', details: rpcErr?.message });
      }

      const playerNewBalance = rpcResult.new_balance;

      // Notify player: message + push
      await notifyPlayer(cashout, playerName, agentName,
        `[CASHOUT CANCELLED]

${agentName} cancelled your cashout request for ${cashout.amount.toLocaleString()} chips.\nYour chips have been returned to your balance.${note ? `\n\nNote: ${note}` : ''}`,
        `Cashout cancelled. ${cashout.amount.toLocaleString()} chips returned to your balance.`
      );

      logAudit(supabaseAdmin, { actionType: 'cashout_cancelled', userId: user.id, targetUserId: cashout.player_id, clubId: cashout.club_id, amount: cashout.amount, ip: extractIP(req), details: { cashoutId, chipsReturned: cashout.amount, playerNewBalance, agentNote: note || 'Cancelled by agent' } });
      return res.status(200).json({
        success: true,
        action: 'cancelled',
        amount: cashout.amount,
        chipsReturned: cashout.amount,
        playerNewBalance,
        playerId: cashout.player_id,
      });
    }
  } catch (err) {
    console.error('[approve-cashout]', err);
    return res.status(500).json(safeErrorResponse(err, 'Cashout action failed'));
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
