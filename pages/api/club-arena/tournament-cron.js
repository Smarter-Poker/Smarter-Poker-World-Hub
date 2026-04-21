// /pages/api/club-arena/tournament-cron.js
// Scheduled endpoint for tournament auto-start and push notification reminders
// Called by Vercel Cron or external scheduler every 60 seconds
import { createClient } from '../../../src/lib/supabaseServerClient';
import { notifyUser } from '../../../src/lib/club-arena/notify';
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

const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');
export default async function handler(req, res) {
  try {
      // Rate limit
      if (!applyRateLimit(req, res, 'club-arena/tournament-cron')) return;
      // Only allow GET (cron) or POST with secret
      const cronSecret = process.env.CRON_SECRET;
      const authHeader = req.headers.authorization;
      if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
          return res.status(401).json({ error: 'Unauthorized' });
      }

      const now = new Date();
      const results = { autoStarted: 0, reminders: 0, errors: [] };

      try {
          // ═══════════════════════════════════════════════════════
          // 0. ACQUIRE CONCURRENCY LOCK (IMPROVEMENT #1)
          // ═══════════════════════════════════════════════════════
          const { data: lockResult, error: lockErr } = await getSupabase().rpc('fn_try_cron_lock', {
              p_lock_name: 'tournament_cron_execution_lock'
          });

          if (lockErr) throw new Error(`Lock error: ${lockErr.message}`);
          if (!lockResult) {
              console.log('[TournCron] Execution aborted: Process currently locked by another instance.');
              return res.json({ success: true, locked: true, message: 'Cron is already running' });
          }

          // ═══════════════════════════════════════════════════════
          // 1. SCHEDULED AUTO-START [Improvement #8]
          // ═══════════════════════════════════════════════════════
          const { data: scheduledTournaments } = await getSupabase()
              .from('club_tournaments')
              .select('id, name, status, club_id, type, variant, buy_in, starting_chips, scheduled_start, registered_count, max_players, settings, reminder_sent')
              .in('status', ['scheduled', 'registering'])
              .not('scheduled_start', 'is', null)
              .lte('scheduled_start', now.toISOString())
              .order('scheduled_start', { ascending: true })
              .limit(50);

          for (const tourn of (scheduledTournaments || [])) {
              try {
                  if (tourn.status === 'scheduled') {
                      // Open registration
                      await getSupabase()
                          .from('club_tournaments')
                          .update({ status: 'registering' })
                          .eq('id', tourn.id);
                      console.log(`[TournCron] Opened registration for ${tourn.name} (${tourn.id})`);
                      results.autoStarted++;
                  } else if (tourn.status === 'registering') {
                      const minPlayers = tourn.settings?.min_players || 2;
                      if (tourn.registered_count >= minPlayers) {
                          // Auto-start: init the poker engine
                          const { getController } = require('../../../src/lib/poker-engine/GameController');
                          const controller = await getController();

                          // Fetch registered players
                          const { data: regs } = await getSupabase()
                              .from('tournament_registrations')
                              .select('user_id, display_name')
                              .eq('tournament_id', tourn.id)
                              .eq('status', 'registered')
                              .limit(tourn.max_players || 100);

                          const createResult = await controller.createTournament({
                              tournamentId: tourn.id,
                              name: tourn.name,
                              clubId: tourn.club_id,
                              type: tourn.type || 'mtt',
                              variant: tourn.variant || 'nlh',
                              buyIn: tourn.buy_in || 100,
                              startingChips: tourn.starting_chips || 10000,
                              maxPlayers: tourn.max_players || 100,
                              ...(tourn.settings || {}),
                          });

                          if (createResult.success) {
                              for (const reg of (regs || [])) {
                                  await controller.registerForTournament(
                                      tourn.id, reg.user_id, reg.display_name || 'Player',
                                      { chipsAlreadyLocked: true }
                                  );
                              }
                              await controller.startTournament(tourn.id);

                              await getSupabase()
                                  .from('club_tournaments')
                                  .update({ status: 'running', started_at: now.toISOString() })
                                  .eq('id', tourn.id);

                              console.log(`[TournCron] Auto-started ${tourn.name} (${tourn.id}) with ${regs?.length || 0} players`);
                              results.autoStarted++;
                          } else {
                              console.error(`[TournCron] Engine create failed for ${tourn.id}:`, createResult.error);
                              results.errors.push({ id: tourn.id, error: createResult.error });
                          }
                      } else {
                          // ═══════════════════════════════════════════════════════
                          // AUTO-CANCEL [Improvement #8 Extension]
                          // ═══════════════════════════════════════════════════════
                          console.log(`[TournCron] Cancelling ${tourn.name} (${tourn.id}) - Not enough players (${tourn.registered_count}/${minPlayers})`);

                          const { data: regsToRefund } = await getSupabase()
                              .from('tournament_registrations')
                              .select('id, user_id, buy_in_amount')
                              .eq('tournament_id', tourn.id)
                              .eq('status', 'registered');

                          for (const reg of (regsToRefund || [])) {
                              try {
                                  // Refund chips
                                  await getSupabase().rpc('unlock_chips_from_table', {
                                      p_user_id: reg.user_id,
                                      p_club_id: tourn.club_id,
                                      p_table_id: tourn.id,
                                      p_amount: reg.buy_in_amount,
                                  });

                                  // Mark refunded
                                  await getSupabase()
                                      .from('tournament_registrations')
                                      .update({ status: 'refunded' })
                                      .eq('id', reg.id);

                                  // Notify player
                                  await notifyUser(supabase, {
                                      userId: reg.user_id,
                                      type: 'tournament_cancelled',
                                      title: `❌ Cancelled: ${tourn.name}`,
                                      message: `${tourn.name} was cancelled (not enough players). Chips refunded.`,
                                      data: { tournamentId: tourn.id, clubId: tourn.club_id },
                                  }).catch(() => { });

                              } catch (refErr) {
                                  console.error(`[TournCron] Refund FAILED for user ${reg.user_id}:`, refErr.message);
                              }
                          }

                          // Mark tournament as cancelled
                          await getSupabase()
                              .from('club_tournaments')
                              .update({ status: 'cancelled' })
                              .eq('id', tourn.id);
                      }
                  }
              } catch (err) {
                  console.error(`[TournCron] Error processing ${tourn.id}:`, err.message);
                  results.errors.push({ id: tourn.id, error: err.message });
              }
          }

          // ═══════════════════════════════════════════════════════
          // 2. PUSH NOTIFICATION REMINDERS [Improvement #5]
          // ═══════════════════════════════════════════════════════
          const reminderWindow = new Date(now.getTime() + 15 * 60 * 1000);
          const reminderStart = new Date(now.getTime() + 14 * 60 * 1000);

          const { data: upcomingTournaments } = await getSupabase()
              .from('club_tournaments')
              .select('id, name, club_id, scheduled_start, settings, reminder_sent')
              .in('status', ['scheduled', 'registering'])
              .not('scheduled_start', 'is', null)
              .gte('scheduled_start', reminderStart.toISOString())
              .lte('scheduled_start', reminderWindow.toISOString())
              .limit(20);

          for (const tourn of (upcomingTournaments || [])) {
              if (tourn.reminder_sent) continue;

              try {
                  const { data: regs } = await getSupabase()
                      .from('tournament_registrations')
                      .select('user_id')
                      .eq('tournament_id', tourn.id)
                      .eq('status', 'registered')
                      .limit(500);

                  for (const reg of (regs || [])) {
                      await notifyUser(supabase, {
                          userId: reg.user_id,
                          type: 'tournament_reminder',
                          title: `⏰ ${tourn.name} starts in 15 minutes!`,
                          message: `Get ready! ${tourn.name} begins shortly.`,
                          data: { tournamentId: tourn.id, clubId: tourn.club_id },
                          pushUrl: `/hub/club-arena/tournaments?club=${tourn.club_id}`,
                      }).catch(() => { });
                      results.reminders++;
                  }

                  // Mark reminder as sent (deduplication)
                  await getSupabase()
                      .from('club_tournaments')
                      .update({ reminder_sent: true })
                      .eq('id', tourn.id);

                  console.log(`[TournCron] Sent ${regs?.length || 0} reminders for ${tourn.name}`);
              } catch (err) {
                  console.error(`[TournCron] Reminder error for ${tourn.id}:`, err.message);
                  results.errors.push({ id: tourn.id, error: err.message });
              }
          }

          return res.json({ success: true, ...results });
      } catch (err) {
          console.error('[TournCron] Fatal:', err.message);
          return res.status(500).json({ success: false, error: 'Tournament cron failed' });
      } finally {
          // ═══════════════════════════════════════════════════════
          // RELEASE CONCURRENCY LOCK
          // ═══════════════════════════════════════════════════════
          await getSupabase().rpc('fn_release_cron_lock', {
              p_lock_name: 'tournament_cron_execution_lock'
          }).catch(err => console.error('[TournCron] Failed to release lock:', err.message));
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.error('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
