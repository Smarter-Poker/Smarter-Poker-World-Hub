/**
 * FLEET COMMAND - the horse fleet, as an operator can see it and shape it.
 *
 * GET  /api/horses/fleet-admin?section=overview&windowMinutes=
 * GET  /api/horses/fleet-admin?section=roster&state=&clubId=&band=&limit=&offset=
 * GET  /api/horses/fleet-admin?section=horse&horseId=&trailTargetType=
 * GET  /api/horses/fleet-admin?section=policy&clubId=&limit=&offset=
 * GET  /api/horses/fleet-admin?section=isolation&limit=&offset=
 * GET  /api/horses/fleet-admin?section=pnl&from=&to=&clubId=
 * GET  /api/horses/fleet-admin?section=register&status=&limit=&offset=
 * GET  /api/horses/fleet-admin?section=heartbeat&windowHours=&limit=&offset=
 *
 * POST /api/horses/fleet-admin { action: 'set_policy', scope, scopeId, patch, reason, opId }
 * POST /api/horses/fleet-admin { action: 'sync_register', reason }
 *
 * PHASE3-CONTRACTS.md SECTION 0 OUTRANKS EVERYTHING BELOW.
 *
 *   THE FLEET KEEPS RUNNING EXACTLY AS IT DOES TODAY UNTIL A POLICY ROW SAYS
 *   OTHERWISE, AND NO CONTROL MAY REACH INSIDE A HAND.
 *
 * Which has three consequences this file is built around:
 *
 *   1. EVERY READ HERE IS A READ. Nothing on this route seats a horse,
 *      unseats one, funds one or touches a hand. There is no eviction action
 *      and no chip movement of any kind. The only two writes are a policy row
 *      and the GLI-19 disclosure register.
 *   2. THE KILL SWITCH IS `pause_new_seatings`, and its whole meaning is
 *      "seat nobody NEW". A stopped fleet drains through the paths that
 *      already exist. This route cannot remove a seated horse because there
 *      is nothing here, and nothing in the database, that could.
 *   3. HORSES ARE PLAYERS (CLAUDE.md 10.5). `is_horse` appears here only as
 *      IDENTIFICATION - a roster field, a badge, the register's subject. No
 *      read on this route excludes a horse from a total a human would be in,
 *      and the capacity figures deliberately count every seat rather than
 *      only the fleet's.
 *
 * MAKER-CHECKER, AND WHY THE ROUTE HAS TO PREDICT MATERIALITY.
 *
 * A MATERIAL policy change goes through `requireApproval` with kind
 * `fleet_policy`, exactly as the Mint does, and answers 202 while it waits.
 * `fn_ca_fleet_set_policy` reports `material` and `material_reasons` - but it
 * reports them AFTER it has written the row, so the route cannot gate on that
 * answer. It reads the row first and computes the same verdict from
 * src/lib/horses/fleetPolicy.js, which mirrors the RPC's rule line for line,
 * gates on the preview, and then compares the preview against what the RPC
 * returned. A disagreement is recorded in the audit row rather than swallowed,
 * because the two are supposed to be identical and the trail is the only place
 * anybody would find out that they are not.
 *
 * With approvals OFF - the default and the state of production today - the
 * approval call records an auto_approved row and returns required:false, so a
 * material change writes immediately, exactly as it would have without any of
 * this. Section 0 of PHASE2-CONTRACTS: nothing here may block a move that
 * works today.
 *
 * WHY THE SERVICE ROLE. All four ca_horse_fleet_* tables have RLS on with no
 * policy for anon or authenticated, so a browser holding an operator JWT reads
 * zero rows from every one of them. The wrapper's service-role client is the
 * only client this route ever sees.
 *
 * DEFENSIVE READS. The four report RPCs read tables this feature does not own
 * and answer with an empty section plus a named `sources` entry when one is
 * missing, rather than raising. This route keeps that contract: a section that
 * says "no data, and here is which source was missing" is useful, one that
 * 500s is not, and a total is never invented to fill the gap.
 */
import { withOperatorRoute } from '../../../src/lib/horses/operatorRoute.js';
import { PERMISSIONS, hasPermission } from '../../../src/lib/horses/permissions.js';
import { ApiError, badRequest } from '../../../src/lib/horses/apiEnvelope.js';
import { auditOperatorAction } from '../../../src/lib/horses/operatorAudit.js';
import {
  requireApproval,
  markApprovalExecuted,
  approvalPendingResponse,
} from '../../../src/lib/horses/approvals.js';
import {
  FLEET_POLICY_REFUSAL_TEXT,
  FLEET_POLICY_SCOPES,
  fleetPolicyMateriality,
  validateFleetPolicyPatch,
} from '../../../src/lib/horses/fleetPolicy.js';
import { stableHash } from '../../../src/lib/horses/hash.js';
import { mapDbError } from '../../../src/lib/horses/dbErrors.js';
import { runPaged } from '../../../src/lib/horses/paged.js';
import { pageFor, readByIds, shapeList, sourceCollector } from '../../../src/lib/horses/listShape.js';
import { enumOf, int, isoDate, text, uuid } from '../../../src/lib/horses/validate.js';

const SECTIONS = [
  'overview',
  'roster',
  'horse',
  'policy',
  'isolation',
  'pnl',
  'register',
  'heartbeat',
];

const ACTIONS = ['set_policy', 'sync_register'];

/** ca_horse_fleet_state.state, the check constraint's list, in its order. */
export const FLEET_STATES = Object.freeze([
  'idle',
  'seated',
  'playing',
  'sitting_out',
  'busted',
  'suspended',
  'retired',
  'unknown',
]);

/**
 * EXPLICIT ROW CAPS (PHASE1-CONTRACTS addendum item 10).
 *
 * Every list here pages, every response carries `total` and `truncated`, and
 * the cap is written down in the code that applies it so it can never shrink
 * silently. The roster default is 100 rather than 50 because the fleet is
 * roughly a thousand horses and a fifty-row page of it is not a view of
 * anything.
 */
const ROSTER_PAGE = { defaultLimit: 100, max: 500 };
const REGISTER_PAGE = { defaultLimit: 200, max: 500 };
const POLICY_PAGE = { defaultLimit: 200, max: 500 };
const ISOLATION_PAGE = { defaultLimit: 50, max: 500 };
const HEARTBEAT_PAGE = { defaultLimit: 100, max: 500 };
const TRAIL_PAGE = { defaultLimit: 50, max: 200 };
const MEMBERSHIP_PAGE = { defaultLimit: 100, max: 200 };

/** The audit trail's minimum reason length, shared with the Mint and Staff. */
const MIN_REASON_LENGTH = 10;

const STATE_FIELDS =
  'horse_id, state, club_id, table_id, seat_index, stack, last_action_at, last_seen_at, ' +
  'session_started_at, hands_this_session, lane, stake_band, bankroll, note, updated_at';

const POLICY_FIELDS =
  'scope, scope_id, enabled, pause_new_seatings, max_horses, max_per_table, occupancy_bias, ' +
  'min_humans_to_seat, stake_bands, variants, schedule, notes, updated_by, updated_at, created_at';

const REGISTER_FIELDS =
  'horse_id, disclosed, owner_entity, funding_source, created_at, registered_at, retired_at, note';

const HEARTBEAT_FIELDS =
  'id, beat_at, cycle_ms, horses_total, horses_seated, horses_idle, horses_stuck, tables_seen, ' +
  'tables_seeded, seats_filled, seats_released, policy_version, degraded, detail';

/**
 * The GLI-19 sentence. It is returned by the register section and by the sync
 * action, and it is the same sentence in both places on purpose: a disclosure
 * that reads differently depending on which screen you opened is not one.
 */
const DISCLOSURE =
  'Every Account Listed Here Is A Simulated Player Operated By The Platform And Disclosed Under GLI-19. ' +
  'A Horse Is A Player: It Buys In From The Same Club Wallet, Sits In The Same Seat And Is Paid The Same Way.';

/**
 * MONEY IS READ UNDER ITS OWN PERMISSION, EVEN HERE (review M-3).
 *
 * `spec.permission` is per METHOD, so one entry covers all eight GET
 * sections, and two of them carry money: `pnl` is fleet chips won and lost by
 * club, by stake and by day plus the rake column, and `horse` carries a
 * diamond balance and a lifetime profit. Every other money surface in this
 * console declares `money.read` - the Economy, Statistics and Mint tabs all
 * do - while `fleet.read` sits in the read floor that the `support` role holds
 * and `money.read` does not. Without this, granting a help-desk account
 * `support` hides the Economy tab from it and then shows it the same figures
 * through Fleet Command.
 *
 * So the two money-bearing sections check the narrower permission themselves.
 * The refusal carries its own code rather than the generic `forbidden`, so the
 * panel can hide the section outright instead of rendering an error card over
 * a tab the operator can never open.
 */
const MONEY_READ_REFUSAL =
  'These Are Money Figures, So They Need The Money Read Permission As Well As Fleet Read';

function requirePermission(op, permission) {
  if (hasPermission(op?.permissions, permission)) return;
  const money = permission === PERMISSIONS.MONEY_READ;
  throw new ApiError(
    403,
    money ? MONEY_READ_REFUSAL : `Permission Required: ${permission}`,
    money ? 'money_read_required' : 'permission_denied'
  );
}

// ── shared helpers ──────────────────────────────────────────────────────────

/**
 * An RPC that answers with a jsonb envelope.
 *
 * Two failure modes and they are not the same thing. A transport error (the
 * function is missing because the migration has not been applied, the
 * connection dropped) is a 503 and the database sentence is logged, never
 * returned. A well-formed `{ ok: false, error }` is the RPC refusing on
 * purpose, and its code IS the information, so it becomes a 400 carrying the
 * code and a Title Case sentence.
 */
async function callFleetRpc(db, name, args, { unavailable, refusalText = {}, requestId }) {
  const { data, error } = await db.rpc(name, args);
  if (error) {
    console.error(`[horses.fleet-admin] ${requestId || 'no-request-id'} ${name} failed:`, error.message);
    throw new ApiError(503, unavailable, `${name}_unavailable`);
  }
  if (!data || typeof data !== 'object') {
    console.error(`[horses.fleet-admin] ${requestId || 'no-request-id'} ${name} returned no payload`);
    throw new ApiError(503, unavailable, `${name}_unavailable`);
  }
  if (data.ok === false) {
    const code = typeof data.error === 'string' ? data.error : 'refused';
    throw new ApiError(400, refusalText[code] || `Refused: ${code}`, code);
  }
  return data;
}

/**
 * Display names for a set of horse ids.
 *
 * `is_horse` travels back as a BADGE, which is the identification the law
 * explicitly still allows, and it is read here so the console can show that a
 * row in the fleet state table belongs to an account that is NOT flagged as a
 * horse any more - which is a real condition the register reports and the
 * roster should not hide.
 */
async function horseLabels(db, ids, collector) {
  const read = await readByIds(db, ids, (part) =>
    db
      .from('profiles')
      .select('id, username, display_name, avatar_url, is_horse, player_number')
      .in('id', part)
  );
  if (read.error) collector.fail('profiles', read.error);
  const byId = new Map();
  for (const row of read.rows) {
    byId.set(row.id, {
      label: row.display_name || row.username || `${String(row.id).slice(0, 8)}...`,
      username: row.username || null,
      avatarUrl: row.avatar_url || null,
      isHorse: row.is_horse === true,
      playerNumber: row.player_number ?? null,
    });
  }
  return { byId, complete: !read.error && !read.partial };
}

/** Club names for a set of club ids. Same chunked read, same honesty. */
async function clubLabels(db, ids, collector) {
  const read = await readByIds(db, ids, (part) =>
    db.from('clubs').select('id, name, club_id, code').in('id', part)
  );
  if (read.error) collector.fail('clubs', read.error);
  const byId = new Map();
  for (const row of read.rows) {
    byId.set(row.id, { label: row.name || null, code: row.club_id || row.code || null });
  }
  return { byId, complete: !read.error && !read.partial };
}

/** Union names, for the union-scoped policy rows. */
async function unionLabels(db, ids, collector) {
  const read = await readByIds(db, ids, (part) =>
    db.from('unions').select('id, name, code, union_code').in('id', part)
  );
  if (read.error) collector.fail('unions', read.error);
  const byId = new Map();
  for (const row of read.rows) {
    byId.set(row.id, { label: row.name || null, code: row.union_code || row.code || null });
  }
  return { byId, complete: !read.error && !read.partial };
}

// ── READS ───────────────────────────────────────────────────────────────────

/**
 * HEALTH. Counts by state, the stuck count, heartbeat freshness, capacity and
 * per-club allocation, all from one RPC so every figure on the tab describes
 * the same instant.
 *
 * `serverNow` travels with it because heartbeat freshness is a subtraction and
 * the browser's clock is not the one the beat was stamped by. The panel
 * measures the gap against this, not against Date.now().
 *
 * THE CLUB NAMES ARE JOINED HERE (review M-5). fn_ca_fleet_overview groups
 * ca_horse_fleet_state by club_id and has no access to a club name, so Per
 * Club Allocation - the one screen an operator opens to decide which club to
 * cap - rendered a raw uuid for every row and made them copy it into the
 * Policy tab to find out which club it was. The roster, the policy list and
 * the horse 360 all join names in this route already; this is the fourth.
 */
async function sectionOverview(db, query, requestId) {
  const windowMinutes = int(query.windowMinutes, { min: 1, max: 1440, fallback: 15 });
  const c = sourceCollector({ requestId, route: 'horses.fleet-admin' });
  const data = await callFleetRpc(db, 'fn_ca_fleet_overview', { p_window_minutes: windowMinutes }, {
    unavailable: 'The Fleet Overview Is Unavailable',
    requestId,
  });

  // Only the shape this route understands is rewritten. Anything else the RPC
  // sends under `clubs` is passed through as it came, rather than replaced by
  // an empty list that would read as "no club is carrying a horse".
  const clubRows = Array.isArray(data.clubs) ? data.clubs : null;
  const clubs = await clubLabels(db, (clubRows || []).map((r) => r.club_id).filter(Boolean), c);
  const withLabels = clubRows
    ? clubRows.map((row) => ({
        ...row,
        club_label: row.club_id ? clubs.byId.get(row.club_id)?.label || null : null,
        club_code: row.club_id ? clubs.byId.get(row.club_id)?.code || null : null,
      }))
    : data.clubs;

  return {
    overview: { ...data, clubs: withLabels },
    windowMinutes,
    serverNow: new Date().toISOString(),
    labelsComplete: clubs.complete,
    failedSources: c.list(),
  };
}

/**
 * ROSTER. Every horse the engine has published a state row for, server-paged,
 * with the display fields joined on for the ids on THIS page.
 *
 * There is no free-text search here and the panel says so. The state table
 * carries no name column, so a name search would mean pre-querying profiles
 * and feeding the ids back in - a second pagination over a different list,
 * which is the exact bug PHASE1-CONTRACTS addendum item 12 was written about.
 * Filtering is by the columns the table actually has.
 */
async function sectionRoster(db, query, requestId) {
  const page = pageFor(query, 'roster', ROSTER_PAGE);
  const c = sourceCollector({ requestId, route: 'horses.fleet-admin' });

  let q = db
    .from('ca_horse_fleet_state')
    .select(STATE_FIELDS, { count: 'exact' })
    .order('last_seen_at', { ascending: false });

  const state = enumOf(query.state, FLEET_STATES);
  if (state) q = q.eq('state', state);
  const clubId = uuid(query.clubId);
  if (clubId) q = q.eq('club_id', clubId);
  const band = text(query.band, { min: 1, max: 60 });
  if (band) q = q.eq('stake_band', band);
  const lane = text(query.lane, { min: 1, max: 60 });
  if (lane) q = q.eq('lane', lane);

  const result = await runPaged(q, page);
  if (result.error) {
    throw mapDbError(result.error, 'The Fleet Roster', { requestId, route: 'horses.fleet-admin' });
  }

  const rows = result.data || [];
  const [horses, clubs] = await Promise.all([
    horseLabels(db, rows.map((r) => r.horse_id), c),
    clubLabels(db, rows.map((r) => r.club_id).filter(Boolean), c),
  ]);

  const shaped = rows.map((row) => {
    const horse = horses.byId.get(row.horse_id) || null;
    const club = row.club_id ? clubs.byId.get(row.club_id) || null : null;
    return {
      ...row,
      label: horse ? horse.label : null,
      username: horse ? horse.username : null,
      avatar_url: horse ? horse.avatarUrl : null,
      // Identification, never exclusion (CLAUDE.md 10.5).
      is_horse: horse ? horse.isHorse : null,
      player_number: horse ? horse.playerNumber : null,
      club_label: club ? club.label : null,
      club_code: club ? club.code : null,
    };
  });

  return {
    ...shapeList(result, page, shaped),
    filters: { state: state || null, clubId: clubId || null, band: band || null, lane: lane || null },
    labelsComplete: horses.complete && clubs.complete,
    failedSources: c.list(),
  };
}

/**
 * ONE HORSE, EVERYTHING THIS CONSOLE CAN SAY ABOUT IT.
 *
 * Identity and badge, the register row, the state the engine last published,
 * the clubs it belongs to, the seats it is holding right now, its lifetime
 * play record, and its audit trail through the Phase 2 trail RPC.
 *
 * WHAT IS DELIBERATELY NOT HERE: per-hand history. `hand_history` is 3.6 GB
 * over 1.5M rows, 99.95% horse-only, and horse-only hands are pruned after
 * seven days by an existing retention policy that is Dan's knob and not an
 * agent's (CLAUDE.md 10.5). A "recent hands" list read from it would be an
 * expensive scan that silently reports nothing older than a week as though it
 * never happened. The play record below is `player_stats`, which is the
 * lifetime total the platform already keeps, and it is labelled as that.
 *
 * `trailTargetType` is a parameter rather than a constant because
 * admin_audit_log rows about one account are filed under several target types
 * across this codebase (`profile`, `user`, `content_author`). The RPC takes
 * one type; the panel offers the list and the answer says which was asked.
 *
 * THE TWO MONEY FIELDS NEED `money.read` (review M-3). A diamond balance and a
 * lifetime profit are money, and money is read under its own permission
 * everywhere else in this console. The rest of the 360 is not money and is not
 * withheld, so the section still answers for a caller holding `fleet.read`
 * alone: the two fields are simply absent and `moneyVisible` says so, rather
 * than the whole horse becoming unreadable.
 */
async function sectionHorse(db, op, query, requestId) {
  const horseId = uuid(query.horseId);
  if (!horseId) throw badRequest('Pick A Valid Horse');

  const mayReadMoney = hasPermission(op?.permissions, PERMISSIONS.MONEY_READ);
  const profileFields =
    'id, username, display_name, full_name, avatar_url, is_horse, player_number, created_at, role' +
    (mayReadMoney ? ', diamonds' : '');

  const trailTargetType =
    enumOf(query.trailTargetType, ['profile', 'user', 'content_author', 'horse']) || 'profile';
  const trailPage = pageFor(query, 'trail', TRAIL_PAGE);
  const membershipPage = pageFor(query, 'memberships', MEMBERSHIP_PAGE);
  const c = sourceCollector({ requestId, route: 'horses.fleet-admin' });

  const [profileRes, stateRes, registerRes, membersRes, seatsRes, statsRes] = await Promise.all([
    db.from('profiles').select(profileFields).eq('id', horseId).maybeSingle(),
    db.from('ca_horse_fleet_state').select(STATE_FIELDS).eq('horse_id', horseId).maybeSingle(),
    db.from('ca_horse_fleet_register').select(REGISTER_FIELDS).eq('horse_id', horseId).maybeSingle(),
    runPaged(
      db
        .from('club_members')
        .select('club_id, role, status, chip_balance, joined_at', { count: 'exact' })
        .eq('user_id', horseId)
        .order('joined_at', { ascending: false }),
      membershipPage
    ),
    db
      .from('table_seats')
      // The live seat table calls it `seat_number`. `seat_index` is the name
      // ca_horse_fleet_state uses for the engine's own report of the same
      // thing, and reading it here answered 42703 into a swallowed error, so
      // the horse 360 would have shown no open seats for a seated horse.
      // Caught by the phantom-column gate before it shipped.
      .select('table_id, seat_number, user_id, joined_at')
      .eq('user_id', horseId)
      .is('left_at', null),
    db
      .from('player_stats')
      .select(mayReadMoney ? 'user_id, hands_played, total_profit' : 'user_id, hands_played')
      .eq('user_id', horseId)
      .maybeSingle(),
  ]);

  if (profileRes.error) {
    throw mapDbError(profileRes.error, 'That Horse', { requestId, route: 'horses.fleet-admin' });
  }
  c.check('ca_horse_fleet_state', stateRes);
  c.check('ca_horse_fleet_register', registerRes);
  c.check('club_members', membersRes);
  c.check('table_seats', seatsRes);
  c.check('player_stats', statsRes);

  const clubIds = [
    ...(membersRes.data || []).map((m) => m.club_id),
    stateRes.data?.club_id,
  ].filter(Boolean);
  const clubs = await clubLabels(db, clubIds, c);

  // The Phase 2 trail RPC. It answers with { rows, total } and files no audit
  // row of its own (PHASE2-CONTRACTS section 1, second correction).
  let trail = { rows: [], total: null, limit: trailPage.limit, offset: trailPage.offset };
  const trailRes = await db.rpc('fn_ca_operator_audit_trail', {
    p_target_type: trailTargetType,
    p_target_id: horseId,
    p_limit: trailPage.limit,
    p_offset: trailPage.offset,
  });
  if (trailRes.error) {
    c.fail('admin_audit_log', trailRes.error);
  } else if (trailRes.data && typeof trailRes.data === 'object') {
    const rows = Array.isArray(trailRes.data.rows) ? trailRes.data.rows : [];
    const total = typeof trailRes.data.total === 'number' ? trailRes.data.total : null;
    trail = {
      rows,
      total,
      limit: trailPage.limit,
      offset: trailPage.offset,
      hasMore: total === null ? rows.length === trailPage.limit : trailPage.offset + rows.length < total,
      truncated: total !== null && total > rows.length,
    };
  }

  const profile = profileRes.data || null;
  const memberships = (membersRes.data || []).map((m) => ({
    ...m,
    club_label: clubs.byId.get(m.club_id)?.label || null,
    club_code: clubs.byId.get(m.club_id)?.code || null,
  }));

  return {
    horseId,
    // Null rather than a 404: a horse with no profile row is exactly the case
    // the register's retired_at exists to describe, and the register row is
    // still worth showing.
    profile,
    state: stateRes.data || null,
    register: registerRes.data || null,
    memberships: shapeList(membersRes, membershipPage, memberships),
    // Renamed on the way out so the panel reads one word for the seat,
    // whichever table it came from.
    openSeats: (seatsRes.data || []).map((row) => ({
      table_id: row.table_id,
      seat_index: row.seat_number,
      user_id: row.user_id,
      joined_at: row.joined_at,
    })),
    // Lifetime, from player_stats. Named as lifetime because it is not a
    // session figure and a panel that implies otherwise is lying by omission.
    //
    // A hand count is not money and travels either way; the profit is money
    // and is null without money.read, with `totalProfitVisible` saying which
    // kind of null it is. A withheld figure and a figure of zero are
    // different answers and the panel must be able to tell them apart.
    playRecord: statsRes.data
      ? {
          handsPlayed: statsRes.data.hands_played ?? null,
          totalProfit: mayReadMoney ? statsRes.data.total_profit ?? null : null,
          totalProfitVisible: mayReadMoney,
          scope: 'lifetime',
        }
      : null,
    moneyVisible: mayReadMoney,
    moneyPermission: PERMISSIONS.MONEY_READ,
    clubLabel: stateRes.data?.club_id ? clubs.byId.get(stateRes.data.club_id)?.label || null : null,
    trail,
    trailTargetType,
    failedSources: c.list(),
  };
}

/**
 * POLICY. Every row in ca_horse_fleet_policy, plus what the ENGINE will
 * actually read for the club being looked at.
 *
 * The merge is the thing an operator needs and cannot work out by reading two
 * rows side by side, so `effective` is the RPC's answer including its `source`
 * map naming which row supplied each value. Contract section 1 describes the
 * merge as global plus club; the applied migration adds a union layer between
 * them that is inert unless somebody has written a union row, so this route
 * reports all three scopes and the panel says which one won.
 */
async function sectionPolicy(db, query, requestId) {
  const page = pageFor(query, 'policy', POLICY_PAGE);
  const clubId = uuid(query.clubId);
  const c = sourceCollector({ requestId, route: 'horses.fleet-admin' });

  const result = await runPaged(
    db
      .from('ca_horse_fleet_policy')
      .select(POLICY_FIELDS, { count: 'exact' })
      .order('scope', { ascending: true })
      .order('updated_at', { ascending: false }),
    page
  );
  if (result.error) {
    throw mapDbError(result.error, 'The Fleet Policy', { requestId, route: 'horses.fleet-admin' });
  }

  const rows = result.data || [];
  const [clubs, unions] = await Promise.all([
    clubLabels(db, rows.filter((r) => r.scope === 'club').map((r) => r.scope_id).filter(Boolean), c),
    unionLabels(db, rows.filter((r) => r.scope === 'union').map((r) => r.scope_id).filter(Boolean), c),
  ]);

  const shaped = rows.map((row) => {
    const meta =
      row.scope === 'club'
        ? clubs.byId.get(row.scope_id)
        : row.scope === 'union'
          ? unions.byId.get(row.scope_id)
          : null;
    return {
      ...row,
      scope_label: row.scope === 'global' ? 'Global' : meta?.label || null,
      scope_code: meta?.code || null,
    };
  });

  const effective = await callFleetRpc(
    db,
    'fn_ca_fleet_policy_effective',
    { p_club_id: clubId },
    { unavailable: 'The Effective Fleet Policy Is Unavailable', requestId }
  );

  return {
    ...shapeList(result, page, shaped),
    effective,
    effectiveFor: clubId ? `club:${clubId}` : 'global',
    clubId: clubId || null,
    failedSources: c.list(),
  };
}

/**
 * ISOLATION. Dan's DSS ruling: a horse plays inside its own club or union
 * only. EMPTY IS THE CORRECT ANSWER and the RPC says so in `ruling`, which is
 * passed through verbatim so the panel's empty state is the database's
 * sentence and not a second copy of it.
 */
async function sectionIsolation(db, query, requestId) {
  const page = pageFor(query, 'isolation', ISOLATION_PAGE);
  const data = await callFleetRpc(
    db,
    'fn_ca_fleet_isolation_report',
    { p_limit: page.limit, p_offset: page.offset },
    { unavailable: 'The Isolation Report Is Unavailable', requestId }
  );

  const rows = Array.isArray(data.rows) ? data.rows : [];
  const total = typeof data.total === 'number' ? data.total : null;
  return {
    rows,
    total,
    limit: page.limit,
    offset: page.offset,
    hasMore: total === null ? rows.length === page.limit : page.offset + rows.length < total,
    truncated: total !== null && total > rows.length,
    // `complete: false` means a source was missing, so a zero is not a clean
    // bill of health. The panel must never render that as "no finding".
    complete: data.complete === true,
    sources: data.sources || null,
    ruling: data.ruling || null,
    notes: Array.isArray(data.notes) ? data.notes : [],
    generatedAt: data.generated_at || null,
  };
}

/**
 * P AND L. Fleet chips by club, stake and day, with rake in its own column.
 *
 * READ ONLY AND NOTHING HERE RECOMPUTES MONEY. Every figure is a sum of rows
 * the platform already keeps, and the RPC reports in `sources` exactly which
 * table and which columns it used - which the panel renders, because a zero
 * that came from an absent source and a zero that was measured are different
 * answers and only one of them means the fleet broke even.
 *
 * IT NEEDS `money.read` (review M-3). Chips won and lost by club and by day,
 * with the rake column beside them, is the Economy tab's material under
 * another heading, and the Economy tab declares money.read.
 */
async function sectionPnl(db, op, query, requestId) {
  requirePermission(op, PERMISSIONS.MONEY_READ);
  const from = isoDate(query.from);
  const to = isoDate(query.to);
  const clubId = uuid(query.clubId);
  const data = await callFleetRpc(
    db,
    'fn_ca_fleet_pnl',
    {
      p_from: from ? from.slice(0, 10) : null,
      p_to: to ? to.slice(0, 10) : null,
      p_club_id: clubId,
    },
    {
      unavailable: 'The Fleet P And L Is Unavailable',
      refusalText: { range_inverted: 'The End Date Is Before The Start Date' },
      requestId,
    }
  );
  return { pnl: data, clubId: clubId || null };
}

/**
 * REGISTER. The GLI-19 disclosure list.
 *
 * `status` is active | retired | all, defaulting to active, because "which
 * simulated accounts are live" is the question this list is usually opened
 * for - and the retired ones are one click away rather than deleted, which is
 * the whole point of a register that never deletes a row.
 */
async function sectionRegister(db, query, requestId) {
  const page = pageFor(query, 'register', REGISTER_PAGE);
  const status = enumOf(query.status, ['active', 'retired', 'all']) || 'active';
  const c = sourceCollector({ requestId, route: 'horses.fleet-admin' });

  let q = db
    .from('ca_horse_fleet_register')
    .select(REGISTER_FIELDS, { count: 'exact' })
    .order('registered_at', { ascending: false });
  if (status === 'active') q = q.is('retired_at', null);
  if (status === 'retired') q = q.not('retired_at', 'is', null);

  const result = await runPaged(q, page);
  if (result.error) {
    throw mapDbError(result.error, 'The Fleet Register', { requestId, route: 'horses.fleet-admin' });
  }

  const rows = result.data || [];
  const horses = await horseLabels(db, rows.map((r) => r.horse_id), c);
  const shaped = rows.map((row) => {
    const horse = horses.byId.get(row.horse_id) || null;
    return {
      ...row,
      label: horse ? horse.label : null,
      username: horse ? horse.username : null,
      // A register row whose profile is gone reads `profile_present: false`.
      // That is what retired_at is stamped for, and showing it beside the row
      // is how an operator can tell a stale register from a retired horse.
      profile_present: horse !== null,
      still_flagged: horse ? horse.isHorse : null,
    };
  });

  return {
    ...shapeList(result, page, shaped),
    status,
    disclosure: DISCLOSURE,
    labelsComplete: horses.complete,
    failedSources: c.list(),
  };
}

/**
 * HEARTBEAT. The last 24 hours of engine cycles, newest first, plus the very
 * newest beat read WITHOUT the window.
 *
 * The second read is the point: if the engine has been down for two days the
 * windowed list is empty, and an empty list is exactly the shape of "no
 * heartbeat has ever been recorded". They are not the same fact and the panel
 * has to be able to tell them apart.
 */
async function sectionHeartbeat(db, query, requestId) {
  const page = pageFor(query, 'heartbeat', HEARTBEAT_PAGE);
  const windowHours = int(query.windowHours, { min: 1, max: 168, fallback: 24 });
  const since = new Date(Date.now() - windowHours * 3600 * 1000).toISOString();

  const [result, latestRes] = await Promise.all([
    runPaged(
      db
        .from('ca_horse_fleet_heartbeat')
        .select(HEARTBEAT_FIELDS, { count: 'exact' })
        .gte('beat_at', since)
        .order('beat_at', { ascending: false }),
      page
    ),
    db
      .from('ca_horse_fleet_heartbeat')
      .select(HEARTBEAT_FIELDS)
      .order('beat_at', { ascending: false })
      .limit(1),
  ]);
  if (result.error) {
    throw mapDbError(result.error, 'The Fleet Heartbeat', { requestId, route: 'horses.fleet-admin' });
  }
  const c = sourceCollector({ requestId, route: 'horses.fleet-admin' });
  c.check('ca_horse_fleet_heartbeat_latest', latestRes);

  return {
    ...shapeList(result, page),
    windowHours,
    since,
    latest: (latestRes.data || [])[0] || null,
    // Not a fabricated timestamp: the client measures the gap against this,
    // because the browser's clock is not the one the beats were stamped by.
    serverNow: new Date().toISOString(),
    failedSources: c.list(),
  };
}

// ── WRITES ──────────────────────────────────────────────────────────────────

/**
 * Validate a policy write before the round trip.
 *
 * Exported so the console's tests can exercise the same refusals the operator
 * will see, and so the panel and the route cannot drift about what a valid
 * change looks like.
 */
export function validateSetPolicy(body) {
  const scope = enumOf(String(body.scope || '').toLowerCase(), [...FLEET_POLICY_SCOPES]);
  if (!scope) throw badRequest('The Policy Scope Must Be Global, Club Or Union');

  const rawScopeId = body.scopeId ?? body.scope_id ?? null;
  const scopeId = scope === 'global' ? null : uuid(rawScopeId);
  if (scope !== 'global' && !scopeId) throw badRequest('Pick A Valid Club Or Union');
  if (scope === 'global' && rawScopeId) {
    throw badRequest('The Global Policy Row Has No Club Or Union Attached To It');
  }

  const checked = validateFleetPolicyPatch(body.patch);
  if (!checked.ok) throw new ApiError(400, checked.message, checked.error);

  const reason = text(body.reason, { min: MIN_REASON_LENGTH, max: 500 });
  if (!reason) {
    throw badRequest(
      'Write A Real Reason Of At Least Ten Characters. It Is The Only Explanation Anyone Auditing This Change Will Have'
    );
  }

  const opId = text(body.opId, { min: 1, max: 200 });
  if (!opId) throw badRequest('Missing Idempotency Key. Reload The Panel And Try Again');

  return { scope, scopeId, patch: checked.patch, fields: checked.fields, reason, opId };
}

/** `global` or `club:<uuid>`, the id the audit trail files this change under. */
function policyTargetId(scope, scopeId) {
  return scope === 'global' ? 'global' : `${scope}:${scopeId}`;
}

/**
 * THE APPROVAL'S IDENTITY HAS TO COVER THE PATCH (review M-8).
 *
 * `fn_ca_operator_request_approval` refuses a retry whose kind, amount, asset,
 * target_type or target_id differs from the row the op_id was raised under -
 * the B-3 `payload_mismatch` guard. For a mint those five fields ARE the
 * request. For a fleet policy change the request is the PATCH, and the patch
 * is not among them: `amount` and `asset` are both null and the target was
 * only the scope, so two entirely different patches for the same scope under
 * the same key were, to the database, the same request. A replay after the
 * first one reached `executed` would then read `required: false` and apply the
 * second patch with no approval at all.
 *
 * So the approval's target id carries a fingerprint of the patch and a
 * different patch is a different request, which is what makes the database's
 * own guard fire. The AUDIT rows keep `policyTargetId` unchanged, because the
 * trail is opened by scope and a fingerprint in it would split the history the
 * same way M-2 did.
 *
 * The hash is FNV-1a from src/lib/horses/hash.js and is NOT cryptographic. It
 * does not need to be: it is not a secret, not a signature and not the guard
 * itself. Its whole job is to make two different patches land on two different
 * keys so the database compares them and refuses; the database still holds the
 * stored row and still has the last word.
 */
function patchFingerprint(patch) {
  const sorted = {};
  for (const key of Object.keys(patch).sort()) sorted[key] = patch[key];
  return stableHash(JSON.stringify(sorted)).toString(16).padStart(8, '0');
}

/** The scope this change is for, a hash separator, and which change it is. */
function approvalTargetId(scope, scopeId, patch) {
  return `${policyTargetId(scope, scopeId)}#${patchFingerprint(patch)}`;
}

/**
 * WRITE A POLICY ROW.
 *
 * The order is the Mint's order and it is not negotiable: read the row,
 * predict materiality, ask for approval, and only then write. `requireApproval`
 * runs BEFORE fn_ca_fleet_set_policy and never after it.
 */
async function setPolicy(db, op, req, res, body) {
  const { scope, scopeId, patch, fields, reason, opId } = validateSetPolicy(body);
  // Two ids on purpose: the trail is opened by scope, the approval is keyed by
  // scope AND patch so a different change under the same key is refused.
  const targetId = policyTargetId(scope, scopeId);
  const approvalTarget = approvalTargetId(scope, scopeId, patch);

  // THE ROW AS IT STANDS. It is the before-state of the audit row and the
  // basis of the materiality preview, and a read failure is not allowed to be
  // read as "there is no row" - that would make every change look like a
  // creation, and a creation of a disabled row is material either way, so the
  // safe direction is to refuse.
  //
  // The global row's scope_id is NULL, which PostgREST expresses as `is.null`
  // and never as `eq.null`, so the filter is built rather than parameterised.
  let beforeQuery = db.from('ca_horse_fleet_policy').select(POLICY_FIELDS).eq('scope', scope);
  beforeQuery = scopeId === null ? beforeQuery.is('scope_id', null) : beforeQuery.eq('scope_id', scopeId);
  const beforeRes = await beforeQuery.maybeSingle();
  if (beforeRes.error) {
    console.error(
      `[horses.fleet-admin] ${op.requestId} policy read failed before a write:`,
      beforeRes.error.message
    );
    throw new ApiError(
      503,
      'The Current Policy Could Not Be Read, So Nothing Was Changed. Try Again Shortly',
      'fleet_policy_read_unavailable'
    );
  }
  const before = beforeRes.data || null;

  // MATERIALITY, PREDICTED. The RPC computes the same verdict but only after
  // it has written, so the gate has to be able to see it first. The two are
  // compared below and any disagreement is recorded.
  const preview = fleetPolicyMateriality(before, patch);

  let approval = null;
  if (preview.material) {
    approval = await requireApproval(op, req, {
      kind: 'fleet_policy',
      // A fleet policy change is not an amount. `fleet_policy` has no
      // threshold in ca_operator_policy for exactly that reason, so once
      // approvals are on every material change needs a second operator.
      amount: null,
      asset: null,
      targetType: 'fleet_policy',
      targetId: approvalTarget,
      reason,
      opId,
      payload: {
        action: 'set_policy',
        scope,
        scopeId,
        patch,
        reason,
        opId,
        // The operator the change will be FILED under when it is finally run.
        // fn_ca_fleet_set_policy refuses a null actor, and the change belongs
        // to whoever raised it, not to whoever approves it.
        updatedBy: op.user.id,
      },
    });

    if (approval.required) {
      // 202, AND NOT ONE FIELD MOVES. The audit row is filed here because
      // from the operator's point of view this request did happen; it is
      // simply waiting.
      await auditOperatorAction(op, req, {
        action: 'fleet.request_approval',
        targetType: 'fleet_policy',
        targetId,
        before: { status: 'none' },
        after: { status: approval.status, approval_id: approval.approvalId },
        details: {
          scope,
          scopeId,
          fields,
          patch,
          reason,
          opId,
          material: true,
          materialReasons: preview.reasons,
        },
      });
      return approvalPendingResponse(res, approval, {
        requestId: op.requestId,
        message:
          'Sent For Approval. This Is A Material Fleet Change, So Another Operator Must Approve It Before Anything Changes',
        extra: { material: true, materialReasons: preview.reasons, scope, scopeId },
      });
    }

    // A COMPLETED APPROVAL IS NOT AN OPEN DOOR (review M-8, second half).
    // `executed` is a released status, so the request answers required:false -
    // which is correct for a mint, whose own op_id claim makes the replay a
    // no-op, and wrong here, because fn_ca_fleet_set_policy is an upsert with
    // no key of its own and would simply apply whatever patch arrived. The
    // fingerprint above means a DIFFERENT patch under this key is refused by
    // the database; this refuses the same patch a second time, before the RPC
    // is touched at all.
    if (approval.alreadyExecuted) {
      throw new ApiError(
        409,
        'That Change Was Already Applied Under This Key. Reload The Panel',
        'already_executed'
      );
    }
  }

  const data = await callFleetRpc(
    db,
    'fn_ca_fleet_set_policy',
    {
      p_scope: scope,
      p_scope_id: scopeId,
      p_patch: patch,
      p_updated_by: op.user.id,
      p_reason: reason,
    },
    {
      unavailable: 'The Fleet Policy Could Not Be Written',
      refusalText: FLEET_POLICY_REFUSAL_TEXT,
      requestId: op.requestId,
    }
  );

  // THE TWO VERDICTS, COMPARED. They are supposed to be identical. If they
  // are not, the gate let something through that the database calls material,
  // and the audit row is the only place anybody would ever find that out.
  const disagreement = data.material === true && preview.material !== true;
  if (disagreement) {
    console.error(
      `[horses.fleet-admin] ${op.requestId} materiality disagreement on ${targetId}: ` +
        `the route predicted not material, fn_ca_fleet_set_policy answered material ` +
        `(${JSON.stringify(data.material_reasons || [])}). The change was applied without an approval.`
    );
  }

  // THE APPROVAL ROW IS CLOSED, AND THE ANSWER IS READ (review M-1, which is
  // the re-verification's M-4 reintroduced in a new route).
  // markApprovalExecuted never throws - by the time it runs the policy has
  // already changed - but `refused: true` means fn_ca_operator_mark_executed
  // would not close the row: it was moved to `rejected` by a second operator
  // in the window, or the RPC is unreachable. Discarding that told the
  // operator "Policy Saved" while the approval stayed open in the queue with
  // Run Again live for an executable kind, so the same change could be applied
  // a second time under a second audit row. It goes in the audit row, in the
  // reported status and in the response, exactly as mint.js does it.
  let trailClosed = true;
  let mark = null;
  if (approval) {
    mark = await markApprovalExecuted(op, approval.approvalId, {
      ok: true,
      scope,
      scope_id: scopeId,
      material: data.material ?? null,
      material_reasons: data.material_reasons ?? null,
    });
    trailClosed = mark.ok === true;
  }
  // The status AFTER execution, not the pre-execution one the request
  // returned: executed when the row closed, the status it still carries
  // otherwise, and null when there was no row to close.
  const approvalStatusAfter = !approval?.approvalId
    ? approval?.status ?? null
    : trailClosed
      ? 'executed'
      : approval.status;

  await auditOperatorAction(op, req, {
    action: 'fleet.set_policy',
    targetType: 'fleet_policy',
    targetId,
    before: data.before ?? before,
    after: data.after ?? null,
    details: {
      scope,
      scopeId,
      fields,
      patch,
      reason,
      opId,
      created: data.created === true,
      material: data.material === true,
      materialReasons: data.material_reasons ?? [],
      previewMaterial: preview.material,
      previewReasons: preview.reasons,
      // Loud, and in the row, not only in a log line.
      materialityDisagreement: disagreement,
      approvalId: approval?.approvalId ?? null,
      approvalStatus: approvalStatusAfter,
      approvalStatusBefore: approval?.status ?? null,
      approvalTargetId: approval ? approvalTarget : null,
      trail_closed: trailClosed,
      mark_executed_refused: mark?.refused === true,
      mark_executed_reason: mark?.reason ?? null,
    },
  });

  return {
    result: data,
    scope,
    scopeId,
    material: data.material === true,
    materialReasons: data.material_reasons ?? [],
    previewMaterial: preview.material,
    materialityDisagreement: disagreement,
    approvalId: approval?.approvalId ?? null,
    approvalStatus: approvalStatusAfter,
    trailClosed,
    effective: data.effective ?? null,
    message: data.created === true ? 'Policy Row Created' : 'Policy Saved',
  };
}

/**
 * SYNC THE GLI-19 REGISTER.
 *
 * Inserts a row for every is_horse profile that lacks one, stamps retired_at
 * on rows whose profile is gone, and un-retires anybody who is a horse again.
 * It never deletes: a deleted row cannot answer "which simulated accounts
 * were live in March", which is the only question this table exists for.
 *
 * THE ACTOR IS PASSED. `fn_ca_fleet_register_sync(p_actor uuid default null)`
 * files its own audit row only when it has an actor to file it under, and
 * returns `audited: false` with a reason when it does not (the migration's one
 * documented deviation from the contract's signature). This route always has
 * a real operator, so it always passes one, and the answer's `audited` flag is
 * returned to the panel rather than assumed.
 */
async function syncRegister(db, op, req, body) {
  const reason = body.reason === undefined || body.reason === null || body.reason === ''
    ? null
    : text(String(body.reason), { min: 1, max: 500 });
  if (body.reason && !reason) throw badRequest('A Reason Must Be Under 500 Characters');

  // The before-state, so the audit row can say what the sync actually changed
  // rather than only what the register looks like afterwards.
  //
  // A FAILED COUNT SAYS SO (review L-10). These are head reads whose errors
  // used to go unchecked, and a failure yields the same `{ total: null,
  // active: null }` an empty register does. Written into an audit row as the
  // before-state, "the read failed" and "the register was empty" are the same
  // sentence, and only one of them is true. The collector names the source and
  // `beforeComplete` says the numbers beside it are not a measurement. A
  // failure here does not refuse the sync: the sync is the action, and the
  // count is the commentary.
  const c = sourceCollector({ requestId: op.requestId, route: 'horses.fleet-admin' });
  const [totalRes, activeRes] = await Promise.all([
    db.from('ca_horse_fleet_register').select('horse_id', { count: 'exact', head: true }),
    db
      .from('ca_horse_fleet_register')
      .select('horse_id', { count: 'exact', head: true })
      .is('retired_at', null),
  ]);
  c.check('ca_horse_fleet_register_total', totalRes);
  c.check('ca_horse_fleet_register_active', activeRes);
  const beforeComplete = !totalRes.error && !activeRes.error;
  const before = {
    total: typeof totalRes.count === 'number' ? totalRes.count : null,
    active: typeof activeRes.count === 'number' ? activeRes.count : null,
    complete: beforeComplete,
  };

  const data = await callFleetRpc(
    db,
    'fn_ca_fleet_register_sync',
    { p_actor: op.user.id },
    { unavailable: 'The Register Sync Is Unavailable', requestId: op.requestId }
  );

  await auditOperatorAction(op, req, {
    action: 'fleet.sync_register',
    targetType: 'fleet_register',
    targetId: 'all',
    before,
    after: { total: data.total ?? null, active: data.active ?? null },
    details: {
      inserted: data.inserted ?? null,
      retired: data.retired ?? null,
      unretired: data.unretired ?? null,
      unflagged: data.unflagged ?? null,
      reason,
      // The RPC files its own row too, because it is a SECURITY DEFINER write.
      // Saying which of the two happened keeps the trail readable.
      rpcAudited: data.audited === true,
      sources: data.sources ?? null,
      // False means the two numbers above are unknown, not zero.
      beforeComplete,
      failedSources: c.list(),
    },
  });

  return {
    result: data,
    before,
    beforeComplete,
    failedSources: c.list(),
    disclosure: DISCLOSURE,
    message:
      `Register Synced. ${Number(data.inserted || 0)} Added, ` +
      `${Number(data.retired || 0)} Retired, ${Number(data.unretired || 0)} Restored`,
  };
}

// ── ROUTE ───────────────────────────────────────────────────────────────────

export const spec = {
  name: 'horses.fleet-admin',
  methods: ['GET', 'POST'],
  permission: { GET: PERMISSIONS.FLEET_READ, POST: PERMISSIONS.FLEET_WRITE },
  limit: { GET: 'read', POST: 'write' },
  // Durable, not in-memory. The policy row steers how many horses take seats
  // across the whole platform, and "per lambda instance" is not a ceiling.
  durable: { POST: { max: 20, windowSeconds: 60 } },
};

export async function handle({ req, res, op, db, body, query, method, requestId }) {
  if (method === 'POST') {
    const action = enumOf(body.action, ACTIONS);
    if (!action) throw badRequest('Unknown Action');
    if (action === 'set_policy') return setPolicy(db, op, req, res, body);
    return syncRegister(db, op, req, body);
  }

  const section = enumOf(String(query.section || 'overview'), SECTIONS);
  if (!section) throw badRequest('Unknown Section');

  if (section === 'overview') return sectionOverview(db, query, requestId);
  if (section === 'roster') return sectionRoster(db, query, requestId);
  if (section === 'horse') return sectionHorse(db, op, query, requestId);
  if (section === 'policy') return sectionPolicy(db, query, requestId);
  if (section === 'isolation') return sectionIsolation(db, query, requestId);
  if (section === 'pnl') return sectionPnl(db, op, query, requestId);
  if (section === 'register') return sectionRegister(db, query, requestId);
  return sectionHeartbeat(db, query, requestId);
}

export default withOperatorRoute(spec, handle);
