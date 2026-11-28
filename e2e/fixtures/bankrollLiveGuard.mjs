/**
 * Read-only guard for the bankroll-live production suite.
 *
 * The suite signs in as the platform service account and walks every Bankroll
 * Manager section on https://smarter.poker. It must never change a row, so
 * every request the page makes is classified before it leaves the browser:
 *
 *   read       - GET / HEAD / OPTIONS, or a POST that is a reviewed read
 *                (listed below with the reason). Continued.
 *   session    - the Supabase refresh-token grant. Continued: it keeps the
 *                signed-in session alive and changes no ledger data.
 *   data-write - any other non-GET to Supabase REST / RPC / Storage /
 *                Functions / GraphQL, or to this site's /api/. ABORTED, and
 *                the test that saw it fails with the method and path.
 *   telemetry  - any other non-GET (analytics beacons, third-party pings).
 *                ABORTED so nothing leaves, but not a ledger write, so it
 *                does not fail the run. Counted in the receipt.
 *
 * Plain .mjs so __tests__/bankroll-live-suite.test.mjs can unit-test it.
 */

export const APP_ORIGIN = 'https://smarter.poker';

// POSTs that read and never write. Each entry was checked against its
// handler: no insert / upsert / update / delete / rpc in the route.
export const READ_ONLY_POSTS = Object.freeze([
  // Leak Analysis: JarvisLeakInsights posts {days, today}; the handler only
  // selects the caller's ledger and returns an analysis.
  { origin: APP_ORIGIN, path: '/api/jarvis/bankroll-analysis' },
]);

const READ_VERBS = new Set(['GET', 'HEAD', 'OPTIONS']);
const DATA_PATHS = [/^\/rest\/v1\//, /^\/storage\/v1\//, /^\/functions\/v1\//, /^\/graphql\/v1/];

export function classifyRequest(method, rawUrl) {
  const verb = String(method || '').toUpperCase();
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return 'telemetry';
  }
  if (url.protocol === 'data:' || url.protocol === 'blob:') return 'read';
  if (READ_VERBS.has(verb)) return 'read';
  if (
    verb === 'POST' &&
    url.pathname.endsWith('/auth/v1/token') &&
    url.searchParams.get('grant_type') === 'refresh_token'
  ) {
    return 'session';
  }
  if (READ_ONLY_POSTS.some((entry) => verb === 'POST' && url.origin === entry.origin && url.pathname === entry.path)) {
    return 'read';
  }
  if (DATA_PATHS.some((pattern) => pattern.test(url.pathname))) return 'data-write';
  if (url.origin === APP_ORIGIN && url.pathname.startsWith('/api/')) return 'data-write';
  if (url.pathname.startsWith('/auth/v1/')) return 'data-write';
  return 'telemetry';
}

/** Method and path only: never a query string, token or body. */
export function describeRequest(method, rawUrl) {
  try {
    const url = new URL(rawUrl);
    return `${String(method).toUpperCase()} ${url.host}${url.pathname}`;
  } catch {
    return `${String(method).toUpperCase()} (unparseable url)`;
  }
}

/** Lowercase 40-hex commit SHA, or null. */
export function normaliseSha(value) {
  const sha = String(value || '').trim().toLowerCase();
  return /^[0-9a-f]{40}$/.test(sha) ? sha : null;
}
