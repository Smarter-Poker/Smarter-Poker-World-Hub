/**
 * Phase 3 re-verification: the adversarial review's findings, closed and pinned.
 *
 * Every test here names the finding it holds shut. They are BEHAVIOUR tests
 * wherever the behaviour can be reached without a database - the materiality
 * rule and the payload validators are pure, and /api/horses/fleet-admin's
 * `handle` takes its database as an argument, so the route's sections and its
 * one policy write can be driven against a recording stub. The three places a
 * behaviour test is impossible (the SQL mirror of the materiality rule, the
 * executor's refusal mapping, a comment that described the opposite of the
 * code) are pinned against the file text instead, and say so.
 *
 * The review's own words for why this file exists: of the 85 Phase 3 tests,
 * "none of the 24 [source-text assertions] would have caught any finding
 * above". These are written to catch them.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import {
  BIAS_MATERIAL_BELOW,
  FLEET_POLICY_REFUSAL_TEXT,
  MATERIAL_CAP_FLOOR,
  MATERIAL_CAP_MOVE,
  fleetPolicyMateriality,
} from '../src/lib/horses/fleetPolicy.js';
import {
  EXECUTION_DONE_TEXT,
  EXECUTION_UNAVAILABLE_TEXT,
  executionUnavailableText,
  payloadFor,
} from '../src/lib/horses/approvals.js';
import { handle, validateSetPolicy } from '../pages/api/horses/fleet-admin.js';

const ROOT = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, ROOT), 'utf8');

const ROUTE = 'pages/api/horses/fleet-admin.js';
const OPERATOR_ROUTE = 'pages/api/horses/operator-admin.js';
const MIGRATION = 'supabase/migrations/20260903222000_ca_horse_fleet_command.sql';

/** The global policy row as production carries it: permissive, no caps. */
const GLOBAL = Object.freeze({
  scope: 'global',
  scope_id: null,
  enabled: true,
  pause_new_seatings: false,
  max_horses: 100,
  max_per_table: 4,
  occupancy_bias: 1.0,
  min_humans_to_seat: 0,
  stake_bands: null,
  variants: null,
  schedule: null,
  notes: null,
});

const OPERATOR_ID = '00000000-0000-4000-8000-00000000ab01';
const CLUB_ID = '00000000-0000-4000-8000-00000000ac01';
const HORSE_ID = '00000000-0000-4000-8000-00000000ad01';

// ─────────────────────────────────────────────────────── a recording database

/**
 * The smallest stub the route's own calls need, and it RECORDS them, because
 * several of these findings are about what the route sent rather than what it
 * answered: which columns it selected, which target id it raised an approval
 * under, what it put in the audit row.
 *
 * `tables` maps a table name to a function returning { data, count, error };
 * an array is shorthand for a clean read of those rows. `rpcs` maps an RPC
 * name to its jsonb answer, or to a function of its arguments.
 */
function stubDb({ tables = {}, rpcs = {} } = {}) {
  const reads = [];
  const calls = [];
  const answer = (name, state) => {
    const src = tables[name];
    if (typeof src === 'function') return src(state);
    const rows = Array.isArray(src) ? src : [];
    return { data: rows, count: rows.length, error: null };
  };
  const db = {
    reads,
    calls,
    /** Every rpc call of this name, newest last. */
    rpcCalls: (name) => calls.filter((c) => c.rpc === name),
    /** The columns a table was selected with, or null if it was never read. */
    selectFor: (name) => reads.find((r) => r.table === name)?.select ?? null,
    from(table) {
      const state = { table, select: null, head: false, filters: [] };
      reads.push(state);
      const builder = {
        select(columns, options) {
          state.select = columns;
          state.head = options?.head === true;
          return builder;
        },
        eq(column, value) {
          state.filters.push(['eq', column, value]);
          return builder;
        },
        is(column, value) {
          state.filters.push(['is', column, value]);
          return builder;
        },
        not(...args) {
          state.filters.push(['not', ...args]);
          return builder;
        },
        in(column, value) {
          state.filters.push(['in', column, value]);
          return builder;
        },
        gte() {
          return builder;
        },
        order() {
          return builder;
        },
        limit() {
          return builder;
        },
        async range() {
          return answer(table, state);
        },
        async maybeSingle() {
          const res = answer(table, state);
          return { data: (res.data || [])[0] ?? null, error: res.error || null };
        },
        then(resolve, reject) {
          return Promise.resolve(answer(table, state)).then(resolve, reject);
        },
      };
      return builder;
    },
    async rpc(name, args) {
      calls.push({ rpc: name, args });
      const fn = rpcs[name];
      if (fn === undefined) return { data: null, error: new Error(`no stub for ${name}`) };
      return { data: typeof fn === 'function' ? fn(args) : fn, error: null };
    },
  };
  return db;
}

function stubOp(db, { permissions = ['fleet.read', 'fleet.write'], policy = {} } = {}) {
  return {
    db,
    user: { id: OPERATOR_ID },
    role: 'admin',
    roles: ['admin'],
    permissions,
    policy,
    requestId: 'req-reverify',
  };
}

const REQ = { headers: {}, socket: {} };
const RES = {
  statusCode: null,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
};

/** Run `handle` and return the error it threw, so a refusal can be asserted. */
async function refusal(promise) {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  return null;
}

// ══════════════════════════════════════════════════════════════════════ H-1

test('H-1: every field that can stop the fleet seating is material', () => {
  // The five the rule missed. Each of these, on the GLOBAL row, stops the
  // fleet taking a seat anywhere on the platform, and each used to be told
  // "This Change Will Be Applied Now. It Is Below The Material Line".

  // A bias of 0.1 scales every table's seat target to a tenth.
  assert.deepEqual(
    fleetPolicyMateriality(GLOBAL, { occupancy_bias: 0.1 }).reasons,
    ['occupancy_bias_cut_below_half']
  );
  // The boundary is the constant, and it is a CUT: half is material, half
  // from a lower starting point is not a cut at all.
  assert.equal(BIAS_MATERIAL_BELOW, 0.5);
  assert.deepEqual(
    fleetPolicyMateriality(GLOBAL, { occupancy_bias: 0.5 }).reasons,
    ['occupancy_bias_cut_below_half']
  );
  assert.equal(
    fleetPolicyMateriality({ ...GLOBAL, occupancy_bias: 0.4 }, { occupancy_bias: 0.5 }).material,
    false,
    'raising a bias by exactly a quarter is not a cut and is not more than 25 percent'
  );
  assert.deepEqual(
    fleetPolicyMateriality({ ...GLOBAL, occupancy_bias: 0.4 }, { occupancy_bias: 0.6 }).reasons,
    ['occupancy_bias_moved_more_than_25_percent'],
    'raising a bias off the floor is a move, not a cut to the floor'
  );
  // Above the floor the quarter rule applies, in both directions.
  assert.deepEqual(
    fleetPolicyMateriality(GLOBAL, { occupancy_bias: 2 }).reasons,
    ['occupancy_bias_moved_more_than_25_percent']
  );
  assert.deepEqual(
    fleetPolicyMateriality(GLOBAL, { occupancy_bias: 0.7 }).reasons,
    ['occupancy_bias_moved_more_than_25_percent']
  );
  assert.equal(fleetPolicyMateriality(GLOBAL, { occupancy_bias: 1.2 }).material, false, '20 percent');
  assert.equal(fleetPolicyMateriality(GLOBAL, { occupancy_bias: 1.0 }).material, false, 'no change');

  // Ten seats is the widest table, so a minimum of ten can never be met and
  // nothing is ever seated again.
  assert.deepEqual(
    fleetPolicyMateriality(GLOBAL, { min_humans_to_seat: 10 }).reasons,
    ['min_humans_to_seat_raised']
  );
  assert.deepEqual(
    fleetPolicyMateriality(GLOBAL, { min_humans_to_seat: 1 }).reasons,
    ['min_humans_to_seat_raised'],
    'one is a raise from zero'
  );
  // Lowering it hands seats back, which is not what the gate is for.
  assert.equal(
    fleetPolicyMateriality({ ...GLOBAL, min_humans_to_seat: 3 }, { min_humans_to_seat: 1 }).material,
    false
  );
  assert.equal(fleetPolicyMateriality(GLOBAL, { min_humans_to_seat: 0 }).material, false);

  // A restriction that did not exist narrows eligibility to that list alone.
  for (const [key, value] of [
    ['stake_bands', ['nl2']],
    ['variants', ['does-not-exist']],
    ['schedule', [{ start_hour: 3, end_hour: 4 }]],
  ]) {
    assert.deepEqual(
      fleetPolicyMateriality(GLOBAL, { [key]: value }).reasons,
      [`${key}_narrowed`],
      `${key} from no restriction is not material`
    );
  }
  // A shorter list is narrower; a longer one, or clearing it, is not.
  assert.deepEqual(
    fleetPolicyMateriality({ ...GLOBAL, stake_bands: ['nl2', 'nl5'] }, { stake_bands: ['nl2'] }).reasons,
    ['stake_bands_narrowed']
  );
  assert.equal(
    fleetPolicyMateriality({ ...GLOBAL, stake_bands: ['nl2'] }, { stake_bands: ['nl2', 'nl5'] }).material,
    false,
    'widening gives the fleet back seats it could not take'
  );
  assert.equal(
    fleetPolicyMateriality({ ...GLOBAL, variants: ['nlhe'] }, { variants: null }).material,
    false,
    'clearing a restriction is not a narrowing'
  );
  // Empty is the narrowest list there is, and it is not the same as null.
  assert.deepEqual(
    fleetPolicyMateriality({ ...GLOBAL, stake_bands: ['nl2'] }, { stake_bands: [] }).reasons,
    ['stake_bands_narrowed']
  );

  // The four the rule already had still behave exactly as they did.
  assert.deepEqual(fleetPolicyMateriality(GLOBAL, { enabled: false }).reasons, ['enabled_changed']);
  assert.deepEqual(
    fleetPolicyMateriality(GLOBAL, { pause_new_seatings: true }).reasons,
    ['pause_changed']
  );
  assert.equal(MATERIAL_CAP_MOVE, 0.25);
  assert.equal(fleetPolicyMateriality(GLOBAL, { max_horses: 110 }).material, false);
  assert.equal(fleetPolicyMateriality(GLOBAL, { max_horses: 125 }).material, false, 'exactly 25 is not more');
  assert.deepEqual(
    fleetPolicyMateriality(GLOBAL, { max_horses: 126 }).reasons,
    ['max_horses_moved_more_than_25_percent']
  );
  // A note is a note.
  assert.equal(fleetPolicyMateriality(GLOBAL, { notes: 'A Note' }).material, false);
  // And an untouched field cannot be material.
  assert.equal(fleetPolicyMateriality(GLOBAL, {}).material, false);
});

test('H-1: reasons are appended in one fixed order, so both copies read alike', () => {
  const all = fleetPolicyMateriality(GLOBAL, {
    schedule: [{ start_hour: 1, end_hour: 2 }],
    stake_bands: ['nl2'],
    min_humans_to_seat: 4,
    occupancy_bias: 0.2,
    max_per_table: 1,
    max_horses: 500,
    pause_new_seatings: true,
    enabled: false,
    variants: ['plo'],
  });
  assert.deepEqual(all.reasons, [
    'enabled_changed',
    'pause_changed',
    'max_horses_moved_more_than_25_percent',
    'max_per_table_cut_to_a_floor',
    'occupancy_bias_cut_below_half',
    'min_humans_to_seat_raised',
    'stake_bands_narrowed',
    'variants_narrowed',
    'schedule_narrowed',
  ]);
});

// ══════════════════════════════════════════════════════════════════════ M-7

test('M-7: a cap cut to the floor is material whatever the step size', () => {
  assert.equal(MATERIAL_CAP_FLOOR, 5);
  // The proved walk: fourteen non-material saves took a club from 100 to 3.
  // Each step is still measured against the row as it stands, so the walk is
  // only stopped once it reaches the floor - and it can no longer pass it.
  let cap = 100;
  const walk = [];
  for (let i = 0; i < 30 && cap > 1; i += 1) {
    const next = Math.max(1, Math.ceil(cap * 0.75));
    if (next === cap) break;
    const verdict = fleetPolicyMateriality({ ...GLOBAL, max_horses: cap }, { max_horses: next });
    walk.push({ from: cap, to: next, material: verdict.material, reasons: verdict.reasons });
    cap = next;
    if (verdict.material) break;
  }
  const stop = walk[walk.length - 1];
  assert.equal(stop.material, true, 'the walk never becomes material');
  assert.deepEqual(stop.reasons, ['max_horses_cut_to_a_floor']);
  assert.ok(stop.to <= MATERIAL_CAP_FLOOR, `the walk was stopped at ${stop.to}, above the floor`);
  assert.ok(stop.from > MATERIAL_CAP_FLOOR, 'the floor rule fired on a cap that was already at it');

  // Straight to the floor in one save is material too, and so is the second
  // cap column.
  assert.deepEqual(
    fleetPolicyMateriality(GLOBAL, { max_horses: 5 }).reasons,
    ['max_horses_cut_to_a_floor']
  );
  assert.deepEqual(
    fleetPolicyMateriality(GLOBAL, { max_per_table: 1 }).reasons,
    ['max_per_table_cut_to_a_floor']
  );
  // Going UP to a small number is not a cut. A cap of 4 raised to 5 stays
  // below the line, which is the direction that gives seats back.
  assert.equal(
    fleetPolicyMateriality({ ...GLOBAL, max_horses: 4 }, { max_horses: 5 }).material,
    false
  );
  // Zero keeps its own reason: it is not unlimited and it has no percentage.
  assert.deepEqual(
    fleetPolicyMateriality({ ...GLOBAL, max_horses: 0 }, { max_horses: 3 }).reasons,
    ['max_horses_changed_from_zero']
  );
  // Setting or clearing a cap outranks the floor, because a change from
  // unlimited has no size at all.
  assert.deepEqual(
    fleetPolicyMateriality({ ...GLOBAL, max_horses: null }, { max_horses: 1 }).reasons,
    ['max_horses_set_or_cleared']
  );
});

test('M-7: the cap floor is a floor, and the file says the walk window is not built', async () => {
  const source = await read('src/lib/horses/fleetPolicy.js');
  assert.match(source, /MATERIAL_CAP_FLOOR/);
  assert.match(
    source,
    /deliberately NOT in this phase/i,
    'the missing half of the M-7 fix is not written down, so a reader will think it is there'
  );
  const sql = await read(MIGRATION);
  assert.match(sql, /deliberately not in this phase/i, 'the SQL copy does not say the same thing');
});

// ══════════════════════════════════════════════════════════════════════ M-3

test('M-3: the P and L needs money.read as well as fleet.read', async () => {
  const db = stubDb({ rpcs: { fn_ca_fleet_pnl: { ok: true, rows: [], rake: 0 } } });
  const op = stubOp(db, { permissions: ['fleet.read'] });

  const err = await refusal(
    handle({
      req: REQ,
      res: RES,
      op,
      db,
      body: {},
      query: { section: 'pnl' },
      method: 'GET',
      requestId: op.requestId,
    })
  );
  assert.ok(err, 'a support account read the fleet P and L');
  assert.equal(err.status, 403);
  // A CODE THE PANEL CAN READ. The section is hidden rather than rendered as
  // an error card over a tab this operator can never open.
  assert.equal(err.code, 'money_read_required');
  assert.match(err.message, /Money Read Permission/);
  // And nothing was read on the way to the refusal.
  assert.equal(db.rpcCalls('fn_ca_fleet_pnl').length, 0);

  // With the permission it answers as before.
  const ok = await handle({
    req: REQ,
    res: RES,
    op: stubOp(db, { permissions: ['fleet.read', 'money.read'] }),
    db,
    body: {},
    query: { section: 'pnl' },
    method: 'GET',
    requestId: 'req-reverify',
  });
  assert.equal(ok.pnl.ok, true);
  assert.equal(db.rpcCalls('fn_ca_fleet_pnl').length, 1);
});

test('M-3: the horse 360 withholds the money fields and says which permission', async () => {
  const tables = {
    profiles: [{ id: HORSE_ID, username: 'horse-1', display_name: 'Horse One', is_horse: true, diamonds: 42 }],
    ca_horse_fleet_state: [{ horse_id: HORSE_ID, state: 'seated', club_id: CLUB_ID }],
    ca_horse_fleet_register: [{ horse_id: HORSE_ID, disclosed: true }],
    club_members: [{ club_id: CLUB_ID, role: 'member', status: 'active' }],
    table_seats: [],
    player_stats: [{ user_id: HORSE_ID, hands_played: 900, total_profit: 1234.5 }],
    clubs: [{ id: CLUB_ID, name: 'Club One', club_id: 'C1' }],
  };
  const rpcs = { fn_ca_operator_audit_trail: { rows: [], total: 0 } };

  const narrow = stubDb({ tables, rpcs });
  const withheld = await handle({
    req: REQ,
    res: RES,
    op: stubOp(narrow, { permissions: ['fleet.read'] }),
    db: narrow,
    body: {},
    query: { section: 'horse', horseId: HORSE_ID },
    method: 'GET',
    requestId: 'req-reverify',
  });
  // The section still answers: the rest of the 360 is not money, and a horse
  // is not withheld from a screen a human would be on.
  assert.equal(withheld.horseId, HORSE_ID);
  assert.equal(withheld.profile.username, 'horse-1');
  assert.equal(withheld.memberships.rows[0].club_label, 'Club One');
  // The two money fields are not returned, and not even selected.
  assert.equal(withheld.moneyVisible, false);
  assert.equal(withheld.moneyPermission, 'money.read');
  assert.ok(!narrow.selectFor('profiles').includes('diamonds'), 'diamonds was still selected');
  assert.ok(!narrow.selectFor('player_stats').includes('total_profit'), 'total_profit was still selected');
  assert.equal(withheld.playRecord.totalProfit, null);
  assert.equal(withheld.playRecord.totalProfitVisible, false);
  // A hand count is not money and is not withheld.
  assert.equal(withheld.playRecord.handsPlayed, 900);

  const full = stubDb({ tables, rpcs });
  const shown = await handle({
    req: REQ,
    res: RES,
    op: stubOp(full, { permissions: ['fleet.read', 'money.read'] }),
    db: full,
    body: {},
    query: { section: 'horse', horseId: HORSE_ID },
    method: 'GET',
    requestId: 'req-reverify',
  });
  assert.equal(shown.moneyVisible, true);
  assert.equal(shown.profile.diamonds, 42);
  assert.equal(shown.playRecord.totalProfit, 1234.5);
  assert.equal(shown.playRecord.totalProfitVisible, true);
});

test('M-3: no other section is narrowed by the money permission', async () => {
  const db = stubDb({
    tables: { ca_horse_fleet_state: [], clubs: [], profiles: [] },
    rpcs: {
      fn_ca_fleet_overview: { ok: true, states: {}, clubs: [] },
      fn_ca_fleet_isolation_report: { ok: true, rows: [], total: 0 },
    },
  });
  const op = stubOp(db, { permissions: ['fleet.read'] });
  for (const section of ['overview', 'roster', 'isolation']) {
    const answer = await handle({
      req: REQ,
      res: RES,
      op,
      db,
      body: {},
      query: { section },
      method: 'GET',
      requestId: 'req-reverify',
    });
    assert.ok(answer, `${section} was refused for an operator holding fleet.read`);
  }
});

// ══════════════════════════════════════════════════════════════════════ M-5

test('M-5: Per Club Allocation carries a club name, not only a uuid', async () => {
  const db = stubDb({
    tables: { clubs: [{ id: CLUB_ID, name: 'The Long Room', club_id: 'LR-1' }] },
    rpcs: {
      fn_ca_fleet_overview: {
        ok: true,
        states: { seated: 3 },
        clubs: [{ club_id: CLUB_ID, actual: 3, seated: 3, quota: 10 }],
      },
    },
  });
  const answer = await handle({
    req: REQ,
    res: RES,
    op: stubOp(db),
    db,
    body: {},
    query: { section: 'overview' },
    method: 'GET',
    requestId: 'req-reverify',
  });
  const row = answer.overview.clubs[0];
  assert.equal(row.club_label, 'The Long Room');
  assert.equal(row.club_code, 'LR-1');
  // The RPC's own fields are passed through untouched beside them.
  assert.equal(row.quota, 10);
  assert.equal(row.actual, 3);
  assert.equal(answer.labelsComplete, true);

  // A club whose name cannot be read is null and the failure is NAMED, rather
  // than the row quietly reading as an unnamed club.
  const broken = stubDb({
    tables: { clubs: () => ({ data: [], count: 0, error: new Error('clubs unavailable') }) },
    rpcs: {
      fn_ca_fleet_overview: { ok: true, states: {}, clubs: [{ club_id: CLUB_ID, actual: 1 }] },
    },
  });
  const degraded = await handle({
    req: REQ,
    res: RES,
    op: stubOp(broken),
    db: broken,
    body: {},
    query: { section: 'overview' },
    method: 'GET',
    requestId: 'req-reverify',
  });
  assert.equal(degraded.overview.clubs[0].club_label, null);
  assert.equal(degraded.labelsComplete, false);
  assert.deepEqual(degraded.failedSources, ['clubs read failed']);
});

// ══════════════════════════════════════════════════════════ M-1 and M-8

/** Everything setPolicy needs, with the two approval answers as parameters. */
function policyWriteStub({ requestApproval, markExecuted, before = GLOBAL } = {}) {
  return stubDb({
    tables: { ca_horse_fleet_policy: before ? [before] : [] },
    rpcs: {
      fn_ca_operator_request_approval: requestApproval,
      fn_ca_operator_mark_executed: markExecuted,
      fn_log_admin_action: { ok: true },
      fn_ca_fleet_set_policy: (args) => ({
        ok: true,
        created: false,
        scope: args.p_scope,
        scope_id: args.p_scope_id,
        material: true,
        material_reasons: ['enabled_changed'],
        before,
        after: { ...before, enabled: false },
        effective: { enabled: false },
      }),
    },
  });
}

const MATERIAL_BODY = Object.freeze({
  action: 'set_policy',
  scope: 'global',
  patch: { enabled: false },
  reason: 'Standing the fleet down for the maintenance window',
  opId: 'fleet-op-1',
});

async function writePolicy(db, body = MATERIAL_BODY, opOverrides = {}) {
  const op = stubOp(db, { policy: { approvalsEnabled: true }, ...opOverrides });
  return handle({
    req: REQ,
    res: RES,
    op,
    db,
    body,
    query: {},
    method: 'POST',
    requestId: op.requestId,
  });
}

test('M-1: a refused mark_executed is reported, not discarded', async () => {
  // The approval is released under the alone rule, the policy is written, and
  // fn_ca_operator_mark_executed then refuses - the row was rejected by a
  // second operator in the window, or the RPC is unreachable.
  const db = policyWriteStub({
    requestApproval: { required: false, approval_id: 'ap-1', status: 'auto_approved' },
    markExecuted: { ok: false, error: 'not_approved' },
  });
  const answer = await writePolicy(db);

  assert.equal(answer.trailClosed, false, 'the operator was told the trail closed');
  // The status is the one the row still carries, not an invented 'executed'.
  assert.equal(answer.approvalStatus, 'auto_approved');
  assert.equal(answer.approvalId, 'ap-1');

  const audit = db.rpcCalls('fn_log_admin_action').at(-1).args;
  assert.equal(audit.p_action, 'fleet.set_policy');
  assert.equal(audit.p_details.trail_closed, false);
  assert.equal(audit.p_details.mark_executed_refused, true);
  assert.equal(audit.p_details.mark_executed_reason, 'not_approved');
  assert.equal(audit.p_details.approvalStatus, 'auto_approved');

  // And the clean path says the opposite, in the same three places.
  const clean = policyWriteStub({
    requestApproval: { required: false, approval_id: 'ap-2', status: 'auto_approved' },
    markExecuted: { ok: true },
  });
  const good = await writePolicy(clean);
  assert.equal(good.trailClosed, true);
  assert.equal(good.approvalStatus, 'executed');
  const cleanAudit = clean.rpcCalls('fn_log_admin_action').at(-1).args;
  assert.equal(cleanAudit.p_details.trail_closed, true);
  assert.equal(cleanAudit.p_details.mark_executed_refused, false);
  assert.equal(cleanAudit.p_details.approvalStatus, 'executed');
  assert.equal(cleanAudit.p_details.approvalStatusBefore, 'auto_approved');
});

test('M-8: the approval is keyed by the patch, the audit row by the scope', async () => {
  const first = policyWriteStub({
    requestApproval: { required: false, approval_id: 'ap-1', status: 'auto_approved' },
    markExecuted: { ok: true },
  });
  await writePolicy(first);
  const raised = first.rpcCalls('fn_ca_operator_request_approval').at(-1).args;
  const audited = first.rpcCalls('fn_log_admin_action').at(-1).args;

  // The approval's identity covers the patch, so fn_ca_operator_request_approval
  // can see that a different patch is a different request and fire its
  // payload_mismatch guard.
  assert.match(raised.p_target_id, /^global#[0-9a-f]{8}$/);
  assert.equal(raised.p_target_type, 'fleet_policy');
  // The trail is opened by scope, so the audit row keeps the plain id. A
  // fingerprint here would split the history the way M-2 did.
  assert.equal(audited.p_target_id, 'global');

  // A DIFFERENT PATCH IS A DIFFERENT KEY.
  const second = policyWriteStub({
    requestApproval: { required: false, approval_id: 'ap-2', status: 'auto_approved' },
    markExecuted: { ok: true },
  });
  await writePolicy(second, { ...MATERIAL_BODY, patch: { max_horses: 1 } });
  const other = second.rpcCalls('fn_ca_operator_request_approval').at(-1).args;
  assert.notEqual(other.p_target_id, raised.p_target_id);

  // AND THE SAME PATCH IS THE SAME KEY, whatever order its fields arrive in,
  // or the console would raise a second approval for a change it already sent.
  const a = policyWriteStub({
    requestApproval: { required: false, approval_id: 'ap-3', status: 'auto_approved' },
    markExecuted: { ok: true },
  });
  const b = policyWriteStub({
    requestApproval: { required: false, approval_id: 'ap-4', status: 'auto_approved' },
    markExecuted: { ok: true },
  });
  await writePolicy(a, { ...MATERIAL_BODY, patch: { enabled: false, max_horses: 1 } });
  await writePolicy(b, { ...MATERIAL_BODY, patch: { max_horses: 1, enabled: false } });
  assert.equal(
    a.rpcCalls('fn_ca_operator_request_approval').at(-1).args.p_target_id,
    b.rpcCalls('fn_ca_operator_request_approval').at(-1).args.p_target_id
  );

  // The scope is still in the key, so two clubs never share one.
  const club = policyWriteStub({
    requestApproval: { required: false, approval_id: 'ap-5', status: 'auto_approved' },
    markExecuted: { ok: true },
  });
  await writePolicy(club, { ...MATERIAL_BODY, scope: 'club', scopeId: CLUB_ID });
  assert.match(
    club.rpcCalls('fn_ca_operator_request_approval').at(-1).args.p_target_id,
    new RegExp(`^club:${CLUB_ID}#[0-9a-f]{8}$`)
  );
});

test('M-8: a key that has already run is refused before the RPC is touched', async () => {
  const db = policyWriteStub({
    requestApproval: {
      required: false,
      approval_id: 'ap-1',
      status: 'executed',
      already_executed: true,
    },
    markExecuted: { ok: true },
  });
  const err = await refusal(writePolicy(db));
  assert.ok(err, 'a completed approval let a second patch through');
  assert.equal(err.status, 409);
  assert.equal(err.code, 'already_executed');
  // NOTHING WAS WRITTEN. fn_ca_fleet_set_policy is an upsert with no key of
  // its own, so reaching it at all would have applied the change.
  assert.equal(db.rpcCalls('fn_ca_fleet_set_policy').length, 0);
  assert.equal(db.rpcCalls('fn_ca_operator_mark_executed').length, 0);
});

test('M-8: a below-the-line change raises no approval and is unaffected', async () => {
  // Section 0 of PHASE2-CONTRACTS: nothing here may block a move that works
  // today. A note is not material, so it never reaches the approval path.
  const db = policyWriteStub({ requestApproval: undefined, markExecuted: undefined });
  const answer = await writePolicy(db, { ...MATERIAL_BODY, patch: { notes: 'A Note' } });
  assert.equal(db.rpcCalls('fn_ca_operator_request_approval').length, 0);
  assert.equal(db.rpcCalls('fn_ca_fleet_set_policy').length, 1);
  assert.equal(answer.approvalId, null);
  assert.equal(answer.trailClosed, true, 'there was no approval row, so nothing was left open');
});

// ══════════════════════════════════════════════════════════════════════ M-4

test('M-4: the executor reads both refusal spellings and both vocabularies', async () => {
  const source = await read(OPERATOR_ROUTE);
  const executor = source.slice(source.indexOf('if (!result || result.ok !== true) {'));
  // fn_ca_mint answers `{ ok:false, reason }`; fn_ca_fleet_set_policy answers
  // `{ ok:false, error, message }`. Reading one spelling collapsed every
  // fleet refusal to `execution_refused`.
  assert.match(executor.slice(0, 900), /result\?\.reason/);
  assert.match(executor.slice(0, 900), /result\?\.error/);
  // The code reaches the operator, the row and the audit row.
  assert.match(executor.slice(0, 1600), /FLEET_POLICY_REFUSAL_TEXT\[code\]/);
  assert.ok(
    source.includes("import { FLEET_POLICY_REFUSAL_TEXT } from '../../../src/lib/horses/fleetPolicy.js';"),
    'the executor does not import the refusal sentences it now uses'
  );
  // And a fleet change is not described as a money operation on either path.
  assert.ok(
    !executor.slice(0, 1600).includes("message: 'The Money Operation Refused The Approved Request',"),
    'the money sentence is still unconditional'
  );
  assert.match(source, /message: executionUnavailableText\(kind\)/);
  assert.ok(
    !source.includes("message: 'The Money Operation Could Not Be Reached',"),
    'the unreachable path still calls a fleet change a money operation'
  );
});

test('M-4: every executable kind has an unavailable sentence, and it is honest', () => {
  assert.equal(EXECUTION_UNAVAILABLE_TEXT.fleet_policy, 'The Fleet Policy Could Not Be Written');
  assert.equal(executionUnavailableText('fleet_policy'), 'The Fleet Policy Could Not Be Written');
  assert.equal(executionUnavailableText('mint'), 'The Money Operation Could Not Be Reached');
  // An unknown kind falls back to something true rather than to a money
  // sentence, which is the whole reason the table exists.
  assert.equal(executionUnavailableText('sanction'), 'The Approved Operation Could Not Be Reached');
  assert.ok(!/money/i.test(executionUnavailableText('fleet_policy')));
  assert.ok(!/money/i.test(EXECUTION_DONE_TEXT.fleet_policy));
  for (const [kind, sentence] of Object.entries(EXECUTION_UNAVAILABLE_TEXT)) {
    assert.ok(sentence.length > 0, `${kind} has no sentence`);
    // Title Case, house rule: every word starts upper case.
    for (const word of sentence.split(' ')) {
      assert.match(word, /^[A-Z]/, `not Title Case in ${kind}: ${sentence}`);
    }
  }
  // Every code fn_ca_fleet_set_policy can answer with has an English sentence.
  for (const code of [
    'unknown_scope',
    'scope_id_not_allowed',
    'scope_id_required',
    'invalid_patch',
    'actor_required',
    'unknown_field',
    'invalid_type',
    'not_an_integer',
    'negative_cap',
    'min_humans_out_of_range',
    'bias_out_of_range',
    'invalid_array',
    'invalid_schedule',
  ]) {
    assert.ok(FLEET_POLICY_REFUSAL_TEXT[code], `no operator sentence for ${code}`);
  }
});

// ══════════════════════════════════════════════════════════════════════ L-7

test('L-7: the executor no longer lists fleet_policy among the kinds it cannot run', async () => {
  const source = await read(OPERATOR_ROUTE);
  const branch = source.slice(source.indexOf('if (!isExecutableKind(kind)) {'));
  const comment = branch.slice(0, branch.indexOf('return {'));
  assert.match(comment, /cashout and sanction/);
  assert.ok(
    !/^\s*\/\/ cashout, fleet_policy and sanction/m.test(comment),
    'the comment still names fleet_policy as unexecutable'
  );
});

// ══════════════════════════════════════════════════════════════════════ L-8

test('L-8: the stored payload is validated by VALUE, not only by field name', () => {
  const validate = payloadFor('fleet_policy');
  const base = {
    action: 'set_policy',
    scope: 'global',
    scopeId: null,
    updatedBy: OPERATOR_ID,
    reason: 'Standing the fleet down for the maintenance window',
    opId: 'fleet-op-1',
  };
  const ok = validate({ ...base, patch: { max_horses: 10 } }, 'fleet-op-1');
  assert.equal(ok.ok, true);
  assert.equal(ok.rpc, 'fn_ca_fleet_set_policy');

  // Each of these used to reach fn_ca_fleet_set_policy and come back as a
  // snake_case refusal the operator then had to interpret.
  for (const patch of [
    { max_horses: -5 },
    { max_horses: 2.5 },
    { max_horses: 'ten' },
    { occupancy_bias: 0 },
    { occupancy_bias: 99 },
    { min_humans_to_seat: 11 },
    { enabled: 'yes' },
    { stake_bands: 'nl2' },
    { stake_bands: [''] },
    { schedule: [{ start_hour: 25, end_hour: 4 }] },
    { schedule: [{ start_hour: 1 }] },
    { notes: 12 },
    { not_a_field: 1 },
  ]) {
    const refused = validate({ ...base, patch }, 'fleet-op-1');
    assert.equal(refused.ok, false, `accepted ${JSON.stringify(patch)}`);
    assert.equal(refused.reason, 'payload_patch_invalid');
    // The operator gets the sentence, not the code.
    assert.match(refused.message, /^[A-Z]/);
    assert.ok(refused.message.length > 10, `no usable sentence for ${JSON.stringify(patch)}`);
  }
});

// ══════════════════════════════════════════════════════════════════════ L-9

test('L-9: validateSetPolicy is exercised, refusal by refusal', () => {
  const good = {
    scope: 'global',
    patch: { enabled: false },
    reason: 'Standing the fleet down for the maintenance window',
    opId: 'fleet-op-1',
  };
  const accepted = validateSetPolicy(good);
  assert.equal(accepted.scope, 'global');
  assert.equal(accepted.scopeId, null);
  assert.deepEqual(accepted.fields, ['enabled']);
  assert.equal(accepted.opId, 'fleet-op-1');

  const club = validateSetPolicy({ ...good, scope: 'club', scopeId: CLUB_ID });
  assert.equal(club.scope, 'club');
  assert.equal(club.scopeId, CLUB_ID);

  const cases = [
    [{ ...good, scope: 'planet' }, /Global, Club Or Union/],
    [{ ...good, scope: 'club' }, /Pick A Valid Club Or Union/],
    [{ ...good, scope: 'club', scopeId: 'not-a-uuid' }, /Pick A Valid Club Or Union/],
    [{ ...good, scopeId: CLUB_ID }, /Has No Club Or Union Attached/],
    [{ ...good, patch: {} }, /Nothing Was Changed/],
    [{ ...good, patch: { nope: 1 } }, /Carries No Field Called nope/],
    [{ ...good, patch: { max_horses: -1 } }, /Cannot Be Negative/],
    [{ ...good, reason: 'too short' }, /At Least Ten Characters/],
    [{ ...good, reason: '' }, /At Least Ten Characters/],
    [{ ...good, opId: '' }, /Missing Idempotency Key/],
  ];
  for (const [body, message] of cases) {
    let thrown = null;
    try {
      validateSetPolicy(body);
    } catch (err) {
      thrown = err;
    }
    assert.ok(thrown, `accepted ${JSON.stringify(body)}`);
    assert.equal(thrown.status, 400);
    assert.match(thrown.message, message);
  }
});

// ══════════════════════════════════════════════════════════════════════ L-10

test('L-10: a before-count that could not be read says so', async () => {
  const failing = stubDb({
    tables: {
      ca_horse_fleet_register: () => ({ data: [], count: null, error: new Error('register unavailable') }),
    },
    rpcs: {
      fn_ca_fleet_register_sync: { ok: true, inserted: 2, retired: 0, unretired: 0, total: 9, active: 9, audited: true },
      fn_log_admin_action: { ok: true },
    },
  });
  const op = stubOp(failing);
  const answer = await handle({
    req: REQ,
    res: RES,
    op,
    db: failing,
    body: { action: 'sync_register', reason: 'Weekly disclosure sync' },
    query: {},
    method: 'POST',
    requestId: op.requestId,
  });
  // The sync itself is the action and is not refused by a failed commentary
  // read; but "not known" and "the register was empty" stop being the same
  // sentence.
  assert.equal(answer.result.inserted, 2);
  assert.equal(answer.before.total, null);
  assert.equal(answer.beforeComplete, false);
  assert.equal(answer.before.complete, false);
  assert.ok(answer.failedSources.length > 0, 'the failed source is not named');

  const audit = failing.rpcCalls('fn_log_admin_action').at(-1).args;
  assert.equal(audit.p_details.beforeComplete, false);
  assert.equal(audit.p_before_state.total, null);

  // A clean read reports complete, and the numbers mean what they say.
  const clean = stubDb({
    tables: {
      ca_horse_fleet_register: () => ({ data: [], count: 7, error: null }),
    },
    rpcs: {
      fn_ca_fleet_register_sync: { ok: true, inserted: 0, retired: 0, unretired: 0, total: 7, active: 7, audited: true },
      fn_log_admin_action: { ok: true },
    },
  });
  const good = await handle({
    req: REQ,
    res: RES,
    op: stubOp(clean),
    db: clean,
    body: { action: 'sync_register' },
    query: {},
    method: 'POST',
    requestId: 'req-reverify',
  });
  assert.equal(good.before.total, 7);
  assert.equal(good.beforeComplete, true);
  assert.equal(good.failedSources, undefined);
});

// ═══════════════════════════════════════════════════ the two copies agree

test('the console and the database compute materiality from the same rule', async () => {
  const sql = await read(MIGRATION);
  const js = await read('src/lib/horses/fleetPolicy.js');
  const fn = sql.slice(
    sql.indexOf('create or replace function public.fn_ca_fleet_set_policy'),
    sql.indexOf('$fn$;', sql.indexOf('create or replace function public.fn_ca_fleet_set_policy'))
  );
  // Every reason string this rule can produce, in both copies. The two are
  // supposed to be identical; a reason in one and not the other is the exact
  // silent disagreement the route's preview-versus-verdict check exists to
  // catch after the fact.
  for (const reason of [
    'enabled_changed',
    'pause_changed',
    'occupancy_bias_cut_below_half',
    'occupancy_bias_moved_more_than_25_percent',
    'min_humans_to_seat_raised',
  ]) {
    assert.ok(js.includes(`'${reason}'`), `the console does not raise ${reason}`);
    assert.ok(fn.includes(`'${reason}'`), `the database does not raise ${reason}`);
  }
  for (const suffix of [
    '_set_or_cleared',
    '_changed_from_zero',
    '_cut_to_a_floor',
    '_moved_more_than_25_percent',
    '_narrowed',
  ]) {
    assert.ok(js.includes(suffix), `the console does not raise ${suffix}`);
    assert.ok(fn.includes(suffix), `the database does not raise ${suffix}`);
  }
  // The two thresholds are numbers in both copies and they are the same two.
  assert.equal(MATERIAL_CAP_FLOOR, 5);
  assert.equal(BIAS_MATERIAL_BELOW, 0.5);
  assert.match(fn, /v_new_cap <= 5/);
  assert.match(fn, /v_new_bias <= 0\.5/);
  assert.match(fn, /> 0\.25/);
});

test('the route and the contract still describe the same material line', async () => {
  const contract = await read('docs/horses/PHASE3-CONTRACTS.md');
  for (const reason of [
    'occupancy_bias_cut_below_half',
    'min_humans_to_seat_raised',
    'stake_bands_narrowed',
    'max_horses_cut_to_a_floor',
  ]) {
    assert.ok(contract.includes(reason), `the contract does not name ${reason}`);
  }
  // And the contract records the money permission the two sections now need.
  assert.match(contract, /money_read_required/);

  // The route still gates on the PREVIEW, before the write, which is the only
  // reason the console keeps its own copy of the rule at all.
  const route = await read(ROUTE);
  const write = route.indexOf("'fn_ca_fleet_set_policy'");
  const gate = route.indexOf('if (preview.material)');
  const requireCall = route.indexOf('await requireApproval(');
  assert.ok(gate > -1 && requireCall > -1 && write > -1);
  assert.ok(gate < requireCall, 'the materiality gate runs after the approval');
  assert.ok(requireCall < write, 'requireApproval runs after fn_ca_fleet_set_policy');
});

test('no horse is excluded from anything a human is in, and nothing here evicts', async () => {
  // CLAUDE.md 10.5, checked over the files this pass changed rather than
  // assumed from the previous one.
  for (const path of [
    ROUTE,
    'src/lib/horses/fleetPolicy.js',
    'src/lib/horses/approvals.js',
    MIGRATION,
  ]) {
    const source = await read(path);
    assert.ok(!/\bbots?\b/i.test(source), `${path} calls a horse a bot`);
    // Escaped, so this file does not itself carry the characters it forbids.
    assert.ok(!source.includes('\u2014'), `${path} contains an em dash`);
    assert.ok(!source.includes('\u2013'), `${path} contains an en dash`);
    assert.ok(!/\.single\(\)/.test(source), `${path} uses .single()`);
    assert.ok(!/p_include_horses|includeHorses/.test(source), `${path} makes horses opt-in`);
  }
  // The money gate withholds a FIGURE from an operator, never a horse from a
  // figure: the fields it hides are the same fields it would hide for a human
  // account, and no read on this route filters on is_horse.
  const route = await read(ROUTE);
  assert.ok(!/is_horse.*!==|!is_horse|not\.is_horse/.test(route), 'the route filters a horse out of a read');
});
