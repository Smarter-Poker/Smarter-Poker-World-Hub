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
const SP_SW_VERSION = 'sp-push-v1';

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

    const title = data.title || 'Smarter Poker';
    const url = data.url || '/hub';

    const options = {
        body: data.body || '',
        icon: data.icon || '/notification-icon.png',
        badge: data.badge || '/notification-icon.png',
        // WHERE CLICK NAVIGATION COMES FROM. notificationclick reads this back.
        data: { url, event: data.event || null, outboxId: data.outboxId || null },
        vibrate: data.vibrate || [120, 60, 120],
        requireInteraction: data.requireInteraction === true,
        // CHROME TRAP: showNotification throws TypeError and displays NOTHING
        // when renotify is true without a tag. Never set renotify unconditionally.
        tag: data.tag || undefined,
        renotify: data.tag ? true : false,
        // Max 2 actions render on most platforms.
        actions: Array.isArray(data.actions) ? data.actions.slice(0, 2) : undefined,
        timestamp: data.sentAt || Date.now(),
    };

    event.waitUntil(
        self.registration
            .showNotification(title, options)
            .catch(() => {
                // An older OS may reject an option it does not understand
                // (actions, renotify, timestamp). Degrade rather than show nothing.
                return self.registration.showNotification(title, { body: options.body });
            })
            .then(() => sendReceipt())
            .catch(() => { /* never let a receipt failure surface */ })
    );
});

/**
 * Proof-of-display beacon. See pages/api/push/receipt.js for why this is the
 * only trustworthy signal that a push reached a real screen: push services
 * answer 2xx for endpoints belonging to devices that no longer exist.
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

    // Declining a call must dismiss without yanking the user into the app.
    if (event.action === 'decline') return;

    const url = (event.notification.data && event.notification.data.url) || '/hub';

    event.waitUntil(
        self.clients
            .matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                for (const client of clientList) {
                    if ('focus' in client) {
                        client.focus();
                        if ('navigate' in client && url && !client.url.includes(url)) {
                            try { client.navigate(url); } catch (e) { /* cross-origin guard */ }
                        }
                        return null;
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
// Browsers rotate push subscriptions without warning -- after an OS update,
// a storage purge, or a long idle period. When that happens the old endpoint
// silently dies and the server never finds out, which is exactly the failure
// where "the server shows all-success and the phone gets nothing" comes from.
//
// Re-subscribe immediately and re-register with the server. If the user is
// signed out the POST 401s harmlessly and PushSubscriptionSync repairs it on
// the next sign-in.
// ---------------------------------------------------------------------------
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
                // /api/push/subscribe needs a Bearer JWT from localStorage, which
                // a service worker cannot read. /api/push/rotate accepts the OLD
                // endpoint as proof of device identity instead. See that route's
                // header for the security argument.
                await fetch('/api/push/rotate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        oldEndpoint: (event.oldSubscription && event.oldSubscription.endpoint) || null,
                        endpoint: sub.endpoint,
                        keys: json.keys,
                    }),
                });
                console.log(`[SW ${SP_SW_VERSION}] Push subscription self-healed.`);
            } catch (e) {
                console.warn(`[SW ${SP_SW_VERSION}] Self-heal failed:`, e && e.message);
            }
        })()
    );
});

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = self.atob(base64);
    const output = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
    return output;
}
