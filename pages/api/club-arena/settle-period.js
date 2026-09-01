/**
 * POST /api/club-arena/settle-period
 * 
 * Manages settlement periods and calculates agent commissions.
 * 
 * Actions:
 *   'open'    - Opens a new settlement period for the club
 *   'close'   - Closes the current period and calculates all agent commissions
 *   'pay'     - Marks a specific commission_record as paid
 *   'pay_all' - Marks all pending commissions for a period as paid
 *   'status'  - Returns current period info and pending commissions
 * 
 * Body: { clubId, action, periodId?, commissionId? }
 * Auth: Bearer token (club owner or union admin)
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { notifyUser } from '../../../src/lib/club-arena/notify';
import { validateSettlement } from '../../../src/contracts/orb4_syndicate';
const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');
const { checkIdempotency, cacheResponse } = require('../../../src/lib/club-arena/idempotency');
const { beginIdempotent } = require('../../../src/lib/club-arena/durableIdempotency');
const { logAudit, extractIP } = require('../../../src/lib/club-arena/auditLogger');
import { reportApiError } from '../../../src/lib/sentryWrap';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// MANDATE 2: Timezone Agnosticism — all settlement timestamps are UTC-explicit.
// The weekly auto-settlement cron fires at Monday 10:00 UTC (Vercel cron: "0 10 * * 1").
// Manual settlements must also use UTC to prevent timezone drift across server regions.
const UTC_SETTLEMENT_DAY = 1;  // Monday (0=Sun, 1=Mon)
const UTC_SETTLEMENT_HOUR = 10; // 10:00 UTC

export default async function handler(req, res) {
  try {

  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });

  // FIX-C-AUTOSETTLE 2026-07-19: the weekly auto-close cron (settlement-history
  // auto_close) calls this endpoint with an x-admin-secret header, but this
  // handler previously required a Bearer user token — so EVERY cron settlement
  // 401'd and agent commissions were never computed. Accept the admin secret as
  // a cron auth path, acting AS the club owner (settlement is an owner action),
  // so the ownership check + all audit fields resolve naturally with a valid id.
  const adminSecret = req.headers['x-admin-secret'];
  const isAdminCall =
    !!adminSecret && !!process.env.ADMIN_ROUTE_SECRET && adminSecret === process.env.ADMIN_ROUTE_SECRET;

  let user;
  if (isAdminCall) {
    const bodyClubId = req.body?.clubId;
    if (!bodyClubId) return res.status(400).json({ success: false, error: 'clubId required' });
    const { data: ownerClub } = await supabaseAdmin
      .from('clubs')
      .select('owner_id')
      .eq('id', bodyClubId)
      .maybeSingle();
    if (!ownerClub?.owner_id) return res.status(404).json({ success: false, error: 'Club not found' });
    user = { id: ownerClub.owner_id };
  } else {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'No auth token' });

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    user = authData?.user;
    if (authError || !user) return res.status(401).json({ success: false, error: 'Invalid token' });
  }

  // RED TEAM: Zod Contract Validation (MANDATE: Reject 100% with 400 Bad Request before hitting Postgres)
  const validation = validateSettlement(req.body);
  if (!validation.success) {
    return res.status(400).json({ success: false, error: validation.error });
  }

  const payload = validation.data;
  const { clubId, action, periodId, commissionId } = payload;

  // CONCURRENCY: Idempotency guard — prevent double-taps (especially on open/close)
  if (checkIdempotency(req, res)) return;

  // Rate limit
  if (!applyRateLimit(req, res, 'club-arena/settle-period')) return;

  // ZERO-DRIFT (2026-08-31): DURABLE idempotency. The in-memory guard above
  // is per-lambda; this one is shared across instances via
  // fn_idempotency_begin/finish. Money actions only.
  if (['open', 'close', 'pay', 'pay_all'].includes(action)) {
    const { proceed } = await beginIdempotent(
      supabaseAdmin, req, res, `settle-period:${user.id}:${clubId}:${action}`
    );
    if (!proceed) return;
  }

  try {
    // Verify authorization
    const { data: club } = await supabaseAdmin
      .from('clubs')
      .select('id, owner_id, union_id, chip_treasury')
      .eq('id', clubId)
      .maybeSingle();
    if (!club) return res.status(404).json({ success: false, error: 'Club not found' });

    let authorized = club.owner_id === user.id;
    if (!authorized && club.union_id) {
      const { data: ua } = await supabaseAdmin
        .from('union_admins')
        .select('role')
        .eq('union_id', club.union_id)
        .eq('user_id', user.id)
        .maybeSingle();
      authorized = !!ua;
    }
    if (!authorized) return res.status(403).json({ success: false, error: 'Not authorized' });

    // ═══════════════════════════════════════════════════════════════
    // STATUS: Return current period info
    // ═══════════════════════════════════════════════════════════════
    if (action === 'status') {
      const { data: periods } = await supabaseAdmin
        .from('settlement_periods')
        .select('*')
        .eq('club_id', clubId)
        .order('created_at', { ascending: false })
        .limit(5);

      const openPeriod = periods?.find(p => p.status === 'open');
      // Also find most recent closed period (commissions are created on close)
      const closedPeriod = periods?.find(p => p.status === 'closed');

      // PHASE 7 (2026-09-01). This read commission_records, a table that never
      // held a row and is now dropped. What a club actually owes its agents
      // lives in agent_commissions, is not period-scoped, and is claimed by the
      // agent rather than paid out from here - Dan, phase 6: "AGENTS HANDLE
      // THEIR OWN PAYOUTS". The figure is reported per agent so an owner can
      // see what the bank must cover; nothing here pays it.
      const { data: owedRows } = await supabaseAdmin
        .from('agent_commissions')
        .select('user_id, amount')
        .eq('club_id', clubId)
        .is('settled_at', null)
        .limit(50000);

      const owedByAgent = new Map();
      for (const row of owedRows || []) {
        owedByAgent.set(row.user_id, (owedByAgent.get(row.user_id) || 0) + (Number(row.amount) || 0));
      }
      const unclaimedCommissions = [...owedByAgent.entries()]
        .map(([userId, unclaimed]) => ({ user_id: userId, unclaimed: Math.round(unclaimed * 100) / 100 }))
        .sort((a, b) => b.unclaimed - a.unclaimed);

      return res.status(200).json({
        success: true,
        currentPeriod: openPeriod || closedPeriod || null,
        recentPeriods: periods || [],
        // Kept under its old name so no caller breaks; it now carries what the
        // ledger says is unclaimed, per agent, rather than rows from an empty
        // table.
        pendingCommissions: unclaimedCommissions,
        unclaimedCommissions,
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // OPEN: Create a new settlement period
    // ═══════════════════════════════════════════════════════════════
    if (action === 'open') {
      // Check no open period exists
      const { data: existing } = await supabaseAdmin
        .from('settlement_periods')
        .select('id')
        .eq('club_id', clubId)
        .eq('status', 'open')
        .limit(1);

      if (existing?.length > 0) {
        return res.status(409).json({ success: false, error: 'A period is already open. Close it first.' });
      }

      // Get last period number
      const { data: lastPeriod } = await supabaseAdmin
        .from('settlement_periods')
        .select('period_number')
        .eq('club_id', clubId)
        .order('period_number', { ascending: false })
        .limit(1);

      const nextPeriod = (lastPeriod?.[0]?.period_number || 0) + 1;
      // MANDATE 2: UTC-explicit timestamps — never rely on server local timezone
      const now = new Date();
      const nowISO = now.toISOString();
      const endAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 1 week

      // UNION PLAYER P&L (2026-08-19): snapshot the chips this club's players
      // currently have seated at union tables. The close step uses the change
      // in seated stacks across the period so unrealized chips on the table
      // don't distort the weekly win/loss squaring.
      let seatedStackSnapshot = null;
      if (club.union_id) {
        const { data: pnlSnap, error: snapErr } = await supabaseAdmin.rpc('fn_union_club_player_pnl', {
          p_club_id: clubId,
          p_union_id: club.union_id,
          p_start: nowISO,
          p_end: nowISO,
        });
        if (snapErr) console.warn('[settle-period] seated-stack snapshot failed:', snapErr.message);
        else seatedStackSnapshot = pnlSnap?.seated_stack ?? null;
      }

      const { data: period, error: pErr } = await supabaseAdmin
        .from('settlement_periods')
        .insert({
          club_id: clubId,
          union_id: club.union_id,
          period_number: nextPeriod,
          year: now.getUTCFullYear(),
          start_at: nowISO,
          end_at: endAt.toISOString(),
          status: 'open',
          total_rake_collected: 0,
          total_hands_dealt: 0,
          total_player_winnings: 0,
          total_player_losses: 0,
          seated_stack_snapshot: seatedStackSnapshot,
        })
        .select()
        .maybeSingle();

      if (pErr) throw pErr;

      // Reset all agents' weekly_rake_generated — single batch UPDATE (was serial loop, O(n) round-trips)
      // Row count is captured but NOT treated as failure. This filters by
      // club_id, and a club with no agents legitimately matches zero rows --
      // making that fatal would break opening a period for every agent-less
      // club. It is logged so a reset that silently touched nothing in a club
      // that DOES have agents is still visible.
      const { data: resetRows, error: err_agents_8n8q4 } = await supabaseAdmin
        .from('agents')
        .update({ weekly_rake_generated: 0 })
        .eq('club_id', clubId)
        .select('id');
      if (!err_agents_8n8q4) {
        console.info(`[settle-period] weekly rake reset for ${resetRows?.length ?? 0} agent(s) in club ${clubId}`);
      }
      if (err_agents_8n8q4) {
        // FAIL-LOUD: if the reset does not land, every agent keeps last week's
        // weekly_rake_generated and the NEXT close pays commission on it a
        // second time and re-charges the union hold on it. Silently warning
        // here meant the double-charge surfaced a week later as a mystery.
        return res.status(500).json({
          success: false,
          error: `Period #${nextPeriod} opened, but resetting agents' weekly rake failed: `
            + `${err_agents_8n8q4.message}. Reset it before the next close or that rake `
            + `will be counted twice.`,
          periodId: period?.id,
        });
      }

      const responseObj = {
        success: true,
        period: period,
        message: `Period #${nextPeriod} opened`,
      };
      logAudit(supabaseAdmin, { actionType: 'settlement_opened', userId: user.id, clubId, ip: extractIP(req), details: { periodNumber: nextPeriod, periodId: period?.id } });
      cacheResponse(req, 200, responseObj);
      return res.status(200).json(responseObj);
    }

    // ═══════════════════════════════════════════════════════════════
    // CLOSE: Close period and calculate commissions
    // ═══════════════════════════════════════════════════════════════
    if (action === 'close') {
      // Find the open period — always use the DB's open period, not a client-provided ID
      const { data: period, error: periodErr } = await supabaseAdmin
        .from('settlement_periods')
        .select('id, period_number, start_at, seated_stack_snapshot')  // BUG FIX: was select('id') — period_number/start_at were undefined
        .eq('club_id', clubId)
        .eq('status', 'open')
        .maybeSingle();

      if (periodErr) {
        // .maybeSingle() also errors when TWO periods are open (PGRST116),
        // which used to surface as the misleading "No open period to close".
        return res.status(500).json({
          success: false,
          error: `Could not resolve the open settlement period: ${periodErr.message}. `
            + `If more than one period is open for this club, close the duplicate first.`,
        });
      }
      if (!period) return res.status(404).json({ success: false, error: 'No open period to close' });

      const pid = period.id;

      // Get all agents for this club
      // FAIL-LOUD 2026-08-19: this error was never destructured. A failed
      // agents read produced `agents = null`, which silently meant zero
      // commissions, actualTotalRake = 0 and unionHold = 0 — the period then
      // closed reporting "0 commission records created" and success:true,
      // losing an entire week of agent commissions and the union's rake hold
      // with no signal anywhere.
      const { data: agents, error: agentsErr } = await supabaseAdmin
        .from('agents')
        .select('id, user_id, commission_rate, weekly_rake_generated, is_prepaid, parent_agent_id')
        .eq('club_id', clubId)
        .eq('status', 'active')

      if (agentsErr) {
        return res.status(500).json({
          success: false,
          error: `Could not read agents for settlement: ${agentsErr.message}. Period left open - nothing was settled.`,
        });
      }

      // ═══════════════════════════════════════════════════════════
      // PROMO CHIPS ARE EXCLUDED FROM SETTLEMENT
      // ═══════════════════════════════════════════════════════════
      // Promo chips (clubs.promo_balance, agents.promo_balance,
      // club_members.promo_balance) are NOT debts owed to the union.
      // They are funded from 30% of the BBJ allocation and are
      // already raked/accounted for. They flow through separate
      // promo_balance columns and separate RPCs:
      //   - transfer_promo_club_to_agent (club → agent promo)
      //   - transfer_promo_agent_to_player (agent → player promo)
      // These NEVER touch chip_balance, credit_used, player_balance,
      // or weekly_rake_generated. Settlement only calculates
      // commissions from weekly_rake_generated (actual table rake).
      // ═══════════════════════════════════════════════════════════

      // Get union settings for rakeback split
      let unionRakeHold = 0.10; // default 10%
      if (club.union_id) {
        const { data: union } = await supabaseAdmin
          .from('unions')
          .select('settings')
          .eq('id', club.union_id)
          .maybeSingle();
        unionRakeHold = union?.settings?.union_rake_hold || 0.10;
      }

      // ── PHASE 7 (2026-09-01): THIS NO LONGER COMPUTES COMMISSION ──
      //
      // What stood here was a second, parallel commission calculation: it took
      // each agent's `weekly_rake_generated`, applied their rate, walked the
      // upline for the delta, and wrote the result into commission_records and
      // commission_history as `pending` — payable later by staff through the
      // 'pay' and 'pay_all' actions below.
      //
      // The same rake had ALREADY produced a liability. credit_agent_commission_from_rake
      // writes an agent_commissions row AND increments weekly_rake_generated, in
      // the same call, as each hand settles. So one piece of rake would have
      // become two payable debts: one the agent claims through
      // fn_agent_claim_commission (club-arena phase 6), and one staff pays from
      // here. A club would have paid its agents twice for the same hands.
      //
      // It never fired — commission_records and commission_history held ZERO
      // rows on the day they were dropped, because every historical close either
      // 401'd or stalled — which is the only reason this is a removal and not an
      // incident. Both tables are dropped in club-arena migration 20260902070000.
      //
      // The period still closes, the union hold is still taken, and the agents
      // are paid the way Dan said they are paid: "AGENTS HANDLE THEIR OWN
      // PAYOUTS."
      let totalCommissions = 0;

      const agentsMap = new Map();
      for (const agent of (agents || [])) {
        agentsMap.set(agent.id, agent);
      }

      // ── Build 6.8: DAG Pre-Validation ──
      // Detect circular references BEFORE commission calculation to fail fast
      let graphValid = true;
      const graphErrors = [];
      for (const agent of (agents || [])) {
        if (!agent.parent_agent_id) continue;
        const visited = new Set([agent.id]);
        let current = agent;
        while (current.parent_agent_id) {
          if (visited.has(current.parent_agent_id)) {
            graphErrors.push(`Circular ref: agent ${agent.id} → parent ${current.parent_agent_id}`);
            graphValid = false;
            break;
          }
          visited.add(current.parent_agent_id);
          current = agentsMap.get(current.parent_agent_id) || {};
        }
      }

      if (!graphValid) {
        console.warn('[SETTLE] DAG validation failed:', graphErrors);
        // Continue anyway but log the error — don't block settlement
        logAudit(supabaseAdmin, {
          actionType: 'settlement_dag_error',
          userId: user.id,
          clubId,
          ip: extractIP(req),
          details: { errors: graphErrors, agentCount: (agents || []).length },
        });
      }

      // What the club has actually PAID its agents in this period: the
      // commission rows that have been claimed, from the ledger. Nothing here
      // computes a liability any more (see the note above), and this figure is
      // what settlement_periods.total_commissions_paid was always named for.
      {
        const { data: settledRows, error: settledErr } = await supabaseAdmin
          .from('agent_commissions')
          .select('amount')
          .eq('club_id', clubId)
          .gte('settled_at', period.start_at)
          .not('settled_at', 'is', null)
          .limit(50000);
        if (settledErr) {
          console.warn('[settle-period] claimed-commission read failed:', settledErr.message);
        }
        totalCommissions = (settledRows || []).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
        totalCommissions = Math.round(totalCommissions * 100) / 100;
      }

      // Calculate union hold
      // settlement_periods.total_rake_collected is never updated by record_rake RPC,
      // so calculate actual total from agents' weekly_rake_generated
      const actualTotalRake = (agents || []).reduce((sum, a) => sum + (a.weekly_rake_generated || 0), 0);
      const totalRake = actualTotalRake || period.total_rake_collected || 0;
      const unionHold = Math.round(totalRake * unionRakeHold * 100) / 100;

      // Update the period with the actual total
      if (actualTotalRake > 0) {
        // The figure everything below is calculated from. If it does not land,
        // the period reports a rake total that does not match what was actually
        // settled against it.
        const { data: rakeRows, error: err_settlement_periods_ekp4u } = await supabaseAdmin
          .from('settlement_periods')
          .update({ total_rake_collected: actualTotalRake })
          .eq('id', pid)
          .select('id');
        if (err_settlement_periods_ekp4u) console.error('[settle-period] total_rake_collected write FAILED for period', pid, err_settlement_periods_ekp4u.message);
        else if (!rakeRows || rakeRows.length === 0) console.error('[settle-period] total_rake_collected write matched ZERO rows for period', pid, '- the stored total will not match the settlement');
      }

      // Debit union hold from club treasury, credit to union rake_wallet
      if (club.union_id && unionHold > 0) {
        const { error: holdDebitErr } = await supabaseAdmin.rpc('fn_debit_treasury', {
          p_club_id: clubId,
          p_amount: unionHold,
        });

        if (holdDebitErr) {
          console.warn('[settle-period] union hold debit failed (treasury shortfall):', holdDebitErr.message);
          // Skip union credit — don't create chips from thin air
        } else {
          // UNION AUDIT FIX 2026-07-21 (conservation): the union credit was
          // fire-and-forget — if it failed after the treasury debit succeeded,
          // the hold amount vanished (club debited, union never credited).
          // Await it and REFUND the treasury on failure so chips are conserved.
          const { error: holdCreditErr } = await supabaseAdmin.rpc('fn_union_credit_wallet', {
            p_union_id: club.union_id,
            p_wallet: 'rake_wallet',
            p_amount: unionHold,
            p_tx_type: 'settlement_hold',
            p_club_id: clubId,
            p_period_id: pid,
          });
          if (holdCreditErr) {
            console.warn('[settle-period] union rake_wallet credit failed, refunding treasury:', holdCreditErr.message);
            const { error: refundErr } = await supabaseAdmin.rpc('fn_credit_treasury', {
              p_club_id: clubId,
              p_amount: unionHold,
            });
            if (refundErr) {
              console.error('[settle-period] CRITICAL: union hold refund ALSO failed - treasury debited, union not credited:', refundErr.message);
              // Chips have been destroyed: the club was debited, the union was
              // never credited, and putting them back failed too. That is a
              // conservation break and must not be reported as a success.
              return res.status(500).json({
                success: false,
                error: `CRITICAL: the union hold of ${unionHold} was debited from the club `
                  + `treasury, crediting the union failed, and the refund failed as well. `
                  + `Those chips are unaccounted for - reconcile before settling again.`,
                conservationBreak: true,
                amount: unionHold,
                periodId: pid,
              });
            }
            // Continue the settlement either way — the hold is skipped, not fatal.
          } else {
          // NOTE: fn_union_credit_wallet writes the union_wallet_transactions
          // audit row itself (tx_type/club/period passed above) — the old
          // manual insert here would double-log, so it was removed.
          const { error: chipTxErr } = await supabaseAdmin.from('chip_transactions').insert({
            club_id: clubId,
            amount: unionHold,
            transaction_type: 'union_hold',
            notes: `Union rake hold: ${unionHold.toLocaleString()} chips (${(unionRakeHold * 100).toFixed(1)}% of ${totalRake.toLocaleString()} rake) - Period #${period.period_number}`,
            metadata: {
              period_id: pid,
              period_number: period.period_number,
              union_id: club.union_id,
              hold_rate: unionRakeHold,
            },
          });
          if (chipTxErr) console.warn('[settle-period] union hold chip_transactions insert error:', chipTxErr.message);

          // Generate union_to_club invoice
          const { error: invoiceErr } = await supabaseAdmin.from('settlement_invoices').insert({
            club_id: clubId,
            period_id: pid,
            invoice_type: 'union_to_club',
            from_entity_type: 'union',
            from_entity_id: String(club.union_id),
            to_entity_type: 'club',
            to_entity_id: String(clubId),
            gross_amount: totalRake,
            net_amount: unionHold,
            breakdown: {
              total_rake: totalRake,
              rake_hold_pct: unionRakeHold,
              union_hold_amount: unionHold,
              club_retained: totalRake - unionHold,
              period_number: period.period_number,
            },
            status: 'paid',
            chips_transferred: true,
            transferred_at: new Date().toISOString(),
          });
          if (invoiceErr) console.warn('[settle-period] Invoice insert error:', invoiceErr.message);
          } // end else (credit succeeded)
        } // end else (debit succeeded)
      }

      // PHASE 7: the club_to_agent invoices that were generated here are gone
      // with the commission_records they were built from. They were a third
      // representation of the same debt - ledger row, commission record,
      // invoice - and the only one anybody acts on is the ledger row, which the
      // agent claims. An invoice nobody pays is a document that makes a debt
      // look handled.

      // ── UNION PLAYER P&L SQUARING (2026-08-19, rewritten after audit) ──
      // The first implementation was record-only and silently dead:
      //   - it inserted invoice_type 'union_club_pnl', which violated a CHECK
      //     constraint, and the error was swallowed by a console.warn — so the
      //     weekly square-up wrote NOTHING, every time;
      //   - it moved no chips at all;
      //   - it settled realized_net + stack_delta, which by the seat/wallet
      //     identity equals (inter-club transfer - rake). Since the rake was
      //     already swept to the union per hand, that double-charged it.
      // Settlement now lives in fn_union_settle_player_pnl_guarded: one
      // transaction for the whole union, rake-neutral, collect-then-pay,
      // idempotent, and it refuses to move chips unless the club nets prove
      // zero-sum. NOTE: the weekly production run is the workers repo
      // (/cron/auto-settlement); this endpoint is the manual/admin path.
      let playerPnl = null;
      if (club.union_id) {
        const { data: pnlRes, error: pnlErr } = await supabaseAdmin.rpc(
          'fn_union_settle_player_pnl_guarded',
          {
            p_union_id: club.union_id,
            p_start: period.start_at,
            p_end: new Date().toISOString(),
          }
        );

        if (pnlErr) {
          // Fail loud: a swallowed error here is exactly how this went
          // unnoticed. The period is NOT closed if the P&L leg breaks.
          return res.status(500).json({
            success: false,
            error: `Union player P&L settlement failed: ${pnlErr.message}. Period left open.`,
          });
        }

        playerPnl = pnlRes || null;

        if (playerPnl && playerPnl.needs_review) {
          return res.status(409).json({
            success: false,
            needsReview: true,
            error:
              `Union player P&L did not balance (imbalance ${playerPnl.imbalance}, ` +
              `tolerance ${playerPnl.tolerance}). No chips were moved and the period ` +
              `was left open for review.`,
            playerPnl,
          });
        }
      }

      // Close the period
      // .select() because the existing FAIL-LOUD branch below only fires on
      // `error`, and PostgREST reports a zero-row UPDATE as { error: null }.
      // Every consequence described in that comment -- period stays open,
      // caller told "closed", next run re-applies commissions and the union
      // hold -- follows just as exactly from a zero-row match. The check was
      // catching one of the two ways this fails.
      const { data: closedRows, error: err_settlement_periods_3wobo } = await supabaseAdmin
        .from('settlement_periods')
        .update({
          status: 'closed',
          settled_at: new Date().toISOString(),
          settled_by: user.id,
        })
        .eq('id', pid)
        .select('id');
      if (!err_settlement_periods_3wobo && (!closedRows || closedRows.length === 0)) {
        return res.status(500).json({
          success: false,
          error: `Settlement completed but the period could not be marked closed: the update `
            + `matched no rows (period ${pid} may have been altered concurrently). DO NOT `
            + `re-run close for this period -- commissions and the union hold have already `
            + `been applied.`,
          periodId: pid,
          alreadyApplied: true,
        });
      }
      if (err_settlement_periods_3wobo) {
        // FAIL-LOUD: this is the worst one. All the money movement above has
        // already committed. If the period is not marked closed, it stays
        // `open`, the caller is told "closed", and the next run re-executes
        // EVERYTHING — re-inserting commission records, re-debiting the club
        // treasury for the union hold and re-crediting the union. Report it so
        // the period is closed by hand rather than settled twice.
        return res.status(500).json({
          success: false,
          error: `Settlement completed but the period could not be marked closed: `
            + `${err_settlement_periods_3wobo.message}. DO NOT re-run close for this `
            + `period - commissions and the union hold have already been applied.`,
          periodId: pid,
          alreadyApplied: true,
        });
      }

      const responseObj = {
        success: true,
        periodId: pid,
        periodNumber: period.period_number,
        totalRakeCollected: totalRake,
        unionHold,
        clubRetained: totalRake - unionHold,
        playerPnl,
        // PHASE 7: no commission records are created by a close any more, and
        // this reports what was actually PAID in the period rather than what a
        // second calculation thought was owed.
        agentCommissions: 0,
        totalCommissionsPaid: totalCommissions,
        message: `Period #${period.period_number} closed. Agent commission accrues per hand and is claimed by the agent.`,
      };
      logAudit(supabaseAdmin, { actionType: 'settlement_closed', userId: user.id, clubId, ip: extractIP(req), details: { periodId: pid, periodNumber: period.period_number, totalRake, unionHold, clubRetained: totalRake - unionHold, playerPnl, totalCommissionsPaid: totalCommissions } });
      cacheResponse(req, 200, responseObj);
      return res.status(200).json(responseObj);
    }

    // ═══════════════════════════════════════════════════════════════
    // PAY: Mark a single commission as paid
    // ═══════════════════════════════════════════════════════════════
    if (action === 'pay') {
      // PHASE 7 (2026-09-01). REMOVED, not repointed.
      //
      // This marked a commission_records row paid and moved chips for it. That
      // table never held a row and is now dropped, so this action could only
      // ever 404 - but the reason it is not being rebuilt against
      // agent_commissions is the rule, not the table.
      //
      // Dan, phase 6: "AGENTS HANDLE THEIR OWN PAYOUTS, THEY SELL THEIR RAKE
      // BACK CHIPS BACK TO THEIR DOWNLINES". fn_agent_claim_commission pays
      // auth.uid() and takes no payee parameter at all, precisely so there is
      // no way for one person to move another's earnings. A staff 'pay' action
      // is that way.
      return res.status(410).json({
        success: false,
        error: 'Staff No Longer Pay Commission. The Agent Claims It Themselves From Their Own Dashboard, And The Club Bank Covers It.',
        replacedBy: 'fn_agent_claim_commission',
      });
    }


    // ═══════════════════════════════════════════════════════════════
    // PAY_ALL: Mark all pending commissions for a period as paid
    // ═══════════════════════════════════════════════════════════════
    if (action === 'pay_all') {
      // PHASE 7 (2026-09-01). REMOVED, for the same reason as 'pay' above, and
      // with one more behind it: this one paid EVERY pending row in a period in
      // a loop. Against a rebuilt version reading agent_commissions, the
      // largest agent's 198,304 unsettled rows would have gone through it - the
      // exact shape phase 6 had to batch to survive an 8 second budget.
      return res.status(410).json({
        success: false,
        error: 'Staff No Longer Pay Commission. Each Agent Claims Their Own From Their Dashboard, In Batches, And The Club Bank Covers It.',
        replacedBy: 'fn_agent_claim_commission',
      });
    }


  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[settle-period]', err);
    return res.status(500).json({ success: false, error: 'Settlement action failed', details: process.env.NODE_ENV === 'development' ? err.message : undefined });
  }

  } catch (err) {
    console.warn('[API] Unhandled exception in handler:', err?.message || err);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Internal server error', message: err?.message || 'Unknown error' });
    }
  }
}
