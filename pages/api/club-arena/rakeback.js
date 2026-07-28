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
import { notifyUser } from '../../../src/lib/club-arena/notify';
const { checkIdempotency, cacheResponse } = require('../../../src/lib/club-arena/idempotency');
const { isUUID, rejectBadPayload } = require('../../../src/lib/club-arena/validate');
const { safeErrorResponse } = require('../../../src/lib/club-arena/sanitize');
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
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'No auth token' });

    const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
    const user = authData?.user;
    if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

    try {
      // ═══════════════════════════════════════════════════════════════
      // GET — Status or History
      // ═══════════════════════════════════════════════════════════════
      if (req.method === 'GET') {
        const { clubId, action: getAction } = req.query;
        // RED TEAM: Strict UUID validation on query param
        if (!isUUID(clubId)) return res.status(400).json({ success: false, error: 'Invalid clubId format' });

        // Verify membership
        const { data: member } = await getSupabase()
          .from('club_members')
          .select('role, chip_balance')
          .eq('club_id', clubId)
          .eq('user_id', user.id)
          .maybeSingle();

        if (!member) return res.status(403).json({ success: false, error: 'Not a club member' });

        if (getAction === 'history') {
          // Player's rakeback history
          const { data: history } = await getSupabase()
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
        const { data: activePeriod } = await getSupabase()
          .from('rakeback_periods')
          .select('*')
          .eq('club_id', clubId)
          .eq('status', 'open')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        // Get player's unclaimed rakeback
        const { data: pendingRakebacks } = await getSupabase()
          .from('rakeback_periods')
          .select('*')
          .eq('club_id', clubId)
          .eq('player_id', user.id)
          .eq('status', 'closed')
          .gt('rakeback_amount', 0);

        const totalPending = (pendingRakebacks || []).reduce((s, r) => s + (r.rakeback_amount || 0), 0);

        // Get club's rakeback rate from settings
        const { data: club } = await getSupabase()
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

        // RED TEAM: Field allowlist for POST
        if (rejectBadPayload(req, res, ['action', 'clubId'])) return;

        // CONCURRENCY: Idempotency guard — prevent double-taps (especially on open/close/claim)
        if (checkIdempotency(req, res)) return;

        // RED TEAM: Strict UUID + action enum whitelist
        if (!isUUID(clubId)) return res.status(400).json({ success: false, error: 'Invalid clubId format' });
        const VALID_ACTIONS = ['open', 'close', 'claim'];
        if (!VALID_ACTIONS.includes(action)) {
          return res.status(400).json({ success: false, error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}` });
        }

        // Settlement lock check
        const lockCheck = await checkSettlementLock(supabaseAdmin, clubId);
        if (lockCheck.locked) return sendLockedResponse(res, lockCheck);

        // Verify membership
        const { data: member } = await getSupabase()
          .from('club_members')
          .select('role')
          .eq('club_id', clubId)
          .eq('user_id', user.id)
          .maybeSingle();

        // Union admin fallback — union admins are not club members but can manage rakeback
        let effectiveRole = member?.role || null;
        if (!member) {
          const { data: clubInfo } = await getSupabase()
            .from('clubs').select('union_id').eq('id', clubId).maybeSingle();
          if (clubInfo?.union_id) {
            const { data: ua } = await getSupabase()
              .from('union_admins').select('role')
              .eq('union_id', clubInfo.union_id).eq('user_id', user.id).maybeSingle();
            if (ua) {
                effectiveRole = 'owner'; // union admins get full access
            } else {
                // Owner fallback
                const { data: union } = await getSupabase().from('unions').select('id').eq('id', clubInfo.union_id).eq('owner_id', user.id).maybeSingle();
                if (union) effectiveRole = 'owner';
            }
          }
        }

        if (!effectiveRole) return res.status(403).json({ success: false, error: 'Not authorized for this club' });

        // ─── OPEN NEW PERIOD ───
        if (action === 'open') {
          if (!['owner', 'admin'].includes(effectiveRole)) {
            return res.status(403).json({ success: false, error: 'Only owners/admins can open rakeback periods' });
          }

          // Check no existing open period
          const { data: existing } = await getSupabase()
            .from('rakeback_periods')
            .select('id')
            .eq('club_id', clubId)
            .eq('status', 'open')
            .limit(1)
            .maybeSingle();

          if (existing) return res.status(400).json({ success: false, error: 'A rakeback period is already open' });

          // Create a marker period (player_id = null means it's the master period)
          const { data: period, error } = await getSupabase()
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
            .maybeSingle();

          if (error) throw error;
          const responseObj = { success: true, period };
          cacheResponse(req, 200, responseObj);
          return res.status(200).json(responseObj);
        }

        // ─── CLOSE PERIOD (calculate rakeback for all players) ───
        if (action === 'close') {
          if (!['owner', 'admin'].includes(effectiveRole)) {
            return res.status(403).json({ success: false, error: 'Only owners/admins can close rakeback periods' });
          }

          // Find open period
          const { data: openPeriod } = await getSupabase()
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
          const { data: club } = await getSupabase()
            .from('clubs')
            .select('settings')
            .eq('id', clubId)
            .maybeSingle();

          const rakebackRate = club?.settings?.rakeback_rate || 0.10;

          // Get all rake records since period started
          const { data: rakeRecords } = await getSupabase()
            .from('rake_records')
            .select('player_contributions')
            .eq('club_id', clubId)
            .gte('created_at', openPeriod.period_start);

          // Aggregate rake per player
          const playerRake = {};
          for (const record of (rakeRecords || [])) {
            const contributions = record.player_contributions || {};
            for (const [playerId, amount] of Object.entries(contributions || {})) {
              playerRake[playerId] = (playerRake[playerId] || 0) + amount;
            }
          }

          // Create rakeback records for each player
          const inserts = [];
          for (const [playerId, totalRake] of Object.entries(playerRake || {})) {
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
            const { error: insertErr } = await getSupabase()
              .from('rakeback_periods')
              .insert(inserts);
            if (insertErr) throw insertErr;
          }

          // Close master period
          const { error: err_rakeback_periods_tvtud } = await getSupabase()
            .from('rakeback_periods')
            .update({ status: 'closed', period_end: new Date().toISOString() })
            .eq('id', openPeriod.id);
          if (err_rakeback_periods_tvtud) console.warn('[Supabase] Silent mutation failed in rakeback_periods:', err_rakeback_periods_tvtud.message);

          // Notify players with rakeback available (fire-and-forget)
          for (const ins of inserts.filter(i => i.rakeback_amount > 0)) {
            await notifyUser(supabaseAdmin, {
              userId: ins.player_id, type: 'rakeback_available',
              title: `🎁 Rakeback Available: ${ins.rakeback_amount.toLocaleString()}`,
              message: `You have ${ins.rakeback_amount.toLocaleString()} chips in unclaimed rakeback. Claim now in the cashier!`,
              data: { clubId, amount: ins.rakeback_amount },
              pushUrl: `/hub/club-arena/cashier?club=${clubId}`,
            }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
          }

          const responseObj = {
            success: true,
            playersProcessed: inserts.length,
            totalRakebackDistributed: inserts.reduce((s, i) => s + i.rakeback_amount, 0),
          };
          logAudit(supabaseAdmin, { actionType: 'rakeback_closed', userId: user.id, clubId, ip: extractIP(req), details: { playersProcessed: inserts.length, totalDistributed: inserts.reduce((s, i) => s + i.rakeback_amount, 0) } });
          cacheResponse(req, 200, responseObj);
          return res.status(200).json(responseObj);
        }

        // ─── CLAIM RAKEBACK (player) ───
        if (action === 'claim') {
          // Atomically claim pending periods — prevents double-claim race
          // Mark as 'claiming' first (only succeeds if still 'closed')
          const { data: pending } = await getSupabase()
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
          const { error: debitErr } = await getSupabase().rpc('fn_debit_treasury', {
            p_club_id: clubId,
            p_amount: totalClaim,
          });

          if (debitErr) {
            // Rollback period status
            const ids = pending.map(p => p.id);
            const { error: err_rakeback_periods_b5mtd } = await getSupabase()
              .from('rakeback_periods')
              .update({ status: 'closed' })
              .in('id', ids);
            if (err_rakeback_periods_b5mtd) console.warn('[Supabase] Silent mutation failed in rakeback_periods:', err_rakeback_periods_b5mtd.message);
            throw debitErr;
          }

          // Atomic credit via RPC (no read-modify-write race)
          const { error: creditErr } = await getSupabase().rpc('fn_credit_chips', {
            p_club_id: clubId,
            p_user_id: user.id,
            p_amount: totalClaim,
          });

          if (creditErr) {
            // Rollback treasury debit — re-credit the chips we took
            await getSupabase().rpc('fn_credit_treasury', {
              p_club_id: clubId,
              p_amount: totalClaim,
            }).catch(rbErr => console.warn('[rakeback] Treasury rollback failed:', rbErr.message));

            // Rollback period status
            const ids = pending.map(p => p.id);
            const { error: err_rakeback_periods_zz98s } = await getSupabase()
              .from('rakeback_periods')
              .update({ status: 'closed' })
              .in('id', ids);
            if (err_rakeback_periods_zz98s) console.warn('[Supabase] Silent mutation failed in rakeback_periods:', err_rakeback_periods_zz98s.message);
            throw creditErr;
          }

          // Get fresh balance for response
          const { data: freshMember } = await getSupabase()
            .from('club_members')
            .select('chip_balance')
            .eq('club_id', clubId)
            .eq('user_id', user.id)
            .maybeSingle();

          const newBalance = freshMember?.chip_balance || 0;

          // Record transaction
          const { error: err_chip_transactions_xcocx } = await getSupabase()
            .from('chip_transactions')
            .insert({
              club_id: clubId,
              to_user_id: user.id,
              amount: totalClaim,
              transaction_type: 'rakeback',
              notes: `Rakeback claim: ${pending.length} period(s)`,
            });
          if (err_chip_transactions_xcocx) console.warn('[Supabase] Silent mutation failed in chip_transactions:', err_chip_transactions_xcocx.message);

          // Mark periods as fully claimed
          const ids = pending.map(p => p.id);
          const { error: err_rakeback_periods_6uyuf } = await getSupabase()
            .from('rakeback_periods')
            .update({ status: 'claimed' })
            .in('id', ids);
          if (err_rakeback_periods_6uyuf) console.warn('[Supabase] Silent mutation failed in rakeback_periods:', err_rakeback_periods_6uyuf.message);

          const responseObj = {
            success: true,
            claimed: totalClaim,
            newBalance,
            periodsProcessed: pending.length,
          };
          logAudit(supabaseAdmin, { actionType: 'rakeback_claimed', userId: user.id, clubId, amount: totalClaim, ip: extractIP(req), details: { periodsProcessed: pending.length, newBalance } });
          cacheResponse(req, 200, responseObj);
          return res.status(200).json(responseObj);
        }

        return res.status(400).json({ success: false, error: `Unknown action: ${action}` });
      }

      return res.status(405).json({ success: false, error: 'GET or POST only' });
    } catch (err) {
      console.warn('[rakeback]', err);
      return res.status(500).json(safeErrorResponse(err, 'Rakeback operation failed'));
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
