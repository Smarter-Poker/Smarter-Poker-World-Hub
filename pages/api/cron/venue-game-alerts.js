/**
 * Cron: /api/cron/venue-game-alerts
 * Runs every 15 minutes. Checks venue_live_tables against
 * venue_game_alerts subscriptions and sends push notifications
 * when a matching game is found running.
 * 
 * Cooldown: 4 hours between repeat alerts for the same match.
 */
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import { reportApiError } from '../../../src/lib/sentryWrap';

const getSupabase = getSupabaseAdmin;

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
    let alerts = [];
    try {
      const { data: alertData, error: alertErr } = await supabase
        .from('venue_game_alerts')
        .select('*')
        .eq('active', true);
      if (alertErr) {
        // Table may not exist yet
        console.warn('venue_game_alerts query failed (table may not exist):', alertErr.message);
        return res.status(200).json({ ...results, message: 'Alerts table not available yet' });
      }
      alerts = alertData || [];
    } catch (_) {
      return res.status(200).json({ ...results, message: 'Alerts system not initialized' });
    }
    if (alerts.length === 0) {
      return res.status(200).json({ ...results, message: 'No active alerts' });
    }

    let liveTables = [];
    try {
      const { data: liveData, error: liveErr } = await supabase
        .from('venue_live_tables')
        .select('venue_name, game_name, tables_running, source')
        .limit(5000);
      if (liveErr) {
        console.warn('venue_live_tables query failed:', liveErr.message);
        return res.status(200).json({ ...results, message: 'Live tables data not available' });
      }
      liveTables = liveData || [];
    } catch (_) {
      return res.status(200).json({ ...results, message: 'Live tables system not initialized' });
    }

    // 3. Check each alert against live tables
    for (const alert of alerts) {
      const matchingTables = (liveTables || []).filter(t => {
        // Exact venue match (case-insensitive) to prevent cross-venue false positives
        const venueMatch = t.venue_name?.toLowerCase().trim() === alert.venue_name?.toLowerCase().trim();
        // Game type prefix match: alert for "NLH" matches "NLH 1/2", but alert for "NLH 1/2" doesn't match "NLH 2/5"
        const alertGame = alert.game_type?.toLowerCase().trim();
        const tableGame = t.game_name?.toLowerCase().trim();
        const gameMatch = tableGame?.startsWith(alertGame) || tableGame?.includes(alertGame);
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

        // Send push notification via Internal API for Preference Checks
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://smarter.poker';
        try {
          await fetch(`${baseUrl}/api/notifications/send`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
            },
            body: JSON.stringify({
              title: `${alert.game_type} is Running`,
              message: `${alert.venue_name} has ${totalRunning} ${alert.game_type} table${totalRunning > 1 ? 's' : ''} running right now.`,
              url: `${baseUrl}/hub/poker-near-me/live-games`,
              externalUserIds: [alert.user_id],
              category: 'venue_alerts'
            })
          });
          results.notifications_sent++;
        } catch (pushErr) {
          console.error('Venue Push notification failed:', pushErr.message);
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
      try { reportApiError(err, req); } catch (_sentryErr) {}
    console.error('Venue game alerts cron error:', err);
    return res.status(500).json({ error: err.message });
  }
}
