/**
 * Social Feed Cache — IndexedDB + localStorage fallback
 * ─────────────────────────────────────────────────────────────────
 * Provides async, persistent caching for the social feed with:
 *   - IndexedDB primary store (50MB+ capacity, async, non-blocking)
 *   - localStorage fallback (5MB, sync)
 *   - TTL-based expiry per cache key
 *   - Profile avatar cache (persists across navigations)
 *
 * Usage:
 *   import { feedCache } from '@/lib/feedCache';
 *   await feedCache.getPosts()       → cached posts or null
 *   await feedCache.setPosts(posts)  → save to cache
 *   feedCache.getProfile(userId)     → instant profile lookup
 *   feedCache.setProfile(userId, p)  → cache a profile
 */

const DB_NAME = 'sp-social-cache';
const DB_VERSION = 2;
const STORE_FEED = 'feed';
const STORE_PROFILES = 'profiles';
const STORE_STORIES = 'stories';

const FEED_TTL_MS = 5 * 60 * 1000;      // 5 min — show stale while revalidating
const PROFILE_TTL_MS = 60 * 60 * 1000;  // 1 hour — profiles change rarely
const STORIES_TTL_MS = 5 * 60 * 1000;   // 5 min — stories refresh often

// ── IndexedDB setup ───────────────────────────────────────────────
let dbPromise = null;

function openDB() {
    if (dbPromise) return dbPromise;
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);

    dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_FEED)) {
                db.createObjectStore(STORE_FEED, { keyPath: 'key' });
            }
            if (!db.objectStoreNames.contains(STORE_PROFILES)) {
                db.createObjectStore(STORE_PROFILES, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(STORE_STORIES)) {
                db.createObjectStore(STORE_STORIES, { keyPath: 'key' });
            }
        };

        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = () => {
            console.warn('[feedCache] IndexedDB open failed, using localStorage fallback');
            resolve(null);
        };
    });

    return dbPromise;
}

async function idbGet(storeName, key) {
    try {
        const db = await openDB();
        if (!db) return null;
        return new Promise((resolve) => {
            const tx = db.transaction(storeName, 'readonly');
            const req = tx.objectStore(storeName).get(key);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
    } catch { return null; }
}

async function idbSet(storeName, value) {
    try {
        const db = await openDB();
        if (!db) return false;
        return new Promise((resolve) => {
            const tx = db.transaction(storeName, 'readwrite');
            tx.objectStore(storeName).put(value);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => resolve(false);
        });
    } catch { return false; }
}

async function idbGetAll(storeName) {
    try {
        const db = await openDB();
        if (!db) return [];
        return new Promise((resolve) => {
            const tx = db.transaction(storeName, 'readonly');
            const req = tx.objectStore(storeName).getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
        });
    } catch { return []; }
}

// ── In-memory profile cache (resets on page unload, fastest possible) ──
const memProfileCache = new Map();

// ── Public API ────────────────────────────────────────────────────
export const feedCache = {

    // ── Posts ─────────────────────────────────────────────────────
    async getPosts() {
        // 1. Try IndexedDB
        try {
            const entry = await idbGet(STORE_FEED, 'main');
            if (entry && entry.cachedAt && (Date.now() - entry.cachedAt) < FEED_TTL_MS && entry.posts?.length) {
                return { posts: entry.posts, stale: (Date.now() - entry.cachedAt) > 60_000 };
            }
        } catch {}

        // 2. Fallback: localStorage
        try {
            const raw = localStorage.getItem('sp-feed-cache');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed._cachedAt && (Date.now() - parsed._cachedAt) < FEED_TTL_MS && parsed.posts?.length) {
                    return { posts: parsed.posts, stale: (Date.now() - parsed._cachedAt) > 60_000 };
                }
            }
        } catch {}

        return null;
    },

    async setPosts(posts) {
        const entry = { key: 'main', posts, cachedAt: Date.now() };

        // Write to IndexedDB (async, non-blocking)
        idbSet(STORE_FEED, entry).catch(() => {});

        // Also write to localStorage (sync fallback, first 20 posts only)
        try {
            localStorage.setItem('sp-feed-cache', JSON.stringify({
                _cachedAt: Date.now(),
                posts: posts.slice(0, 20),
            }));
        } catch {}
    },

    invalidatePosts() {
        try { localStorage.removeItem('sp-feed-cache'); } catch {}
        idbSet(STORE_FEED, { key: 'main', posts: [], cachedAt: 0 }).catch(() => {});
    },

    // ── Profiles ──────────────────────────────────────────────────
    // Synchronous in-memory first, then IndexedDB background warm
    getProfile(userId) {
        return memProfileCache.get(userId) || null;
    },

    setProfile(userId, profile) {
        memProfileCache.set(userId, profile);
        // Background-persist to IndexedDB
        idbSet(STORE_PROFILES, { ...profile, id: userId, cachedAt: Date.now() }).catch(() => {});
    },

    setProfiles(profileMap) {
        for (const [id, profile] of Object.entries(profileMap)) {
            memProfileCache.set(id, profile);
        }
        // Bulk persist to IndexedDB
        const db = openDB();
        db.then(database => {
            if (!database) return;
            const tx = database.transaction(STORE_PROFILES, 'readwrite');
            const store = tx.objectStore(STORE_PROFILES);
            for (const [id, profile] of Object.entries(profileMap)) {
                store.put({ ...profile, id, cachedAt: Date.now() });
            }
        }).catch(() => {});
    },

    // Warm in-memory cache from IndexedDB on startup
    async warmProfileCache() {
        const now = Date.now();
        const entries = await idbGetAll(STORE_PROFILES);
        let loaded = 0;
        for (const entry of entries) {
            if (entry.cachedAt && (now - entry.cachedAt) < PROFILE_TTL_MS) {
                memProfileCache.set(entry.id, entry);
                loaded++;
            }
        }
        return loaded;
    },

    // ── Stories ───────────────────────────────────────────────────
    async getStories() {
        try {
            const entry = await idbGet(STORE_STORIES, 'main');
            if (entry && entry.cachedAt && (Date.now() - entry.cachedAt) < STORIES_TTL_MS && entry.stories?.length) {
                return entry.stories;
            }
        } catch {}
        try {
            const raw = localStorage.getItem('sp-stories-cache');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed._cachedAt && (Date.now() - parsed._cachedAt) < STORIES_TTL_MS && parsed.stories?.length) {
                    return parsed.stories;
                }
            }
        } catch {}
        return null;
    },

    async setStories(stories) {
        idbSet(STORE_STORIES, { key: 'main', stories, cachedAt: Date.now() }).catch(() => {});
        try {
            localStorage.setItem('sp-stories-cache', JSON.stringify({
                _cachedAt: Date.now(),
                stories: stories.slice(0, 50),
            }));
        } catch {}
    },
};
