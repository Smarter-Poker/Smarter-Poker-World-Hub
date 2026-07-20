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
const { checkIdempotency } = require('../../../src/lib/club-arena/idempotency');
export default async function handler(req, res) {
  // Idempotency guard — prevents duplicate mutations from laggy mobile networks
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    if (checkIdempotency(req, res)) return;
  }

  try {
      // Rate limit
      if (!applyRateLimit(req, res, 'club-arena/tournament-cron')) return;
      // Only allow GET (cron) or POST with secret
      const cronSecret = process.env.CRON_SECRET;
      const authHeader = req.headers.authorization;
      // FIX-B4 2026-07-19: fail CLOSED. The old guard (`if (cronSecret && ...)`)
      // let every request through when CRON_SECRET was unset — an open door to a
      // job that cancels tournaments and refunds chips. Require the secret.
      if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
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
              console.warn('[TournCron] Execution aborted: Process currently locked by another instance.');
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
                      const { error: err_club_tournaments_wbqel } = await getSupabase()
                        .from('club_tournaments')
                        .update({ status: 'registering' })
                          .eq('id', tourn.id);
                      if (err_club_tournaments_wbqel) console.warn('[Supabase] Silent mutation failed in club_tournaments:', err_club_tournaments_wbqel.message);
                      console.warn(`[TournCron] Opened registration for ${tourn.name} (${tourn.id})`);
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

                              const { error: err_club_tournaments_oep9z } = await getSupabase()

                                .from('club_tournaments')

                                .update({ status: 'running', started_at: now.toISOString() })
                                  .eq('id', tourn.id);

                              if (err_club_tournaments_oep9z) console.warn('[Supabase] Silent mutation failed in club_tournaments:', err_club_tournaments_oep9z.message);

                              console.warn(`[TournCron] Auto-started ${tourn.name} (${tourn.id}) with ${regs?.length || 0} players`);
                              results.autoStarted++;
                          } else {
                              console.warn(`[TournCron] Engine create failed for ${tourn.id}:`, createResult.error);
                              results.errors.push({ id: tourn.id, error: createResult.error });
                          }
                      } else {
                          // ═══════════════════════════════════════════════════════
                          // AUTO-CANCEL [Improvement #8 Extension]
                          // ═══════════════════════════════════════════════════════
                          console.warn(`[TournCron] Cancelling ${tourn.name} (${tourn.id}) - Not enough players (${tourn.registered_count}/${minPlayers})`);

                          const { data: regsToRefund } = await getSupabase()
                              .from('tournament_registrations')
                              .select('id, user_id, buy_in_amount, buy_in_fee')
                              .eq('tournament_id', tourn.id)
                              .eq('status', 'registered');

                          for (const reg of (regsToRefund || [])) {
                              try {
                                  // Refund chips. CRITICAL: capture the error
                                  // — if the unlock fails, do NOT mark the row
                                  // as 'refunded' below. The previous code
                                  // marked it refunded regardless, so any
                                  // unlock failure permanently lost the
                                  // player's buy-in with no record.
                                  // FIX-B5: refund the FULL charge (buy-in + fee) —
                                  // a cancelled tournament earned no rake.
                                  const unlockErr = (await getSupabase().rpc('unlock_chips_from_table', {
                                      p_user_id: reg.user_id,
                                      p_club_id: tourn.club_id,
                                      p_table_id: tourn.id,
                                      p_amount: Number(reg.buy_in_amount || 0) + Number(reg.buy_in_fee || 0),
                                  })).error;
                                  if (unlockErr) {
                                      console.warn('[TournCron] unlock failed for', reg.user_id, 'in tournament', tourn.id, '(skipping mark-refunded so a future cron run retries):', unlockErr?.message || unlockErr);
                                      continue; // Try next registration; this one stays 'registered' for retry.
                                  }

                                  // Mark refunded only after a successful unlock.
                                  const { error: markErr } = await getSupabase()
                                      .from('tournament_registrations')
                                      .update({ status: 'refunded' })
                                      .eq('id', reg.id);
                                  if (markErr) {
                                      console.warn('[TournCron] mark-refunded failed (refund already issued, will idempotently re-attempt next run if registered): ', markErr?.message || markErr);
                                  }

                                  // Notify player
                                  await notifyUser(getSupabase(), {
                                      userId: reg.user_id,
                                      type: 'tournament_cancelled',
                                      title: `❌ Cancelled: ${tourn.name}`,
                                      message: `${tourn.name} was cancelled (not enough players). Chips refunded.`,
                                      data: { tournamentId: tourn.id, clubId: tourn.club_id },
                                  }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));

                              } catch (refErr) {
                                  console.warn(`[TournCron] Refund FAILED for user ${reg.user_id}:`, refErr.message);
                              }
                          }

                          // Mark tournament as cancelled
                          const { error: err_club_tournaments_4f2ts } = await getSupabase()
                            .from('club_tournaments')
                            .update({ status: 'cancelled' })
                              .eq('id', tourn.id);
                          if (err_club_tournaments_4f2ts) console.warn('[Supabase] Silent mutation failed in club_tournaments:', err_club_tournaments_4f2ts.message);
                      }
                  }
              } catch (err) {
                  console.warn(`[TournCron] Error processing ${tourn.id}:`, err.message);
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
                      await notifyUser(getSupabase(), {
                          userId: reg.user_id,
                          type: 'tournament_reminder',
                          title: `⏰ ${tourn.name} starts in 15 minutes!`,
                          message: `Get ready! ${tourn.name} begins shortly.`,
                          data: { tournamentId: tourn.id, clubId: tourn.club_id },
                          pushUrl: `/hub/club-arena/tournaments?club=${tourn.club_id}`,
                      }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
                      results.reminders++;
                  }

                  // Mark reminder as sent (deduplication)
                  const { error: err_club_tournaments_kx68k } = await getSupabase()
                    .from('club_tournaments')
                    .update({ reminder_sent: true })
                      .eq('id', tourn.id);
                  if (err_club_tournaments_kx68k) console.warn('[Supabase] Silent mutation failed in club_tournaments:', err_club_tournaments_kx68k.message);

                  console.warn(`[TournCron] Sent ${regs?.length || 0} reminders for ${tourn.name}`);
              } catch (err) {
                  console.warn(`[TournCron] Reminder error for ${tourn.id}:`, err.message);
                  results.errors.push({ id: tourn.id, error: err.message });
              }
          }

          return res.json({ success: true, ...results });
      } catch (err) {
          console.warn('[TournCron] Fatal:', err.message);
          return res.status(500).json({ success: false, error: 'Tournament cron failed' });
      } finally {
          // ═══════════════════════════════════════════════════════
          // RELEASE CONCURRENCY LOCK
          // ═══════════════════════════════════════════════════════
          await getSupabase().rpc('fn_release_cron_lock', {
              p_lock_name: 'tournament_cron_execution_lock'
          }).catch(err => console.warn('[TournCron] Failed to release lock:', err.message));
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
