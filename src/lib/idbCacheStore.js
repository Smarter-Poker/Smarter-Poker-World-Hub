/**
 * IndexedDB Cache Store — Lightweight Wrapper
 * ═══════════════════════════════════════════════════════
 * For caching large payloads that exceed localStorage limits.
 * Used as secondary cache behind localStorage for profile data
 * with many posts/photos.
 *
 * Features:
 *   - Async get/set/delete with TTL
 *   - Falls back gracefully if IndexedDB unavailable
 *   - Auto-cleans expired entries on open
 *
 * Usage:
 *   import { idbGet, idbSet, idbDelete } from './idbCacheStore';
 *   await idbSet('profile:daniel', largeData, 15 * 60 * 1000);
 *   const cached = await idbGet('profile:daniel');
 */

const DB_NAME = 'sp_cache';
const STORE_NAME = 'entries';
const DB_VERSION = 1;

function openDB() {
    return new Promise((resolve, reject) => {
        if (typeof window === 'undefined' || !window.indexedDB) {
            reject(new Error('IndexedDB not available'));
            return;
        }
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'key' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

/**
 * Get a cached entry by key. Returns undefined if missing or expired.
 */
export async function idbGet(key) {
    try {
        const db = await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req = store.get(key);
            req.onsuccess = () => {
                const result = req.result;
                if (!result) { resolve(undefined); return; }
                // TTL check
                if (result.expiresAt && Date.now() > result.expiresAt) {
                    // Expired — clean up async (fire-and-forget)
                    idbDelete(key).catch(() => { });
                    resolve(undefined);
                    return;
                }
                resolve(result.data);
            };
            req.onerror = () => resolve(undefined);
        });
    } catch {
        return undefined;
    }
}

/**
 * Set a cached entry with optional TTL (milliseconds).
 */
export async function idbSet(key, data, ttlMs = 15 * 60 * 1000) {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            store.put({
                key,
                data,
                expiresAt: Date.now() + ttlMs,
                _ts: Date.now(),
            });
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } catch {
        // IndexedDB unavailable — silently skip
    }
}

/**
 * Delete a cached entry by key.
 */
export async function idbDelete(key) {
    try {
        const db = await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            store.delete(key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
        });
    } catch {
        // Silently skip
    }
}

/**
 * Clear all cache entries (useful for logout / cache reset).
 */
export async function idbClear() {
    try {
        const db = await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            store.clear();
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
        });
    } catch {
        // Silently skip
    }
}
