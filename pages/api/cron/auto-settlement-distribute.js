/**
 * POST /api/cron/auto-settlement-distribute
 * 
 * AGENT → PLAYER RAKEBACK DISTRIBUTION + UNFREEZE
 * Runs every Monday at 10:10 UTC (4:10 AM CST)
 * 
 * FLOW:
 * 1. Process all pending rakeback_distributions
 *    - Deduct from agent's chip balance
 *    - Credit to player's chip balance
 *    - Record chip transactions
 *    - Generate agent→player invoices
 *    - Notify players via messaging
 * 2. UNFREEZE all clubs — remove settlement locks
 * 3. Send "all clear" announcement
 * 
 * Vercel cron config:
 * { "path": "/api/cron/auto-settlement-distribute", "schedule": "10 10 * * 1" }
 * (10:10 UTC Monday = 4:10 AM CST Monday)
 */
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import { reportApiError } from '../../../src/lib/sentryWrap';

// getSupabaseAdmin imported from ../../../lib/supabaseAdmin

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Auth
    const cronSecret = req.headers['authorization']?.replace('Bearer ', '');

    if (cronSecret !== process.env.CRON_SECRET || !process.env.CRON_SECRET) {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (token) {
        const { data: { user } } = await getSupabaseAdmin().auth.getUser(token);
        if (!user) return res.status(401).json({ error: 'Unauthorized' });
        // BUG #123 FIX: Require platform admin or club owner
        const { data: adminCheck } = await getSupabaseAdmin()
          .from('profiles').select('role').eq('id', user.id).maybeSingle();
        const isAdmin = adminCheck?.role === 'admin' || adminCheck?.role === 'superadmin' || adminCheck?.role === 'god';
        if (!isAdmin) {
          const { data: ownedClubs } = await getSupabaseAdmin()
            .from('clubs').select('id').eq('owner_id', user.id).limit(1);
          if (!ownedClubs || ownedClubs.length === 0) {
            return res.status(403).json({ error: 'Only admins or club owners can manually trigger' });
          }
        }
      } else {
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    const startTime = Date.now();
    const results = {
      phase: 'started',
      distributions_processed: 0,
      distributions_failed: 0,
      total_rakeback_distributed: 0,
      players_paid: 0,
      clubs_unfrozen: 0,
      messages_sent: 0,
      errors: [],
    };

    try {
      // ═══════════════════════════════════════════════════════════════
      // PHASE 1: PROCESS ALL PENDING RAKEBACK DISTRIBUTIONS
      // Agent accounts → Player accounts
      // ═══════════════════════════════════════════════════════════════
      results.phase = 'distributing';

      const { data: pendingDistributions } = await getSupabaseAdmin()
        .from('rakeback_distributions')
        .select('*')
        .eq('status', 'pending')
        .order('club_id', { ascending: true })
            .limit(100);

      if (!pendingDistributions?.length) {
        results.phase = 'no_distributions';
      } else {
        // Group by club for batch processing
        const byClub = {};
        for (const dist of pendingDistributions) {
          if (!byClub[dist.club_id]) byClub[dist.club_id] = [];
          byClub[dist.club_id].push(dist);
        }

        for (const [clubId, distributions] of Object.entries(byClub)) {
          // Group by agent within club
          const byAgent = {};
          for (const dist of distributions) {
            if (!byAgent[dist.agent_user_id]) byAgent[dist.agent_user_id] = [];
            byAgent[dist.agent_user_id].push(dist);
          }

          for (const [agentUserId, agentDists] of Object.entries(byAgent)) {
            try {
              // Get agent's current chip balance
              const { data: agentMember } = await getSupabaseAdmin()
                .from('club_members')
                .select('chip_balance')
                .eq('club_id', clubId)
                .eq('user_id', agentUserId)
                .maybeSingle();

              if (!agentMember) {
                for (const dist of agentDists) {
                  await markDistributionFailed(dist.id, 'Agent not found in club');
                  results.distributions_failed++;
                }
                continue;
              }

              // Process each player distribution
              // IMPORTANT: Debit agent BEFORE crediting player to prevent
              // creating chips from thin air if the cron crashes mid-way.
              let agentTotalDeducted = 0;
              let playersDistributed = 0;

              for (const dist of agentDists) {
                if (dist.rakeback_amount <= 0) {
                  await markDistributionFailed(dist.id, 'Zero or negative amount after adjustment');
                  results.distributions_failed++;
                  continue;
                }

                try {
                  // Verify player still exists in club
                  const { data: playerMember } = await getSupabaseAdmin()
                    .from('club_members')
                    .select('chip_balance, nickname')
                    .eq('club_id', clubId)
                    .eq('user_id', dist.player_user_id)
                    .maybeSingle();

                  if (!playerMember) {
                    await markDistributionFailed(dist.id, 'Player not found in club');
                    results.distributions_failed++;
                    continue;
                  }

                  // STEP 1: Debit agent FIRST (safe — if this fails, no chips move)
                  const { error: debitErr } = await getSupabaseAdmin().rpc('fn_debit_chips', {
                    p_club_id: clubId,
                    p_user_id: agentUserId,
                    p_amount: dist.rakeback_amount,
                  });

                  if (debitErr) {
                    await markDistributionFailed(dist.id, 'Agent debit failed: ' + debitErr.message);
                    results.distributions_failed++;
                    continue;
                  }

                  // STEP 2: Credit player (agent already debited — safe)
                  const { error: creditErr } = await getSupabaseAdmin().rpc('fn_credit_chips', {
                    p_club_id: clubId,
                    p_user_id: dist.player_user_id,
                    p_amount: dist.rakeback_amount,
                  });

                  if (creditErr) {
                    // ROLLBACK: re-credit agent since player didn't receive chips
                    try {
                      await getSupabaseAdmin().rpc('fn_credit_chips', {
                        p_club_id: clubId,
                        p_user_id: agentUserId,
                        p_amount: dist.rakeback_amount,
                      });
                    } catch (rbErr) {
                      console.error('[rakeback] Rollback failed:', rbErr.message);
                    }
                    await markDistributionFailed(dist.id, 'Player credit failed: ' + creditErr.message);
                    results.distributions_failed++;
                    continue;
                  }

                  // Record chip transaction
                  const { data: txn } = await getSupabaseAdmin()
                    .from('chip_transactions')
                    .insert({
                      club_id: clubId,
                      from_user_id: agentUserId,
                      to_user_id: dist.player_user_id,
                      amount: dist.rakeback_amount,
                      transaction_type: 'rakeback',
                      notes: `Auto-rakeback: ${dist.rakeback_amount.toLocaleString()} chips (${(dist.rakeback_percentage * 100).toFixed(1)}% of ${dist.player_rake_contributed.toLocaleString()} rake contributed)`,
                      metadata: {
                        period_id: dist.period_id,
                        distribution_id: dist.id,
                        settlement_type: 'auto_rakeback',
                      },
                    })
                    .select('id')
                    .maybeSingle();

                  // Mark distribution as transferred
                  await getSupabaseAdmin()
                    .from('rakeback_distributions')
                    .update({
                      status: 'transferred',
                      transferred_at: new Date().toISOString(),
                      chip_transfer_id: txn?.id || null,
                    })
                    .eq('id', dist.id);

                  // Update the agent→player invoice
                  await getSupabaseAdmin()
                    .from('settlement_invoices')
                    .update({
                      chips_transferred: true,
                      transferred_at: new Date().toISOString(),
                      chip_transfer_id: txn?.id || null,
                      status: 'paid',
                    })
                    .eq('club_id', clubId)
                    .eq('period_id', dist.period_id)
                    .eq('invoice_type', 'agent_to_player')
                    .eq('to_entity_id', dist.player_user_id);

                  // Notify player (best-effort)
                  try {
                    await getSupabaseAdmin().from('notifications').insert({
                      user_id: dist.player_user_id,
                      type: 'rakeback',
                      title: '💰 Rakeback Received!',
                      message: `You received ${dist.rakeback_amount.toLocaleString()} chips rakeback (${(dist.rakeback_percentage * 100).toFixed(1)}% of your ${dist.player_rake_contributed.toLocaleString()} rake). Chips added to your balance!`,
                      data: {
                        club_id: clubId,
                        period_id: dist.period_id,
                        rakeback_amount: dist.rakeback_amount,
                        agent_user_id: agentUserId,
                      },
                      read: false,
                    });
                  } catch (notifyErr) {
                    console.error('[rakeback-notify] Error:', notifyErr.message);
                  }

                  agentTotalDeducted += dist.rakeback_amount;
                  playersDistributed++;
                  results.distributions_processed++;
                  results.total_rakeback_distributed += dist.rakeback_amount;
                  results.players_paid++;

                } catch (playerErr) {
                  await markDistributionFailed(dist.id, playerErr.message);
                  results.distributions_failed++;
                  results.errors.push({
                    phase: 'player_distribution',
                    player: dist.player_user_id,
                    error: playerErr.message,
                  });
                }
              }

              // Notify agent (best-effort)
              try {
                await getSupabaseAdmin().from('notifications').insert({
                  user_id: agentUserId,
                  type: 'rakeback_sent',
                  title: '📤 Rakeback Distributed to Players',
                  message: `Auto-rakeback complete: ${agentTotalDeducted.toLocaleString()} chips distributed to ${playersDistributed} player${playersDistributed !== 1 ? 's' : ''}.`,
                  data: {
                    club_id: clubId,
                    total_distributed: agentTotalDeducted,
                    player_count: playersDistributed,
                  },
                  read: false,
                });
                results.messages_sent++;
              } catch (notifyErr) {
                console.error('[rakeback-agent-notify] Error:', notifyErr.message);
              }

            } catch (agentErr) {
              results.errors.push({
                phase: 'agent_distribution',
                agent: agentUserId,
                club_id: clubId,
                error: agentErr.message,
              });
            }
          }
        }
      }

      // ═══════════════════════════════════════════════════════════════
      // PHASE 2: UNFREEZE ALL CLUBS
      // Remove settlement locks, restore operations
      // ═══════════════════════════════════════════════════════════════
      results.phase = 'unfreezing';

      // Deactivate all settlement locks
      const { data: activeLocks } = await getSupabaseAdmin()
        .from('settlement_locks')
        .select('id, club_id')
        .eq('is_active', true)
            .limit(100);

      for (const lock of (activeLocks || [])) {
        await getSupabaseAdmin()
          .from('settlement_locks')
          .update({ is_active: false, unlocked_at: new Date().toISOString() })
          .eq('id', lock.id);

        await getSupabaseAdmin()
          .from('clubs')
          .update({ settlement_locked: false, settlement_locked_until: null })
          .eq('id', lock.club_id);

        results.clubs_unfrozen++;
      }

      // Post "all clear" announcements
      const { data: lockedClubs } = await getSupabaseAdmin()
        .from('clubs')
        .select('id, name, owner_id')
        .eq('auto_settlement_enabled', true);

      for (const club of (lockedClubs || [])) {
        try {
          await getSupabaseAdmin().from('club_announcements').insert({
            club_id: club.id,
            title: '✅ Settlement Complete — Operations Resumed',
            content: [
              'Weekly settlement is complete. All operations have been restored.',
              '',
              results.distributions_processed > 0
                ? `💰 ${results.total_rakeback_distributed.toLocaleString()} chips in rakeback distributed to ${results.players_paid} players.`
                : 'No rakeback distributions this period.',
              '',
              'Send, receive, buy-in, and cashout operations are now fully available.',
            ].join('\n'),
            author_id: club.owner_id,
            pinned: false,
          });
        } catch (unfreezeErr) {
          console.error('[unfreeze-msg] Error:', unfreezeErr.message);
        }
      }

      results.phase = 'complete';
      results.duration_ms = Date.now() - startTime;

      return res.status(200).json({
        success: true,
        message: `Distribution complete. ${results.distributions_processed} rakeback distributions, ${results.clubs_unfrozen} clubs unfrozen.`,
        results,
      });

    } catch (err) {
      console.error('[auto-settlement-distribute] Fatal error:', err);

      // Emergency unfreeze on failure
      try {
        await getSupabaseAdmin()
          .from('settlement_locks')
          .update({ is_active: false, unlocked_at: new Date().toISOString() })
          .eq('is_active', true);

        await getSupabaseAdmin()
          .from('clubs')
          .update({ settlement_locked: false, settlement_locked_until: null })
          .eq('settlement_locked', true);
      } catch (unlockErr) {
        results.errors.push({ phase: 'emergency_unlock', error: unlockErr.message });
      }

      results.phase = 'failed';
      results.fatal_error = err?.message || String(err);
      results.duration_ms = Date.now() - startTime;
      return res.status(500).json({ error: 'Distribution failed', results });
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) {}
    console.error('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Mark a distribution as failed
// ═══════════════════════════════════════════════════════════════
async function markDistributionFailed(distId, errorMessage) {
  await getSupabaseAdmin()
    .from('rakeback_distributions')
    .update({ status: 'failed', error_message: errorMessage })
    .eq('id', distId);
}
