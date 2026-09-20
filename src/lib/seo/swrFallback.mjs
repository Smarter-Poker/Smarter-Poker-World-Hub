/**
 * Server-side SWR fallback for the hub's catalogue pages.
 *
 * DISCOVERABILITY PHASE 7 (2026-09-19). A crawl of every sitemap URL as
 * Googlebot found 21 pages serving between 78 and 147 words. The technical
 * SEO on all of them was already correct - one h1, a title, a description, an
 * exact canonical, JSON-LD - but the pages themselves were empty, because
 * their catalogues (articles, videos, reels) were fetched in the browser.
 * /hub/news declared itself the poker news hub and served a crawler no
 * headlines at all.
 *
 * This is the same defect Phase 4 fixed for /hub/commander/venues, and the
 * same fix: fetch the first page on the server and hand it to SWR as a
 * fallback, so the HTML carries the catalogue and the browser still owns
 * every later page, filter and refresh.
 *
 * Keyed by the exact request URL SWR will use. A fallback under the wrong key
 * is silently ignored, which would look like this file doing nothing, so the
 * callers build their key from one shared constant.
 */

const DEFAULT_TIMEOUT_MS = 4000;

/**
 * Fetch one API path on this origin and return an SWR `fallback` map.
 *
 * Never throws and never blocks the page: an API that is slow, down or
 * answering nonsense yields {} and the page renders exactly as it did before
 * this existed. A page that cannot show its catalogue is a worse page; a page
 * that will not render at all is an outage.
 */
export async function swrFallback(origin, path, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!origin || !path) return {};
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${origin}${path}`, {
      signal: ctrl.signal,
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return {};
    const data = await res.json();
    // The shape the client fetcher would have produced. Anything else (an HTML
    // error page parsed as JSON, an envelope with success:false) is not worth
    // seeding: SWR would render it as content.
    if (!data || data.success !== true) return {};
    return { [path]: data };
  } catch {
    return {};
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The cache headers a server-rendered catalogue page wants: quick enough that
 * a crawler sees fresh headlines, long enough that the API is not re-read for
 * every visitor, and always revalidating in the background.
 */
export function catalogueCacheHeaders(res) {
  if (res && typeof res.setHeader === 'function') {
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  }
}
