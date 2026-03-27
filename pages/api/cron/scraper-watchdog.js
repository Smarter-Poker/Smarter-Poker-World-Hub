/**
 * Cron: /api/cron/scraper-watchdog
 * Runs every 5 minutes via Vercel Cron.
 * 
 * Checks both Bravo and PokerAtlas scraper data freshness.
 * If data is stale (>30 min) or dead (>60 min), sends:
 *   1. SMS to admin via Twilio
 *   2. Push notification via OneSignal
 * 
 * Rate-limited: only sends ONE alert per scraper per hour
 * to prevent alert fatigue.
 */
import { sendSMS, isTwilioConfigured } from '../../../src/lib/commander/twilio';
import { createClient } from '../../../src/lib/supabaseServerClient';

const ADMIN_PHONE = '+17086775221';
const STALE_THRESHOLD_MIN = 30;
const DEAD_THRESHOLD_MIN = 60;
const ALERT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour between alerts per source

// Track last alert time in memory (resets on cold start, but that's fine)
const lastAlerts = {};

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    _supabase = createClient(url, key);
  }
  return _supabase;
}

async function sendOneSignalAlert(title, message) {
  const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
  const apiKey = process.env.ONESIGNAL_REST_API_KEY;
  if (!appId || !apiKey) return;

  try {
    await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${apiKey}`,
      },
      body: JSON.stringify({
        app_id: appId,
        included_segments: ['Subscribed Users'],
        headings: { en: title },
        contents: { en: message },
        priority: 10,
      }),
    });
  } catch (err) {
    console.error('OneSignal alert failed:', err.message);
  }
}

export default async function handler(req, res) {
  // Verify cron secret (Vercel sends this automatically)
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    // Allow without secret in dev, but log warning
    if (process.env.NODE_ENV === 'production' && process.env.CRON_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const now = new Date();
  const supabase = getSupabase();
  const results = { checked_at: now.toISOString(), sources: {}, alerts_sent: [] };

  for (const source of ['bravo', 'pokeratlas']) {
    try {
      const { data, error } = await supabase
        .from('venue_live_tables')
        .select('scrape_timestamp')
        .eq('source', source)
        .order('scrape_timestamp', { ascending: false })
        .limit(1);

      if (error || !data || data.length === 0) {
        results.sources[source] = { status: 'NO_DATA', minutes_ago: null };
        await sendAlert(source, 'NO DATA — scraper may be completely dead', now, results);
        continue;
      }

      const lastScrape = new Date(data[0].scrape_timestamp);
      const minutesAgo = Math.round((now - lastScrape) / 60000);

      results.sources[source] = { status: 'ok', minutes_ago: minutesAgo };

      if (minutesAgo >= DEAD_THRESHOLD_MIN) {
        results.sources[source].status = 'DEAD';
        await sendAlert(source, `DEAD — no data for ${minutesAgo} minutes`, now, results);
      } else if (minutesAgo >= STALE_THRESHOLD_MIN) {
        results.sources[source].status = 'STALE';
        await sendAlert(source, `STALE — data is ${minutesAgo} minutes old`, now, results);
      }
    } catch (err) {
      results.sources[source] = { status: 'ERROR', error: err.message };
      await sendAlert(source, `CHECK ERROR: ${err.message}`, now, results);
    }
  }

  return res.status(200).json(results);
}

async function sendAlert(source, message, now, results) {
  const alertKey = `${source}_alert`;
  const lastAlert = lastAlerts[alertKey] || 0;

  // Rate limit: 1 alert per source per hour
  if (now.getTime() - lastAlert < ALERT_COOLDOWN_MS) {
    results.alerts_sent.push({ source, message, skipped: 'cooldown' });
    return;
  }

  const fullMessage = `🚨 SCRAPER ALERT\n${source.toUpperCase()}: ${message}\nCheck: smarter.poker/api/poker/scraper-health`;

  // SMS via Twilio
  if (isTwilioConfigured()) {
    try {
      await sendSMS(ADMIN_PHONE, fullMessage);
      results.alerts_sent.push({ source, type: 'sms', sent: true });
    } catch (err) {
      results.alerts_sent.push({ source, type: 'sms', error: err.message });
    }
  }

  // Push via OneSignal
  await sendOneSignalAlert(
    `Scraper Alert: ${source.toUpperCase()}`,
    message
  );
  results.alerts_sent.push({ source, type: 'push', sent: true });

  lastAlerts[alertKey] = now.getTime();
}
