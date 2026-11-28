/**
 * Read-Only PostHog Organic SEO Conversion Funnel Rollup.
 *
 * Queries PostHog's HogQL Query API (`https://us.posthog.com`) for aggregate
 * event counts across the 17 canonical SEO conversion funnel events. Zero user
 * rows, distinct IDs, emails, or PII ever leave PostHog or this module.
 */

export const SEO_FUNNEL_EVENTS = Object.freeze([
  'seo_mini_gto_drill_answered',
  'seo_leak_finder_complete',
  'seo_calculator_save_bar_click',
  'seo_quick_signup_opened',
  'seo_quick_signup_oauth_click',
  'seo_quick_signup_email_continue',
  'seo_google_one_tap_success',
  'seo_post_signup_activation_shown',
  'seo_guest_spots_synced',
  'seo_local_action_click',
  'seo_calc_milestone_click',
  'seo_quick_signup_magic_link_sent',
  'seo_concept_bridge_click',
  'seo_spot_share_click',
  'seo_day0_referral_click',
  'seo_venue_follow_signup_click',
  'seo_video_bridge_click',
]);

const SEO_FUNNEL_EVENT_SET = new Set(SEO_FUNNEL_EVENTS);
const POSTHOG_QUERY_HOST = 'https://us.posthog.com';
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_WINDOW_DAYS = 90;

const rollupCache = new Map();

export function resetSeoFunnelRollupCacheForTest() {
  rollupCache.clear();
}

function normalizeWindowDays(windowDays) {
  return Number.isInteger(windowDays) && windowDays > 0 && windowDays <= MAX_WINDOW_DAYS
    ? windowDays
    : 7;
}

function toSafeCount(value) {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? Math.trunc(num) : 0;
}

function safeRatePct(numerator, denominator) {
  if (!Number.isFinite(denominator) || denominator <= 0) return null;
  if (!Number.isFinite(numerator) || numerator < 0) return null;
  const pct = Math.round((numerator / denominator) * 1000) / 10;
  return Number.isFinite(pct) ? pct : null;
}

function cloneSummary(summary) {
  return {
    available: summary.available,
    ...(summary.reason ? { reason: summary.reason } : {}),
    window_days: summary.window_days,
    events: { ...summary.events },
    stages: summary.stages ? { ...summary.stages } : null,
    rates: summary.rates ? { ...summary.rates } : null,
  };
}

/**
 * Pure, zero-PII organic conversion funnel summary builder.
 * Only keys in `SEO_FUNNEL_EVENTS` are accepted; unknown keys are discarded.
 */
export function buildSeoFunnelSummary(eventCounts, { windowDays = 7 } = {}) {
  const safeWindowDays = normalizeWindowDays(windowDays);
  const source = eventCounts && typeof eventCounts === 'object' ? eventCounts : {};

  const events = {};
  for (const eventName of SEO_FUNNEL_EVENTS) {
    events[eventName] = toSafeCount(source[eventName]);
  }

  const engaged =
    events.seo_mini_gto_drill_answered +
    events.seo_leak_finder_complete +
    events.seo_calculator_save_bar_click +
    events.seo_local_action_click +
    events.seo_calc_milestone_click +
    events.seo_concept_bridge_click +
    events.seo_venue_follow_signup_click +
    events.seo_video_bridge_click;
  const sheetOpened = events.seo_quick_signup_opened;
  const authIntent =
    events.seo_quick_signup_oauth_click +
    events.seo_quick_signup_email_continue +
    events.seo_quick_signup_magic_link_sent +
    events.seo_google_one_tap_success;
  const activated = events.seo_post_signup_activation_shown;
  const spotsSynced = events.seo_guest_spots_synced;
  const viralShares =
    events.seo_spot_share_click +
    events.seo_day0_referral_click;

  const stages = {
    engaged,
    sheetOpened,
    authIntent,
    activated,
    spotsSynced,
    viralShares,
  };

  const rates = {
    engagedToSheetPct: safeRatePct(sheetOpened, engaged),
    sheetToAuthIntentPct: safeRatePct(authIntent, sheetOpened),
    authIntentToActivatedPct: safeRatePct(activated, authIntent),
    activatedToSyncedPct: safeRatePct(spotsSynced, activated),
  };

  return {
    available: true,
    window_days: safeWindowDays,
    events,
    stages,
    rates,
  };
}

/**
 * Aggregate-only HogQL query for the 17 canonical SEO funnel events.
 * No visitor rows, session IDs, or person properties leave PostHog.
 */
export function buildSeoFunnelHogqlQuery(start, end) {
  const from = new Date(start).toISOString();
  const to = new Date(end).toISOString();
  if (from >= to || Date.parse(to) - Date.parse(from) > MAX_WINDOW_DAYS * 86400000) {
    throw new Error('Invalid Window');
  }
  const eventList = SEO_FUNNEL_EVENTS.map((eventName) => `'${eventName}'`).join(', ');
  return `SELECT event, count() AS event_count
FROM events
WHERE timestamp >= toDateTime64('${from}', 3, 'UTC')
  AND timestamp < toDateTime64('${to}', 3, 'UTC')
  AND event IN (${eventList})
GROUP BY event`;
}

function buildUnavailableRollup(reason, windowDays) {
  return {
    available: false,
    reason,
    window_days: windowDays,
    events: {},
    stages: null,
    rates: null,
  };
}

/**
 * Read-only PostHog HogQL rollup loader with 5-minute in-memory TTL cache and
 * strict AbortController timeout. Never throws, never returns credentials, and
 * never substitutes unavailable telemetry for zeros.
 */
export async function loadSeoFunnelRollup({
  fetchImpl = globalThis.fetch,
  env = process.env,
  windowDays = 7,
  timeoutMs = 4000,
  now = Date.now(),
} = {}) {
  const safeWindowDays = normalizeWindowDays(windowDays);
  const safeTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.trunc(timeoutMs) : 4000;
  const nowMs = Number.isFinite(now) ? now : Date.now();

  const apiKey = typeof env?.POSTHOG_REPORTING_API_KEY === 'string'
    ? env.POSTHOG_REPORTING_API_KEY.trim()
    : '';
  const projectId = typeof env?.POSTHOG_REPORTING_PROJECT_ID === 'string'
    ? env.POSTHOG_REPORTING_PROJECT_ID.trim()
    : '';

  if (!apiKey || !/^\d+$/.test(projectId)) {
    return buildUnavailableRollup('unconfigured', safeWindowDays);
  }

  const cacheKey = `${projectId}:${safeWindowDays}`;
  const cached = rollupCache.get(cacheKey);
  if (cached && nowMs < cached.expiresAt) {
    return cloneSummary(cached.value);
  }

  if (typeof fetchImpl !== 'function') {
    return buildUnavailableRollup('fetch_error', safeWindowDays);
  }

  const endMs = nowMs;
  const startMs = endMs - safeWindowDays * 24 * 60 * 60 * 1000;
  const query = buildSeoFunnelHogqlQuery(startMs, endMs);

  const controller = new AbortController();
  let timedOut = false;
  let timerId = null;

  try {
    const timeoutPromise = new Promise((_, reject) => {
      timerId = setTimeout(() => {
        timedOut = true;
        try {
          controller.abort();
        } catch {
          /* ignore abort error */
        }
        const err = new Error('PostHog reporting query timed out');
        err.name = 'AbortError';
        reject(err);
      }, safeTimeoutMs);
    });

    const response = await Promise.race([
      fetchImpl(`${POSTHOG_QUERY_HOST}/api/projects/${projectId}/query/`, {
        method: 'POST',
        redirect: 'error',
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: {
            kind: 'HogQLQuery',
            query,
          },
          name: 'SEO Organic Conversion Funnel Rollup',
          refresh: 'force_blocking',
        }),
      }),
      timeoutPromise,
    ]);

    if (!response || !response.ok) {
      return buildUnavailableRollup('fetch_error', safeWindowDays);
    }

    const result = await Promise.race([response.json(), timeoutPromise]);
    if (
      !result ||
      result.error ||
      result.query_status?.complete === false ||
      !Array.isArray(result.results)
    ) {
      return buildUnavailableRollup('fetch_error', safeWindowDays);
    }

    const counts = {};
    for (const row of result.results) {
      if (!Array.isArray(row) || row.length < 2) continue;
      const eventName = typeof row[0] === 'string' ? row[0] : '';
      if (!SEO_FUNNEL_EVENT_SET.has(eventName)) continue;
      const parsedCount = Number(row[1]);
      if (Number.isFinite(parsedCount) && parsedCount >= 0) {
        counts[eventName] = Math.trunc(parsedCount);
      }
    }

    const summary = buildSeoFunnelSummary(counts, { windowDays: safeWindowDays });
    rollupCache.set(cacheKey, {
      expiresAt: nowMs + CACHE_TTL_MS,
      value: cloneSummary(summary),
    });
    return summary;
  } catch (err) {
    if (timedOut || err?.name === 'AbortError' || err?.name === 'TimeoutError') {
      return buildUnavailableRollup('timeout', safeWindowDays);
    }
    return buildUnavailableRollup('fetch_error', safeWindowDays);
  } finally {
    if (timerId !== null) clearTimeout(timerId);
  }
}
