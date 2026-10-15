/**
 * A DECLARED FLOOR PARK IS NOT A TABLE OUTAGE (2026-10-15)
 *
 * The owner parked the Club Arena cash floor at 16:53 UTC for a horse wallet
 * reset (ca_operator_floor_hold, a 60 minute lease with its own watchdog).
 * /api/cron/table-socket-probe then failed every run from 17:04 to 17:43 at
 * pick_table ("no table this account may open has dealt a hand") and OpenClaw
 * paged CRITICAL for a stop the owner had declared. A monitor that pages on a
 * non-defect is itself the defect.
 *
 * Pins:
 *   1. activeFloorPark reads only an UNEXPIRED hold and fails OPEN (an error
 *      or an unreadable answer is "no park", so a real outage still pages).
 *   2. The empty pick_table path asks about the park BEFORE it throws, and a
 *      park answers 200 with a skipped heartbeat, never a 503.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SOURCE = readFileSync(new URL('../pages/api/cron/table-socket-probe.js', import.meta.url), 'utf8');

function loadActiveFloorPark() {
  const start = SOURCE.indexOf('export async function activeFloorPark(');
  assert.ok(start >= 0, 'activeFloorPark is exported by the probe');
  const end = SOURCE.indexOf('\n}\n', start);
  const body = SOURCE.slice(start + 'export '.length, end + 2);
  return new Function(`return (${body.replace(/^async function activeFloorPark/, 'async function')});`)();
}

function fakeAdmin(answer, seen = {}) {
  return {
    from(table) {
      seen.table = table;
      const chain = {
        select(columns) {
          seen.columns = columns;
          return chain;
        },
        gt(column, value) {
          seen.gt = [column, value];
          return chain;
        },
        limit() {
          if (answer instanceof Error) return Promise.reject(answer);
          return Promise.resolve(answer);
        },
      };
      return chain;
    },
  };
}

test('an unexpired owner floor hold is a declared park', async () => {
  const activeFloorPark = loadActiveFloorPark();
  const seen = {};
  const now = new Date('2026-10-15T17:10:00Z');
  const hold = {
    operation_id: '3d9c1ba1-1921-4ba1-947c-401d4b93b26c',
    mode: 'park',
    reason: 'Owner Horse Wallet Reset',
    held_since: '2026-10-15T16:53:27Z',
    expires_at: '2026-10-15T18:53:27Z',
  };
  const park = await activeFloorPark(fakeAdmin({ data: [hold], error: null }, seen), now);
  assert.deepEqual(park, hold);
  assert.equal(seen.table, 'ca_operator_floor_hold');
  assert.deepEqual(seen.gt, ['expires_at', now.toISOString()]);
});

test('no hold, an error or an unreadable answer is no park (fails open)', async () => {
  const activeFloorPark = loadActiveFloorPark();
  assert.equal(await activeFloorPark(fakeAdmin({ data: [], error: null })), null);
  assert.equal(await activeFloorPark(fakeAdmin({ data: null, error: { message: 'denied' } })), null);
  assert.equal(await activeFloorPark(fakeAdmin({ data: 'nonsense', error: null })), null);
  assert.equal(await activeFloorPark(fakeAdmin(new Error('network'))), null);
});

test('the empty pick_table path asks about the park before it pages', () => {
  const empty = SOURCE.indexOf('if (!tableId) {');
  assert.ok(empty >= 0);
  const thrown = SOURCE.indexOf('throw new Error(`pick-table:', empty);
  assert.ok(thrown > empty);
  const block = SOURCE.slice(empty, thrown);
  assert.match(block, /await activeFloorPark\(admin\)/);
  assert.match(block, /reason: 'owner_floor_park'/);
  assert.match(block, /status: 'skipped'/);
  assert.match(block, /res\.status\(200\)/);
  assert.doesNotMatch(block, /res\.status\(503\)/);
});
