import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const api = readFileSync(new URL('../pages/api/poker/tours.js', import.meta.url), 'utf8');
const body = api.slice(api.indexOf('function getUpcomingSeries('), api.indexOf('// ─── Fallback city coordinates'));
function upcoming(stops, now) {
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
  }
  const context = vm.createContext({ Date: FixedDate });
  vm.runInContext(`${body}; this.getUpcomingSeries = getUpcomingSeries;`, context);
  return JSON.parse(JSON.stringify(context.getUpcomingSeries(null, [{ tour_code: 'TEST', stops_2026: stops }])));
}

test('expired 2026 catalog stops never become invented 2027 tour stops', () => {
  assert.deepEqual(upcoming([{ dates: 'Jan 26 - Jan 31', name: 'Past' }], '2026-10-09T12:00:00Z'), []);
  assert.deepEqual(upcoming([{ dates: 'Oct 20 - Nov 1', name: 'Past' }], '2027-01-09T12:00:00Z'), []);
});

test('catalog year, explicit year and real December-to-January ranges survive', () => {
  const rows = upcoming([
    { dates: 'Oct 20 - Nov 1' },
    { dates: 'Dec 28 - Jan 5' },
    { dates: 'Feb 3 2027 - Feb 11 2027' },
    { dates: 'TBD' },
  ], '2026-10-09T12:00:00Z');
  assert.deepEqual(rows.map(row => [row.start_date, row.end_date]), [
    ['2026-10-20', '2026-11-01'],
    ['2026-12-28', '2027-01-05'],
    ['2027-02-03', '2027-02-11'],
  ]);
});

test('tour metadata uses the recorded update, never the registry creation date as freshness', () => {
  assert.match(api, /last_updated: tourRegistry\.metadata\?\.last_updated \|\| null/);
});
