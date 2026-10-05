import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MISSING_CONTROL_ROWS,
  PLATFORM_EVIDENCE_LIMIT,
  boundedEvidence,
  boundedText,
  estimatedPlatformHandsPerSecond,
  maintenanceReconciliation,
  normalizeIncident,
  registryRow,
  scrubBreakScorecard,
  scrubFault,
} from '../src/lib/horses/platformAdmin.js';
import {
  booleanState,
  engineModel,
  incidentDisposition,
  pageOf,
  permissionRequiredSources,
  registryRows,
  toneForState,
} from '../src/components/horses/platformAdmin.js';
import { clearFloorEngineCacheForTests, readEngineHealth } from '../src/lib/horses/floorAdmin.js';

test('engine health timeout and malformed JSON remain Unknown without invented zeroes', async () => {
  clearFloorEngineCacheForTests();
  const timeout = await readEngineHealth({
    url: 'https://engine.invalid/health',
    timeoutMs: 5,
    fetchImpl: () => new Promise(() => {}),
    now: Date.parse('2026-10-05T18:00:00Z'),
  });
  assert.equal(timeout.ok, false);
  assert.equal(timeout.state, 'unknown');
  assert.equal(timeout.activeTables, undefined);

  clearFloorEngineCacheForTests();
  const malformed = await readEngineHealth({
    url: 'https://engine.invalid/health',
    fetchImpl: async () => ({ ok: true, json: async () => { throw new SyntaxError('bad json'); } }),
  });
  assert.equal(malformed.ok, false);
  assert.equal(malformed.state, 'unknown');
  assert.equal(malformed.activeTables, undefined);
});

test('HTTP 503 with valid engine health body is retained as degraded evidence', async () => {
  clearFloorEngineCacheForTests();
  const result = await readEngineHealth({
    url: 'https://engine.invalid/health',
    fetchImpl: async () => ({
      ok: false,
      status: 503,
      json: async () => ({ activeTables: 8, dealableTableCount: 6, telemetry: { avgHandsPerHour: 72 } }),
    }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.state, 'degraded');
  assert.equal(result.activeTables, 8);
  assert.equal(result.dealableTableCount, 6);
  assert.equal(result.avgHandsPerHour, 72);
});

test('null and empty engine measurements remain Unknown instead of zero', async () => {
  clearFloorEngineCacheForTests();
  const result = await readEngineHealth({
    url: 'https://engine.invalid/health',
    fetchImpl: async () => ({
      ok: false,
      status: 503,
      json: async () => ({ status: 'degraded', activeTables: null, uptime: '', performance: { totalActionsRecorded: null }, maintenance: { active: false, remainingMs: '' } }),
    }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.activeTables, null);
  assert.equal(result.uptimeSeconds, null);
  assert.equal(result.actionProcessingSamples, null);
  assert.equal(result.maintenance.remainingMs, null);
});

test('estimated throughput is derived only from known nonnegative operands', () => {
  assert.equal(estimatedPlatformHandsPerSecond(8, 72), 0.16);
  assert.equal(estimatedPlatformHandsPerSecond(null, 72), null);
  assert.equal(estimatedPlatformHandsPerSecond(8, -1), null);
  const model = engineModel({ engine: { activeTables: 8, avgHandsPerHour: 72, estimatedPlatformHandsPerSecond: 0.16 } });
  assert.equal(model.estimatedHandsPerSecond, 0.16);
});

test('maintenance reconciliation names every authority disagreement', () => {
  assert.equal(maintenanceReconciliation({ engineOk: false, runtime: null, durable: null }), 'maintenance.unknown');
  assert.equal(maintenanceReconciliation({ engineOk: true, runtime: { active: false }, durable: { id: true } }), 'maintenance.divergence');
  assert.equal(maintenanceReconciliation({ engineOk: true, runtime: { active: true }, durable: null }), 'maintenance.freeze_authority_missing');
  assert.equal(maintenanceReconciliation({ engineOk: true, runtime: { active: true }, durable: { id: true } }), 'maintenance.active');
  assert.equal(maintenanceReconciliation({ engineOk: true, runtime: { active: false }, durable: null }), 'maintenance.inactive');
});

test('evidence shaping is capped and freeze amounts remain permission-scoped', () => {
  const oversized = { detail: 'x'.repeat(PLATFORM_EVIDENCE_LIMIT + 100) };
  assert.equal(boundedEvidence(oversized).truncated, true);
  assert.equal(boundedText('x'.repeat(800)).length, 603);
  assert.equal(scrubFault({ error: 'x'.repeat(800) }).error.length, 603);
  assert.equal('freeze_delta' in scrubBreakScorecard({ freeze_delta: '4.2', detail: oversized }, false), false);
  assert.equal(scrubBreakScorecard({ freeze_delta: '4.2', detail: oversized }, true).freeze_delta, '4.2');
});

test('registry and incident models preserve Unknown, Missing and acknowledgement semantics', () => {
  const unknown = registryRow({ key: 'one', domain: 'test', sourceTable: 'test_flags', consumer: 'test consumer', writeAuthority: 'Read Only', sourceHealth: 'unknown' });
  assert.equal(unknown.enabled, null);
  assert.equal(unknown.state, 'unknown');
  assert.equal(booleanState(null), 'Unknown');
  assert.equal(toneForState('missing'), 'danger');
  assert.equal(registryRows({ rows: [unknown] })[0].state, 'unknown');
  assert.equal(MISSING_CONTROL_ROWS.length, 3);
  for (const row of MISSING_CONTROL_ROWS) {
    assert.equal(row.state, 'missing');
    assert.equal(row.enabled, null);
    assert.equal(row.writeAuthority, 'Not Implemented In The Authoritative Path');
  }

  const incident = normalizeIncident('ca_drift_incidents', { id: 'i1', acknowledged_at: '2026-10-05T18:00:00Z', status: 'open' });
  assert.equal(incident.acknowledgementMeaning, 'Operator Ownership Only');
  assert.equal(incidentDisposition(incident), 'Acknowledged, Not Resolved');
  assert.equal(incidentDisposition({ status: 'resolved' }), 'Source Reports Resolved');
});

test('client pages preserve server caps and unknown totals', () => {
  assert.deepEqual(pageOf({ rows: [{ id: 1 }], total: null, limit: 100, offset: 200, hasMore: true, truncated: true }), {
    rows: [{ id: 1 }], total: null, limit: 100, offset: 200, hasMore: true, truncated: true, cap: null,
  });
  assert.deepEqual(pageOf({ rows: [], cap: { maxRows: 500, reached: true } }).cap, { maxRows: 500, reached: true });
  assert.deepEqual(permissionRequiredSources({ sources: { financial: { state: 'permission_required', permission: 'money.read' }, engine: { state: 'ready' } } }), [
    { name: 'financial', permission: 'money.read' },
  ]);
});
