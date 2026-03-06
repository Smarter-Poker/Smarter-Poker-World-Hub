/**
 * SWR CACHE PROVIDER — Persistent cross-navigation cache
 * ═══════════════════════════════════════════════════════
 * Wraps the SWR in-memory cache with storage persistence so that
 * display-only data (leaderboards, news, friends, venue lists, etc.)
 * survives Next.js page navigation without re-fetching.
 *
 * Storage strategy:
 *   1. Try localStorage (persists across sessions)
 *   2. Fall back to sessionStorage (survives navigation, works in incognito)
 *   3. Fall back to in-memory only (always works)
 *
 * SAFETY RULES — keys containing these strings are NEVER cached to storage:
 *   balance, cashout, game-state, session, auth, transaction, payout, chip
 *
 * Usage: wrap <SWRConfig value={{ provider: swrLocalStorageProvider }}> in _app.js
 */

const STORAGE_KEY = 'sp_swr_cache_v1';
const MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes — stale entries auto-expire on load

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

/** Returns the best available storage backend, or null if none available */
function getBestStorage() {
  if (typeof window === 'undefined') return null;
  
  // Try localStorage first (persists across browser sessions)
  try {
    localStorage.setItem('_sp_test', '1');
    localStorage.removeItem('_sp_test');
    return localStorage;
  } catch {
    // localStorage blocked (incognito strict mode, quota, security policy)
  }
  
  // Fall back to sessionStorage (works in incognito, survives page nav)
  try {
    sessionStorage.setItem('_sp_test', '1');
    sessionStorage.removeItem('_sp_test');
    return sessionStorage;
  } catch {
    // sessionStorage also blocked — in-memory only
  }
  
  return null;
}

export function swrLocalStorageProvider() {
  if (typeof window === 'undefined') {
    // SSR: return empty in-memory map
    return new Map();
  }

  const storage = getBestStorage();

  // ── Hydrate from storage ───────────────────────────────────────────────
  let initialEntries = [];
  if (storage) {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const now = Date.now();
        // Only restore entries that are still fresh
        initialEntries = parsed.filter(
          ([, v]) => v && v._cachedAt && (now - v._cachedAt) < MAX_AGE_MS
        );
      }
    } catch {
      // Corrupt storage — start fresh
      try { storage.removeItem(STORAGE_KEY); } catch { /* noop */ }
    }
  }

  const map = new Map(initialEntries);

  // ── Persist to storage on page unload ────────────────────────────────
  if (storage) {
    window.addEventListener('beforeunload', () => {
      try {
        const safeEntries = [...map.entries()].filter(([key]) => isSafeToCache(key));
        storage.setItem(STORAGE_KEY, JSON.stringify(safeEntries));
      } catch {
        // Quota exceeded or security error — silently skip
      }
    });
  }

  return map;
}

/** Default SWR config applied globally */
export const SWR_DEFAULTS = {
  // 60s dedup — prevents re-fetch when switching tabs back within a minute
  dedupingInterval: 60_000,
  // 5 min stale TTL — data older than 5min triggers background revalidation
  focusThrottleInterval: 300_000,
  // Don't revalidate on window focus for display-only data
  revalidateOnFocus: false,
  // Keep last known data while revalidating (no flash-to-empty)
  keepPreviousData: true,
  // Surface errors to console but don't throw
  onError: (err, key) => {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[SWR] Error fetching "${key}":`, err?.message || err);
    }
  },
};
