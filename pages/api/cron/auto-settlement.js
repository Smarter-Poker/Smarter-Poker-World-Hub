/**
 * POST /api/cron/auto-settlement
 * 
 * WEEKLY AUTO-SETTLEMENT SYSTEM
 * Runs every Monday at 10:00 UTC (4:00 AM CST)
 * 
 * FLOW:
 * 1. FREEZE (4:00 AM) — Lock all clubs' send/receive/cashout operations
 * 2. SETTLE — Close all open settlement periods, calculate commissions
 * 3. INVOICE — Generate invoices: Union→Club, Club→Agent, Agent→SubAgent
 * 4. DISTRIBUTE — Transfer commission chips to agents
 * 5. MESSAGE — Notify all parties through club messaging system
 * 6. OPEN — Open new settlement periods for all clubs
 * 
 * At 4:10 AM, a separate cron (auto-settlement-distribute) handles:
 * - Agent→Player rakeback distribution
 * - Unfreeze all clubs
 * 
 * Vercel cron config:
 * { "path": "/api/cron/auto-settlement", "schedule": "0 10 * * 1" }
 * (10:00 UTC Monday = 4:00 AM CST Monday)
 */
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// System user ID for automated transactions
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth: Vercel cron secret OR authenticated user with JWT
  const cronSecret = req.headers['authorization']?.replace('Bearer ', '');

  if (cronSecret !== process.env.CRON_SECRET || !process.env.CRON_SECRET) {
    // Not a valid cron invocation — require JWT auth + admin role
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      const { data: { user } } = await supabaseAdmin.auth.getUser(token);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });
      // BUG #123 FIX: Manual trigger requires platform admin or club owner role
      // Any authenticated user could previously trigger settlement for ALL clubs
      const { data: adminCheck } = await supabaseAdmin
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      const isAdmin = adminCheck?.role === 'admin' || adminCheck?.role === 'superadmin';
      if (!isAdmin) {
        // Check if they own at least one club (owners may manually trigger for testing)
        const { data: ownedClubs } = await supabaseAdmin
          .from('clubs')
          .select('id')
          .eq('owner_id', user.id)
          .limit(1);
        if (!ownedClubs || ownedClubs.length === 0) {
          return res.status(403).json({ error: 'Only platform admins or club owners can manually trigger settlement' });
        }
      }
    } else {
      return res.status(401).json({ error: 'Unauthorized — missing cron secret or auth token' });
    }
  }

  const startTime = Date.now();
  const results = {
    phase: 'started',
    clubs_processed: 0,
    clubs_locked: 0,
    periods_closed: 0,
    invoices_generated: 0,
    commissions_distributed: 0,
    messages_sent: 0,
    periods_opened: 0,
    errors: [],
  };

  try {
    // ═══════════════════════════════════════════════════════════════
    // PHASE 1: FREEZE ALL CLUBS
    // Lock send/receive/cashout for 10 minutes (4:00 - 4:10 AM CST)
    // ═══════════════════════════════════════════════════════════════
    results.phase = 'freezing';

    const { data: clubs } = await supabaseAdmin
      .from('clubs')
      .select('id, name, owner_id, union_id, chip_treasury, auto_settlement_enabled, settings')
      .eq('auto_settlement_enabled', true);

    if (!clubs?.length) {
      return res.status(200).json({
        success: true,
        message: 'No clubs with auto-settlement enabled',
        results,
      });
    }

    const now = new Date();
    const unlockAt = new Date(now.getTime() + 10 * 60 * 1000); // +10 minutes

    // Expire any stale locks first
    await supabaseAdmin.rpc('expire_settlement_locks').catch(() => {
      // RPC may not exist yet, manual fallback
      return supabaseAdmin
        .from('settlement_locks')
        .update({ is_active: false, unlocked_at: now.toISOString() })
        .eq('is_active', true)
        .lt('unlock_at', now.toISOString());
    });

    // Create settlement locks for all clubs
    for (const club of clubs) {
      try {
        // Check for existing active lock
        const { data: existingLock } = await supabaseAdmin
          .from('settlement_locks')
          .select('id')
          .eq('club_id', club.id)
          .eq('is_active', true)
          .single();

        if (!existingLock) {
          await supabaseAdmin.from('settlement_locks').insert({
            club_id: club.id,
            lock_type: 'weekly_settlement',
            locked_at: now.toISOString(),
            unlock_at: unlockAt.toISOString(),
            is_active: true,
            lock_reason: 'Weekly auto-settlement in progress. Operations resume at 4:10 AM CST.',
          });
        }

        // Also flag on clubs table for fast checks
        await supabaseAdmin
          .from('clubs')
          .update({
            settlement_locked: true,
            settlement_locked_until: unlockAt.toISOString(),
          })
          .eq('id', club.id);

        results.clubs_locked++;
      } catch (lockErr) {
        results.errors.push({ club: club.name, phase: 'freeze', error: lockErr.message });
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // PHASE 2: CLOSE ALL OPEN SETTLEMENT PERIODS
    // Calculate agent commissions, union rake holds
    // ═══════════════════════════════════════════════════════════════
    results.phase = 'settling';

    for (const club of clubs) {
      try {
        // Find open period
        const { data: openPeriod } = await supabaseAdmin
          .from('settlement_periods')
          .select('*')
          .eq('club_id', club.id)
          .eq('status', 'open')
          .single();

        if (!openPeriod) {
          // No open period — just open a new one later
          continue;
        }

        // Get all active agents for this club
        const { data: agents } = await supabaseAdmin
          .from('agents')
          .select(`
            id, user_id, commission_rate, weekly_rake_generated, 
            is_prepaid, parent_agent_id, auto_rakeback_enabled,
            rakeback_percentage, active_player_count
          `)
          .eq('club_id', club.id)
          .eq('status', 'active');

        // Get union settings
        let unionRakeHold = 0.10;
        let unionId = club.union_id;
        if (unionId) {
          const { data: union } = await supabaseAdmin
            .from('unions')
            .select('id, settings, name')
            .eq('id', unionId)
            .single();
          unionRakeHold = union?.settings?.union_rake_hold || 0.10;
        }

        const totalRake = openPeriod.total_rake_collected || 0;
        const totalHands = openPeriod.total_hands_dealt || 0;
        const unionHoldAmount = Math.round(totalRake * unionRakeHold * 100) / 100;

        // ─── INVOICE 1: Union → Club (rake hold charge) ───
        if (unionId && unionHoldAmount > 0) {
          await supabaseAdmin.from('settlement_invoices').insert({
            club_id: club.id,
            period_id: openPeriod.id,
            invoice_type: 'union_to_club',
            from_entity_type: 'union',
            from_entity_id: String(unionId),
            to_entity_type: 'club',
            to_entity_id: String(club.id),
            gross_amount: totalRake,
            net_amount: unionHoldAmount,
            deductions: 0,
            breakdown: {
              total_rake: totalRake,
              total_hands: totalHands,
              rake_hold_pct: unionRakeHold,
              union_hold_amount: unionHoldAmount,
              club_retained: totalRake - unionHoldAmount,
              period_number: openPeriod.period_number,
            },
            status: 'generated',
          });
          results.invoices_generated++;
        }

        // ─── Process each agent ───
        const commissionRecords = [];
        const commissionHistory = [];
        let totalCommissions = 0;

        for (const agent of (agents || [])) {
          const grossRake = agent.weekly_rake_generated || 0;
          if (grossRake <= 0) continue;

          const commission = Math.round(grossRake * agent.commission_rate * 100) / 100;

          // Calculate sub-agent deduction if this agent has a parent
          let subAgentDeduction = 0;
          if (agent.parent_agent_id) {
            const { data: parentAgent } = await supabaseAdmin
              .from('agents')
              .select('commission_rate, user_id')
              .eq('id', agent.parent_agent_id)
              .single();

            if (parentAgent) {
              subAgentDeduction = Math.round(
                grossRake * Math.max(0, parentAgent.commission_rate - agent.commission_rate) * 100
              ) / 100;

              // ─── INVOICE 3: Agent → SubAgent ───
              if (subAgentDeduction > 0) {
                await supabaseAdmin.from('settlement_invoices').insert({
                  club_id: club.id,
                  period_id: openPeriod.id,
                  invoice_type: 'agent_to_subagent',
                  from_entity_type: 'agent',
                  from_entity_id: parentAgent.user_id,
                  to_entity_type: 'agent',
                  to_entity_id: agent.user_id,
                  gross_amount: grossRake,
                  net_amount: commission,
                  deductions: subAgentDeduction,
                  breakdown: {
                    parent_rate: parentAgent.commission_rate,
                    sub_rate: agent.commission_rate,
                    rate_diff: parentAgent.commission_rate - agent.commission_rate,
                    gross_rake: grossRake,
                    sub_commission: commission,
                    parent_deduction: subAgentDeduction,
                  },
                  status: 'generated',
                });
                results.invoices_generated++;
              }
            }
          }

          const netCommission = commission - subAgentDeduction;

          // ─── INVOICE 2: Club → Agent ───
          await supabaseAdmin.from('settlement_invoices').insert({
            club_id: club.id,
            period_id: openPeriod.id,
            invoice_type: 'club_to_agent',
            from_entity_type: 'club',
            from_entity_id: String(club.id),
            to_entity_type: 'agent',
            to_entity_id: agent.user_id,
            gross_amount: grossRake,
            net_amount: netCommission,
            deductions: subAgentDeduction,
            breakdown: {
              gross_rake: grossRake,
              commission_rate: agent.commission_rate,
              gross_commission: commission,
              sub_agent_deduction: subAgentDeduction,
              net_commission: netCommission,
              period_number: openPeriod.period_number,
              is_prepaid: agent.is_prepaid,
            },
            status: 'generated',
          });
          results.invoices_generated++;

          // Commission records (existing system compatibility)
          commissionRecords.push({
            period_id: openPeriod.id,
            agent_id: agent.id,
            gross_rake: grossRake,
            commission_rate: agent.commission_rate,
            commission_amount: netCommission,
            status: 'pending',
          });

          commissionHistory.push({
            club_id: club.id,
            agent_id: agent.id,
            period_start: openPeriod.start_at,
            period_end: now.toISOString(),
            player_rake_generated: grossRake,
            commission_rate: agent.commission_rate,
            commission_earned: commission,
            sub_agent_commission: subAgentDeduction,
            net_commission: netCommission,
            status: 'pending',
          });

          totalCommissions += netCommission;

          // ─── DISTRIBUTE CHIPS: Club treasury → Agent balance ───
          if (netCommission > 0) {
            // Transfer chips
            const { data: agentMember } = await supabaseAdmin
              .from('club_members')
              .select('chip_balance')
              .eq('club_id', club.id)
              .eq('user_id', agent.user_id)
              .single();

            if (agentMember) {
              // BUG #150 FIX: Debit club treasury FIRST, then credit agent.
              // record_rake RPC credits full club_share to chip_treasury.
              // Without this debit, fn_credit_chips creates chips from nothing,
              // inflating total supply every settlement cycle.
              await supabaseAdmin.rpc('fn_debit_treasury', {
                p_club_id: club.id,
                p_amount: netCommission,
              });

              // Add to agent's chip balance atomically
              await supabaseAdmin.rpc('fn_credit_chips', {
                p_club_id: club.id,
                p_user_id: agent.user_id,
                p_amount: netCommission,
              });

              // Update agents table
              // NOTE: lifetime_earnings is already credited correctly per-hand by
              // calculate_cascading_commission RPC. We do NOT re-credit here.
              // business_balance is zeroed because the agent's commission has now been
              // paid out to their chip_balance via fn_credit_chips above.
              await supabaseAdmin
                .from('agents')
                .update({
                  business_balance: 0, // Paid out — zero the tracking balance
                })
                .eq('id', agent.id);

              // Record chip transaction
              const { data: txn } = await supabaseAdmin
                .from('chip_transactions')
                .insert({
                  club_id: club.id,
                  from_user_id: SYSTEM_USER_ID,
                  to_user_id: agent.user_id,
                  amount: netCommission,
                  transaction_type: 'commission',
                  notes: `Auto-settlement Period #${openPeriod.period_number}: Commission ${netCommission.toLocaleString()} chips (${(agent.commission_rate * 100).toFixed(1)}% of ${grossRake.toLocaleString()} rake)`,
                  metadata: {
                    period_id: openPeriod.id,
                    period_number: openPeriod.period_number,
                    settlement_type: 'auto',
                  },
                })
                .select('id')
                .single();

              // Update invoice with transfer reference
              if (txn) {
                await supabaseAdmin
                  .from('settlement_invoices')
                  .update({
                    chips_transferred: true,
                    transferred_at: now.toISOString(),
                    chip_transfer_id: txn.id,
                    status: 'paid',
                  })
                  .eq('club_id', club.id)
                  .eq('period_id', openPeriod.id)
                  .eq('invoice_type', 'club_to_agent')
                  .eq('to_entity_id', agent.user_id);
              }

              results.commissions_distributed++;
            }
          }

          // ─── PREPARE PLAYER RAKEBACK DISTRIBUTIONS ───
          // (These execute in the 4:10 AM cron after agents have their chips)
          // Uses per-player rakeback rate from club_members.player_rakeback_pct
          // Default 0 = no rakeback. Max = agent_commission - 10%
          {
            // Get all players assigned to this agent who have rakeback enabled
            const { data: agentPlayers } = await supabaseAdmin
              .from('club_members')
              .select('user_id, player_rakeback_pct')
              .eq('club_id', club.id)
              .eq('agent_id', agent.user_id)
              .eq('role', 'player')
              .gt('player_rakeback_pct', 0);

            for (const player of (agentPlayers || [])) {
              const playerRakebackPct = player.player_rakeback_pct || 0;
              if (playerRakebackPct <= 0) continue;
              // Get this player's rake contribution from rake_records
              const { data: rakeContrib } = await supabaseAdmin
                .from('rake_records')
                .select('player_contributions')
                .eq('club_id', club.id)
                .gte('created_at', openPeriod.start_at)
                .lte('created_at', now.toISOString());

              let playerRakeContributed = 0;
              for (const record of (rakeContrib || [])) {
                const contributions = record.player_contributions || {};
                playerRakeContributed += parseFloat(contributions[player.user_id] || 0);
              }

              if (playerRakeContributed <= 0) continue;

              const rakebackAmount = Math.round(
                playerRakeContributed * playerRakebackPct * 100
              ) / 100;

              if (rakebackAmount <= 0) continue;

              // Insert pending distribution (executed by 4:10 AM cron)
              await supabaseAdmin.from('rakeback_distributions').insert({
                club_id: club.id,
                period_id: openPeriod.id,
                agent_id: agent.id,
                agent_user_id: agent.user_id,
                player_user_id: player.user_id,
                player_rake_contributed: playerRakeContributed,
                rakeback_percentage: playerRakebackPct,
                rakeback_amount: rakebackAmount,
                status: 'pending',
              });

              // ─── INVOICE 4: Agent → Player (rakeback) ───
              await supabaseAdmin.from('settlement_invoices').insert({
                club_id: club.id,
                period_id: openPeriod.id,
                invoice_type: 'agent_to_player',
                from_entity_type: 'agent',
                from_entity_id: agent.user_id,
                to_entity_type: 'player',
                to_entity_id: player.user_id,
                gross_amount: playerRakeContributed,
                net_amount: rakebackAmount,
                deductions: 0,
                breakdown: {
                  player_rake_contributed: playerRakeContributed,
                  rakeback_pct: playerRakebackPct,
                  rakeback_amount: rakebackAmount,
                  agent_name: agent.user_id,
                },
                status: 'generated', // Will update to 'paid' at 4:10 AM
              });
              results.invoices_generated++;
            }
          }
        }

        // Insert commission records (backward compatibility)
        if (commissionRecords.length > 0) {
          await supabaseAdmin.from('commission_records').insert(commissionRecords);
          await supabaseAdmin.from('commission_history').insert(commissionHistory);
        }

        // Close the period
        await supabaseAdmin
          .from('settlement_periods')
          .update({
            status: 'closed',
            settled_at: now.toISOString(),
            settled_by: SYSTEM_USER_ID,
          })
          .eq('id', openPeriod.id);

        // Update period lock reference
        await supabaseAdmin
          .from('settlement_locks')
          .update({ settlement_period_id: openPeriod.id })
          .eq('club_id', club.id)
          .eq('is_active', true);

        results.periods_closed++;

        // ─── SEND SETTLEMENT MESSAGES ───
        await sendSettlementMessages(club, openPeriod, agents, totalRake, unionHoldAmount, totalCommissions);
        results.messages_sent++;

        // ─── OPEN NEW PERIOD ───
        const { data: lastPeriod } = await supabaseAdmin
          .from('settlement_periods')
          .select('period_number')
          .eq('club_id', club.id)
          .order('period_number', { ascending: false })
          .limit(1);

        const nextPeriodNum = (lastPeriod?.[0]?.period_number || 0) + 1;
        const nextEndAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

        await supabaseAdmin.from('settlement_periods').insert({
          club_id: club.id,
          union_id: club.union_id,
          period_number: nextPeriodNum,
          year: now.getFullYear(),
          start_at: now.toISOString(),
          end_at: nextEndAt.toISOString(),
          status: 'open',
          total_rake_collected: 0,
          total_hands_dealt: 0,
          total_player_winnings: 0,
          total_player_losses: 0,
        });

        // Reset all agents' weekly_rake_generated
        for (const agent of (agents || [])) {
          await supabaseAdmin
            .from('agents')
            .update({ weekly_rake_generated: 0 })
            .eq('id', agent.id);
        }

        results.periods_opened++;
        results.clubs_processed++;

      } catch (clubErr) {
        results.errors.push({
          club: club.name,
          club_id: club.id,
          phase: 'settlement',
          error: clubErr.message,
        });
      }
    }

    results.phase = 'complete';
    results.duration_ms = Date.now() - startTime;

    return res.status(200).json({
      success: true,
      message: `Auto-settlement complete. ${results.clubs_processed} clubs processed, ${results.invoices_generated} invoices generated.`,
      results,
    });

  } catch (err) {
    console.error('[auto-settlement] Fatal error:', err);
    results.phase = 'failed';
    results.fatal_error = err.message;
    results.duration_ms = Date.now() - startTime;

    // Emergency unlock all clubs on fatal error
    try {
      await supabaseAdmin
        .from('settlement_locks')
        .update({ is_active: false, unlocked_at: new Date().toISOString() })
        .eq('is_active', true);

      await supabaseAdmin
        .from('clubs')
        .update({ settlement_locked: false, settlement_locked_until: null })
        .eq('settlement_locked', true);
    } catch (unlockErr) {
      results.errors.push({ phase: 'emergency_unlock', error: unlockErr.message });
    }

    return res.status(500).json({ error: 'Auto-settlement failed', results });
  }
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Send settlement notification messages
// Uses club_announcements + chip_transactions notes for visibility
// ═══════════════════════════════════════════════════════════════
async function sendSettlementMessages(club, period, agents, totalRake, unionHold, totalCommissions) {
  const periodNum = period.period_number;
  const clubRetained = totalRake - unionHold - totalCommissions;

  // 1. Club-wide announcement
  await supabaseAdmin.from('club_announcements').insert({
    club_id: club.id,
    title: `📊 Weekly Settlement Complete — Period #${periodNum}`,
    content: [
      `Settlement Period #${periodNum} has been automatically processed.`,
      ``,
      `💰 Total Rake Collected: ${totalRake.toLocaleString()} chips`,
      unionHold > 0 ? `🏢 Union Hold: ${unionHold.toLocaleString()} chips` : null,
      `👥 Agent Commissions: ${totalCommissions.toLocaleString()} chips (${(agents || []).filter(a => (a.weekly_rake_generated || 0) > 0).length} agents)`,
      `🏠 Club Retained: ${clubRetained.toLocaleString()} chips`,
      ``,
      `A new settlement period has been opened automatically.`,
      `Rakeback distributions to players will complete by 4:10 AM CST.`,
    ].filter(Boolean).join('\n'),
    author_id: club.owner_id,
    pinned: false,
  }).catch(e => console.error('[settlement-msg] Announcement error:', e.message));

  // 2. Individual agent notifications via notifications table
  for (const agent of (agents || [])) {
    const grossRake = agent.weekly_rake_generated || 0;
    if (grossRake <= 0) continue;

    const commission = Math.round(grossRake * agent.commission_rate * 100) / 100;

    await supabaseAdmin.from('notifications').insert({
      user_id: agent.user_id,
      type: 'settlement',
      title: `💰 Commission Received — Period #${periodNum}`,
      message: `You earned ${commission.toLocaleString()} chips commission (${(agent.commission_rate * 100).toFixed(1)}% of ${grossRake.toLocaleString()} rake generated). Chips have been added to your balance.`,
      metadata: {
        club_id: club.id,
        period_id: period.id,
        period_number: periodNum,
        commission: commission,
        gross_rake: grossRake,
      },
      read: false,
    }).catch(e => console.error(`[settlement-msg] Agent ${agent.user_id} notification error:`, e.message));
  }

  // 3. Notify club owner
  await supabaseAdmin.from('notifications').insert({
    user_id: club.owner_id,
    type: 'settlement',
    title: `📊 Settlement Complete — ${club.name} Period #${periodNum}`,
    message: `Period #${periodNum} auto-settled. Rake: ${totalRake.toLocaleString()}, Commissions: ${totalCommissions.toLocaleString()}, Club retained: ${clubRetained.toLocaleString()} chips.`,
    metadata: {
      club_id: club.id,
      period_id: period.id,
      total_rake: totalRake,
      union_hold: unionHold,
      total_commissions: totalCommissions,
      club_retained: clubRetained,
    },
    read: false,
  }).catch(e => console.error('[settlement-msg] Owner notification error:', e.message));
}
