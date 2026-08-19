/**
 * OneSignalSDKWorker.js -- TOMBSTONE.
 *
 * OneSignal was removed from smarter.poker on 2026-08-19. This file used to
 * importScripts() the OneSignal SDK worker, which registered a SECOND service
 * worker on the origin alongside next-pwa's /sw.js. Two workers competing for
 * scope is a known cause of push handlers never firing.
 *
 * The file must keep existing and keep being served: browsers that already
 * installed the old worker fetch this exact URL on their update check. Serving
 * this content makes those stale workers unregister themselves and hand the
 * origin back to /sw.js, which owns the real push subscription.
 *
 * Do not delete this file until the OneSignal worker population has aged out.
 */
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            try {
                await self.registration.unregister();
                const clients = await self.clients.matchAll({ type: 'window' });
                console.log(`[OneSignal tombstone] Unregistered. Clients: ${clients.length}.`);
            } catch (e) {
                console.warn('[OneSignal tombstone] unregister failed:', e && e.message);
            }
        })()
    );
});
