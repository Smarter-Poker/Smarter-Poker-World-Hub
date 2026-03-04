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
import { createClient } from '@supabase/supabase-js';
const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');

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

  const { clubId, action, periodId, commissionId } = req.body;
  if (!clubId || !action) return res.status(400).json({ error: 'clubId and action required' });

  const validActions = ['open', 'close', 'pay', 'pay_all', 'status'];
  if (!validActions.includes(action)) {
    return res.status(400).json({ error: `action must be one of: ${validActions.join(', ')}` });
  }

  // Rate limit
  if (!applyRateLimit(req, res, 'club-arena/settle-period')) return;

  try {
    // Verify authorization
    const { data: club } = await supabaseAdmin
      .from('clubs')
      .select('id, owner_id, union_id, chip_treasury')
      .eq('id', clubId)
      .single();
    if (!club) return res.status(404).json({ error: 'Club not found' });

    let authorized = club.owner_id === user.id;
    if (!authorized && club.union_id) {
      const { data: ua } = await supabaseAdmin
        .from('union_admins')
        .select('role')
        .eq('union_id', club.union_id)
        .eq('user_id', user.id)
        .single();
      authorized = !!ua;
    }
    if (!authorized) return res.status(403).json({ error: 'Not authorized' });

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
          .eq('status', 'pending');
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
        return res.status(409).json({ error: 'A period is already open. Close it first.' });
      }

      // Get last period number
      const { data: lastPeriod } = await supabaseAdmin
        .from('settlement_periods')
        .select('period_number')
        .eq('club_id', clubId)
        .order('period_number', { ascending: false })
        .limit(1);

      const nextPeriod = (lastPeriod?.[0]?.period_number || 0) + 1;
      const now = new Date();
      const endAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 1 week

      const { data: period, error: pErr } = await supabaseAdmin
        .from('settlement_periods')
        .insert({
          club_id: clubId,
          union_id: club.union_id,
          period_number: nextPeriod,
          year: now.getFullYear(),
          start_at: now.toISOString(),
          end_at: endAt.toISOString(),
          status: 'open',
          total_rake_collected: 0,
          total_hands_dealt: 0,
          total_player_winnings: 0,
          total_player_losses: 0,
        })
        .select()
        .single();

      if (pErr) throw pErr;

      // Reset all agents' weekly_rake_generated
      const { data: agents } = await supabaseAdmin
        .from('agents')
        .select('id')
        .eq('club_id', clubId);

      for (const agent of (agents || [])) {
        await supabaseAdmin
          .from('agents')
          .update({ weekly_rake_generated: 0 })
          .eq('id', agent.id);
      }

      return res.status(200).json({
        success: true,
        period: period,
        message: `Period #${nextPeriod} opened`,
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // CLOSE: Close period and calculate commissions
    // ═══════════════════════════════════════════════════════════════
    if (action === 'close') {
      // Find the open period — always use the DB's open period, not a client-provided ID
      const { data: period } = await supabaseAdmin
        .from('settlement_periods')
        .select('*')
        .eq('club_id', clubId)
        .eq('status', 'open')
        .single();

      if (!period) return res.status(404).json({ error: 'No open period to close' });

      const pid = period.id;

      // Get all agents for this club
      const { data: agents } = await supabaseAdmin
        .from('agents')
        .select('id, user_id, commission_rate, weekly_rake_generated, is_prepaid, parent_agent_id')
        .eq('club_id', clubId)
        .eq('status', 'active');

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
          .single();
        unionRakeHold = union?.settings?.union_rake_hold || 0.10;
      }

      const commissionRecords = [];
      const commissionHistory = [];
      let totalCommissions = 0;

      for (const agent of (agents || [])) {
        const grossRake = agent.weekly_rake_generated || 0;
        if (grossRake <= 0) continue;

        // Commission = agent's rate × gross rake from their players
        const commission = Math.round(grossRake * agent.commission_rate * 100) / 100;

        // If agent has a parent agent, calculate sub-agent split
        let subAgentDeduction = 0;
        if (agent.parent_agent_id) {
          const { data: parentAgent } = await supabaseAdmin
            .from('agents')
            .select('commission_rate')
            .eq('id', agent.parent_agent_id)
            .single();
          if (parentAgent) {
            // Parent gets the difference between their rate and sub-agent's rate
            subAgentDeduction = Math.round(grossRake * (parentAgent.commission_rate - agent.commission_rate) * 100) / 100;
            if (subAgentDeduction < 0) subAgentDeduction = 0;
          }
        }

        const netCommission = commission - subAgentDeduction;

        commissionRecords.push({
          period_id: pid,
          agent_id: agent.id,
          gross_rake: grossRake,
          commission_rate: agent.commission_rate,
          commission_amount: netCommission,
          status: 'pending',
        });

        commissionHistory.push({
          club_id: clubId,
          agent_id: agent.id,
          period_id: pid,
          period_start: period.start_at,
          period_end: new Date().toISOString(),
          player_rake_generated: grossRake,
          commission_rate: agent.commission_rate,
          commission_earned: commission,
          sub_agent_commission: subAgentDeduction,
          net_commission: netCommission,
          status: 'pending',
        });

        totalCommissions += netCommission;
      }

      // Insert commission records
      if (commissionRecords.length > 0) {
        await supabaseAdmin.from('commission_records').insert(commissionRecords);
        await supabaseAdmin.from('commission_history').insert(commissionHistory);
      }

      // Calculate union hold
      const totalRake = period.total_rake_collected || 0;
      const unionHold = Math.round(totalRake * unionRakeHold * 100) / 100;

      // Debit union hold from club treasury
      if (club.union_id && unionHold > 0) {
        await supabaseAdmin.rpc('fn_debit_treasury', {
          p_club_id: clubId,
          p_amount: unionHold,
        });

        await supabaseAdmin.from('chip_transactions').insert({
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

        // Generate union_to_club invoice
        await supabaseAdmin.from('settlement_invoices').insert({
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
          status: 'generated',
        }).catch(e => console.error('[settle-period] Invoice insert error:', e.message));
      }

      // Generate club_to_agent invoices
      for (const cr of commissionRecords) {
        const agentInfo = (agents || []).find(a => a.id === cr.agent_id);
        if (!agentInfo) continue;
        await supabaseAdmin.from('settlement_invoices').insert({
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
        }).catch(e => console.error('[settle-period] Agent invoice error:', e.message));
      }

      // Close the period
      await supabaseAdmin
        .from('settlement_periods')
        .update({
          status: 'closed',
          settled_at: new Date().toISOString(),
          settled_by: user.id,
        })
        .eq('id', pid);

      return res.status(200).json({
        success: true,
        periodId: pid,
        periodNumber: period.period_number,
        totalRakeCollected: totalRake,
        unionHold,
        clubRetained: totalRake - unionHold,
        agentCommissions: commissionRecords.length,
        totalCommissionsPending: totalCommissions,
        message: `Period #${period.period_number} closed. ${commissionRecords.length} commission records created.`,
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // PAY: Mark a single commission as paid
    // ═══════════════════════════════════════════════════════════════
    if (action === 'pay') {
      if (!commissionId) return res.status(400).json({ error: 'commissionId required for pay action' });

      // Verify commission belongs to this club (via its settlement period)
      const { data: cr } = await supabaseAdmin
        .from('commission_records')
        .select('id, agent_id, commission_amount, period_id, status, period:settlement_periods!inner(club_id)')
        .eq('id', commissionId)
        .single();

      if (!cr) return res.status(404).json({ error: 'Commission record not found' });
      if (cr.period?.club_id !== clubId) {
        return res.status(403).json({ error: 'Commission does not belong to this club' });
      }
      if (cr.status === 'paid') {
        return res.status(400).json({ error: 'Commission already paid' });
      }

      const now = new Date().toISOString();
      const { error: payErr } = await supabaseAdmin
        .from('commission_records')
        .update({ status: 'paid', paid_at: now })
        .eq('id', commissionId)
        .eq('status', 'pending'); // Guard against double-pay race

      if (payErr) throw payErr;

      // Distribute chips: debit treasury, credit agent
      if (cr.commission_amount > 0) {
        const { data: agentData } = await supabaseAdmin
          .from('agents')
          .select('user_id')
          .eq('id', cr.agent_id)
          .single();

        if (agentData) {
          await supabaseAdmin.rpc('fn_debit_treasury', {
            p_club_id: clubId,
            p_amount: cr.commission_amount,
          });

          await supabaseAdmin.rpc('fn_credit_chips', {
            p_club_id: clubId,
            p_user_id: agentData.user_id,
            p_amount: cr.commission_amount,
          });

          await supabaseAdmin.from('chip_transactions').insert({
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
        }
      }

      // Get the period's start_at to scope the history update correctly
      const { data: periodData } = await supabaseAdmin
        .from('settlement_periods')
        .select('start_at')
        .eq('id', cr.period_id)
        .single();

      // Also update commission_history for this specific period only
      await supabaseAdmin
        .from('commission_history')
        .update({ status: 'paid', paid_at: now })
        .eq('agent_id', cr.agent_id)
        .eq('club_id', clubId)
        .eq('period_start', periodData?.start_at)
        .eq('status', 'pending');

      return res.status(200).json({ success: true, message: 'Commission marked as paid' });
    }

    // ═══════════════════════════════════════════════════════════════
    // PAY_ALL: Mark all pending commissions for a period as paid
    // ═══════════════════════════════════════════════════════════════
    if (action === 'pay_all') {
      if (!periodId) return res.status(400).json({ error: 'periodId required for pay_all action' });

      // Verify this period belongs to this club
      const { data: verifyPeriod } = await supabaseAdmin
        .from('settlement_periods')
        .select('id, club_id, start_at')
        .eq('id', periodId)
        .single();

      if (!verifyPeriod) return res.status(404).json({ error: 'Period not found' });
      if (verifyPeriod.club_id !== clubId) {
        return res.status(403).json({ error: 'Period does not belong to this club' });
      }

      const now = new Date().toISOString();

      const { data: pending } = await supabaseAdmin
        .from('commission_records')
        .select('id, agent_id, commission_amount')
        .eq('period_id', periodId)
        .eq('status', 'pending');

      if (!pending?.length) {
        return res.status(200).json({ success: true, message: 'No pending commissions to pay', paid: 0 });
      }

      // Mark all as paid
      await supabaseAdmin
        .from('commission_records')
        .update({ status: 'paid', paid_at: now })
        .eq('period_id', periodId)
        .eq('status', 'pending');

      // Distribute chips to each agent and update commission_history
      for (const cr of pending) {
        // Get agent's user_id for chip transfer
        const { data: agentData } = await supabaseAdmin
          .from('agents')
          .select('user_id')
          .eq('id', cr.agent_id)
          .single();

        if (agentData && cr.commission_amount > 0) {
          // Debit club treasury FIRST
          const { error: debitErr } = await supabaseAdmin.rpc('fn_debit_treasury', {
            p_club_id: clubId,
            p_amount: cr.commission_amount,
          });

          if (!debitErr) {
            // Credit agent's chip balance
            await supabaseAdmin.rpc('fn_credit_chips', {
              p_club_id: clubId,
              p_user_id: agentData.user_id,
              p_amount: cr.commission_amount,
            });

            // Record chip transaction
            await supabaseAdmin.from('chip_transactions').insert({
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
          }
        }

        // Update commission_history
        await supabaseAdmin
          .from('commission_history')
          .update({ status: 'paid', paid_at: now })
          .eq('agent_id', cr.agent_id)
          .eq('club_id', clubId)
          .eq('period_start', verifyPeriod.start_at)
          .eq('status', 'pending');

        // NOTE: lifetime_earnings is already credited per-hand in real-time by the
        // calculate_cascading_commission RPC. We do NOT re-credit here to avoid
        // double-counting. Settlement marks commissions as "paid" (accounting),
        // not "earned" (already happened at the table).
      }

      const totalPaid = pending.reduce((sum, c) => sum + c.commission_amount, 0);

      return res.status(200).json({
        success: true,
        paid: pending.length,
        totalPaid,
        message: `${pending.length} commissions paid (${totalPaid.toLocaleString()} chips)`,
      });
    }

  } catch (err) {
    console.error('[settle-period]', err);
    return res.status(500).json({ error: 'Settlement action failed', details: err.message });
  }
}
