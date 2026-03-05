/* ═══════════════════════════════════════════════════════════════════════════
   SWR FETCHER UTILITY
   Standard fetcher for useSWR across the platform.
   Throws on non-OK responses so SWR error handling works correctly.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Standard JSON fetcher for useSWR.
 * Usage: const { data, error, isLoading } = useSWR('/api/my-endpoint', swrFetcher);
 */
export async function swrFetcher(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const err = new Error(`API error: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/**
 * SWR fetcher that extracts a specific key from the response.
 * Usage: useSWR('/api/endpoint', (url) => swrExtractFetcher(url, 'data'))
 */
export function swrExtractFetcher(key) {
  return async (url) => {
    const data = await swrFetcher(url);
    return data[key] ?? data;
  };
}

export default swrFetcher;
