/* eslint-disable no-restricted-globals */
/**
 * worker/index.js -- CUSTOM SERVICE WORKER LOGIC
 *
 * next-pwa compiles this file to public/worker-<hash>.js at build time and
 * importScripts() it from the generated public/sw.js. That indirection matters:
 * public/sw.js is GENERATED and GITIGNORED, so hand-editing it is impossible --
 * every push handler must live here.
 *
 * SCOPE: sw.js is emitted at the site root, so this worker controls the whole
 * origin. A service worker at /api/sw.js would only control /api/* and push
 * would never fire on a page.
 *
 * DEV NOTE: next-pwa runs with `disable: !process.env.VERCEL`, so there is NO
 * service worker on localhost. Push can only be exercised on a Vercel
 * deployment (preview or production).
 *
 * BUMP THIS when changing push behaviour so devices pick up the new worker.
 */
const SP_SW_VERSION = 'sp-push-v5-authenticated-rotation';

// ---------------------------------------------------------------------------
// Activation. Claim clients so a fresh worker takes over without a reload.
// HISTORY: this file previously contained a force-navigate loop that called
// client.navigate(client.url) on every activation, which caused a ~20-second
// auto-refresh death loop on iPad because Safari re-activates aggressively.
// White-screen rescue is handled client-side instead:
//   1. _document.js  -- stale chunk error listener -> nuke SW + reload
//   2. ChunkLoadRecovery.jsx -- catches ChunkLoadError -> auto-reload
//   3. hmr-reconnect-guard.js -- dev-mode HMR death loop breaker
// ---------------------------------------------------------------------------
// Activate a new worker immediately instead of queueing behind the old one.
//
// Without this, a freshly deployed worker sits in `waiting` until every tab of
// the site is closed. Combined with navigator.serviceWorker.ready — which waits
// for a worker to CONTROL the page — that produced "Service worker startup
// timed out" when enabling push, because the worker the page was waiting on
// was never going to activate while the page itself was open.
self.addEventListener('install', () => {
    self.skipWaiting();
});

// A worker installed BEHIND an older one that predates skipWaiting will still
// sit in `waiting`, because the old worker never yields and this new one's
// skipWaiting above already ran during ITS install. The page reaches across
// and asks explicitly. Without this, the very fix for a stuck worker cannot
// deploy, because it lives inside the worker that is stuck.
self.addEventListener('message', (event) => {
    if (event?.data?.type === 'SP_SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            await self.clients.claim();
            const clients = await self.clients.matchAll({ type: 'window' });
            console.log(`[SW ${SP_SW_VERSION}] Activated. Controlled clients: ${clients.length}.`);
        })()
    );
});

// ---------------------------------------------------------------------------
// PUSH. This is the handler that puts a banner on a locked phone.
// ---------------------------------------------------------------------------
/**
 * TITLE CASE, APPLIED WHERE THE NOTIFICATION IS ACTUALLY RENDERED.
 *
 * Dan, 2026-08-30: "the first letter of every word should be capitalized
 * inside the push notifications."
 *
 * This is the same house rule Club Arena already applies to popups
 * (club-arena src/utils/popupStyle.ts, Dan 2026-08-20), and it is enforced the
 * same way: in the render path, not as a convention call sites are asked to
 * remember. Push copy is written by BOTH repos plus a dozen crons and database
 * triggers — the seat offers from the engine, the money notifications from
 * Postgres, the health alerts from /api/cron/push-health. Every one of those
 * would have to remember, forever. This function is the single place all of
 * them pass through.
 *
 * Interior capitals are preserved, so the acronyms this platform is made of
 * survive: NLH, PLO4, VIP, BBJ, MTT, 6-Max come through untouched rather than
 * being flattened to Nlh / Plo4 / Vip.
 *
 * THE `(s)` CARVE-OUT. A plural suffix is not a word. Dan's own screenshot had
 * "3 zombie subscription(s) across 1 user(s)", and a naive rule that treats
 * "(" as a word boundary renders that "Subscription(S) ... User(S)", which is
 * worse than the lowercase it replaced. So an opening bracket only starts a
 * word when a space starts it too.
 *
 * DELIBERATELY NO LOOKBEHIND. `(?<!...)` would express the carve-out in one
 * regex, and it is supported on Dan's iOS 18.7 — but a regex literal is parsed
 * when the SERVICE WORKER SCRIPT IS EVALUATED, so on any engine that lacks it
 * the whole worker fails to install. That is precisely the outage this file
 * spent 2026-08-29 recovering from: a worker that cannot install takes web push
 * down for the entire origin, silently. Two plain regexes cost nothing and
 * cannot do that. (Negative LOOKAHEAD, added below, is not the same hazard —
 * `(?!...)` has been in the language since ES3 and is supported everywhere a
 * service worker runs at all.)
 *
 * ── A WORD WITH A DIGIT IN IT IS A NAME, NOT A WORD (2026-09-07) ───────────
 * The Estate Digest of 2026-09-07 arrived as:
 *
 *     "Production Serves Main Exactly (A224b68ae). | Club Arena: 100+ Commits
 *      To Main, 3270 Workflow Runs..."
 *
 * `a224b68ae` is a git commit. Capitalising it does not style the sentence, it
 * CHANGES AN IDENTIFIER — the reader cannot paste it into `git show`, and the
 * only reason it was reachable is that the `(s)` carve-out requires a space
 * before "(", which " (a224b68ae)" happens to have.
 *
 * The general rule underneath it: if a run of characters contains a digit it is
 * a name — a SHA, a version, a table id, a hand number — and names are not
 * title cased. Ordinary copy is unaffected, because ordinary English words do
 * not contain digits, and tokens that START with a digit (`100+`, `3270`) were
 * already untouched since the rules only fire on `[a-z]`.
 *
 * ── AND IT IS APPLIED IN BOTH WORKERS ─────────────────────────────────────
 * This origin has TWO push-capable service workers: this one, registered at
 * `/sw.js` by Club Arena's pushClient, and `public/push/sw.js`, registered at
 * `/push/sw.js` by the World Hub. `public/push/sw.js` was forked out on
 * 2026-08-25 to escape a next-pwa precache hang, and this rule — added five
 * days later — was never applied to the fork. On 2026-09-07 one device holding
 * a live subscription for each of them received the SAME digest twice, one
 * copy title cased and one not, and the mismatch is what proved there were two
 * registrations rather than a double send. (The duplicate itself is fixed in
 * `pages/api/push/rotate.js`; this half is the divergence.)
 *
 * The block below is byte-identical in both files and pinned that way by
 * `__tests__/push-title-case.test.mjs`, which now reads BOTH. Two copies that
 * a test compares are honest; two copies nothing compares is how this happened.
 */
/* TITLE_CASE_SHARED_BEGIN — byte-identical in public/push/sw.js.
   `__tests__/push-title-case.test.mjs` extracts this block from BOTH files and
   fails if they differ. See the note about the fork below. */
const TITLE_CASE_WORD_START = /(^|[\s[{"'‘“-])([a-z])(?![A-Za-z0-9]*[0-9])/g;
const TITLE_CASE_BRACKET_WORD = /(^|\s)\(([a-z])(?![A-Za-z0-9]*[0-9])/g;

function toTitleCase(text) {
    if (typeof text !== 'string' || text === '') return text;
    try {
        return text
            .replace(TITLE_CASE_WORD_START, (_m, lead, letter) => lead + letter.toUpperCase())
            .replace(TITLE_CASE_BRACKET_WORD, (_m, lead, letter) => lead + '(' + letter.toUpperCase());
    } catch (e) {
        // If anything in here ever throws, the notification must still be
        // shown. Unstyled copy beats no notification.
        return text;
    }
}
/* TITLE_CASE_SHARED_END */

self.addEventListener('push', (event) => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch (e) {
        // Non-JSON payload (some providers send plain text on test sends).
        try {
            data = { title: 'Smarter Poker', body: event.data ? event.data.text() : '' };
        } catch (e2) {
            data = { title: 'Smarter Poker', body: '' };
        }
    }

    // Same display restriction as /push/sw.js for legacy root subscriptions.
    // Old provider payloads must not restore private text through this worker.
    const details = data?.data && typeof data.data === 'object' ? data.data : {};
    const accounting = data?.event === 'accounting_invoice' || details.event === 'accounting_invoice' ||
        data?.accountingNotificationId != null || details.accountingNotificationId != null ||
        (typeof data?.tag === 'string' && data.tag.startsWith('accounting:'));
    if (accounting) {
        data = {
            title: 'New Accounting Notice', body: 'Open Smarter Poker To View',
            url: data.url || '/hub/messenger', tag: data.tag || undefined, renotify: false,
            icon: '/notification-icon.png', badge: '/notification-icon.png',
            event: 'accounting_invoice', outboxId: details.outboxId ?? data.outboxId,
            accountingNotificationId: details.accountingNotificationId ?? data.accountingNotificationId,
        };
    }

    const title = toTitleCase(data.title || 'Smarter Poker');
    const url = data.url || '/hub';

    const options = {
        body: toTitleCase(data.body || ''),
        icon: data.icon || '/notification-icon.png',
        badge: data.badge || '/notification-icon.png',
        // Large hero image. Chrome/Android only; every other platform ignores
        // the field, and the showNotification fallback below already covers an
        // OS that rejects an option it does not understand.
        image: data.image || undefined,
        // WHERE CLICK NAVIGATION COMES FROM. notificationclick reads this back.
        data: { url, event: data.event || null, outboxId: data.outboxId || null,
            accountingNotificationId: data.accountingNotificationId || null },
        vibrate: data.vibrate || [120, 60, 120],
        requireInteraction: data.requireInteraction === true,
        // CHROME TRAP: showNotification throws TypeError and displays NOTHING
        // when renotify is true without a tag. Never set renotify unconditionally.
        tag: data.tag || undefined,
        renotify: data.renotify === false ? false : data.tag ? true : false,
        // Max 2 actions render on most platforms.
        actions: Array.isArray(data.actions) ? data.actions.slice(0, 2) : undefined,
        timestamp: data.sentAt || Date.now(),
    };

    event.waitUntil(
        self.registration
            .showNotification(title, options)
            .then(() => {
                // App-icon badge (installed PWA). Best-effort: unsupported on
                // several platforms, and a badge failure must never swallow the
                // notification that already displayed.
                try {
                    if (typeof data.badgeCount === 'number' && self.navigator && self.navigator.setAppBadge) {
                        self.navigator.setAppBadge(data.badgeCount).catch(() => {});
                    } else if (self.navigator && self.navigator.setAppBadge) {
                        self.navigator.setAppBadge().catch(() => {});
                    }
                } catch (e) { /* ignore */ }

                // Tell any open tab a notification landed so the header bell and
                // unread badge update instantly instead of waiting for their
                // polling interval.
                return self.clients.matchAll({ type: 'window', includeUncontrolled: true })
                    .then((cs) => {
                        for (const c of cs) {
                            try {
                                c.postMessage({
                                    type: 'SP_PUSH_RECEIVED',
                                    event: data.event || null,
                                    url: url,
                                });
                            } catch (e) { /* ignore */ }
                        }
                    })
                    .catch(() => {});
            })
            .catch(() => {
                // An older OS may reject an option it does not understand
                // (actions, renotify, timestamp). Degrade rather than show nothing.
                return self.registration.showNotification(title, {
                    body: options.body, data: options.data, tag: options.tag, renotify: false,
                });
            })
            .then(() => sendReceipt())
            .catch(() => { /* never let a receipt failure surface */ })
    );
});

/**
 * Best-effort worker acknowledgment after showNotification resolves. This is
 * endpoint telemetry, not actor-bound receipt or proof a human saw the banner.
 */
function sendReceipt() {
    return self.registration.pushManager
        .getSubscription()
        .then((sub) => {
            if (!sub) return null;
            return fetch('/api/push/receipt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ endpoint: sub.endpoint }),
                credentials: 'same-origin',
                keepalive: true,
            });
        })
        .catch(() => null);
}

// ---------------------------------------------------------------------------
// CLICK. This is what makes notifications deep-linkable.
// ---------------------------------------------------------------------------
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    // Opening a notification means the user has seen it -- clear the app badge.
    try {
        if (self.navigator && self.navigator.clearAppBadge) {
            self.navigator.clearAppBadge().catch(() => {});
        }
    } catch (e) { /* ignore */ }

    // Declining a call must dismiss without yanking the user into the app.
    if (event.action === 'decline') return;

    const url = (event.notification.data && event.notification.data.url) || '/hub';

    event.waitUntil(
        self.clients
            .matchAll({ type: 'window', includeUncontrolled: true })
            .then(async (clientList) => {
                for (const client of clientList) {
                    if ('focus' in client) {
                        if (url && !sameDestination(client.url, url)) {
                            if ('navigate' in client) {
                                try {
                                    const navigated = await client.navigate(url);
                                    if (navigated) return navigated.focus();
                                } catch (e) { /* open the exact destination below */ }
                            }
                            return self.clients.openWindow ? self.clients.openWindow(url) : null;
                        }
                        return client.focus();
                    }
                }
                if (self.clients.openWindow) return self.clients.openWindow(url);
                return null;
            })
            .catch(() => null)
    );
});

// ---------------------------------------------------------------------------
// SUBSCRIPTION SELF-HEAL.
//
// Local subscription recovery does not authenticate an account. The rotation
// route now refuses sessionless requests without writes. Foreground enrollment
// remains recovery; client-held binding is required before background rotation
// can safely become automatic again. Never describe a refused request as healed.
self.addEventListener('pushsubscriptionchange', (event) => {
    event.waitUntil(
        (async () => {
            try {
                const res = await fetch('/api/push/vapid-public-key', { credentials: 'same-origin' });
                if (!res.ok) return;
                const { key } = await res.json();
                if (!key) return;

                const sub = await self.registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(key),
                });

                const json = sub.toJSON();
                // Old keys prove subscription possession, not the current account.
                // No bearer is persisted in the worker. A 401 is a real refusal.
                let oldKeys = null;
                try {
                    if (event.oldSubscription && typeof event.oldSubscription.toJSON === 'function') {
                        oldKeys = event.oldSubscription.toJSON().keys || null;
                    }
                } catch (e) { /* Safari may not populate oldSubscription */ }

                const rotationResponse = await fetch('/api/push/rotate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        oldEndpoint: (event.oldSubscription && event.oldSubscription.endpoint) || null,
                        endpoint: sub.endpoint,
                        keys: json.keys,
                        oldKeys,
                    }),
                });
                if (!rotationResponse.ok) {
                    console.warn('[push] Rotation unconfirmed; authenticated enrollment is required.');
                    return;
                }
                const outcome = await rotationResponse.json();
                const receipt = outcome && outcome.receipt;
                if (outcome.ok !== true || outcome.rotated !== true || !receipt ||
                    receipt.schema_version !== 1 || receipt.success !== true ||
                    receipt.old_endpoint !== (event.oldSubscription && event.oldSubscription.endpoint) ||
                    receipt.endpoint !== sub.endpoint || receipt.transport !== 'webpush') {
                    console.warn('[push] Rotation receipt unconfirmed; authenticated enrollment is required.');
                    return;
                }
                console.log('[push] Server confirmed subscription rotation.');
            } catch (e) {
                console.warn(`[SW ${SP_SW_VERSION}] Self-heal failed:`, e && e.message);
            }
        })()
    );
});

/**
 * True when an open client is already at the full notification destination.
 * Falls back to false (i.e. navigate) if either URL cannot be parsed -- taking
 * the user somewhere is better than a tap that appears to do nothing.
 */
function sameDestination(clientUrl, targetUrl) {
    try {
        const a = new URL(clientUrl, self.location.origin);
        const b = new URL(targetUrl, self.location.origin);
        return a.origin === b.origin && a.pathname.replace(/\/+$/, '') === b.pathname.replace(/\/+$/, '') &&
            a.search === b.search && a.hash === b.hash;
    } catch (e) {
        return false;
    }
}

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = self.atob(base64);
    const output = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
    return output;
}
