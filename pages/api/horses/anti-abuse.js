/**
 * ANTI-ABUSE ADMIN API
 * GET /api/horses/anti-abuse - Returns abuse log, audit log, alerts, and economy data
 * Used by the /horses Anti-Abuse dashboard tab
 *
 * PHASE 1 NOTE (2026-09-02). Rebuilt onto src/lib/horses/operatorRoute.js:
 * players.read, one service-role client with no anon fallback, the shared
 * envelope, and paging on the two list sections (legacy `log` and `audit`
 * arrays kept alongside `pages`). `raw_email` in the alerts feed is now masked
 * to its first character plus the domain: email was deliberately dropped from
 * the top-holders query as bulk PII in the same release that kept shipping it
 * here, which was the inconsistency, not the intent.
 */
import { withOperatorRoute } from '../../../src/lib/horses/operatorRoute.js';
import { PERMISSIONS } from '../../../src/lib/horses/permissions.js';
import { badRequest } from '../../../src/lib/horses/apiEnvelope.js';
import { runPaged } from '../../../src/lib/horses/paged.js';
import { pageFor, shapeList } from '../../../src/lib/horses/listShape.js';
import { enumOf } from '../../../src/lib/horses/validate.js';

const VALID_SECTIONS = ['all', 'abuse', 'audit', 'economy', 'alerts'];

const ABUSE_PAGE = { defaultLimit: 100, max: 200 };
const AUDIT_PAGE = { defaultLimit: 50, max: 200 };
const ALERT_CAP = 200;
const ECONOMY_WINDOW_DAYS = 30;
const ECONOMY_TX_CAP = 5000;

/**
 * An address the operator can recognise without the route shipping the address
 * itself. "daniel@example.com" -> "d***@example.com"; anything that is not an
 * address at all is reduced to null rather than guessed at.
 */
export function maskEmail(raw) {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  const at = value.lastIndexOf('@');
  if (at < 1 || at === value.length - 1) return null;
  return `${value[0]}***${value.slice(at)}`;
}

/**
 * The abuse log is `select('*')`, and one of those columns is `raw_email`.
 * Masking it in the alerts feed while shipping it unmasked in the log rows
 * rendered directly underneath - in a column headed "Email" - defeated the
 * masking on the same screen. Same treatment in both places now.
 */
export function maskLogRow(row) {
  if (!row || typeof row !== 'object') return row;
  if (!('raw_email' in row)) return row;
  return { ...row, raw_email: maskEmail(row.raw_email), email: maskEmail(row.raw_email), emailMasked: true };
}

/**
 * A named source that failed, with NO database text (contract line 5, addendum
 * item 16). The console renders `${f.source} (${f.error})`, so `error` carries
 * the generic sentence and the real message is logged under the request id.
 */
function sourceFailure(source, error, requestId) {
  console.error(`[horses.anti-abuse] ${requestId || 'no-request-id'} ${source} read failed:`, error?.message || error);
  return { source, code: 'read_failed', error: `${source} read failed`, requestId: requestId || null };
}

export const spec = {
  name: 'horses.anti-abuse',
  methods: ['GET'],
  permission: PERMISSIONS.PLAYERS_READ,
  limit: 'read',
};

export async function handle({ db, query, requestId }) {
  // ?section=bogus used to fall through every branch and return
  // { success: true } with no keys, so every panel rendered empty and the
  // operator had no way to tell a typo from a quiet platform.
  const section = enumOf(query.section || 'all', VALID_SECTIONS);
  if (!section) throw badRequest(`Unknown Section. Valid: ${VALID_SECTIONS.join(', ')}`);

  // Two independent lists, two independent pagers: `abuseLimit`/`abuseOffset`
  // and `auditLimit`/`auditOffset`, each falling back to the shared params.
  const abusePage = pageFor(query, 'abuse', ABUSE_PAGE);
  const auditPage = pageFor(query, 'audit', AUDIT_PAGE);

  // A DISCARDED ERROR ON THIS TAB IS A FALSE NEGATIVE. The three main reads
  // below destructured `data` only, so a permission failure or a query error
  // rendered as "no abuse detected", "no audit history", "no holders" - the
  // exact wrong answer for a dashboard whose entire job is to surface abuse.
  // Each failure is now named here and shipped to the UI, which already knows
  // how to render a failedSources banner.
  const result = {};
  const failedSources = [];
  const pages = {};

  // -- ABUSE LOG --
  if (section === 'all' || section === 'abuse') {
    const abuseRes = await runPaged(
      db
        .from('signup_abuse_log')
        .select('*', { count: 'exact' })
        .order('last_signup_at', { ascending: false }),
      abusePage
    );
    if (abuseRes.error) {
      failedSources.push(sourceFailure('signup_abuse_log', abuseRes.error, requestId));
    }
    const abuseLog = (abuseRes.data || []).map(maskLogRow);

    // Stats over the WHOLE table, not just the page above. These were
    // previously derived from `abuseLog` alone, so "Total Signups" was really
    // the page size.
    const [totalRes, deletedRes, flaggedRes] = await Promise.all([
      db.from('signup_abuse_log').select('id', { count: 'exact', head: true }),
      db
        .from('signup_abuse_log')
        .select('id', { count: 'exact', head: true })
        .gt('deleted_account_count', 0),
      db
        .from('signup_abuse_log')
        .select('id', { count: 'exact', head: true })
        .not('abuse_flags', 'is', null)
        .neq('abuse_flags', '[]'),
    ]);

    if (totalRes.error) console.warn('[Anti-Abuse] total count error:', totalRes.error.message || totalRes.error);
    if (deletedRes.error) console.warn('[Anti-Abuse] deleted count error:', deletedRes.error.message || deletedRes.error);
    if (flaggedRes.error) console.warn('[Anti-Abuse] flagged count error:', flaggedRes.error.message || flaggedRes.error);

    // `disposable` depends on the CONTENT of each abuse_flags entry, which
    // PostgREST cannot aggregate. It is therefore computed over the fetched
    // page only and labelled as such rather than being presented as a
    // whole-table figure.
    const disposable = abuseLog.filter((a) => {
      const flags = a.abuse_flags || [];
      return Array.isArray(flags) && flags.some((f) => f?.reason?.includes('disposable'));
    }).length;

    // Top IPs
    const ipCounts = {};
    abuseLog.forEach((entry) => {
      if (entry.ip_address && entry.ip_address !== 'unknown') {
        ipCounts[entry.ip_address] = (ipCounts[entry.ip_address] || 0) + 1;
      }
    });
    const topIPs = Object.entries(ipCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([ip, count]) => ({ ip, count }));

    result.abuse = {
      log: abuseLog,
      stats: {
        totalSignups: totalRes.count ?? null,
        blocked: flaggedRes.count ?? null,
        deletedAccounts: deletedRes.count ?? null,
        disposable,
        disposableScope: 'current page only',
      },
      topIPs,
      emailsMasked: true,
    };
    pages.abuse = shapeList(abuseRes, abusePage, abuseLog);
  }

  // -- ADMIN AUDIT LOG --
  if (section === 'all' || section === 'audit') {
    const auditRes = await runPaged(
      db.from('admin_audit_log').select('*', { count: 'exact' }).order('created_at', { ascending: false }),
      auditPage
    );
    if (auditRes.error) {
      failedSources.push(sourceFailure('admin_audit_log', auditRes.error, requestId));
    }
    result.audit = auditRes.data || [];
    pages.audit = shapeList(auditRes, auditPage);
  }

  // -- DIAMOND ECONOMY --
  if (section === 'all' || section === 'economy') {
    // Diamond source breakdown over a defined 30-day window. Previously this
    // pulled 5000 rows with NO order and NO window, so Postgres returned an
    // arbitrary 5000 rows and the breakdown described no particular period.
    const economySince = new Date(Date.now() - ECONOMY_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data: transactions, error: txErr } = await db
      .from('diamond_transactions')
      .select('transaction_type, amount')
      .gte('created_at', economySince)
      .order('created_at', { ascending: false })
      .limit(ECONOMY_TX_CAP);

    if (txErr) failedSources.push(sourceFailure('diamond_transactions', txErr, requestId));

    const sourceBreakdown = {};
    let totalGranted = 0;
    let totalSpent = 0;

    (transactions || []).forEach((tx) => {
      const type = tx.transaction_type || 'unknown';
      // A null amount made Math.abs return NaN, which poisoned the breakdown
      // for that whole type and rendered as NaN on the tab. The neighbouring
      // lines already guarded; this one did not.
      const amount = Number(tx.amount) || 0;
      sourceBreakdown[type] = (sourceBreakdown[type] || 0) + Math.abs(amount);
      if (amount > 0) totalGranted += amount;
      else totalSpent += Math.abs(amount);
    });

    // Top diamond holders.
    //
    // `email` is NOT selected. This is a top-20 leaderboard on an admin
    // dashboard; it needs to identify an account, which username and id
    // already do. Shipping twenty real email addresses in every poll of this
    // endpoint is bulk PII the surface has no use for. `phone_verified` stays
    // - it is the abuse signal the tab exists to show.
    const { data: topHolders, error: holdersErr } = await db
      .from('profiles')
      .select('id, username, diamonds, is_vip, vip_tier, phone_verified')
      .order('diamonds', { ascending: false })
      .limit(20);
    if (holdersErr) {
      failedSources.push(sourceFailure('profiles.top_holders', holdersErr, requestId));
    }

    result.economy = {
      sourceBreakdown,
      totalGranted,
      totalSpent,
      topHolders: topHolders || [],
      windowDays: ECONOMY_WINDOW_DAYS,
      windowSince: economySince,
      // Printable verbatim next to Total Granted / Total Spent. Those are
      // WINDOWED figures, not lifetime totals, and the UI had no label saying so.
      windowLabel: `last ${ECONOMY_WINDOW_DAYS} days`,
      truncated: (transactions || []).length >= ECONOMY_TX_CAP,
    };
  }

  // -- RECENT ALERTS (abuse events in last 24h) --
  if (section === 'all' || section === 'alerts') {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).getTime();

    // Reuse the abuse log when it has already been fetched, rather than
    // running the same query twice.
    const sourceData = result.abuse?.log || [];
    let alertSource = sourceData;

    if (sourceData.length === 0) {
      // Only query the database if the abuse section was not already fetched.
      // Bounded: this was the one unbounded read left in the route, and a bad
      // 24 hours would have returned the whole signup_abuse_log.
      const { data: recentAbuse } = await db
        .from('signup_abuse_log')
        .select('*')
        .gt('last_signup_at', new Date(twentyFourHoursAgo).toISOString())
        .order('last_signup_at', { ascending: false })
        .limit(ALERT_CAP);
      alertSource = recentAbuse || [];
    } else {
      alertSource = sourceData.filter(
        (a) => a.last_signup_at && new Date(a.last_signup_at).getTime() > twentyFourHoursAgo
      );
    }

    result.alerts = alertSource
      .filter((a) => a.abuse_flags && a.abuse_flags.length > 0)
      .map((a) => ({
        id: a.id,
        // Masked. The operator needs to recognise the address, not to hold it.
        email: maskEmail(a.raw_email),
        emailMasked: true,
        ip: a.ip_address,
        reason: a.abuse_flags[a.abuse_flags.length - 1]?.reason || 'Unknown',
        at: a.last_signup_at,
        deletions: a.deleted_account_count,
      }));
  }

  // failedSources ships even when empty, so the UI can distinguish "nothing
  // failed" from "this route predates the field".
  return { ...result, failedSources, pages, section };
}

export default withOperatorRoute(spec, handle);
