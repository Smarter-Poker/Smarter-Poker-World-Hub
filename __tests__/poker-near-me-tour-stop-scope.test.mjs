import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import * as eventTruth from '../src/lib/poker-near-me/tourScheduleData.mjs';
import { databaseTourStops } from '../src/lib/poker/tourSchedule.mjs';
import { decodeScrapedTournamentText, fetchAllRows } from '../src/lib/poker-near-me/dailyTournamentData.mjs';

const source = readFileSync(new URL('../pages/api/poker/tour-schedule.js', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?;\n/gm, '')
  .replace('export default async function handler', 'async function handler');
const summary = {
  id: 'source-summary', tour_code: 'TEST', stop_name: 'Confirmed festival',
  stop_venue: 'Confirmed room', stop_city: 'Las Vegas', stop_state: 'NV',
  event_name: 'Main Event', buy_in: 1700,
  start_date: '2026-12-01', stop_start_date: '2026-12-01', stop_end_date: '2026-12-10',
  data_quality: 'manual_research', source_url: 'https://official.example/schedule',
  scrape_timestamp: '2026-10-01T00:00:00Z',
  scrape_html_hash: 'phase7b-manual-research', notes: 'Stop-level placeholder row; events TBA',
};
async function request(rows, query = {}, failure = null, failAt = -1) {
  let offset = 0;
  const chain = new Proxy({}, { get: (_target, property) => property === 'then'
    ? (resolve) => Promise.resolve({ data: rows.slice(offset, offset + 1000), error: offset === failAt ? { message: 'later-page failure' } : failure }).then(resolve)
    : property === 'range' ? (start) => { offset = start; return chain; }
    : () => chain });
  const context = vm.createContext({
    ...eventTruth, databaseTourStops, decodeScrapedTournamentText, fetchAllRows,
    createClient: () => ({ from: () => chain }),
    applyRateLimit: () => true, LIMITS: { read: {} }, reportApiError: () => {},
    tourRegistry: { tours: { TEST: { official_website: 'https://official.example' } } },
    process: { env: {} }, console: { warn: () => {} },
  });
  vm.runInContext(`${source}; this.handler = handler;`, context);
  const response = { setHeader() {}, status(value) { this.code = value; return this; }, json(body) { this.body = JSON.parse(JSON.stringify(body)); return this; } };
  await context.handler({ method: 'GET', query: { tour_code: 'TEST', ...query } }, response);
  return response;
}

test('sourced stop dates survive without fabricated event prices or games', async () => {
  const response = await request([summary], { all_stops: 'true' });
  assert.equal(response.code, 200);
  assert.equal(response.body.total_stops, 1);
  assert.equal(response.body.total_events, 0);
  assert.deepEqual(response.body.stops[0].events, []);
  assert.equal(response.body.stops[0].schedule_scope, 'stop_summary');
  assert.equal(response.body.stops[0].source_url, summary.source_url);
  assert.equal(JSON.stringify(response.body).includes('1700'), false);
  assert.equal((await request([summary])).body.total_events, 0);
});

test('concrete source-evidenced events retain real price while unknown game stays unknown', async () => {
  const row = { ...summary, notes: '', data_quality: 'scraped_verified',
    event_name: '$400 Event #2', event_number: 2, buy_in: 400,
    scrape_html_hash: 'a'.repeat(64), game_type: null };
  const response = await request([row]);
  assert.equal(response.body.total_events, 1);
  assert.equal(response.body.events[0].buy_in, 400);
  assert.equal(response.body.events[0].game_type, 'TBD');
});

test('source mismatch and failed database read never certify a stop', async () => {
  assert.equal((await request([{ ...summary, source_url: 'https://other.example/schedule' }], { all_stops: 'true' })).body.total_stops, 0);
  assert.equal((await request([], {}, { message: 'unavailable' })).code, 503);
});

test('classification reads beyond the first thousand and fails closed on a later-page error', async () => {
  const rows = [...Array(1000).fill({ ...summary, data_quality: 'stale' }), summary];
  assert.equal((await request(rows, { all_stops: 'true' })).body.total_stops, 1);
  assert.equal((await request(rows, { all_stops: 'true' }, null, 1000)).code, 503);
});

test('repeated names on different dates and overlapping stops are all retained', async () => {
  const rows = [summary, { ...summary, stop_start_date: '2027-12-01', start_date: '2027-12-01', stop_end_date: '2027-12-10' },
    { ...summary, stop_name: 'Concurrent festival', start_date: '2026-01-01', stop_start_date: '2026-01-01', stop_end_date: '2029-01-01' },
    { ...summary, stop_name: 'Another concurrent festival', start_date: '2026-01-01', stop_start_date: '2026-01-01', stop_end_date: '2029-01-01' }];
  const response = await request(rows, { all_stops: 'true' });
  assert.equal(response.body.total_stops, 4);
  assert.equal(response.body.stops.filter(stop => stop.stop_type === 'current').length, 2);
});
