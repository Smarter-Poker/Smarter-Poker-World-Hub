/**
 * retryAsync — Resilient async wrapper with exponential backoff
 * ═══════════════════════════════════════════════════════════════
 * Ported from Club-Arena SPA hardening (Phase 35).
 *
 * Usage:
 *   const data = await retryAsync(() => apiCall('/api/club-arena/lobby', payload));
 *   const data = await retryAsync(() => fetch(url), { retries: 5, label: 'fetchLobby' });
 */

/**
 * @param {() => Promise<T>} fn — Async function to retry
 * @param {Object} [opts]
 * @param {number} [opts.retries=3] — Max retry attempts
 * @param {number} [opts.baseDelay=500] — Base delay in ms (doubles each retry)
 * @param {string} [opts.label='retryAsync'] — Label for console warnings
 * @returns {Promise<T>}
 * @template T
 */
export default async function retryAsync(fn, opts = {}) {
  const { retries = 3, baseDelay = 500, label = 'retryAsync' } = opts;
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.warn(`[${label}] Attempt ${attempt + 1}/${retries + 1} failed, retrying in ${delay}ms:`, err.message || err);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Debounced bus listener factory — prevents rapid-fire refreshes
 * when multiple EventBus events fire in quick succession.
 *
 * Usage in a useEffect:
 *   const debouncedRefresh = createDebouncedHandler(() => loadData(clubId), 300);
 *   events.forEach(ev => eventBus.on(ev, debouncedRefresh));
 *   return () => { debouncedRefresh.cancel(); events.forEach(ev => eventBus.off(ev, debouncedRefresh)); };
 */
export function createDebouncedHandler(fn, delay = 300) {
  let timer = null;
  const handler = (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, delay);
  };
  handler.cancel = () => {
    if (timer) { clearTimeout(timer); timer = null; }
  };
  return handler;
}
