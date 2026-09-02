/**
 * CLUB ARENA PLATFORM ADMIN API
 * GET  /api/horses/club-arena-admin?section=overview
 * GET  /api/horses/club-arena-admin?section=club&clubId=<uuid>
 * GET  /api/horses/club-arena-admin?section=user_search&q=<text>
 * GET  /api/horses/club-arena-admin?section=user&userId=<uuid>
 * GET  /api/horses/club-arena-admin?section=ledger
 * GET  /api/horses/club-arena-admin?section=revenue
 * GET  /api/horses/club-arena-admin?section=badges
 * GET  /api/horses/club-arena-admin?section=platform
 * GET  /api/horses/club-arena-admin?section=tickets&status=&q=
 * POST /api/horses/club-arena-admin  { action: 'set_club_status', clubId, status }
 *
 * PHASE 1 NOTE (2026-09-02). This route is now built on
 * src/lib/horses/operatorRoute.js. The wrapper owns the method allowlist, the
 * rate limit, operator auth (service-role only, no anon fallback), the
 * permission check (clubs.read on GET, clubs.write on POST) and the response
 * envelope. Every list section pages with { rows, total, limit, offset,
 * hasMore } under `pages` and still returns the legacy array field the current
 * client reads. The single mutation writes one audit row through
 * auditOperatorAction with a real before/after snapshot.
 *
 * WHY THIS ROUTE EXISTS (added 2026-08-26 during the /horses deep audit).
 *
 * The Club Arena Admin tab used to run all of these queries DIRECTLY FROM THE
 * BROWSER with the operator's own JWT. That was broken in two separate ways at
 * once, and both failures were silent:
 *
 *   1. RLS. Verified against production: an account with profiles.role='admin'
 *      can read 0 of 1501 club_members, 0 of 113 agents, 0 of 200,978
 *      chip_transactions and 0 cashout_requests. There is no admin-role bypass
 *      policy on any of those four tables - the policies are scoped to club
 *      staff, agents-of-player and union overseers. The queries SUCCEEDED and
 *      returned empty arrays, so the tab rendered "0 members, 0 agents, no
 *      transactions" for every club on the platform and looked like real data.
 *
 *   2. Wrong column names. cashout_requests has player_id, NOT user_id.
 *      chip_transactions has from_user_id/to_user_id, NOT user_id. tables has
 *      max_players, NOT max_seats. club_members has a COMPOSITE primary key
 *      (club_id, user_id) and no `id` column at all. Each of those selects
 *      returned PostgREST 42703 and the whole Promise.all branch fell into a
 *      generic catch.
 *
 * Reading this data with the service role behind a platform-admin gate fixes
 * both. Do not move these queries back into the browser.
 */
import { withOperatorRoute } from '../../../src/lib/horses/operatorRoute.js';
import { PERMISSIONS } from '../../../src/lib/horses/permissions.js';
import { badRequest, notFound } from '../../../src/lib/horses/apiEnvelope.js';
import { auditOperatorAction } from '../../../src/lib/horses/operatorAudit.js';
import { paging, runPaged, pagedResult } from '../../../src/lib/horses/paged.js';
import { uuid, enumOf, searchTerm } from '../../../src/lib/horses/validate.js';

/**
 * Every value that means "chips were created" in production. The panel used to
 * filter on the single literal 'mint', which catches 4 of the ~11 minting rows;
 * transaction_type is free text with 40 distinct values today.
 */
const MINT_TYPES = ['mint', 'treasury_mint', 'treasury_credit'];

const VALID_CLUB_STATUS = ['active', 'suspended'];

const SECTIONS = [
  'overview',
  'club',
  'user_search',
  'user',
  'ledger',
  'revenue',
  'badges',
  'platform',
  'tickets',
];

/** live_help_tickets.status values the Bug Reports surface can filter on. */
const TICKET_STATUS = ['open', 'in_progress', 'resolved', 'closed'];

/** Rows we are willing to hand to the browser, so a schema change cannot leak a new column. */
const CLUB_FIELDS =
  'id, name, club_id, code, member_count, table_count, status, created_at, owner_id, union_id, chip_treasury';

const CASHOUT_FIELDS =
  'id, club_id, player_id, agent_id, amount, status, player_note, agent_note, created_at';

const TXN_FIELDS =
  'id, amount, transaction_type, notes, created_at, club_id, from_user_id, to_user_id';

const TICKET_FIELDS =
  'id, subject, description, priority, status, created_at, updated_at, resolved_at, user_id, conversation_id';

/** The pending-cashout headline must not move when the operator pages. */
const CASHOUT_SUM_CAP = 1000;
/** fn_unaccounted_seat_exits takes no row limit, so the route caps what it ships. */
const RPC_ROW_CAP = 200;

const PAGE_OPTS = { defaultLimit: 50, max: 200 };

function collector() {
  const failed = [];
  const check = (label, r) => {
    if (r?.error) failed.push(`${label}: ${r.error.message}`);
  };
  return { failed, check, list: () => (failed.length ? failed : undefined) };
}

/**
 * Resolve a set of user ids to display names in ONE round trip.
 * club_members, agents and chip_transactions have no FK to profiles that
 * PostgREST can embed, so this is done explicitly rather than with `select(...)`
 * embedding - an embed that silently fails is exactly how the old tab ended up
 * showing "Unknown" for every member.
 */
async function resolveProfiles(db, ids) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  if (unique.length === 0) return {};
  const { data } = await db
    .from('profiles')
    .select('id, display_name, username, email, player_number, avatar_url')
    .in('id', unique.slice(0, 500));
  const map = {};
  for (const p of data || []) map[p.id] = p;
  return map;
}

/**
 * Names for exactly the club ids on the page. The overview used to build this
 * from a 200-club read, so `club_name` was null for every club outside that
 * first page while looking like the club simply had no name.
 */
async function resolveClubs(db, ids) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  if (unique.length === 0) return {};
  const { data } = await db
    .from('clubs')
    .select('id, name, club_id')
    .in('id', unique.slice(0, 500));
  const map = {};
  for (const c of data || []) map[c.id] = c;
  return map;
}

function nameOf(profile, fallbackId) {
  if (!profile) return fallbackId ? `${String(fallbackId).slice(0, 8)}...` : 'Unknown';
  return (
    profile.display_name || profile.username || profile.email || `${String(profile.id).slice(0, 8)}...`
  );
}

/** pagedResult with the rows replaced by their decorated form. */
function pageOf(result, page, rows) {
  const shaped = pagedResult(result, page);
  return { ...shaped, rows };
}

// -- SECTION: OVERVIEW -------------------------------------------------------
async function sectionOverview(db, page) {
  const since24h = new Date(Date.now() - 86400000).toISOString();

  const [
    clubsCount,
    membersCount,
    tablesCount,
    cashoutsRes,
    cashoutSumRes,
    clubsRes,
    unionsRes,
    mintsRes,
    txnsRes,
  ] = await Promise.all([
    db.from('clubs').select('id', { count: 'exact', head: true }),
    db.from('club_members').select('user_id', { count: 'exact', head: true }),
    db
      .from('tables')
      .select('id', { count: 'exact', head: true })
      .in('status', ['running', 'active', 'waiting']),
    runPaged(
      db
        .from('cashout_requests')
        .select(CASHOUT_FIELDS, { count: 'exact' })
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
      page
    ),
    // The headline sum is deliberately independent of the page the operator is
    // looking at: a total that shrinks when you press Next is not a total.
    db.from('cashout_requests').select('amount').eq('status', 'pending').limit(CASHOUT_SUM_CAP),
    runPaged(
      db.from('clubs').select(CLUB_FIELDS, { count: 'exact' }).order('created_at', { ascending: false }),
      page
    ),
    runPaged(
      db
        .from('unions')
        .select('id, name, code, union_code, club_count, member_count, chip_balance, created_at', {
          count: 'exact',
        })
        .order('created_at', { ascending: false }),
      page
    ),
    db
      .from('chip_transactions')
      .select('amount, created_at')
      .in('transaction_type', MINT_TYPES)
      .gte('created_at', since24h)
      .limit(1000),
    runPaged(
      db
        .from('chip_transactions')
        .select(TXN_FIELDS, { count: 'exact' })
        .order('created_at', { ascending: false }),
      page
    ),
  ]);

  // Surface real failures rather than rendering a confident zero.
  const c = collector();
  c.check('clubs_count', clubsCount);
  c.check('members_count', membersCount);
  c.check('tables_count', tablesCount);
  c.check('cashouts', cashoutsRes);
  c.check('cashout_total', cashoutSumRes);
  c.check('clubs', clubsRes);
  c.check('unions', unionsRes);
  c.check('mints', mintsRes);
  c.check('transactions', txnsRes);

  const clubs = clubsRes.data || [];
  const pendingCashouts = cashoutsRes.data || [];
  const recentTxns = txnsRes.data || [];
  const cashoutSumRows = cashoutSumRes.data || [];

  // Names for the club ids actually on this page, from both lists.
  const clubMap = await resolveClubs(db, [
    ...pendingCashouts.map((x) => x.club_id),
    ...recentTxns.map((t) => t.club_id),
  ]);
  const clubNames = {};
  for (const club of clubs) clubNames[club.id] = club.name;
  for (const [id, row] of Object.entries(clubMap)) if (!clubNames[id]) clubNames[id] = row.name;

  const profileMap = await resolveProfiles(db, [
    ...pendingCashouts.map((x) => x.player_id),
    ...clubs.map((x) => x.owner_id),
  ]);

  // Computed ONCE. It used to be summed twice from the same rows, in two places
  // that could drift apart the moment either changed.
  const totalMinted24h = (mintsRes.data || []).reduce((s, t) => s + Number(t.amount || 0), 0);
  const pendingCashoutTotal = cashoutSumRows.reduce((s, x) => s + Number(x.amount || 0), 0);

  const clubRows = clubs.map((x) => ({ ...x, owner_name: nameOf(profileMap[x.owner_id], x.owner_id) }));
  const cashoutRows = pendingCashouts.map((x) => ({
    ...x,
    club_name: clubNames[x.club_id] || null,
    player_name: nameOf(profileMap[x.player_id], x.player_id),
  }));
  const txnRows = recentTxns.map((t) => ({ ...t, club_name: clubNames[t.club_id] || null }));
  const unionRows = unionsRes.data || [];

  return {
    stats: {
      totalClubs: clubsCount.count ?? null,
      totalMembers: membersCount.count ?? null,
      totalTables: tablesCount.count ?? null,
      // The exact number waiting, not the size of the page being rendered.
      pendingCashouts: cashoutsRes.count ?? cashoutRows.length,
      pendingCashoutTotal,
      pendingCashoutTotalTruncated: cashoutSumRows.length >= CASHOUT_SUM_CAP,
      totalMinted24h,
    },
    clubs: clubRows,
    unions: unionRows,
    pendingCashouts: cashoutRows,
    finance: {
      recentTxns: txnRows,
      totalMinted24h,
      pendingCashoutTotal,
    },
    pages: {
      clubs: pageOf(clubsRes, page, clubRows),
      unions: pageOf(unionsRes, page, unionRows),
      cashouts: pageOf(cashoutsRes, page, cashoutRows),
      transactions: pageOf(txnsRes, page, txnRows),
    },
    limit: page.limit,
    offset: page.offset,
    failedSources: c.list(),
  };
}

// -- SECTION: SINGLE CLUB ----------------------------------------------------
async function sectionClub(db, clubId, page) {
  const [membersRes, agentsRes, tablesRes, cashoutsRes, txnsRes] = await Promise.all([
    // club_members has a COMPOSITE key (club_id, user_id) and NO id column.
    // The dead horse-flag column this select used to carry is gone: it was
    // read on every club load and surfaced nowhere.
    runPaged(
      db
        .from('club_members')
        .select(
          'club_id, user_id, role, status, chip_balance, joined_at, created_at, last_active_at, hands_played, display_name, nickname',
          { count: 'exact' }
        )
        .eq('club_id', clubId)
        .order('created_at', { ascending: false }),
      page
    ),
    runPaged(
      db
        .from('agents')
        .select(
          'id, user_id, club_id, role, commission_rate, credit_limit, credit_used, status, total_players, created_at',
          { count: 'exact' }
        )
        .eq('club_id', clubId)
        .order('created_at', { ascending: false }),
      page
    ),
    // `max_players`, NOT max_seats.
    runPaged(
      db
        .from('tables')
        .select('id, name, game_type, stakes, max_players, current_players, status, created_at', {
          count: 'exact',
        })
        .eq('club_id', clubId)
        .order('created_at', { ascending: false }),
      page
    ),
    runPaged(
      db
        .from('cashout_requests')
        .select(CASHOUT_FIELDS, { count: 'exact' })
        .eq('club_id', clubId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
      page
    ),
    runPaged(
      db
        .from('chip_transactions')
        .select('id, amount, transaction_type, notes, created_at, from_user_id, to_user_id', {
          count: 'exact',
        })
        .eq('club_id', clubId)
        .order('created_at', { ascending: false }),
      page
    ),
  ]);

  const c = collector();
  c.check('members', membersRes);
  c.check('agents', agentsRes);
  c.check('tables', tablesRes);
  c.check('cashouts', cashoutsRes);
  c.check('transactions', txnsRes);

  const members = membersRes.data || [];
  const agents = agentsRes.data || [];
  const cashouts = cashoutsRes.data || [];
  const tables = tablesRes.data || [];
  const txns = txnsRes.data || [];

  const profileMap = await resolveProfiles(db, [
    ...members.map((m) => m.user_id),
    ...agents.map((a) => a.user_id),
    ...cashouts.map((x) => x.player_id),
  ]);

  const memberRows = members.map((m) => ({
    ...m,
    // Composite key: the browser needs a stable React key and there is no id.
    row_key: `${m.club_id}:${m.user_id}`,
    player_name: m.display_name || m.nickname || nameOf(profileMap[m.user_id], m.user_id),
    email: profileMap[m.user_id]?.email || null,
    player_number: profileMap[m.user_id]?.player_number || null,
  }));
  const agentRows = agents.map((a) => ({
    ...a,
    player_name: nameOf(profileMap[a.user_id], a.user_id),
  }));
  const cashoutRows = cashouts.map((x) => ({
    ...x,
    player_name: nameOf(profileMap[x.player_id], x.player_id),
  }));

  return {
    members: memberRows,
    agents: agentRows,
    tables,
    pendingCashouts: cashoutRows,
    recentTxns: txns,
    pages: {
      members: pageOf(membersRes, page, memberRows),
      agents: pageOf(agentsRes, page, agentRows),
      tables: pageOf(tablesRes, page, tables),
      cashouts: pageOf(cashoutsRes, page, cashoutRows),
      transactions: pageOf(txnsRes, page, txns),
    },
    limit: page.limit,
    offset: page.offset,
    failedSources: c.list(),
  };
}

// -- SECTION: USER SEARCH ----------------------------------------------------
async function sectionUserSearch(db, rawQuery, page) {
  const q = searchTerm(rawQuery, { max: 60 });
  if (!q || q.length < 2) {
    return {
      results: [],
      users: [],
      rows: [],
      total: 0,
      limit: page.limit,
      offset: page.offset,
      hasMore: false,
    };
  }

  const filters = [`display_name.ilike.%${q}%`, `username.ilike.%${q}%`, `email.ilike.%${q}%`];
  // player_number is an integer column: only add the filter when the query IS a number.
  if (/^\d+$/.test(q)) filters.push(`player_number.eq.${q}`);

  const result = await runPaged(
    db
      .from('profiles')
      .select(
        'id, display_name, username, email, player_number, role, is_vip, vip_tier, diamonds, created_at, last_active, avatar_url',
        { count: 'exact' }
      )
      .or(filters.join(','))
      .order('created_at', { ascending: false }),
    page
  );

  const c = collector();
  c.check('user_search', result);
  const shaped = pagedResult(result, page);
  return { ...shaped, results: shaped.rows, users: shaped.rows, failedSources: c.list() };
}

// -- SECTION: SINGLE USER ----------------------------------------------------
async function sectionUser(db, userId, page) {
  const [profileRes, membershipsRes, cashoutsRes, txnsRes] = await Promise.all([
    db
      .from('profiles')
      .select(
        'id, display_name, username, email, player_number, role, is_vip, vip_tier, diamonds, created_at, last_active, status, avatar_url'
      )
      .eq('id', userId)
      .maybeSingle(),
    runPaged(
      db
        .from('club_members')
        .select('club_id, user_id, role, status, chip_balance, joined_at, created_at, hands_played', {
          count: 'exact',
        })
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
      page
    ),
    runPaged(
      db
        .from('cashout_requests')
        .select('id, club_id, amount, status, agent_note, created_at', { count: 'exact' })
        .eq('player_id', userId)
        .order('created_at', { ascending: false }),
      page
    ),
    // chip_transactions has from_user_id / to_user_id - there is no user_id
    // column. One .or() rather than two reads merged in JS, so the page and
    // the total are both exact. userId is a validated uuid, so it cannot carry
    // PostgREST filter grammar into this string.
    runPaged(
      db
        .from('chip_transactions')
        .select(TXN_FIELDS, { count: 'exact' })
        .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
        .order('created_at', { ascending: false }),
      page
    ),
  ]);

  // sectionUser was the ONLY section with no error collection, so five failed
  // reads rendered as five empty panels and looked like a quiet account.
  const c = collector();
  c.check('profile', profileRes);
  c.check('memberships', membershipsRes);
  c.check('cashouts', cashoutsRes);
  c.check('transactions', txnsRes);

  const memberships = membershipsRes.data || [];
  const cashouts = cashoutsRes.data || [];
  const txnRowsRaw = txnsRes.data || [];

  const clubNames = await resolveClubs(db, [
    ...memberships.map((m) => m.club_id),
    ...cashouts.map((x) => x.club_id),
    ...txnRowsRaw.map((t) => t.club_id),
  ]);

  const txns = txnRowsRaw.map((t) => ({
    ...t,
    direction: t.to_user_id === userId ? 'in' : 'out',
    club_name: clubNames[t.club_id]?.name || null,
  }));

  const membershipRows = memberships.map((m) => ({
    ...m,
    row_key: `${m.club_id}:${m.user_id}`,
    club_name: clubNames[m.club_id]?.name || null,
    club_code: clubNames[m.club_id]?.club_id || null,
  }));
  const cashoutRows = cashouts.map((x) => ({
    ...x,
    club_name: clubNames[x.club_id]?.name || null,
  }));

  return {
    profile: profileRes.data || null,
    memberships: membershipRows,
    cashouts: cashoutRows,
    txns,
    pages: {
      memberships: pageOf(membershipsRes, page, membershipRows),
      cashouts: pageOf(cashoutsRes, page, cashoutRows),
      txns: pageOf(txnsRes, page, txns),
    },
    limit: page.limit,
    offset: page.offset,
    failedSources: c.list(),
  };
}

// -- SECTION: SUPPORT TICKETS ------------------------------------------------
/**
 * Phase 1 contract item 1. The Bug Reports tab used to SELECT live_help_tickets
 * straight from the browser with an embedded profiles join, unbounded and under
 * the operator's own RLS. The reporter is resolved here with a second query on
 * profiles by id, exactly as every other list in this file does it, because a
 * PostgREST embed that silently fails renders as "Unknown" forever.
 */
async function sectionTickets(db, query, page) {
  const status = enumOf(query.status, [...TICKET_STATUS, 'all'], { fallback: 'all' });
  const q = searchTerm(query.q, { max: 60 });

  let base = db
    .from('live_help_tickets')
    .select(TICKET_FIELDS, { count: 'exact' })
    .order('created_at', { ascending: false });
  if (status !== 'all') base = base.eq('status', status);
  if (q) base = base.or(`subject.ilike.%${q}%,description.ilike.%${q}%`);

  const result = await runPaged(base, page);
  const c = collector();
  c.check('tickets', result);

  const rows = result.data || [];
  const profileMap = await resolveProfiles(db, rows.map((t) => t.user_id));

  const decorated = rows.map((t) => ({
    ...t,
    reporter: profileMap[t.user_id]
      ? {
          id: profileMap[t.user_id].id,
          username: profileMap[t.user_id].username || null,
          display_name: profileMap[t.user_id].display_name || null,
          avatar_url: profileMap[t.user_id].avatar_url || null,
        }
      : null,
  }));

  const shaped = pageOf(result, page, decorated);
  return { ...shaped, tickets: decorated, status, q: q || null, failedSources: c.list() };
}

// -- SECTION: LEDGER RECONCILIATION ------------------------------------------
/**
 * `reconcile_ledger_nightly` has been filing drift into `ledger_reconcile_log`
 * every morning and NOTHING has ever read it. As this was written the table
 * held 20,206 rows at severity `critical` for `player_wallet`, summing to
 * 3,118,287,619 chips of drift between the ledger and the stored balances.
 *
 * CLAUDE.md section 11.5 describes the machinery that files these - the
 * `ca_seat_stack_exits` trigger, `fn_unaccounted_seat_exits()`,
 * `fn_club_chip_circulation()` - and says in as many words that it exists to
 * make chip loss LOUD. It has been silent because the only surface that could
 * have shown it did not query it.
 *
 * Neither RPC takes a row limit (fn_unaccounted_seat_exits takes a window and a
 * grace period; fn_club_chip_circulation takes a club id), so their output is
 * capped here and the cap is reported as `truncated` rather than hidden.
 */
async function sectionLedger(db, page) {
  const c = collector();

  const [latestRunRes, criticalRes, warnRes, exitsRes, circulationRes] = await Promise.all([
    db
      .from('ledger_reconcile_log')
      .select('run_date, run_ts')
      .order('run_ts', { ascending: false })
      .limit(1)
      .maybeSingle(),
    runPaged(
      db
        .from('ledger_reconcile_log')
        .select(
          'id, run_date, run_ts, entity_type, entity_id, ledger_balance, stored_balance, drift, severity, notes',
          { count: 'exact' }
        )
        .eq('severity', 'critical')
        .order('run_ts', { ascending: false }),
      page
    ),
    runPaged(
      db
        .from('ledger_reconcile_log')
        .select('id, run_date, entity_type, entity_id, drift, severity', { count: 'exact' })
        .eq('severity', 'warn')
        .order('run_ts', { ascending: false }),
      page
    ),
    // fn_unaccounted_seat_exits() is the meaningful signal, not the raw table:
    // it returns only the exits of a non-zero stack that have NO matching
    // wallet credit. Both arguments default (7 days, 10 minute grace).
    db.rpc('fn_unaccounted_seat_exits'),
    // p_club_id defaults to NULL, which reports every club.
    db.rpc('fn_club_chip_circulation'),
  ]);

  c.check('latest_run', latestRunRes);
  c.check('critical', criticalRes);
  c.check('warn', warnRes);
  c.check('unaccounted_seat_exits', exitsRes);
  c.check('circulation', circulationRes);

  const critical = criticalRes.data || [];
  const warn = warnRes.data || [];
  const allExits = Array.isArray(exitsRes.data) ? exitsRes.data : [];
  const exits = allExits.slice(0, RPC_ROW_CAP);
  const allCirculation = Array.isArray(circulationRes.data) ? circulationRes.data : null;
  const circulation = allCirculation ? allCirculation.slice(0, RPC_ROW_CAP) : circulationRes.data ?? null;

  const exitCount = await db.from('ca_seat_stack_exits').select('id', { count: 'exact', head: true });
  c.check('seat_exits_count', exitCount);

  const profileMap = await resolveProfiles(db, [
    ...critical.filter((r) => r.entity_type === 'player_wallet').map((r) => r.entity_id),
    ...exits.map((e) => e.user_id),
  ]);

  const sortedCritical = [...critical]
    .sort((a, b) => Math.abs(Number(b.drift || 0)) - Math.abs(Number(a.drift || 0)))
    .map((r) => ({
      ...r,
      entity_name: r.entity_type === 'player_wallet' ? nameOf(profileMap[r.entity_id], r.entity_id) : null,
    }));

  const exitRows = exits.map((e) => ({ ...e, player_name: nameOf(profileMap[e.user_id], e.user_id) }));

  return {
    lastRun: latestRunRes.data || null,
    counts: {
      critical: criticalRes.count ?? null,
      warn: warnRes.count ?? null,
      seatExitsTotal: exitCount.count ?? null,
      unaccountedSeatExits: allExits.length,
    },
    // Sum of the sampled rows only, and labelled as such at the call site.
    sampledCriticalDrift: sortedCritical.reduce((s, r) => s + Math.abs(Number(r.drift || 0)), 0),
    sampleSize: sortedCritical.length,
    critical: sortedCritical,
    warn,
    // Every one of these is a non-zero stack that left a seat with no wallet
    // credit to match it. CLAUDE.md section 11.5: this is the loud failure.
    unaccountedSeatExits: exitRows,
    unaccountedSeatExitsTruncated: allExits.length > exits.length,
    circulation,
    circulationTruncated: Boolean(allCirculation && allCirculation.length > circulation.length),
    rpcRowCap: RPC_ROW_CAP,
    pages: {
      critical: pageOf(criticalRes, page, sortedCritical),
      warn: pageOf(warnRes, page, warn),
    },
    limit: page.limit,
    offset: page.offset,
    failedSources: c.list(),
  };
}

// -- SECTION: REVENUE --------------------------------------------------------
/**
 * The Finance section used to headline "Chips Minted (24h)", which is 0, while
 * `rake_records` moved 196,636 chips in that same window and 4,028,434 all
 * time. Rake is how this platform earns; it had no surface at all.
 *
 * PostgREST aggregate functions are DISABLED on this project (PGRST123), so
 * every total here is summed in JS over a capped page and the cap is reported
 * alongside it. Do not present a truncated sum as a total at the call site.
 */
const REVENUE_PAGE = 5000;

async function sectionRevenue(db, page) {
  const c = collector();

  const now = Date.now();
  const since24h = new Date(now - 86400000).toISOString();
  const since7d = new Date(now - 7 * 86400000).toISOString();

  const [rake24Res, rake7dRes, unsettledRes, rakeCountRes, commissionCountRes] = await Promise.all([
    db
      .from('rake_records')
      .select('rake_amount, bbj_contribution, club_id, created_at, is_tournament')
      .gte('created_at', since24h)
      .limit(REVENUE_PAGE),
    db
      .from('rake_records')
      .select('rake_amount, bbj_contribution, club_id, created_at')
      .gte('created_at', since7d)
      .limit(REVENUE_PAGE),
    db
      .from('agent_commissions')
      .select('id, club_id, user_id, amount, commission_rate, source_type, created_at')
      .is('settled_at', null)
      .order('created_at', { ascending: false })
      .limit(REVENUE_PAGE),
    db.from('rake_records').select('id', { count: 'exact', head: true }).gte('created_at', since24h),
    db.from('agent_commissions').select('id', { count: 'exact', head: true }).is('settled_at', null),
  ]);

  c.check('rake_24h', rake24Res);
  c.check('rake_7d', rake7dRes);
  c.check('unsettled_commissions', unsettledRes);

  const rake24 = rake24Res.data || [];
  const rake7d = rake7dRes.data || [];
  const unsettled = unsettledRes.data || [];

  // Names for the clubs that actually appear, not for the first 200 clubs.
  const clubMap = await resolveClubs(db, [
    ...rake24.map((r) => r.club_id),
    ...unsettled.map((x) => x.club_id),
  ]);
  const clubNames = {};
  for (const [id, row] of Object.entries(clubMap)) clubNames[id] = row.name;

  const sum = (rows, key) => rows.reduce((s, r) => s + Number(r[key] || 0), 0);

  // Per-club rake over the 24h page.
  const byClub = {};
  for (const r of rake24) {
    const id = r.club_id || 'unattributed';
    if (!byClub[id]) {
      byClub[id] = { club_id: id, club_name: clubNames[id] || null, rake: 0, bbj: 0, hands: 0 };
    }
    byClub[id].rake += Number(r.rake_amount || 0);
    byClub[id].bbj += Number(r.bbj_contribution || 0);
    byClub[id].hands += 1;
  }

  const byAgent = {};
  for (const x of unsettled) {
    const key = x.user_id || 'unassigned';
    if (!byAgent[key]) {
      byAgent[key] = {
        user_id: x.user_id,
        club_id: x.club_id,
        club_name: clubNames[x.club_id] || null,
        amount: 0,
        rows: 0,
      };
    }
    byAgent[key].amount += Number(x.amount || 0);
    byAgent[key].rows += 1;
  }
  const agentProfiles = await resolveProfiles(db, Object.keys(byAgent));
  const agentRows = Object.values(byAgent)
    .map((a) => ({ ...a, agent_name: nameOf(agentProfiles[a.user_id], a.user_id) }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 50);

  const clubRows = Object.values(byClub).sort((a, b) => b.rake - a.rake);

  return {
    rake24h: {
      total: sum(rake24, 'rake_amount'),
      bbj: sum(rake24, 'bbj_contribution'),
      hands: rake24.length,
      handCount: rakeCountRes.count ?? null,
      truncated: rake24.length >= REVENUE_PAGE,
    },
    rake7d: {
      total: sum(rake7d, 'rake_amount'),
      bbj: sum(rake7d, 'bbj_contribution'),
      hands: rake7d.length,
      truncated: rake7d.length >= REVENUE_PAGE,
    },
    byClub: clubRows,
    unsettledCommissions: {
      total: sum(unsettled, 'amount'),
      rows: unsettled.length,
      rowCount: commissionCountRes.count ?? null,
      truncated: unsettled.length >= REVENUE_PAGE,
      byAgent: agentRows,
    },
    pages: {
      byClub: {
        rows: clubRows,
        total: clubRows.length,
        limit: page.limit,
        offset: 0,
        hasMore: false,
      },
      byAgent: {
        rows: agentRows,
        total: Object.keys(byAgent).length,
        limit: page.limit,
        offset: 0,
        hasMore: Object.keys(byAgent).length > agentRows.length,
      },
    },
    pageSize: REVENUE_PAGE,
    failedSources: c.list(),
  };
}

// -- SECTION: PLATFORM PULSE -------------------------------------------------
/**
 * What is happening on the platform RIGHT NOW.
 *
 * None of this was visible anywhere in the console. As this was written
 * production had 137 live tables, 680 occupied seats and 19,563 hands dealt in
 * the previous hour, and the only tab called "Statistics" showed four numbers
 * about the blog-post engine. An operator could not answer "is the platform
 * up and busy" without writing SQL.
 *
 * Every figure here is a `count exact, head` - no rows cross the wire.
 */
async function sectionPlatform(db) {
  const now = Date.now();
  const h1 = new Date(now - 3600000).toISOString();
  const h24 = new Date(now - 86400000).toISOString();
  const d7 = new Date(now - 7 * 86400000).toISOString();

  const c = collector();
  const val = (r) => (r?.error ? null : r.count ?? null);

  const [
    liveTables,
    waitingTables,
    seatedNow,
    hands1h,
    hands24h,
    signups24h,
    signups7d,
    activeUsers24h,
    liveTournaments,
    handsPrev24h,
    openTickets,
  ] = await Promise.all([
    db.from('tables').select('id', { count: 'exact', head: true }).in('status', ['running', 'active']),
    db.from('tables').select('id', { count: 'exact', head: true }).eq('status', 'waiting'),
    db.from('table_seats').select('id', { count: 'exact', head: true }).is('left_at', null),
    db.from('hand_history').select('id', { count: 'exact', head: true }).gte('created_at', h1),
    db.from('hand_history').select('id', { count: 'exact', head: true }).gte('created_at', h24),
    db.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', h24),
    db.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', d7),
    db.from('profiles').select('id', { count: 'exact', head: true }).gte('last_active', h24),
    db
      .from('tournaments')
      .select('id', { count: 'exact', head: true })
      .in('status', ['running', 'registering', 'announced']),
    // The previous 24h window, so the headline number carries a direction
    // rather than sitting there with nothing to compare against.
    db
      .from('hand_history')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', new Date(now - 2 * 86400000).toISOString())
      .lt('created_at', h24),
    db.from('live_help_tickets').select('id', { count: 'exact', head: true }).eq('status', 'open'),
  ]);

  c.check('live_tables', liveTables);
  c.check('seated', seatedNow);
  c.check('hands_1h', hands1h);
  c.check('hands_24h', hands24h);
  c.check('signups', signups24h);
  c.check('tournaments', liveTournaments);

  const h24n = val(hands24h);
  const hPrev = val(handsPrev24h);

  return {
    platform: {
      liveTables: val(liveTables),
      waitingTables: val(waitingTables),
      seatedNow: val(seatedNow),
      hands1h: val(hands1h),
      hands24h: h24n,
      handsPrev24h: hPrev,
      // null rather than a fabricated 0% when there is nothing to compare to.
      handsTrendPct:
        h24n !== null && hPrev !== null && hPrev > 0 ? Math.round(((h24n - hPrev) / hPrev) * 100) : null,
      signups24h: val(signups24h),
      signups7d: val(signups7d),
      activeUsers24h: val(activeUsers24h),
      liveTournaments: val(liveTournaments),
      openTickets: val(openTickets),
    },
    failedSources: c.list(),
  };
}

// -- SECTION: BADGES ---------------------------------------------------------
/**
 * Counts only, cheap, fetched once on mount. The nav badges used to read state
 * that is only populated by visiting the very tab the badge points at, so they
 * were structurally incapable of telling an operator there was work waiting.
 */
async function sectionBadges(db) {
  const [cashouts, ledgerCritical, tickets] = await Promise.all([
    db.from('cashout_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    db.from('ledger_reconcile_log').select('id', { count: 'exact', head: true }).eq('severity', 'critical'),
    db.from('live_help_tickets').select('id', { count: 'exact', head: true }).eq('status', 'open'),
  ]);
  return {
    badges: {
      pendingCashouts: cashouts.count ?? 0,
      ledgerCritical: ledgerCritical.count ?? 0,
      openTickets: tickets.count ?? 0,
    },
  };
}

// -- WRITE -------------------------------------------------------------------
async function setClubStatus(db, op, req, body) {
  const clubId = uuid(body.clubId);
  if (!clubId) throw badRequest('A Valid Club Id Is Required');
  const status = enumOf(body.status, VALID_CLUB_STATUS);
  if (!status) throw badRequest(`Status Must Be One Of: ${VALID_CLUB_STATUS.join(', ')}`);

  const { data: before } = await db
    .from('clubs')
    .select('id, name, status')
    .eq('id', clubId)
    .maybeSingle();

  const { data, error } = await db
    .from('clubs')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', clubId)
    .select('id, status')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw notFound('Club Not Found');

  await auditOperatorAction(op, req, {
    action: 'club.set_status',
    targetType: 'club',
    targetId: clubId,
    before: before ? { status: before.status ?? null, name: before.name ?? null } : null,
    after: { status: data.status ?? null },
    details: { status },
  });

  return { club: data };
}

export const spec = {
  name: 'horses.club-arena-admin',
  methods: ['GET', 'POST'],
  permission: { GET: PERMISSIONS.CLUBS_READ, POST: PERMISSIONS.CLUBS_WRITE },
  limit: { GET: 'read', POST: 'write' },
};

export async function handle({ req, op, db, body, query, method }) {
  if (method === 'POST') {
    if (body.action !== 'set_club_status') throw badRequest('Unknown Action');
    return setClubStatus(db, op, req, body);
  }

  const section = enumOf(query.section || 'overview', SECTIONS);
  if (!section) throw badRequest('Unknown Section');
  const page = paging(query, PAGE_OPTS);

  if (section === 'overview') return sectionOverview(db, page);
  if (section === 'club') {
    const clubId = uuid(query.clubId);
    if (!clubId) throw badRequest('A Valid Club Id Is Required');
    return sectionClub(db, clubId, page);
  }
  if (section === 'user') {
    const userId = uuid(query.userId);
    if (!userId) throw badRequest('A Valid User Id Is Required');
    return sectionUser(db, userId, page);
  }
  if (section === 'user_search') return sectionUserSearch(db, query.q, page);
  if (section === 'tickets') return sectionTickets(db, query, page);
  if (section === 'ledger') return sectionLedger(db, page);
  if (section === 'revenue') return sectionRevenue(db, page);
  if (section === 'badges') return sectionBadges(db);
  return sectionPlatform(db);
}

export default withOperatorRoute(spec, handle);
