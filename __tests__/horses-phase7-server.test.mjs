import assert from 'node:assert/strict';
import test from 'node:test';
import { handleEconomyAdmin } from '../pages/api/horses/economy-admin.js';

const HAND_ID = '11111111-1111-4111-8111-111111111111';

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

function makeDb(results = {}, rpcResults = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      calls.push({ table, method: 'from', args: [] });
      const configured = results[table];
      const result = Array.isArray(configured) ? configured.shift() : configured;
      return queryResult(result || { data: [], count: 0, error: null }, calls, table);
    },
    async rpc(name, args) {
      calls.push({ method: 'rpc', name, args });
      return rpcResults[name] || { data: [], error: null };
    },
  };
}

const context = (section, db) => ({ db, method: 'GET', query: { section }, requestId: 'phase7-test' });

test('drift reads the maintained incident timestamp and never requests writer severity for circulation', async () => {
  const db = makeDb({}, { fn_ca_drift_metrics: { data: { open: 1 }, error: null } });
  const result = await handleEconomyAdmin(context('drift', db));
  assert.equal(result.state, 'drift.ready');
  const incidentOrder = db.calls.find((call) => call.table === 'ca_drift_incidents' && call.method === 'order');
  assert.equal(incidentOrder.args[0], 'detected_at');
  const circulationSelect = db.calls.find((call) => call.table === 'ledger_reconcile_log' && call.method === 'select');
  assert.doesNotMatch(circulationSelect.args[0], /severity/);
});

test('rake findings carry only recorded in-force terms and disclose the audit-term read state', async () => {
  const finding = { id: 'finding-1', severity: 'critical', metadata: { kind: 'under_spec', hand_id: HAND_ID }, created_at: new Date().toISOString() };
  const db = makeDb({
    ca_rake_rules: { data: [{ id: 1 }], error: null },
    ledger_reconcile_log: [
      { data: [finding], count: 1, error: null },
      { data: [finding], count: 1, error: null },
    ],
    rake_records: { data: [{ hand_id: HAND_ID, seat_count_in_force: 9, max_rake_cap_in_force: '10.0000' }], error: null },
  });
  const result = await handleEconomyAdmin(context('rakelaw', db));
  assert.equal(result.auditTermsState, 'rakelaw.audit_terms_read');
  assert.equal(result.findings.rows[0].seat_count_in_force, 9);
  assert.equal(result.findings.rows[0].max_rake_cap_in_force, '10.0000');
  assert.equal(result.counts.under_spec, 1);
  assert.equal(result.overSpec, 0);
});
