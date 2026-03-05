/* ═══════════════════════════════════════════════════════════════════════════
   SWR CACHE PROVIDER — Persistent client-side API cache
   Backs SWR's in-memory cache with localStorage so data survives
   soft navigations and tab switches without re-fetching.

   EXCLUDED from cache (always fresh):
   - Financial endpoints: balance, cashout, chips, wallet, ledger
   - Live game state: game-state, hand, engine
   - Auth: session, auth, profile/self

   TTL: 60s for most display data
   ═══════════════════════════════════════════════════════════════════════════ */

const CACHE_KEY = 'swr-cache-v1';
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

// Endpoints that must NEVER be served from cache
const NEVER_CACHE = [
  '/api/financial',
  '/api/chips',
  '/api/cashout',
  '/api/balance',
  '/api/wallet',
  '/api/ledger',
  '/api/game-state',
  '/api/engine',
  '/api/hand/',
  '/api/auth',
  '/api/session',
  '/api/payout',
  '/api/clawback',
  '/api/mint',
];

function isCacheable(key) {
  if (typeof key !== 'string') return false;
  return !NEVER_CACHE.some(blocked => key.includes(blocked));
}

function loadFromStorage() {
  if (typeof window === 'undefined') return new Map();
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw);
    const now = Date.now();
    const map = new Map();
    for (const [key, entry] of Object.entries(parsed)) {
      // Only restore entries that haven't expired
      if (entry.ts && now - entry.ts < CACHE_TTL_MS) {
        map.set(key, entry.data);
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

function saveToStorage(map) {
  if (typeof window === 'undefined') return;
  try {
    const now = Date.now();
    const obj = {};
    for (const [key, data] of map.entries()) {
      if (isCacheable(key)) {
        obj[key] = { data, ts: now };
      }
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(obj));
  } catch {
    // Storage quota or serialization failure — fail silently
  }
}

/**
 * SWR cache provider factory.
 * Usage in _app.js:
 *   <SWRConfig value={{ provider: createSWRCacheProvider }}>
 */
export function createSWRCacheProvider() {
  const map = loadFromStorage();

  // Persist to localStorage whenever the window is about to unload
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => saveToStorage(map));
    // Also persist on visibility change (mobile tab switching)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') saveToStorage(map);
    });
  }

  return map;
}

/**
 * Default SWR config options — apply platform-wide.
 */
export const SWR_DEFAULTS = {
  provider: createSWRCacheProvider,
  revalidateOnFocus: false,       // Don't re-fetch just because user switched tabs
  revalidateOnReconnect: true,    // Re-fetch when network comes back
  dedupingInterval: 60000,        // Dedupe identical requests within 60s
  focusThrottleInterval: 60000,   // Minimum 60s between focus-triggered revalidations
  errorRetryCount: 2,             // Retry failed requests twice
  shouldRetryOnError: true,
};
