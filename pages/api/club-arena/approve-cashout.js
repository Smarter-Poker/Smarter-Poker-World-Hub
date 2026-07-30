import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * POST /api/club-arena/approve-cashout
 * 
 * Agent (or owner) approves or cancels a player's cashout request.
 * 
 * On APPROVE: completes the cashout (held chips => club treasury; agent settles fiat off-platform).
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
import { requireRecentMfa } from '../../../src/lib/mfaGate';
const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');
import { checkSettlementLock, sendLockedResponse } from '../../../src/lib/settlement-lock';
const { checkIdempotency, cacheResponse } = require('../../../src/lib/club-arena/idempotency');
const { runStandardGuards } = require('../../../src/lib/club-arena/redteam-validation');
const { logAudit, extractIP } = require('../../../src/lib/club-arena/auditLogger');
const { safeErrorResponse } = require('../../../src/lib/club-arena/sanitize');
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

    const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
    const user = authData?.user;
    if (authError || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

    const { cashoutId, action, note } = req.body;
    if (!cashoutId || !['approve', 'cancel'].includes(action)) {
      return res.status(400).json({ success: false, error: 'cashoutId and action (approve/cancel) required' });
    }

    // ── [Phase 6.1.27] Step-up MFA gate on cashout APPROVALS ─────────────
    // Approving a cashout moves real chips off the player's balance and
    // into club treasury (settling off-platform fiat downstream). Require
    // a fresh (within-5-min) MFA confirmation from the approving agent/
    // owner so a stolen 12h cookie can't drain accounts.
    // Cancel action is reversible (chips return to balance) — we skip the
    // step-up gate for cancel so operators aren't friction-slowed on the
    // happy-path rollback.
    if (action === 'approve') {
      // Only gate if the user has MFA enrolled — agents who haven't
      // enrolled fall back to the existing chip-velocity + audit-log
      // controls. (See Phase 6.1.28 follow-up: make MFA mandatory for
      // any agent handling cashouts.)
      const { data: factor } = await getSupabase()
        .from('user_mfa_factors')
        .select('enabled')
        .eq('user_id', user.id)
        .maybeSingle();
      if (factor?.enabled) {
        const gate = await requireRecentMfa(req, getSupabase(), user);
        if (!gate.ok) {
          return res.status(gate.status || 403).json({
            success: false,
            error: gate.reason || 'Step-up confirmation required',
            requiresMfa: true,
            requiresStepUp: gate.requiresStepUp === true,
            maxAgeSec: gate.maxAgeSec,
          });
        }
      }
    }

    // Rate limit
    if (!applyRateLimit(req, res, 'club-arena/approve-cashout')) return;

    try {
      // ═════════════════════════════════════════════════════════════
      // 1. Get cashout request — select ALL fields used downstream
      //    BUG FIX: was .select('id') — cashout.club_id, .agent_id, .player_id,
      //    .amount were all undefined, breaking auth, chip transfer, and notifications
      // ═════════════════════════════════════════════════════════════
      const { data: cashout, error: coErr } = await getSupabase()
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
      const { data: callerMember } = await getSupabase()
        .from('club_members')
        .select('role')
        .eq('club_id', cashout.club_id)
        .eq('user_id', user.id)
        .maybeSingle();

      const isAgent = cashout.agent_id === user.id;
      const isAdmin = ['owner', 'admin'].includes(callerMember?.role);
      if (!isAgent && !isAdmin) {
        // Union admin fallback
        const { data: clubInfo } = await getSupabase().from('clubs').select('union_id').eq('id', cashout.club_id).maybeSingle();
        let unionAuth = false;
        if (clubInfo?.union_id) {
          const { data: ua } = await getSupabase().from('union_admins').select('role').eq('union_id', clubInfo.union_id).eq('user_id', user.id).maybeSingle();
          if (ua) {
              unionAuth = true;
          } else {
              // Owner fallback
              const { data: union } = await getSupabase().from('unions').select('id').eq('id', clubInfo.union_id).eq('owner_id', user.id).maybeSingle();
              if (union) unionAuth = true;
          }
        }
        if (!unionAuth) {
          return res.status(403).json({ success: false, error: 'Not authorized to act on this cashout' });
        }
      }

      // Get player & agent names for notifications
      const { data: playerProfile } = await getSupabase()
        .from('profiles')
        .select('username, display_name')
        .eq('id', cashout.player_id)
        .maybeSingle();
      const playerName = playerProfile?.display_name || playerProfile?.username || 'Player';

      const { data: agentProfile } = await getSupabase()
        .from('profiles')
        .select('username, display_name')
        .eq('id', user.id)
        .maybeSingle();
      const agentName = agentProfile?.display_name || agentProfile?.username || 'Your agent';

      // ═════════════════════════════════════════════════════════════
      // APPROVE: Held chips → treasury (agent settles fiat off-platform)
      // ═════════════════════════════════════════════════════════════
      if (action === 'approve') {
        // Step 2: Atomic approval (updates request status + credits treasury + logs transaction)
        const { data: rpcResult, error: rpcErr } = await getSupabase().rpc('fn_approve_cashout_atomic', {
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

  ${agentName} approved your cashout of ${cashout.amount.toLocaleString()} chips.`,
          `[OK] Cashout approved! ${cashout.amount.toLocaleString()} chips`,
          'approve'
        );

        logAudit(supabaseAdmin, { actionType: 'cashout_approved', userId: user.id, targetUserId: cashout.player_id, clubId: cashout.club_id, amount: cashout.amount, ip: extractIP(req), details: { cashoutId, agentNote: note || 'Approved' } });
        return res.status(200).json({
          success: true,
          action: 'approved',
          amount: cashout.amount,
          playerId: cashout.player_id,
        });
      }

      // ═════════════════════════════════════════════════════════════
      // CANCEL: Return held chips to player's balance
      // ═════════════════════════════════════════════════════════════
      if (action === 'cancel') {
        // Atomic cancellation (updates status + credits player chips + logs transaction)
        const { data: rpcResult, error: rpcErr } = await getSupabase().rpc('fn_cancel_cashout_atomic', {
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
          `Cashout cancelled. ${cashout.amount.toLocaleString()} chips returned to your balance.`,
          'cancel'
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
      console.warn('[approve-cashout]', err);
      return res.status(500).json(safeErrorResponse(err, 'Cashout action failed'));
    }

  } catch (err) {
    try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * Send in-app message + push notification to the player
 */
async function notifyPlayer(cashout, playerName, agentName, messageText, pushText, action) {
  // In-app message
  // Rate limit

  try {
    // CRITICAL: param names are p_user_id / p_other_user_id (verified via
    // pg_get_function_result). The previous user1_id/user2_id call returned
    // PGRST202 every time, so cashout approval/cancellation in-app messages
    // silently never landed for any player (failures hidden by the catch
    // below). Fix mirrors pages/api/messenger/start-conversation.js.
    const { data: convResult, error: convErr } = await getSupabase().rpc('fn_get_or_create_conversation', {
      p_user_id: cashout.agent_id,
      p_other_user_id: cashout.player_id,
    });
    if (convErr) {
      console.warn('[approve-cashout] fn_get_or_create_conversation error:', convErr);
      return;
    }
    // RPC returns jsonb { success, conversation_id, created } — not a UUID.
    // Treating the whole jsonb as a UUID (the previous bug) made the
    // fn_send_message call fail with type-coercion 500.
    const convId = convResult?.success ? convResult.conversation_id : null;
    if (convId) {
      const { error: sendErr } = await getSupabase().rpc('fn_send_message', {
        p_conversation_id: convId,
        p_sender_id: cashout.agent_id,
        p_content: messageText,
      });
      if (sendErr) {
        console.warn('[approve-cashout] fn_send_message error:', sendErr);
      }
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
          title: action === 'approve' ? 'Cashout Approved' : 'Cashout Cancelled',
          message: pushText,
          url: '/hub/club-arena/cashier',
        }),
      });
    }
  } catch (e) {
      try { reportApiError(e, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[approve-cashout] Push notification failed:', e.message);
  }
}
