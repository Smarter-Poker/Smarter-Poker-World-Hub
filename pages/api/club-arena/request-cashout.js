import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * POST /api/club-arena/request-cashout
 * 
 * Player requests to cash out chips.
 * 
 * FLOW:
 *   1. Validate player has enough chips
 *   2. HOLD chips (deduct from balance => escrow)
 *   3. Create cashout_request (status: 'pending')
 *   4. Send in-app message to agent via messenger
 *   5. Send push notification to agent
 * 
 * RULES:
 *   - Chips are HELD immediately so player can't play them
 *   - Only the assigned agent (or club owner) can approve/cancel
 *   - If agent cancels, held chips return to player's balance
 *   - One pending request per player per club at a time
 * 
 * Body: { clubId, amount, note? }
 * Auth: Bearer token (player requesting cashout)
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');
import { checkSettlementLock, sendLockedResponse } from '../../../src/lib/settlement-lock';
const { checkIdempotency, cacheResponse } = require('../../../src/lib/club-arena/idempotency');
const { sanitizeNote, safeErrorResponse } = require('../../../src/lib/club-arena/sanitize');
const { isUUID, validateAmount, rejectBadPayload } = require('../../../src/lib/club-arena/validate');
const { logAudit, extractIP } = require('../../../src/lib/club-arena/auditLogger');
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

    // RED TEAM: Payload size + field allowlist (shared utility)
    if (rejectBadPayload(req, res, ['clubId', 'amount', 'note'])) return;

    // Idempotency guard — prevent double-charges on laggy mobile networks
    if (checkIdempotency(req, res)) return;

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'No auth token' });

    const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
    const user = authData?.user;
    if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

    const { clubId, amount: rawAmount, note: rawNote } = req.body;

    // RED TEAM: Strict UUID validation
    if (!isUUID(clubId)) return res.status(400).json({ success: false, error: 'Invalid clubId format' });

    // RED TEAM: Strict amount validation (min 100, no fractionals, max 100M)
    const amtResult = validateAmount(rawAmount, 100, 100_000_000);
    if (!amtResult.valid) return res.status(400).json({ success: false, error: amtResult.error });
    const amount = amtResult.value;

    // RED TEAM: Sanitize note
    const note = sanitizeNote(rawNote, 200);

    // Settlement lock check — block during Monday 4:00-4:10 AM CST
    const lockCheck = await checkSettlementLock(supabaseAdmin, clubId);
    if (lockCheck.locked) return sendLockedResponse(res, lockCheck);

    // Rate limit
    if (!applyRateLimit(req, res, 'club-arena/request-cashout')) return;

    try {
      // ═════════════════════════════════════════════════════════════
      // 1. Get player's membership
      // ═════════════════════════════════════════════════════════════
      const { data: member, error: memErr } = await getSupabase()
        .from('club_members')
        .select('user_id, role, chip_balance, agent_id, nickname')
        .eq('club_id', clubId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (memErr || !member) return res.status(404).json({ success: false, error: 'Not a member of this club' });

      // ═════════════════════════════════════════════════════════════
      // IN-PLAY LOCK — Block cashout while seated at an active table
      // ═════════════════════════════════════════════════════════════
      const { data: activeSeat } = await getSupabase()
        .from('table_sessions')
        .select('id, table_id')
        .eq('club_id', clubId)
        .eq('player_id', user.id)
        .eq('is_active', true)
        .limit(1);

      if (activeSeat?.length > 0) {
        return res.status(409).json({
          success: false,
          error: 'Cannot cash out while seated at a table. Leave the table first.',
          in_play: true,
          table_id: activeSeat[0].table_id,
        });
      }

      if (amount > member.chip_balance) {
        return res.status(400).json({
          success: false, error: 'Insufficient chips',
          available: member.chip_balance,
          requested: amount,
        });
      }

      if (!member.agent_id) {
        return res.status(400).json({ success: false, error: 'No agent assigned. Contact club owner.' });
      }

      // ═════════════════════════════════════════════════════════════
      // 2. ATOMIC CASHOUT REQUEST (Debit + Escrow Transaction + Request)
      // ═════════════════════════════════════════════════════════════
      const { data: result, error: rpcErr } = await getSupabase().rpc('fn_request_cashout', {
        p_club_id: clubId,
        p_player_id: user.id,
        p_agent_id: member.agent_id,
        p_amount: amount,
        p_note: note || `Cashout request: ${amount.toLocaleString()} chips`
      });

      if (rpcErr) {
        // fn_request_cashout RAISES on failure (insufficient balance, duplicate
        // pending, etc.) — surface that as the error, not a generic 500.
        console.warn('[request-cashout] RPC Error:', rpcErr);
        const msg = rpcErr.message || '';
        const isBalanceErr = /insufficient/i.test(msg);
        const isDuplicate = /duplicate|already|pending/i.test(msg);
        return res.status(isBalanceErr ? 400 : isDuplicate ? 409 : 500).json({
          success: false,
          error: isBalanceErr
            ? 'Insufficient balance'
            : isDuplicate
              ? 'You already have a pending cashout request'
              : 'Cashout request failed',
        });
      }

      // FIX-C1 2026-07-19: fn_request_cashout RETURNS a bare uuid (the new
      // cashout id) on success and RAISES on failure. The old code tested
      // `result.success` (undefined on a scalar) so EVERY successful request
      // returned 409 "failed" — while the RPC had already committed the escrow
      // debit + pending row. Players were charged, told it failed, and retried,
      // multiplying the debit. A returned id (any non-error result) = success.
      const cashoutId = typeof result === 'string' ? result : result?.cashout_id || result?.id;
      if (!cashoutId) {
        return res.status(409).json({ success: false, error: 'Cashout request failed' });
      }

      // Removed manual chip_transactions log — handled atomically by fn_request_cashout

      // ═════════════════════════════════════════════════════════════
      // 6. Get player display name for notifications
      // ═════════════════════════════════════════════════════════════
      const { data: playerProfile } = await getSupabase()
        .from('profiles')
        .select('username, display_name, full_name')
        .eq('id', user.id)
        .maybeSingle();

      const playerName = playerProfile?.display_name
        || playerProfile?.full_name
        || playerProfile?.username
        || member.nickname
        || 'A player';

      // ═════════════════════════════════════════════════════════════
      // 7. Send in-app message to agent via messenger
      // ═════════════════════════════════════════════════════════════
      // Rate limit

      try {
        // CRITICAL: param names are p_user_id / p_other_user_id (verified
        // via pg_get_function_result). user1_id/user2_id always returned
        // PGRST202 → no agent ever received a cashout-request in-app
        // message because the failure was hidden by the catch below.
        const { data: convResult, error: convErr } = await getSupabase().rpc('fn_get_or_create_conversation', {
          p_user_id: user.id,
          p_other_user_id: member.agent_id,
        });
        if (convErr) {
          console.warn('[request-cashout] fn_get_or_create_conversation error:', convErr);
        } else {
          // RPC returns jsonb { success, conversation_id, created } — extract the UUID.
          const convId = convResult?.success ? convResult.conversation_id : null;
          if (convId) {
            const { error: sendErr } = await getSupabase().rpc('fn_send_message', {
              p_conversation_id: convId,
              p_sender_id: user.id,
              p_content: `[CASHOUT REQUEST]\n\n${playerName} is requesting to cash out ${amount.toLocaleString()} chips.\n\nGo to your Agent Dashboard to approve or cancel.`,
            });
            if (sendErr) {
              console.warn('[request-cashout] fn_send_message error:', sendErr);
            }
          }
        }
      } catch (msgErr) {
        console.warn('[request-cashout] Messenger notification failed:', msgErr.message);
      }

      // ═════════════════════════════════════════════════════════════
      // 8. Send push notification to agent
      // ═════════════════════════════════════════════════════════════
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
              userId: member.agent_id,
              title: 'Cashout Request',
              message: `${playerName} wants to cash out ${amount.toLocaleString()} chips`,
              url: '/hub/club-arena/admin?tab=cashouts',
            }),
          });
        }
      } catch (pushErr) {
        console.warn('[request-cashout] Push notification failed:', pushErr.message);
      }

      const responseBody = {
        success: true,
        cashoutId: cashoutId,
        amount,
        status: 'pending',
        remainingBalance: member.chip_balance - amount,
        agentNotified: true,
        message: `${amount.toLocaleString()} chips held. Your agent has been notified.`,
      };
      logAudit(supabaseAdmin, { actionType: 'cashout_requested', userId: user.id, clubId, amount, ip: extractIP(req), details: { cashoutId: cashoutId, remainingBalance: member.chip_balance - amount, agentId: member.agent_id } });
      cacheResponse(req, 200, responseBody);
      return res.status(200).json(responseBody);
    } catch (err) {
      console.warn('[request-cashout]', err);
      return res.status(500).json(safeErrorResponse(err, 'Cashout request failed'));
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
