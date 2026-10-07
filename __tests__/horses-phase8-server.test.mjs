import assert from 'node:assert/strict';
import test from 'node:test';

import { handlePlatformAdmin, platformAdminSpec } from '../pages/api/horses/platform-admin.js';

function queryResult(result, calls, table) {
  const query = new Proxy({}, {
    get(_target, prop) {
      if (prop === 'then') return (resolve) => resolve(result);
      return (...args) => {
        calls.push({ table, method: String(prop), args });
        if (prop === 'range' || prop === 'maybeSingle') return Promise.resolve(result);
        return query;
      };
    },
  });
  return query;
}

function makeDb(results = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      calls.push({ table, method: 'from', args: [] });
      return queryResult(results[table] || { data: [], count: 0, error: null }, calls, table);
    },
    rpc(name, args) {
      calls.push({ table: null, method: 'rpc', name, args });
      return Promise.resolve(results[`rpc:${name}`] || { data: null, error: null });
    },
  };
}

const context = (section, db, query = {}, op = { permissions: ['console.read'] }, overrides = {}) => ({
  op: { user: { id: '00000000-0000-4000-8000-000000000001' }, db, ...op }, db, method: 'GET', query: { section, ...query }, requestId: 'phase8-test', ...overrides,
});

test('platform reads use console.read and the only write uses incidents.ack', () => {
  assert.deepEqual(platformAdminSpec.methods, ['GET', 'POST']);
  assert.deepEqual(platformAdminSpec.permission, { GET: 'console.read', POST: 'incidents.ack' });
  assert.deepEqual(platformAdminSpec.limit, { GET: 'read', POST: 'write' });
  assert.deepEqual(platformAdminSpec.durable.POST, { max: 60, windowSeconds: 60 });
});

test('cron sources fail independently and capped pages remain newest first', async () => {
  const db = makeDb({
    cron_health_log: { data: [], count: null, error: new Error('private database sentence') },
    v_openclaw_job_staleness: { data: [{ job_name: 'healthy-job', last_success_at: '2026-10-05T18:00:00Z' }], count: 1, error: null },
    cron_execution_log: { data: [{ id: 'run-1', job_name: 'healthy-job', started_at: '2026-10-05T18:01:00Z', result: { ok: true } }], count: 1, error: null },
  });
  const oldError = console.error;
  console.error = () => {};
  let result;
  try {
    result = await handlePlatformAdmin(context('crons', db, { cronHealthLimit: '999', cronHealthOffset: '4' }));
  } finally {
    console.error = oldError;
  }
  assert.equal(result.state, 'crons.partial');
  assert.deepEqual(result.failedSources, ['cron_health_log read failed']);
  assert.equal(result.health.state, 'unknown');
  assert.equal(result.health.limit, 100);
  assert.equal(result.health.offset, 4);
  assert.equal(result.staleness.rows[0].job_name, 'healthy-job');
  assert.equal(result.executions.rows[0].id, 'run-1');
  assert.equal(JSON.stringify(result).includes('private database sentence'), false);
  for (const table of ['cron_health_log', 'v_openclaw_job_staleness', 'cron_execution_log']) {
    const order = db.calls.find((call) => call.table === table && call.method === 'order');
    assert.equal(order.args[1].ascending, false);
  }
});

test('break evidence withholds financial marks and raw deltas without money.read', async () => {
  const db = makeDb({
    ca_break_scorecards: { data: [{ break_ended_at: '2026-10-05T18:00:00Z', freeze_delta: '99', detail: { note: 'bounded' } }], count: 1, error: null },
  });
  const result = await handlePlatformAdmin(context('breaks', db));
  assert.equal(result.circulationMarks.state, 'permission_required');
  assert.equal(result.circulationMarks.permission, 'money.read');
  assert.equal('freeze_delta' in result.scorecards.rows[0], false);
  assert.equal(db.calls.some((call) => call.table === 'ca_freeze_circulation_marks'), false);
});

test('registry is a read-only allowlist and missing controls are Missing, never Off', async () => {
  const db = makeDb({
    club_entry_feature_flags: { data: [
      { key: 'create_club', enabled: true, rollout_percent: 25 },
      { key: 'unregistered_surprise', enabled: true, rollout_percent: 100 },
    ], error: null },
    ca_horse_fleet_policy: { data: { pause_new_seatings: false }, error: null },
    ca_operator_policy: { data: { approvals_enabled: true }, error: null },
    ca_arena_settings: { data: { cash_games_enabled: true, tournaments_enabled: false }, error: null },
  });
  const result = await handlePlatformAdmin(context('registry', db));
  assert.equal(result.allowlisted, true);
  assert.equal(result.genericUpdater, false);
  assert.equal(result.rows.some((row) => row.key === 'unregistered_surprise'), false);
  assert.equal(result.rows.find((row) => row.key === 'create_club').rolloutPercent, 25);
  for (const row of result.rows) assert.equal(row.writable, false);
  for (const key of ['tournament_registration_global', 'cashout_dedicated', 'chip_issuance_positive']) {
    const row = result.rows.find((candidate) => candidate.key === key);
    assert.equal(row.state, 'missing');
    assert.equal(row.enabled, null);
  }
  assert.equal(result.rows.some((row) => row.key === 'payout_freeze_diamond_issuance'), false);
  assert.equal(result.rows.find((row) => row.key === 'payout_freeze_tournament_payouts').enabled, false);
  for (const domain of ['diamond_arena', 'payouts', 'trivia']) {
    for (const row of result.rows.filter((candidate) => candidate.domain === domain)) assert.match(row.writeAuthority, /Human|Written Human/);
  }
  assert.equal(db.calls.some((call) => ['insert', 'update', 'upsert', 'delete', 'rpc'].includes(call.method)), false);
});

test('incidents retain separate identities and expose the permission-gated overlay', async () => {
  const db = makeDb({
    ca_drift_incidents: { data: [{ id: 'drift-1', status: 'acknowledged', acknowledged_at: '2026-10-05T18:00:00Z' }], count: 1, error: null },
  });
  const result = await handlePlatformAdmin(context('incidents', db));
  assert.equal(result.acknowledgement.available, false);
  assert.equal(result.acknowledgement.meaning, 'Seen And Owned, Never Resolved');
  assert.equal(result.sources.drift.rows[0].identity, 'ca_drift_incidents:drift-1');
  assert.equal(result.sources.drift.rows[0].acknowledgementMeaning, 'Operator Ownership Only');
  assert.equal(result.sources.financial.state, 'permission_required');
  assert.equal(db.calls.some((call) => call.table === 'financial_alerts'), false);
});

test('incident acknowledgement appends through one idempotent RPC and files the standard audit', async () => {
  const event = { id: 'event-1', action: 'acknowledge', source_table: 'engine_alerts', source_identity: '42' };
  const db = makeDb({
    'rpc:fn_ca_operator_record_incident_ack_event': { data: { event, replayed: false }, error: null },
  });
  const body = {
    action: 'acknowledge',
    sourceTable: 'engine_alerts',
    sourceIdentity: '42',
    note: 'Owned by platform operations',
    operationId: '00000000-0000-4000-8000-000000000042',
  };
  const result = await handlePlatformAdmin(context(null, db, {}, { permissions: ['incidents.ack'] }, { method: 'POST', body, req: { headers: {} } }));
  assert.deepEqual(result.acknowledgement, event);
  assert.equal(result.replayed, false);
  const append = db.calls.find((call) => call.name === 'fn_ca_operator_record_incident_ack_event');
  assert.equal(append.args.p_operation_id, body.operationId);
  assert.equal(append.args.p_source_table, 'engine_alerts');
  assert.ok(db.calls.some((call) => call.name === 'fn_log_admin_action'));
  assert.equal(db.calls.some((call) => ['insert', 'update', 'upsert', 'delete'].includes(call.method)), false);
});

test('an idempotent acknowledgement replay returns the original event without duplicating audit', async () => {
  const event = { id: 'event-1', action: 'acknowledge', source_table: 'engine_alerts', source_identity: '42' };
  const db = makeDb({
    'rpc:fn_ca_operator_record_incident_ack_event': { data: { event, replayed: true }, error: null },
  });
  const result = await handlePlatformAdmin(context(null, db, {}, { permissions: ['incidents.ack'] }, {
    method: 'POST',
    body: {
      action: 'acknowledge', sourceTable: 'engine_alerts', sourceIdentity: '42',
      note: 'Owned by platform operations', operationId: '00000000-0000-4000-8000-000000000042',
    },
    req: { headers: {} },
  }));
  assert.equal(result.replayed, true);
  assert.equal(db.calls.filter((call) => call.name === 'fn_ca_operator_record_incident_ack_event').length, 1);
  assert.equal(db.calls.some((call) => call.name === 'fn_log_admin_action'), false);
});

test('incident rows receive the latest ownership overlay without changing source status', async () => {
  const db = makeDb({
    engine_alerts: { data: [{ id: 42, status: 'firing', received_at: '2026-10-05T18:00:00Z' }], count: 1, error: null },
    ca_operator_incident_ack_current: { data: [{ source_table: 'engine_alerts', source_identity: '42', action: 'release', note: 'Shift handoff', created_at: '2026-10-05T19:00:00Z' }], error: null },
  });
  const result = await handlePlatformAdmin(context('incidents', db, {}, { permissions: ['console.read', 'incidents.ack'] }));
  const incident = result.rows.find((row) => row.identity === 'engine_alerts:42');
  assert.equal(result.acknowledgement.available, true);
  assert.equal(incident.ownershipState, 'released');
  assert.equal(incident.status, 'firing');
});

test('combined incident pages retain the requested shared offset', async () => {
  const db = makeDb({
    ca_drift_incidents: { data: [{ id: 'drift-2', last_seen_at: '2026-10-05T18:00:00Z' }], count: 201, error: null },
  });
  const result = await handlePlatformAdmin(context('incidents', db, { limit: '100', offset: '100' }));
  assert.equal(result.offset, 100);
  assert.equal(result.limit, 100);
  assert.equal(result.hasMore, true);
  const driftRange = db.calls.find((call) => call.table === 'ca_drift_incidents' && call.method === 'range');
  assert.deepEqual(driftRange.args, [0, 199]);
});

test('combined incident paging stops at its disclosed bounded merge cap', async () => {
  const db = makeDb({
    ca_drift_incidents: { data: Array.from({ length: 500 }, (_, id) => ({ id: `drift-${id}`, last_seen_at: `2026-10-05T${String(id % 24).padStart(2, '0')}:00:00Z` })), count: 1000, error: null },
  });
  const result = await handlePlatformAdmin(context('incidents', db, { limit: '100', offset: '400' }));
  assert.equal(result.offset, 400);
  assert.equal(result.hasMore, false);
  assert.equal(result.truncated, true);
  assert.deepEqual(result.cap, { maxRows: 500, reached: true });
});

test('financial alert evidence requires money read and uses maintained columns', async () => {
  const db = makeDb({ financial_alerts: { data: [{ id: 'f1', message: 'Bounded Financial Evidence' }], count: 1, error: null } });
  const result = await handlePlatformAdmin(context('alerts', db, {}, { permissions: ['console.read', 'money.read'] }));
  assert.equal(result.sources.financial.rows[0].id, 'f1');
  const select = db.calls.find((call) => call.table === 'financial_alerts' && call.method === 'select');
  assert.match(select.args[0], /resolved_at/);
  assert.doesNotMatch(select.args[0], /resolution(?:,|$)/);
});
