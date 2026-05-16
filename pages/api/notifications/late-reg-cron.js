import { createClient } from '../../../src/lib/supabaseServerClient';
import { withSentry } from '../../../src/lib/sentry';
import { sendPushNotification } from '../../../src/lib/onesignal-server';
import { reportApiError } from '../../../src/lib/sentryWrap';

async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Vercel Cron Security Authentication
    if (process.env.CRON_SECRET) {
        const authHeader = req.headers.authorization;
        if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
    }

    try {
        const supabase = getSupabase(); // Assumes getSupabase wrapper or createClient logic

        // 1. Fetch upcoming tournaments within the next 24-48 hours
        // Here we'll check against our mocked alert table
        const { data: alerts, error } = await supabase
            .from('user_pwa_alerts')
            .select(`
                id,
                user_id,
                tournament_id,
                users:user_id ( id, onesignal_player_id )
            `)
            .eq('alert_type', 'late_reg')
            .eq('is_active', true);

        if (error) throw error;
        if (!alerts || alerts.length === 0) {
            return res.status(200).json({ success: true, processed: 0, message: 'No active late_reg alerts to process' });
        }

        // Gather all distinct tournament IDs
        const tournamentIds = [...new Set(alerts.map(a => a.tournament_id).filter(id => id))];
        
        // 2. Fetch those tournaments to see if they are entering late registration within our threshold
        const { data: tournaments, error: tErr } = await supabase
            .from('venue_daily_tournaments')
            .select('id, tournament_name, venue_name, start_time, event_date')
            .in('id', tournamentIds);

        if (tErr) throw tErr;

        // 3. Process time windows and batch by tournament to avoid Vercel timeouts and OneSignal rate limits
        const alertsByTournament = {};
        for (const alert of alerts) {
            const tournament = tournaments?.find(t => t.id === alert.tournament_id);
            const playerId = alert.users?.onesignal_player_id;
            
            if (!tournament || !playerId) continue;

            // Treat DB local string as a pure Date. Coerce the current time to Eastern Time 
            // wall-clock string, then parse it identically so they are compared without TZ diffs.
            const tourneyDate = new Date(`${tournament.event_date}T${tournament.start_time || '00:00:00'}`);
            const nowEtStr = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hourCycle: 'h23' });
            // Format: "4/16/2026, 08:52:00" -> replace commas, format it so Date() plays nice
            const nowEt = new Date(nowEtStr); 
            
            const diffMs = tourneyDate - nowEt;
            const diffMins = Math.floor(diffMs / 60000);
            
            // Trigger if the tournament starts in exactly/under 60 minutes OR has started within the last 150 minutes
            const isLateRegWindow = diffMins > -150 && diffMins <= 60;

            if (isLateRegWindow) {
                if (!alertsByTournament[tournament.id]) {
                    alertsByTournament[tournament.id] = { tournament, targets: [] };
                }
                alertsByTournament[tournament.id].targets.push({ playerId, alertId: alert.id });
            }
        }

        let processedCount = 0;
        let errorsCount = 0;

        // Vercel/OneSignal Throttler Helper 
        const sleep = ms => new Promise(res => setTimeout(res, ms));

        // Use sequential execution over `Promise.allSettled` network stampeding to prevent 429 Too Many Requests
        for (const { tournament, targets } of Object.values(alertsByTournament || {})) {
            const chunkSize = 2000;
            for (let i = 0; i < targets.length; i += chunkSize) {
                const chunkTargets = targets.slice(i, i + chunkSize);
                const chunkPlayerIds = chunkTargets.map(t => t.playerId);
                const chunkAlertIds = chunkTargets.map(t => t.alertId);
                
                const pushResult = await sendPushNotification({
                    playerIds: chunkPlayerIds,
                    heading: 'Late Registration Alert! ⏳',
                    content: `${tournament.tournament_name} at ${tournament.venue_name} is in or approaching late registration.`,
                    url: `https://smarter.poker/hub/venues/${encodeURIComponent(tournament.venue_name)}`
                });

                if (pushResult.success) {
                    const { error: err_user_pwa_alerts_jkpw8 } = await supabase.from('user_pwa_alerts').update({ last_triggered_at: new Date().toISOString(), is_active: false })
                        .in('id', chunkAlertIds);
                    if (err_user_pwa_alerts_jkpw8) console.warn('[Supabase] Silent mutation failed in user_pwa_alerts:', err_user_pwa_alerts_jkpw8.message);
                    processedCount += chunkPlayerIds.length;
                } else {
                    errorsCount += chunkPlayerIds.length;
                }
                
                // Sleep 250ms natively between simultaneous bulk-drops to defend against API strict rate checks
                await sleep(250);
            }
        }

        return res.status(200).json({ 
            success: true, 
            processed: processedCount, 
            errors: errorsCount 
        });

    } catch (e) {
        try { reportApiError(e, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn('[late-reg-cron] FAILED', e);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        _supabase = createClient();
    }
    return _supabase;
}

export default withSentry(handler);
