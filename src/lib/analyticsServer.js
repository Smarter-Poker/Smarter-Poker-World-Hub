/**
 * Server-side Product Analytics (PostHog) — Phase 5.1.2
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Node-side counterpart to src/lib/analytics.js. Use this from API routes,
 * cron jobs, and the World Hub's scheduled scrapers — anywhere that doesn't
 * have a `window` object to host the browser SDK.
 *
 * Design:
 *   - Lazily require('posthog-node') on first use so Next.js dev doesn't fault
 *     when the dep is missing (e.g. before `npm install` has run on a fresh
 *     branch). If the package can't be loaded we silently no-op.
 *   - No-op if POSTHOG_KEY (or NEXT_PUBLIC_POSTHOG_KEY as a fallback) is
 *     unset. Production must set POSTHOG_KEY as a server-only secret.
 *   - Single process-wide client — don't instantiate one per request, it leaks.
 *   - Cron jobs should call `flushPosthog()` before exit (posthog-node
 *     buffers events and the process exits before the flush otherwise).
 *
 * Event-naming contract matches analytics.js: stick to the FunnelEvents
 * strings for the canonical activation funnel so client + server events
 * aggregate correctly in the PostHog dashboard.
 * ═══════════════════════════════════════════════════════════════════════════
 */

let _client = null;
let _triedInit = false;

function getKey() {
    return process.env.POSTHOG_KEY || process.env.NEXT_PUBLIC_POSTHOG_KEY || null;
}

function getHost() {
    return process.env.POSTHOG_HOST || 'https://us.i.posthog.com';
}

function getClient() {
    if (_client) return _client;
    if (_triedInit) return null;
    _triedInit = true;

    const key = getKey();
    if (!key) return null;

    try {
        // Lazy require — keeps the module loadable before `npm install`.
        // eslint-disable-next-line global-require
        const { PostHog } = require('posthog-node');
        _client = new PostHog(key, {
            host: getHost(),
            // Flush aggressively from cron/API so events aren't lost on exit.
            flushAt: 1,
            flushInterval: 1000,
        });
        return _client;
    } catch (_err) {
        // posthog-node not installed yet — silently no-op.
        return null;
    }
}

/**
 * Capture a server-side event. Safe to call with no userId (will be anonymous).
 *
 *   capture('signup', userId, { source: 'email' });
 *
 * @param {string} event         Event name (snake_case).
 * @param {string|null} userId   distinct_id — usually the user's Supabase id.
 *                               Use null only for anonymous events.
 * @param {object} [properties]  Additional properties to attach.
 */
export function capture(event, userId, properties = {}) {
    const client = getClient();
    if (!client) return;
    try {
        client.capture({
            distinctId: userId || 'anonymous-server',
            event,
            properties,
        });
    } catch (_err) { /* swallow */ }
}

/**
 * Identify a user — called on signup / first login to seed person properties.
 */
export function identify(userId, properties = {}) {
    const client = getClient();
    if (!client || !userId) return;
    try {
        client.identify({
            distinctId: userId,
            properties,
        });
    } catch (_err) { /* swallow */ }
}

/**
 * Flush any queued events. Call at the end of cron jobs / one-shot scripts
 * so events don't get dropped when the process exits.
 */
export async function flushPosthog() {
    const client = getClient();
    if (!client) return;
    try {
        await client.shutdown();
        _client = null;
        _triedInit = false;
    } catch (_err) { /* swallow */ }
}

export const FunnelEvents = Object.freeze({
    SIGNUP: 'signup',
    FIRST_LOGIN: 'first_login',
    FIRST_TABLE_SEAT: 'first_table_seat',
    FIRST_HAND_PLAYED: 'first_hand_played',
    FIRST_SESSION_30MIN: 'first_session_of_30min',
});

export default { capture, identify, flushPosthog, FunnelEvents };
