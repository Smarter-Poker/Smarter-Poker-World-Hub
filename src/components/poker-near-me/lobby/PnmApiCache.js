/**
 * PNM API Cache & Retry Utilities
 * Shared across poker-near-me.js and poker-near-me-lobby.js
 * Extracted to reduce bundle duplication (~50 lines each page saved)
 */

// ─── Constants ───
export const API_CACHE_TTL = 60000; // 60 seconds
export const API_CACHE_MAX_ENTRIES = 50;
export const SEARCH_DEBOUNCE_MS = 400;
export const PAGE_SIZE = 50;
export const LIVE_REFRESH_MS = 120000; // 2 minutes

// ─── API Cache with TTL Expiry ───
const apiCache = {};
// [GAP 1.5 FIX] In-flight promise deduplication — prevents duplicate HTTP requests
// when multiple components call cachedFetch for the same URL simultaneously
const inflight = {};

/**
 * Fetch with in-memory cache + TTL. Prevents duplicate requests
 * and evicts stale entries to avoid memory leaks.
 */
export function cachedFetch(url, ttl = API_CACHE_TTL) {
  const now = Date.now();
  if (apiCache[url] && (now - apiCache[url].time) < ttl) {
    return Promise.resolve(apiCache[url].data);
  }
  // [GAP 1.5] Return existing in-flight promise if one exists
  if (inflight[url]) return inflight[url];
  // Evict stale entries to prevent unbounded growth
  const keys = Object.keys(apiCache);
  if (keys.length > API_CACHE_MAX_ENTRIES) {
    keys.sort((a, b) => apiCache[a].time - apiCache[b].time);
    keys.slice(0, keys.length - API_CACHE_MAX_ENTRIES + 10).forEach(k => delete apiCache[k]);
  }
  const promise = fetch(url).then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }).then(data => {
    // [GAP 1.2 FIX] Timestamp AFTER fetch resolves, not before
    apiCache[url] = { data, time: Date.now() };
    return data;
  }).finally(() => {
    delete inflight[url];
  });
  inflight[url] = promise;
  return promise;
}

/**
 * Fetch with exponential backoff retry (max 3 attempts)
 */
export async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 500));
      }
    }
  }
  throw lastError;
}

/**
 * Clear a specific URL from the cache (useful after mutations)
 */
export function invalidateCache(url) {
  delete apiCache[url];
}

/**
 * Clear all cached entries
 */
export function clearCache() {
  Object.keys(apiCache).forEach(k => delete apiCache[k]);
}
