/**
 * POST /api/club-arena/leave-club
 *
 * Player voluntarily leaves a club.
 *
 * FLOW:
 *   1. Validate membership exists
 *   2. Block if owner (must transfer ownership first)
 *   3. Block during settlement lock
 *   4. Cancel any pending cashout requests → return held chips
 *   5. Return ALL chip_balance to club treasury
 *   6. Log credit_used (if any outstanding credit, it's forgiven)
 *   7. If agent, clean up downline relationships
 *   8. Delete membership record
 *   9. Update club member count
 *  10. Notify club owner + assigned agent (in-app + push)
 *
 * Body: { clubId }
 * Auth: Bearer token (the leaving player)
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');
import { checkSettlementLock, sendLockedResponse } from '../../../src/lib/settlement-lock';
const { isUUID, rejectBadPayload } = require('../../../src/lib/club-arena/validate');
const { checkIdempotency, cacheResponse } = require('../../../src/lib/club-arena/idempotency');
const { safeErrorResponse } = require('../../../src/lib/club-arena/sanitize');
import { reportApiError } from '../../../src/lib/sentryWrap';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  try {

  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // RED TEAM: Payload size + field allowlist
  if (rejectBadPayload(req, res, ['clubId'])) return;

  // CONCURRENCY: Idempotency guard — prevent double-tap leave race
  if (checkIdempotency(req, res)) return;

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No auth token' });

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  const user = authData?.user;
  if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

  const { clubId } = req.body;
  // RED TEAM: Strict UUID validation
  if (!isUUID(clubId)) return res.status(400).json({ error: 'Invalid clubId format' });

  if (!applyRateLimit(req, res, 'club-arena/leave-club')) return;

  try {
    // ═══════════════════════════════════════════════════════════════
    // 1. GET MEMBERSHIP + CLUB INFO
    // ═══════════════════════════════════════════════════════════════
    const { data: member, error: memErr } = await supabaseAdmin
      .from('club_members')
      // 2026-08-15 CHECK 13 fix: no `id` column on club_members — the select
      // 42703'd and EVERY leave-club request answered 404 'not a member'.
      .select('user_id, role, chip_balance, held_chips, credit_used, credit_limit, agent_id, nickname, display_name')
      .eq('club_id', clubId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (memErr || !member) {
      return res.status(404).json({ error: 'You are not a member of this club' });
    }

    const { data: club } = await supabaseAdmin
      .from('clubs')
      .select('id, name, owner_id')
      .eq('id', clubId)
      .maybeSingle();

    if (!club) return res.status(404).json({ error: 'Club not found' });

    // ═══════════════════════════════════════════════════════════════
    // 2. BLOCK OWNER — Must transfer ownership first
    // ═══════════════════════════════════════════════════════════════
    if (member.role === 'owner' || club.owner_id === user.id) {
      return res.status(403).json({
        error: 'Club owners cannot leave. Transfer ownership first or delete the club.',
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // 3. SETTLEMENT LOCK CHECK
    // ═══════════════════════════════════════════════════════════════
    const lockCheck = await checkSettlementLock(supabaseAdmin, clubId);
    if (lockCheck.locked) return sendLockedResponse(res, lockCheck);

    // ═══════════════════════════════════════════════════════════════
    // 3b. BLOCK IF SEATED AT TABLE — Chips locked in escrow would be lost
    // ═══════════════════════════════════════════════════════════════
    // CHECK 13 (2026-08-14): this guard has been a NO-OP since it shipped.
    // It queried player_id / table_id / status 'locked' — the live table has
    // user_id / related_id and a status CHECK of held|released|captured|
    // expired. The query 42703'd, the un-checked destructure left
    // activeEscrow undefined, and the "block leaving with locked chips"
    // protection below never blocked anyone. Aligned to the real schema
    // (table-seat holds are written with related_id = table id, status
    // 'held' — see the mapping note in ChipBridge.lockChips).
    const { data: activeEscrow, error: escrowErr } = await supabaseAdmin
      .from('chip_escrow_holds')
      .select('id, related_id, amount')
      .eq('user_id', user.id)
      .eq('status', 'held')
      .limit(5);
    if (escrowErr) {
      // Fail CLOSED on a money guard: an unreadable escrow state must block
      // the leave, not wave it through the way the silent 42703 used to.
      console.warn('[leave-club] escrow check failed:', escrowErr.message);
      return res.status(503).json({
        success: false,
        error: 'Could not verify your table status. Try again in a moment.',
      });
    }

    // Filter to escrow records belonging to tables in THIS club
    if (activeEscrow && activeEscrow.length > 0) {
      const { data: clubTables } = await supabaseAdmin
        .from('tables')
        .select('id')
        .eq('club_id', clubId)
        .in('id', activeEscrow.map(e => e.related_id));

      const lockedAtClubTables = (clubTables || []).map(t => t.id);
      const clubEscrow = activeEscrow.filter(e => lockedAtClubTables.includes(e.related_id));

      if (clubEscrow.length > 0) {
        const totalLocked = clubEscrow.reduce((s, e) => s + (e.amount || 0), 0);
        return res.status(400).json({
          success: false,
          error: 'You are currently seated at a table. Stand up from all tables before leaving the club.',
          lockedChips: totalLocked,
          tables: clubEscrow.map(e => e.related_id),
        });
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // 4. CANCEL PENDING CASHOUT REQUESTS
    //    Return held_chips back to chip_balance first so we can
    //    sweep everything to treasury in one shot.
    // ═══════════════════════════════════════════════════════════════
    const { data: pendingCashouts } = await supabaseAdmin
      .from('cashout_requests')
      .select('id, amount')
      .eq('club_id', clubId)
      .eq('player_id', user.id)
      .eq('status', 'pending')
      .limit(200);

    let heldChipsReturned = 0;
    for (const co of (pendingCashouts || [])) {
      // Return held chips to player balance
      const { data: creditHeldRes, error: creditHeldRpcErr } = await supabaseAdmin.rpc('fn_credit_chips', {
        p_club_id: clubId,
        p_user_id: user.id,
        p_amount: co.amount,
      });
      // fn_credit_chips RETURNS {success:false} instead of raising, so the
      // transport error alone cannot tell a refused credit from a real one.
      const creditHeldOk = !creditHeldRpcErr && creditHeldRes?.success === true;
      if (!creditHeldOk) {
        console.warn(
          '[leave-club] fn_credit_chips for held cashout failed:',
          creditHeldRpcErr?.message || creditHeldRes?.error || 'credit refused'
        );
        // Leave the request pending: the chips are still held, so cancelling it
        // here would strand them. A retry of leave-club can pick it up.
        continue;
      }
      heldChipsReturned += co.amount;

      // Cancel the request
      const { error: err_cashout_requests_bmcqu } = await supabaseAdmin
        .from('cashout_requests')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          agent_note: 'Auto-cancelled: player left club',
        })
        .eq('id', co.id);
      if (err_cashout_requests_bmcqu) console.warn('[Supabase] Silent mutation failed in cashout_requests:', err_cashout_requests_bmcqu.message);
    }

    // ═══════════════════════════════════════════════════════════════
    // 5. RETURN ALL CHIPS TO CLUB TREASURY
    //    Re-read balance after cashout cancellation (may have changed)
    // ═══════════════════════════════════════════════════════════════
    const { data: freshMember } = await supabaseAdmin
      .from('club_members')
      .select('chip_balance')
      .eq('club_id', clubId)
      .eq('user_id', user.id)
      .maybeSingle();

    const totalChips = freshMember?.chip_balance || 0;
    let chipsReturnedToTreasury = 0;

    if (totalChips > 0) {
      // Debit player → credit treasury (atomic RPCs)
      const { data: debitRes, error: debitRpcErr } = await supabaseAdmin.rpc('fn_debit_chips', {
        p_club_id: clubId,
        p_user_id: user.id,
        p_amount: totalChips,
      });

      // fn_debit_chips RETURNS {success:false} on insufficient balance or a
      // lost race — it does not raise. Treating that as success fell through to
      // the treasury credit below and MINTED chips the player still holds.
      const debitErr =
        debitRpcErr ||
        (debitRes?.success ? null : new Error(debitRes?.error || 'chip debit refused'));

      if (debitErr) {
        console.warn('[leave-club] Player debit failed (possible race):', debitErr.message);
        // Don't credit treasury — chips weren't actually debited
      } else {
        const { data: creditTreasuryRes, error: creditTreasuryRpcErr } = await supabaseAdmin.rpc('fn_credit_treasury', {
          p_club_id: clubId,
          p_amount: totalChips,
        });
        const creditTreasuryErr =
          creditTreasuryRpcErr ||
          (creditTreasuryRes?.success ? null : new Error(creditTreasuryRes?.error || 'treasury credit refused'));
        if (creditTreasuryErr) {
          console.warn('[leave-club] fn_credit_treasury failed after successful debit — chips may be lost:', creditTreasuryErr.message);
        } else {
          chipsReturnedToTreasury = totalChips;

          // Audit trail
          const { error: chipTxErr } = await supabaseAdmin.from('chip_transactions').insert({
            club_id: clubId,
            from_user_id: user.id,
            to_user_id: null,
            amount: totalChips,
            transaction_type: 'withdrawal',
            notes: `Player left club — ${totalChips.toLocaleString()} chips returned to club treasury`,
          });
          if (chipTxErr) console.warn('[leave-club] Failed to log chip tx:', chipTxErr.message);
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // 6. LOG OUTSTANDING CREDIT (forgiven on leave)
    // ═══════════════════════════════════════════════════════════════
    const creditUsed = member.credit_used || 0;
    if (creditUsed > 0) {
      const { error: creditTxErr } = await supabaseAdmin.from('chip_transactions').insert({
        club_id: clubId,
        from_user_id: user.id,
        to_user_id: null,
        amount: creditUsed,
        transaction_type: 'credit_forgiven',
        notes: `Player left club with ${creditUsed.toLocaleString()} outstanding credit — written off`,
      });
      if (creditTxErr) console.warn('[leave-club] Failed to log credit forgiven tx:', creditTxErr.message);
    }

    // ═══════════════════════════════════════════════════════════════
    // 7. IF AGENT — Clean up downline
    // ═══════════════════════════════════════════════════════════════
    if (['agent', 'sub_agent', 'super_agent'].includes(member.role)) {
      // Unassign all players under this agent
      const { error: err_club_members_xgak1 } = await supabaseAdmin
        .from('club_members')
        .update({ agent_id: null })
        .eq('club_id', clubId)
        .eq('agent_id', user.id);
      if (err_club_members_xgak1) console.warn('[Supabase] Silent mutation failed in club_members:', err_club_members_xgak1.message);

      // Deactivate agent record
      const { error: err_agents_tbeu7 } = await supabaseAdmin
        .from('agents')
        .update({ status: 'inactive', active_player_count: 0 })
        .eq('user_id', user.id)
        .eq('club_id', clubId);
      if (err_agents_tbeu7) console.warn('[Supabase] Silent mutation failed in agents:', err_agents_tbeu7.message);
    }

    // ═══════════════════════════════════════════════════════════════
    // 8. DELETE MEMBERSHIP
    // ═══════════════════════════════════════════════════════════════
    const { error: delErr } = await supabaseAdmin
      .from('club_members')
      .delete()
      .eq('club_id', clubId)
      .eq('user_id', user.id);

    if (delErr) throw delErr;

    // ═══════════════════════════════════════════════════════════════
    // 9. UPDATE MEMBER COUNT
    // ═══════════════════════════════════════════════════════════════
    const { count } = await supabaseAdmin
      .from('club_members')
      .select('*', { count: 'exact', head: true })
      .eq('club_id', clubId)
      .limit(500);

    const { error: err_clubs_b7i9i } = await supabaseAdmin

      .from('clubs')

      .update({ member_count: count || 0 })
      .eq('id', clubId);

    if (err_clubs_b7i9i) console.warn('[Supabase] Silent mutation failed in clubs:', err_clubs_b7i9i.message);

    // ═══════════════════════════════════════════════════════════════
    // 10. NOTIFY MANAGEMENT — Owner + Agent
    // ═══════════════════════════════════════════════════════════════
    const playerName = member.nickname || member.display_name || 'A player';
    const notifTitle = `👋 ${playerName} left ${club.name}`;
    const notifMessage = [
      `${playerName} has voluntarily left the club.`,
      chipsReturnedToTreasury > 0
        ? `${chipsReturnedToTreasury.toLocaleString()} chips returned to club treasury.`
        : 'Player had no chips.',
      heldChipsReturned > 0
        ? `${heldChipsReturned.toLocaleString()} held chips from pending cashout(s) were also returned.`
        : null,
      creditUsed > 0
        ? `⚠️ ${creditUsed.toLocaleString()} outstanding credit was written off.`
        : null,
    ].filter(Boolean).join(' ');

    const notifMetadata = {
      club_id: clubId,
      player_id: user.id,
      player_name: playerName,
      chips_returned: chipsReturnedToTreasury,
      held_chips_returned: heldChipsReturned,
      credit_written_off: creditUsed,
      role: member.role,
    };

    const { error: ownerNotifErr } = await supabaseAdmin.from('notifications').insert({
      user_id: club.owner_id,
      type: 'club_member_left',
      title: notifTitle,
      message: notifMessage,
      data: notifMetadata,
      read: false,
    });
    if (ownerNotifErr) console.warn('[leave-club] Owner notification error:', ownerNotifErr.message);

      const { error: agentNotifErr } = await supabaseAdmin.from('notifications').insert({
        user_id: member.agent_id,
        type: 'club_member_left',
        title: notifTitle,
        message: notifMessage,
        data: notifMetadata,
        read: false,
      });
      if (agentNotifErr) console.warn('[leave-club] Agent notification error:', agentNotifErr.message);

    // Push notifications — fire-and-forget
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');

    if (baseUrl) {
      const pushPayload = {
        title: notifTitle,
        message: notifMessage,
        url: '/hub/club-arena/admin?tab=members',
      };

      // Push to owner
      fetch(`${baseUrl}/api/notifications/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': process.env.ADMIN_ROUTE_SECRET || '',
        },
        body: JSON.stringify({ ...pushPayload, userId: club.owner_id }),
      }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));

      // Push to agent
      if (member.agent_id && member.agent_id !== club.owner_id) {
        fetch(`${baseUrl}/api/notifications/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-secret': process.env.ADMIN_ROUTE_SECRET || '',
          },
          body: JSON.stringify({ ...pushPayload, userId: member.agent_id }),
        }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // RESPONSE
    // ═══════════════════════════════════════════════════════════════
    const responseBody = {
      success: true,
      message: `You have left ${club.name}`,
      chipsReturned: chipsReturnedToTreasury,
      pendingCashoutsCancelled: pendingCashouts?.length || 0,
      creditWrittenOff: creditUsed,
    };
    cacheResponse(req, 200, responseBody);
    return res.status(200).json(responseBody);

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[leave-club]', err);
    return res.status(500).json(safeErrorResponse(err, 'Failed to leave club'));
  }

  } catch (err) {
    console.warn('[API] Unhandled exception in handler:', err?.message || err);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Internal server error', message: err?.message || 'Unknown error' });
    }
  }
}
