/**
 * SWR Auto-Cache Middleware (v2)
 * ═══════════════════════════════════════════════════════
 * SWR middleware that automatically persists safe cache keys
 * to localStorage with TTL. Eliminates per-page manual
 * localStorage boilerplate.
 *
 * v2 Improvements:
 *   - Batched writes (100ms microtask queue) — reduces I/O pressure
 *   - Cache size governor (max 50 keys, LRU eviction)
 *   - Cache versioning (auto-clear on deploy)
 *   - LZ compression for payloads > 10KB
 *
 * Usage: Add to SWRConfig `use` array in _app.js:
 *   <SWRConfig value={{ use: [swrCacheMiddleware] }}>
 *
 * ⚠️  Respects UNSAFE_KEY_PATTERNS — financial/auth keys
 *     are NEVER persisted.
 */

import LZString from 'lz-string';
import { recordHit, recordMiss, recordCorruption } from './cacheTelemetry';

const CACHE_PREFIX = 'swr_auto_';
const MAX_AGE_MS = 15 * 60 * 1000;       // 15 minutes
const MAX_CACHE_KEYS = 50;               // LRU eviction cap
const COMPRESS_THRESHOLD = 10 * 1024;    // Compress payloads > 10KB
const BATCH_DELAY_MS = 100;              // Batch writes every 100ms
const CACHE_VERSION = 'v2';              // Bump on breaking cache shape changes
const VERSION_KEY = 'swr_auto_version';

/** Keys that must never be written to persistent storage */
const UNSAFE_KEY_PATTERNS = [
    'balance', 'cashout', 'game-state', 'game_state', 'gamestate',
    'session', 'auth', 'transaction', 'payout', 'chip', 'clawback',
    'settlement', 'wallet', 'withdrawal', 'deposit',
];

function isSafeToCache(key) {
    if (typeof key !== 'string') return false;
    const lower = key.toLowerCase();
    return !UNSAFE_KEY_PATTERNS.some(p => lower.includes(p));
}

function getCacheKey(swrKey) {
    return CACHE_PREFIX + (typeof swrKey === 'string' ? swrKey : JSON.stringify(swrKey));
}

// ═══════════════════════════════════════════════════════════════════════════
// CACHE VERSIONING — auto-clear stale caches on deploy
// ═══════════════════════════════════════════════════════════════════════════
function checkCacheVersion() {
    if (typeof window === 'undefined') return;
    try {
        const stored = localStorage.getItem(VERSION_KEY);
        if (stored !== CACHE_VERSION) {
            // Version mismatch — purge all auto-cache entries
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(CACHE_PREFIX)) {
                    keysToRemove.push(key);
                }
            }
            keysToRemove.forEach(k => localStorage.removeItem(k));
            localStorage.setItem(VERSION_KEY, CACHE_VERSION);
        }
    } catch { /* noop */ }
}

// Run once on module load
if (typeof window !== 'undefined') {
    checkCacheVersion();
}

// ═══════════════════════════════════════════════════════════════════════════
// BATCHED WRITE QUEUE — batch localStorage writes every 100ms
// ═══════════════════════════════════════════════════════════════════════════
const pendingWrites = new Map();
let batchTimer = null;

function flushWrites() {
    if (pendingWrites.size === 0) return;
    const entries = [...pendingWrites.entries()];
    pendingWrites.clear();
    batchTimer = null;

    try {
        for (const [cacheKey, payload] of entries) {
            // Compress large payloads
            if (payload.length > COMPRESS_THRESHOLD) {
                localStorage.setItem(cacheKey, 'lz:' + LZString.compressToUTF16(payload));
            } else {
                localStorage.setItem(cacheKey, payload);
            }
        }

        // Governor: enforce max key count (LRU eviction by oldest _ts)
        enforceMaxKeys();
    } catch {
        // Quota exceeded — silently skip
    }
}

function scheduleBatchWrite(cacheKey, payload) {
    pendingWrites.set(cacheKey, payload);
    if (!batchTimer) {
        batchTimer = setTimeout(flushWrites, BATCH_DELAY_MS);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// CACHE SIZE GOVERNOR — evict oldest entries when over MAX_CACHE_KEYS
// ═══════════════════════════════════════════════════════════════════════════
function enforceMaxKeys() {
    try {
        const cacheEntries = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(CACHE_PREFIX) && key !== VERSION_KEY) {
                try {
                    let raw = localStorage.getItem(key);
                    if (raw && raw.startsWith('lz:')) {
                        raw = LZString.decompressFromUTF16(raw.slice(3));
                    }
                    const parsed = raw ? JSON.parse(raw) : null;
                    cacheEntries.push({ key, ts: parsed?._ts || 0 });
                } catch {
                    // Corrupt entry — mark for removal
                    cacheEntries.push({ key, ts: 0 });
                }
            }
        }

        if (cacheEntries.length <= MAX_CACHE_KEYS) return;

        // Sort by timestamp (oldest first) and remove excess
        cacheEntries.sort((a, b) => a.ts - b.ts);
        const toRemove = cacheEntries.length - MAX_CACHE_KEYS;
        for (let i = 0; i < toRemove; i++) {
            localStorage.removeItem(cacheEntries[i].key);
        }
    } catch { /* noop */ }
}

// ═══════════════════════════════════════════════════════════════════════════
// SWR MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * SWR Middleware — auto-persists response data to localStorage
 * Runs transparently for every SWR hook in the app.
 */
export function swrCacheMiddleware(useSWRNext) {
    return (key, fetcher, config) => {
        const swr = useSWRNext(key, fetcher, config);

        // Only persist on client, for safe keys
        if (typeof window === 'undefined' || !key || !isSafeToCache(typeof key === 'string' ? key : JSON.stringify(key))) {
            return swr;
        }

        // When SWR resolves fresh data, batch-write to localStorage
        if (swr.data !== undefined && !swr.isLoading) {
            try {
                const cacheKey = getCacheKey(key);
                const payload = JSON.stringify({ data: swr.data, _ts: Date.now() });
                // Only cache if payload is reasonable size (< 500KB)
                if (payload.length < 500_000) {
                    scheduleBatchWrite(cacheKey, payload);
                }
            } catch {
                // Serialization error — skip
            }
        }

        return swr;
    };
}

/**
 * Read auto-cached data for a given SWR key.
 * Returns the cached data if fresh, or undefined if expired/missing.
 * Useful for pre-populating SWR fallbackData.
 */
export function getAutoCachedData(swrKey) {
    if (typeof window === 'undefined') return undefined;
    try {
        let raw = localStorage.getItem(getCacheKey(swrKey));
        if (!raw) {
            recordMiss();
            return undefined;
        }
        // Decompress if LZ-compressed
        if (raw.startsWith('lz:')) {
            try { raw = LZString.decompressFromUTF16(raw.slice(3)); } catch {
                // Corrupted compression — self-heal
                localStorage.removeItem(getCacheKey(swrKey));
                recordCorruption();
                return undefined;
            }
        }
        if (!raw) {
            recordMiss();
            return undefined;
        }
        const parsed = JSON.parse(raw);
        if (parsed._ts && (Date.now() - parsed._ts) < MAX_AGE_MS) {
            recordHit();
            return parsed.data;
        }
        // Expired — clean up
        localStorage.removeItem(getCacheKey(swrKey));
    } catch {
        // Corrupted entry — self-heal by removing it
        try { localStorage.removeItem(getCacheKey(swrKey)); } catch { /* noop */ }
        recordCorruption();
    }
    recordMiss();
    return undefined;
}
