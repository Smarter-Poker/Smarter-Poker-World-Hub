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
import { runPaged, fetchAll } from '../../../src/lib/horses/paged.js';
import {
  pageFor,
  readByIds,
  shapeList,
  shapeUnknownTotal,
  sourceCollector,
} from '../../../src/lib/horses/listShape.js';
import { mapDbError } from '../../../src/lib/horses/dbErrors.js';
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

/**
 * ROW CAPS, RESTORED AND EXPLICIT (review addendum item 10).
 *
 * The Phase 1 rebuild routed every list through one shared
 * `{ defaultLimit: 50, max: 200 }`, which silently shrank eight lists that the
 * console renders WITHOUT a pager: clubs 200 -> 50, unions 100 -> 50, cashouts
 * 100 -> 50, members 300 -> 50. Members drive "Chips On Books", so a money
 * figure quietly became the sum of the first fifty members.
 *
 * Every list now names its own default here, next to its own `max`, so a
 * console-wide change can never move one of them by accident. Each is paged
 * INDEPENDENTLY through `pageFor(query, key, opts)`: `membersOffset=300` moves
 * the members list alone, while the shared `limit`/`offset` the client sends
 * today still applies to whatever list is being rendered.
 */
const PAGE_OPTS = {
  clubs: { defaultLimit: 200, max: 500 },
  unions: { defaultLimit: 100, max: 500 },
  cashouts: { defaultLimit: 100, max: 500 },
  transactions: { defaultLimit: 100, max: 500 },
  members: { defaultLimit: 300, max: 500 },
  agents: { defaultLimit: 200, max: 500 },
  tables: { defaultLimit: 200, max: 500 },
  memberships: { defaultLimit: 100, max: 500 },
  critical: { defaultLimit: 200, max: 500 },
  warn: { defaultLimit: 200, max: 500 },
  search: { defaultLimit: 50, max: 200 },
  tickets: { defaultLimit: 50, max: 200 },
  revenue: { defaultLimit: 50, max: 500 },
};

/**
 * chip_transactions is past a million rows, so `count: 'exact'` on it is a full
 * scan the operator waits for. Addendum item 10 names it, diamond_transactions
 * and hand_history as planned-count tables: the total is the planner's estimate
 * and the response says so in `countMode`.
 */
const PLANNED = { count: 'planned' };
const EXACT = { count: 'exact' };

/** Every member's chip_balance is read in pages of this size for the sum. */
const MEMBER_SUM_PAGE = 1000;
/** A club with more members than this has its chip sum reported as truncated. */
const MEMBER_SUM_MAX = 20000;

/**
 * Resolve a set of user ids to display names in ONE round trip.
 * club_members, agents and chip_transactions have no FK to profiles that
 * PostgREST can embed, so this is done explicitly rather than with `select(...)`
 * embedding - an embed that silently fails is exactly how the old tab ended up
 * showing "Unknown" for every member.
 */
async function resolveProfiles(db, ids) {
  // Chunked at 200 ids per .in(): a PostgREST .in() list travels in the URL,
  // and three 200-row lists on one club page could put 500 uuids (about 19 KB)
  // into a single query string.
  const { rows } = await readByIds(db, ids, (part) =>
    db
      .from('profiles')
      .select('id, display_name, username, email, player_number, avatar_url')
      .in('id', part)
  );
  const map = {};
  for (const p of rows) map[p.id] = p;
  return map;
}

/**
 * Names for exactly the club ids on the page. The overview used to build this
 * from a 200-club read, so `club_name` was null for every club outside that
 * first page while looking like the club simply had no name.
 */
async function resolveClubs(db, ids) {
  const { rows } = await readByIds(db, ids, (part) =>
    db.from('clubs').select('id, name, club_id').in('id', part)
  );
  const map = {};
  for (const c of rows) map[c.id] = c;
  return map;
}

function nameOf(profile, fallbackId) {
  if (!profile) return fallbackId ? `${String(fallbackId).slice(0, 8)}...` : 'Unknown';
  return (
    profile.display_name || profile.username || profile.email || `${String(profile.id).slice(0, 8)}...`
  );
}

/** shapeList with the rows replaced by their decorated form. */
function pageOf(result, page, rows, extra) {
  return shapeList(result, page, rows, extra);
}

// -- SECTION: OVERVIEW -------------------------------------------------------
async function sectionOverview(db, query, c) {
  const since24h = new Date(Date.now() - 86400000).toISOString();

  const clubsPage = pageFor(query, 'clubs', PAGE_OPTS.clubs);
  const unionsPage = pageFor(query, 'unions', PAGE_OPTS.unions);
  const cashoutsPage = pageFor(query, 'cashouts', PAGE_OPTS.cashouts);
  const txnsPage = pageFor(query, 'transactions', PAGE_OPTS.transactions);

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
        .select(CASHOUT_FIELDS, EXACT)
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
      cashoutsPage
    ),
    // The headline sum is deliberately independent of the page the operator is
    // looking at: a total that shrinks when you press Next is not a total.
    db.from('cashout_requests').select('amount').eq('status', 'pending').limit(CASHOUT_SUM_CAP),
    runPaged(
      db.from('clubs').select(CLUB_FIELDS, EXACT).order('created_at', { ascending: false }),
      clubsPage
    ),
    runPaged(
      db
        .from('unions')
        .select('id, name, code, union_code, club_count, member_count, chip_balance, created_at', EXACT)
        .order('created_at', { ascending: false }),
      unionsPage
    ),
    db
      .from('chip_transactions')
      .select('amount, created_at')
      .in('transaction_type', MINT_TYPES)
      .gte('created_at', since24h)
      .limit(1000),
    // Planned count: chip_transactions is past a million rows and an exact
    // count of it is a full scan on every load of this tab.
    runPaged(
      db
        .from('chip_transactions')
        .select(TXN_FIELDS, PLANNED)
        .order('created_at', { ascending: false }),
      txnsPage
    ),
  ]);

  // Surface real failures rather than rendering a confident zero.
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
      clubs: pageOf(clubsRes, clubsPage, clubRows),
      unions: pageOf(unionsRes, unionsPage, unionRows),
      cashouts: pageOf(cashoutsRes, cashoutsPage, cashoutRows),
      transactions: pageOf(txnsRes, txnsPage, txnRows, { countMode: 'planned' }),
    },
    limit: clubsPage.limit,
    offset: clubsPage.offset,
    failedSources: c.list(),
  };
}

// -- SECTION: SINGLE CLUB ----------------------------------------------------
/**
 * Review addendum item 11. "Chips On Books" used to be the client summing
 * `chip_balance` over whatever members it happened to receive - which the Phase
 * 1 rebuild had quietly cut to fifty. A money figure derived from a page is not
 * a figure at all, so the sum is computed HERE, over every member of the club,
 * in reads of 1,000 rows that carry one numeric column each. `memberCount` is
 * the exact count from the same table, and `memberChipTotalTruncated` says so
 * if a club ever exceeds the scan ceiling instead of letting a floor pass as a
 * total.
 */
async function memberChipTotal(db, clubId, c) {
  const { rows, error, truncated } = await fetchAll(
    () => db.from('club_members').select('chip_balance').eq('club_id', clubId),
    { size: MEMBER_SUM_PAGE, maxRows: MEMBER_SUM_MAX }
  );
  if (error) {
    c.fail('club_members_chip_total', error);
    return { total: null, rowsRead: rows.length, truncated: false, available: false };
  }
  const total = rows.reduce((s, m) => s + (Number(m.chip_balance) || 0), 0);
  return { total, rowsRead: rows.length, truncated: Boolean(truncated), available: true };
}

async function sectionClub(db, clubId, query, c) {
  const membersPage = pageFor(query, 'members', PAGE_OPTS.members);
  const agentsPage = pageFor(query, 'agents', PAGE_OPTS.agents);
  const tablesPage = pageFor(query, 'tables', PAGE_OPTS.tables);
  const cashoutsPage = pageFor(query, 'cashouts', PAGE_OPTS.cashouts);
  const txnsPage = pageFor(query, 'transactions', PAGE_OPTS.transactions);

  const [membersRes, agentsRes, tablesRes, cashoutsRes, txnsRes, chipTotal] = await Promise.all([
    // club_members has a COMPOSITE key (club_id, user_id) and NO id column.
    // The dead horse-flag column this select used to carry is gone: it was
    // read on every club load and surfaced nowhere.
    runPaged(
      db
        .from('club_members')
        .select(
          'club_id, user_id, role, status, chip_balance, joined_at, created_at, last_active_at, hands_played, display_name, nickname',
          EXACT
        )
        .eq('club_id', clubId)
        .order('created_at', { ascending: false }),
      membersPage
    ),
    runPaged(
      db
        .from('agents')
        .select(
          'id, user_id, club_id, role, commission_rate, credit_limit, credit_used, status, total_players, created_at',
          EXACT
        )
        .eq('club_id', clubId)
        .order('created_at', { ascending: false }),
      agentsPage
    ),
    // `max_players`, NOT max_seats.
    runPaged(
      db
        .from('tables')
        .select('id, name, game_type, stakes, max_players, current_players, status, created_at', EXACT)
        .eq('club_id', clubId)
        .order('created_at', { ascending: false }),
      tablesPage
    ),
    runPaged(
      db
        .from('cashout_requests')
        .select(CASHOUT_FIELDS, EXACT)
        .eq('club_id', clubId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
      cashoutsPage
    ),
    runPaged(
      db
        .from('chip_transactions')
        .select('id, amount, transaction_type, notes, created_at, from_user_id, to_user_id', PLANNED)
        .eq('club_id', clubId)
        .order('created_at', { ascending: false }),
      txnsPage
    ),
    memberChipTotal(db, clubId, c),
  ]);

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

  const membersShaped = pageOf(membersRes, membersPage, memberRows);

  return {
    members: memberRows,
    agents: agentRows,
    tables,
    pendingCashouts: cashoutRows,
    recentTxns: txns,
    // Addendum item 11: the two figures the club header renders, computed over
    // every member rather than over the page.
    memberCount: typeof membersRes.count === 'number' ? membersRes.count : null,
    memberChipTotal: chipTotal.total,
    memberChipTotalScope: 'all members',
    memberChipTotalTruncated: chipTotal.truncated,
    memberChipTotalRowsRead: chipTotal.rowsRead,
    agentCount: typeof agentsRes.count === 'number' ? agentsRes.count : null,
    tableCount: typeof tablesRes.count === 'number' ? tablesRes.count : null,
    pages: {
      members: membersShaped,
      agents: pageOf(agentsRes, agentsPage, agentRows),
      tables: pageOf(tablesRes, tablesPage, tables),
      cashouts: pageOf(cashoutsRes, cashoutsPage, cashoutRows),
      transactions: pageOf(txnsRes, txnsPage, txns, { countMode: 'planned' }),
    },
    limit: membersPage.limit,
    offset: membersPage.offset,
    failedSources: c.list(),
  };
}

// -- SECTION: USER SEARCH ----------------------------------------------------
/**
 * NO COUNT ON THIS PATH (review addendum item 10). The Phase 1 rebuild added
 * `count: 'exact'` behind three LEADING-wildcard ilike filters on `profiles`,
 * which is a full scan Postgres cannot index, on a query the console fires from
 * a search box. The original had no count at all. `total` is therefore null -
 * an honest "not counted" - and the pager takes Next from `hasMore`.
 */
async function sectionUserSearch(db, rawQuery, query, c) {
  const page = pageFor(query, 'search', PAGE_OPTS.search);
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
      truncated: false,
    };
  }

  const filters = [`display_name.ilike.%${q}%`, `username.ilike.%${q}%`, `email.ilike.%${q}%`];
  // player_number is an integer column: only add the filter when the query IS a number.
  if (/^\d+$/.test(q)) filters.push(`player_number.eq.${q}`);

  const result = await runPaged(
    db
      .from('profiles')
      .select(
        'id, display_name, username, email, player_number, role, is_vip, vip_tier, diamonds, created_at, last_active, avatar_url'
      )
      .or(filters.join(','))
      .order('created_at', { ascending: false }),
    page
  );

  c.check('user_search', result);
  const shaped = shapeUnknownTotal(result.data || [], page, { countMode: 'none' });
  return { ...shaped, results: shaped.rows, users: shaped.rows, failedSources: c.list() };
}

// -- SECTION: SINGLE USER ----------------------------------------------------
async function sectionUser(db, userId, query, c) {
  const membershipsPage = pageFor(query, 'memberships', PAGE_OPTS.memberships);
  const cashoutsPage = pageFor(query, 'cashouts', PAGE_OPTS.cashouts);
  const txnsPage = pageFor(query, 'transactions', PAGE_OPTS.transactions);

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
        .select('club_id, user_id, role, status, chip_balance, joined_at, created_at, hands_played', EXACT)
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
      membershipsPage
    ),
    runPaged(
      db
        .from('cashout_requests')
        .select('id, club_id, amount, status, agent_note, created_at', EXACT)
        .eq('player_id', userId)
        .order('created_at', { ascending: false }),
      cashoutsPage
    ),
    // chip_transactions has from_user_id / to_user_id - there is no user_id
    // column. One .or() rather than two reads merged in JS, so the page and
    // the total are both exact. userId is a validated uuid, so it cannot carry
    // PostgREST filter grammar into this string.
    runPaged(
      db
        .from('chip_transactions')
        .select(TXN_FIELDS, PLANNED)
        .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
        .order('created_at', { ascending: false }),
      txnsPage
    ),
  ]);

  // sectionUser was the ONLY section with no error collection, so five failed
  // reads rendered as five empty panels and looked like a quiet account.
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
      memberships: pageOf(membershipsRes, membershipsPage, membershipRows),
      cashouts: pageOf(cashoutsRes, cashoutsPage, cashoutRows),
      txns: pageOf(txnsRes, txnsPage, txns, { countMode: 'planned' }),
    },
    limit: membershipsPage.limit,
    offset: membershipsPage.offset,
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
async function sectionTickets(db, query, c) {
  const page = pageFor(query, 'tickets', PAGE_OPTS.tickets);
  const status = enumOf(query.status, [...TICKET_STATUS, 'all'], { fallback: 'all' });
  const q = searchTerm(query.q, { max: 60 });

  let base = db
    .from('live_help_tickets')
    .select(TICKET_FIELDS, EXACT)
    .order('created_at', { ascending: false });
  if (status !== 'all') base = base.eq('status', status);
  if (q) base = base.or(`subject.ilike.%${q}%,description.ilike.%${q}%`);

  const result = await runPaged(base, page);
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
 *
 * ORDERING (review, 2026-09-02). `critical` used to be fetched by `run_ts desc`
 * and then re-sorted by |drift| INSIDE the page, so page 2 was a different 200
 * rows re-sorted again and the "largest drift" list was neither stable nor
 * complete. PostgREST cannot order by abs(drift) and there is no generated
 * column for it, so the in-page re-sort is gone: the list is what it says it is,
 * the most recent critical rows, in run order. `sampledCriticalDrift` sums the
 * page and `sampleSize` says how many rows that was.
 */
async function sectionLedger(db, query, c) {
  const criticalPage = pageFor(query, 'critical', PAGE_OPTS.critical);
  const warnPage = pageFor(query, 'warn', PAGE_OPTS.warn);

  const [latestRunRes, criticalRes, warnRes, exitsRes, circulationRes, exitCount] = await Promise.all([
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
          EXACT
        )
        .eq('severity', 'critical')
        .order('run_ts', { ascending: false }),
      criticalPage
    ),
    runPaged(
      db
        .from('ledger_reconcile_log')
        .select('id, run_date, entity_type, entity_id, drift, severity', EXACT)
        .eq('severity', 'warn')
        .order('run_ts', { ascending: false }),
      warnPage
    ),
    // fn_unaccounted_seat_exits() is the meaningful signal, not the raw table:
    // it returns only the exits of a non-zero stack that have NO matching
    // wallet credit. Both arguments default (7 days, 10 minute grace).
    db.rpc('fn_unaccounted_seat_exits'),
    // p_club_id defaults to NULL, which reports every club.
    db.rpc('fn_club_chip_circulation'),
    // In the Promise.all, not awaited after it: it used to cost a serial round
    // trip on every load of this tab for one number.
    db.from('ca_seat_stack_exits').select('id', { count: 'exact', head: true }),
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

  c.check('seat_exits_count', exitCount);

  const profileMap = await resolveProfiles(db, [
    ...critical.filter((r) => r.entity_type === 'player_wallet').map((r) => r.entity_id),
    ...exits.map((e) => e.user_id),
  ]);

  // Decorated, NOT re-sorted: the order is the query's order, so page 2
  // continues page 1 instead of being a different set sorted differently.
  const criticalRows = critical.map((r) => ({
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
      // The circulation list is capped at RPC_ROW_CAP and the console renders
      // "Showing N Of Total" from this number whenever `circulationTruncated`
      // is true. It was computed here (to set that flag) and never shipped, so
      // the capped list said how many rows it had and never how many there
      // were. Same treatment as unaccountedSeatExits directly above.
      circulation: allCirculation ? allCirculation.length : null,
    },
    // Sum of the sampled rows only, and labelled as such at the call site.
    sampledCriticalDrift: criticalRows.reduce((s, r) => s + Math.abs(Number(r.drift || 0)), 0),
    sampleSize: criticalRows.length,
    criticalOrder: 'run_ts desc',
    critical: criticalRows,
    warn,
    // Every one of these is a non-zero stack that left a seat with no wallet
    // credit to match it. CLAUDE.md section 11.5: this is the loud failure.
    unaccountedSeatExits: exitRows,
    unaccountedSeatExitsTruncated: allExits.length > exits.length,
    circulation,
    circulationTruncated: Boolean(allCirculation && allCirculation.length > circulation.length),
    rpcRowCap: RPC_ROW_CAP,
    pages: {
      critical: pageOf(criticalRes, criticalPage, criticalRows),
      warn: pageOf(warnRes, warnPage, warn),
    },
    limit: criticalPage.limit,
    offset: criticalPage.offset,
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

async function sectionRevenue(db, query, c) {
  const page = pageFor(query, 'revenue', PAGE_OPTS.revenue);

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
  const agentsSorted = Object.values(byAgent)
    .map((a) => ({ ...a, agent_name: nameOf(agentProfiles[a.user_id], a.user_id) }))
    .sort((a, b) => b.amount - a.amount);
  // The legacy field the console renders today: the top fifty by amount owed.
  const agentRows = agentsSorted.slice(0, 50);
  // The pager envelope is REAL: these rows are the slice `page` asks for, out
  // of the whole derived list, so `hasMore` can actually be acted on. It used
  // to claim `hasMore: true` on a list the route always truncated to 50 with no
  // way to request the rest.
  const agentPageRows = agentsSorted.slice(page.offset, page.offset + page.limit);

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
      // Derived in memory from the 24h rake read, so the whole list ships and
      // the envelope says exactly that rather than pretending to be a page.
      byClub: {
        rows: clubRows,
        total: clubRows.length,
        limit: clubRows.length,
        offset: 0,
        hasMore: false,
        truncated: rake24.length >= REVENUE_PAGE,
      },
      byAgent: {
        rows: agentPageRows,
        total: agentsSorted.length,
        limit: page.limit,
        offset: page.offset,
        hasMore: page.offset + agentPageRows.length < agentsSorted.length,
        truncated: agentsSorted.length > agentPageRows.length,
      },
    },
    pageSize: REVENUE_PAGE,
    limit: page.limit,
    offset: page.offset,
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
async function sectionPlatform(db, c) {
  const now = Date.now();
  const h1 = new Date(now - 3600000).toISOString();
  const h24 = new Date(now - 86400000).toISOString();
  const d7 = new Date(now - 7 * 86400000).toISOString();

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
    // hand_history is the other million-row table (addendum item 10): the count
    // is planned, so this pulse is a fast estimate rather than a full scan.
    db.from('hand_history').select('id', { count: 'planned', head: true }).gte('created_at', h1),
    db.from('hand_history').select('id', { count: 'planned', head: true }).gte('created_at', h24),
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
      .select('id', { count: 'planned', head: true })
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
      handsCountMode: 'planned',
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
  // Addendum item 17: a Supabase error becomes the status that describes it,
  // never a raw throw that the wrapper can only turn into an opaque 500.
  if (error) throw mapDbError(error, 'That Club', { route: 'horses.club-arena-admin' });
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

export async function handle({ req, op, db, body, query, method, requestId }) {
  if (method === 'POST') {
    if (body.action !== 'set_club_status') throw badRequest('Unknown Action');
    return setClubStatus(db, op, req, body);
  }

  const section = enumOf(query.section || 'overview', SECTIONS);
  if (!section) throw badRequest('Unknown Section');

  // One collector per request. Addendum item 16: a failed source is named and
  // the database sentence behind it is logged under this request id, never
  // shipped to the browser.
  const c = sourceCollector({ requestId, route: 'horses.club-arena-admin' });

  if (section === 'overview') return sectionOverview(db, query, c);
  if (section === 'club') {
    const clubId = uuid(query.clubId);
    if (!clubId) throw badRequest('A Valid Club Id Is Required');
    return sectionClub(db, clubId, query, c);
  }
  if (section === 'user') {
    const userId = uuid(query.userId);
    if (!userId) throw badRequest('A Valid User Id Is Required');
    return sectionUser(db, userId, query, c);
  }
  if (section === 'user_search') return sectionUserSearch(db, query.q, query, c);
  if (section === 'tickets') return sectionTickets(db, query, c);
  if (section === 'ledger') return sectionLedger(db, query, c);
  if (section === 'revenue') return sectionRevenue(db, query, c);
  if (section === 'badges') return sectionBadges(db);
  return sectionPlatform(db, c);
}

export default withOperatorRoute(spec, handle);
