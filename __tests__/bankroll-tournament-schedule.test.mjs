// Tournament Calendar schedule helpers: real series rows become calendar
// events on civil dates, and the bankroll plan survives a reload.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calendarDate,
  monthBounds,
  scheduleQueryWindow,
  scheduleUrl,
  normalizeSeries,
  normalizeSchedule,
  eventsInMonth,
  upcomingEvents,
  runsOn,
  planBudget,
  readPlan,
  togglePlan,
} from '../src/lib/bankroll/tournamentSchedule.mjs';

const row = (over = {}) => ({
  id: 5001364, name: '2026 Orleans Winter Open', short_name: '', tour: null, venue: 'The Orleans',
  city: 'Las Vegas', state: 'NV', start_date: '2026-11-27', end_date: '2026-12-20',
  main_event_buyin: 1100, main_event_guaranteed: 500000, series_type: 'circuit', event_count: 63,
  source_url: 'https://example.com/s', ...over,
});

test('month bounds are civil dates, including leap February and December', () => {
  assert.deepEqual(monthBounds(2026, 0), { start: '2026-01-01', end: '2026-01-31' });
  assert.deepEqual(monthBounds(2028, 1), { start: '2028-02-01', end: '2028-02-29' });
  assert.deepEqual(monthBounds(2026, 11), { start: '2026-12-01', end: '2026-12-31' });
  assert.equal(calendarDate(2026, 10, 5), '2026-11-05');
});

test('the schedule query reaches back far enough for series spanning New Year', () => {
  assert.deepEqual(scheduleQueryWindow(2027), { start_date: '2026-10-01', end_date: '2027-12-31' });
  assert.match(scheduleUrl(2027), /^\/api\/poker\/series\?start_date=2026-10-01&end_date=2027-12-31&limit=999$/);
});

test('a series row becomes a calendar event', () => {
  const ev = normalizeSeries(row());
  assert.equal(ev.id, '5001364');
  assert.equal(ev.series, '2026 Orleans…', 'no short name: a trimmed name labels the chip');
  assert.equal(ev.buyIn, 1100);
  assert.equal(ev.date, '2026-11-27');
  assert.equal(ev.endDate, '2026-12-20');
  assert.equal(ev.location, 'The Orleans - Las Vegas, NV');
  assert.equal(ev.guaranteed, '$500K');
  assert.equal(ev.eventCount, 63);
  assert.equal(normalizeSeries(row({ short_name: 'RGPS' })).series, 'RGPS');
});

test('missing or bad data is handled honestly', () => {
  assert.equal(normalizeSeries(row({ start_date: null })), null);
  const ev = normalizeSeries(row({ end_date: '2026-11-01', main_event_buyin: null, venue: '', city: null, state: null, main_event_guaranteed: null, total_guaranteed: null }));
  assert.equal(ev.endDate, '2026-11-27', 'an end before the start collapses to the start');
  assert.equal(ev.buyIn, null, 'an unknown buy-in is not shown as $0');
  assert.equal(ev.location, 'Location To Be Announced');
  assert.equal(ev.guaranteed, null);
});

test('schedule is de-duplicated and sorted', () => {
  const evs = normalizeSchedule([row({ id: 2, start_date: '2026-12-01' }), row({ id: 1 }), row({ id: 2, start_date: '2026-12-01' }), { id: 9 }]);
  assert.deepEqual(evs.map((e) => e.id), ['1', '2']);
});

test('month and upcoming filters use running dates', () => {
  const evs = normalizeSchedule([
    row({ id: 1, start_date: '2026-11-27', end_date: '2026-12-20' }),
    row({ id: 2, start_date: '2026-10-01', end_date: '2026-10-05' }),
    row({ id: 3, start_date: '2027-01-02', end_date: '2027-01-04' }),
  ]);
  assert.deepEqual(eventsInMonth(evs, 2026, 11).map((e) => e.id), ['1'], 'a series that started in November still runs in December');
  assert.deepEqual(upcomingEvents(evs, '2026-12-01').map((e) => e.id), ['1', '3']);
  assert.equal(runsOn(evs[1], '2026-12-20'), true);
  assert.equal(runsOn(evs[1], '2026-12-21'), false);
});

test('plan budget counts listed buy-ins and reports the unknown ones', () => {
  assert.deepEqual(planBudget([{ buyIn: 1000 }, { buyIn: 500 }, { buyIn: null }], 750), { total: 1500, coverage: 50, unknownCount: 1 });
  assert.deepEqual(planBudget([{ buyIn: 1000 }], 5000), { total: 1000, coverage: 100, unknownCount: 0 });
  assert.deepEqual(planBudget([{ buyIn: 1000 }], 0), { total: 1000, coverage: 0, unknownCount: 0 });
});

test('the plan round-trips through storage and ignores corrupt data', () => {
  const ev = normalizeSeries(row());
  const plan = togglePlan([], ev);
  assert.equal(plan.length, 1);
  assert.deepEqual(readPlan(JSON.stringify(plan)), plan);
  assert.deepEqual(togglePlan(plan, ev), []);
  assert.deepEqual(readPlan('not json'), []);
  assert.deepEqual(readPlan('{"a":1}'), []);
  assert.deepEqual(readPlan('[{"id":5}]'), []);
});
