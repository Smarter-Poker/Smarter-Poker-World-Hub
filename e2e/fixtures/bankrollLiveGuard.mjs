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
 *   shell      - a write the GLOBAL signed-in shell makes on every page, not
 *                the Bankroll Manager (listed below). ABORTED, counted in
 *                the receipt, and does not fail a Bankroll section.
 *   provision  - the Bankroll Manager's create-only default upsert
 *                (initializeUserBankroll: ON CONFLICT DO NOTHING on
 *                bankroll_segments / bankroll_rules). ABORTED; for an
 *                existing account it changes nothing, so it does not fail.
 *                Only the exact ignore-duplicates shape qualifies.
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
  // Header unread badge: POST body carries the inbox context only; the handler
  // calls the STABLE fn_get_user_conversations and returns rows.
  { origin: APP_ORIGIN, path: '/api/messenger/get-conversations' },
]);

// Writes made by the global shell (header, presence, rewards), on every World
// Hub page for every signed-in visitor. They are blocked so this suite writes
// nothing, but they are not Bankroll Manager defects.
export const SHELL_SIDE_EFFECTS = Object.freeze([
  { origin: null, path: '/rest/v1/rpc/fn_update_presence' },
  { origin: APP_ORIGIN, path: '/api/auth/ensure-profile' },
  { origin: APP_ORIGIN, path: '/api/rewards/eggs/evaluate' },
]);

const PROVISION_TABLES = new Set(['/rest/v1/bankroll_segments', '/rest/v1/bankroll_rules']);

// PostgREST calls every RPC with POST, so reads look like writes on the wire.
// These are the client-called public functions that Postgres itself marks
// STABLE or IMMUTABLE (pg_proc.provolatile in ('s','i'), read 2026-11-28 from
// the production catalog): Postgres refuses INSERT/UPDATE/DELETE inside a
// non-volatile function, so they cannot write. Every other RPC stays blocked.
// fn_lightning_my_sessions is the one the global active-seat link calls on
// every page; blocking it painted "Could Not Check Your Active Seats / Retry".
// fn_bankroll_totals is the Bankroll Manager's own dashboard read: declared
// STABLE in its migration draft (branch bookmark/bankroll-db-migrations-2026-11-28),
// and until it is installed PostgREST answers 404 PGRST202 and the page reads
// the rows instead. Blocking it would turn every dashboard load into an error.
export const READ_ONLY_RPCS = Object.freeze([
  'fn_bankroll_totals', 'fn_bbj_pool_for_club', 'fn_ca_club_data_downline', 'fn_ca_player_session_live',
  'fn_cashout_request_card', 'fn_club_notice_unread_counts', 'fn_get_my_guest_invite_code',
  'fn_get_user_conversations', 'fn_lightning_my_sessions', 'fn_messenger_club_relationships',
  'fn_messenger_private_accounting_threads', 'fn_messenger_private_invoice_attention',
  'fn_messenger_private_invoice_attention_ids', 'fn_messenger_private_message_page',
  'fn_messenger_private_search_messages', 'fn_messenger_private_weekly_summary',
  'fn_reliability_incident_for_owner', 'fn_social_profile_post_count', 'get_active_leaks',
  'get_my_full_profile', 'get_pending_celebrations', 'get_personal_assistant_leak_stats',
  'get_tournament_reminder_delivery', 'get_unread_leak_alerts', 'get_unseen_questions',
  'get_user_achievements', 'get_visible_live_comments', 'get_visible_live_streams',
  'resolve_social_reel_reference', 'rpc_hg_list_public_tournaments',
  'training_dashboard_30day_stats', 'training_dashboard_last_session', 'user_reel_topics',
  // The dashboard totals (getBankrollStats, #3296). Declared STABLE in its
  // migration (supabase/migrations/20261128100300_fn_bankroll_totals.sql on
  // bookmark/bankroll-db-migrations-2026-11-28); until it is installed
  // PostgREST answers 404 and the page reads the rows instead. Blocking it
  // made the stats tiles fail instead of either answer.
  'fn_bankroll_totals',
]);

const READ_VERBS = new Set(['GET', 'HEAD', 'OPTIONS']);
const DATA_PATHS = [/^\/rest\/v1\//, /^\/storage\/v1\//, /^\/functions\/v1\//, /^\/graphql\/v1/];

export function classifyRequest(method, rawUrl, headers = {}) {
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
  if (verb === 'POST' && SHELL_SIDE_EFFECTS.some((entry) => url.pathname === entry.path && (!entry.origin || url.origin === entry.origin))) {
    return 'shell';
  }
  const prefer = String(headers?.prefer || headers?.Prefer || '');
  if (
    verb === 'POST' &&
    PROVISION_TABLES.has(url.pathname) &&
    /resolution=ignore-duplicates/.test(prefer) &&
    url.searchParams.has('on_conflict')
  ) {
    return 'provision';
  }
  const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/([a-z0-9_]+)$/);
  if (verb === 'POST' && rpc && READ_ONLY_RPCS.includes(rpc[1])) return 'read';
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
