/**
 * Coalesce concurrent identical GET requests (2026-11-28 request flood fix).
 *
 * Several surfaces of the stacked Poker Near Me page read the same public
 * feed at the same moment: the page's venue-card live merge and the Live
 * Games feed both ask for /api/poker/live-tables on mount. While one request
 * for a URL is in flight, every other caller shares it, so the browser sends
 * it once. Nothing is cached after it settles: the next call after that is a
 * real request, so freshness is exactly what each caller already asked for.
 *
 * The resolved value mimics the parts of a Response these callers read
 * (`ok`, `status`, `json()`), and `json()` can be called by every sharer.
 */
const inFlight = new Map();

export function fetchShared(url, fetchImpl) {
  const doFetch = fetchImpl || ((u) => fetch(u));
  const key = String(url);
  const existing = inFlight.get(key);
  if (existing) return existing;
  const promise = (async () => {
    try {
      const res = await doFetch(key);
      let body;
      let bodyError = null;
      try {
        body = await res.json();
      } catch (error) {
        bodyError = error;
      }
      return {
        ok: !!res.ok,
        status: res.status,
        json: async () => {
          if (bodyError) throw bodyError;
          return body;
        },
      };
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, promise);
  return promise;
}

export function sharedGetInFlightCount() {
  return inFlight.size;
}
