/**
 * /horses console - Phase 3 client contract tests (Fleet Command).
 *
 * Same split as Phase 1 and Phase 2, for the same reason: a test that only
 * asserts a string appears in a file passes happily while the function that
 * string belongs to has no caller.
 *
 * 1. BEHAVIOUR. Every decision the Fleet Command tab makes is a pure function
 *    in src/components/horses (fleetModel.js, fleetAdmin.js,
 *    fleetPolicyModel.js) or in src/lib/horses/fleetPolicy.js, and all of them
 *    are imported and exercised for real: is the engine alive, is a gap the
 *    maintenance break or an outage, what is the headroom, is an empty
 *    isolation report clean or blind, what did the P and L actually measure,
 *    what will this policy save do, and where does an old ?tab=grinder
 *    bookmark land.
 *
 * 2. CONTRACTS. There is no node_modules in this snapshot, so nothing here can
 *    render React or call a database. What is left is asserted against the
 *    WIRING - the wrapper the route is exported through, the ORDER of
 *    requireApproval against the RPC it gates, the executor the approvals queue
 *    reaches for - rather than against a declaration that may be dead.
 *
 * THE ONE THING THIS SUITE IS MOST FOR. PHASE3-CONTRACTS section 0: the fleet
 * keeps running exactly as it does today until a policy row says otherwise, and
 * no control may reach inside a hand. So the tests that must never be "fixed"
 * by loosening them are the ones that say a material change is gated BEFORE the
 * write, that the console's materiality rule is the database's rule, and that
 * nothing on this tab can remove a seated horse or move a chip.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  DEFAULT_CA_SECTION,
  DEFAULT_TAB,
  TABS,
  aliasesOf,
  findTab,
  findTabByAlias,
  resolveTabFromQuery,
  visibleTabs,
} from '../src/components/horses/tabRegistry.js';
import {
  nextUrlQuery,
  resolveInitialTab,
  urlMatchesState,
} from '../src/components/horses/urlState.js';
import {
  hasPermission,
  permittedTabs,
  relocationTarget,
} from '../src/components/horses/operatorPermissions.js';
import { permissionsForRole } from '../src/lib/horses/permissions.js';
import { normalizePolicy } from '../src/components/horses/approvalModel.js';
import {
  EXECUTABLE_APPROVAL_KINDS,
  executionDoneText,
  isExecutableKind,
  payloadFor,
} from '../src/lib/horses/approvals.js';
import {
  DEFAULT_STALE_AFTER_SECONDS,
  FLEET_STATES,
  HEARTBEAT_STATUS,
  ISOLATION_STATE,
  MAINTENANCE_BREAK,
  PNL_SOURCE_ROLES,
  capacityModel,
  classifyHeartbeat,
  clubAllocation,
  degradedNote,
  fleetStateLabel,
  formatGap,
  isInMaintenanceBreak,
  isolationState,
  lastCycleReason,
  maintenanceBreakOverlapMs,
  shapePnl,
  stakeBandLabel,
  summariseStates,
} from '../src/components/horses/fleetModel.js';
import {
  FLEET_ADMIN,
  FLEET_SECTIONS,
  MIN_REASON_LENGTH,
  REGISTER_STATUSES,
  ROSTER_STATES,
  heartbeatUrl,
  horseUrl,
  isPendingApproval,
  isolationUrl,
  listMeta,
  newFleetOpId,
  overviewUrl,
  pnlUrl,
  policyUrl,
  reasonIsValid,
  registerUrl,
  rosterFilters,
  rosterIsFiltered,
  rosterQuery,
  rosterUrl,
  rowsOf,
  setPolicyBody,
  showingLabel,
  syncRegisterBody,
} from '../src/components/horses/fleetAdmin.js';
import {
  FLEET_CAP_FIELDS,
  FLEET_POLICY_FIELDS,
  KILL_SWITCH_NOTE,
  MATERIAL_REASON_TEXT,
  SCHEDULE_NOT_EDITABLE_NOTE,
  fleetPolicyDiff,
  fleetPolicyLabel,
  fleetPolicyMateriality,
  inheritedOptionLabel,
  materialReasonText,
  sameValue,
  setPolicyPreview,
  sourceLabel,
  validateFleetPolicyPatch,
} from '../src/components/horses/fleetPolicyModel.js';
import {
  BIAS_MATERIAL_BELOW,
  MATERIAL_CAP_FLOOR,
  MATERIAL_CAP_MOVE,
} from '../src/lib/horses/fleetPolicy.js';

const ROOT = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, ROOT), 'utf8');

const ROUTE = 'pages/api/horses/fleet-admin.js';
const OPERATOR_ROUTE = 'pages/api/horses/operator-admin.js';
const PANEL = 'src/components/horses/FleetPanel.jsx';
const MIGRATION = 'supabase/migrations/20260903222000_ca_horse_fleet_command.sql';

/** The files Phase 3 owns on the client and the route side. */
const PHASE3_FILES = [
  ROUTE,
  PANEL,
  'src/components/horses/fleetAdmin.js',
  'src/components/horses/fleetModel.js',
  'src/components/horses/fleetPolicyModel.js',
  'src/lib/horses/fleetPolicy.js',
  'src/components/horses/tabRegistry.js',
];

const EM_DASH = '\u2014';
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/u;
const RAW_HEX = /#[0-9a-fA-F]{3,8}\b/;
const RAW_RGBA = /\brgba?\(\s*\d/;

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
}

const MINUTE = 60 * 1000;
const CLUB = '11111111-2222-3333-4444-555555555555';
const HORSE = '99999999-8888-7777-6666-555555555555';
const ACTOR = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

/** An instant, in UTC, so the maintenance-break arithmetic is readable. */
const at = (h, m, s = 0) => Date.UTC(2026, 8, 3, h, m, s);

// ═══════════════════════════════════════════════════════════════════════════
// HEARTBEAT FRESHNESS, INCLUDING THE MAINTENANCE-BREAK BLACKOUT
// ═══════════════════════════════════════════════════════════════════════════

test('the maintenance break is a named window, not a magic number', () => {
  assert.equal(MAINTENANCE_BREAK.startMinute, 55);
  assert.equal(MAINTENANCE_BREAK.lengthMinutes, 5);
  // Inside the break.
  assert.equal(isInMaintenanceBreak(at(11, 57)), true);
  assert.equal(isInMaintenanceBreak(at(11, 55)), true);
  // The edges: the break ends AT the hour, so the top of the hour is running.
  assert.equal(isInMaintenanceBreak(at(12, 0)), false);
  assert.equal(isInMaintenanceBreak(at(11, 54, 59)), false);
  // An unreadable instant is not a break.
  assert.equal(isInMaintenanceBreak(null), false);
  assert.equal(isInMaintenanceBreak('not a date'), false);
});

test('break overlap is measured, not assumed, and never goes backwards', () => {
  // 11:54 to 12:02 contains the whole 11:55 to 12:00 break.
  assert.equal(maintenanceBreakOverlapMs(at(11, 54), at(12, 2)), 5 * MINUTE);
  // A window that ends inside the break only counts the part it used.
  assert.equal(maintenanceBreakOverlapMs(at(11, 50), at(11, 57)), 2 * MINUTE);
  // A window entirely outside one counts nothing.
  assert.equal(maintenanceBreakOverlapMs(at(11, 10), at(11, 40)), 0);
  // Two hours of gap contains two breaks.
  assert.equal(maintenanceBreakOverlapMs(at(10, 30), at(12, 30)), 10 * MINUTE);
  // Inverted and unreadable ranges are zero, never negative.
  assert.equal(maintenanceBreakOverlapMs(at(12, 30), at(10, 30)), 0);
  assert.equal(maintenanceBreakOverlapMs(null, at(12, 0)), 0);
});

test('a heartbeat inside the threshold is fresh, and the clock is the server\'s', () => {
  const verdict = classifyHeartbeat({
    beatAt: new Date(at(12, 1)).toISOString(),
    now: at(12, 3),
    staleAfterSeconds: 300,
  });
  assert.equal(verdict.status, HEARTBEAT_STATUS.FRESH);
  assert.equal(verdict.ageSeconds, 120);
  assert.equal(verdict.loud, false);
  assert.equal(verdict.breakSeconds, 0);
  assert.equal(DEFAULT_STALE_AFTER_SECONDS, 300);
});

test('no heartbeat ever recorded is its own answer, and it is stated loudly', () => {
  const verdict = classifyHeartbeat({ beatAt: null, now: at(12, 0) });
  assert.equal(verdict.status, HEARTBEAT_STATUS.NEVER);
  assert.equal(verdict.ageSeconds, null, 'an age nobody measured is not a number');
  assert.equal(verdict.loud, true);
  // The sentence has to separate "never published" from "idle fleet", because
  // one is an engine that has not shipped and the other is an outage.
  assert.match(verdict.detail, /Not Because The Fleet Is Idle/);
});

test('THE BLACKOUT CASE: a gap that is the maintenance break does not cry wolf', () => {
  // 11:54 to 12:02 is eight minutes, which is past a five minute threshold -
  // but five of those eight are the break the engine is entitled to, so the
  // engine has in fact been publishing normally.
  const verdict = classifyHeartbeat({
    beatAt: at(11, 54),
    now: at(12, 2),
    staleAfterSeconds: 300,
  });
  assert.equal(verdict.status, HEARTBEAT_STATUS.BREAK);
  assert.equal(verdict.ageSeconds, 480);
  assert.equal(verdict.breakSeconds, 300);
  assert.equal(verdict.awakeSeconds, 180, 'the awake gap is the one that matters');
  assert.equal(verdict.loud, false, 'a known blackout is not an incident');
  assert.notEqual(verdict.tone, 'danger');
  assert.match(verdict.headline, /Maintenance Break/);
  assert.match(verdict.detail, /Known Blackout And Not An Outage/);
});

test('a real outage is loud even when part of it fell in a break', () => {
  // 11:40 to 12:02 is twenty two minutes; five of them are the break, seventeen
  // are silence the engine cannot account for.
  const verdict = classifyHeartbeat({
    beatAt: at(11, 40),
    now: at(12, 2),
    staleAfterSeconds: 300,
  });
  assert.equal(verdict.status, HEARTBEAT_STATUS.STALE);
  assert.equal(verdict.breakSeconds, 300);
  assert.equal(verdict.awakeSeconds, 22 * 60 - 300);
  assert.equal(verdict.loud, true);
  assert.equal(verdict.tone, 'danger');
  // And it says the state counts are as old as the beat, because they are.
  assert.match(verdict.detail, /As Old As That Beat/);
});

test('a stale gap with no break in it is stale, and says nothing about a break', () => {
  const verdict = classifyHeartbeat({
    beatAt: at(11, 10),
    now: at(11, 40),
    staleAfterSeconds: 300,
  });
  assert.equal(verdict.status, HEARTBEAT_STATUS.STALE);
  assert.equal(verdict.breakSeconds, 0);
  assert.ok(!verdict.detail.includes('Maintenance Break'));
});

test('a beat stamped in the future is a clock disagreement, not freshness', () => {
  const verdict = classifyHeartbeat({ beatAt: at(12, 5), now: at(12, 0) });
  assert.equal(verdict.status, HEARTBEAT_STATUS.FRESH, 'the engine plainly just wrote');
  assert.equal(verdict.clockSkew, true, 'and the skew is reported rather than hidden');
  assert.equal(verdict.loud, false);
});

test('formatGap reads like a sentence and never invents a number', () => {
  assert.equal(formatGap(1), '1 Second');
  assert.equal(formatGap(45), '45 Seconds');
  assert.equal(formatGap(60), '1 Minute');
  assert.equal(formatGap(3600), '1 Hour');
  assert.equal(formatGap(86400 * 3), '3 Days');
  assert.equal(formatGap(undefined), 'An Unknown Time');
});

// ═══════════════════════════════════════════════════════════════════════════
// STATE COUNTS AND HEADROOM
// ═══════════════════════════════════════════════════════════════════════════

test('every state is present even at zero, and the total is the RPC\'s own', () => {
  const summary = summariseStates({
    states: { playing: 3, seated: 2, idle: 5 },
    total: 10,
    stuck: 1,
  });
  assert.equal(summary.known, true);
  assert.deepEqual(summary.rows.map((r) => r.state), [...FLEET_STATES]);
  assert.equal(summary.rows.length, 8, 'a state that is zero is still a state');
  assert.equal(summary.rows.find((r) => r.state === 'busted').count, 0);
  assert.equal(summary.total, 10);
  assert.equal(summary.totalDisagrees, false);
  assert.equal(summary.seated, 5, 'seated plus playing are the two holding a seat');
  assert.equal(summary.idle, 5);
  assert.equal(summary.stuck, 1);
  assert.equal(summary.stuckShare, 1 / 5);
  assert.equal(fleetStateLabel('sitting_out'), 'Sitting Out');
  assert.equal(fleetStateLabel('not a state'), 'Unknown');
});

test('a reported total that disagrees with the counts is reported as a disagreement', () => {
  const summary = summariseStates({ states: { playing: 4 }, total: 99 });
  assert.equal(summary.total, 99, 'the RPC total wins; summing would agree with itself');
  assert.equal(summary.totalDisagrees, true, 'and the panel is told the two differ');
});

test('an unread overview counts nothing rather than counting zero', () => {
  const summary = summariseStates(null);
  assert.ok(!summary.known, 'nothing was read, so nothing is claimed');
  assert.equal(summary.total, null);
  assert.equal(summary.seated, null);
  assert.equal(summary.stuck, null);
  for (const row of summary.rows) assert.equal(row.count, null);
});

test('capacity is occupancy only when both halves were read', () => {
  const full = capacityModel({
    tables_live: 10,
    seats_total: 60,
    seats_filled: 30,
    seats_free: 30,
    sources: { tables: true, table_seats: true },
  });
  assert.equal(full.occupancy, 0.5);
  assert.equal(full.complete, true);
  assert.equal(full.note, null);
  assert.deepEqual(full.missing, []);

  const half = capacityModel({
    tables_live: 10,
    seats_total: 60,
    seats_filled: null,
    seats_free: null,
    sources: { tables: true, table_seats: false },
  });
  assert.equal(half.seatsFilled, null, 'an unread source is not zero seats');
  assert.equal(half.occupancy, null, 'a percentage of a missing number is fabrication');
  assert.deepEqual(half.missing, ['table_seats']);
  assert.match(half.note, /Not Known Rather Than As Zero/);

  const nothing = capacityModel(undefined);
  assert.equal(nothing.tablesLive, null);
  assert.equal(nothing.occupancy, null);
});

test('headroom is quota minus actual, and OVER CAP IS NOT AN EVICTION ORDER', () => {
  const rows = clubAllocation([
    { club_id: 'a', actual: 5, seated: 3, quota: 10, enabled: true, paused: false },
    { club_id: 'b', actual: 10, seated: 10, quota: 10 },
    { club_id: 'c', actual: 12, seated: 12, quota: 10 },
    { club_id: 'd', actual: 4, seated: 1, quota: null },
  ]);
  assert.deepEqual(rows.map((r) => r.status), ['under', 'at_cap', 'over_cap', 'no_quota']);
  assert.deepEqual(rows.map((r) => r.headroom), [5, 0, -2, null]);
  assert.equal(rows[0].statusLabel, 'Under Cap');
  assert.equal(rows[3].quota, null, 'no cap is not a cap of zero');
  // The sentence that keeps section 0 true on screen.
  assert.match(rows[2].note, /Seat Nobody New/);
  assert.match(rows[2].note, /Nothing Removes A Seated Horse/);
  assert.equal(rows[0].note, null);
  assert.equal(rows[0].enabled, true);
  assert.equal(rows[1].enabled, null, 'a field the row did not carry is not false');
});

test('the per-club allocation can name a club (review M-5)', () => {
  // The route joins the club names onto the overview's per-club rows, so the
  // one screen an operator opens to decide which club to cap can name the club
  // instead of showing a uuid to copy into another tab's box.
  const rows = clubAllocation([
    { club_id: 'a', actual: 5, seated: 3, quota: 10, club_label: 'The Nutcracker', club_code: 'NUT' },
    { club_id: 'b', actual: 1, seated: 1, quota: 10, club_label: null, club_code: 'ROV' },
    { club_id: 'c', actual: 1, seated: 1, quota: 10 },
  ]);
  assert.equal(rows[0].clubLabel, 'The Nutcracker');
  assert.equal(rows[0].clubCode, 'NUT');
  // The fallback chain the panel renders: label, then code, then the raw id.
  assert.equal(rows[1].clubLabel, null);
  assert.equal(rows[1].clubCode, 'ROV');
  assert.equal(rows[2].clubLabel, null);
  assert.equal(rows[2].clubCode, null);
  assert.equal(rows[2].clubId, 'c', 'and the id is still carried, so nothing is unnameable');
});

test('a withheld cycle explains itself, and an unexplained one says that instead', () => {
  const stated = lastCycleReason({
    seats_filled: 0,
    detail: { reason: 'pause_new_seatings is on for every club' },
  });
  assert.equal(stated.stated, true);
  assert.equal(stated.reason, 'pause_new_seatings is on for every club');

  const silent = lastCycleReason({ seats_filled: 0, detail: {} });
  assert.equal(silent.stated, false);
  assert.match(silent.reason, /Seated Nobody And Recorded No Reason/);

  // A cycle that seated somebody needs no reason at all.
  const busy = lastCycleReason({ seats_filled: 7, detail: null });
  assert.equal(busy.reason, null);
  assert.equal(busy.seatsFilled, 7);

  // No beat at all is not a claim either way.
  assert.deepEqual(lastCycleReason(null), { reason: null, stated: false, seatsFilled: null });
});

test('a degraded cycle says the policy tab was not in force', () => {
  assert.equal(degradedNote({ degraded: false }), null);
  assert.equal(degradedNote(null), null);
  const note = degradedNote({ degraded: true });
  assert.match(note, /Fell Back To Its Built-In Defaults/);
  assert.match(note, /Nothing On The Policy Tab Was In Force/);
});

// ═══════════════════════════════════════════════════════════════════════════
// ISOLATION - AND THE EMPTY STATE THAT IS NOT A CLEAN BILL OF HEALTH
// ═══════════════════════════════════════════════════════════════════════════

test('an empty isolation report is clean ONLY when the report could look', () => {
  const clean = isolationState({ rows: [], total: 0, complete: true, sources: { table_seats: true } });
  assert.equal(clean.kind, ISOLATION_STATE.CLEAN);
  assert.equal(clean.tone, 'good');
  assert.equal(clean.headline, 'No Horse Is In Two Clubs');

  // Zero rows and complete:false is the same SHAPE and the opposite meaning.
  const blind = isolationState({
    rows: [],
    total: 0,
    complete: false,
    sources: { table_seats: false, tables: true },
  });
  assert.equal(blind.kind, ISOLATION_STATE.INCOMPLETE);
  assert.notEqual(blind.headline, 'No Horse Is In Two Clubs');
  assert.deepEqual(blind.missing, ['table_seats']);
  assert.match(blind.detail, /Not A Clean Bill Of Health, Because Nothing Looked/);
});

test('findings are counted, and two clubs of one union are not a finding', () => {
  const one = isolationState({ rows: [{ horse_id: HORSE }], total: 1, complete: true });
  assert.equal(one.kind, ISOLATION_STATE.FINDINGS);
  assert.equal(one.tone, 'danger');
  assert.match(one.headline, /^One Horse Is Holding Seats/);

  const many = isolationState({ rows: [{}, {}], total: 2, complete: true });
  assert.match(many.headline, /^2 Horses Are Holding Seats/);
  assert.match(many.detail, /Two Clubs Of The Same Union Are One Scope/);
});

test('an unread isolation report says nothing either way', () => {
  const unknown = isolationState(null);
  assert.equal(unknown.kind, ISOLATION_STATE.UNKNOWN);
  assert.match(unknown.detail, /Says Nothing Either Way/);
  // The DSS ruling travels with every answer, and the RPC's own wording wins.
  assert.match(unknown.ruling, /Own Club Or Union Only/);
  const passed = isolationState({ rows: [], total: 0, complete: true, ruling: 'The RPC Said This' });
  assert.equal(passed.ruling, 'The RPC Said This');
  assert.equal(passed.detail, 'The RPC Said This', 'the empty state IS the database sentence');
});

test('a clean report says WHICH POPULATION it looked at (review L-12)', () => {
  // The report asks profiles.is_horse who is in the fleet and falls back to the
  // disclosure register when that column cannot be read. The query still ran,
  // so `complete` is true and the answer is clean - but a register that has
  // never been synced is a short list, and "No Horse Is In Two Clubs" over it
  // is a clean bill of health for a population nobody has sized.
  const fromRegister = isolationState({
    rows: [],
    total: 0,
    complete: true,
    sources: { table_seats: true, tables: true, union_clubs: true, profiles_is_horse: false },
  });
  assert.equal(fromRegister.kind, ISOLATION_STATE.CLEAN, 'the query ran, so it is not incomplete');
  assert.equal(fromRegister.tone, 'warn', 'and it is not a green light either');
  assert.equal(fromRegister.fleetFrom, 'register');
  assert.match(fromRegister.detail, /Identified From The Disclosure Register/);
  assert.match(fromRegister.detail, /Profiles Horse Flag, Which Could Not Be Read/);
  assert.match(fromRegister.detail, /Sync The Register/);

  // With the flag readable, nothing is appended and the tone stays green.
  const fromProfiles = isolationState({
    rows: [],
    total: 0,
    complete: true,
    ruling: 'The RPC Said This',
    sources: { table_seats: true, tables: true, union_clubs: true, profiles_is_horse: true },
  });
  assert.equal(fromProfiles.tone, 'good');
  assert.equal(fromProfiles.fleetFrom, 'profiles_is_horse');
  assert.equal(fromProfiles.detail, 'The RPC Said This');
});

// ═══════════════════════════════════════════════════════════════════════════
// P AND L - THE SOURCES NOTE IS THE POINT
// ═══════════════════════════════════════════════════════════════════════════

test('the P and L names the table and columns every figure came from', () => {
  const shaped = shapePnl({
    from: '2026-08-01',
    to: '2026-08-31',
    read_only: true,
    totals: { net: -1500, hands: 4200, rake: 275 },
    by_club: [{ club_id: CLUB, net: -1500, hands: 4200 }],
    by_stake: [{ stake_band: 'micro', net: -1500, hands: 4200 }],
    by_day: [{ day: '2026-08-01', net: -100, hands: 90 }],
    sources: {
      horse_daily_nets: {
        present: true,
        used: true,
        columns: { day: 'day', club: 'club_id', net: 'net_chips' },
      },
      ca_club_player_daily: { present: true, used: false },
      club_rake_daily_user: { present: true, used: true, columns: { rake: 'rake_amount' } },
    },
  });

  assert.equal(shaped.measured, true);
  assert.equal(shaped.rakeMeasured, true);
  assert.equal(shaped.readOnly, true);
  assert.equal(shaped.totals.net, -1500);
  assert.equal(shaped.totals.hands, 4200);
  // RAKE IS NEVER FOLDED INTO THE NET. It is the platform's revenue and the
  // net is the fleet's swing; adding them produces a meaningless number.
  assert.equal(shaped.totals.rake, 275);
  assert.notEqual(shaped.totals.net, -1500 + 275);
  // The note names the table AND the columns, so a reader can check it.
  assert.match(shaped.note, /Chips Come From horse_daily_nets/);
  assert.match(shaped.note, /net: net_chips/);
  assert.match(shaped.note, /Rake Comes From club_rake_daily_user/);
  assert.match(shaped.note, /Nothing Here Recomputes Money And Nothing Here Moves A Chip/);
  // Every source the report may read is listed with what it supplies, used or
  // not, so "present but not used" is visible rather than absent.
  assert.deepEqual(shaped.sources.map((s) => s.table), Object.keys(PNL_SOURCE_ROLES));
  assert.deepEqual(shaped.sources.map((s) => s.used), [true, false, true]);
  assert.equal(shaped.sources[1].present, true);
  assert.equal(shaped.byClub.length, 1);
  assert.equal(shaped.byStake.length, 1);
  assert.equal(shaped.byDay.length, 1);
});

test('a zero from an absent source is not a break-even fleet', () => {
  const shaped = shapePnl({
    totals: { net: 0, hands: 0, rake: 0 },
    sources: {
      horse_daily_nets: { present: false, used: false },
      ca_club_player_daily: { present: false, used: false },
      club_rake_daily_user: { present: false, used: false },
    },
  });
  assert.equal(shaped.measured, false);
  assert.equal(shaped.rakeMeasured, false);
  assert.equal(shaped.totals.net, null, 'an unmeasured net is null, never 0');
  assert.equal(shaped.totals.rake, null);
  // The raw zeros are kept, so the panel can show what the database literally
  // returned beside the honest nulls.
  assert.equal(shaped.reported.net, 0);
  assert.match(shaped.note, /No Chip Source Could Be Read/);
  assert.match(shaped.note, /Reported Zero/);
  assert.match(shaped.note, /No Rake Source Could Be Read/);
});

test('the fallback chip source is reported as the one that was used', () => {
  const shaped = shapePnl({
    totals: { net: 42, hands: 10, rake: 5 },
    sources: {
      horse_daily_nets: { present: false, used: false },
      ca_club_player_daily: { present: true, used: true, columns: { net: 'net' } },
      club_rake_daily_user: { present: false, used: false },
    },
  });
  assert.equal(shaped.measured, true);
  assert.match(shaped.note, /Chips Come From ca_club_player_daily/);
  // That table carries rake as well, so it answers for both and says so.
  assert.equal(shaped.rakeMeasured, true);
  assert.match(shaped.note, /Rake Comes From ca_club_player_daily/);
});

test('an unread P and L is known:false rather than a table of zeros', () => {
  const shaped = shapePnl(null);
  assert.equal(shaped.known, false);
  assert.equal(shaped.measured, false);
  assert.equal(shaped.totals.net, null);
  assert.deepEqual(shaped.byClub, []);
  assert.equal(stakeBandLabel(null), 'Not Recorded');
  assert.equal(stakeBandLabel('nl2'), 'nl2');
});

// ═══════════════════════════════════════════════════════════════════════════
// THE ROSTER QUERY BUILDER
// ═══════════════════════════════════════════════════════════════════════════

test('a filter the route cannot honour is dropped rather than sent', () => {
  const filters = rosterFilters({ state: 'flying', clubId: '  ', band: ' micro ', lane: '' });
  assert.equal(filters.state, '', 'an unknown state would silently return the whole list');
  assert.equal(filters.clubId, '');
  assert.equal(filters.band, 'micro');
  assert.equal(filters.lane, '');
  assert.equal(rosterIsFiltered({ state: 'flying' }), false);
  assert.equal(rosterIsFiltered({ band: 'micro' }), true);
  assert.equal(rosterIsFiltered({}), false);
  // Every state the panel offers is one the route's enum accepts.
  assert.deepEqual([...ROSTER_STATES].sort(), [...FLEET_STATES].sort());
});

test('THE OFFSET RESETS WHEN A FILTER CHANGES, and only when it changes', () => {
  const changed = rosterQuery({
    filters: { state: 'playing' },
    limit: 100,
    offset: 300,
    previousFilters: { state: 'idle' },
  });
  assert.equal(changed.offset, 0, 'page four of a set that now has one page is the bug');

  const same = rosterQuery({
    filters: { state: 'playing', band: 'micro' },
    limit: 100,
    offset: 300,
    previousFilters: { state: 'playing', band: 'micro' },
  });
  assert.equal(same.offset, 300, 'paging is not a filter change');

  // A change the normaliser drops is not a change either.
  const noop = rosterQuery({
    filters: { state: 'flying' },
    offset: 200,
    previousFilters: { state: '' },
  });
  assert.equal(noop.offset, 200);

  // Without a previous filter set the offset is left exactly as given, and a
  // negative one is clamped rather than sent.
  assert.equal(rosterQuery({ offset: 150 }).offset, 150);
  assert.equal(rosterQuery({ offset: -5 }).offset, 0);
  assert.equal(rosterQuery({}).limit, 100);
});

test('every section URL is built from one place, with empty values dropped', () => {
  assert.equal(FLEET_ADMIN, '/api/horses/fleet-admin');
  assert.deepEqual([...FLEET_SECTIONS], [
    'overview', 'roster', 'horse', 'policy', 'isolation', 'pnl', 'register', 'heartbeat',
  ]);

  const url = rosterUrl({ filters: { state: 'seated', clubId: CLUB }, limit: 100, offset: 100 });
  assert.equal(
    url,
    `/api/horses/fleet-admin?section=roster&state=seated&clubId=${CLUB}&limit=100&offset=100`,
  );
  // `?band=` would ask the route for every horse whose band is the empty
  // string, which is none of them.
  assert.ok(!url.includes('band='));
  assert.ok(!url.includes('lane='));

  assert.equal(overviewUrl(), '/api/horses/fleet-admin?section=overview');
  assert.equal(
    heartbeatUrl({ windowHours: 24, limit: 100, offset: 0 }),
    '/api/horses/fleet-admin?section=heartbeat&windowHours=24&limit=100&offset=0',
  );
  assert.equal(policyUrl({}), '/api/horses/fleet-admin?section=policy&limit=200&offset=0');
  assert.equal(isolationUrl({}), '/api/horses/fleet-admin?section=isolation&limit=50&offset=0');
  assert.equal(pnlUrl({}), '/api/horses/fleet-admin?section=pnl');
  assert.match(pnlUrl({ from: '2026-08-01', clubId: CLUB }), /from=2026-08-01/);
  // An unknown register status falls back to the default rather than being
  // sent as itself.
  assert.match(registerUrl({ status: 'invented' }), /status=active/);
  assert.deepEqual([...REGISTER_STATUSES], ['active', 'retired', 'all']);
});

test('the horse 360 needs a horse, and says so by returning nothing', () => {
  assert.equal(horseUrl({}), null, 'the caller disables the button rather than 400ing');
  assert.equal(horseUrl({ horseId: '   ' }), null);
  const url = horseUrl({ horseId: HORSE, trailTargetType: 'invented' });
  assert.match(url, new RegExp(`horseId=${HORSE}`));
  assert.ok(!url.includes('trailTargetType='), 'an unknown target type is dropped');
  assert.match(horseUrl({ horseId: HORSE, trailTargetType: 'user' }), /trailTargetType=user/);
  assert.match(horseUrl({ horseId: HORSE, trailOffset: -20 }), /trailOffset=0/);
});

test('a total nobody counted stays unknown, and "Showing N Of Total" follows it', () => {
  assert.deepEqual(rowsOf({ rows: [1, 2] }), [1, 2]);
  assert.deepEqual(rowsOf({ roster: [3] }, 'roster'), [3]);
  assert.deepEqual(rowsOf(null), []);

  const unknown = listMeta({ rows: [1, 2] }, 2);
  assert.equal(unknown.total, null, 'a fabricated total is worse than none');
  assert.equal(unknown.truncated, false);
  assert.equal(showingLabel(unknown, 'Horses'), null);

  const capped = listMeta({ rows: [1, 2], total: 900, hasMore: true }, 2);
  assert.equal(capped.total, 900);
  assert.equal(capped.truncated, true);
  assert.equal(capped.hasMore, true);
  assert.equal(showingLabel(capped, 'Horses'), 'Showing 2 Of 900 Horses');
});

test('a post body is null unless it is good enough to send', () => {
  assert.equal(MIN_REASON_LENGTH, 10);
  assert.equal(reasonIsValid('too short'), false);
  assert.equal(reasonIsValid('Pausing the fleet for maintenance'), true);

  const good = setPolicyBody({
    scope: 'club',
    scopeId: CLUB,
    patch: { pause_new_seatings: true },
    reason: 'Pausing new seatings for a club investigation',
    opId: 'fleet-key-1',
  });
  assert.equal(good.action, 'set_policy');
  assert.equal(good.scope, 'club');
  assert.equal(good.scopeId, CLUB);
  assert.deepEqual(good.patch, { pause_new_seatings: true });
  assert.equal(good.opId, 'fleet-key-1');

  const base = {
    scope: 'global',
    scopeId: null,
    patch: { enabled: false },
    reason: 'Disabling the fleet globally for a release',
    opId: 'fleet-key-2',
  };
  assert.ok(setPolicyBody(base));
  assert.equal(setPolicyBody({ ...base, scope: 'planet' }), null);
  assert.equal(setPolicyBody({ ...base, scope: 'club', scopeId: '' }), null);
  assert.equal(setPolicyBody({ ...base, patch: {} }), null, 'an empty change is not sent');
  assert.equal(setPolicyBody({ ...base, patch: [] }), null);
  assert.equal(setPolicyBody({ ...base, reason: 'short' }), null);
  assert.equal(setPolicyBody({ ...base, opId: '' }), null, 'no key means no exactly-once');

  assert.deepEqual(syncRegisterBody({}), { action: 'sync_register' });
  assert.deepEqual(syncRegisterBody({ reason: ' Quarterly disclosure check ' }), {
    action: 'sync_register',
    reason: 'Quarterly disclosure check',
  });

  // The idempotency key is unique per composition.
  assert.notEqual(newFleetOpId(), newFleetOpId());
  assert.match(newFleetOpId(), /^fleet-/);

  // The 202 is read as a function of the body, not as any truthy `pending`.
  assert.equal(isPendingApproval({ success: true, pending: true, approvalId: 'x' }), true);
  assert.equal(isPendingApproval({ success: true }), false);
  assert.equal(isPendingApproval({ success: false, pending: true }), false);
  assert.equal(isPendingApproval(null), false);
});

// ═══════════════════════════════════════════════════════════════════════════
// THE POLICY DIFF AND THE MATERIALITY PREVIEW
// ═══════════════════════════════════════════════════════════════════════════

/** A saved global row as the route returns it. */
const SAVED = Object.freeze({
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

/** The form as the panel seeds it: every field, from the saved row. */
const draftOf = (overrides = {}) => {
  const draft = {};
  for (const field of FLEET_POLICY_FIELDS) draft[field] = SAVED[field] ?? null;
  return { ...draft, ...overrides };
};

test('the diff sends only what changed, so two operators cannot overwrite each other', () => {
  const unchanged = fleetPolicyDiff(draftOf(), SAVED);
  assert.deepEqual(unchanged.patch, {}, 'a save composed of no changes writes nothing');
  assert.deepEqual(unchanged.fields, []);

  const one = fleetPolicyDiff(draftOf({ max_horses: 110 }), SAVED);
  assert.deepEqual(one.fields, ['max_horses'], 'a key the RPC is not given is left alone');
  assert.deepEqual(one.patch, { max_horses: 110 });
  assert.deepEqual(one.changes, [{
    field: 'max_horses',
    label: 'Maximum Horses',
    from: 100,
    to: 110,
  }]);

  // An empty box CLEARS the override and hands the field back to the wider
  // scope, which is a real instruction and a real change.
  const cleared = fleetPolicyDiff(draftOf({ max_horses: '' }), SAVED);
  assert.deepEqual(cleared.patch, { max_horses: null });

  // A club row that does not exist yet: creating it IS writing every value it
  // carries, but a row of all nulls says nothing and is not sent.
  const created = fleetPolicyDiff(draftOf({ max_horses: 20 }), null);
  assert.deepEqual(Object.keys(created.patch).sort(), [
    'enabled', 'pause_new_seatings', 'max_horses', 'max_per_table',
    'occupancy_bias', 'min_humans_to_seat',
  ].sort());
  assert.equal(created.patch.max_horses, 20);
  assert.equal(created.patch.pause_new_seatings, false, 'a new row states the switch it sets');
  assert.deepEqual(fleetPolicyDiff({ max_horses: null, notes: '' }, null).patch, {});
});

test('the form\'s values are normalised into what the patch carries', () => {
  assert.deepEqual(
    fleetPolicyDiff(draftOf({ stake_bands: ' micro , low ,, ' }), SAVED).patch,
    { stake_bands: ['micro', 'low'] },
  );
  assert.deepEqual(fleetPolicyDiff(draftOf({ variants: [] }), SAVED).patch, {});
  assert.deepEqual(fleetPolicyDiff(draftOf({ notes: '  keep this  ' }), SAVED).patch, { notes: 'keep this' });
  assert.deepEqual(fleetPolicyDiff(draftOf({ max_horses: '90' }), SAVED).patch, { max_horses: 90 });
  assert.deepEqual(fleetPolicyDiff(draftOf({ occupancy_bias: '1.5' }), SAVED).patch, { occupancy_bias: 1.5 });
  // Arrays compare by content, so re-saving the same list is not a change.
  assert.equal(sameValue(['a', 'b'], ['a', 'b']), true);
  assert.equal(sameValue(['a'], ['b']), false);
  assert.equal(sameValue(null, undefined), true);
  assert.equal(sameValue(1, '1'), true);
  assert.equal(fleetPolicyLabel('pause_new_seatings'), 'Pause New Seatings');
  assert.equal(sourceLabel('club'), 'This Club');
  assert.equal(sourceLabel('default'), 'The Built-In Default');
  assert.equal(sourceLabel(undefined), 'Not Known');
});

test('MATERIAL IS EVERY CASE THE CONTRACT LISTS, AND NOTHING ELSE', () => {
  // 1. Enabling or disabling the fleet.
  assert.deepEqual(fleetPolicyMateriality(SAVED, { enabled: false }).reasons, ['enabled_changed']);
  assert.equal(fleetPolicyMateriality(SAVED, { enabled: true }).material, false);
  // Clearing `enabled` on a row that had it false coalesces to the default
  // true, which is a change back to running, and it is material.
  assert.deepEqual(
    fleetPolicyMateriality({ ...SAVED, enabled: false }, { enabled: null }).reasons,
    ['enabled_changed'],
  );

  // 2. Pausing or resuming new seatings.
  assert.deepEqual(
    fleetPolicyMateriality(SAVED, { pause_new_seatings: true }).reasons,
    ['pause_changed'],
  );
  assert.equal(fleetPolicyMateriality(SAVED, { pause_new_seatings: false }).material, false);

  // 3. A cap moving by more than 25 percent - and the boundary is the RPC's.
  assert.equal(MATERIAL_CAP_MOVE, 0.25);
  assert.equal(fleetPolicyMateriality(SAVED, { max_horses: 110 }).material, false, '10 percent');
  assert.equal(fleetPolicyMateriality(SAVED, { max_horses: 125 }).material, false, 'exactly 25 percent is not MORE than 25');
  assert.deepEqual(
    fleetPolicyMateriality(SAVED, { max_horses: 126 }).reasons,
    ['max_horses_moved_more_than_25_percent'],
  );
  assert.deepEqual(
    fleetPolicyMateriality(SAVED, { max_horses: 70 }).reasons,
    ['max_horses_moved_more_than_25_percent'],
    'down is a move too',
  );
  // Four to one is a cut PAST the floor, and the floor is the reason that
  // survives: a cap of five or fewer is a stand-down whatever the step size,
  // and it is checked before the percentage so the operator reads the reason
  // that actually stopped the fleet.
  assert.deepEqual(
    fleetPolicyMateriality(SAVED, { max_per_table: 1 }).reasons,
    ['max_per_table_cut_to_a_floor'],
  );
  assert.deepEqual(
    fleetPolicyMateriality({ ...SAVED, max_horses: 6 }, { max_horses: 5 }).reasons,
    ['max_horses_cut_to_a_floor'],
    'a single step of well under 25 percent still lands on the floor',
  );
  // The floor is a floor and not a ceiling: moving a cap UP to five is not a
  // stand-down, so it is scored by the percentage rule like any other move and
  // an increase of exactly a quarter is still not more than a quarter.
  assert.equal(
    fleetPolicyMateriality({ ...SAVED, max_horses: 4 }, { max_horses: 5 }).material,
    false,
  );
  assert.deepEqual(
    fleetPolicyMateriality({ ...SAVED, max_horses: 4 }, { max_horses: 9 }).reasons,
    ['max_horses_moved_more_than_25_percent'],
  );
  assert.equal(MATERIAL_CAP_FLOOR, 5);

  // M-7, the walk that produced the floor: 100 to 3 in fourteen sub-25-percent
  // saves used to be fourteen non-material changes. It cannot reach 3 without
  // being caught now.
  let cap = 100;
  let caught = null;
  for (let i = 0; i < 20 && caught === null; i += 1) {
    const next = Math.ceil(cap * 0.75);
    if (next === cap) break;
    const verdict = fleetPolicyMateriality({ ...SAVED, max_horses: cap }, { max_horses: next });
    if (verdict.material) caught = { from: cap, to: next, reasons: verdict.reasons };
    cap = next;
  }
  assert.ok(caught, 'a walk down to the floor must be caught somewhere');
  assert.deepEqual(caught.reasons, ['max_horses_cut_to_a_floor']);
  assert.ok(caught.to <= MATERIAL_CAP_FLOOR, `caught at ${caught.to}, which must be at the floor`);

  // 4. A cap being set or cleared. A change from unlimited has no percentage.
  assert.deepEqual(
    fleetPolicyMateriality({ ...SAVED, max_horses: null }, { max_horses: 500 }).reasons,
    ['max_horses_set_or_cleared'],
  );
  assert.deepEqual(
    fleetPolicyMateriality(SAVED, { max_horses: null }).reasons,
    ['max_horses_set_or_cleared'],
  );
  // A cap of zero is not unlimited, and moving off it has no percentage either.
  assert.deepEqual(
    fleetPolicyMateriality({ ...SAVED, max_horses: 0 }, { max_horses: 10 }).reasons,
    ['max_horses_changed_from_zero'],
  );
  assert.equal(
    fleetPolicyMateriality({ ...SAVED, max_horses: 0 }, { max_horses: 0 }).material,
    false,
  );

  // 5. THE FIVE FIELDS THAT CAN STOP THE FLEET SEATING (review H-1). Every one
  // of these was below the line while being able to stop every table on the
  // platform taking a horse, so a single operator could apply it with the
  // console saying "This Change Will Be Applied Now".
  assert.equal(BIAS_MATERIAL_BELOW, 0.5);
  for (const [patch, expected, why] of [
    // A bias of a tenth scales every table's seat target to a tenth.
    [{ occupancy_bias: 0.1 }, ['occupancy_bias_cut_below_half'], 'the proved H-1 case'],
    [{ occupancy_bias: 0.5 }, ['occupancy_bias_cut_below_half'], 'half itself is on the line'],
    [{ occupancy_bias: 1.5 }, ['occupancy_bias_moved_more_than_25_percent'], 'up is a move too'],
    [{ occupancy_bias: 0.7 }, ['occupancy_bias_moved_more_than_25_percent'], 'above half, still a move'],
    // Ten seats is the widest table, so a minimum of ten can never be met.
    [{ min_humans_to_seat: 10 }, ['min_humans_to_seat_raised'], 'nothing is ever seated again'],
    [{ min_humans_to_seat: 1 }, ['min_humans_to_seat_raised'], 'a quiet lobby never fills'],
    // A restriction is measured against NO restriction: null is "this scope
    // withholds nothing", so adding a list is a narrowing however long it is.
    [{ stake_bands: ['nl2'] }, ['stake_bands_narrowed'], 'eligibility narrowed to one band'],
    [{ variants: ['plo'] }, ['variants_narrowed'], 'eligibility narrowed to one variant'],
    [{ schedule: [{ start_hour: 3, end_hour: 4 }] }, ['schedule_narrowed'], 'one hour a day'],
  ]) {
    assert.deepEqual(fleetPolicyMateriality(SAVED, patch).reasons, expected, `${why}: ${JSON.stringify(patch)}`);
  }

  // A SHORTER LIST IS A NARROWING; A LONGER ONE IS NOT. Giving the fleet back
  // seats it could not take is not what this gate exists for.
  const restricted = { ...SAVED, stake_bands: ['nl2', 'nl5', 'nl10'], variants: ['nlhe', 'plo'] };
  assert.deepEqual(
    fleetPolicyMateriality(restricted, { stake_bands: ['nl2'] }).reasons,
    ['stake_bands_narrowed'],
  );
  assert.equal(
    fleetPolicyMateriality(restricted, { stake_bands: ['nl2', 'nl5', 'nl10', 'nl25'] }).material,
    false,
    'widening a restriction hands seats back',
  );
  assert.equal(
    fleetPolicyMateriality(restricted, { variants: null }).material,
    false,
    'clearing a restriction removes it entirely',
  );
  // Lowering the human minimum gives seats back as well.
  assert.equal(
    fleetPolicyMateriality({ ...SAVED, min_humans_to_seat: 4 }, { min_humans_to_seat: 1 }).material,
    false,
  );
  // And a bias RISING back towards one, inside a quarter, is nothing at all.
  assert.equal(
    fleetPolicyMateriality({ ...SAVED, occupancy_bias: 1.0 }, { occupancy_bias: 1.2 }).material,
    false,
  );

  // Everything else writes directly. The note is the only field left that
  // steers nothing, and it is the whole of this list on purpose.
  for (const patch of [
    { notes: 'A note' },
    { notes: null },
  ]) {
    assert.equal(fleetPolicyMateriality(SAVED, patch).material, false, JSON.stringify(patch));
  }

  // A field that is absent is not touched at all, so it cannot be material.
  assert.equal(fleetPolicyMateriality(SAVED, {}).material, false);
  // Two material changes in one patch report both, in the contract's order.
  assert.deepEqual(
    fleetPolicyMateriality(SAVED, { enabled: false, pause_new_seatings: true, max_horses: 10 }).reasons,
    ['enabled_changed', 'pause_changed', 'max_horses_moved_more_than_25_percent'],
  );
  // EVERY REASON THE RULE CAN RAISE HAS AN OPERATOR SENTENCE. A reason with no
  // sentence renders as its own snake_case code in the one dialog where an
  // operator is being asked to agree to something. An unknown code is still
  // passed through as itself rather than swallowed.
  const everyReason = new Set();
  for (const [before, patch] of [
    [SAVED, { enabled: false }],
    [SAVED, { pause_new_seatings: true }],
    [SAVED, { max_horses: null, max_per_table: null }],
    [{ ...SAVED, max_horses: 0, max_per_table: 0 }, { max_horses: 10, max_per_table: 9 }],
    [{ ...SAVED, max_horses: 6, max_per_table: 6 }, { max_horses: 5, max_per_table: 4 }],
    [SAVED, { max_horses: 10, max_per_table: 40 }],
    [SAVED, { occupancy_bias: 0.1 }],
    [SAVED, { occupancy_bias: 1.9 }],
    [SAVED, { min_humans_to_seat: 3 }],
    [SAVED, { stake_bands: ['nl2'], variants: ['plo'], schedule: [{ start_hour: 3, end_hour: 4 }] }],
  ]) {
    for (const reason of fleetPolicyMateriality(before, patch).reasons) everyReason.add(reason);
  }
  for (const reason of everyReason) {
    assert.notEqual(materialReasonText(reason), '');
    assert.notEqual(materialReasonText(reason), reason, `${reason} needs a sentence`);
  }
  // Both directions: no reason without a sentence, and no sentence for a reason
  // the rule can no longer raise.
  assert.deepEqual(
    [...everyReason].sort(),
    Object.keys(MATERIAL_REASON_TEXT).sort(),
    'the reason list and the sentence table are the same set',
  );
  assert.equal(materialReasonText('something_new'), 'something_new');
  assert.deepEqual([...FLEET_CAP_FIELDS], ['max_horses', 'max_per_table']);
});

test('THE CONSOLE\'S MATERIALITY RULE IS THE DATABASE\'S RULE', async () => {
  // The RPC computes the same verdict, but only AFTER it has written the row,
  // which is why the route keeps its own copy and gates on that. The two are
  // supposed to be identical; this is the check that they still say the same
  // words, and fn_ca_fleet_set_policy is where the truth lives.
  const sql = await read(MIGRATION);
  const start = sql.indexOf('create or replace function public.fn_ca_fleet_set_policy');
  assert.ok(start > -1);
  const body = sql.slice(start, sql.indexOf('$fn$;', start));
  for (const reason of ['enabled_changed', 'pause_changed']) {
    assert.ok(body.includes(reason), `the RPC must raise ${reason}`);
  }
  for (const suffix of [
    '_set_or_cleared',
    '_changed_from_zero',
    '_cut_to_a_floor',
    '_moved_more_than_25_percent',
    // The three restriction reasons are built as `v_key || '_narrowed'` over
    // the same array the console loops, so the suffix and the array are what
    // there is to compare.
    '_narrowed',
  ]) {
    assert.ok(body.includes(suffix), `the RPC must raise ${suffix}`);
  }
  for (const reason of [
    'occupancy_bias_cut_below_half',
    'occupancy_bias_moved_more_than_25_percent',
    'min_humans_to_seat_raised',
  ]) {
    assert.ok(body.includes(reason), `the RPC must raise ${reason}`);
  }
  assert.match(
    body,
    /array\['stake_bands','variants','schedule'\]/,
    'the RPC narrows the same three restrictions the console does',
  );
  // The same threshold, and the same strictly-greater-than comparison.
  assert.match(body, /> 0\.25/);
  assert.equal(MATERIAL_CAP_MOVE, 0.25);
  // The same cap floor and the same bias line, as numbers rather than as prose.
  assert.match(body, new RegExp(`<= ${MATERIAL_CAP_FLOOR} and v_new_cap < v_old_cap`));
  assert.match(body, new RegExp(`<= ${BIAS_MATERIAL_BELOW} and v_new_bias < v_old_bias`));
  // And the same coalesced defaults, so clearing a field compares against
  // today behaviour rather than against null.
  assert.match(body, /coalesce\(\(p_patch ->> 'enabled'\)::boolean, true\)/);
  assert.match(body, /coalesce\(\(p_patch ->> 'pause_new_seatings'\)::boolean, false\)/);
});

test('the preview says which of the THREE things pressing Save will do', () => {
  const material = draftOf({ pause_new_seatings: true });

  // Approvals ON: the change is held, and nothing moves until a second
  // operator agrees.
  const held = setPolicyPreview({
    draft: material,
    saved: SAVED,
    policy: { approvals_enabled: true },
    scope: 'global',
  });
  assert.equal(held.material, true);
  assert.equal(held.willRequest, true);
  assert.equal(held.approvalsKnown, true);
  assert.match(held.headline, /Will Be Sent For Approval/);
  assert.match(held.detail, /Nothing Changes For The Whole Platform Until A Second Operator Approves/);
  assert.deepEqual(held.patch, { pause_new_seatings: true });
  assert.deepEqual(held.reasons, ['pause_changed']);
  assert.equal(held.reasonTexts.length, 1);

  // THE THIRD ANSWER (review L-11). With approvals on and one eligible
  // approver, requireApproval returns required:false and the route applies the
  // change the instant the operator confirms. A dialog that said "Nothing
  // Changes Until A Second Operator Approves It" over that button would be
  // telling an operator their change is reversible when it is not. This is the
  // Mint's rule, read through the same aloneRuleIsInForce.
  const alone = setPolicyPreview({
    draft: material,
    saved: SAVED,
    policy: { approvals_enabled: true },
    aloneRule: { applies: true, eligibleApprovers: 0, permission: 'fleet.write' },
  });
  assert.equal(alone.material, true);
  assert.equal(alone.aloneRuleApplies, true);
  assert.equal(alone.willRequest, false, 'it does not stop and wait, so it is not a request');
  assert.match(alone.headline, /Only Eligible Approver/);
  assert.match(alone.detail, /Approved Your Own Request/);
  assert.ok(!alone.detail.includes('Until A Second Operator'));

  // An alone rule that does NOT apply is the ordinary held case, and it says
  // so without the caveat, because the count was read.
  const notAlone = setPolicyPreview({
    draft: material,
    saved: SAVED,
    policy: { approvals_enabled: true },
    aloneRule: { applies: false, eligibleApprovers: 3, permission: 'fleet.write' },
  });
  assert.equal(notAlone.willRequest, true);
  assert.equal(notAlone.aloneRuleApplies, false);
  assert.equal(notAlone.aloneRuleKnown, true);
  assert.ok(!notAlone.detail.includes('The One Exception Is The Alone Rule'));

  // WITH NO ALONE RULE READ AT ALL the sentence names it as the third
  // possibility rather than ruling it out. An unread rule is not an absent one.
  assert.equal(held.aloneRuleKnown, false);
  assert.match(held.detail, /The One Exception Is The Alone Rule/);

  // Approvals OFF is the state of production today, and PHASE2-CONTRACTS
  // section 0 says nothing here may block a move that works today.
  const now = setPolicyPreview({
    draft: material,
    saved: SAVED,
    policy: { approvals_enabled: false },
  });
  assert.equal(now.material, true);
  assert.equal(now.willRequest, false);
  assert.match(now.headline, /Applied Now/);
  assert.match(now.detail, /Maker-Checker Is Off/);
  assert.match(now.detail, /Auto Approved/);
  // AND IT DOES NOT PROMISE MORE THAN THIS PAGE CAN KNOW (review L-11). The
  // server dropped its client-side ceiling, so approvals turned on from Staff
  // And Roles since this page loaded make this same change a 202. The panel
  // handles that correctly; the sentence has to admit it can happen.
  assert.match(now.detail, /If Approvals Were Turned On Since This Page Loaded/);

  // THE POLICY UNREAD IS NOT THE POLICY OFF. Guessing "off" would tell an
  // operator their change applies instantly when it will in fact queue.
  const unknown = setPolicyPreview({ draft: material, saved: SAVED, policy: null });
  assert.equal(unknown.approvalsKnown, false);
  assert.equal(unknown.willRequest, false);
  assert.match(unknown.headline, /Approval Policy Could Not Be Read/);
  assert.match(unknown.detail, /Cannot Say Whether/);

  // Below the line: it writes directly and is audited. The note is the only
  // field left that steers nothing, so it is the one this case can use -
  // raising min_humans_to_seat withholds seating and is material now (H-1).
  const small = setPolicyPreview({
    draft: draftOf({ notes: 'Capped for the weekend promotion' }),
    saved: SAVED,
    policy: { approvals_enabled: true },
  });
  assert.deepEqual(small.patch, { notes: 'Capped for the weekend promotion' });
  assert.equal(small.material, false);
  assert.equal(small.willRequest, false);
  assert.match(small.headline, /Will Be Applied Now/);
  assert.match(small.detail, /Below The Material Line/);
  // And the case that USED to be here is now held, which is the whole point of
  // H-1: a human minimum of two withholds seating from every quieter table.
  const raised = setPolicyPreview({
    draft: draftOf({ min_humans_to_seat: 2 }),
    saved: SAVED,
    policy: { approvals_enabled: true },
  });
  assert.equal(raised.material, true);
  assert.equal(raised.willRequest, true);
  assert.deepEqual(raised.reasons, ['min_humans_to_seat_raised']);

  // Nothing changed: nothing is sent, and the button says so.
  const empty = setPolicyPreview({ draft: draftOf(), saved: SAVED, policy: { approvals_enabled: true } });
  assert.equal(empty.empty, true);
  assert.equal(empty.material, false);
  assert.match(empty.headline, /Nothing Has Been Changed Yet/);

  // A club scope names the scope rather than the platform.
  const club = setPolicyPreview({
    draft: material,
    saved: SAVED,
    policy: { approvals_enabled: true },
    scope: 'club',
  });
  assert.match(club.detail, /Nothing Changes For This Scope/);
});

test('the preview reads the policy shape index.js actually hands the panel', () => {
  // The panel is given `policy={operatorPolicy}`, which is normalizePolicy's
  // output, not the raw route row. If these two modules ever disagreed about
  // the field name the preview would silently read "approvals off" with
  // approvals on, and tell an operator their material change applies
  // immediately when it will in fact wait for a second operator.
  const on = setPolicyPreview({
    draft: draftOf({ enabled: false }),
    saved: SAVED,
    policy: normalizePolicy({ approvalsEnabled: true, mintThreshold: 0 }),
  });
  assert.equal(on.approvalsKnown, true);
  assert.equal(on.willRequest, true);

  const off = setPolicyPreview({
    draft: draftOf({ enabled: false }),
    saved: SAVED,
    policy: normalizePolicy({ approvals_enabled: false }),
  });
  assert.equal(off.approvalsKnown, true);
  assert.equal(off.willRequest, false);

  // And an unread policy stays unread through the same door.
  assert.equal(normalizePolicy(null), null);
  assert.equal(
    setPolicyPreview({ draft: draftOf({ enabled: false }), saved: SAVED, policy: normalizePolicy(null) })
      .approvalsKnown,
    false,
  );
});

test('AN INHERITED BOOLEAN IS A THIRD ANSWER, NOT AN UNTICKED BOX (review H-2)', () => {
  // Every steering column is nullable and null means inherit, so a club row
  // written through this console carries `enabled = null`, which the merge
  // resolves to TRUE. An unticked checkbox told the operator the fleet was OFF
  // for a club whose fleet was on, and no control could hand the field back.

  // 1. TOUCHING NOTHING COMPOSES AN EMPTY PATCH. A row that inherits both
  //    booleans opens with both drafts null and saves nothing at all.
  const inheriting = Object.freeze({
    scope: 'club',
    scope_id: CLUB,
    enabled: null,
    pause_new_seatings: null,
    max_horses: 12,
    max_per_table: null,
    occupancy_bias: null,
    min_humans_to_seat: null,
    stake_bands: null,
    variants: null,
    schedule: null,
    notes: null,
  });
  const seeded = {};
  for (const field of FLEET_POLICY_FIELDS) {
    seeded[field] = inheriting[field] === undefined ? null : inheriting[field];
  }
  assert.deepEqual(fleetPolicyDiff(seeded, inheriting).patch, {});
  assert.equal(fleetPolicyMateriality(inheriting, {}).material, false);

  // 2. INHERITED SENDS null, WHICH IS A REAL INSTRUCTION. A club row that had
  //    `enabled: false` handed back to the wider scope is a change back to
  //    running, and it is material.
  const disabled = { ...inheriting, enabled: false };
  const handBack = fleetPolicyDiff({ ...seeded, enabled: null }, disabled);
  assert.deepEqual(handBack.patch, { enabled: null }, 'Inherited is null on the wire');
  assert.deepEqual(fleetPolicyMateriality(disabled, handBack.patch).reasons, ['enabled_changed']);

  // 3. Yes and No still compose what they always did.
  assert.deepEqual(fleetPolicyDiff({ ...seeded, pause_new_seatings: true }, inheriting).patch,
    { pause_new_seatings: true });
  assert.deepEqual(fleetPolicyDiff({ ...seeded, enabled: false }, inheriting).patch,
    { enabled: false });
  // And ticking a box "to fix it" on a row that already inherits TRUE is no
  // longer a no-op change dressed as an approval: it is a real override, and
  // the label above it says the inherited answer is already Yes.
  assert.deepEqual(fleetPolicyDiff({ ...seeded, enabled: true }, inheriting).patch,
    { enabled: true });

  // 4. THE INHERITED OPTION STATES WHAT IT RESOLVES TO AND WHERE FROM.
  const effective = {
    enabled: true,
    pause_new_seatings: false,
    source: { enabled: 'global', pause_new_seatings: 'club' },
  };
  assert.equal(
    inheritedOptionLabel('enabled', { scope: 'club', effective }),
    'Inherited (Currently Yes, From The Global Row)',
  );
  assert.equal(
    inheritedOptionLabel('pause_new_seatings', { scope: 'club', effective }),
    'Inherited (Currently No, From This Club)',
  );
  // NEVER THE WORD "NO" FOR AN INHERITED TRUE. That is the whole defect.
  assert.ok(!inheritedOptionLabel('enabled', { scope: 'club', effective }).includes(' No,'));

  // On the GLOBAL row there is nothing wider to inherit from, so Inherited
  // means the built-in default and the label names it.
  assert.equal(
    inheritedOptionLabel('enabled', { scope: 'global' }),
    'Inherited (Yes, The Built-In Default)',
  );
  assert.equal(
    inheritedOptionLabel('pause_new_seatings', { scope: 'global' }),
    'Inherited (No, The Built-In Default)',
  );

  // An unread merge for THIS scope says so rather than quoting another club's.
  assert.match(
    inheritedOptionLabel('enabled', { scope: 'club', effective: null }),
    /Not Known Here/,
  );
  assert.match(inheritedOptionLabel('enabled', { scope: 'union' }), /Not Known Here/);
});

test('the kill switch note is on every dialog that pauses the fleet', () => {
  assert.match(KILL_SWITCH_NOTE, /Stops New Seatings Only/);
  assert.match(KILL_SWITCH_NOTE, /No Seated Horse Is Removed/);
  assert.match(KILL_SWITCH_NOTE, /No Hand In Progress Is Cancelled/);
  assert.match(KILL_SWITCH_NOTE, /No Chips Move/);
});

test('the client validator refuses what the RPC would refuse, in English', () => {
  assert.equal(validateFleetPolicyPatch({ max_horses: 10 }).ok, true);
  assert.equal(validateFleetPolicyPatch({}).error, 'empty_patch');
  assert.equal(validateFleetPolicyPatch(null).error, 'invalid_patch');
  assert.equal(validateFleetPolicyPatch({ nonsense: 1 }).error, 'unknown_field');
  assert.equal(validateFleetPolicyPatch({ max_horses: -1 }).error, 'negative_cap');
  assert.equal(validateFleetPolicyPatch({ max_horses: 1.5 }).error, 'not_an_integer');
  assert.equal(validateFleetPolicyPatch({ enabled: 'yes' }).error, 'invalid_type');
  assert.equal(validateFleetPolicyPatch({ min_humans_to_seat: 11 }).error, 'min_humans_out_of_range');
  // A bias of zero would take every table target to zero, which is an eviction
  // dressed as arithmetic.
  assert.equal(validateFleetPolicyPatch({ occupancy_bias: 0 }).error, 'bias_out_of_range');
  assert.equal(validateFleetPolicyPatch({ occupancy_bias: 11 }).error, 'bias_out_of_range');
  assert.equal(validateFleetPolicyPatch({ stake_bands: ['ok'] }).ok, true);
  assert.equal(validateFleetPolicyPatch({ stake_bands: [''] }).error, 'invalid_array');
  assert.equal(validateFleetPolicyPatch({ schedule: [{ start_hour: 0, end_hour: 24 }] }).error, 'invalid_schedule');
  assert.equal(validateFleetPolicyPatch({ schedule: [{ start_hour: 22, end_hour: 3 }] }).ok, true);
  // A null is a CLEAR, and every nullable field accepts one.
  for (const field of FLEET_POLICY_FIELDS) {
    assert.equal(validateFleetPolicyPatch({ [field]: null }).ok, true, `${field} must be clearable`);
  }
  // Every message is a sentence an operator can act on, not a code.
  assert.match(validateFleetPolicyPatch({ max_horses: -1 }).message, /Cannot Be Negative/);
});

// ═══════════════════════════════════════════════════════════════════════════
// THE TAB: A RENAME THAT DOES NOT BREAK A BOOKMARK
// ═══════════════════════════════════════════════════════════════════════════

test('AN OLD ?tab=grinder BOOKMARK LANDS ON FLEET COMMAND', () => {
  assert.equal(resolveTabFromQuery('grinder'), 'fleet');
  assert.equal(resolveTabFromQuery(' grinder '), 'fleet', 'a hand-edited URL is still a URL');
  // Next hands over an array for ?tab=a&tab=b; the first value wins.
  assert.equal(resolveTabFromQuery(['grinder', 'mint']), 'fleet');
  // Through the URL layer the page actually uses.
  assert.equal(resolveInitialTab({ tab: 'grinder' }), 'fleet');

  // The new id resolves to itself, and an id nobody claims still lands on the
  // default rather than on a blank panel.
  assert.equal(resolveTabFromQuery('fleet'), 'fleet');
  assert.equal(resolveTabFromQuery('a-tab-that-was-renamed'), DEFAULT_TAB);
  assert.equal(resolveTabFromQuery(''), DEFAULT_TAB);
  assert.equal(resolveTabFromQuery(undefined), DEFAULT_TAB);
});

test('an alias is not a tab: it is never in the nav and never findable as one', () => {
  const ids = visibleTabs(TABS).map((t) => t.id);
  assert.ok(ids.includes('fleet'));
  assert.ok(!ids.includes('grinder'), 'the bar shows Fleet Command once');
  assert.equal(findTab('grinder'), null);
  assert.equal(findTabByAlias('grinder').id, 'fleet');
  assert.equal(findTabByAlias('nothing'), null);
  assert.equal(findTabByAlias(''), null);
  assert.deepEqual(aliasesOf(findTab('fleet')), ['grinder']);
  assert.deepEqual(aliasesOf({ aliases: [1, '', 'ok'] }), ['ok']);
  assert.deepEqual(aliasesOf(null), []);
  assert.deepEqual(aliasesOf(findTab('stable')), [], 'only a RENAMED tab carries one');
});

test('a real id always beats somebody else\'s alias', () => {
  // If a future tab is ever registered under an id that is also an alias, the
  // tab that OWNS the id gets the URL. Otherwise a rename could quietly
  // hijack a live tab.
  const tabs = [
    { id: 'x', label: 'X', permission: 'fleet.read', aliases: ['y'] },
    { id: 'y', label: 'Y', permission: 'fleet.read' },
  ];
  assert.equal(resolveTabFromQuery('y', tabs), 'y');
  assert.equal(resolveTabFromQuery('x', tabs), 'x');
});

test('the alias does not fight the URL write effect', () => {
  // /horses?tab=grinder resolves to fleet, and urlMatchesState compares through
  // the same resolver - so the console does NOT rewrite the query string under
  // the operator on load. That rewrite is the Phase 1 destroyed-deep-link
  // blocker, and a rename must not reintroduce it.
  const state = { activeTab: 'fleet', caSection: DEFAULT_CA_SECTION };
  assert.equal(urlMatchesState(state, { tab: 'grinder' }), true);
  assert.equal(urlMatchesState(state, { tab: 'fleet' }), true);
  assert.equal(urlMatchesState(state, { tab: 'mint' }), false);
  // When the operator does move, the canonical id is what gets written.
  assert.equal(nextUrlQuery({ activeTab: 'fleet' }, { tab: 'grinder' }).tab, 'fleet');
});

test('Fleet Command is visible to every role that may look, and gated for writes', () => {
  const all = visibleTabs(TABS);
  const fleet = findTab('fleet');
  assert.equal(fleet.permission, 'fleet.read', 'a tab declares the permission that lets you LOOK');
  for (const role of ['god', 'superadmin', 'admin', 'owner', 'operations', 'read_only']) {
    const permissions = permissionsForRole(role);
    assert.ok(
      permittedTabs(all, permissions).some((t) => t.id === 'fleet'),
      `${role} holds fleet.read, so Fleet Command is visible`,
    );
    assert.equal(
      relocationTarget({ activeTab: 'fleet', tabs: all, permissions }),
      null,
      `${role} must stay on Fleet Command`,
    );
  }
  // Writing is a different permission, and the panel checks it for itself.
  assert.equal(hasPermission(permissionsForRole('read_only'), 'fleet.write'), false);
  assert.equal(hasPermission(permissionsForRole('operations'), 'fleet.write'), true);
  // A genuinely narrow set that cannot look is moved off, not shown a blank.
  const finance = relocationTarget({ activeTab: 'fleet', tabs: all, permissions: ['money.read'] });
  assert.ok(finance && finance !== 'fleet');
});

// ═══════════════════════════════════════════════════════════════════════════
// CONTRACTS - THE ROUTE, THE GATE AND THE EXECUTOR
// ═══════════════════════════════════════════════════════════════════════════

test('contract: fleet-admin is a withOperatorRoute route with the contract\'s permissions', async () => {
  const src = await read(ROUTE);
  assert.match(src, /export default withOperatorRoute\(spec, handle\)/);
  // Reads fleet.read, writes fleet.write (PHASE3-CONTRACTS section 3), named
  // through the vocabulary rather than as string literals.
  assert.match(src, /permission: \{ GET: PERMISSIONS\.FLEET_READ, POST: PERMISSIONS\.FLEET_WRITE \}/);
  assert.match(src, /limit: \{ GET: 'read', POST: 'write' \}/);
  assert.match(src, /methods: \['GET', 'POST'\]/);
  // The policy row steers the whole platform, so the write limit is durable
  // rather than per lambda instance.
  assert.match(src, /durable: \{ POST: \{ max: \d+, windowSeconds: \d+ \} \}/);
  // Every section the panel can ask for is a section the route serves.
  for (const section of FLEET_SECTIONS) {
    assert.ok(src.includes(`'${section}'`), `the route must handle section=${section}`);
  }
});

test('SECTION 0: nothing on this route can seat, unseat or fund a horse', async () => {
  const src = stripComments(await read(ROUTE));
  // The only two writes are a policy row and the disclosure register.
  assert.match(src, /const ACTIONS = \['set_policy', 'sync_register'\]/);
  for (const forbidden of [
    'fn_ca_mint', 'fn_ca_burn', 'fn_credit_and_log', 'chip_transactions',
    'fn_seed_horses_to_floor', 'table_seats.delete', 'horse-launch',
  ]) {
    assert.ok(!src.includes(forbidden), `${forbidden} has no business on this route`);
  }
  // It reads table_seats, and only reads it.
  assert.ok(src.includes("from('table_seats')"));
  assert.ok(!/from\('table_seats'\)[\s\S]{0,120}\.(delete|update|insert|upsert)\(/.test(src));
  // And no chip column is ever written.
  assert.ok(!/\.update\(/.test(src) && !/\.insert\(/.test(src) && !/\.upsert\(/.test(src));
});

test('contract: a MATERIAL set_policy goes through requireApproval BEFORE the RPC', async () => {
  const src = await read(ROUTE);
  const iPreview = src.indexOf('const preview = fleetPolicyMateriality(before, patch)');
  const iGate = src.indexOf('if (preview.material)');
  const iRequest = src.indexOf('await requireApproval(');
  const iPending = src.indexOf('return approvalPendingResponse(');
  const iRpc = src.indexOf("'fn_ca_fleet_set_policy'");
  const iMark = src.indexOf('await markApprovalExecuted(');

  assert.ok(iPreview > -1, 'the route must predict materiality from the row it read');
  assert.ok(iGate > iPreview, 'and gate on the prediction');
  assert.ok(iRequest > iGate, 'requireApproval runs inside the material branch');
  assert.ok(iRequest < iRpc, 'requireApproval must run BEFORE fn_ca_fleet_set_policy');
  assert.ok(iPending > iRequest && iPending < iRpc, 'the 202 returns before anything is written');
  assert.ok(iMark > iRpc, 'markApprovalExecuted runs after the change was applied');
  assert.match(src, /kind: 'fleet_policy'/);
  assert.match(src, /targetType: 'fleet_policy'/);
  // The approval carries the console's idempotency key and the operator the
  // change will be filed under, because the RPC refuses a null actor.
  assert.match(src, /opId,\n\s*payload: \{/);
  assert.match(src, /updatedBy: op\.user\.id/);
  // A read failure before a write is a refusal, not an assumed empty row: that
  // would make every change look like a creation.
  assert.match(src, /fleet_policy_read_unavailable/);
  // The route reads the row with maybeSingle, and PostgREST needs is.null for
  // the global row's null scope_id.
  assert.match(src, /\.is\('scope_id', null\)/);
  // The two verdicts are compared and any disagreement is recorded, not logged
  // and forgotten.
  assert.match(src, /materialityDisagreement: disagreement/);
});

test('contract: the approvals queue can actually apply an approved fleet change', () => {
  // A queue that can approve a change and then has no way to run it is a
  // control with no exit: with approvals on, every material fleet change would
  // sit in it forever.
  assert.ok(EXECUTABLE_APPROVAL_KINDS.includes('fleet_policy'));
  assert.equal(isExecutableKind('fleet_policy'), true);
  const validator = payloadFor('fleet_policy');
  assert.equal(typeof validator, 'function');

  const payload = {
    action: 'set_policy',
    scope: 'club',
    scopeId: CLUB,
    patch: { pause_new_seatings: true },
    reason: 'Pausing new seatings for a club investigation',
    opId: 'fleet-approved-1',
    updatedBy: ACTOR,
  };
  const shaped = validator(payload, 'fleet-approved-1');
  assert.equal(shaped.ok, true);
  assert.equal(shaped.rpc, 'fn_ca_fleet_set_policy');
  assert.equal(shaped.args.p_scope, 'club');
  assert.equal(shaped.args.p_scope_id, CLUB);
  assert.deepEqual(shaped.args.p_patch, { pause_new_seatings: true });
  // THE CHANGE IS FILED UNDER THE OPERATOR WHO RAISED IT, not the one who
  // approved it. The approval is a separate act and is audited separately.
  assert.equal(shaped.args.p_updated_by, ACTOR);
  assert.equal(shaped.summary.kind, 'fleet_policy');
  assert.deepEqual(shaped.summary.fields, ['pause_new_seatings']);

  // The stored payload is INPUT: it was written by a deploy that may be weeks
  // old, so every field is re-read.
  assert.equal(validator(null, 'k').reason, 'payload_missing');
  assert.equal(validator({ ...payload, scope: 'planet' }, 'k').reason, 'payload_scope_invalid');
  assert.equal(validator({ ...payload, scopeId: null }, 'k').reason, 'payload_target_invalid');
  assert.equal(
    validator({ ...payload, scope: 'global', scopeId: CLUB }, 'k').reason,
    'payload_target_invalid',
  );
  assert.equal(validator({ ...payload, patch: {} }, 'k').reason, 'payload_patch_invalid');
  assert.equal(
    validator({ ...payload, patch: { invented: 1 } }, 'k').reason,
    'payload_patch_invalid',
  );
  assert.equal(validator({ ...payload, updatedBy: null }, 'k').reason, 'payload_actor_missing');
  assert.equal(validator({ ...payload, reason: 'short' }, 'k').reason, 'payload_reason_invalid');
  // The key the change runs under is the key the approval was raised under.
  assert.equal(validator({ ...payload, opId: 'a-different-key' }, 'fleet-approved-1').reason,
    'payload_op_id_mismatch');
  assert.equal(validator({ ...payload, opId: null }, null).reason, 'payload_op_id_missing');

  // And the operator is told what happened in words about what happened: no
  // money moved here.
  assert.match(executionDoneText('fleet_policy'), /The Fleet Policy Has Changed/);
  assert.match(executionDoneText('fleet_policy'), /No Chips Moved/);
  assert.ok(!executionDoneText('fleet_policy').includes('The Money Has Moved'));
  assert.match(executionDoneText('mint'), /The Money Has Moved/);
  assert.match(executionDoneText('fleet_policy', { trailClosed: false }), /Could Not Be Closed/);
});

test('contract: operator-admin drives the executor it is given, exactly once', async () => {
  const src = await read(OPERATOR_ROUTE);
  const iValidate = src.indexOf('payloadFor(kind)(row.payload');
  const iRpc = src.indexOf('db.rpc(shaped.rpc, shaped.args)');
  const iMark = src.indexOf('markApprovalExecuted(');
  assert.ok(iValidate > -1 && iRpc > -1 && iMark > -1);
  assert.ok(iValidate < iRpc, 'the stored payload is validated before it is run');
  assert.ok(iMark > iRpc, 'and the row is closed after it ran');
  assert.match(src, /isExecutableKind\(/, 'a kind with no executor must not be assembled');
  assert.match(src, /executionDoneText\(kind/, 'the message is per kind');
  // fn_ca_fleet_set_policy has no idempotency key of its own, so the key it
  // ran under is the approval row's. The money kinds carry theirs under
  // whichever parameter their RPC names (fn_ca_mint says p_op_id,
  // fn_ca_fund_club says p_idempotency_key), so the shaped SUMMARY is the one
  // place that always holds the key, whatever the argument is called.
  assert.match(src, /shaped\.summary\.opId \?\? row\.op_id/);
});

test('contract: the panel is the tab, and it reads the fleet route only', async () => {
  const panel = await read(PANEL);
  // Every decision on the screen is a pure function somewhere else.
  assert.match(panel, /from '\.\/fleetModel'/);
  assert.match(panel, /from '\.\/fleetPolicyModel'/);
  assert.match(panel, /from '\.\/fleetAdmin'/);
  // The six sections the contract names.
  for (const section of ['health', 'roster', 'policy', 'isolation', 'pnl', 'register']) {
    assert.ok(panel.includes(`'${section}'`), `the panel must render the ${section} section`);
  }
  // The section nav is a real tablist, and the tables have captions.
  assert.match(panel, /role="tablist"/);
  assert.match(panel, /aria-selected=\{section === id\}/);
  assert.match(panel, /aria-label="Fleet Command Sections"/);
  // A stale heartbeat is stated loudly, through the one function that decides.
  assert.match(panel, /classifyHeartbeat\(\{/);
  assert.match(panel, /role=\{heartbeat\.loud \? 'alert' : 'status'\}/);
  // The write half is gated on fleet.write, and the panel says so rather than
  // rendering a button that cannot work.
  assert.match(panel, /const FLEET_WRITE = 'fleet\.write'/);
  assert.match(panel, /hasPermission\(permissions, FLEET_WRITE\)/);
  // Nothing here seats, unseats, evicts or funds, because no such control
  // exists in the route or in the database. Checked against CODE, not against
  // the header comment that explains the rule - `funding_source` is a column of
  // the disclosure register and is data, not a control.
  const code = stripComments(panel).toLowerCase();
  for (const forbidden of [
    'unseat', 'evict', 'launch_all', 'shutdown', 'fn_credit', 'mass_fund', 'chip_transactions',
  ]) {
    assert.ok(!code.includes(forbidden), `${forbidden} must not appear in the panel`);
  }
  // The only two POST bodies it can compose.
  assert.match(panel, /setPolicyBody\(\{/);
  assert.match(panel, /syncRegisterBody\(\{\}\)/);
  assert.equal((panel.match(/method: 'POST'/g) || []).length, 2, 'two writes, no more');
  // The policy save is a typed confirmation that names what will happen.
  assert.match(panel, /requireTyped="FLEET"/);
  assert.match(panel, /preview\.willRequest/);
  assert.match(panel, /KILL_SWITCH_NOTE/);
  // The 202 does not re-read the policy as though something had been written.
  const pending = panel.indexOf('if (isPendingApproval(result)) {');
  assert.ok(pending > -1);
  const branch = panel.slice(pending, panel.indexOf('setPolicyConfirm(false);\n      setEditRow(null);\n      showNotification(result.message', pending));
  assert.ok(!branch.includes('loadPolicy()'), 'nothing changed, so nothing is re-read');
  assert.ok(branch.includes('return;'), 'and the branch must not fall through');
});

test('the panel renders the tri-state booleans and the fields it does not edit', async () => {
  const panel = await read(PANEL);
  // H-2: no checkbox for either boolean, a three-option select for each, and
  // the Inherited option carries the merge's own sentence.
  assert.ok(!/checked=\{draft\.enabled === true\}/.test(panel), 'the checkbox is gone');
  assert.ok(!/checked=\{draft\.pause_new_seatings === true\}/.test(panel));
  for (const field of ['enabled', 'pause_new_seatings']) {
    assert.match(panel, new RegExp(`inheritedOptionLabel\\('${field}', editorInherits\\)`));
    assert.match(
      panel,
      new RegExp(`${field}: e\\.target\\.value === '' \\? null : e\\.target\\.value === 'true'`),
      `${field} must send null for Inherited`,
    );
  }
  assert.equal((panel.match(/<option value="true">Yes<\/option>/g) || []).length, 2);
  assert.equal((panel.match(/<option value="false">No<\/option>/g) || []).length, 2);
  // The merge is quoted only when it IS this row's merge.
  assert.match(panel, /const editorInherits = useMemo\(/);
  assert.match(panel, /forClub === editRow\?\.scopeId/);

  // L-3: the schedule is a field the route accepts and this form does not
  // offer, and the form says so rather than leaving an absent box to be read as
  // an absent field.
  assert.match(panel, /SCHEDULE_NOT_EDITABLE_NOTE/);
  assert.match(SCHEDULE_NOT_EDITABLE_NOTE, /Not Edited From This Form Yet/);
  assert.match(SCHEDULE_NOT_EDITABLE_NOTE, /Leaves Whatever Is Already On The Row/);

  // L-4: the policy list is paged like every other list on this tab.
  assert.match(panel, /const \[policyOffset, setPolicyOffset\] = useState\(0\)/);
  assert.match(panel, /noun="Policy Rows"/);
  assert.match(panel, /goPolicyPage\(policyOffset \+ POLICY_PAGE_SIZE\)/);
  assert.match(panel, /goPolicyPage\(policyOffset - POLICY_PAGE_SIZE\)/);
  assert.match(panel, /offset: policyOffset/);
});

test('money figures are withheld by name, never rendered as zero (review M-3)', async () => {
  const panel = await read(PANEL);
  // The section is not offered to an account that cannot open it, and the tab
  // says which permission is missing - the pattern already used for
  // fleet.write on Save Policy and Sync Register.
  assert.match(panel, /const MONEY_READ = 'money\.read'/);
  assert.match(panel, /hasPermission\(permissions, MONEY_READ\)/);
  assert.match(panel, /ALL_SECTIONS\.filter\(\(\[id\]\) => id !== 'pnl' \|\| mayReadMoney\)/);
  assert.match(panel, /\{section === 'pnl' && mayReadMoney && \(/);
  assert.match(panel, /P And L Is Not Shown/);
  // A 403 that arrives anyway is handled as the answer it is, by its code.
  assert.match(panel, /err\.code === 'money_read_required'/);
  // And in the horse 360 a withheld figure says so instead of reading zero.
  assert.match(panel, /const MONEY_HIDDEN_TEXT = 'Hidden: Needs The Money Read Permission'/);
  assert.match(panel, /horse\.playRecord\?\.totalProfitVisible === false/);
  assert.match(panel, /horseMoneyHidden \? MONEY_HIDDEN_TEXT : num\(horse\.profile\?\.diamonds\)/);
  assert.ok(
    !/factLabel>Diamonds<\/span>\s*<span className=\{styles\.factValue\}>\{num\(horse\.profile\?\.diamonds\)\}/.test(panel),
    'the unguarded diamond render is gone',
  );
});

test('a replayed policy save is told it already applied, not shown a raw error', async () => {
  const panel = await read(PANEL);
  // The route answers 409 already_executed when a completed approval's key is
  // replayed. The change IS in place, so the panel says that, closes the editor
  // and re-reads the rows rather than leaving an operator staring at a refusal
  // over a form they will now submit a second time.
  assert.match(panel, /err\.code === 'already_executed'/);
  assert.match(panel, /That Change Was Already Applied Under This Key/);
  const at = panel.indexOf("err.code === 'already_executed'");
  const branch = panel.slice(at, at + 900);
  assert.ok(branch.includes('await loadPolicy();'), 'the list is re-read');
  assert.ok(branch.includes('setEditRow(null);'), 'and the editor closes');
  assert.ok(branch.includes('return;'), 'and it does not fall through to the error toast');
});

test('the panel spells acronyms and labels the way the rest of the console does', async () => {
  const panel = await read(PANEL);
  // L-1 and L-2: ID, not Id, and Title Case in every placeholder.
  for (const wrong of [
    'placeholder="Club id"',
    'placeholder="Leave blank for the global answer"',
    'placeholder="All clubs"',
    "'Horse Id'", "'Club Id'", "'Table Id'",
  ]) {
    assert.ok(!panel.includes(wrong), `${wrong} must not appear`);
  }
  for (const right of [
    'placeholder="Club ID"',
    'placeholder="Leave Blank For The Global Answer"',
    'placeholder="All Clubs"',
    "['horse_id', 'Horse ID']",
    "['club_id', 'Club ID']",
    "['table_id', 'Table ID']",
  ]) {
    assert.ok(panel.includes(right), `${right} must appear`);
  }
  // No lower-case sentence left in a placeholder anywhere on the tab.
  for (const match of panel.match(/placeholder="[^"]+"/g) || []) {
    const value = match.slice('placeholder="'.length, -1);
    for (const word of value.split(' ')) {
      assert.match(word, /^[A-Z0-9]/, `${match} must be Title Case`);
    }
  }
});

test('the Phase 3 files obey the house rules on dashes, emoji, hex and .single()', async () => {
  for (const file of PHASE3_FILES) {
    const src = await read(file);
    assert.ok(!src.includes(EM_DASH), `${file}: no em dashes (U+2014)`);
    assert.ok(!EMOJI.test(src), `${file}: no emoji`);
    assert.ok(!RAW_HEX.test(src), `${file}: no raw hex - use T tokens or a CSS class`);
    assert.ok(!RAW_RGBA.test(src), `${file}: no raw rgba either`);
    assert.ok(!src.includes('.single('), `${file}: no .single() - always .maybeSingle()`);
  }
});
