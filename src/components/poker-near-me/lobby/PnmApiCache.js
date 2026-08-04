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
  const keys = Object.keys(apiCache || {});
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
 * True when an HTTP status is worth retrying.
 *
 * [AUDIT] fetchWithRetry used to throw on ANY !res.ok and then retry with
 * exponential backoff regardless of status. A 400 (invalid GPS coordinates —
 * /api/poker/venues returns exactly this), 404 or 422 was retried three times
 * with 500ms + 1000ms sleeps, so the user waited ~1.5s to be told the request
 * was malformed and the origin took three hits for a deterministic failure.
 * Only 408 (timeout), 429 (rate limited) and 5xx can change on a retry.
 */
function isRetryableStatus(status) {
  if (status === 408 || status === 429) return true;
  return status >= 500;
}

/**
 * Fetch with exponential backoff retry (max 3 attempts).
 * Network/transport errors are always retried; HTTP errors only when the
 * status is retryable.
 */
export async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    let retryable = true;
    try {
      const res = await fetch(url, options);
      if (!res.ok) {
        retryable = isRetryableStatus(res.status);
        const httpErr = new Error(`HTTP ${res.status}`);
        httpErr.status = res.status;
        throw httpErr;
      }
      return await res.json();
    } catch (err) {
      lastError = err;
      // A non-retryable 4xx fails fast — retrying cannot change the answer.
      if (!retryable) break;
      if (attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 500));
      }
    }
  }
  throw lastError;
}

/**
 * Clear cached entries by URL PREFIX (useful after mutations).
 *
 * [AUDIT] This was an exact-key delete, so callers that passed a bare path to
 * "bust the cache for ALL daily-tournament URLs" left every query-string
 * variant ('/api/poker/daily-tournaments?day=Monday', ...) cached and stale.
 * Any key that starts with `urlPrefix` is now removed, which subsumes the old
 * exact-match behaviour.
 */
export function invalidateCache(urlPrefix) {
  if (!urlPrefix) return;
  delete apiCache[urlPrefix];
  Object.keys(apiCache).forEach(k => {
    if (k.startsWith(urlPrefix)) delete apiCache[k];
  });
}

/**
 * Clear all cached entries
 */
export function clearCache() {
  Object.keys(apiCache || {}).forEach(k => delete apiCache[k]);
}
