// Bankroll library audit, wave 3: leak totals, period stats, venue lookup,
// and the reads behind them (paged past PostgREST's 1,000-row cap, ids in
// batches of 100, failures thrown instead of shown as $0 or "no leaks").
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  allRowsOf,
  netDollars,
  sessionClockHour,
  stakeTotals,
  timeBlockTotals,
  tripTotals,
} from '../src/lib/bankroll/leakMath.mjs';
import { leakRiskOf, periodStats } from '../src/lib/bankroll/bankrollStats.mjs';
import { exactIlikePattern } from '../src/lib/bankroll/venueNames.mjs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

const row = (category, gross_in, gross_out, extra = {}) => ({ category, gross_in, gross_out, ...extra });
const cash = (stakes, gross_in, gross_out, start, end, extra = {}) =>
  row('poker_cash', gross_in, gross_out, { stakes, start_time: start, end_time: end, ...extra });

test('an overnight session counts its real hours toward a stake leak', () => {
  // 21:00 to 03:00 is six hours, not -18. Four such losing sessions are 24 hours.
  const rows = [1, 2, 3, 4].map((d) =>
    cash('1/3', 500, 200, `2026-11-0${d}T21:00:00+00:00`, `2026-11-0${d}T03:00:00+00:00`));
  assert.deepEqual(stakeTotals(rows), { '1/3': { net: -1200, hours: 24, sessions: 4 } });
});

test('stake totals are summed in cents', () => {
  const rows = Array.from({ length: 30 }, () => cash('2/5', 0.3, 0.2, '2026-01-01T10:00:00', '2026-01-01T11:00:00'));
  assert.equal(stakeTotals(rows)['2/5'].net, -3, 'thirty $0.10 losses are exactly -$3');
  assert.equal(netDollars([row('slots', 0.1, 0), row('slots', 0.2, 0)]), -0.3);
});

test('the time-of-day block is the hour the player typed, not the viewer zone', () => {
  // start_time is the typed wall clock stored as UTC: 20:00 is an evening session.
  assert.equal(sessionClockHour('2026-11-20T20:00:00+00:00'), 20);
  assert.equal(sessionClockHour('2026-11-20T02:15:00'), 2);
  assert.equal(sessionClockHour(null), null);
  assert.equal(sessionClockHour('garbage'), null);
  const blocks = timeBlockTotals([
    row('poker_cash', 200, 100, { start_time: '2026-10-10T20:00:00+00:00' }),
    row('poker_cash', 200, 100, { start_time: '2026-10-11T23:59:00+00:00' }),
    row('slots', 50, 0, { start_time: '2026-10-11T05:00:00+00:00' }),
    row('slots', 50, 0, { start_time: null }),
  ]);
  assert.deepEqual(blocks.evening, { net: -200, count: 2 });
  assert.deepEqual(blocks.late_night, { net: -50, count: 1 });
  assert.deepEqual(blocks.afternoon, { net: 0, count: 0 });
});

test('a trip result counts sessions and expenses, never deposits or withdrawals', () => {
  assert.deepEqual(tripTotals([
    row('poker_cash', 1000, 1500),
    row('expense', 800, 0),
    row('expense', -20, 0), // typed negative: still a cost
    row('deposit', 0, 5000),
    row('withdrawal', 3000, 0),
  ]), { gambling: 500, expenses: 820, net: -320 });
  assert.deepEqual(tripTotals([]), { gambling: 0, expenses: 0, net: 0 });
});

test('leak reads page past 1,000 rows and a failed page throws', async () => {
  const table = Array.from({ length: 2345 }, (_, i) => ({ id: i }));
  const ranges = [];
  const rows = await allRowsOf(() => ({
    range: async (from, to) => { ranges.push([from, to]); return { data: table.slice(from, to + 1), error: null }; },
  }));
  assert.equal(rows.length, 2345);
  assert.deepEqual(ranges, [[0, 999], [1000, 1999], [2000, 2999]]);
  await assert.rejects(
    allRowsOf(() => ({ range: async () => ({ data: null, error: { message: 'Failed to fetch' } }) }), 'trips'),
    /Could not read the trips: Failed to fetch/,
  );
});

test('every leak detector reads through allRowsOf and totals in cents', () => {
  const src = read('src/lib/bankroll/leakDetection.ts');
  const detectors = src.slice(src.indexOf('export async function getCategoryLeakPercentage'), src.indexOf('export async function runLeakAnalysis'));
  assert.equal((detectors.match(/allRowsOf\(/g) || []).length, 7);
  assert.doesNotMatch(detectors, /net_result \|\| 0/);
  assert.doesNotMatch(detectors, /getHours\(\)/);
  assert.doesNotMatch(detectors, /getTime\(\) - new Date/);
  assert.match(detectors, /stakeTotals\(data\)/);
  assert.match(detectors, /timeBlockTotals\(data\)/);
  assert.match(detectors, /tripTotals\(rowsByTrip\.get\(trip\.id\) \|\| \[\]\)/);
  assert.match(detectors, /for \(const batch of idBatches\(trips\.map/);
});

test('period stats are one set of rows: results, hours, sessions and win rate', () => {
  const rows = [
    row('poker_cash', 100, 300, { start_time: '2026-11-01T22:00:00', end_time: '2026-11-01T02:00:00' }), // +200, 4h overnight
    row('poker_mtt', 0.1, 0.2), // +0.10, untimed
    row('slots', 100, 0), // -100
    row('expense', 50.05, 0), // -50.05
    row('expense', -20, 0), // typed negative: still money out
    row('deposit', 0, 1000),
    row('poker_cash', 0, 500, { is_revision: true }),
  ];
  const s = periodStats(rows);
  assert.equal(s.allInNet, 30.05, '200 + 0.10 - 100 - 50.05 - 20, deposits excluded, no float residue');
  assert.equal(s.pokerNet, 200.1);
  assert.equal(s.nonPokerNet, -100);
  assert.equal(s.expenseTotal, 70.05);
  assert.equal(s.totalHours, 4);
  assert.equal(s.hourlyRate, 50, 'only timed poker sessions set the hourly rate');
  assert.equal(s.sessionCount, 3);
  assert.equal(Math.round(s.winRate), 67);
  assert.deepEqual(periodStats([]), {
    allInNet: 0, pokerNet: 0, nonPokerNet: 0, expenseTotal: 0, leakRisk: 'LOW',
    hourlyRate: 0, totalHours: 0, sessionCount: 0, winRate: 0,
  });
});

test('leak risk compares non-poker losses with poker profit', () => {
  assert.equal(leakRiskOf(100000, -60000), 'HIGH');
  assert.equal(leakRiskOf(100000, -30000), 'MEDIUM');
  assert.equal(leakRiskOf(100000, -10000), 'LOW');
  assert.equal(leakRiskOf(0, -100001), 'HIGH');
  assert.equal(leakRiskOf(-5000, -60000), 'MEDIUM');
  assert.equal(leakRiskOf(0, 0), 'LOW');
});

test('a venue name only matches itself in the case-insensitive lookup', () => {
  assert.equal(exactIlikePattern('Club_21'), 'Club\\_21');
  assert.equal(exactIlikePattern('100% Poker'), '100\\% Poker');
  assert.equal(exactIlikePattern('A\\B'), 'A\\\\B');
  assert.equal(exactIlikePattern('Bellagio'), 'Bellagio');
  const memory = read('src/lib/bankroll/locationMemory.ts');
  assert.match(memory, /\.ilike\('name', exactIlikePattern\(name\)\)/);
  assert.match(memory, /if \(lookupError\) throw lookupError;/, 'a failed lookup never creates a duplicate venue');
  assert.match(memory, /This Venue Could Not Be Renamed/);
});

test('the dashboard stats read every row and throw on failure', () => {
  const calc = read('src/lib/bankroll/calculations.ts');
  // Since 2026-11-28 the period figures come from fn_bankroll_totals, by the
  // same rules (bankroll-db-rpc-fallback.test.mjs proves the mapping).
  assert.match(calc, /statsFromTotals\(data\)/);
  assert.match(calc, /bankrollBalanceCents\(/);
  assert.doesNotMatch(calc, /net_result/, 'results come from gross_in/gross_out via ledgerMath, as the Net Results tile does');
  assert.doesNotMatch(calc, /const \{ (data|count)[^}]*\} = await supabase\s*\n\s*\.from\('bankroll_ledger'\)/);
});

test('segment balances are recomputed from every ledger row, never read-modify-written', () => {
  const sel = read('src/lib/bankroll/bankrollSelectors.ts');
  const recalc = sel.slice(sel.indexOf('async function recalculateSegmentBalance'), sel.indexOf('export async function createLedgerEntry'));
  assert.match(recalc, /await fetchAllRows\(/);
  assert.match(recalc, /if \(segmentReadError\) throw segmentReadError;/);
  assert.doesNotMatch(sel, /export async function updateSegmentBalance/);
  assert.doesNotMatch(sel, /current_balance \|\| 0\) \+ amount/);
  const has = sel.slice(sel.indexOf('export async function hasStartingBankroll'), sel.indexOf('export async function setStartingBankroll'));
  assert.match(has, /if \(error\) throw error;/, 'a failed read is not "no starting bankroll"');
  const start = sel.slice(sel.indexOf('export async function setStartingBankroll'), sel.indexOf('export async function adjustBankroll'));
  assert.match(start, /\.select\('id'\);\s*\n\s*if \(error\) throw error;\s*\n\s*if \(!data \|\| data\.length === 0\) throw/);
  assert.doesNotMatch(start, /current_balance: amount/);
  assert.doesNotMatch(start, /Silent mutation failed/);
});

test('toke reads batch events by 100 and page past 1,000 downs', () => {
  const toke = read('src/lib/bankroll/tokeSelectors.ts');
  assert.match(toke, /for \(const batch of idBatches\(gigIds\)\)/);
  assert.match(toke, /&limit=\$\{PAGE\}&offset=\$\{offset\}/);
  assert.doesNotMatch(toke, /\.in\('gig_id', gigIds\)/);
  assert.doesNotMatch(toke, /gig_id=in\.\(\$\{idList\}\)&select=\*`\)/);
  const fetchGigs = toke.slice(toke.indexOf('export async function fetchGigs'), toke.indexOf('export async function getActiveGig'));
  assert.match(fetchGigs, /postgrestRowsForGigs<any>\('toke_downs', gigIds\)/);
  const analytics = toke.slice(toke.indexOf('export async function getTokeAnalytics'));
  assert.match(analytics, /rowsForGigs\('toke_downs', '\*', gigIds\)/);
  const cal = read('src/lib/bankroll/calendarSelectors.ts');
  assert.match(cal.slice(cal.indexOf('export async function fetchCalendarEvents')), /fetchAllRows\(/);
});
