import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrend } from '../src/lib/bankroll/analyticsView.mjs';
import {
  CLUSTER_SHARE,
  activeShare,
  dateAxisRows,
  idleTail,
  isClustered,
  lineExtremes,
  resolveLineAxis,
  sanitizeLineAxis,
  sessionAxisRows,
  sessionTicks,
  trendSummary,
} from '../src/lib/bankroll/trendAxis.mjs';
import { sanitizeLineAxis as fromFilters, DEFAULT_LINE_AXIS } from '../src/lib/bankroll/dashboardFilters.mjs';

const session = (entry_date, net, id = entry_date) => ({
  id,
  entry_date,
  category: 'poker_cash',
  net_result: net,
});

// The owner's ledger shape, 2026-11-28: 13 sessions on 10 days in Feb-Mar 2026,
// climbing to +$29,217 and falling to -$14,363, viewed All Time on Nov 28.
const running = [37, 1883, 13183, 22894, 29217, 18426, 12592, 2179, -12370, -14363];
const days = ['02-10', '02-12', '02-15', '02-17', '02-20', '02-24', '02-27', '03-02', '03-05', '03-09'];
function dansLedger() {
  const rows = [];
  let previous = 0;
  days.forEach((day, i) => {
    const net = running[i] - previous;
    previous = running[i];
    if (i % 3 === 1) {
      // Two sessions that day, same total.
      rows.push(session('2026-' + day, net - 500, day + 'a'), session('2026-' + day, 500, day + 'b'));
    } else rows.push(session('2026-' + day, net, day));
  });
  return rows;
}

test("Dan's ledger: by date the climb and drop squeeze into the left edge, so By Session is the default", () => {
  const entries = dansLedger();
  assert.equal(entries.length, 13);
  const model = buildTrend(entries, '2000-01-01', '2026-11-28');
  const share = activeShare(model.line);
  assert.ok(share < 0.12, 'recorded days fill ' + share);
  assert.equal(isClustered(model.line), true);
  assert.equal(resolveLineAxis('auto', model.line), 'session');
  assert.equal(resolveLineAxis(undefined, model.line), 'session');
  // An explicit choice always wins.
  assert.equal(resolveLineAxis('date', model.line), 'date');
  assert.equal(resolveLineAxis('session', model.line), 'session');

  const rows = sessionAxisRows(model.line);
  assert.deepEqual(rows.map((r) => r.x), [...Array(11).keys()]);
  assert.deepEqual(rows.map((r) => r.cumulative / 100), [0, ...running]);
  assert.equal(rows[0].synthetic, true);
  assert.equal(rows[0].date, '2026-02-09');
  assert.ok(rows.slice(1).every((r) => !r.synthetic));
  // Evenly spaced: the peak is at 5 of 10, not at 5% of the width.
  assert.equal(rows.find((r) => r.cumulative === 2921700).x, 5);

  const ticks = sessionTicks(rows.length);
  assert.ok(ticks.length <= 4 && ticks.length >= 2);
  assert.equal(ticks[0], 1);
  assert.equal(ticks.at(-1), 10);

  const { peak, lowest } = lineExtremes(model.line);
  assert.equal(peak.cumulative, 2921700);
  assert.equal(peak.date, '2026-02-20');
  assert.equal(lowest.cumulative, -1436300);
  assert.equal(lowest.date, '2026-03-09');

  const tail = idleTail(model.line);
  assert.equal(tail.since, '2026-03-09');
  assert.equal(tail.to, Date.parse('2026-11-28T00:00:00Z'));

  const byDate = dateAxisRows(model.line);
  const last = byDate.length - 1;
  assert.equal(byDate[last].solid, null, 'the solid line stops at the last session');
  assert.equal(byDate[last].tail, -1436300);
  assert.equal(byDate[last - 1].solid, -1436300);
  assert.equal(byDate[last - 1].tail, -1436300, 'the tail starts where the line ends');
  assert.ok(byDate.slice(0, last - 1).every((r) => r.tail === null));

  const text = trendSummary(
    model.line,
    (c) => (c < 0 ? '-' : c > 0 ? '+' : '') + '$' + Math.abs(c / 100),
    (d) => d
  );
  assert.equal(
    text,
    'Running net started at $0 on 2026-02-09. Peak +$29217 on 2026-02-20. ' +
      'Lowest -$14363 on 2026-03-09. Current -$14363 as of 2026-11-28. No sessions since 2026-03-09.'
  );
});

test('a single-session ledger: one recorded day, anchor first, peak only', () => {
  const model = buildTrend([session('2026-03-01', 250)], '2000-01-01', '2026-11-28');
  assert.equal(isClustered(model.line), true);
  const rows = sessionAxisRows(model.line);
  assert.deepEqual(rows.map((r) => [r.x, r.cumulative]), [[0, 0], [1, 25000]]);
  assert.deepEqual(sessionTicks(rows.length), [1]);
  const { peak, lowest } = lineExtremes(model.line);
  assert.equal(peak.date, '2026-03-01');
  assert.equal(lowest, null);
  // Recorded today: no tail, no clustering, By Date.
  const today = buildTrend([session('2026-11-28', -40)], '2026-11-22', '2026-11-28');
  assert.equal(idleTail(today.line), null);
  assert.equal(isClustered(today.line), false);
  assert.equal(resolveLineAxis('auto', today.line), 'date');
  assert.equal(dateAxisRows(today.line).every((r) => r.tail === null), true);
  assert.match(trendSummary(today.line, String, String), /Never above 0\. Lowest -4000/);
});

test('spread-out sessions stay By Date; the boundary is a quarter of the width', () => {
  const model = buildTrend(
    [session('2026-01-05', 10), session('2026-06-01', -5), session('2026-11-20', 7)],
    '2000-01-01',
    '2026-11-28'
  );
  assert.equal(isClustered(model.line), false);
  assert.equal(resolveLineAxis('auto', model.line), 'date');
  const line = [
    { t: 0, cumulative: 0, synthetic: true },
    { t: 25, cumulative: 1 },
    { t: 100, cumulative: 1, synthetic: true },
  ];
  assert.equal(activeShare(line), CLUSTER_SHARE);
  assert.equal(isClustered(line), false);
  line[1].t = 24;
  assert.equal(isClustered(line), true);
  assert.equal(activeShare([]), null);
  assert.equal(isClustered(undefined), false);
});

test('stored and linked x-axis values are validated', () => {
  assert.equal(DEFAULT_LINE_AXIS, 'auto');
  for (const good of ['date', 'session']) assert.equal(sanitizeLineAxis(good), good);
  for (const bad of [undefined, null, '', 'Session', 'time', 1, ['date'], { v: 'date' }])
    assert.equal(sanitizeLineAxis(bad), 'auto');
  assert.equal(fromFilters, sanitizeLineAxis);
  // A bad stored value falls back to the data-driven default.
  const model = buildTrend(dansLedger(), '2000-01-01', '2026-11-28');
  assert.equal(resolveLineAxis('pie', model.line), 'session');
});

test('session ticks stay sparse and in order', () => {
  assert.deepEqual(sessionTicks(0), []);
  assert.deepEqual(sessionTicks(1), [0]);
  assert.deepEqual(sessionTicks(4), [1, 2, 3]);
  const many = sessionTicks(201);
  assert.equal(many.length, 4);
  assert.deepEqual([many[0], many.at(-1)], [1, 200]);
  assert.ok(many.every((v, i) => !i || v > many[i - 1]));
});
