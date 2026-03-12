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

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // RED TEAM: Payload size + field allowlist
  if (rejectBadPayload(req, res, ['clubId'])) return;

  // CONCURRENCY: Idempotency guard — prevent double-tap leave race
  if (checkIdempotency(req, res)) return;

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No auth token' });

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
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
      .select('id, user_id, role, chip_balance, held_chips, credit_used, credit_limit, agent_id, nickname, display_name')
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
    const { data: activeEscrow } = await supabaseAdmin
      .from('chip_escrow')
      .select('id, table_id, amount')
      .eq('player_id', user.id)
      .eq('status', 'locked')
      .limit(5);

    // Filter to escrow records belonging to tables in THIS club
    if (activeEscrow && activeEscrow.length > 0) {
      const { data: clubTables } = await supabaseAdmin
        .from('tables')
        .select('id')
        .eq('club_id', clubId)
        .in('id', activeEscrow.map(e => e.table_id));

      const lockedAtClubTables = (clubTables || []).map(t => t.id);
      const clubEscrow = activeEscrow.filter(e => lockedAtClubTables.includes(e.table_id));

      if (clubEscrow.length > 0) {
        const totalLocked = clubEscrow.reduce((s, e) => s + (e.amount || 0), 0);
        return res.status(400).json({
          success: false,
          error: 'You are currently seated at a table. Stand up from all tables before leaving the club.',
          lockedChips: totalLocked,
          tables: clubEscrow.map(e => e.table_id),
        });
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // 4 & 5 & 6. ATOMIC SWEEP (Cancel cashouts + Sweep chips + Log credit)
    // ═══════════════════════════════════════════════════════════════
    const { data: sweepResult, error: sweepErr } = await supabaseAdmin.rpc('fn_leave_club_atomic', {
      p_club_id: clubId,
      p_user_id: user.id
    });

    if (sweepErr) {
      throw sweepErr;
    }

    const heldChipsReturned = sweepResult?.held_chips_returned || 0;
    const chipsReturnedToTreasury = sweepResult?.chips_returned || 0;
    const creditUsed = sweepResult?.credit_written_off || 0;
    const pendingCashoutsCount = 0; // Handled internally by RPC, exact count not strictly needed for UI message

    // ═══════════════════════════════════════════════════════════════
    // 7. IF AGENT — Clean up downline
    // ═══════════════════════════════════════════════════════════════
    if (['agent', 'sub_agent', 'super_agent'].includes(member.role)) {
      // Unassign all players under this agent
      await supabaseAdmin
        .from('club_members')
        .update({ agent_id: null })
        .eq('club_id', clubId)
        .eq('agent_id', user.id);

      // Deactivate agent record
      await supabaseAdmin
        .from('agents')
        .update({ status: 'inactive', active_player_count: 0 })
        .eq('user_id', user.id)
        .eq('club_id', clubId);
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
      .eq('club_id', clubId);

    await supabaseAdmin
      .from('clubs')
      .update({ member_count: count || 0 })
      .eq('id', clubId);

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

    // Notify club owner (in-app)
    await supabaseAdmin.from('notifications').insert({
      user_id: club.owner_id,
      type: 'club_member_left',
      title: notifTitle,
      message: notifMessage,
      data: notifMetadata,
      read: false,
    }).catch(e => console.error('[leave-club] Owner notification error:', e.message));

    // Notify assigned agent (in-app) — if different from owner
    if (member.agent_id && member.agent_id !== club.owner_id) {
      await supabaseAdmin.from('notifications').insert({
        user_id: member.agent_id,
        type: 'club_member_left',
        title: notifTitle,
        message: notifMessage,
        data: notifMetadata,
        read: false,
      }).catch(e => console.error('[leave-club] Agent notification error:', e.message));
    }

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
      }).catch(() => { });

      // Push to agent
      if (member.agent_id && member.agent_id !== club.owner_id) {
        fetch(`${baseUrl}/api/notifications/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-secret': process.env.ADMIN_ROUTE_SECRET || '',
          },
          body: JSON.stringify({ ...pushPayload, userId: member.agent_id }),
        }).catch(() => { });
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // RESPONSE
    // ═══════════════════════════════════════════════════════════════
    const responseBody = {
      success: true,
      message: `You have left ${club.name}`,
      chipsReturned: chipsReturnedToTreasury,
      pendingCashoutsCancelled: pendingCashoutsCount,
      creditWrittenOff: creditUsed,
    };
    cacheResponse(req, 200, responseBody);
    return res.status(200).json(responseBody);

  } catch (err) {
    console.error('[leave-club]', err);
    return res.status(500).json(safeErrorResponse(err, 'Failed to leave club'));
  }
}
