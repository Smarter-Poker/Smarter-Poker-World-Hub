// This file is automatically compiled by next-pwa into the final sw.js
//
// HISTORY: Previously contained a force-navigate loop that called
// client.navigate(client.url) on every SW activation. This caused a
// ~20-second auto-refresh death loop on iPad because Safari's aggressive
// SW lifecycle management triggers repeated activations.
//
// White-screen rescue is now handled client-side by:
//   1. _document.js — stale chunk script error listener → nuke SW + reload
//   2. ChunkLoadRecovery.jsx — catches ChunkLoadError → auto-reload (max 2x/60s)
//   3. hmr-reconnect-guard.js — dev-mode HMR death loop breaker
//
// The SW only needs to claim clients so new cache responses take effect.

self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            await self.clients.claim();
            const clients = await self.clients.matchAll({ type: 'window' });
            console.log(`[SW-AntiGravity] Activation complete. Controlled clients: ${clients.length}. No forced refresh — client-side recovery handles stale caches.`);
        })()
    );
});
