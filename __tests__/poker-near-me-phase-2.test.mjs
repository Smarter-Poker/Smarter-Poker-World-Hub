import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { orderDiscoverySchedules, nextTourSchedule, discoveryDate } from '../src/lib/poker-near-me/scheduleDiscovery.mjs';
import { readVenueTournamentRows, isServableDailyTournamentRow } from '../src/lib/poker-near-me/dailyTournamentData.mjs';

test('upcoming-first ordering retains every historical/unknown row and stable equal dates', () => {
  const rows = [
    { id: 'old', start_date: '2025-01-01' },
    { id: 'unknown', start_date: null },
    { id: 'future1', start_date: '2026-10-15' },
    { id: 'future2', start_date: '2026-10-15' },
    { id: 'ongoing', start_date: '2026-10-01', end_date: '2026-10-12' },
    { id: 'invalid', start_date: '2026-02-30' },
    { id: 'recent', start_date: '2026-10-08' },
  ];
  const before = structuredClone(rows);
  const ordered = orderDiscoverySchedules(rows, '2026-10-10');
  assert.deepEqual(ordered.map(row => row.id), ['ongoing', 'future1', 'future2', 'unknown', 'invalid', 'recent', 'old']);
  assert.deepEqual(rows, before);
  assert.deepEqual(ordered.map(row => row.id).sort(), rows.map(row => row.id).sort());
  assert.equal(discoveryDate(new Date('2026-10-10T01:00:00Z')), '2026-10-09');
  const panel = read('src/components/poker-near-me/SeriesTabPanel.jsx');
  assert.match(panel, /let filteredSeries = orderDiscoverySchedules\(series\)/);
  assert.match(panel, /filteredSeries\.slice\(0, displayCount\.series\)/);
  assert.match(panel, /loadMore\('series'\)/);
});

test('tour priority uses only real remaining printed dates without inventing dates', () => {
  const past = { upcoming_series: [{ start_date: '2026-01-01' }] };
  const unknown = { upcoming_series: [{ name: 'Undated' }] };
  const future = { upcoming_series: [{ start_date: '2026-11-01' }] };
  assert.equal(nextTourSchedule(past, '2026-10-10'), null);
  assert.equal(nextTourSchedule(unknown, '2026-10-10'), null);
  assert.equal(nextTourSchedule(future, '2026-10-10').start_date, '2026-11-01');
  assert.equal(nextTourSchedule({ stops_2026: [{ dates: 'Nov 1', start_date: null }] }, '2026-10-10'), null);
  assert.equal(nextTourSchedule({ stops_2026: [{ start_date: '2026-11-01' }], series_2026: [{ start_date: '2026-10-12' }] }, '2026-10-10').start_date, '2026-10-12');
  assert.deepEqual(orderDiscoverySchedules([past, unknown, future], '2026-10-10', row => nextTourSchedule(row, '2026-10-10')), [future, past, unknown]);
  const panel = read('src/components/poker-near-me/ToursTabPanel.jsx');
  assert.match(panel, /orderDiscoverySchedules\(safeTours, undefined, nextTourSchedule\)/);
  assert.match(panel, /filteredTours\.slice\(0, displayCount\.tours\)/);
});

test('public companion reads beyond the old 100-row cutoff without losing history', async () => {
  const rows = Array.from({ length: 1105 }, (_, id) => ({ id, event_date: id < 1000 ? '2025-01-01' : '2026-11-01' }));
  const calls = [];
  const client = { from() {
    const query = {};
    for (const method of ['select', 'in', 'eq', 'or', 'order']) query[method] = () => query;
    query.range = (from, to) => { calls.push([from, to]); return Promise.resolve({ data: rows.slice(from, to + 1), error: null }); };
    return query;
  } };
  const result = await readVenueTournamentRows(client, 1828);
  assert.equal(result.rows.length, 1105);
  const ordered = orderDiscoverySchedules(result.rows, '2026-10-10');
  assert.equal(ordered[0].id, 1000);
  assert.equal(ordered.length, rows.length);
  assert.equal(calls.length, 2);
  const api = read('pages/api/public/venue/[id].js');
  assert.match(api, /readVenueTournamentRows\(getSupabase\(\), id\)/);
  assert.match(api, /return orderDiscoverySchedules\(result\.rows\.filter\(row => isServableDailyTournamentRow\(row\)\)\)/);
  const block = api.slice(api.indexOf('// Daily tournament schedule'), api.indexOf('// Active promotions'));
  const scope = vm.createContext({ getSupabase: () => client, id: 1828, req: {}, dailyScheduleUnavailable: false, reportApiError() {}, console, readVenueTournamentRows, orderDiscoverySchedules, isServableDailyTournamentRow });
  const actual = await vm.runInContext(block.slice(block.indexOf('(async () =>'), block.lastIndexOf('(),') + 2), scope);
  assert.equal(actual.length, 1105);
  assert.equal(actual[0].id, 1000);
  for (const failure of [{ rows, error: new Error('page two unavailable'), truncated: false }, { rows, error: null, truncated: true }]) {
    let reported = 0;
    const failedScope = vm.createContext({ getSupabase: () => client, id: 1828, req: {}, dailyScheduleUnavailable: false, reportApiError() { reported++; }, console, readVenueTournamentRows: async () => failure, orderDiscoverySchedules });
    const rejected = await vm.runInContext(block.slice(block.indexOf('(async () =>'), block.lastIndexOf('(),') + 2), failedScope);
    assert.equal(rejected.length, 0, 'a partial page is never presented as a complete schedule');
    assert.equal(reported, 1);
    assert.equal(failedScope.dailyScheduleUnavailable, true);
  }
  assert.match(api, /daily_schedule_unavailable: dailyScheduleUnavailable/);
  const companion = read('pages/club/[id].js');
  assert.match(companion, /setDailyScheduleUnavailable\(data\.data\.daily_schedule_unavailable === true\)/);
  assert.match(companion, /dailyScheduleUnavailable &&[\s\S]*Daily Schedule Unavailable/);
  const stale = { event_date: null, last_scraped: '2025-01-01T00:00:00Z' };
  const fresh = { event_date: null, last_scraped: new Date(Date.now() - 1000).toISOString() };
  const freshnessScope = vm.createContext({ getSupabase: () => client, id: 1828, req: {}, dailyScheduleUnavailable: false, reportApiError() {}, console, readVenueTournamentRows: async () => ({ rows: [stale, fresh], error: null }), orderDiscoverySchedules, isServableDailyTournamentRow });
  const qualified = await vm.runInContext(block.slice(block.indexOf('(async () =>'), block.lastIndexOf('(),') + 2), freshnessScope);
  assert.equal(qualified.length, 1);
  assert.equal(qualified[0], fresh);
});

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('first-time visitors are not prompted for geolocation on mount', () => {
  const page = read('pages/hub/poker-near-me/[pnmTab].js');
  assert.match(page, /if \(hasSavedLocation && !hasSavedCity/);
  assert.match(page, /First-time permission requests now happen only from an/);
  assert.doesNotMatch(page, /else \{\s*requestGpsLocation\(\);\s*\}/);
});

test('discovery status rail distinguishes live, modeled, and offline data', () => {
  const rail = read('src/components/poker-near-me/DiscoveryStatusRail.jsx');
  assert.match(rail, /aria-label="Discovery data status"/);
  assert.match(rail, /aria-live="polite"/);
  assert.match(rail, /Live observations/);
  assert.match(rail, /Observed \+ modeled/);
  assert.match(rail, /Modeled coverage/);
  assert.match(rail, /Feed offline/);
  assert.match(rail, /'Pending'/);

  const page = read('pages/hub/poker-near-me/[pnmTab].js');
  assert.match(page, /<DiscoveryStatusRail/);
  assert.match(page, /liveDataAgeMinutes=\{liveDataAgeMinutes\}/);
  assert.match(page, /liveDataMode == null \|\| liveDataMode === 'none'/);
  assert.doesNotMatch(page, /liveDataMode === 'none'\s*\? '0'/);
});

test('location recovery dialog is keyboard-addressable and casino themed', () => {
  const modal = read('src/components/ui/LocationEnableModal.jsx');
  assert.match(modal, /role="dialog"/);
  assert.match(modal, /aria-modal="true"/);
  assert.match(modal, /useAccessibleDialog/);
  assert.match(modal, /open: isOpen/);
  assert.match(modal, /ref=\{initialFocusRef\}/);
  assert.match(modal, /location-enable-modal__frame/);

  const theme = read('src/styles/worlds/poker-near-me.css');
  assert.match(theme, /body\.world-poker-near-me \.location-enable-modal__frame/);
  assert.match(theme, /border-radius: 4px !important/);
});

test('tour artwork and compact mobile actions have resilient fallbacks', () => {
  const tour = read('src/components/poker-near-me/TourCard.js');
  assert.match(tour, /onError=\{\(\) => setLogoFailed\(true\)\}/);
  assert.match(tour, /aria-pressed=\{!!isFavorited\}/);
  assert.match(tour, /<button[\s\S]*className="action-btn primary"/);

  const venue = read('src/components/poker-near-me/VenueCard.js');
  assert.match(venue, /aria-label=\{`Get directions to/);
  assert.match(venue, /aria-label=\{`Call /);

  const theme = read('src/styles/worlds/poker-near-me.css');
  assert.match(theme, /:is\(\.fav-btn, \.vc3-fav, \.vc3-icon-btn, \.map-recenter-btn\)/);
  assert.match(theme, /min-width: 44px !important/);
  // Mobile phase 3: the filter bar WRAPS at phone widths. The 86px fixed
  // strip this used to pin (min-height: 86px; flex: 0 0 86px; overflow-y:
  // hidden with a nowrap sideways scroller) clipped its second row and was a
  // "slide to see" rail; the pin moves to the wrapping rule that replaced it.
  assert.match(theme, /\.pnm-filter-bar, \.pnm-top-filters, \.ec-filter-bar, \.day-selector, \.ec-day-selector\) \{[^}]*flex-wrap: wrap !important;/s);
  assert.doesNotMatch(theme, /flex: 0 0 86px/);
});
