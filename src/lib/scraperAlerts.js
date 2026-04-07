/**
 * Scraper Alert System
 * ═══════════════════════════════════════════════════════════
 * Sends SMS alerts to the owner when automated scrapers encounter
 * errors, zero results, or critical failures.
 *
 * Alert recipient: +1-708-677-5221 (owner)
 * SMS provider: Twilio (uses existing TWILIO_* env vars)
 *
 * Alert levels:
 *   CRITICAL - 0 tours updated, scraper completely failed
 *   WARNING  - >50% of tours failed / no new events found
 *   INFO     - New series or significant changes detected
 *
 * Usage:
 *   import { alertScraperCritical, alertScraperWarning, alertScraperSuccess } from '@/lib/scraperAlerts';
 *   await alertScraperCritical('tour-schedule-scraper', 'Zero tours updated', stats);
 */

// OWNER ALERT NUMBER — receives all scraper failure notifications
const OWNER_PHONE = '+17086775221';

// Alert throttle: don't send same alert type more than once per 6 hours
// We use a simple in-memory Map (resets on cold start — acceptable for Vercel)
const alertThrottle = new Map();
const THROTTLE_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Check if an alert of this type has been sent recently
 */
function isThrottled(key) {
    const last = alertThrottle.get(key);
    if (!last) return false;
    return (Date.now() - last) < THROTTLE_MS;
}

function markSent(key) {
    alertThrottle.set(key, Date.now());
}

/**
 * Send SMS via Twilio using existing project credentials.
 * Does NOT require auth — uses service-level env vars only.
 */
async function sendSmsAlert(message) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromPhone = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !fromPhone) {
        console.warn('[ALERT] Twilio not configured — SMS alert not sent');
        console.warn('[ALERT] Message was:', message);
        return { sent: false, reason: 'Twilio credentials not configured' };
    }

    try {
        // Use Twilio REST API directly (avoid import issues in Vercel edge)
        const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
        const body = new URLSearchParams({
            From: fromPhone,
            To: OWNER_PHONE,
            Body: message
        });

        const response = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${credentials}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: body.toString()
            }
        );

        const result = await response.json();

        if (result.sid) {
            console.log(`[ALERT] SMS sent to ${OWNER_PHONE} — SID: ${result.sid}`);
            return { sent: true, sid: result.sid };
        } else {
            console.error('[ALERT] SMS send failed:', result.message);
            return { sent: false, reason: result.message };
        }
    } catch (err) {
        console.error('[ALERT] SMS error:', err.message);
        return { sent: false, reason: err.message };
    }
}

/**
 * Format a concise SMS message for scraper alerts (160 char limit awareness)
 */
function formatAlert(level, scraperName, reason, stats = {}) {
    const ts = new Date().toLocaleString('en-US', {
        timeZone: 'America/Chicago',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    const emoji = level === 'CRITICAL' ? '🚨' : level === 'WARNING' ? '⚠️' : '✅';

    let msg = `${emoji} Smarter.Poker Scraper ${level}\n`;
    msg += `[${scraperName}] ${ts} CT\n`;
    msg += reason;

    if (stats.tours_scraped !== undefined) {
        msg += `\nTours: ${stats.tours_updated || 0}/${stats.tours_scraped || 0} updated`;
    }
    if (stats.total_events !== undefined) {
        msg += `, Events: ${stats.total_events || 0}`;
    }
    if (stats.errors?.length) {
        const errSummary = stats.errors.slice(0, 2).map(e => e.tour || e.scraper || 'unknown').join(', ');
        msg += `\nErrors: ${errSummary}${stats.errors.length > 2 ? '...' : ''}`;
    }

    // Keep under 320 chars (2 SMS segments) for cost control
    return msg.substring(0, 320);
}

// ─── Public Alert Functions ───────────────────────────────────────────────────

/**
 * Send a CRITICAL alert — scraper completely failed or 0 tours updated
 * Throttled to once per 6 hours per scraper.
 */
export async function alertScraperCritical(scraperName, reason, stats = {}) {
    const key = `critical:${scraperName}`;
    if (isThrottled(key)) {
        console.log(`[ALERT] Critical alert throttled for ${scraperName}`);
        return { sent: false, reason: 'throttled' };
    }

    const message = formatAlert('CRITICAL', scraperName, reason, stats);
    const result = await sendSmsAlert(message);
    if (result.sent) markSent(key);
    return result;
}

/**
 * Send a WARNING alert — partial failure, high error rate
 * Throttled to once per 6 hours per scraper.
 */
export async function alertScraperWarning(scraperName, reason, stats = {}) {
    const key = `warning:${scraperName}`;
    if (isThrottled(key)) {
        console.log(`[ALERT] Warning alert throttled for ${scraperName}`);
        return { sent: false, reason: 'throttled' };
    }

    const message = formatAlert('WARNING', scraperName, reason, stats);
    const result = await sendSmsAlert(message);
    if (result.sent) markSent(key);
    return result;
}

/**
 * Send a SUCCESS/INFO alert — significant new data found
 * (Less commonly used — only for major schedule updates)
 * Throttled to once per 12 hours.
 */
export async function alertScraperInfo(scraperName, reason, stats = {}) {
    const key = `info:${scraperName}`;
    const last = alertThrottle.get(key);
    const infoThrottle = 12 * 60 * 60 * 1000;
    if (last && (Date.now() - last) < infoThrottle) {
        return { sent: false, reason: 'throttled' };
    }

    const message = formatAlert('INFO', scraperName, reason, stats);
    const result = await sendSmsAlert(message);
    if (result.sent) markSent(key);
    return result;
}

/**
 * Evaluate scraper stats and auto-send appropriate alert level.
 * This is the main entry point — call after every scraper run.
 *
 * @param {string} scraperName - e.g., 'tour-schedule-scraper'
 * @param {object} stats - Stats object from the scraper
 */
export async function evaluateAndAlert(scraperName, stats) {
    const {
        tours_scraped = 0,
        tours_updated = 0,
        tours_skipped = 0,
        total_events = 0,
        errors = [],
        failures = [],
        pdf_events_found = 0,
    } = stats;

    const totalAttempted = tours_scraped;
    const errorRate = totalAttempted > 0 ? errors.length / totalAttempted : 0;

    // CRITICAL: Nothing worked at all
    if (totalAttempted > 0 && tours_updated === 0 && errors.length > 0) {
        return await alertScraperCritical(
            scraperName,
            `0 tours updated. ${errors.length} error(s). May be blocked or down.`,
            stats
        );
    }

    // CRITICAL: Scraper ran but produced literally nothing
    if (totalAttempted === 0 && tours_skipped === 0) {
        return await alertScraperCritical(
            scraperName,
            'Scraper produced no output — possible config error.',
            stats
        );
    }

    // WARNING: High error rate (>50% of tours failed)
    if (errorRate > 0.5) {
        return await alertScraperWarning(
            scraperName,
            `High error rate: ${errors.length}/${totalAttempted} tours failed.`,
            stats
        );
    }

    // WARNING: Very few events found compared to expected
    if (total_events < 5 && tours_updated > 0) {
        return await alertScraperWarning(
            scraperName,
            `Only ${total_events} events found across ${tours_updated} tours — schedule data may be stale.`,
            stats
        );
    }

    // INFO: PDF data found (new detailed data) — only alert if significant
    if (pdf_events_found > 20) {
        return await alertScraperInfo(
            scraperName,
            `PDF extraction: ${pdf_events_found} detailed events captured from ${tours_updated} tours.`,
            stats
        );
    }

    // All good — no alert needed
    console.log(`[ALERT] Scraper ${scraperName} ran cleanly — no alerts needed`);
    return { sent: false, reason: 'no_alert_needed' };
}
