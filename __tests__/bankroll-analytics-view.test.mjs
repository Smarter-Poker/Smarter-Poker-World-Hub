import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chartTicks,
  buildTrend,
  comparePeriods,
  histogram,
  sessionSummary,
  venueBreakdown,
} from '../src/lib/bankroll/analyticsView.mjs';

const session = (entry_date, net_result, props = {}) => ({
  entry_date,
  net_result,
  category: 'poker_cash',
  gross_in: 20,
  ...props,
});
const rows = [
  session('2025-03-07', -5.25, { location_name: 'First' }),
  session('2025-02-28', -4.25, { location_name: 'First' }),
  session('2025-03-01', 10.5, {
    location_name: 'Second',
    category: 'poker_mtt',
    start_time: '2025-03-01T12:00Z',
    end_time: '2025-03-01T14:00Z',
  }),
  session('2025-03-07', -2.19, { category: 'expense' }),
  session('2025-03-07', 999, { category: 'transfer' }),
];

test('periods keep cents, years, signed category totals and session-only counts', () => {
  const model = buildTrend(rows, '2025-03-01', '2025-03-07');
  assert.equal(model.total, 306);
  assert.equal(model.high, 1050);
  assert.equal(model.low, 0);
  assert.equal(model.series.length, 7);
  assert.equal(model.series.at(-1).cumulative, 306);
  assert.deepEqual(
    model.series.map((d) => d.sessions),
    [1, 0, 0, 0, 0, 0, 1]
  );
  const mtt = model.categories.find((s) => s.key === 'poker_mtt');
  const alone = buildTrend([rows[2]], '2025-03-01', '2025-03-01').categories[0];
  assert.equal(alone.color, mtt.color);
  const years = buildTrend([...rows, session('2024-03-01', 7)], '2000-01-01', '2025-03-07');
  assert.equal(years.period, 'Month');
  assert.equal(years.series[0].cents, 700);
  assert.equal(years.series.at(-1).cents, 306);
});

test('session distribution, drawdown and hourly rate use recorded sessions and durations', () => {
  const model = buildTrend(rows, '2025-02-01', '2025-03-07');
  const bins = histogram(model.sessions);
  assert.equal(
    bins.reduce((n, b) => n + b.count, 0),
    3
  );
  assert.equal(bins[0].low, -525);
  assert.equal(bins.at(-1).high, 1050);
  assert.deepEqual(histogram([rows[2], rows[2]]), [{ low: 1050, high: 1050, count: 2 }]);
  const s = sessionSummary(rows);
  assert.equal(s.net, 100);
  assert.equal(s.drawdown, 525);
  assert.equal(s.hourlyRate, 525);
  assert.equal(s.timed, 1);
  assert.equal(s.best, 1050);
  assert.equal(s.worst, -525);
  assert.equal(sessionSummary([rows[0]]).hourlyRate, null);
  assert.equal(sessionSummary([rows[0]]).best, -525);
  assert.equal(sessionSummary([]).roi, null);
});

test('historical and venue comparisons keep the previous closing date and independently sort', () => {
  const m = comparePeriods(rows, 'month', '2025-03-08');
  assert.equal(m.previous.net, -425);
  assert.equal(m.current.net, 525);
  const y = comparePeriods([...rows, session('2024-12-31', 3.21)], 'year', '2025-03-08');
  assert.equal(y.previous.net, 321);
  assert.equal(y.current.net, 100);
  assert.deepEqual(
    venueBreakdown(rows, 'sessions').map((v) => v.name),
    ['First', 'Second']
  );
  assert.deepEqual(
    venueBreakdown(rows, 'profit').map((v) => v.name),
    ['Second', 'First']
  );
});

test('zero-based chart rulers include negative and positive extremes and keep counts integral', () => {
  assert.deepEqual(chartTicks(-1150, 1525), [-2000, -1000, 0, 1000, 2000]);
  assert.deepEqual(chartTicks(0, 3), [0, 1, 2, 3]);
  assert.deepEqual(chartTicks(0, 0), [0, 1]);
  assert.deepEqual(chartTicks(-2, 1), [-2, -1, 0, 1]);
});

test('running-net line keeps intra-month peaks instead of month-end buckets', () => {
  // Reported 2026-11-27: All Time chart drew a flat line at the final total because the
  // line plotted monthly buckets, which keep only each month's closing value.
  const model = buildTrend(
    [session('2026-02-10', 100), session('2026-02-20', 192.17), session('2026-02-25', -435.8)],
    '2000-01-01',
    '2026-11-27'
  );
  assert.equal(model.period, 'Month');
  const values = model.line.map((p) => p.cumulative);
  assert.deepEqual(values, [0, 10000, 29217, -14363, -14363]);
  assert.equal(Math.max(...values), model.high);
  assert.equal(Math.min(...values), model.low);
  assert.equal(model.line[0].synthetic, true);
  assert.equal(model.line.at(-1).date, '2026-11-27');
  assert.ok(model.line.every((p, i) => !i || p.t > model.line[i - 1].t));
});
