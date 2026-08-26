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
 * POST /api/horses/club-arena-admin  { action: 'set_club_status', clubId, status }
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
 *      policy on any of those four tables — the policies are scoped to club
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
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    _supabase = createClient(url, key);
  }
  return _supabase;
}

const ADMIN_ROLES = ['admin', 'superadmin', 'god'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Every value that means "chips were created" in production. The panel used to
 * filter on the single literal 'mint', which catches 4 of the ~11 minting rows;
 * transaction_type is free text with 40 distinct values today.
 */
const MINT_TYPES = ['mint', 'treasury_mint', 'treasury_credit'];

const VALID_CLUB_STATUS = ['active', 'suspended'];

/** Rows we are willing to hand to the browser, so a schema change cannot leak a new column. */
const CLUB_FIELDS = 'id, name, club_id, code, member_count, table_count, status, created_at, owner_id, union_id, chip_treasury';

/**
 * PostgREST `.or()` takes a comma-separated filter STRING, so an unescaped
 * comma, parenthesis or dot in user input does not "inject SQL" but does
 * rewrite the filter tree. Strip everything that is structural to that grammar.
 */
function sanitizeSearch(raw) {
  return String(raw || '')
    .replace(/[,()*\\%]/g, ' ')
    .trim()
    .slice(0, 60);
}

async function requireAdmin(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ success: false, error: 'Authorization required' });
    return null;
  }
  const { user, error: authErr } = await getServerUserWithFallback(req, getSupabase());
  if (authErr || !user) {
    res.status(401).json({ success: false, error: 'Invalid token' });
    return null;
  }
  const { data: profile } = await getSupabase()
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile || !ADMIN_ROLES.includes(profile.role)) {
    res.status(403).json({ success: false, error: 'Admin access required' });
    return null;
  }
  return user;
}

/**
 * Resolve a set of user ids to display names in ONE round trip.
 * club_members, agents and chip_transactions have no FK to profiles that
 * PostgREST can embed, so this is done explicitly rather than with `select(...)`
 * embedding — an embed that silently fails is exactly how the old tab ended up
 * showing "Unknown" for every member.
 */
async function resolveProfiles(ids) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  if (unique.length === 0) return {};
  const { data } = await getSupabase()
    .from('profiles')
    .select('id, display_name, username, email, player_number, avatar_url')
    .in('id', unique.slice(0, 500));
  const map = {};
  for (const p of data || []) map[p.id] = p;
  return map;
}

function nameOf(profile, fallbackId) {
  if (!profile) return fallbackId ? `${String(fallbackId).slice(0, 8)}...` : 'Unknown';
  return profile.display_name || profile.username || profile.email || `${String(profile.id).slice(0, 8)}...`;
}

// ── SECTION: OVERVIEW ────────────────────────────────────────────────────────
async function sectionOverview() {
  const db = getSupabase();
  const since24h = new Date(Date.now() - 86400000).toISOString();

  const [
    clubsCount, membersCount, tablesCount, cashoutsRes,
    clubsRes, unionsRes, mintsRes, txnsRes,
  ] = await Promise.all([
    db.from('clubs').select('id', { count: 'exact', head: true }),
    db.from('club_members').select('user_id', { count: 'exact', head: true }),
    db.from('tables').select('id', { count: 'exact', head: true }).in('status', ['running', 'active', 'waiting']),
    db.from('cashout_requests')
      .select('id, club_id, player_id, agent_id, amount, status, player_note, agent_note, created_at')
      .eq('status', 'pending').order('created_at', { ascending: false }).limit(100),
    db.from('clubs').select(CLUB_FIELDS).order('created_at', { ascending: false }).limit(200),
    db.from('unions').select('id, name, code, union_code, club_count, member_count, chip_balance, created_at')
      .order('created_at', { ascending: false }).limit(100),
    db.from('chip_transactions').select('amount, created_at')
      .in('transaction_type', MINT_TYPES).gte('created_at', since24h).limit(1000),
    db.from('chip_transactions')
      .select('id, amount, transaction_type, notes, created_at, club_id, from_user_id, to_user_id')
      .order('created_at', { ascending: false }).limit(50),
  ]);

  // Surface real failures rather than rendering a confident zero.
  const failed = [];
  const check = (label, r) => { if (r?.error) failed.push(`${label}: ${r.error.message}`); };
  check('clubs_count', clubsCount); check('members_count', membersCount);
  check('tables_count', tablesCount); check('cashouts', cashoutsRes);
  check('clubs', clubsRes); check('unions', unionsRes);
  check('mints', mintsRes); check('transactions', txnsRes);

  const clubs = clubsRes.data || [];
  const pendingCashouts = cashoutsRes.data || [];
  const recentTxns = txnsRes.data || [];

  const clubNames = {};
  for (const c of clubs) clubNames[c.id] = c.name;

  const profileMap = await resolveProfiles([
    ...pendingCashouts.map((c) => c.player_id),
    ...clubs.map((c) => c.owner_id),
  ]);

  return {
    stats: {
      totalClubs: clubsCount.count ?? null,
      totalMembers: membersCount.count ?? null,
      totalTables: tablesCount.count ?? null,
      pendingCashouts: pendingCashouts.length,
      pendingCashoutTotal: pendingCashouts.reduce((s, c) => s + Number(c.amount || 0), 0),
      totalMinted24h: (mintsRes.data || []).reduce((s, t) => s + Number(t.amount || 0), 0),
    },
    clubs: clubs.map((c) => ({ ...c, owner_name: nameOf(profileMap[c.owner_id], c.owner_id) })),
    unions: unionsRes.data || [],
    pendingCashouts: pendingCashouts.map((c) => ({
      ...c,
      club_name: clubNames[c.club_id] || null,
      player_name: nameOf(profileMap[c.player_id], c.player_id),
    })),
    finance: {
      recentTxns: recentTxns.map((t) => ({ ...t, club_name: clubNames[t.club_id] || null })),
      totalMinted24h: (mintsRes.data || []).reduce((s, t) => s + Number(t.amount || 0), 0),
      pendingCashoutTotal: pendingCashouts.reduce((s, c) => s + Number(c.amount || 0), 0),
    },
    failedSources: failed.length ? failed : undefined,
  };
}

// ── SECTION: SINGLE CLUB ─────────────────────────────────────────────────────
async function sectionClub(clubId) {
  const db = getSupabase();
  const [membersRes, agentsRes, tablesRes, cashoutsRes, txnsRes] = await Promise.all([
    // club_members has a COMPOSITE key (club_id, user_id) and NO id column.
    db.from('club_members')
      .select('club_id, user_id, role, status, chip_balance, is_bot, joined_at, created_at, last_active_at, hands_played, display_name, nickname')
      .eq('club_id', clubId).order('created_at', { ascending: false }).limit(300),
    db.from('agents')
      .select('id, user_id, club_id, role, commission_rate, credit_limit, credit_used, status, total_players, created_at')
      .eq('club_id', clubId).limit(200),
    // `max_players`, NOT max_seats.
    db.from('tables')
      .select('id, name, game_type, stakes, max_players, current_players, status, created_at')
      .eq('club_id', clubId).order('created_at', { ascending: false }).limit(200),
    db.from('cashout_requests')
      .select('id, club_id, player_id, agent_id, amount, status, player_note, agent_note, created_at')
      .eq('club_id', clubId).eq('status', 'pending').order('created_at', { ascending: false }).limit(100),
    db.from('chip_transactions')
      .select('id, amount, transaction_type, notes, created_at, from_user_id, to_user_id')
      .eq('club_id', clubId).order('created_at', { ascending: false }).limit(50),
  ]);

  const failed = [];
  const check = (label, r) => { if (r?.error) failed.push(`${label}: ${r.error.message}`); };
  check('members', membersRes); check('agents', agentsRes); check('tables', tablesRes);
  check('cashouts', cashoutsRes); check('transactions', txnsRes);

  const members = membersRes.data || [];
  const agents = agentsRes.data || [];
  const cashouts = cashoutsRes.data || [];

  const profileMap = await resolveProfiles([
    ...members.map((m) => m.user_id),
    ...agents.map((a) => a.user_id),
    ...cashouts.map((c) => c.player_id),
  ]);

  return {
    members: members.map((m) => ({
      ...m,
      // Composite key: the browser needs a stable React key and there is no id.
      row_key: `${m.club_id}:${m.user_id}`,
      player_name: m.display_name || m.nickname || nameOf(profileMap[m.user_id], m.user_id),
      email: profileMap[m.user_id]?.email || null,
      player_number: profileMap[m.user_id]?.player_number || null,
    })),
    agents: agents.map((a) => ({ ...a, player_name: nameOf(profileMap[a.user_id], a.user_id) })),
    tables: tablesRes.data || [],
    pendingCashouts: cashouts.map((c) => ({ ...c, player_name: nameOf(profileMap[c.player_id], c.player_id) })),
    recentTxns: txnsRes.data || [],
    failedSources: failed.length ? failed : undefined,
  };
}

// ── SECTION: USER SEARCH ─────────────────────────────────────────────────────
async function sectionUserSearch(rawQuery) {
  const q = sanitizeSearch(rawQuery);
  if (q.length < 2) return { results: [] };

  const filters = [
    `display_name.ilike.%${q}%`,
    `username.ilike.%${q}%`,
    `email.ilike.%${q}%`,
  ];
  // player_number is an integer column: only add the filter when the query IS a number.
  if (/^\d+$/.test(q)) filters.push(`player_number.eq.${q}`);

  const { data, error } = await getSupabase()
    .from('profiles')
    .select('id, display_name, username, email, player_number, role, is_vip, vip_tier, diamonds, created_at, last_active, avatar_url')
    .or(filters.join(','))
    .limit(25);

  if (error) throw new Error(`user_search: ${error.message}`);
  return { results: data || [] };
}

// ── SECTION: SINGLE USER ─────────────────────────────────────────────────────
async function sectionUser(userId) {
  const db = getSupabase();
  const [profileRes, membershipsRes, cashoutsRes, txnsFromRes, txnsToRes] = await Promise.all([
    db.from('profiles')
      .select('id, display_name, username, email, player_number, role, is_vip, vip_tier, diamonds, created_at, last_active, status, avatar_url')
      .eq('id', userId).maybeSingle(),
    db.from('club_members')
      .select('club_id, user_id, role, status, chip_balance, joined_at, created_at, hands_played')
      .eq('user_id', userId).limit(100),
    db.from('cashout_requests')
      .select('id, club_id, amount, status, agent_note, created_at')
      .eq('player_id', userId).order('created_at', { ascending: false }).limit(25),
    // chip_transactions has from_user_id / to_user_id — there is no user_id column.
    db.from('chip_transactions')
      .select('id, amount, transaction_type, notes, created_at, club_id, from_user_id, to_user_id')
      .eq('from_user_id', userId).order('created_at', { ascending: false }).limit(25),
    db.from('chip_transactions')
      .select('id, amount, transaction_type, notes, created_at, club_id, from_user_id, to_user_id')
      .eq('to_user_id', userId).order('created_at', { ascending: false }).limit(25),
  ]);

  const memberships = membershipsRes.data || [];
  const clubIds = [...new Set([
    ...memberships.map((m) => m.club_id),
    ...(cashoutsRes.data || []).map((c) => c.club_id),
  ].filter(Boolean))];

  let clubNames = {};
  if (clubIds.length) {
    const { data: clubs } = await db.from('clubs').select('id, name, club_id').in('id', clubIds);
    for (const c of clubs || []) clubNames[c.id] = c;
  }

  const txns = [...(txnsFromRes.data || []), ...(txnsToRes.data || [])]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 30)
    .map((t) => ({
      ...t,
      direction: t.to_user_id === userId ? 'in' : 'out',
      club_name: clubNames[t.club_id]?.name || null,
    }));

  return {
    profile: profileRes.data || null,
    memberships: memberships.map((m) => ({
      ...m,
      row_key: `${m.club_id}:${m.user_id}`,
      club_name: clubNames[m.club_id]?.name || null,
      club_code: clubNames[m.club_id]?.club_id || null,
    })),
    cashouts: (cashoutsRes.data || []).map((c) => ({ ...c, club_name: clubNames[c.club_id]?.name || null })),
    txns,
  };
}

// ── SECTION: LEDGER RECONCILIATION ───────────────────────────────────────────
/**
 * `reconcile_ledger_nightly` has been filing drift into `ledger_reconcile_log`
 * every morning and NOTHING has ever read it. As this was written the table
 * held 20,206 rows at severity `critical` for `player_wallet`, summing to
 * 3,118,287,619 chips of drift between the ledger and the stored balances.
 *
 * CLAUDE.md section 11.5 describes the machinery that files these -- the
 * `ca_seat_stack_exits` trigger, `fn_unaccounted_seat_exits()`,
 * `fn_club_chip_circulation()` -- and says in as many words that it exists to
 * make chip loss LOUD. It has been silent because the only surface that could
 * have shown it did not query it.
 */
async function sectionLedger() {
  const db = getSupabase();
  const failed = [];
  const check = (label, r) => { if (r?.error) failed.push(`${label}: ${r.error.message}`); };

  const [latestRunRes, criticalRes, warnRes, exitsRes, circulationRes] = await Promise.all([
    db.from('ledger_reconcile_log')
      .select('run_date, run_ts').order('run_ts', { ascending: false }).limit(1).maybeSingle(),
    db.from('ledger_reconcile_log')
      .select('id, run_date, run_ts, entity_type, entity_id, ledger_balance, stored_balance, drift, severity, notes')
      .eq('severity', 'critical').order('run_ts', { ascending: false }).limit(200),
    db.from('ledger_reconcile_log')
      .select('id, run_date, entity_type, entity_id, drift, severity')
      .eq('severity', 'warn').order('run_ts', { ascending: false }).limit(200),
    // fn_unaccounted_seat_exits() is the meaningful signal, not the raw table:
    // it returns only the exits of a non-zero stack that have NO matching
    // wallet credit. Both arguments default (7 days, 10 minute grace).
    db.rpc('fn_unaccounted_seat_exits'),
    // p_club_id defaults to NULL, which reports every club.
    db.rpc('fn_club_chip_circulation'),
  ]);

  check('latest_run', latestRunRes); check('critical', criticalRes);
  check('warn', warnRes); check('unaccounted_seat_exits', exitsRes); check('circulation', circulationRes);

  const critical = criticalRes.data || [];
  const warn = warnRes.data || [];
  const exits = exitsRes.data || [];

  // Counts must be exact -- the lists above are capped, and a capped list
  // rendered as a total is the exact failure this whole audit is about.
  const [criticalCount, warnCount, exitCount] = await Promise.all([
    db.from('ledger_reconcile_log').select('id', { count: 'exact', head: true }).eq('severity', 'critical'),
    db.from('ledger_reconcile_log').select('id', { count: 'exact', head: true }).eq('severity', 'warn'),
    db.from('ca_seat_stack_exits').select('id', { count: 'exact', head: true }),
  ]);

  const profileMap = await resolveProfiles([
    ...critical.filter((r) => r.entity_type === 'player_wallet').map((r) => r.entity_id),
    ...exits.map((e) => e.user_id),
  ]);

  const sortedCritical = [...critical]
    .sort((a, b) => Math.abs(Number(b.drift || 0)) - Math.abs(Number(a.drift || 0)))
    .map((r) => ({
      ...r,
      entity_name: r.entity_type === 'player_wallet'
        ? nameOf(profileMap[r.entity_id], r.entity_id)
        : null,
    }));

  return {
    lastRun: latestRunRes.data || null,
    counts: {
      critical: criticalCount.count ?? null,
      warn: warnCount.count ?? null,
      seatExitsTotal: exitCount.count ?? null,
      unaccountedSeatExits: exits.length,
    },
    // Sum of the sampled rows only, and labelled as such at the call site.
    sampledCriticalDrift: sortedCritical.reduce((s, r) => s + Math.abs(Number(r.drift || 0)), 0),
    sampleSize: sortedCritical.length,
    critical: sortedCritical,
    warn,
    // Every one of these is a non-zero stack that left a seat with no wallet
    // credit to match it. CLAUDE.md section 11.5: this is the loud failure.
    unaccountedSeatExits: exits.map((e) => ({ ...e, player_name: nameOf(profileMap[e.user_id], e.user_id) })),
    circulation: circulationRes.data ?? null,
    failedSources: failed.length ? failed : undefined,
  };
}

// ── SECTION: REVENUE ─────────────────────────────────────────────────────────
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

async function sectionRevenue() {
  const db = getSupabase();
  const failed = [];
  const check = (label, r) => { if (r?.error) failed.push(`${label}: ${r.error.message}`); };

  const now = Date.now();
  const since24h = new Date(now - 86400000).toISOString();
  const since7d = new Date(now - 7 * 86400000).toISOString();

  const [rake24Res, rake7dRes, unsettledRes, clubsRes, rakeCountRes, commissionCountRes] = await Promise.all([
    db.from('rake_records').select('rake_amount, bbj_contribution, club_id, created_at, is_tournament')
      .gte('created_at', since24h).limit(REVENUE_PAGE),
    db.from('rake_records').select('rake_amount, bbj_contribution, club_id, created_at')
      .gte('created_at', since7d).limit(REVENUE_PAGE),
    db.from('agent_commissions').select('id, club_id, user_id, amount, commission_rate, source_type, created_at')
      .is('settled_at', null).order('created_at', { ascending: false }).limit(REVENUE_PAGE),
    db.from('clubs').select('id, name, club_id').limit(200),
    db.from('rake_records').select('id', { count: 'exact', head: true }).gte('created_at', since24h),
    db.from('agent_commissions').select('id', { count: 'exact', head: true }).is('settled_at', null),
  ]);

  check('rake_24h', rake24Res); check('rake_7d', rake7dRes);
  check('unsettled_commissions', unsettledRes); check('clubs', clubsRes);

  const clubNames = {};
  for (const c of clubsRes.data || []) clubNames[c.id] = c.name;

  const rake24 = rake24Res.data || [];
  const rake7d = rake7dRes.data || [];
  const unsettled = unsettledRes.data || [];

  const sum = (rows, key) => rows.reduce((s, r) => s + Number(r[key] || 0), 0);

  // Per-club rake over the 24h page.
  const byClub = {};
  for (const r of rake24) {
    const id = r.club_id || 'unattributed';
    if (!byClub[id]) byClub[id] = { club_id: id, club_name: clubNames[id] || null, rake: 0, bbj: 0, hands: 0 };
    byClub[id].rake += Number(r.rake_amount || 0);
    byClub[id].bbj += Number(r.bbj_contribution || 0);
    byClub[id].hands += 1;
  }

  const byAgent = {};
  for (const c of unsettled) {
    const key = c.user_id || 'unassigned';
    if (!byAgent[key]) byAgent[key] = { user_id: c.user_id, club_id: c.club_id, club_name: clubNames[c.club_id] || null, amount: 0, rows: 0 };
    byAgent[key].amount += Number(c.amount || 0);
    byAgent[key].rows += 1;
  }
  const agentProfiles = await resolveProfiles(Object.keys(byAgent));
  const agentRows = Object.values(byAgent)
    .map((a) => ({ ...a, agent_name: nameOf(agentProfiles[a.user_id], a.user_id) }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 50);

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
    byClub: Object.values(byClub).sort((a, b) => b.rake - a.rake),
    unsettledCommissions: {
      total: sum(unsettled, 'amount'),
      rows: unsettled.length,
      rowCount: commissionCountRes.count ?? null,
      truncated: unsettled.length >= REVENUE_PAGE,
      byAgent: agentRows,
    },
    pageSize: REVENUE_PAGE,
    failedSources: failed.length ? failed : undefined,
  };
}

// ── SECTION: PLATFORM PULSE ──────────────────────────────────────────────────
/**
 * What is happening on the platform RIGHT NOW.
 *
 * None of this was visible anywhere in the console. As this was written
 * production had 137 live tables, 680 occupied seats and 19,563 hands dealt in
 * the previous hour, and the only tab called "Statistics" showed four numbers
 * about the blog-post engine. An operator could not answer "is the platform
 * up and busy" without writing SQL.
 *
 * Every figure here is a `count exact, head` -- no rows cross the wire.
 */
async function sectionPlatform() {
  const db = getSupabase();
  const now = Date.now();
  const h1 = new Date(now - 3600000).toISOString();
  const h24 = new Date(now - 86400000).toISOString();
  const d7 = new Date(now - 7 * 86400000).toISOString();

  const failed = [];
  const check = (label, r) => { if (r?.error) failed.push(`${label}: ${r.error.message}`); };
  const c = (r) => (r?.error ? null : (r.count ?? null));

  const [
    liveTables, waitingTables, seatedNow, hands1h, hands24h,
    signups24h, signups7d, activeUsers24h, liveTournaments,
    handsPrev24h, openTickets,
  ] = await Promise.all([
    db.from('tables').select('id', { count: 'exact', head: true }).in('status', ['running', 'active']),
    db.from('tables').select('id', { count: 'exact', head: true }).eq('status', 'waiting'),
    db.from('table_seats').select('id', { count: 'exact', head: true }).is('left_at', null),
    db.from('hand_history').select('id', { count: 'exact', head: true }).gte('created_at', h1),
    db.from('hand_history').select('id', { count: 'exact', head: true }).gte('created_at', h24),
    db.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', h24),
    db.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', d7),
    db.from('profiles').select('id', { count: 'exact', head: true }).gte('last_active', h24),
    db.from('tournaments').select('id', { count: 'exact', head: true })
      .in('status', ['running', 'registering', 'announced']),
    // The previous 24h window, so the headline number carries a direction
    // rather than sitting there with nothing to compare against.
    db.from('hand_history').select('id', { count: 'exact', head: true })
      .gte('created_at', new Date(now - 2 * 86400000).toISOString()).lt('created_at', h24),
    db.from('live_help_tickets').select('id', { count: 'exact', head: true }).eq('status', 'open'),
  ]);

  check('live_tables', liveTables); check('seated', seatedNow);
  check('hands_1h', hands1h); check('hands_24h', hands24h);
  check('signups', signups24h); check('tournaments', liveTournaments);

  const h24n = c(hands24h);
  const hPrev = c(handsPrev24h);

  return {
    platform: {
      liveTables: c(liveTables),
      waitingTables: c(waitingTables),
      seatedNow: c(seatedNow),
      hands1h: c(hands1h),
      hands24h: h24n,
      handsPrev24h: hPrev,
      // null rather than a fabricated 0% when there is nothing to compare to.
      handsTrendPct: (h24n !== null && hPrev !== null && hPrev > 0)
        ? Math.round(((h24n - hPrev) / hPrev) * 100)
        : null,
      signups24h: c(signups24h),
      signups7d: c(signups7d),
      activeUsers24h: c(activeUsers24h),
      liveTournaments: c(liveTournaments),
      openTickets: c(openTickets),
    },
    failedSources: failed.length ? failed : undefined,
  };
}

// ── SECTION: BADGES ──────────────────────────────────────────────────────────
/**
 * Counts only, cheap, fetched once on mount. The nav badges used to read state
 * that is only populated by visiting the very tab the badge points at, so they
 * were structurally incapable of telling an operator there was work waiting.
 */
async function sectionBadges() {
  const db = getSupabase();
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

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    if (!applyRateLimit(req, res, req.method === 'GET' ? LIMITS.read : LIMITS.write)) return;

    const user = await requireAdmin(req, res);
    if (!user) return;

    if (req.method === 'POST') {
      const { action, clubId, status } = req.body || {};
      if (action !== 'set_club_status') {
        return res.status(400).json({ success: false, error: 'Unknown action' });
      }
      if (!UUID_RE.test(String(clubId || ''))) {
        return res.status(400).json({ success: false, error: 'A valid clubId is required' });
      }
      if (!VALID_CLUB_STATUS.includes(status)) {
        return res.status(400).json({ success: false, error: `status must be one of: ${VALID_CLUB_STATUS.join(', ')}` });
      }
      const { data, error } = await getSupabase()
        .from('clubs').update({ status, updated_at: new Date().toISOString() })
        .eq('id', clubId).select('id, status').maybeSingle();
      if (error) {
        console.error('[club-arena-admin] set_club_status failed:', error);
        return res.status(500).json({ success: false, error: 'Could not update club status' });
      }
      if (!data) return res.status(404).json({ success: false, error: 'Club not found' });

      // Column is admin_user_id, not admin_id — verified against production.
      const { error: auditErr } = await getSupabase().from('admin_audit_log').insert({
        admin_user_id: user.id,
        action: 'club_status_change',
        target_type: 'club',
        target_id: clubId,
        details: { status },
      });
      if (auditErr) console.warn('[club-arena-admin] audit write failed:', auditErr.message);

      return res.status(200).json({ success: true, club: data });
    }

    const section = req.query.section || 'overview';

    if (section === 'overview') {
      return res.status(200).json({ success: true, ...(await sectionOverview()) });
    }
    if (section === 'club') {
      const clubId = req.query.clubId;
      if (!UUID_RE.test(String(clubId || ''))) {
        return res.status(400).json({ success: false, error: 'A valid clubId is required' });
      }
      return res.status(200).json({ success: true, ...(await sectionClub(clubId)) });
    }
    if (section === 'ledger') {
      return res.status(200).json({ success: true, ...(await sectionLedger()) });
    }
    if (section === 'revenue') {
      return res.status(200).json({ success: true, ...(await sectionRevenue()) });
    }
    if (section === 'badges') {
      return res.status(200).json({ success: true, ...(await sectionBadges()) });
    }
    if (section === 'platform') {
      return res.status(200).json({ success: true, ...(await sectionPlatform()) });
    }
    if (section === 'user_search') {
      return res.status(200).json({ success: true, ...(await sectionUserSearch(req.query.q)) });
    }
    if (section === 'user') {
      const userId = req.query.userId;
      if (!UUID_RE.test(String(userId || ''))) {
        return res.status(400).json({ success: false, error: 'A valid userId is required' });
      }
      return res.status(200).json({ success: true, ...(await sectionUser(userId)) });
    }

    return res.status(400).json({ success: false, error: 'Unknown section' });
  } catch (err) {
    console.error('[club-arena-admin] handler error:', err);
    try { reportApiError(err, req); } catch (_) { /* reporting must never mask the response */ }
    return res.status(500).json({ success: false, error: 'Club Arena admin request failed' });
  }
}
