import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildGigReportCsv,
  buildTokeAnalyticsCsv,
  computeTotalHours,
  decorateGigDay,
  eventDayCount,
  gigReportStats,
  irsMileageRate,
  monthTokes,
  safeFileName,
} from '../src/lib/bankroll/tokeReport.mjs';

// Local wall-clock timestamps, so the tests read the same in any time zone.
const at = (day, hh, mm = 0) => new Date(`${day}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`).toISOString();
const down = (over) => ({ down_type: 'cash', toke_amount: 0, down_multiplier: 1, is_double_down: false, ...over });

const gig = { id: 'g', venue_name: 'Bay 101 / Main', start_date: '2026-11-01', end_date: '2026-11-03', hourly_rate: 10, mileage: 40 };
const days = [
  { id: 'd1', day_number: 1, date: '2026-11-01' },
  { id: 'd2', day_number: 2, date: '2026-11-02' },
  { id: 'd3', day_number: 3, date: '2026-11-03' },
];
const downs = [
  down({ id: 'a', day_id: 'd1', started_at: at('2026-11-01', 10), ended_at: at('2026-11-01', 11), toke_amount: 0.1 }),
  down({ id: 'b', day_id: 'd1', down_type: 'break', started_at: at('2026-11-01', 11), ended_at: at('2026-11-01', 11, 30), toke_amount: 0 }),
  down({ id: 'c', day_id: 'd2', down_type: 'tournament', started_at: at('2026-11-02', 10), ended_at: at('2026-11-02', 10, 30), toke_amount: 0.2, down_multiplier: 2, is_double_down: true, tournament_name: '=SUM(A1)' }),
  down({ id: 'd', day_id: 'd3', started_at: at('2026-11-03', 9), ended_at: at('2026-11-03', 10), toke_amount: 60 }),
];
const expenses = [{ id: 'e', day_id: 'd2', category: 'meals', amount: 12.5, created_at: at('2026-11-02', 13) }];

test('a three-day event is three days, not the two days between its dates', () => {
  assert.equal(eventDayCount(gig, days), 3);
  assert.equal(eventDayCount(gig, []), 3);
  assert.equal(eventDayCount({ start_date: '2026-11-05', end_date: '2026-11-05' }, []), 1);
});

test('report totals are cents-exact and per-day divides by the real day count', () => {
  const stats = gigReportStats({ gig, days, downs, expenses });
  assert.equal(stats.totalTokes, 60.3); // 0.1 + 0.2 + 60, not 60.300000000000004
  assert.equal(stats.totalDowns, 3);
  assert.equal(stats.breakCount, 1);
  assert.equal(stats.doubleDownCount, 1);
  // 1h + 0.5h break + 0.5h at 2x + 1h = 3.5 paid hours
  assert.equal(stats.totalHoursWorked, 3.5);
  assert.equal(stats.hourlyPay, 35);
  assert.equal(stats.totalEarnings, 82.8);
  assert.equal(stats.durationDays, 3);
  assert.equal(stats.perDay, 27.6);
  assert.equal(stats.avgTokePerDown, 20.1);
  assert.equal(stats.tokesPerHour, 17.23);
});

test('day totals only count that day\'s downs and expenses', () => {
  const day2 = decorateGigDay(days[1], downs, expenses);
  assert.equal(day2.totalTokes, 0.2);
  assert.equal(day2.totalDowns, 1);
  assert.equal(day2.totalHoursWorked, 1);
  assert.equal(day2.totalExpenses, 12.5);
});

test('an open down runs to now and an unreadable multiplier counts as 1x', () => {
  const now = new Date(at('2026-11-01', 12)).getTime();
  assert.equal(computeTotalHours([down({ started_at: at('2026-11-01', 11), ended_at: null, down_multiplier: 'x' })], now), 1);
});

test('the event CSV carries day, date, duration, tournament and expense labels and is formula-safe', () => {
  const report = { gig, days, downs, expenses, stats: gigReportStats({ gig, days, downs, expenses }) };
  const csv = buildGigReportCsv(report, { expenseLabels: { meals: 'Meals' } });
  const lines = csv.trim().split('\r\n');
  assert.ok(lines.includes('"Total Tokes","60.30"'));
  assert.ok(lines.includes('"Per Day","27.60"'));
  assert.ok(lines.some((l) => l.startsWith('"2","2026-11-02","tournament","","\'=SUM(A1)","","","10:00","10:30","30","2","1.00","0.20","Yes"')));
  assert.ok(lines.includes('"2","2026-11-02","Meals","12.50",""'));
});

test('the Earnings Overview CSV rounds money and includes tokes per hour', () => {
  const csv = buildTokeAnalyticsCsv({
    careerTokes: 0.1 + 0.2, totalEvents: 1, totalHours: 2, tokesPerHour: 0.15, avgTokePerDown: 0.15,
    totalExpenses: 0, bestEvent: { tokes: 0.30000000000000004, venueName: 'X' },
    downTypes: { cash: 2, tournament: 0, brush: 0, break: 0 },
    eventTrend: [{ date: '2026-11-01', venue: 'X', tokes: 0.30000000000000004, hours: 2, cumulative: 0.30000000000000004 }],
    monthlyTrend: [{ month: 'Nov 26', tokes: 0.30000000000000004, events: 1 }],
  });
  assert.doesNotMatch(csv, /0000000/);
  assert.match(csv, /"Tokes Per Hour","0.15"/);
});

test('the monthly goal counts tokes in the month they were dealt, including the event in progress', () => {
  const now = new Date(at('2026-11-15', 12));
  const completed = [{ user_id: 'u', start_date: '2026-10-30', downs: [
    down({ started_at: at('2026-10-30', 20), toke_amount: 50 }),
    down({ started_at: at('2026-11-01', 20), toke_amount: 25 }),
  ] }];
  const active = { user_id: 'u', start_date: '2026-11-14', days: [{ downs: [
    down({ started_at: at('2026-11-15', 10), toke_amount: 40 }),
    down({ down_type: 'break', started_at: at('2026-11-15', 11), toke_amount: 99 }),
  ] }] };
  assert.equal(monthTokes([...completed, active], 'u', now), 65);
  assert.equal(monthTokes([...completed, active], 'someone-else', now), 0);
});

test('mileage uses the IRS rate in force, including the July 2026 increase', () => {
  assert.equal(irsMileageRate('2025-06-01'), 0.7);
  assert.equal(irsMileageRate('2026-03-01'), 0.725);
  assert.equal(irsMileageRate('2026-11-03'), 0.76);
  assert.equal(irsMileageRate('2021-01-01'), 0.585);
});

test('event file names are safe for every file system', () => {
  assert.equal(safeFileName('Bay 101 / Main'), 'bay-101-main');
  assert.equal(safeFileName(''), 'event');
});

test('toke sources use local days, fail loudly on report reads and carry no emoji', () => {
  const selectors = readFileSync(new URL('../src/lib/bankroll/tokeSelectors.ts', import.meta.url), 'utf8');
  const tracker = readFileSync(new URL('../src/components/bankroll/TokeTracker.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(selectors, /toISOString\(\)\.split\('T'\)\[0\]/);
  assert.match(selectors, /dayError \|\| downError \|\| expenseError/);
  assert.match(selectors, /gigReportStats\(/);
  assert.doesNotMatch(tracker, /[\u{1F300}-\u{1FAFF}⏰☕]/u);
  assert.match(tracker, /buildGigReportCsv\(/);
});
