/**
 * indexNowPing.mjs
 * Lightweight real-time IndexNow payload builder and ping helper for
 * Smarter.Poker. Wraps src/lib/seo/indexingService.mjs so any route, API
 * handler, or CLI tool can construct a verified IndexNow payload or trigger
 * an immediate multi-engine ping (IndexNow, Bing, Yandex, Naver).
 */
import {
  SITE_ORIGIN,
  INDEXNOW_ENDPOINT,
  INDEXNOW_ENDPOINTS,
  getIndexNowKey,
  submitToIndexNow,
} from './indexingService.mjs';

export {
  SITE_ORIGIN,
  INDEXNOW_ENDPOINT,
  INDEXNOW_ENDPOINTS,
  getIndexNowKey,
};

/**
 * Normalize one or more relative or absolute URLs and build a compliant
 * IndexNow JSON payload using the verified key from public/<key>.txt.
 */
export function buildIndexNowPayload(urls, { key = null } = {}) {
  const activeKey = key || getIndexNowKey();
  const cleanUrls = (Array.isArray(urls) ? urls : [urls])
    .filter(Boolean)
    .map((u) => String(u).trim())
    .filter(Boolean)
    .map((u) => (u.startsWith('http') ? u : `${SITE_ORIGIN}${u.startsWith('/') ? '' : '/'}${u}`))
    .filter((u, idx, arr) => arr.indexOf(u) === idx);

  return {
    host: 'smarter.poker',
    key: activeKey,
    keyLocation: activeKey ? `${SITE_ORIGIN}/${activeKey}.txt` : null,
    urlList: cleanUrls.slice(0, 10000),
  };
}

/**
 * Ping IndexNow endpoints for a single URL or array of URLs.
 */
export async function pingIndexNow(urls, { key = null, dryRun = false } = {}) {
  return submitToIndexNow(urls, { key, dryRun });
}
