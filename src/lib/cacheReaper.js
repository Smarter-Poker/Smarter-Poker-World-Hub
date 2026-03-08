/**
 * Stale Cache Reaper
 * ═══════════════════════════════════════════════════════
 * Runs once per session during requestIdleCallback.
 * Scans localStorage for sp-* and swr_auto_* keys,
 * deleting entries older than MAX_AGE_MS (30 minutes).
 *
 * Prevents unbounded localStorage growth and ensures
 * users never see extremely stale data.
 */

import { recordEviction } from './cacheTelemetry';

const MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes
const REAPED_KEY = 'sp-cache-reaped';

/**
 * Reap stale caches from localStorage.
 * Safe to call multiple times — only runs once per session.
 */
export function reapStaleCaches() {
    if (typeof window === 'undefined') return;

    // Only reap once per session
    try {
        if (sessionStorage.getItem(REAPED_KEY)) return;
        sessionStorage.setItem(REAPED_KEY, '1');
    } catch { /* noop */ }

    const schedule = window.requestIdleCallback || ((cb) => setTimeout(cb, 500));

    schedule(() => {
        const now = Date.now();
        const keysToReap = [];

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key) continue;

            // Only target our cache keys
            if (!key.startsWith('sp-') && !key.startsWith('swr_auto_')) continue;

            // Skip non-cache keys
            if (key === 'sp-offline-queue' || key === 'sp-cache-warmed') continue;

            try {
                const raw = localStorage.getItem(key);
                if (!raw) continue;
                const parsed = JSON.parse(raw);

                // Check _cachedAt or _ts for staleness
                const ts = parsed._cachedAt || parsed._ts || 0;
                if (ts > 0 && (now - ts) > MAX_AGE_MS) {
                    keysToReap.push(key);
                }
            } catch {
                // Corrupted entry — reap it
                keysToReap.push(key);
            }
        }

        if (keysToReap.length > 0) {
            keysToReap.forEach(k => {
                localStorage.removeItem(k);
                recordEviction();
            });
        }
    });
}
