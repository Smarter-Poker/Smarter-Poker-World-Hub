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
        const supabase = getSupabase();

        // 1. Fetch active 'table_size' alerts
        const { data: alerts, error } = await supabase
            .from('user_pwa_alerts')
            .select(`
                id,
                user_id,
                venue_id,
                threshold,
                users:user_id ( id, onesignal_player_id )
            `)
            .eq('alert_type', 'table_size')
            .eq('is_active', true);

        if (error) throw error;
        if (!alerts || alerts.length === 0) {
            return res.status(200).json({ success: true, processed: 0, message: 'No active table_size alerts to process' });
        }

        // Gather all distinct venue IDs
        const venueIds = [...new Set(alerts.map(a => a.venue_id).filter(id => id))];
        
        // 2. Poll live game data
        // Check the active_tables metric on the venues
        const { data: venues, error: vErr } = await supabase
            .from('poker_venues')
            .select('id, name, active_tables')
            .in('id', venueIds);

        if (vErr) throw vErr;

        // 3. Process thresholds and batch by venue to avoid Vercel timeouts and OneSignal rate limits
        const alertsByVenue = {};
        for (const alert of alerts) {
            const venue = venues?.find(v => v.id === alert.venue_id);
            const playerId = alert.users?.onesignal_player_id;
            
            if (!venue || !playerId) continue;

            const liveTablesCount = venue.active_tables || 0;
            
            // Check if last trigger was within the last 4 hours (240 mins) to prevent spam
            let canTrigger = true;
            if (alert.last_triggered_at) {
                const diffMs = new Date() - new Date(alert.last_triggered_at);
                if (diffMs < 240 * 60000) canTrigger = false;
            }

            if (canTrigger && liveTablesCount >= alert.threshold) {
                if (!alertsByVenue[venue.id]) {
                    alertsByVenue[venue.id] = { venue, liveTablesCount, targets: [] };
                }
                alertsByVenue[venue.id].targets.push({ playerId, alertId: alert.id });
            }
        }

        let processedCount = 0;
        let errorsCount = 0;

        // Vercel/OneSignal Throttler Helper 
        const sleep = ms => new Promise(res => setTimeout(res, ms));

        // Use sequential execution over `Promise.allSettled` network stampeding to prevent 429 Too Many Requests
        for (const { venue, liveTablesCount, targets } of Object.values(alertsByVenue || {})) {
            const chunkSize = 2000;
            for (let i = 0; i < targets.length; i += chunkSize) {
                const chunkTargets = targets.slice(i, i + chunkSize);
                const chunkPlayerIds = chunkTargets.map(t => t.playerId);
                const chunkAlertIds = chunkTargets.map(t => t.alertId);
                
                const pushResult = await sendPushNotification({
                    playerIds: chunkPlayerIds,
                    heading: 'Game Size Alert! 🎯',
                    content: `${venue.name} just hit your threshold with ${liveTablesCount} active tables.`,
                    url: `https://smarter.poker/hub/venues/${encodeURIComponent(venue.name)}`
                });

                if (pushResult.success) {
                    const { error: err_user_pwa_alerts_dej24 } = await supabase.from('user_pwa_alerts').update({ last_triggered_at: new Date().toISOString() })
                        .in('id', chunkAlertIds);
                    if (err_user_pwa_alerts_dej24) console.warn('[Supabase] Silent mutation failed in user_pwa_alerts:', err_user_pwa_alerts_dej24.message);
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
        console.warn('[game-threshold-cron] FAILED', e);
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
