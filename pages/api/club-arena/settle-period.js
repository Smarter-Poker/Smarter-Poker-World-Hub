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

      let pendingCommissions = [];
      // Check the most relevant period for pending commissions
      const commissionPeriod = openPeriod || closedPeriod;
      if (commissionPeriod) {
        const { data: comms } = await supabaseAdmin
          .from('commission_records')
          .select('*, agents!inner(user_id)')
          .eq('period_id', commissionPeriod.id)
          .eq('status', 'pending')
          .limit(100);
        pendingCommissions = comms || [];
      }

      return res.status(200).json({
        success: true,
        currentPeriod: openPeriod || closedPeriod || null,
        recentPeriods: periods || [],
        pendingCommissions,
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
        })
        .select()
        .maybeSingle();

      if (pErr) throw pErr;

      // Reset all agents' weekly_rake_generated — single batch UPDATE (was serial loop, O(n) round-trips)
      const { error: err_agents_8n8q4 } = await supabaseAdmin
        .from('agents')
        .update({ weekly_rake_generated: 0 })
        .eq('club_id', clubId);
      if (err_agents_8n8q4) console.warn('[Supabase] Silent mutation failed in agents:', err_agents_8n8q4.message);

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
      const { data: period } = await supabaseAdmin
        .from('settlement_periods')
        .select('id, period_number, start_at')  // BUG FIX: was select('id') — period_number/start_at were undefined
        .eq('club_id', clubId)
        .eq('status', 'open')
        .maybeSingle();

      if (!period) return res.status(404).json({ success: false, error: 'No open period to close' });

      const pid = period.id;

      // Get all agents for this club
      const { data: agents } = await supabaseAdmin
        .from('agents')
        .select('id, user_id, commission_rate, weekly_rake_generated, is_prepaid, parent_agent_id')
        .eq('club_id', clubId)
        .eq('status', 'active')

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

      const commissionRecords = [];
      const commissionHistory = [];
      let totalCommissions = 0;

      const agentsMap = new Map();
      const agentEarnings = new Map();
      const childrenMap = new Map(); // Build 6.8: Agent Graph Cache — top-down lookup

      for (const agent of (agents || [])) {
        agentsMap.set(agent.id, agent);
        // Build children graph for potential top-down traversal
        if (agent.parent_agent_id) {
          if (!childrenMap.has(agent.parent_agent_id)) childrenMap.set(agent.parent_agent_id, []);
          childrenMap.get(agent.parent_agent_id).push(agent.id);
        }
        // Initialize earnings template for everyone
        agentEarnings.set(agent.id, {
          id: agent.id,
          commission_rate: agent.commission_rate,
          direct_rake: agent.weekly_rake_generated || 0,
          direct_commission: 0,
          upline_commission: 0,
          total_subagent_deductions: 0 // Optional tracking for history
        });
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

      for (const agent of (agents || [])) {
        const grossRake = agent.weekly_rake_generated || 0;
        if (grossRake <= 0) continue;

        const earningsLog = agentEarnings.get(agent.id);
        const directEarned = Math.round(grossRake * agent.commission_rate * 100) / 100;
        earningsLog.direct_commission += directEarned;

        // ── MLM RECURSIVE UPLINE TRAVERSAL ──
        // Pass the remaining delta up the tree to parents with higher rates
        let currentAgent = agent;
        let previousRate = agent.commission_rate;
        const visitedTree = new Set([agent.id]); // Prevent infinite MLM loops

        while (currentAgent.parent_agent_id) {
          if (visitedTree.has(currentAgent.parent_agent_id)) {
            console.warn(`[CRITICAL] Infinite MLM loop detected at agent ${currentAgent.id}. Breaking upline propagation.`);
            break;
          }

          const parentAgent = agentsMap.get(currentAgent.parent_agent_id);
          if (!parentAgent) break; // Parent left club or deleted

          visitedTree.add(parentAgent.id);

          // Calculate Delta (Parent Rate - Previous Child Rate)
          if (parentAgent.commission_rate > previousRate) {
            const rateDiff = parentAgent.commission_rate - previousRate;
            const passUpAmount = Math.round(grossRake * rateDiff * 100) / 100;

            const parentEarnings = agentEarnings.get(parentAgent.id);
            if (parentEarnings) {
              parentEarnings.upline_commission += passUpAmount;
            }
            previousRate = parentAgent.commission_rate;
          }

          currentAgent = parentAgent;
        }
      }

      // Format final inserts for non-zero earners
      totalCommissions = 0;
      for (const [agentId, earnings] of agentEarnings.entries()) {
        const netCommission = earnings.direct_commission + earnings.upline_commission;
        if (netCommission <= 0) continue;

        commissionRecords.push({
          period_id: pid,
          agent_id: agentId,
          gross_rake: earnings.direct_rake, // Track their physical direct generation
          commission_rate: earnings.commission_rate,
          commission_amount: netCommission,
          status: 'pending',
        });

        commissionHistory.push({
          club_id: clubId,
          agent_id: agentId,
          period_id: pid,
          period_start: period.start_at,
          period_end: new Date().toISOString(), // MANDATE 2: toISOString() is always UTC
          player_rake_generated: earnings.direct_rake,
          commission_rate: earnings.commission_rate,
          commission_earned: netCommission, // Re-mapped: Direct + Upline combined
          sub_agent_commission: 0, // Archival field - delta approach removes need for gross deductions
          net_commission: netCommission,
          status: 'pending',
        });

        totalCommissions += netCommission;
      }

      // Insert commission records
      if (commissionRecords.length > 0) {
        const { error: crErr } = await supabaseAdmin.from('commission_records').insert(commissionRecords);
        if (crErr) throw new Error('[settle-period] commission_records insert failed: ' + crErr.message);

        const { error: chErr } = await supabaseAdmin.from('commission_history').insert(commissionHistory);
        if (chErr) throw new Error('[settle-period] commission_history insert failed: ' + chErr.message);
      }

      // Calculate union hold
      // settlement_periods.total_rake_collected is never updated by record_rake RPC,
      // so calculate actual total from agents' weekly_rake_generated
      const actualTotalRake = (agents || []).reduce((sum, a) => sum + (a.weekly_rake_generated || 0), 0);
      const totalRake = actualTotalRake || period.total_rake_collected || 0;
      const unionHold = Math.round(totalRake * unionRakeHold * 100) / 100;

      // Update the period with the actual total
      if (actualTotalRake > 0) {
        const { error: err_settlement_periods_ekp4u } = await supabaseAdmin
          .from('settlement_periods')
          .update({ total_rake_collected: actualTotalRake })
          .eq('id', pid);
        if (err_settlement_periods_ekp4u) console.warn('[Supabase] Silent mutation failed in settlement_periods:', err_settlement_periods_ekp4u.message);
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
              console.error('[settle-period] CRITICAL: union hold refund ALSO failed — treasury debited, union not credited:', refundErr.message);
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
            notes: `Union rake hold: ${unionHold.toLocaleString()} chips (${(unionRakeHold * 100).toFixed(1)}% of ${totalRake.toLocaleString()} rake) — Period #${period.period_number}`,
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

      // Generate club_to_agent invoices
      for (const cr of commissionRecords) {
        const agentInfo = (agents || []).find(a => a.id === cr.agent_id);
        if (!agentInfo) continue;
        const { error: agInvErr } = await supabaseAdmin.from('settlement_invoices').insert({
          club_id: clubId,
          period_id: pid,
          invoice_type: 'club_to_agent',
          from_entity_type: 'club',
          from_entity_id: String(clubId),
          to_entity_type: 'agent',
          to_entity_id: String(agentInfo.user_id),
          gross_amount: cr.gross_rake,
          net_amount: cr.commission_amount,
          breakdown: {
            gross_rake: cr.gross_rake,
            commission_rate: cr.commission_rate,
            commission_amount: cr.commission_amount,
          },
          status: 'generated',
        });
        if (agInvErr) console.warn('[settle-period] Agent invoice error:', agInvErr.message);
      }

      // Close the period
      const { error: err_settlement_periods_3wobo } = await supabaseAdmin
        .from('settlement_periods')
        .update({
          status: 'closed',
          settled_at: new Date().toISOString(),
          settled_by: user.id,
        })
        .eq('id', pid);
      if (err_settlement_periods_3wobo) console.warn('[Supabase] Silent mutation failed in settlement_periods:', err_settlement_periods_3wobo.message);

      const responseObj = {
        success: true,
        periodId: pid,
        periodNumber: period.period_number,
        totalRakeCollected: totalRake,
        unionHold,
        clubRetained: totalRake - unionHold,
        agentCommissions: commissionRecords.length,
        totalCommissionsPending: totalCommissions,
        message: `Period #${period.period_number} closed. ${commissionRecords.length} commission records created.`,
      };
      logAudit(supabaseAdmin, { actionType: 'settlement_closed', userId: user.id, clubId, ip: extractIP(req), details: { periodId: pid, periodNumber: period.period_number, totalRake, unionHold, clubRetained: totalRake - unionHold, agentCommissions: commissionRecords.length, totalCommissions } });
      cacheResponse(req, 200, responseObj);
      return res.status(200).json(responseObj);
    }

    // ═══════════════════════════════════════════════════════════════
    // PAY: Mark a single commission as paid
    // ═══════════════════════════════════════════════════════════════
    if (action === 'pay') {
      if (!commissionId) return res.status(400).json({ success: false, error: 'commissionId required for pay action' });

      // Verify commission belongs to this club (via its settlement period)
      const { data: cr } = await supabaseAdmin
        .from('commission_records')
        .select('id, agent_id, commission_amount, period_id, status, period:settlement_periods!inner(club_id)')
        .eq('id', commissionId)
        .maybeSingle();

      if (!cr) return res.status(404).json({ success: false, error: 'Commission record not found' });
      if (cr.period?.club_id !== clubId) {
        return res.status(403).json({ success: false, error: 'Commission does not belong to this club' });
      }
      if (cr.status === 'paid') {
        return res.status(400).json({ success: false, error: 'Commission already paid' });
      }

      const now = new Date().toISOString();
      const { error: payErr } = await supabaseAdmin
        .from('commission_records')
        .update({ status: 'paid', paid_at: now })
        .eq('id', commissionId)
        .eq('status', 'pending'); // Guard against double-pay race

      if (payErr) throw payErr;

      // Look up agent user_id (needed for chip transfer AND invoice update)
      const { data: agentData } = await supabaseAdmin
        .from('agents')
        .select('user_id')
        .eq('id', cr.agent_id)
        .maybeSingle();

      // Distribute chips: debit treasury, credit agent
      if (cr.commission_amount > 0 && agentData) {
        const { error: debitErr } = await supabaseAdmin.rpc('fn_debit_treasury', {
          p_club_id: clubId,
          p_amount: cr.commission_amount,
        });

        if (debitErr) {
          console.warn('[settle-period] pay debit failed:', debitErr.message);
          return res.status(400).json({ success: false, error: 'Insufficient club treasury to pay commission' });
        }

        const { error: creditChipsErr } = await supabaseAdmin.rpc('fn_credit_chips', {
          p_club_id: clubId,
          p_user_id: agentData.user_id,
          p_amount: cr.commission_amount,
        });
        if (creditChipsErr) throw new Error('[settle-period] Manual fn_credit_chips failed: ' + creditChipsErr.message);

        const { error: manualTxErr } = await supabaseAdmin.from('chip_transactions').insert({
          club_id: clubId,
          from_user_id: null,
          to_user_id: agentData.user_id,
          amount: cr.commission_amount,
          transaction_type: 'commission',
          notes: `Agent commission paid: ${cr.commission_amount.toLocaleString()} chips — Manual settlement`,
          metadata: {
            period_id: cr.period_id,
            commission_record_id: cr.id,
            settlement_type: 'manual',
          },
        });
        if (manualTxErr) throw new Error('[settle-period] Manual settlement chip_transactions insert failed: ' + manualTxErr.message);
      }

      // Get the period's start_at to scope the history update correctly
      const { data: periodData } = await supabaseAdmin
        .from('settlement_periods')
        .select('start_at')
        .eq('id', cr.period_id)
        .maybeSingle();

      // Also update commission_history for this specific period only
      const { error: err_commission_history_zkxov } = await supabaseAdmin
        .from('commission_history')
        .update({ status: 'paid', paid_at: now })
        .eq('agent_id', cr.agent_id)
        .eq('club_id', clubId)
        .eq('period_start', periodData?.start_at)
        .eq('status', 'pending');
      if (err_commission_history_zkxov) console.warn('[Supabase] Silent mutation failed in commission_history:', err_commission_history_zkxov.message);

      // Update the corresponding settlement invoice
      if (agentData) {
        const { error: err_settlement_invoices_kfcss } = await supabaseAdmin
          .from('settlement_invoices')
          .update({ status: 'paid', chips_transferred: true, transferred_at: now })
          .eq('club_id', clubId)
          .eq('period_id', cr.period_id)
          .eq('invoice_type', 'club_to_agent')
          .eq('to_entity_id', String(agentData.user_id))
          .eq('status', 'generated');
        if (err_settlement_invoices_kfcss) console.warn('[Supabase] Silent mutation failed in settlement_invoices:', err_settlement_invoices_kfcss.message);
      }

      logAudit(supabaseAdmin, { actionType: 'commission_paid', userId: user.id, targetUserId: agentData?.user_id, clubId, amount: cr.commission_amount, ip: extractIP(req), details: { commissionId, periodId: cr.period_id } });
      cacheResponse(req, 200, { success: true, message: 'Commission marked as paid' });
      return res.status(200).json({ success: true, message: 'Commission marked as paid' });
    }

    // ═══════════════════════════════════════════════════════════════
    // PAY_ALL: Mark all pending commissions for a period as paid
    // ═══════════════════════════════════════════════════════════════
    if (action === 'pay_all') {
      if (!periodId) return res.status(400).json({ success: false, error: 'periodId required for pay_all action' });

      // Verify this period belongs to this club
      const { data: verifyPeriod } = await supabaseAdmin
        .from('settlement_periods')
        .select('id, club_id, start_at')
        .eq('id', periodId)
        .maybeSingle();

      if (!verifyPeriod) return res.status(404).json({ success: false, error: 'Period not found' });
      if (verifyPeriod.club_id !== clubId) {
        return res.status(403).json({ success: false, error: 'Period does not belong to this club' });
      }

      const now = new Date().toISOString();

      const { data: pending } = await supabaseAdmin
        .from('commission_records')
        .select('id, agent_id, commission_amount')
        .eq('period_id', periodId)
        .eq('status', 'pending')
        .limit(100);

      if (!pending?.length) {
        return res.status(200).json({ success: true, message: 'No pending commissions to pay', paid: 0 });
      }

      // BUG FIX: Distribute chips FIRST, THEN mark as paid (was reversed — paid before chips delivered)
      // This prevents commissions being marked paid when chip transfer fails.
      const paidIds = [];

      // Distribute chips to each agent
      for (const cr of pending) {
        // Get agent's user_id for chip transfer
        const { data: agentData } = await supabaseAdmin
          .from('agents')
          .select('user_id')
          .eq('id', cr.agent_id)
          .maybeSingle();

        if (agentData && cr.commission_amount > 0) {
          // Debit club treasury FIRST
          const { error: debitErr } = await supabaseAdmin.rpc('fn_debit_treasury', {
            p_club_id: clubId,
            p_amount: cr.commission_amount,
          });

          if (!debitErr) {
            // Credit agent's chip balance
            const { error: payAllCreditErr } = await supabaseAdmin.rpc('fn_credit_chips', {
              p_club_id: clubId,
              p_user_id: agentData.user_id,
              p_amount: cr.commission_amount,
            });
            if (payAllCreditErr) throw new Error('[settle-period] pay_all fn_credit_chips failed: ' + payAllCreditErr.message);

            // Record chip transaction
            const { error: payAllTxErr } = await supabaseAdmin.from('chip_transactions').insert({
              club_id: clubId,
              from_user_id: null,
              to_user_id: agentData.user_id,
              amount: cr.commission_amount,
              transaction_type: 'commission',
              notes: `Agent commission paid: ${cr.commission_amount.toLocaleString()} chips — Period settlement`,
              metadata: {
                period_id: periodId,
                commission_record_id: cr.id,
                settlement_type: 'manual',
              },
            });
            if (payAllTxErr) throw new Error('[settle-period] pay_all chip_transactions insert failed: ' + payAllTxErr.message);

            // Only track as paid after chips are confirmed delivered
            paidIds.push(cr.id);
          }
        } else {
          // No chip transfer needed (amount is 0) — still mark as paid
          paidIds.push(cr.id);
        }

        // Update commission_history
        const { error: err_commission_history_cvwkq } = await supabaseAdmin
          .from('commission_history')
          .update({ status: 'paid', paid_at: now })
          .eq('agent_id', cr.agent_id)
          .eq('club_id', clubId)
          .eq('period_start', verifyPeriod.start_at)
          .eq('status', 'pending');
        if (err_commission_history_cvwkq) console.warn('[Supabase] Silent mutation failed in commission_history:', err_commission_history_cvwkq.message);

        // Update settlement invoice for this agent
        if (agentData) {
          const { error: err_settlement_invoices_86ezc } = await supabaseAdmin
            .from('settlement_invoices')
            .update({ status: 'paid', chips_transferred: true, transferred_at: now })
            .eq('club_id', clubId)
            .eq('period_id', periodId)
            .eq('invoice_type', 'club_to_agent')
            .eq('to_entity_id', String(agentData.user_id))
            .eq('status', 'generated');
          if (err_settlement_invoices_86ezc) console.warn('[Supabase] Silent mutation failed in settlement_invoices:', err_settlement_invoices_86ezc.message);
        }

        // NOTE: lifetime_earnings is already credited per-hand in real-time by the
        // calculate_cascading_commission RPC. We do NOT re-credit here to avoid
        // double-counting. Settlement marks commissions as "paid" (accounting),
        // not "earned" (already happened at the table).
      }

      // Now mark ONLY successfully-distributed commissions as paid
      if (paidIds.length > 0) {
        const { error: err_commission_records_ojc4k } = await supabaseAdmin
          .from('commission_records')
          .update({ status: 'paid', paid_at: now })
          .in('id', paidIds)
          .eq('status', 'pending');
        if (err_commission_records_ojc4k) console.warn('[Supabase] Silent mutation failed in commission_records:', err_commission_records_ojc4k.message); // Guard: only update still-pending ones
      }

      const totalPaid = pending
        .filter(c => paidIds.includes(c.id))
        .reduce((sum, c) => sum + c.commission_amount, 0);
      const skipped = pending.length - paidIds.length;

      // Notify each paid agent (fire-and-forget)
      for (const cr of pending.filter(c => paidIds.includes(c.id) && c.commission_amount > 0)) {
        const { data: ag } = await supabaseAdmin.from('agents').select('user_id').eq('id', cr.agent_id).maybeSingle();
        if (ag?.user_id) {
          await notifyUser(supabaseAdmin, {
            userId: ag.user_id, type: 'commission_paid',
            title: `💵 Commission Paid: ${cr.commission_amount.toLocaleString()}`,
            message: `Your commission of ${cr.commission_amount.toLocaleString()} chips has been paid.`,
            data: { clubId, amount: cr.commission_amount },
            pushUrl: `/hub/club-arena/agent-dashboard?club=${clubId}`,
          }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
        }
      }

      const responseObj = {
        success: true,
        paid: paidIds.length,
        skipped,
        totalPaid,
        message: skipped > 0
          ? `${paidIds.length}/${pending.length} commissions paid. ${skipped} skipped due to treasury shortfall.`
          : `${paidIds.length} commissions paid (${totalPaid.toLocaleString()} chips)`,
      };
      logAudit(supabaseAdmin, { actionType: 'commission_paid_all', userId: user.id, clubId, amount: totalPaid, ip: extractIP(req), details: { periodId, paid: paidIds.length, skipped, totalPaid } });
      cacheResponse(req, 200, responseObj);
      return res.status(200).json(responseObj);
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
