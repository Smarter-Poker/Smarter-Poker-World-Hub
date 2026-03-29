/**
 * Cron: /api/cron/scraper-watchdog
 * Runs every 5 minutes via Vercel Cron.
 * 
 * Checks venue data scraper freshness across all sources.
 * If data is stale (>45 min) or dead (>90 min), sends:
 *   1. SMS to admin via Twilio
 *   2. Push notification via OneSignal
 * 
 * ALERT RATE LIMITING:
 *   - Uses Supabase table for persistent cooldown tracking
 *     (survives Vercel cold starts, unlike in-memory tracking)
 *   - Tier 1 (>30 min): Log only, no alert
 *   - Tier 2 (>45 min): SMS alert, max 1 per hour per source
 *   - Tier 3 (>90 min): SMS + push every 30 min until resolved
 *   - Auto-resolves: Sends "all clear" when data becomes fresh again
 */
import { sendSMS, isTwilioConfigured } from '../../../src/lib/commander/twilio';
import { createClient } from '../../../src/lib/supabaseServerClient';

const ADMIN_PHONE = '+17086775221';
const STALE_THRESHOLD_MIN = 45;    // Tier 2: SMS alert
const DEAD_THRESHOLD_MIN = 90;     // Tier 3: Escalated alert
const TIER2_COOLDOWN_MS = 60 * 60 * 1000;  // 1 hour between Tier 2 alerts
const TIER3_COOLDOWN_MS = 30 * 60 * 1000;  // 30 min between Tier 3 alerts

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    _supabase = createClient(url, key);
  }
  return _supabase;
}

// ============================================================
// PERSISTENT ALERT STATE (Supabase-backed)
// ============================================================
// Uses a simple key-value approach in the scraper_watchdog_state table
// Falls back to in-memory if table doesn't exist

let alertStateCache = {};

async function getAlertState(supabase, source) {
  const key = `${source}_last_alert`;
  
  // Try Supabase first
  try {
    const { data, error } = await supabase
      .from('scraper_watchdog_state')
      .select('value')
      .eq('key', key)
      .maybeSingle();
    
    if (!error && data) {
      return JSON.parse(data.value);
    }
  } catch (e) {
    // Table might not exist — fall through to in-memory
  }
  
  return alertStateCache[key] || { last_alert_ms: 0, was_alerting: false };
}

async function setAlertState(supabase, source, state) {
  const key = `${source}_last_alert`;
  alertStateCache[key] = state;
  
  try {
    await supabase
      .from('scraper_watchdog_state')
      .upsert({
        key,
        value: JSON.stringify(state),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });
  } catch (e) {
    // Silently fail — in-memory cache is the fallback
  }
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
    if (process.env.NODE_ENV === 'production' && process.env.CRON_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const now = new Date();
  const nowMs = now.getTime();
  const supabase = getSupabase();
  const results = { checked_at: now.toISOString(), sources: {}, alerts_sent: [], resolved: [] };

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
        await sendSmartAlert(supabase, source, 'NO DATA — scraper may be completely dead', 'dead', now, results);
        continue;
      }

      const lastScrape = new Date(data[0].scrape_timestamp);
      const minutesAgo = Math.round((now - lastScrape) / 60000);

      results.sources[source] = { status: 'ok', minutes_ago: minutesAgo };

      if (minutesAgo >= DEAD_THRESHOLD_MIN) {
        // TIER 3: Dead — escalated alerts, shorter cooldown
        results.sources[source].status = 'DEAD';
        await sendSmartAlert(supabase, source, `DEAD — no data for ${minutesAgo} minutes`, 'dead', now, results);
      } else if (minutesAgo >= STALE_THRESHOLD_MIN) {
        // TIER 2: Stale — standard alerts
        results.sources[source].status = 'STALE';
        await sendSmartAlert(supabase, source, `STALE — data is ${minutesAgo} minutes old`, 'stale', now, results);
      } else {
        // HEALTHY — check if we need to send "all clear"
        const alertState = await getAlertState(supabase, source);
        if (alertState.was_alerting) {
          await sendRecoveryAlert(supabase, source, minutesAgo, results);
        }
      }
    } catch (err) {
      results.sources[source] = { status: 'ERROR', error: err.message };
      console.error(`Watchdog error for ${source}:`, err.message);
    }
  }

  return res.status(200).json(results);
}

async function sendSmartAlert(supabase, source, message, severity, now, results) {
  const nowMs = now.getTime();
  const alertState = await getAlertState(supabase, source);
  const cooldown = severity === 'dead' ? TIER3_COOLDOWN_MS : TIER2_COOLDOWN_MS;

  // Rate limit check
  if (nowMs - (alertState.last_alert_ms || 0) < cooldown) {
    const nextIn = Math.round((cooldown - (nowMs - alertState.last_alert_ms)) / 60000);
    results.alerts_sent.push({ source, message, skipped: `cooldown (${nextIn}min remaining)` });
    return;
  }

  const fullMessage = `SCRAPER ALERT\n${source.toUpperCase()}: ${message}\nCheck: smarter.poker/api/poker/scraper-health`;

  // SMS via Twilio
  if (isTwilioConfigured()) {
    try {
      await sendSMS(ADMIN_PHONE, fullMessage);
      results.alerts_sent.push({ source, type: 'sms', severity, sent: true });
    } catch (err) {
      results.alerts_sent.push({ source, type: 'sms', error: err.message });
    }
  }

  // Push via OneSignal (only for DEAD tier)
  if (severity === 'dead') {
    await sendOneSignalAlert(
      `Scraper Alert: ${source.toUpperCase()}`,
      message
    );
    results.alerts_sent.push({ source, type: 'push', sent: true });
  }

  // Persist alert state
  await setAlertState(supabase, source, {
    last_alert_ms: nowMs,
    was_alerting: true,
    last_severity: severity,
    last_message: message,
  });
}

async function sendRecoveryAlert(supabase, source, minutesAgo, results) {
  const message = `ALL CLEAR\n${source.toUpperCase()} scraper recovered! Data is now ${minutesAgo} min fresh.`;

  if (isTwilioConfigured()) {
    try {
      await sendSMS(ADMIN_PHONE, message);
      results.resolved.push({ source, type: 'sms', sent: true });
    } catch (err) {
      results.resolved.push({ source, type: 'sms', error: err.message });
    }
  }

  // Clear alert state
  await setAlertState(supabase, source, {
    last_alert_ms: 0,
    was_alerting: false,
    last_severity: null,
    last_message: null,
  });
}
