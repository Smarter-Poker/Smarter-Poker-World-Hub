/**
 * Cross-Tab Cache Sync — BroadcastChannel-based invalidation
 * ═══════════════════════════════════════════════════════════
 * When one tab invalidates or updates a profile cache, all
 * other tabs with the same profile open receive the event
 * and can react (e.g., re-fetch or update their local state).
 *
 * Usage:
 *   import { emitCacheInvalidation, onCacheInvalidation } from './cacheSync';
 *   emitCacheInvalidation('sp-profile-cache-daniel');
 *   const unsub = onCacheInvalidation((cacheKey) => { ... });
 *   unsub(); // cleanup
 */

import { broadcastSync, listenBroadcast } from './broadcastSync';

const CHANNEL_NAME = 'smarter_poker_cache_sync';

/**
 * Emit a cache invalidation event to all other tabs.
 * @param {string} cacheKey — The localStorage key that was invalidated
 * @param {'invalidate'|'update'} action — What happened
 */
export function emitCacheInvalidation(cacheKey, action = 'invalidate') {
    broadcastSync(CHANNEL_NAME, { type: 'cache_sync', cacheKey, action, ts: Date.now() });
}

/**
 * Listen for cache invalidation events from other tabs.
 * @param {Function} callback — Called with (cacheKey, action) when another tab invalidates
 * @returns {Function} Unsubscribe function
 */
export function onCacheInvalidation(callback) {
    return listenBroadcast(CHANNEL_NAME, (msg) => {
        // msg is event.data — could be raw object or JSON-wrapped
        const data = typeof msg === 'object' ? msg : {};
        if (data?.type === 'cache_sync') {
            callback(data.cacheKey, data.action);
        }
    });
}
