import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * /api/club-arena/rakeback
 *
 * GET  ?clubId=xxx&action=status    — Get current rakeback period status + player's rakeback
 * GET  ?clubId=xxx&action=history   — Get player's rakeback history
 * POST { action: 'open'|'close'|'claim', clubId }
 *   open  — Owner starts a new rakeback period
 *   close — Owner closes the administrative period marker.
 *           It does NOT credit players. Per-player rakeback is written solely
 *           by the engine's RakebackSettlerService, which splits each hand's
 *           rake EQUALLY among the players dealt in (DECISION D-001/FIX 144).
 *           A contribution-weighted crediting path used to live here and wrote
 *           to the same rakeback_periods table with different math; it was
 *           removed 2026-08-15 (see the comment in the close branch).
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
      // ═══════════════════════════════════════════════════════════
      // GET — Status or History
      // ═══════════════════════════════════════════════════════════
      if (req.method === 'GET') {
        const { clubId, action: getAction } = req.query;
        // RED TEAM: Strict UUID validation on query param
        if (!isUUID(clubId))
          return res.status(400).json({ success: false, error: 'Invalid clubId format' });

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
            .eq('user_id', user.id)
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
          .eq('user_id', user.id)
          .eq('status', 'closed')
          .gt('rakeback_amount', 0);

        const totalPending = (pendingRakebacks || []).reduce(
          (s, r) => s + (r.rakeback_amount || 0),
          0
        );

        // Get club's rakeback rate from settings
        const { data: club } = await getSupabase()
          .from('clubs')
          .select('settings')
          .eq('id', clubId)
          .maybeSingle();

        const rakebackRate = club?.settings?.rakeback_rate || 0.1; // default 10%

        return res.status(200).json({
          success: true,
          activePeriod,
          pendingRakeback: totalPending,
          pendingCount: (pendingRakebacks || []).length,
          rakebackRate,
          role: member.role,
        });
      }

      // ═══════════════════════════════════════════════════════════
      // POST — Open / Close / Claim
      // ═══════════════════════════════════════════════════════════
      if (req.method === 'POST') {
        const { action, clubId } = req.body;

        // RED TEAM: Field allowlist for POST
        if (rejectBadPayload(req, res, ['action', 'clubId'])) return;

        // CONCURRENCY: Idempotency guard — prevent double-taps (especially on open/close/claim)
        if (checkIdempotency(req, res)) return;

        // RED TEAM: Strict UUID + action enum whitelist
        if (!isUUID(clubId))
          return res.status(400).json({ success: false, error: 'Invalid clubId format' });
        const VALID_ACTIONS = ['open', 'close', 'claim'];
        if (!VALID_ACTIONS.includes(action)) {
          return res
            .status(400)
            .json({
              success: false,
              error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}`,
            });
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
            .from('clubs')
            .select('union_id')
            .eq('id', clubId)
            .maybeSingle();
          if (clubInfo?.union_id) {
            const { data: ua } = await getSupabase()
              .from('union_admins')
              .select('role')
              .eq('union_id', clubInfo.union_id)
              .eq('user_id', user.id)
              .maybeSingle();
            if (ua) {
              effectiveRole = 'owner'; // union admins get full access
            } else {
              // Owner fallback
              const { data: union } = await getSupabase()
                .from('unions')
                .select('id')
                .eq('id', clubInfo.union_id)
                .eq('owner_id', user.id)
                .maybeSingle();
              if (union) effectiveRole = 'owner';
            }
          }
        }

        if (!effectiveRole)
          return res.status(403).json({ success: false, error: 'Not authorized for this club' });

        // ─── OPEN NEW PERIOD ───
        if (action === 'open') {
          if (!['owner', 'admin'].includes(effectiveRole)) {
            return res
              .status(403)
              .json({ success: false, error: 'Only owners/admins can open rakeback periods' });
          }

          // Check no existing open period
          const { data: existing } = await getSupabase()
            .from('rakeback_periods')
            .select('id')
            .eq('club_id', clubId)
            .eq('status', 'open')
            .limit(1)
            .maybeSingle();

          if (existing)
            return res
              .status(400)
              .json({ success: false, error: 'A rakeback period is already open' });

          // 2026-08-15 CHECK 13 fix: rakeback_periods keys players by user_id
          // (player_id/rake_contributed never existed — every rakeback query and
          // insert 42703'd, so the whole rakeback flow was dead). user_id was
          // relaxed to nullable so the master-period marker row (no user) works.
          // Create a marker period (user_id = null means it's the master period)
          const { data: period, error } = await getSupabase()
            .from('rakeback_periods')
            .insert({
              club_id: clubId,
              user_id: null,
              status: 'open',
              rake_generated: 0,
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
            return res
              .status(403)
              .json({ success: false, error: 'Only owners/admins can close rakeback periods' });
          }

          // Find open period
          const { data: openPeriod } = await getSupabase()
            .from('rakeback_periods')
            .select('*')
            .eq('club_id', clubId)
            .eq('status', 'open')
            .is('user_id', null)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!openPeriod)
            return res.status(400).json({ success: false, error: 'No open rakeback period found' });

          // Get club's rakeback rate
          // ── Dan 2026-08-15 — CONTRIBUTION-WEIGHTED CREDITING REMOVED ──
          //
          // Ruling: "It's supposed to be evenly distributed and credited to
          // every player dealt in. Only use this model and delete anything
          // that conflicts with this."
          //
          // This branch used to be a SECOND, competing rakeback settlement
          // engine. It aggregated rake_records.player_contributions per player
          // and credited each one proportionally to what they personally put
          // into the pots, then INSERTed those rows into rakeback_periods —
          // the same table the engine's RakebackSettlerService owns and
          // upserts using equal-share math (DECISION D-001 / FIX 144). Two
          // systems, two different formulas, one table, no coordination:
          // whichever ran last decided what a player was owed, and a player
          // could be credited twice for the same week.
          //
          // Verified before removal (2026-08-15): rakeback_periods held 2,376
          // rows, zero duplicate (user_id, club_id, period_start) tuples, and
          // ZERO master-period rows (user_id IS NULL). This branch needs an
          // open master period to reach its insert, so it had never actually
          // executed in production — the conflict was latent and no player was
          // ever double-credited. Removing it is preventive, not a repair.
          //
          // RakebackSettlerService remains the single writer of per-player
          // rakeback. This action now only closes the administrative marker.
          const { error: err_rakeback_periods_tvtud } = await getSupabase()
            .from('rakeback_periods')
            .update({ status: 'closed', period_end: new Date().toISOString() })
            .eq('id', openPeriod.id);
          if (err_rakeback_periods_tvtud)
            console.warn(
              '[Supabase] Silent mutation failed in rakeback_periods:',
              err_rakeback_periods_tvtud.message
            );

          const responseObj = {
            success: true,
            periodClosed: openPeriod.id,
            // No per-player crediting happens here, by design. The engine's
            // RakebackSettlerService (30-min interval, equal share among the
            // players dealt in) is the sole writer of per-player rows.
            creditedBy: 'RakebackSettlerService',
            playersProcessed: 0,
            totalRakebackDistributed: 0,
          };
          logAudit(supabaseAdmin, {
            actionType: 'rakeback_closed',
            userId: user.id,
            clubId,
            ip: extractIP(req),
            details: { periodClosed: openPeriod.id, crediting: 'deferred_to_equal_share_settler' },
          });
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
            .eq('user_id', user.id)
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
            const ids = pending.map((p) => p.id);
            const { error: err_rakeback_periods_b5mtd } = await getSupabase()
              .from('rakeback_periods')
              .update({ status: 'closed' })
              .in('id', ids);
            if (err_rakeback_periods_b5mtd)
              console.warn(
                '[Supabase] Silent mutation failed in rakeback_periods:',
                err_rakeback_periods_b5mtd.message
              );
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
            await getSupabase()
              .rpc('fn_credit_treasury', {
                p_club_id: clubId,
                p_amount: totalClaim,
              })
              .then(({ error }) => {
                if (error) throw error;
              })
              .catch((rbErr) =>
                console.warn('[rakeback] Treasury rollback failed:', rbErr.message)
              );

            // Rollback period status
            const ids = pending.map((p) => p.id);
            const { error: err_rakeback_periods_zz98s } = await getSupabase()
              .from('rakeback_periods')
              .update({ status: 'closed' })
              .in('id', ids);
            if (err_rakeback_periods_zz98s)
              console.warn(
                '[Supabase] Silent mutation failed in rakeback_periods:',
                err_rakeback_periods_zz98s.message
              );
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
          if (err_chip_transactions_xcocx)
            console.warn(
              '[Supabase] Silent mutation failed in chip_transactions:',
              err_chip_transactions_xcocx.message
            );

          // Mark periods as fully claimed
          const ids = pending.map((p) => p.id);
          const { error: err_rakeback_periods_6uyuf } = await getSupabase()
            .from('rakeback_periods')
            .update({ status: 'claimed' })
            .in('id', ids);
          if (err_rakeback_periods_6uyuf)
            console.warn(
              '[Supabase] Silent mutation failed in rakeback_periods:',
              err_rakeback_periods_6uyuf.message
            );

          const responseObj = {
            success: true,
            claimed: totalClaim,
            newBalance,
            periodsProcessed: pending.length,
          };
          logAudit(supabaseAdmin, {
            actionType: 'rakeback_claimed',
            userId: user.id,
            clubId,
            amount: totalClaim,
            ip: extractIP(req),
            details: { periodsProcessed: pending.length, newBalance },
          });
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
    try {
      reportApiError(err, req);
    } catch (_sentryErr) {
      console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr);
    }
    console.warn('[API Error]', err);
    if (!res.headersSent)
      return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
