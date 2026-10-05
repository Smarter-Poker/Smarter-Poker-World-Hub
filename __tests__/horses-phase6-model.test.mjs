import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FLOOR_ADMIN_CONTROL_AVAILABILITY,
  FLOOR_ADMIN_CONTROL_MANIFEST,
  FLOOR_ADMIN_SECTIONS,
  clearFloorEngineCacheForTests,
  deliveryHealthState,
  floorDivergence,
  floorReadState,
  queueReadState,
  readEngineHealth,
} from '../src/lib/horses/floorAdmin.js';

test('every declared Phase 6 section has a classified control manifest', () => {
  assert.deepEqual(FLOOR_ADMIN_SECTIONS, [
    'floor', 'table', 'tournaments', 'event', 'clubs', 'club',
    'unions', 'union', 'cashouts', 'chip_requests', 'rake', 'announcements',
  ]);
  const classes = new Set(['READ', 'LINK', 'EMBED', 'AUTHORITATIVE_WRITE']);
  for (const section of FLOOR_ADMIN_SECTIONS) {
    assert.ok(FLOOR_ADMIN_CONTROL_MANIFEST[section]);
    for (const classification of Object.values(FLOOR_ADMIN_CONTROL_MANIFEST[section])) {
      assert.ok(classes.has(classification), `${section} has unclassified control ${classification}`);
    }
  }
  assert.equal(FLOOR_ADMIN_CONTROL_AVAILABILITY.rake.durable_export_jobs, 'DEFERRED');
  assert.equal(Object.values(FLOOR_ADMIN_CONTROL_MANIFEST.rake).includes('DEFERRED'), false);
});

test('floor divergence is computed from both sources and an absent engine never becomes zero', () => {
  const divergence = floorDivergence(1240, 450);
  assert.deepEqual(divergence, { databaseActive: 1240, engineActive: 450, delta: 790, diverged: true });
  assert.equal(floorDivergence(1240, null), null);
  assert.equal(floorReadState({ databaseOk: true, engineOk: false, divergence: null, rowCount: 50 }), 'floor.partial');
  assert.equal(floorReadState({ databaseOk: false, engineOk: false, divergence: null }), 'floor.unknown');
});

test('engine health is timeout bounded and preserves unknown instead of invented healthy values', async () => {
  clearFloorEngineCacheForTests();
  const result = await readEngineHealth({
    url: 'https://engine.invalid/health',
    timeoutMs: 5,
    fetchImpl: () => new Promise(() => {}),
  });
  assert.equal(result.ok, false);
  assert.equal(result.state, 'unknown');
  assert.equal('activeTables' in result, false);
});

test('engine health parses only the bounded disclosure fields and caches the result', async () => {
  clearFloorEngineCacheForTests();
  let calls = 0;
  const options = {
    url: 'https://engine.example/health',
    now: Date.parse('2026-10-05T12:00:00Z'),
    fetchImpl: async () => {
      calls += 1;
      return { ok: true, json: async () => ({ activeTables: 450, activeTournaments: 425, humansSeatedTotal: 0, secret: 'not-forwarded', telemetry: { avgHandsPerHour: 91 }, rakeSpec: { drifted: false, detail: 'database and engine agree', checksum: 'not-forwarded' } }) };
    },
  };
  const first = await readEngineHealth(options);
  const second = await readEngineHealth(options);
  assert.equal(first.ok, true);
  assert.equal(first.activeTables, 450);
  assert.equal(first.avgHandsPerHour, 91);
  assert.equal(first.rakeSpec.drifted, false);
  assert.equal('secret' in first, false);
  assert.equal('checksum' in first.rakeSpec, false);
  assert.equal(second.cached, true);
  assert.equal(calls, 1);
});

test('cashier empty states and announcement delivery states remain distinct', () => {
  assert.equal(queueReadState({ sourceOk: false, total: null, pending: null }), 'queue.unknown');
  assert.equal(queueReadState({ sourceOk: true, total: 0, pending: 0 }), 'queue.empty_none_ever');
  assert.equal(queueReadState({ sourceOk: true, total: 9, pending: 0 }), 'queue.empty_none_pending');
  assert.equal(queueReadState({ sourceOk: true, total: 9, pending: 2 }), 'queue.ready');
  const now = Date.parse('2026-10-05T12:00:00Z');
  assert.equal(deliveryHealthState({ sourceOk: false, now }), 'delivery.unknown');
  assert.equal(deliveryHealthState({ sourceOk: true, pending: 2, lastDrainAt: '2026-10-05T11:59:00Z', now }), 'delivery.ok');
  assert.equal(deliveryHealthState({ sourceOk: true, pending: 101, lastDrainAt: '2026-10-05T11:59:00Z', now }), 'delivery.backlogged');
  assert.equal(deliveryHealthState({ sourceOk: true, pending: 0, lastDrainAt: null, now }), 'delivery.backlogged');
});
