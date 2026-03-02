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
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth
  const cronSecret = req.headers['authorization']?.replace('Bearer ', '');

  if (cronSecret !== process.env.CRON_SECRET || !process.env.CRON_SECRET) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      const { data: { user } } = await supabaseAdmin.auth.getUser(token);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });
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

    const { data: pendingDistributions } = await supabaseAdmin
      .from('rakeback_distributions')
      .select('*')
      .eq('status', 'pending')
      .order('club_id', { ascending: true });

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
            const { data: agentMember } = await supabaseAdmin
              .from('club_members')
              .select('chip_balance')
              .eq('club_id', parseInt(clubId))
              .eq('user_id', agentUserId)
              .single();

            if (!agentMember) {
              for (const dist of agentDists) {
                await markDistributionFailed(dist.id, 'Agent not found in club');
                results.distributions_failed++;
              }
              continue;
            }

            // Calculate total rakeback this agent needs to distribute
            const totalRakebackForAgent = agentDists.reduce((sum, d) => sum + d.rakeback_amount, 0);

            // Check if agent has enough chips
            if ((agentMember.chip_balance || 0) < totalRakebackForAgent) {
              // Distribute what we can, proportionally
              const availableBalance = agentMember.chip_balance || 0;
              const ratio = availableBalance > 0 ? availableBalance / totalRakebackForAgent : 0;

              for (const dist of agentDists) {
                if (ratio <= 0) {
                  await markDistributionFailed(dist.id, 'Insufficient agent balance');
                  results.distributions_failed++;
                  continue;
                }
                // Adjust amount proportionally
                dist.rakeback_amount = Math.floor(dist.rakeback_amount * ratio * 100) / 100;
              }
            }

            // Process each player distribution
            let agentTotalDeducted = 0;

            for (const dist of agentDists) {
              if (dist.rakeback_amount <= 0) {
                await markDistributionFailed(dist.id, 'Zero or negative amount after adjustment');
                results.distributions_failed++;
                continue;
              }

              try {
                // Get player's current balance
                const { data: playerMember } = await supabaseAdmin
                  .from('club_members')
                  .select('chip_balance, nickname')
                  .eq('club_id', parseInt(clubId))
                  .eq('user_id', dist.player_user_id)
                  .single();

                if (!playerMember) {
                  await markDistributionFailed(dist.id, 'Player not found in club');
                  results.distributions_failed++;
                  continue;
                }

                // Credit player atomically
                const { error: creditErr } = await supabaseAdmin.rpc('fn_credit_chips', {
                  p_club_id: clubId,
                  p_user_id: dist.player_user_id,
                  p_amount: dist.rakeback_amount,
                });

                if (creditErr) {
                  await markDistributionFailed(dist.id, 'Credit failed: ' + creditErr.message);
                  results.distributions_failed++;
                  continue;
                }

                // Record chip transaction
                const { data: txn } = await supabaseAdmin
                  .from('chip_transactions')
                  .insert({
                    club_id: parseInt(clubId),
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
                  .single();

                // Mark distribution as transferred
                await supabaseAdmin
                  .from('rakeback_distributions')
                  .update({
                    status: 'transferred',
                    transferred_at: new Date().toISOString(),
                    chip_transfer_id: txn?.id || null,
                  })
                  .eq('id', dist.id);

                // Update the agent→player invoice
                await supabaseAdmin
                  .from('settlement_invoices')
                  .update({
                    chips_transferred: true,
                    transferred_at: new Date().toISOString(),
                    chip_transfer_id: txn?.id || null,
                    status: 'paid',
                  })
                  .eq('invoice_id', dist.invoice_id);

                // Notify player
                await supabaseAdmin.from('notifications').insert({
                  user_id: dist.player_user_id,
                  type: 'rakeback',
                  title: '💰 Rakeback Received!',
                  message: `You received ${dist.rakeback_amount.toLocaleString()} chips rakeback (${(dist.rakeback_percentage * 100).toFixed(1)}% of your ${dist.player_rake_contributed.toLocaleString()} rake). Chips added to your balance!`,
                  metadata: {
                    club_id: parseInt(clubId),
                    period_id: dist.period_id,
                    rakeback_amount: dist.rakeback_amount,
                    agent_user_id: agentUserId,
                  },
                  read: false,
                }).catch(e => console.error('[rakeback-notify] Error:', e.message));

                agentTotalDeducted += dist.rakeback_amount;
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

            // Deduct total from agent's balance
            if (agentTotalDeducted > 0) {
              await supabaseAdmin
                .from('club_members')
                .update({
                  chip_balance: Math.max(0, (agentMember.chip_balance || 0) - agentTotalDeducted),
                })
                .eq('club_id', parseInt(clubId))
                .eq('user_id', agentUserId);

              // Notify agent of distributions
              const playerCount = agentDists.filter(d => d.rakeback_amount > 0).length;
              await supabaseAdmin.from('notifications').insert({
                user_id: agentUserId,
                type: 'rakeback_sent',
                title: '📤 Rakeback Distributed to Players',
                message: `Auto-rakeback complete: ${agentTotalDeducted.toLocaleString()} chips distributed to ${playerCount} player${playerCount !== 1 ? 's' : ''}.`,
                metadata: {
                  club_id: parseInt(clubId),
                  total_distributed: agentTotalDeducted,
                  player_count: playerCount,
                },
                read: false,
              }).catch(e => console.error('[rakeback-agent-notify] Error:', e.message));

              results.messages_sent++;
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
    const { data: activeLocks } = await supabaseAdmin
      .from('settlement_locks')
      .select('id, club_id')
      .eq('is_active', true);

    for (const lock of (activeLocks || [])) {
      await supabaseAdmin
        .from('settlement_locks')
        .update({ is_active: false, unlocked_at: new Date().toISOString() })
        .eq('id', lock.id);

      await supabaseAdmin
        .from('clubs')
        .update({ settlement_locked: false, settlement_locked_until: null })
        .eq('id', lock.club_id);

      results.clubs_unfrozen++;
    }

    // Post "all clear" announcements
    const { data: lockedClubs } = await supabaseAdmin
      .from('clubs')
      .select('id, name, owner_id')
      .eq('auto_settlement_enabled', true);

    for (const club of (lockedClubs || [])) {
      await supabaseAdmin.from('club_announcements').insert({
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
        is_pinned: false,
      }).catch(e => console.error('[unfreeze-msg] Error:', e.message));
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

    results.phase = 'failed';
    results.duration_ms = Date.now() - startTime;
    return res.status(500).json({ error: 'Distribution failed', results });
  }
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Mark a distribution as failed
// ═══════════════════════════════════════════════════════════════
async function markDistributionFailed(distId, errorMessage) {
  await supabaseAdmin
    .from('rakeback_distributions')
    .update({ status: 'failed', error_message: errorMessage })
    .eq('id', distId);
}
