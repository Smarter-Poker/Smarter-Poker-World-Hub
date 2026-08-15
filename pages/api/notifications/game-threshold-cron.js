import { createClient } from '../../../src/lib/supabaseServerClient';
import { normalizeForMatch, resolveVenueName } from '../poker/venue-dedup';
import { withSentry } from '../../../src/lib/sentry';
import { sendPushNotification } from '../../../src/lib/onesignal-server';
import { reportApiError } from '../../../src/lib/sentryWrap';

async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Vercel Cron Security Authentication
    // SECURITY: a missing CRON_SECRET is a server misconfiguration, not a grant.
    // This previously FAILED OPEN: the entire check was wrapped in
    // `if (process.env.CRON_SECRET)` with no else, so an unset CRON_SECRET
    // skipped authentication altogether and left this push-notification route
    // world-callable.
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
        console.warn('[game-threshold-cron] CRON_SECRET is not configured — rejecting request');
        return res.status(500).json({ error: 'Server misconfigured' });
    }
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${cronSecret}`) {
        return res.status(401).json({ error: 'Unauthorized' });
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
        // 2026-08-15 CHECK 13: poker_venues has no active_tables column (the
        // old select 42703'd on every run — no threshold alert ever fired).
        // Live table counts come from venue_live_tables (see live-cash-games
        // policy): non-simulated rows, latest scrape batch per venue+source,
        // Bravo real-time data preferred over PokerAtlas estimates.
        const { data: venues, error: vErr } = await supabase
            .from('poker_venues')
            .select('id, name')
            .in('id', venueIds);

        if (vErr) throw vErr;

        const { data: liveRows, error: liveErr } = await supabase
            .from('venue_live_tables')
            .select('venue_name, source, tables_running, scrape_batch_id, scrape_timestamp')
            .gte('scrape_timestamp', new Date(Date.now() - 6 * 3600 * 1000).toISOString())
            .order('scrape_timestamp', { ascending: false })
            .limit(5000);
        if (liveErr) throw liveErr;

        const venueKey = (name) => normalizeForMatch(resolveVenueName(name));
        const latestBatch = {};   // `${key}|${source}` -> newest batch id
        const bySource = {};      // key -> { bravo: n, other: n, hasBravo: bool }
        for (const row of liveRows || []) {
            const batchId = row.scrape_batch_id;
            if (typeof batchId === 'string' && batchId.startsWith('sim-')) continue; // modelled, never live
            const key = venueKey(row.venue_name);
            const src = String(row.source || '').toLowerCase();
            const bk = `${key}|${src}`;
            if (!(bk in latestBatch)) latestBatch[bk] = batchId;
            else if (latestBatch[bk] !== batchId) continue; // older batch for this source
            if (!bySource[key]) bySource[key] = { bravo: 0, other: 0, hasBravo: false };
            const n = row.tables_running ?? 0;
            if (src.includes('bravo')) { bySource[key].bravo += n; bySource[key].hasBravo = true; }
            else bySource[key].other += n;
        }
        const liveCountFor = (name) => {
            const e = bySource[venueKey(name)];
            if (!e) return 0;
            return e.hasBravo ? e.bravo : e.other;
        };

        // 3. Process thresholds and batch by venue to avoid Vercel timeouts and OneSignal rate limits
        const alertsByVenue = {};
        for (const alert of alerts) {
            const venue = venues?.find(v => v.id === alert.venue_id);
            const playerId = alert.users?.onesignal_player_id;
            
            if (!venue || !playerId) continue;

            const liveTablesCount = liveCountFor(venue.name);
            
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
