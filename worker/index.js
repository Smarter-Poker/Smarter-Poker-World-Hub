// This file is automatically compiled by next-pwa into the final sw.js
// We use this custom worker injection to detect marooned clients currently stuck
// in a React crash (white screen) loop due to obsolete offline caches.

self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            // Wait for this service worker to claim all controlling clients
            await self.clients.claim();

            // Get all visible window clients controlled by this service worker
            const clients = await self.clients.matchAll({ type: 'window' });

            console.log(`[SW-AntiGravity] Activation complete. Controlled clients: ${clients.length}`);

            for (const client of clients) {
                // FORCE NAVIGATE: The only way to rescue a client stuck with an old
                // buggy HTML cache is to force the Service Worker to navigate their tab.
                // client.navigate(url) bypasses the need for the client to listen to postMessage.
                try {
                    console.log(`[SW-AntiGravity] Forcing client ${client.id} to refresh (${client.url})`);
                    await client.navigate(client.url);
                } catch (err) {
                    console.error(`[SW-AntiGravity] Failed to force-navigate client ${client.id}:`, err);
                }
            }
        })()
    );
});
