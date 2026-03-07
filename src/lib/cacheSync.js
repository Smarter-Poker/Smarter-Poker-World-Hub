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

const CHANNEL_NAME = 'smarter_poker_cache_sync';

let _bc = null;
function getChannel() {
    if (typeof window === 'undefined') return null;
    if (_bc) return _bc;
    try {
        _bc = new BroadcastChannel(CHANNEL_NAME);
    } catch {
        // BroadcastChannel not supported (e.g., some older browsers)
        return null;
    }
    return _bc;
}

/**
 * Emit a cache invalidation event to all other tabs.
 * @param {string} cacheKey — The localStorage key that was invalidated
 * @param {'invalidate'|'update'} action — What happened
 */
export function emitCacheInvalidation(cacheKey, action = 'invalidate') {
    const bc = getChannel();
    if (!bc) return;
    try {
        bc.postMessage({ type: 'cache_sync', cacheKey, action, ts: Date.now() });
    } catch { /* noop */ }
}

/**
 * Listen for cache invalidation events from other tabs.
 * @param {Function} callback — Called with (cacheKey, action) when another tab invalidates
 * @returns {Function} Unsubscribe function
 */
export function onCacheInvalidation(callback) {
    const bc = getChannel();
    if (!bc) return () => { };
    const handler = (event) => {
        if (event.data?.type === 'cache_sync') {
            callback(event.data.cacheKey, event.data.action);
        }
    };
    bc.addEventListener('message', handler);
    return () => bc.removeEventListener('message', handler);
}
