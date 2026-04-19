/**
 * Cron: /api/cron/scraper-watchdog
 * Runs every 30 minutes via Vercel Cron.
 * 
 * Checks venue data scraper freshness across all sources.
 * If data is stale (>30 min) or dead (>60 min), sends:
 *   1. SMS to admin via Twilio
 *   2. Push notification via OneSignal
 * 
 * ALERT RATE LIMITING:
 *   - Uses Supabase table for persistent cooldown tracking
 *     (survives Vercel cold starts, unlike in-memory tracking)
 *   - Tier 1 (>30 min): Log only, no alert
 *   - Tier 2 (>30 min): SMS alert, max 1 per hour per source
 *   - Tier 3 (>60 min): SMS + push every 30 min until resolved
 *   - Auto-resolves: Sends "all clear" when data becomes fresh again
 */
import { sendSMS, isTwilioConfigured } from '../../../src/lib/commander/twilio';
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

const ADMIN_PHONE = '+17086775221';
const STALE_THRESHOLD_MIN = 45;    // Tier 2: SMS alert
const DEAD_THRESHOLD_MIN = 60;     // Tier 3: Escalated alert
const TIER2_COOLDOWN_MS = 60 * 60 * 1000;  // 1 hour between Tier 2 alerts
const TIER3_COOLDOWN_MS = 30 * 60 * 1000;  // 30 min between Tier 3 alerts

const getSupabase = getSupabaseAdmin;

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

async function appendAlertHistory(supabase, source, type, message) {
  const key = 'alert_history';
  try {
    let history = [];
    const { data } = await supabase.from('scraper_watchdog_state').select('value').eq('key', key).maybeSingle();
    if (data && data.value) {
      history = JSON.parse(data.value);
    }
    
    // Append new event
    history.unshift({
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      source,
      type, // 'alert' or 'recovery'
      message,
    });
    
    // Keep last 50 events
    history = history.slice(0, 50);
    
    await supabase.from('scraper_watchdog_state').upsert({
      key,
      value: JSON.stringify(history),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });
  } catch (e) {
    console.error('Failed to append alert history:', e.message);
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
        include_aliases: { external_id: ["admin@smarter.poker"] },
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
      const { data, count, error } = await supabase
        .from('venue_live_tables')
        .select('scrape_timestamp', { count: 'exact' })
        .eq('source', source)
        .order('scrape_timestamp', { ascending: false })
        .limit(1);

      if (error) {
        results.sources[source] = { status: 'ERROR', minutes_ago: null };
        await sendSmartAlert(supabase, source, `DATABASE ERROR — ${error.message}`, 'dead', now, results);
        continue;
      }

      // Safeguard date parsing if table is completely empty
      const lastScrape = data && data.length > 0 ? new Date(data[0].scrape_timestamp) : new Date(0);
      const minutesAgo = data && data.length > 0 ? Math.round((now - lastScrape) / 60000) : 999;
      
      const safeCount = count || 0;
      results.sources[source] = { status: 'ok', minutes_ago: minutesAgo, count: safeCount };

      const currentHour = now.getHours().toString();
      const baseKey = `baseline_${source}`;
      let baselines = {};
      try {
        const { data: bData } = await supabase.from('scraper_watchdog_state').select('value').eq('key', baseKey).maybeSingle();
        if (bData && bData.value) baselines = typeof bData.value === 'string' ? JSON.parse(bData.value) : bData.value;
      } catch (e) { console.error('Baseline parse error', e); }

      const previousBaseline = baselines[currentHour] || null;
      baselines[currentHour] = previousBaseline ? Math.round((safeCount * 0.1) + (previousBaseline * 0.9)) : safeCount;

      await supabase.from('scraper_watchdog_state').upsert({
        key: baseKey,
        value: JSON.stringify(baselines),
        updated_at: now.toISOString(),
      }, { onConflict: 'key' });

      const relativeDrop = previousBaseline && previousBaseline > 50 && (safeCount === 0 || safeCount < (previousBaseline * 0.25));

      if (safeCount < 10 || safeCount > 5000 || relativeDrop) {
        // TIER 4: Anomaly — Data mathematically drops dead natively without NO_DATA short-circuit
        results.sources[source].status = 'ANOMALY';
        const msg = relativeDrop 
          ? `ANOMALY — 75%+ volumetric drop compared to ${currentHour}:00 baseline (${safeCount} vs ${previousBaseline})`
          : `ANOMALY — Table count breached safety limits: ${safeCount} total tables returned`;
        await sendSmartAlert(supabase, source, msg, 'dead', now, results);
      } else if (minutesAgo >= DEAD_THRESHOLD_MIN) {
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

  // Log to history timeline
  await appendAlertHistory(supabase, source, 'alert', fullMessage);
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

  // Log to history timeline
  await appendAlertHistory(supabase, source, 'recovery', message);
}
