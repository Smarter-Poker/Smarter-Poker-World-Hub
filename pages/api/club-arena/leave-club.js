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
import { createClient } from '@supabase/supabase-js';
const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');
import { checkSettlementLock, sendLockedResponse } from '../../../src/lib/settlement-lock';

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

  const { clubId } = req.body;
  if (!clubId) return res.status(400).json({ error: 'clubId required' });

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
      .single();

    if (memErr || !member) {
      return res.status(404).json({ error: 'You are not a member of this club' });
    }

    const { data: club } = await supabaseAdmin
      .from('clubs')
      .select('id, name, owner_id')
      .eq('id', clubId)
      .single();

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
    // 4. CANCEL PENDING CASHOUT REQUESTS
    //    Return held_chips back to chip_balance first so we can
    //    sweep everything to treasury in one shot.
    // ═══════════════════════════════════════════════════════════════
    const { data: pendingCashouts } = await supabaseAdmin
      .from('cashout_requests')
      .select('id, amount')
      .eq('club_id', clubId)
      .eq('player_id', user.id)
      .eq('status', 'pending');

    let heldChipsReturned = 0;
    for (const co of (pendingCashouts || [])) {
      // Return held chips to player balance
      await supabaseAdmin.rpc('fn_credit_chips', {
        p_club_id: clubId,
        p_user_id: user.id,
        p_amount: co.amount,
      });
      heldChipsReturned += co.amount;

      // Cancel the request
      await supabaseAdmin
        .from('cashout_requests')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          agent_note: 'Auto-cancelled: player left club',
        })
        .eq('id', co.id);
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
      .single();

    const totalChips = freshMember?.chip_balance || 0;
    let chipsReturnedToTreasury = 0;

    if (totalChips > 0) {
      // Debit player → credit treasury (atomic RPCs)
      await supabaseAdmin.rpc('fn_debit_chips', {
        p_club_id: clubId,
        p_user_id: user.id,
        p_amount: totalChips,
      });
      await supabaseAdmin.rpc('fn_credit_treasury', {
        p_club_id: clubId,
        p_amount: totalChips,
      });

      chipsReturnedToTreasury = totalChips;

      // Audit trail
      await supabaseAdmin.from('chip_transactions').insert({
        club_id: clubId,
        from_user_id: user.id,
        to_user_id: null,
        amount: totalChips,
        transaction_type: 'withdrawal',
        notes: `Player left club — ${totalChips.toLocaleString()} chips returned to club treasury`,
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // 6. LOG OUTSTANDING CREDIT (forgiven on leave)
    // ═══════════════════════════════════════════════════════════════
    const creditUsed = member.credit_used || 0;
    if (creditUsed > 0) {
      await supabaseAdmin.from('chip_transactions').insert({
        club_id: clubId,
        from_user_id: user.id,
        to_user_id: null,
        amount: creditUsed,
        transaction_type: 'credit_forgiven',
        notes: `Player left club with ${creditUsed.toLocaleString()} outstanding credit — written off`,
      });
    }

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
      metadata: notifMetadata,
      read: false,
    }).catch(e => console.error('[leave-club] Owner notification error:', e.message));

    // Notify assigned agent (in-app) — if different from owner
    if (member.agent_id && member.agent_id !== club.owner_id) {
      await supabaseAdmin.from('notifications').insert({
        user_id: member.agent_id,
        type: 'club_member_left',
        title: notifTitle,
        message: notifMessage,
        metadata: notifMetadata,
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
      }).catch(() => {});

      // Push to agent
      if (member.agent_id && member.agent_id !== club.owner_id) {
        fetch(`${baseUrl}/api/notifications/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-secret': process.env.ADMIN_ROUTE_SECRET || '',
          },
          body: JSON.stringify({ ...pushPayload, userId: member.agent_id }),
        }).catch(() => {});
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // RESPONSE
    // ═══════════════════════════════════════════════════════════════
    return res.status(200).json({
      success: true,
      message: `You have left ${club.name}`,
      chipsReturned: chipsReturnedToTreasury,
      pendingCashoutsCancelled: pendingCashouts?.length || 0,
      creditWrittenOff: creditUsed,
    });

  } catch (err) {
    console.error('[leave-club]', err);
    return res.status(500).json({ error: err.message || 'Failed to leave club' });
  }
}
