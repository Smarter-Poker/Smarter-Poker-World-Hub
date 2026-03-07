/**
 * useCachedFetch — Drop-in SWR wrapper for display-only API data
 * ══════════════════════════════════════════════════════════════
 * Replaces the common pattern:
 *
 *   const [data, setData] = useState([]);
 *   const [loading, setLoading] = useState(true);
 *   useEffect(() => { fetch('/api/...').then(...).then(setData); }, [dep]);
 *
 * With:
 *
 *   const { data, loading, error, refresh } = useCachedFetch('/api/...', { ttl: 60 });
 *
 * ⚠️  DO NOT use for: balances, game state, cashouts, auth checks, or any
 *    data that must reflect server truth within seconds.
 *
 * @param {string|null} url     — API URL. Pass null to disable fetching.
 * @param {object}      options
 *   @param {number}  options.ttl         — Cache TTL in seconds (default 60)
 *   @param {any}     options.fallback    — Value returned while loading (default [])
 *   @param {boolean} options.enabled     — Set false to skip fetch (default true)
 *   @param {object}  options.fetchOptions— Passed to fetch() (headers, etc.)
 * @returns {{ data, loading, error, refresh, isValidating }}
 */

import useSWR from 'swr';

const DEFAULT_TTL_S = 60;

function buildFetcher(fetchOptions = {}) {
  return async (url) => {
    const res = await fetch(url, fetchOptions);
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  };
}

export function useCachedFetch(url, options = {}) {
  const {
    ttl = DEFAULT_TTL_S,
    fallback = [],
    enabled = true,
    fetchOptions = {},
  } = options;

  const fetcher = buildFetcher(fetchOptions);
  const swrKey = enabled && url ? url : null;

  const { data, error, isLoading, isValidating, mutate } = useSWR(swrKey, fetcher, {
    dedupingInterval: ttl * 1000,
    revalidateOnFocus: false,
    keepPreviousData: true,
    fallbackData: fallback,
  });

  return {
    data: data ?? fallback,
    loading: isLoading,
    isValidating,
    error: error || null,
    refresh: () => mutate(),
  };
}

/**
 * useCachedSupabase — SWR wrapper for Supabase queries
 *
 * @param {string}   key      — Unique cache key (e.g. 'friends-list-userId')
 * @param {Function} fetcher  — Async function returning data
 * @param {object}   options  — Same as useCachedFetch options
 */
export function useCachedSupabase(key, fetcher, options = {}) {
  const { ttl = DEFAULT_TTL_S, fallback = [], enabled = true } = options;

  const swrKey = enabled && key ? key : null;

  const { data, error, isLoading, isValidating, mutate } = useSWR(swrKey, fetcher, {
    dedupingInterval: ttl * 1000,
    revalidateOnFocus: false,
    keepPreviousData: true,
    fallbackData: fallback,
  });

  return {
    data: data ?? fallback,
    loading: isLoading,
    isValidating,
    error: error || null,
    refresh: () => mutate(),
  };
}
