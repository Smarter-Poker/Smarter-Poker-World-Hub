/**
 * SHARED HEADER-STATS FETCHER (2026-08-24, performance)
 *
 * `/api/user/get-header-stats` is the single most expensive read endpoint in
 * the app - roughly 8 DB round-trips per call - and it was being invoked
 * THREE times concurrently on every page load, by three independent callers
 * that each wanted a different slice of the same payload:
 *
 *   - src/components/ui/UniversalHeader.js  (profile, avatar, VIP, diamonds)
 *   - src/hooks/useUnreadCount.jsx          (notificationCount, unreadMessages)
 *   - src/hooks/useDiamondBalance.js        (profile.diamonds)
 *
 * All three now go through getHeaderStats(), which memoises the IN-FLIGHT
 * promise, so three simultaneous callers share one HTTP request and one set of
 * DB queries. It also holds the resolved payload for a few seconds so a burst
 * of mounts inside the same render pass does not re-fetch.
 *
 * WHY NOT useSWR: swr IS a dependency, but none of the three call sites is a
 * render-time hook - they are imperative calls inside async effects, retry
 * loops, BroadcastChannel handlers and EventBus subscriptions. Wrapping those
 * in useSWR would be a behavioural rewrite of each caller. This module gives
 * the same in-flight dedupe with no change to any caller's control flow.
 *
 * REFRESH SEMANTICS ARE PRESERVED: pass { force: true } from an explicit
 * refresh (diamonds earned/spent, cross-tab broadcast, visibility catch-up) to
 * bypass the short result cache. Forced calls that land within
 * FORCE_COALESCE_MS of each other still share one request, so an event burst
 * (DIAMONDS_EARNED plus its broadcast echo) costs one round-trip, not two.
 */

// How long a resolved payload may be served to a non-forced caller.
const DEFAULT_MAX_AGE_MS = 5000;

// Forced callers arriving within this window of an already-running request
// join it instead of starting another.
const FORCE_COALESCE_MS = 300;

let inflight = null;
let inflightAt = 0;
let inflightForced = false;
let cached = null;
let cachedAt = 0;
// The user id that `cached` and `inflight` belong to. THIS IS A SECURITY
// CONTROL, not an optimisation. get-header-stats returns diamonds, avatar_url,
// VIP flag, is_admin, notification count and unread messages. Without this key
// a sign-out followed by a sign-in inside DEFAULT_MAX_AGE_MS would hand the new
// user the previous user's payload, and an in-flight request issued under the
// old bearer token would be joined by the new user's callers.
let cacheOwner = null;

function readAccessToken() {
    if (typeof window === 'undefined') return null;
    try {
        const authData = JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}');
        return authData?.access_token || null;
    } catch (_) {
        return null;
    }
}

async function requestHeaderStats(userId) {
    const accessToken = readAccessToken();
    const response = await fetch('/api/user/get-header-stats', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        // The route derives identity from the JWT and ignores this field; it is
        // sent only because all three previous call sites sent it.
        body: JSON.stringify(userId ? { userId } : {}),
    });
    // Callers historically inspected `result.success` themselves and treated a
    // non-ok response as "no usable data", so resolve with whatever JSON came
    // back rather than throwing on a 4xx/5xx.
    return response.json();
}

/**
 * Fetch header stats, sharing one request across concurrent callers.
 *
 * @param {object}  [options]
 * @param {string}  [options.userId]    current user id (optional, informational)
 * @param {boolean} [options.force]     bypass the short result cache
 * @param {number}  [options.maxAgeMs]  how stale a cached payload may be
 * @returns {Promise<object>} the parsed /api/user/get-header-stats payload
 */
export function getHeaderStats(options = {}) {
    const { userId = null, force = false, maxAgeMs = DEFAULT_MAX_AGE_MS } = options;
    const now = Date.now();

    // Identity changed: drop everything belonging to the previous user before
    // any cache or in-flight request can be handed to this caller.
    if (cacheOwner !== userId) {
        inflight = null;
        inflightForced = false;
        cached = null;
        cachedAt = 0;
        cacheOwner = userId;
    }

    if (inflight) {
        // Non-forced callers always join. A forced caller joins only a request
        // that is itself forced or that started moments ago, so a genuine
        // refresh after a long-running request still gets fresh data.
        if (!force || inflightForced || now - inflightAt < FORCE_COALESCE_MS) {
            return inflight;
        }
    } else if (!force && cached && now - cachedAt < maxAgeMs) {
        return Promise.resolve(cached);
    }

    const requestedFor = userId;
    const pending = requestHeaderStats(userId).then(
        (result) => {
            // Only the CURRENT in-flight request may write the cache. A
            // superseded older request resolving late must not clobber a
            // fresher payload, and a request issued under a previous identity
            // must not populate the new owner's cache.
            if (inflight === pending) {
                inflight = null;
                inflightForced = false;
                if (cacheOwner === requestedFor) {
                    cached = result;
                    cachedAt = Date.now();
                }
            }
            return result;
        },
        (err) => {
            if (inflight === pending) {
                inflight = null;
                inflightForced = false;
            }
            throw err;
        }
    );

    inflight = pending;
    inflightAt = now;
    inflightForced = force;
    return pending;
}

/** Drop the cached payload so the next call re-fetches (sign-out, account switch). */
export function invalidateHeaderStats() {
    cached = null;
    cachedAt = 0;
    // Clearing only `cached` is not enough: an in-flight request issued under
    // the outgoing identity would still be joined by the next caller.
    inflight = null;
    inflightAt = 0;
    inflightForced = false;
    cacheOwner = null;
}

export default getHeaderStats;
