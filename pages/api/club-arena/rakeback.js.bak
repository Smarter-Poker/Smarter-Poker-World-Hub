/**
 * /api/club-arena/rakeback
 *
 * GET  ?clubId=xxx&action=status    — Get current rakeback period status + player's rakeback
 * GET  ?clubId=xxx&action=history   — Get player's rakeback history
 * POST { action: 'open'|'close'|'claim', clubId }
 *   open  — Owner starts a new rakeback period
 *   close — Owner closes period, calculates rakeback for all players
 *   claim — Player claims their pending rakeback
 *
 * Auth: Bearer token
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { checkSettlementLock, sendLockedResponse } from '../../../src/lib/settlement-lock';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { getServerUser } from '../../../src/lib/serverAuth';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, error: 'No auth token' });

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

  try {
    // ═══════════════════════════════════════════════════════════════
    // GET — Status or History
    // ═══════════════════════════════════════════════════════════════
    if (req.method === 'GET') {
      const { clubId, action: getAction } = req.query;
      if (!clubId) return res.status(400).json({ success: false, error: 'clubId required' });

      // Verify membership
      const { data: member } = await supabaseAdmin
        .from('club_members')
        .select('role, chip_balance')
        .eq('club_id', clubId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!member) return res.status(403).json({ success: false, error: 'Not a club member' });

      if (getAction === 'history') {
        // Player's rakeback history
        const { data: history } = await supabaseAdmin
          .from('rakeback_periods')
          .select('*')
          .eq('club_id', clubId)
          .eq('player_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50);

        return res.status(200).json({ success: true, history: history || [] });
      }

      // Default: status
      // Get active rakeback period for club
      const { data: activePeriod } = await supabaseAdmin
        .from('rakeback_periods')
        .select('*')
        .eq('club_id', clubId)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Get player's unclaimed rakeback
      const { data: pendingRakebacks } = await supabaseAdmin
        .from('rakeback_periods')
        .select('*')
        .eq('club_id', clubId)
        .eq('player_id', user.id)
        .eq('status', 'closed')
        .gt('rakeback_amount', 0);

      const totalPending = (pendingRakebacks || []).reduce((s, r) => s + (r.rakeback_amount || 0), 0);

      // Get club's rakeback rate from settings
      const { data: club } = await supabaseAdmin
        .from('clubs')
        .select('settings')
        .eq('id', clubId)
        .maybeSingle();

      const rakebackRate = club?.settings?.rakeback_rate || 0.10; // default 10%

      return res.status(200).json({
        success: true,
        activePeriod,
        pendingRakeback: totalPending,
        pendingCount: (pendingRakebacks || []).length,
        rakebackRate,
        role: member.role,
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // POST — Open / Close / Claim
    // ═══════════════════════════════════════════════════════════════
    if (req.method === 'POST') {
      const { action, clubId } = req.body;
      if (!clubId || !action) return res.status(400).json({ success: false, error: 'clubId and action required' });

      // Settlement lock check
      const lockCheck = await checkSettlementLock(supabaseAdmin, clubId);
      if (lockCheck.locked) return sendLockedResponse(res, lockCheck);

      // Verify membership
      const { data: member } = await supabaseAdmin
        .from('club_members')
        .select('role')
        .eq('club_id', clubId)
        .eq('user_id', user.id)
        .maybeSingle();

      // Union admin fallback — union admins are not club members but can manage rakeback
      let effectiveRole = member?.role || null;
      if (!member) {
        const { data: clubInfo } = await supabaseAdmin
          .from('clubs').select('union_id').eq('id', clubId).maybeSingle();
        if (clubInfo?.union_id) {
          const { data: ua } = await supabaseAdmin
            .from('union_admins').select('role')
            .eq('union_id', clubInfo.union_id).eq('user_id', user.id).maybeSingle();
          if (ua) effectiveRole = 'owner'; // union admins get full access
        }
      }

      if (!effectiveRole) return res.status(403).json({ success: false, error: 'Not authorized for this club' });

      // ─── OPEN NEW PERIOD ───
      if (action === 'open') {
        if (!['owner', 'admin'].includes(effectiveRole)) {
          return res.status(403).json({ success: false, error: 'Only owners/admins can open rakeback periods' });
        }

        // Check no existing open period
        const { data: existing } = await supabaseAdmin
          .from('rakeback_periods')
          .select('id')
          .eq('club_id', clubId)
          .eq('status', 'open')
          .limit(1)
          .maybeSingle();

        if (existing) return res.status(400).json({ success: false, error: 'A rakeback period is already open' });

        // Create a marker period (player_id = null means it's the master period)
        const { data: period, error } = await supabaseAdmin
          .from('rakeback_periods')
          .insert({
            club_id: clubId,
            player_id: null,
            status: 'open',
            rake_contributed: 0,
            rakeback_amount: 0,
            period_start: new Date().toISOString(),
          })
          .select()
          .single();

        if (error) throw error;
        return res.status(200).json({ success: true, period });
      }

      // ─── CLOSE PERIOD (calculate rakeback for all players) ───
      if (action === 'close') {
        if (!['owner', 'admin'].includes(effectiveRole)) {
          return res.status(403).json({ success: false, error: 'Only owners/admins can close rakeback periods' });
        }

        // Find open period
        const { data: openPeriod } = await supabaseAdmin
          .from('rakeback_periods')
          .select('*')
          .eq('club_id', clubId)
          .eq('status', 'open')
          .is('player_id', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!openPeriod) return res.status(400).json({ success: false, error: 'No open rakeback period found' });

        // Get club's rakeback rate
        const { data: club } = await supabaseAdmin
          .from('clubs')
          .select('settings')
          .eq('id', clubId)
          .maybeSingle();

        const rakebackRate = club?.settings?.rakeback_rate || 0.10;

        // Get all rake records since period started
        const { data: rakeRecords } = await supabaseAdmin
          .from('rake_records')
          .select('player_contributions')
          .eq('club_id', clubId)
          .gte('created_at', openPeriod.period_start);

        // Aggregate rake per player
        const playerRake = {};
        for (const record of (rakeRecords || [])) {
          const contributions = record.player_contributions || {};
          for (const [playerId, amount] of Object.entries(contributions)) {
            playerRake[playerId] = (playerRake[playerId] || 0) + amount;
          }
        }

        // Create rakeback records for each player
        const inserts = [];
        for (const [playerId, totalRake] of Object.entries(playerRake)) {
          if (totalRake <= 0) continue;
          const rakebackAmount = Math.floor(totalRake * rakebackRate);
          if (rakebackAmount <= 0) continue;
          inserts.push({
            club_id: clubId,
            player_id: playerId,
            status: 'closed',
            rake_contributed: totalRake,
            rakeback_amount: rakebackAmount,
            period_start: openPeriod.period_start,
            period_end: new Date().toISOString(),
          });
        }

        if (inserts.length > 0) {
          const { error: insertErr } = await supabaseAdmin
            .from('rakeback_periods')
            .insert(inserts);
          if (insertErr) throw insertErr;
        }

        // Close master period
        await supabaseAdmin
          .from('rakeback_periods')
          .update({ status: 'closed', period_end: new Date().toISOString() })
          .eq('id', openPeriod.id);

        return res.status(200).json({
          success: true,
          playersProcessed: inserts.length,
          totalRakebackDistributed: inserts.reduce((s, i) => s + i.rakeback_amount, 0),
        });
      }

      // ─── CLAIM RAKEBACK (player) ───
      if (action === 'claim') {
        // Atomically claim pending periods — prevents double-claim race
        // Mark as 'claiming' first (only succeeds if still 'closed')
        const { data: pending } = await supabaseAdmin
          .from('rakeback_periods')
          .update({ status: 'claiming' })
          .eq('club_id', clubId)
          .eq('player_id', user.id)
          .eq('status', 'closed')
          .gt('rakeback_amount', 0)
          .select('id, rakeback_amount');

        if (!pending || pending.length === 0) {
          return res.status(400).json({ success: false, error: 'No pending rakeback to claim' });
        }

        const totalClaim = pending.reduce((s, p) => s + (p.rakeback_amount || 0), 0);

        // BUG #152 FIX: Debit treasury FIRST, then credit player.
        // Rakeback chips come FROM the club treasury (which holds all rake).
        // Without this debit, fn_credit_chips creates chips from nothing.
        const { error: debitErr } = await supabaseAdmin.rpc('fn_debit_treasury', {
          p_club_id: clubId,
          p_amount: totalClaim,
        });

        if (debitErr) {
          // Rollback period status
          const ids = pending.map(p => p.id);
          await supabaseAdmin
            .from('rakeback_periods')
            .update({ status: 'closed' })
            .in('id', ids);
          throw debitErr;
        }

        // Atomic credit via RPC (no read-modify-write race)
        const { error: creditErr } = await supabaseAdmin.rpc('fn_credit_chips', {
          p_club_id: clubId,
          p_user_id: user.id,
          p_amount: totalClaim,
        });

        if (creditErr) {
          // Rollback treasury debit — re-credit the chips we took
          await supabaseAdmin.rpc('fn_credit_treasury', {
            p_club_id: clubId,
            p_amount: totalClaim,
          }).catch(rbErr => console.error('[rakeback] Treasury rollback failed:', rbErr.message));

          // Rollback period status
          const ids = pending.map(p => p.id);
          await supabaseAdmin
            .from('rakeback_periods')
            .update({ status: 'closed' })
            .in('id', ids);
          throw creditErr;
        }

        // Get fresh balance for response
        const { data: freshMember } = await supabaseAdmin
          .from('club_members')
          .select('chip_balance')
          .eq('club_id', clubId)
          .eq('user_id', user.id)
          .maybeSingle();

        const newBalance = freshMember?.chip_balance || 0;

        // Record transaction
        await supabaseAdmin
          .from('chip_transactions')
          .insert({
            club_id: clubId,
            to_user_id: user.id,
            amount: totalClaim,
            transaction_type: 'rakeback',
            notes: `Rakeback claim: ${pending.length} period(s)`,
            balance_after: newBalance,
          });

        // Mark periods as fully claimed
        const ids = pending.map(p => p.id);
        await supabaseAdmin
          .from('rakeback_periods')
          .update({ status: 'claimed' })
          .in('id', ids);

        return res.status(200).json({
          success: true,
          claimed: totalClaim,
          newBalance,
          periodsProcessed: pending.length,
        });
      }

      return res.status(400).json({ success: false, error: `Unknown action: ${action}` });
    }

    return res.status(405).json({ success: false, error: 'GET or POST only' });
  } catch (err) {
    console.error('[rakeback]', err);
    return res.status(500).json({ success: false, error: 'Rakeback operation failed', details: err.message });
  }
}
