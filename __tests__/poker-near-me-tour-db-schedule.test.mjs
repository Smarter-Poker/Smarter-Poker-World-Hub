import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { readTourScheduleRows, databaseTourStops, attachDatabaseTourSchedules } from '../src/lib/poker/tourSchedule.mjs';

const tours = [{ tour_code: 'PGT', official_website: 'https://www.pgt.com', stops_2026: [{ name: 'Registry', dates: 'Dec 10 - Dec 18' }] }];
const row = {
  id: 'one', tour_code: 'PGT', stop_name: 'Poker Masters', stop_venue: 'PokerGO Studio',
  stop_city: 'Las Vegas', stop_state: 'NV', stop_start_date: '2026-10-12', stop_end_date: '2026-10-22',
  start_date: '2026-10-12', source_url: 'https://www.pgt.com/schedule',
  scrape_timestamp: '2026-08-12T15:06:42Z', data_quality: 'manual_research',
  event_name: 'Guessed Main Event', buy_in: 1700,
};

test('recorded source dates become one stop, not invented granular events or current freshness', () => {
  const result = databaseTourStops([row, { ...row, id: 'two', start_date: '2026-10-13' }], tours);
  assert.equal(result.length, 1);
  assert.equal(result[0].start_date, '2026-10-12');
  assert.equal(result[0].dates, 'Oct 12 2026 - Oct 22 2026');
  assert.equal(result[0].scrape_timestamp, '2026-08-12T15:06:42.000Z');
  for (const forbidden of ['buy_in', 'event_name', 'events_count', 'game_type']) assert.equal(forbidden in result[0], false);
});

test('physical stop projection folds typographic duplicates using the newest recorded source', () => {
  const older = { ...row, stop_name: 'Festival \u2014 Championship', scrape_timestamp: '2026-08-01T12:00:00Z' };
  const newer = { ...row, stop_name: 'Festival - Championship', scrape_timestamp: '2026-08-02T12:00:00Z' };
  const inputs = [older, newer];
  const before = JSON.stringify(inputs);
  const result = databaseTourStops(inputs, tours);
  assert.equal(result.length, 1);
  assert.equal(result[0].name, newer.stop_name);
  assert.equal(result[0].scrape_timestamp, '2026-08-02T12:00:00.000Z');
  assert.equal(JSON.stringify(inputs), before);
  assert.equal(databaseTourStops([older, { ...newer, stop_venue: 'Another room' }], tours).length, 2);
  assert.equal(databaseTourStops([older, { ...newer, stop_end_date: '2026-10-23' }], tours).length, 2);
});

test('reject stale, inferred, malformed dates, missing provenance and other publishers', () => {
  const badRows = [
    { ...row, data_quality: 'stale' }, { ...row, data_quality: 'scraped_inferred' },
    { ...row, stop_start_date: '2026-02-30' }, { ...row, stop_end_date: '2026-10-01' },
    { ...row, source_url: 'https://www.pgt.com.evil.example/schedule' },
    { ...row, source_url: 'https://user:secret@pgt.com/schedule' },
    { ...row, source_url: 'http://pgt.com/schedule' }, { ...row, scrape_timestamp: null },
    { ...row, tour_code: 'UNKNOWN' }, { ...row, stop_name: '' },
  ];
  assert.deepEqual(databaseTourStops(badRows, tours), []);
});

test('collector-owned inferred stop evidence needs complete provenance and never fabricates a place', () => {
  const inferred = {
    ...row, data_quality: 'scraped_inferred', scrape_html_hash: 'a'.repeat(64),
    scrape_script: 'tour_stealth_scraper.py', stop_venue: null, stop_city: null, stop_state: null,
  };
  const [stop] = databaseTourStops([inferred], tours);
  assert.equal(stop.name, 'Poker Masters');
  assert.equal(stop.location, null);
  assert.equal(stop.venue, null);
  assert.equal(stop.city, null);
  assert.equal('buy_in' in stop, false);
  assert.deepEqual(databaseTourStops([{ ...inferred, scrape_html_hash: 'legacy' }], tours), []);
  assert.deepEqual(databaseTourStops([{ ...inferred, scrape_script: 'other.py' }], tours), []);
  assert.deepEqual(databaseTourStops([{ ...inferred, scrape_timestamp: null }], tours), []);
});

test('prefer qualified DB schedule per tour while retaining recorded fallback for uncovered tours', () => {
  const result = attachDatabaseTourSchedules([...tours, { tour_code: 'OTHER', stops_2026: ['preserve'] }], [row]);
  assert.equal(result[0].stops_2026[0].name, 'Poker Masters');
  assert.equal(result[0].schedule_last_updated, '2026-08-12T15:06:42.000Z');
  assert.deepEqual(result[0].series_2026, []);
  assert.deepEqual(result[1].stops_2026, ['preserve']);
  assert.equal(result[1].schedule_source, 'bundled_registry');
});

function clientFor(pages, failAt = -1) {
  const ranges = [];
  return { ranges, from() { return {
    select() { return this; }, in() { return this; }, order() { return this; },
    async range(start, end) {
      ranges.push([start, end]);
      return start === failAt ? { error: new Error('Unavailable') } : { data: pages[start / 1000] || [] };
    },
  }; } };
}

test('reads every stable page beyond the default thousand-row cap', async () => {
  const client = clientFor([Array(1000).fill(row), Array(1000).fill(row), [row]]);
  assert.equal((await readTourScheduleRows(client)).length, 2001);
  assert.deepEqual(client.ranges, [[0, 999], [1000, 1999], [2000, 2999]]);
});

test('a failed later page never returns a partial successful schedule', async () => {
  await assert.rejects(readTourScheduleRows(clientFor([Array(1000).fill(row)], 1000)), /read failed/);
});

async function apiResult({ fail = false, query = {}, ssr = false } = {}) {
  const api = readFileSync(new URL('../pages/api/poker/tours.js', import.meta.url), 'utf8');
  const client = clientFor([[row]], fail ? 0 : -1);
  const originalFrom = client.from;
  client.from = table => table === 'tour_stop_events' ? originalFrom() : {
    select() { return this; }, eq() { return this; }, order() { return this; },
    async limit() { return { data: [{ tour_code: 'PGT', official_website: 'https://www.pgt.com', tour_name: 'PokerGO Tour', tour_type: 'high_roller' }] }; },
  };
  class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : ['2026-10-10T12:00:00Z'])); } }
  const context = vm.createContext({
    Date: FixedDate, process: { env: {} }, console: { warn() {} },
    createClient: () => client, readTourScheduleRows, attachDatabaseTourSchedules,
    applyRateLimit: () => true, LIMITS: { read: {} }, reportApiError() {},
    tourCanonical: code => `/hub/tours/${code}`, registryCodeForTour: () => null,
    allVenuesData: [], tourRegistry: { metadata: { last_updated: '2026-04-07' }, tours: { PGT: {
      tour_name: 'PokerGO Tour', tour_type: 'high_roller', official_website: 'https://www.pgt.com',
      stops_2026: tours[0].stops_2026,
    } } },
  });
  vm.runInContext(api.replace(/^import .*;$/gm, '').replace(/export default /g, '').replace(/export (async )?function /g, '$1function '), context);
  if (ssr) return JSON.parse(JSON.stringify(await context.getAllToursForSSR()));
  let output;
  await context.handler({ method: 'GET', query: { include_series: 'true', tour_code: 'PGT', ...query } }, {
    setHeader() {}, status() { return this; }, json(value) { output = value; return this; },
  });
  return JSON.parse(JSON.stringify(output));
}

test('connected API and SSR attach DB stop summaries and recorded provenance', async () => {
  const response = await apiResult();
  assert.equal(response.data[0].upcoming_series[0].name, 'Poker Masters');
  assert.equal(response.summary.upcoming_series_count, 1);
  assert.equal(response.metadata.schedule_source, 'database_and_registry');
  assert.equal(response.metadata.last_updated, '2026-04-07');
  assert.equal(response.metadata.schedule_last_updated, row.scrape_timestamp.replace('Z', '.000Z'));
  assert.equal(response.metadata.schedule_degraded, false);
  assert.equal((await apiResult({ ssr: true }))[0].upcoming_series[0].name, 'Poker Masters');
});

test('database schedule failure retains the historical bundle and explicitly reports degradation', async () => {
  const response = await apiResult({ fail: true });
  assert.equal(response.data[0].upcoming_series[0].name, 'Registry');
  assert.equal(response.metadata.schedule_degraded, true);
  assert.equal(response.metadata.schedule_last_updated, null);
});

test('API filters and no invented next-year roll forward remain intact', async () => {
  const response = await apiResult({ query: { type: 'major' } });
  assert.equal(response.total, 0);
  assert.deepEqual(response.data, []);
});
