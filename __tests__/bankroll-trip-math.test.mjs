// Trip and series arithmetic shared by the Trip Tracker, the Series Tracker,
// their reports and the Recent Activity summary row.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  summarizeTripEntries,
  summarizeByTrip,
  withTripTotals,
  tripDurationDays,
  tripDayNumber,
  tripDayLabel,
  completionEndDate,
  cleanDay,
  dateRangeProblem,
  sessionHours,
  buildTripReport,
  buildRecentActivity,
  withoutActiveTripRows,
} from '../src/lib/bankroll/tripMath.mjs';

const cash = (id, gin, gout, extra = {}) => ({ id, category: 'poker_cash', gross_in: gin, gross_out: gout, entry_date: '2026-11-20', trip_id: 't1', ...extra });
const expense = (id, amount, extra = {}) => ({ id, category: 'expense', gross_in: amount, gross_out: 0, entry_date: '2026-11-20', trip_id: 't1', expense_type: 'hotel', ...extra });

test('trip totals: sessions net, expenses subtracted once, transfers ignored', () => {
  const s = summarizeTripEntries([
    cash('a', 500, 900),
    cash('b', 300, 0),
    expense('c', 150),
    { id: 'd', category: 'deposit', gross_in: 0, gross_out: 2000, trip_id: 't1' },
  ]);
  assert.equal(s.gamingNet, 100);
  assert.equal(s.totalExpenses, 150);
  assert.equal(s.totalNet, -50);
  assert.equal(s.sessionCount, 2, 'Sessions counts gaming rows only, not expenses');
  assert.equal(s.entryCount, 4);
  assert.equal(s.categoryBreakdown.expense.net, -150);
  assert.equal(s.categoryBreakdown.poker_cash.net, 100);
  assert.equal(s.categoryBreakdown.deposit, undefined);
});

test('an expense is a cost whichever sign the row carries', () => {
  const s = summarizeTripEntries([{ category: 'expense', gross_in: 0, gross_out: 80 }]);
  assert.equal(s.totalExpenses, 80);
  assert.equal(s.totalNet, -80);
});

test('numeric strings from PostgREST are summed as numbers', () => {
  const s = summarizeTripEntries([cash('a', '100.50', '250')]);
  assert.equal(s.totalNet, 149.5);
});

test('summarizeByTrip + withTripTotals give every trip its own totals, zero when empty', () => {
  const sums = summarizeByTrip([cash('a', 0, 100), cash('b', 0, 50, { trip_id: 't2' }), expense('c', 30, { trip_id: 't2' })]);
  const trips = withTripTotals([
    { id: 't1', name: 'Vegas', bankroll_locations: { name: 'Aria' } },
    { id: 't2', name: 'Reno' },
    { id: 't3', name: 'Empty' },
  ], sums);
  assert.deepEqual(trips.map((t) => [t.id, t.totalNet, t.sessionCount, t.location_name]), [
    ['t1', 100, 1, 'Aria'],
    ['t2', 20, 1, null],
    ['t3', 0, 0, null],
  ]);
});

test('duration counts the first and the last day', () => {
  assert.equal(tripDurationDays('2026-11-01', '2026-11-03'), 3, 'Friday to Sunday is three days');
  assert.equal(tripDurationDays('2026-11-01', '2026-11-01'), 1);
  assert.equal(tripDurationDays('2026-11-01', null, '2026-11-10'), 10, 'an open trip runs to today');
  assert.equal(tripDurationDays('2026-03-07', '2026-03-09'), 3, 'a DST weekend is still three days');
  assert.equal(tripDurationDays(null, null), 1);
});

test('day number is calendar based, not hours since UTC midnight', () => {
  assert.equal(tripDayNumber('2026-11-27', '2026-11-27'), 1);
  assert.equal(tripDayNumber('2026-11-26', '2026-11-27'), 2);
  assert.equal(tripDayNumber('2026-11-29', '2026-11-27'), -2);
  assert.equal(tripDayLabel('2026-11-25', '2026-11-27'), 'Day 3');
  assert.equal(tripDayLabel('2026-11-28', '2026-11-27'), 'Starts Tomorrow');
  assert.equal(tripDayLabel('2026-12-01', '2026-11-27'), 'Starts In 4 Days');
});

test('completing records today, never a date before the start', () => {
  assert.equal(completionEndDate('2026-11-20', '2026-11-27'), '2026-11-27');
  assert.equal(completionEndDate('2026-12-05', '2026-11-27'), '2026-12-05');
});

test('form dates: blanks become null and a backwards range is refused', () => {
  assert.equal(cleanDay(''), null);
  assert.equal(cleanDay('2026-11-27'), '2026-11-27');
  assert.equal(cleanDay('11/27/2026'), null);
  assert.equal(dateRangeProblem('2026-11-27', '2026-11-26'), 'The End Date Cannot Be Before The Start Date');
  assert.equal(dateRangeProblem('2026-11-27', null), null);
  assert.equal(dateRangeProblem('2026-11-27', '2026-11-27'), null);
});

test('session hours read real timestamps', () => {
  assert.equal(sessionHours({ start_time: '2026-11-20T20:00:00-06:00', end_time: '2026-11-21T02:30:00-06:00' }), 6.5);
  assert.equal(sessionHours({ start_time: '2026-11-20T20:00:00Z', end_time: null }), 0);
  assert.equal(sessionHours({ start_time: '2026-11-20T20:00:00Z', end_time: '2026-11-20T19:00:00Z' }), 0);
});

test('trip report: totals, ROI on total cost, hourly, per-day and per-expense', () => {
  const report = buildTripReport(
    { id: 't1', name: 'Vegas', start_date: '2026-11-20', end_date: '2026-11-22', bankroll_locations: { name: 'Aria' } },
    [
      cash('a', 1000, 2500, { start_time: '2026-11-20T18:00:00Z', end_time: '2026-11-20T22:00:00Z' }),
      cash('b', 500, 0, { entry_date: '2026-11-21', start_time: '2026-11-21T18:00:00Z', end_time: '2026-11-21T22:00:00Z' }),
      expense('c', 300),
      expense('d', 200, { expense_type: 'flight', entry_date: '2026-11-21' }),
      { id: 'e', category: 'withdrawal', gross_in: 1000, gross_out: 0, entry_date: '2026-11-22', trip_id: 't1' },
    ],
    '2026-11-27',
  );
  const s = report.stats;
  assert.equal(report.trip.location_name, 'Aria');
  assert.equal(s.durationDays, 3);
  assert.equal(s.totalGrossNet, 1000);
  assert.equal(s.totalExpenses, 500);
  assert.equal(s.totalNet, 500);
  assert.equal(s.sessionCount, 2);
  assert.equal(s.entryCount, 4, 'the withdrawal is not a trip entry');
  assert.equal(s.winRate, 50);
  assert.equal(s.biggestWin, 1500);
  assert.equal(s.biggestLoss, -500);
  assert.equal(s.avgPerDay, 167);
  assert.equal(s.avgPerSession, 500);
  assert.equal(s.totalCost, 2000, 'buy-ins plus expenses');
  assert.equal(s.roi, 25);
  assert.equal(s.totalHours, 8);
  assert.equal(s.hourlyRate, 62.5);
  assert.deepEqual(report.dailyBreakdown, { '2026-11-20': 1200, '2026-11-21': -700 });
  assert.deepEqual(report.expenseBreakdown, { hotel: 300, flight: 200 });
});

test('a report with no sessions has no best or worst session and no ROI', () => {
  const report = buildTripReport({ start_date: '2026-11-20', end_date: null }, [], '2026-11-20');
  assert.equal(report.stats.biggestWin, null);
  assert.equal(report.stats.biggestLoss, null);
  assert.equal(report.stats.roi, null);
  assert.equal(report.stats.hourlyRate, null);
  assert.equal(report.stats.durationDays, 1);
});

test('recent activity: active trip rows hidden, a completed trip is one row with ALL its rows', () => {
  const trips = [
    { id: 'active', status: 'active', name: 'Now', trip_type: 'trip' },
    { id: 'done', status: 'completed', name: 'Vegas', trip_type: 'trip', location_name: 'Aria' },
    { id: 'wsop', status: 'completed', name: 'WSOP', trip_type: 'series' },
  ];
  const entries = [
    { id: 'x', trip_id: null, entry_date: '2026-11-25', gross_in: 0, gross_out: 10 },
    { id: 'y', trip_id: 'active', entry_date: '2026-11-26', gross_in: 0, gross_out: 99 },
  ];
  for (let i = 0; i < 70; i++) entries.push({ id: 'd' + i, trip_id: 'done', category: 'poker_cash', entry_date: '2026-11-1' + (i % 10), gross_in: 0, gross_out: 10 });
  entries.push({ id: 'exp', trip_id: 'done', category: 'expense', entry_date: '2026-11-12', gross_in: 100, gross_out: 0 });
  entries.push({ id: 's1', trip_id: 'wsop', category: 'poker_mtt', entry_date: '2026-07-01', gross_in: 1500, gross_out: 0 });

  const rows = buildRecentActivity(entries, trips, 50);
  assert.deepEqual(rows.map((r) => r.id), ['x', 'trip-summary-done', 'trip-summary-wsop']);
  const done = rows[1];
  assert.equal(done.net_result, 600, '70 sessions of +10, minus the 100 expense');
  assert.equal(done._sessionCount, 70);
  assert.equal(done.entry_date, '2026-11-19');
  assert.equal(done.location_name, 'Aria');
  assert.equal(done._tripType, 'trip');
  assert.equal(rows[2]._tripName, 'WSOP', 'a completed series keeps its own name');
  assert.equal(rows[2]._tripType, 'series');
});

test('recent activity never shows a row of an unknown trip loose', () => {
  const rows = buildRecentActivity([{ id: 'q', trip_id: 'gone', entry_date: '2026-11-01', gross_in: 0, gross_out: 5 }], [], 50);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]._isTripSummary, true);
});

test('analysis excludes only rows of a running trip or series', () => {
  const kept = withoutActiveTripRows(
    [{ id: 1, trip_id: null }, { id: 2, trip_id: 'a' }, { id: 3, trip_id: 'c' }],
    [{ id: 'a', status: 'active' }, { id: 'c', status: 'completed' }],
  );
  assert.deepEqual(kept.map((e) => e.id), [1, 3]);
});

// Wiring: the surfaces use these helpers instead of their own arithmetic.
import { readFileSync } from 'node:fs';
const src = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('the dashboard builds Recent Activity from every row, and a summary row opens its trip', () => {
  const page = src('pages/hub/bankroll-manager.js');
  assert.match(page, /buildRecentActivity\(entriesData, allTrips, 50\)/);
  assert.doesNotMatch(page, /Math\.min\(50, entriesData\.length\)/, 'summaries are no longer built from the first 50 rows only');
  assert.match(page, /if \(entry && entry\._isTripSummary\) \{ openTripSummary\(entry\); return; \}/);
  assert.match(page, /entryId\.startsWith\('trip-summary-'\)/, 'a summary row is never sent to deleteLedgerEntry');
  assert.doesNotMatch(page, /Math\.ceil\(\(Date\.now\(\) - new Date\(active(Trip|Series)\.start_date/);
});

test('trip and series selectors share one implementation and use local dates', () => {
  const sel = src('src/lib/bankroll/bankrollSelectors.ts');
  assert.doesNotMatch(sel, /end_date: new Date\(\)\.toISOString\(\)/, 'completion date is the local day');
  assert.match(sel, /completionEndDate\(row\.start_date, localDay\(\)\)/);
  assert.match(sel, /\.in\('trip_id', tripIds\.slice\(start, start \+ TRIP_ID_BATCH\)\)/, 'entries for all trips in bounded batches, not one query per trip');
  assert.match(sel, /export async function reopenTrip/);
  assert.match(sel, /export async function reopenSeries/);
});

test('the ROI view reads the ledger, not a table that does not exist', () => {
  const roi = src('src/components/bankroll/TripROICalculator.jsx');
  assert.doesNotMatch(roi, /from\('trips'\)/);
  assert.doesNotMatch(roi, /supabase/);
  assert.match(src('src/components/bankroll/TripReport.jsx'), /<TripROICalculator report=\{report\} \/>/);
});

test('the Tournament Calendar reads the live series schedule', () => {
  const cal = src('src/components/bankroll/TournamentCalendar.jsx');
  assert.match(cal, /scheduleUrl\(year\)/);
  assert.doesNotMatch(cal, /SERIES_EVENTS/);
});
