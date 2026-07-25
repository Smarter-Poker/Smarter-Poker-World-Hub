/**
 * Product Analytics (PostHog) — Phase 5.1.2
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Client-side wrapper around posthog-js that:
 *   - no-ops silently if NEXT_PUBLIC_POSTHOG_KEY is unset (dev/test)
 *   - lazy-loads the posthog-js script from CDN on first capture so the
 *     190KB payload stays out of the initial JS bundle
 *   - queues capture() calls that fire before the SDK is loaded
 *   - supports the canonical activation funnel:
 *        signup → first_login → first_table_seat → first_hand_played
 *        → first_session_of_30min
 *
 * Why not `import posthog from 'posthog-js'`: Next.js would statically bundle
 * the SDK into every page that imports anything from this file (tree-shaking
 * can't eliminate a side-effect-ful default export). Dynamic import via
 * a <script> tag keeps the hot path tiny.
 *
 * Why still keep posthog-js in package.json: so the types are available for
 * IDE intellisense, and so Next.js pre-builds don't trip on a missing module
 * if we later switch to static import. The actual runtime loader below uses
 * the CDN URL to avoid the bundle hit.
 *
 * Server-side analytics live in a sibling file — `analyticsServer.js` — so
 * Next.js doesn't try to run the browser SDK in Node.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const POSTHOG_HOST = 'https://us.i.posthog.com';
// .trim() guards against the trailing-"\n" pattern present in several prod
// Vercel env values (would corrupt the PostHog project key).
const POSTHOG_KEY = (process.env.NEXT_PUBLIC_POSTHOG_KEY || '').trim();

let _loaded = false;
let _loadPromise = null;
const _queue = [];
const MAX_QUEUE = 50;

function isBrowser() {
    return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function isEnabled() {
    return isBrowser() && !!POSTHOG_KEY;
}

/**
 * Load posthog-js from CDN the first time we capture anything.
 */
function loadPosthog() {
    if (_loadPromise) return _loadPromise;
    if (!isEnabled()) return Promise.resolve(null);

    _loadPromise = new Promise((resolve) => {
        // PostHog snippet (from their official docs) — populates window.posthog
        // with a proxy that queues calls until the real SDK finishes loading.
        (function (t, e) {
            const o = (t.posthog = t.posthog || []);
            if (!o.__SV) {
                let p; let u;
                let f;
                let n;
                o._i = [];
                o.init = function (i, s, a) {
                    const g = function (t2, e2) {
                        const o2 = e2.split('.');
                        if (o2.length == 2) {
                            t2 = t2[o2[0]]; e2 = o2[1];
                        }
                        t2[e2] = function () { t2.push([e2].concat(Array.prototype.slice.call(arguments, 0))); };
                    };
                    p = e.createElement('script');
                    p.type = 'text/javascript';
                    p.async = !0;
                    p.src = s.api_host + '/static/array.js';
                    u = e.getElementsByTagName('script')[0];
                    u.parentNode.insertBefore(p, u);
                    f = 'init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing startSessionRecording stopSessionRecording startChatAction withCheckpointChatAction chatCheckpointId resetChatCheckpointId debug getPageViewId'.split(' ');
                    for (n = 0; n < f.length; n++) g(o, f[n]);
                    o._i.push([i, s, a]);
                };
                o.__SV = 1;
            }
        })(window, document);

        // Initialize PostHog with the project key.
        window.posthog.init(POSTHOG_KEY, {
            api_host: POSTHOG_HOST,
            person_profiles: 'identified_only',
            capture_pageview: true,
            capture_pageleave: true,
            autocapture: {
                // Don't autocapture rage-clicks / dead-clicks inside the
                // Club Arena SPA — its poker UI has intentionally sticky
                // interactions (fold button, raise slider) that trip those
                // detectors and flood PostHog with noise.
                dom_event_allowlist: ['click', 'change', 'submit'],
                css_selector_allowlist: [], // empty = autocapture all
            },
            // Respect Do Not Track
            respect_dnt: true,
            // Mask password + card number fields (privacy).
            mask_all_text: false,
            mask_all_element_attributes: false,
            session_recording: {
                maskAllInputs: false,
                maskTextSelector: '[data-mask]',
                maskInputOptions: {
                    password: true,
                    number: true,
                    email: false,
                    tel: true,
                },
            },
        });

        // SPA pageviews: capture_pageview only fires on full document loads.
        // Hook the Pages Router so client-side navigations register too —
        // without this, multi-route funnels (signup -> first_login) undercount.
        try {
            // eslint-disable-next-line global-require
            const Router = require('next/router').default;
            if (Router?.events?.on) {
                Router.events.on('routeChangeComplete', () => {
                    try { window.posthog?.capture('$pageview'); } catch (_e) { /* ignore */ }
                });
            }
        } catch (_routerErr) { /* not in a Next.js context (unit tests) */ }

        // Flush any queued calls
        _loaded = true;
        for (const [method, args] of _queue) {
            try {
                if (typeof window.posthog?.[method] === 'function') {
                    window.posthog[method](...args);
                }
            } catch (_err) { console.warn('[App] Handled exception:', _err?.message || _err); }
        }
        _queue.length = 0;
        resolve(window.posthog);
    });

    return _loadPromise;
}

/**
 * Queue a call if posthog isn't loaded yet; otherwise fire immediately.
 */
function proxy(method, args) {
    if (!isEnabled()) return;
    if (_loaded && typeof window.posthog?.[method] === 'function') {
        try { window.posthog[method](...args); } catch (_err) { console.warn('[App] Handled exception:', _err?.message || _err); }
        return;
    }
    if (_queue.length < MAX_QUEUE) _queue.push([method, args]);
    // Fire the loader on the first queued call
    loadPosthog();
}

/**
 * Capture a product event.
 *
 *   capture('first_login', { source: 'password' });
 *
 * @param {string} event       Event name — stick to snake_case per the
 *                             activation-funnel conventions.
 * @param {object} [properties] Additional properties to attach. User id is
 *                              set separately via identify().
 */
export function capture(event, properties = {}) {
    proxy('capture', [event, properties]);
}

/**
 * Identify the current user. Call this on login + after signup.
 */
export function identify(userId, properties = {}) {
    proxy('identify', [userId, properties]);
}

/**
 * Reset the client identity — call on logout.
 */
export function reset() {
    proxy('reset', []);
}

/**
 * Register super-properties that tag every subsequent capture.
 *   register({ app_version: '2026.04.19' });
 */
export function register(properties) {
    proxy('register', [properties]);
}

/**
 * The five canonical funnel steps — named exports so callers don't mistype
 * the event strings. Add to this list with care; changing any of these
 * invalidates the PostHog funnel definition.
 */
export const FunnelEvents = Object.freeze({
    SIGNUP: 'signup',
    FIRST_LOGIN: 'first_login',
    FIRST_TABLE_SEAT: 'first_table_seat',
    FIRST_HAND_PLAYED: 'first_hand_played',
    FIRST_SESSION_30MIN: 'first_session_of_30min',
});

export default { capture, identify, reset, register, FunnelEvents };
