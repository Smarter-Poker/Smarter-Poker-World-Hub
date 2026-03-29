/**
 * Cron: /api/cron/venue-game-alerts
 * Runs every 15 minutes. Checks venue_live_tables against
 * venue_game_alerts subscriptions and sends push notifications
 * when a matching game is found running.
 * 
 * Cooldown: 4 hours between repeat alerts for the same match.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    _supabase = createClient(url, key);
  }
  return _supabase;
}

const COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    if (process.env.NODE_ENV === 'production' && process.env.CRON_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const supabase = getSupabase();
  const now = Date.now();
  const results = { checked_at: new Date().toISOString(), matches: [], notifications_sent: 0 };

  try {
    // 1. Get all active alerts
    const { data: alerts, error: alertErr } = await supabase
      .from('venue_game_alerts')
      .select('*')
      .eq('active', true);

    if (alertErr) throw alertErr;
    if (!alerts || alerts.length === 0) {
      return res.status(200).json({ ...results, message: 'No active alerts' });
    }

    // 2. Get current live tables
    const { data: liveTables, error: liveErr } = await supabase
      .from('venue_live_tables')
      .select('venue_name, game, tables_running, source')
      .limit(5000);

    if (liveErr) throw liveErr;

    // 3. Check each alert against live tables
    for (const alert of alerts) {
      const matchingTables = (liveTables || []).filter(t => {
        const venueMatch = t.venue_name?.toLowerCase().includes(alert.venue_name?.toLowerCase());
        const gameMatch = t.game?.toLowerCase().includes(alert.game_type?.toLowerCase());
        return venueMatch && gameMatch;
      });

      if (matchingTables.length > 0) {
        // Check cooldown
        const lastTriggered = alert.last_triggered ? new Date(alert.last_triggered).getTime() : 0;
        if (now - lastTriggered < COOLDOWN_MS) continue;

        const totalRunning = matchingTables.reduce((sum, t) => sum + (t.tables_running || 1), 0);
        
        results.matches.push({
          alert_id: alert.id,
          venue: alert.venue_name,
          game: alert.game_type,
          tables_running: totalRunning,
        });

        // Send push notification via OneSignal
        const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
        const apiKey = process.env.ONESIGNAL_REST_API_KEY;
        
        if (appId && apiKey) {
          try {
            await fetch('https://onesignal.com/api/v1/notifications', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${apiKey}`,
              },
              body: JSON.stringify({
                app_id: appId,
                filters: [
                  { field: 'tag', key: 'user_id', value: alert.user_id }
                ],
                headings: { en: `${alert.game_type} is Running` },
                contents: { en: `${alert.venue_name} has ${totalRunning} ${alert.game_type} table${totalRunning > 1 ? 's' : ''} running right now.` },
                priority: 10,
                url: 'https://smarter.poker/hub/poker-near-me-lobby?pod=live',
              }),
            });
            results.notifications_sent++;
          } catch (pushErr) {
            console.error('Push notification failed:', pushErr.message);
          }
        }

        // Update last_triggered timestamp
        await supabase
          .from('venue_game_alerts')
          .update({ last_triggered: new Date().toISOString() })
          .eq('id', alert.id);
      }
    }

    return res.status(200).json(results);
  } catch (err) {
    console.error('Venue game alerts cron error:', err);
    return res.status(500).json({ error: err.message });
  }
}
