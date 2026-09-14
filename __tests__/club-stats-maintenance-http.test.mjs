import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import test from 'node:test';
import vm from 'node:vm';

// Run the actual route, authentication helper and health wrapper over HTTP.
// Only the Supabase transport is controlled; every RPC still crosses a local
// HTTP boundary and receives the normal {data,error} response shape.
async function exercise({ failRpc, telemetryFails = false, authorized = true } = {}) {
  const calls = [];
  const writes = [];
  const backend = createServer(async (req, res) => {
    let body = '';
    for await (const part of req) body += part;
    const data = body ? JSON.parse(body) : null;
    res.setHeader('Content-Type', 'application/json');
    if (req.url.startsWith('/rpc/')) {
      const name = req.url.slice('/rpc/'.length);
      calls.push(name);
      if (name === failRpc) {
        res.statusCode = 500;
        res.end(JSON.stringify({ message: 'deadlock detected', code: '40P01' }));
        return;
      }
      const values = {
        fn_snapshot_player_stats_if_missing: { healed: false },
        fn_snapshot_health: { missing_days: [] },
        fn_reconcile_club_member_daily_profit: { reconciled: true },
        ca_refresh_hand_player_index: [{ hands_indexed: 8, rows_added: 16, complete: true }],
        ca_roll_hand_stats_forward: 8,
        ca_refresh_stat_distribution: { metrics_written: 5 },
        ca_clubs_with_rebuild_backlog: [],
        ca_clubs_missing_hand_daily: [],
      };
      assert.ok(Object.hasOwn(values, name), `unexpected RPC ${name}`);
      res.end(JSON.stringify(values[name]));
      return;
    }
    writes.push({ table: req.url.slice(1), data });
    if (telemetryFails && req.url === '/cron_health_log') {
      res.statusCode = 503;
      res.end(JSON.stringify({ message: 'telemetry unavailable' }));
      return;
    }
    res.end('null');
  });
  await new Promise((resolve) => backend.listen(0, '127.0.0.1', resolve));
  const backendUrl = `http://127.0.0.1:${backend.address().port}`;
  const request = (url, data) => ({
    async abortSignal(signal) {
      const response = await fetch(backendUrl + url, {
        method: 'POST',
        body: JSON.stringify(data ?? null),
        signal,
      });
      const value = await response.json();
      return response.ok ? { data: value, error: null } : { data: null, error: value };
    },
  });
  const createClient = () => ({
    rpc: (name, args) => request(`/rpc/${name}`, args),
    from: (table) => ({
      insert: (data) => request(`/${table}`, data),
      upsert: (data) => request(`/${table}`, data),
    }),
  });
  const context = vm.createContext({
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: backendUrl, SUPABASE_SERVICE_ROLE_KEY: 'local-test', CRON_SECRET: 'local-test' } },
    console: { warn() {} },
    Date, AbortController, AbortSignal, setTimeout, clearTimeout,
  });
  const sdk = new vm.SyntheticModule(['createClient'], function () {
    this.setExport('createClient', createClient);
  }, { context });
  const source = (path) => new vm.SourceTextModule(readFileSync(path, 'utf8'), { context, identifier: path });
  const health = source('src/lib/cronHealth.js');
  const auth = source('src/utils/cron-auth.js');
  const route = source(process.env.STATS_MAINTENANCE_ROUTE_SOURCE || 'pages/api/cron/club-stats-maintenance.js');
  const imports = {
    '@supabase/supabase-js': sdk,
    '../../../src/lib/cronHealth': health,
    '../../../src/utils/cron-auth': auth,
  };
  let server;
  try {
    await route.link((name) => {
      assert.ok(imports[name], `unexpected import ${name}`);
      return imports[name];
    });
    await route.evaluate();
    server = createServer((req, res) => {
      req.query = {};
      res.status = (code) => { res.statusCode = code; return res; };
      res.json = (body) => {
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify(body));
      };
      Promise.resolve(route.namespace.default(req, res)).catch((error) => {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: error.message }));
      });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const response = await fetch(`http://127.0.0.1:${server.address().port}`, {
      headers: authorized ? { Authorization: 'Bearer local-test' } : {},
    });
    return { status: response.status, body: await response.json(), calls, writes };
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await new Promise((resolve) => backend.close(resolve));
  }
}

test('a hand-index deadlock is visible to the dispatcher and cron health', async () => {
  const result = await exercise({ failRpc: 'ca_refresh_hand_player_index' });
  assert.equal(result.status, 503);
  assert.equal(result.body.status, 'partial');
  assert.deepEqual(result.body.errors, ['hand index: deadlock detected']);
  assert.equal(result.body.hand_index, null);
  assert.equal(result.body.stat_rollup.hands_rolled, 8, 'sibling work must finish');
  assert.ok(result.calls.includes('ca_clubs_missing_hand_daily'));
  assert.equal(result.writes.find((row) => row.table === 'probe_heartbeats').data.status, 'partial');
  const health = result.writes.filter((row) => row.table === 'cron_health_log');
  assert.equal(health.length, 1);
  assert.equal(health[0].data.last_status, 'error');
  assert.equal(health[0].data.error_message, 'http_503');
});

test('another failed step also reports partial failure without losing successful work', async () => {
  const result = await exercise({ failRpc: 'ca_refresh_stat_distribution' });
  assert.equal(result.status, 503);
  assert.equal(result.body.hand_index.rows_added, 16);
  assert.deepEqual(result.body.errors, ['stat distribution: deadlock detected']);
});

test('a successful subsequent run reports recovery through the same response and telemetry', async () => {
  const result = await exercise();
  assert.equal(result.status, 200);
  assert.equal(result.body.status, 'ok');
  assert.deepEqual(result.body.errors, []);
  assert.equal(result.writes.find((row) => row.table === 'probe_heartbeats').data.status, 'ok');
  assert.equal(result.writes.find((row) => row.table === 'cron_health_log').data.last_status, 'success');
});

test('a telemetry failure cannot turn failed maintenance into HTTP success', async () => {
  const result = await exercise({ failRpc: 'ca_refresh_hand_player_index', telemetryFails: true });
  assert.equal(result.status, 503);
  assert.equal(result.body.status, 'partial');
});

test('unauthorized requests do no maintenance and cannot overwrite job health', async () => {
  const result = await exercise({ authorized: false });
  assert.equal(result.status, 401);
  assert.deepEqual(result.calls, []);
  assert.deepEqual(result.writes, []);
});
