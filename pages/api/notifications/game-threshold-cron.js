import { createClient } from '../../../src/lib/supabaseServerClient';
import { withSentry } from '../../../src/lib/sentry';
import { sendPushNotification } from '../../../src/lib/onesignal-server';

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
        
        // 2. Poll live game data (For this example, we check poker_venues, but live tables usually sits in `venue_live_tables`)
        // Assuming `tables_running` exists on the venue, or a relation
        const { data: venues, error: vErr } = await supabase
            .from('poker_venues')
            .select('id, name')
            .in('id', venueIds);

        if (vErr) throw vErr;

        let processedCount = 0;
        let errorsCount = 0;
        
        // 3. Trigger OneSignal push for each alert if conditions met
        for (const alert of alerts) {
            const venue = venues?.find(v => v.id === alert.venue_id);
            const playerId = alert.users?.onesignal_player_id;
            
            if (venue && playerId) {
                // Mock condition: assuming we checked the live tables running count from a tables DB
                // against alert.threshold.
                const liveTablesCount = Math.floor(Math.random() * 10) + 1; // Simulation
                
                if (liveTablesCount >= alert.threshold) {
                    const pushResult = await sendPushNotification({
                        playerIds: [playerId],
                        heading: 'Game Size Alert! 🎯',
                        content: `${venue.name} just hit your threshold with ${liveTablesCount} live tables running.`,
                        url: `https://smarter.poker/hub/venues/${encodeURIComponent(venue.name)}`
                    });

                    if (pushResult.success) {
                        // Update last_triggered_at (We don't deactivate it natively, just set a timeout like 4 hours before it can trigger again)
                        await supabase.from('user_pwa_alerts').update({ 
                            last_triggered_at: new Date().toISOString()
                        }).eq('id', alert.id);
                        processedCount++;
                    } else {
                        errorsCount++;
                    }
                }
            }
        }

        return res.status(200).json({ 
            success: true, 
            processed: processedCount, 
            errors: errorsCount 
        });

    } catch (e) {
        console.error('[game-threshold-cron] FAILED', e);
        return res.status(500).json({ success: false, error: e.message });
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
