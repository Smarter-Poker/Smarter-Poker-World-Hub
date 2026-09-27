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
 *   await feedCache.getPosts(userId)       → cached posts or null
 *   await feedCache.setPosts(posts, userId) → save to cache
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
const FEED_CONTRACT_VERSION = 5;
const STORIES_CONTRACT_VERSION = 2;
const FEED_CACHE_MAX_POSTS = 100;
const STORIES_CACHE_MAX_ITEMS = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function viewerKey(viewerId) {
    const value = String(viewerId || '').trim().toLowerCase();
    return UUID_RE.test(value) ? value : 'anon';
}

function feedEntryKey(viewerId) {
    return `main:${viewerKey(viewerId)}`;
}

function feedLocalStorageKey(viewerId) {
    return `sp-feed-cache:${viewerKey(viewerId)}`;
}

function storiesEntryKey(viewerId) {
    return `main:${viewerKey(viewerId)}`;
}

function storiesLocalStorageKey(viewerId) {
    return `sp-stories-cache:${viewerKey(viewerId)}`;
}

export function isManagedVideoLibraryPost(post) {
    return post?.origin_type === 'video_library'
        || Boolean(post?.source_asset_id)
        || String(post?.publication_key || '').startsWith('video-library:')
        || Boolean(post?.metadata?.video_library_id);
}

function cacheSafePosts(posts) {
    // Availability can expire while a browser is offline. Managed library
    // posts therefore never persist across sessions; they must come from a
    // fresh canonical server response on every visit.
    return (Array.isArray(posts) ? posts : [])
        .filter(post => !isManagedVideoLibraryPost(post) && post?.playback_type !== 'youtube_embed')
        .map(post => ({
            ...post,
            // Never persist an optimistic interaction decision. A stale true
            // is dangerous because the next click becomes an unintended
            // unlike/unbookmark. Live hydration replaces these safe defaults.
            isLiked: false,
            isBookmarked: false,
            reactions: [],
            _interactionStateVerified: false,
        }));
}

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

async function idbDelete(storeName, key) {
    try {
        const db = await openDB();
        if (!db) return false;
        return new Promise((resolve) => {
            const tx = db.transaction(storeName, 'readwrite');
            tx.objectStore(storeName).delete(key);
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

function observeCachePersistence(operation, persistencePromise) {
    void persistencePromise.then((persisted) => {
        // IndexedDB absence is the expected localStorage-only fallback (SSR,
        // private browsing). A real IndexedDB failure remains observable.
        if (!persisted && typeof indexedDB !== 'undefined') {
            console.warn(`[feedCache] ${operation} could not be persisted`);
        }
    });
}

// ── In-memory profile cache (resets on page unload, fastest possible) ──
const memProfileCache = new Map();

// ── Public API ────────────────────────────────────────────────────
export const feedCache = {

    // ── Posts ─────────────────────────────────────────────────────
    async getPosts(viewerId = null) {
        const entryKey = feedEntryKey(viewerId);
        const storageKey = feedLocalStorageKey(viewerId);
        try { localStorage.removeItem('sp-feed-cache'); } catch { /* retire the pre-identity cache */ }
        // 1. Try IndexedDB
        try {
            const entry = await idbGet(STORE_FEED, entryKey);
            if (
                entry
                && entry.contractVersion === FEED_CONTRACT_VERSION
                && entry.cachedAt
                && (Date.now() - entry.cachedAt) < FEED_TTL_MS
                && entry.posts?.length
            ) {
                const safePosts = cacheSafePosts(entry.posts);
                return {
                    posts: safePosts.slice(0, FEED_CACHE_MAX_POSTS),
                    stale: (Date.now() - entry.cachedAt) > 60_000,
                };
            }
            if (entry) {
                observeCachePersistence('retire incompatible feed entry', idbSet(STORE_FEED, {
                    key: entryKey,
                    posts: [],
                    cachedAt: 0,
                    contractVersion: FEED_CONTRACT_VERSION,
                }));
            }
        } catch (error) {
            console.warn('[feedCache] IndexedDB feed read failed:', error?.message || error);
        }

        // 2. Fallback: localStorage
        try {
            const raw = localStorage.getItem(storageKey);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (
                    parsed._contractVersion === FEED_CONTRACT_VERSION
                    && parsed._cachedAt
                    && (Date.now() - parsed._cachedAt) < FEED_TTL_MS
                    && parsed.posts?.length
                ) {
                    const safePosts = cacheSafePosts(parsed.posts);
                    return {
                        posts: safePosts.slice(0, FEED_CACHE_MAX_POSTS),
                        stale: (Date.now() - parsed._cachedAt) > 60_000,
                    };
                }
                localStorage.removeItem(storageKey);
            }
        } catch (error) {
            console.warn('[feedCache] localStorage feed read failed:', error?.message || error);
        }

        return null;
    },

    async setPosts(posts, viewerId = null) {
        const safePosts = cacheSafePosts(posts);
        const boundedPosts = safePosts.slice(0, FEED_CACHE_MAX_POSTS);
        const entryKey = feedEntryKey(viewerId);
        const storageKey = feedLocalStorageKey(viewerId);
        const entry = {
            key: entryKey,
            posts: boundedPosts,
            cachedAt: Date.now(),
            contractVersion: FEED_CONTRACT_VERSION,
        };

        // Write to IndexedDB (async, non-blocking)
        observeCachePersistence('feed entry', idbSet(STORE_FEED, entry));

        // Also write to localStorage (sync fallback, first 20 posts only)
        try {
            localStorage.setItem(storageKey, JSON.stringify({
                _cachedAt: Date.now(),
                _contractVersion: FEED_CONTRACT_VERSION,
                posts: boundedPosts.slice(0, 20),
            }));
        } catch (error) {
            console.warn('[feedCache] localStorage feed write failed:', error?.message || error);
        }
    },

    invalidatePosts(viewerId = null) {
        const entryKey = feedEntryKey(viewerId);
        try {
            localStorage.removeItem(feedLocalStorageKey(viewerId));
            localStorage.removeItem('sp-feed-cache');
        } catch { /* storage may be unavailable */ }
        return idbSet(STORE_FEED, { key: entryKey, posts: [], cachedAt: 0 });
    },

    // ── Profiles ──────────────────────────────────────────────────
    // Synchronous in-memory first, then IndexedDB background warm
    getProfile(userId) {
        return memProfileCache.get(userId) || null;
    },

    setProfile(userId, profile) {
        memProfileCache.set(userId, profile);
        // Background-persist to IndexedDB
        observeCachePersistence(
            'profile entry',
            idbSet(STORE_PROFILES, { ...profile, id: userId, cachedAt: Date.now() })
        );
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
        }).catch((error) => {
            console.warn('[feedCache] IndexedDB profile batch failed:', error?.message || error);
        });
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
    async getStories(viewerId = null) {
        const entryKey = storiesEntryKey(viewerId);
        const storageKey = storiesLocalStorageKey(viewerId);
        // Retire caches written before viewer scoping. Story audience and view
        // state must never bleed between signed-in identities.
        try { localStorage.removeItem('sp-stories-cache'); } catch { /* storage may be unavailable */ }
        observeCachePersistence('retire unscoped Story entry', idbDelete(STORE_STORIES, 'main'));
        try {
            const entry = await idbGet(STORE_STORIES, entryKey);
            if (
                entry
                && entry.contractVersion === STORIES_CONTRACT_VERSION
                && entry.cachedAt
                && (Date.now() - entry.cachedAt) < STORIES_TTL_MS
                && entry.stories?.length
            ) {
                return entry.stories.slice(0, STORIES_CACHE_MAX_ITEMS);
            }
        } catch (error) {
            console.warn('[feedCache] IndexedDB Story read failed:', error?.message || error);
        }
        try {
            const raw = localStorage.getItem(storageKey);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (
                    parsed._contractVersion === STORIES_CONTRACT_VERSION
                    && parsed._cachedAt
                    && (Date.now() - parsed._cachedAt) < STORIES_TTL_MS
                    && parsed.stories?.length
                ) {
                    return parsed.stories.slice(0, STORIES_CACHE_MAX_ITEMS);
                }
            }
        } catch (error) {
            console.warn('[feedCache] localStorage Story read failed:', error?.message || error);
        }
        return null;
    },

    async setStories(stories, viewerId = null) {
        const safeStories = Array.isArray(stories) ? stories.filter(Boolean) : [];
        const boundedStories = safeStories.slice(0, STORIES_CACHE_MAX_ITEMS);
        const entryKey = storiesEntryKey(viewerId);
        const storageKey = storiesLocalStorageKey(viewerId);
        observeCachePersistence('Story entry', idbSet(STORE_STORIES, {
            key: entryKey,
            stories: boundedStories,
            cachedAt: Date.now(),
            contractVersion: STORIES_CONTRACT_VERSION,
        }));
        try {
            localStorage.setItem(storageKey, JSON.stringify({
                _cachedAt: Date.now(),
                _contractVersion: STORIES_CONTRACT_VERSION,
                stories: boundedStories,
            }));
        } catch { /* quota/security leaves the bounded IndexedDB copy as the primary cache */ }
    },
};
