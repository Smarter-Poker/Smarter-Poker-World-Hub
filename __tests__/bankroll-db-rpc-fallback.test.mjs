// Wave 4 db lane: client code that works with or without the database change.
//
// 1. Toke Tracker preferences are saved through fn_profile_settings_set_key
//    (one key merged in place) and fall back to the read-then-write update
//    ONLY when PostgREST says the function does not exist.
// 2. Dashboard totals come from fn_bankroll_totals and fall back to the paged
//    client-side read ONLY on function-missing. The function's answer and the
//    client-side computation map to the same BankrollStats.
//
// The golden totals below were produced by the fn_bankroll_totals draft
// itself, installed on a throwaway local PostgreSQL 16 and called as the
// fixture player on 2026-11-28, over exactly FIXTURE_ROWS / FIXTURE_SEGMENTS.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isFunctionMissing, rpcOrFallback } from '../src/lib/bankroll/rpcFallback.mjs';
import { saveTokePrefsToAccount, DEFAULT_TOKE_PREFS } from '../src/lib/bankroll/tokePrefs.mjs';
import { diffTotals, readTotals, statsFromTotals, totalsFromRows } from '../src/lib/bankroll/bankrollTotals.mjs';
import { periodStats } from '../src/lib/bankroll/bankrollStats.mjs';
import { bankrollBalanceCents, centsToDollars } from '../src/lib/bankroll/ledgerMath.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const MISSING = { data: null, status: 404, error: { code: 'PGRST202', message: 'Could not find the function public.fn_x in the schema cache' } };
const DENIED = { data: null, status: 403, error: { code: '42501', message: 'permission denied for function fn_x' } };

test('only PGRST202 or a bare 404 counts as a missing function', () => {
  assert.equal(isFunctionMissing(MISSING), true);
  assert.equal(isFunctionMissing({ status: 404, error: { message: 'Not Found' } }), true);
  assert.equal(isFunctionMissing(DENIED), false);
  assert.equal(isFunctionMissing({ status: 400, error: { code: '22023', message: 'invalid settings key' } }), false);
  assert.equal(isFunctionMissing({ status: 404, error: { code: 'P0002', message: 'profile not found' } }), false);
  assert.equal(isFunctionMissing({ status: 0, error: { message: 'Failed to fetch' } }), false);
  assert.equal(isFunctionMissing({ status: 200, data: {}, error: null }), false);
  assert.equal(isFunctionMissing(null), false);
});

test('rpcOrFallback uses the function, falls back on missing, throws everything else', async () => {
  let fallbacks = 0;
  const fallback = async () => { fallbacks += 1; return 'old path'; };
  assert.deepEqual(await rpcOrFallback(async () => ({ data: 'new', error: null, status: 200 }), fallback), { data: 'new', via: 'rpc' });
  assert.equal(fallbacks, 0);
  assert.deepEqual(await rpcOrFallback(async () => MISSING, fallback), { data: 'old path', via: 'fallback' });
  assert.equal(fallbacks, 1);
  await assert.rejects(rpcOrFallback(async () => DENIED, fallback), (e) => e.code === '42501');
  assert.equal(fallbacks, 1, 'a permission error is never answered by the old path');
  await assert.rejects(rpcOrFallback(async () => { throw new Error('network'); }, fallback), /network/);
  assert.equal(fallbacks, 1);
});

/** A supabase-js shaped fake: records every call, answers from `answers`. */
function fakeClient(answers) {
  const calls = [];
  const builder = (table) => {
    const state = { table, op: 'select' };
    const api = {
      select(cols) { state.cols = cols; return api; },
      update(body) { state.op = 'update'; state.body = body; return api; },
      eq(col, val) { state.eq = [col, val]; return state.op === 'update' ? finish() : api; },
      maybeSingle() { return finish(); },
    };
    const finish = () => { calls.push({ ...state }); return Promise.resolve(answers[state.op]); };
    return api;
  };
  return {
    calls,
    rpc(name, args) { calls.push({ rpc: name, args }); return Promise.resolve(answers.rpc); },
    from: builder,
  };
}

test('Toke prefs: the installed function saves one key and nothing is read or rewritten', async () => {
  const client = fakeClient({ rpc: { data: { tokeTracker: {} }, error: null, status: 200 } });
  const via = await saveTokePrefsToAccount(client, 'user-1', { downTimerAlerts: false });
  assert.equal(via, 'rpc');
  assert.deepEqual(client.calls, [{
    rpc: 'fn_profile_settings_set_key',
    args: { p_key: 'tokeTracker', p_value: { ...DEFAULT_TOKE_PREFS, downTimerAlerts: false } },
  }]);
});

test('Toke prefs: before the function exists, the read-then-write path keeps other settings keys', async () => {
  const client = fakeClient({
    rpc: MISSING,
    select: { data: { settings: { theme: 'dark', tokeTracker: { shiftNotifications: false } } }, error: null },
    update: { data: null, error: null },
  });
  const via = await saveTokePrefsToAccount(client, 'user-1', { autoSaveShifts: false });
  assert.equal(via, 'fallback');
  assert.equal(client.calls.length, 3);
  assert.deepEqual(client.calls[1], { table: 'profiles', op: 'select', cols: 'settings', eq: ['id', 'user-1'] });
  assert.deepEqual(client.calls[2].body, { settings: { theme: 'dark', tokeTracker: { ...DEFAULT_TOKE_PREFS, autoSaveShifts: false } } });
  assert.deepEqual(client.calls[2].eq, ['id', 'user-1']);
});

test('Toke prefs: any other rpc error is surfaced and the old path does not run', async () => {
  const client = fakeClient({ rpc: DENIED });
  await assert.rejects(saveTokePrefsToAccount(client, 'user-1', {}), (e) => e.code === '42501');
  assert.equal(client.calls.length, 1);
});

test('Toke prefs: a failed read or write on the fallback path is surfaced, never written over', async () => {
  const readFails = fakeClient({ rpc: MISSING, select: { data: null, error: { code: 'PGRST301', message: 'jwt expired' } } });
  await assert.rejects(saveTokePrefsToAccount(readFails, 'user-1', {}), (e) => e.message === 'jwt expired');
  assert.equal(readFails.calls.filter((c) => c.op === 'update').length, 0, 'no blind write after a failed read');
  const writeFails = fakeClient({ rpc: MISSING, select: { data: { settings: {} }, error: null }, update: { error: { message: 'denied' } } });
  await assert.rejects(saveTokePrefsToAccount(writeFails, 'user-1', {}), (e) => e.message === 'denied');
});

test('useTokePrefs saves through saveTokePrefsToAccount and keeps the #3266 stale-answer guard', () => {
  const hook = read('src/components/bankroll/toke/useTokePrefs.js');
  assert.match(hook, /await saveTokePrefsToAccount\(supabase, userId, next\);/);
  assert.doesNotMatch(hook, /\.update\(\{ settings:/, 'the read-then-write lives in tokePrefs.mjs only, as the fallback');
  assert.match(hook, /from\('profiles'\)\.select\('settings'\)/, 'the account read on load is unchanged');
  assert.match(hook, /prefsFromAccount\(prefsRef\.current, data\?\.settings\?\.tokeTracker, editsRef\.current !== editsAtRead\)/);
  assert.match(hook, /console\.warn\('\[TokeTracker\] Preference could not be saved to the account:'/);
});

// ── Totals ─────────────────────────────────────────────────────────────
const U = '11111111-1111-1111-1111-111111111111';
const LOC = 'aaaaaaaa-0000-0000-0000-000000000001';
const FIXTURE_SEGMENTS = [
  { user_id: U, segment_type: 'poker', initial_deposit: '1000.10' },
  { user_id: U, segment_type: 'life', initial_deposit: '999' },
];
// Numeric columns arrive from PostgREST as numbers or numeric strings.
const FIXTURE_ROWS = [
  { id: '1', category: 'poker_cash', location_id: LOC, entry_date: '2026-10-01', start_time: '2026-10-01T21:00:00+00:00', end_time: '2026-10-01T03:00:00+00:00', gross_in: 200, gross_out: 450.25, is_revision: false },
  { id: '2', category: 'poker_mtt', location_id: null, entry_date: '2026-10-05', start_time: null, end_time: null, gross_in: 100, gross_out: 0, is_revision: false },
  { id: '3', category: 'slots', location_id: null, entry_date: '2026-11-02', start_time: '2026-11-02T10:00:00+00:00', end_time: '2026-11-02T11:30:00+00:00', gross_in: '300', gross_out: '50', is_revision: false },
  { id: '4', category: 'expense', location_id: null, entry_date: '2026-11-03', start_time: null, end_time: null, gross_in: -40, gross_out: 0, is_revision: false },
  { id: '5', category: 'deposit', location_id: null, entry_date: '2026-11-04', start_time: null, end_time: null, gross_in: 0, gross_out: 500, is_revision: false },
  { id: '6', category: 'withdrawal', location_id: null, entry_date: '2026-11-05', start_time: null, end_time: null, gross_in: 120, gross_out: 0, is_revision: false },
  { id: '7', category: 'poker_cash', location_id: null, entry_date: '2026-11-06', start_time: null, end_time: null, gross_in: 5, gross_out: 10, is_revision: null },
  { id: '8', category: 'poker_cash', location_id: null, entry_date: '2026-10-01', start_time: null, end_time: null, gross_in: 0, gross_out: 777, is_revision: true },
];

// fn_bankroll_totals() as the fixture player (local PostgreSQL 16, 2026-11-28).
const SQL_ALL_TIME = {
  version: 1,
  balance: { balance_cents: 124035, deposit_cents: 50000, withdrawal_cents: 12000, lifetime_results_cents: -13975, starting_deposit_cents: 100010 },
  period: {
    by_month: { '2026-10': 15025, '2026-11': -29000 }, win_count: 1, session_ms: 27000000,
    by_category: { slots: -25000, expense: -4000, poker_mtt: -10000, poker_cash: 25025 },
    by_location: [{ cents: -39000, location_id: null }, { cents: 25025, location_id: LOC }],
    poker_cents: 15025, expense_cents: 4000, results_cents: -13975, session_count: 3, poker_timed_ms: 21600000,
    non_poker_cents: -25000, poker_timed_cents: 25025, peak_cumulative_cents: 25025, lowest_cumulative_cents: -13975,
  },
};
// fn_bankroll_totals('2026-11-01', '2026-11-30', null)->'period'.
const SQL_NOVEMBER_PERIOD = {
  by_month: { '2026-11': -29000 }, win_count: 0, session_ms: 5400000, by_category: { slots: -25000, expense: -4000 },
  by_location: [{ cents: -29000, location_id: null }], poker_cents: 0, expense_cents: 4000, results_cents: -29000,
  session_count: 1, poker_timed_ms: 0, non_poker_cents: -25000, poker_timed_cents: 0, peak_cumulative_cents: 0,
  lowest_cumulative_cents: -29000,
};

test('totalsFromRows reproduces the database function exactly (all time, a month, a venue)', () => {
  assert.deepEqual(diffTotals(totalsFromRows({ ledgerRows: FIXTURE_ROWS, segments: FIXTURE_SEGMENTS }), SQL_ALL_TIME), []);
  const november = totalsFromRows({ ledgerRows: FIXTURE_ROWS, segments: FIXTURE_SEGMENTS, from: '2026-11-01', to: '2026-11-30' });
  assert.deepEqual(diffTotals(november, { ...SQL_ALL_TIME, period: SQL_NOVEMBER_PERIOD }), []);
  assert.equal(totalsFromRows({ ledgerRows: FIXTURE_ROWS, segments: FIXTURE_SEGMENTS, locationId: LOC }).period.results_cents, 25025);
});

/** What getBankrollStats returned before the rpc, from the same rows. */
function clientSideStats(rows, segments, window = {}) {
  const live = rows.filter((r) => r.is_revision === false);
  const period = live.filter((r) => !['deposit', 'withdrawal'].includes(r.category)
    && (!window.from || r.entry_date >= window.from) && (!window.to || r.entry_date <= window.to)
    && (!window.locationId || r.location_id === window.locationId));
  return { totalBankroll: centsToDollars(bankrollBalanceCents(live, segments)), ...periodStats(period) };
}

function assertSameStats(actual, expected, label) {
  const { totalHours: a, ...restA } = actual;
  const { totalHours: b, ...restB } = expected;
  assert.deepEqual(restA, restB, label);
  assert.ok(Math.abs(a - b) < 1e-9, label + ' totalHours ' + a + ' vs ' + b);
}

test('the rpc answer and the client-side read map to the same BankrollStats', () => {
  assertSameStats(statsFromTotals(SQL_ALL_TIME), clientSideStats(FIXTURE_ROWS, FIXTURE_SEGMENTS), 'fixture all time');
  assertSameStats(statsFromTotals({ ...SQL_ALL_TIME, period: SQL_NOVEMBER_PERIOD }),
    clientSideStats(FIXTURE_ROWS, FIXTURE_SEGMENTS, { from: '2026-11-01', to: '2026-11-30' }), 'fixture November');

  // A generated ledger: every category, odd cents, overnight and missing times.
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const categories = ['poker_cash', 'poker_mtt', 'casino_table', 'slots', 'sports', 'expense', 'deposit', 'withdrawal'];
  const rows = Array.from({ length: 1500 }, (_, i) => {
    const day = '2026-' + String(1 + Math.floor(rand() * 11)).padStart(2, '0') + '-' + String(1 + Math.floor(rand() * 28)).padStart(2, '0');
    const startHour = Math.floor(rand() * 24);
    const endHour = Math.floor(rand() * 24);
    const timed = rand() > 0.3;
    return {
      id: String(i),
      category: categories[Math.floor(rand() * categories.length)],
      location_id: rand() > 0.5 ? LOC : null,
      entry_date: day,
      start_time: timed ? day + 'T' + String(startHour).padStart(2, '0') + ':15:00+00:00' : null,
      end_time: timed ? day + 'T' + String(endHour).padStart(2, '0') + ':45:30+00:00' : null,
      gross_in: (Math.floor(rand() * 100000) / 100).toFixed(2),
      gross_out: Math.floor(rand() * 100000) / 100,
      is_revision: rand() > 0.1 ? false : (rand() > 0.5 ? true : null),
    };
  });
  for (const window of [{}, { from: '2026-03-01', to: '2026-06-30' }, { locationId: LOC }, { from: '2026-12-01' }]) {
    const totals = totalsFromRows({ ledgerRows: rows, segments: FIXTURE_SEGMENTS, ...window });
    assert.deepEqual(readTotals(JSON.parse(JSON.stringify(totals))), readTotals(totals), 'survives JSON like an rpc answer');
    assertSameStats(statsFromTotals(totals), clientSideStats(rows, FIXTURE_SEGMENTS, window), JSON.stringify(window));
  }
});

test('an incomplete rpc answer throws instead of reading as zero', () => {
  assert.throws(() => statsFromTotals(null), /unrecognised/);
  assert.throws(() => statsFromTotals({ ...SQL_ALL_TIME, version: 2 }), /unrecognised/);
  const { results_cents, ...withoutResults } = SQL_ALL_TIME.period;
  assert.equal(typeof results_cents, 'number');
  assert.throws(() => statsFromTotals({ ...SQL_ALL_TIME, period: withoutResults }), /period\.results_cents/);
  assert.throws(() => statsFromTotals({ ...SQL_ALL_TIME, balance: { ...SQL_ALL_TIME.balance, balance_cents: 12.5 } }), /balance\.balance_cents/);
});

test('getBankrollStats asks fn_bankroll_totals first and keeps the paged read as its only fallback', () => {
  const calc = read('src/lib/bankroll/calculations.ts');
  const stats = calc.slice(calc.indexOf('export async function getBankrollStats'));
  assert.match(stats, /rpcOrFallback\(/);
  assert.match(stats, /supabase\.rpc\('fn_bankroll_totals', \{\s*p_from: startDate \|\| null,\s*p_to: endDate \|\| null,\s*p_location_id: locationId \|\| null,\s*\}\)/);
  assert.match(stats, /statsFromTotals\(response\.data\)/);
  assert.match(stats, /\(\) => clientSideStats\(userId, startDate, endDate, locationId\)/);
  assert.match(stats, /latestTripNet\(userId\)/);
  const fallback = calc.slice(calc.indexOf('async function clientSideStats'), calc.indexOf('export async function getBankrollStats'));
  assert.match(fallback, /fetchAllRows\(/);
  assert.match(fallback, /\.eq\('is_revision', false\)/);
  assert.match(fallback, /periodStats\(entries\)/);
});

test('the read-only live suite lets the totals read through', async () => {
  const { classifyRequest } = await import('../e2e/fixtures/bankrollLiveGuard.mjs');
  const SUPABASE = 'https://kuklfnapbkmacvwxktbh.supabase.co';
  assert.equal(classifyRequest('POST', SUPABASE + '/rest/v1/rpc/fn_bankroll_totals'), 'read');
  assert.equal(classifyRequest('POST', SUPABASE + '/rest/v1/rpc/fn_profile_settings_set_key'), 'data-write');
});

test('the parity script is read-only and refuses to guess an account', () => {
  const script = read('scripts/bankroll-totals-parity.mjs');
  assert.match(script, /TEST_USER_EMAIL is not set - refusing to guess an account/);
  assert.doesNotMatch(script, /method: '(PATCH|DELETE|PUT)'/);
  assert.doesNotMatch(script, /SERVICE_ROLE/);
  const posts = script.match(/method: 'POST'/g) || [];
  assert.equal(posts.length, 2, 'exactly two POSTs: the password sign-in and the read-only rpc');
});
