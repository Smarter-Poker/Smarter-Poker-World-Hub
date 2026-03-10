// /pages/api/club-arena/tournament-cron.js
// Scheduled endpoint for tournament auto-start and push notification reminders
// Called by Vercel Cron or external scheduler every 60 seconds
import { createClient } from '../../../src/lib/supabaseServerClient';
import { notifyUser } from '../../../src/lib/club-arena/notify';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
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
        // 1. SCHEDULED AUTO-START [Improvement #8]
        // ═══════════════════════════════════════════════════════
        const { data: scheduledTournaments } = await supabase
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
                    await supabase
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
                        const { data: regs } = await supabase
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

                            await supabase
                                .from('club_tournaments')
                                .update({ status: 'running', started_at: now.toISOString() })
                                .eq('id', tourn.id);

                            console.log(`[TournCron] Auto-started ${tourn.name} (${tourn.id}) with ${regs?.length || 0} players`);
                            results.autoStarted++;
                        } else {
                            console.error(`[TournCron] Engine create failed for ${tourn.id}:`, createResult.error);
                            results.errors.push({ id: tourn.id, error: createResult.error });
                        }
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

        const { data: upcomingTournaments } = await supabase
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
                const { data: regs } = await supabase
                    .from('tournament_registrations')
                    .select('user_id')
                    .eq('tournament_id', tourn.id)
                    .eq('status', 'registered')
                    .limit(500);

                for (const reg of (regs || [])) {
                    notifyUser(supabase, {
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
                await supabase
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
        return res.status(500).json({ success: false, error: err.message });
    }
}
