/**
 * CLUB ARENA PLATFORM ADMIN API
 * GET  /api/horses/club-arena-admin?section=overview
 * GET  /api/horses/club-arena-admin?section=club&clubId=<uuid>
 * GET  /api/horses/club-arena-admin?section=user_search&q=<text>
 * GET  /api/horses/club-arena-admin?section=user&userId=<uuid>
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
