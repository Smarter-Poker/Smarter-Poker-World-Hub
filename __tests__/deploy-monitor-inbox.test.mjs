import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { createHmac } from 'node:crypto';

const source = (await readFile(new URL('../pages/api/deploy-monitor.js', import.meta.url), 'utf8'))
  .replace("'../../src/lib/operationalAlerts.mjs'", JSON.stringify(new URL('../src/lib/operationalAlerts.mjs', import.meta.url).href));
const { default: handler } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const secret = 'test-webhook-secret';
const project = 'prj_op66GkZyZcygXQKm76iyycfVFAQx';
process.env.DEPLOY_WEBHOOK_SECRET = secret;
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

const event = (type = 'deployment.error') => ({
  id: 'evt-1',
  type,
  payload: {
    project: { id: project },
    deployment: { id: 'dpl-1', meta: { githubCommitSha: 'a'.repeat(40) } },
  },
});

async function invoke(payload, { authorized = true, method = 'POST', querySecret } = {}) {
  const body = Buffer.from(JSON.stringify(payload));
  const req = Readable.from([body]);
  req.method = method;
  req.query = querySecret === undefined ? {} : { secret: querySecret };
  req.headers = { 'x-vercel-signature': authorized ? createHmac('sha1', secret).update(body).digest('hex') : 'invalid' };
  const res = {
    code: 200,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.code = code; return this; },
    json(bodyValue) { this.body = bodyValue; return this; },
  };
  await handler(req, res);
  return res;
}

function stubFetch(fn, t) {
  const original = globalThis.fetch;
  globalThis.fetch = fn;
  t.after(() => { globalThis.fetch = original; });
}

const isLookup = (url) => url.includes('/rest/v1/operational_alert_events?');

test('authenticated deployment failures are recorded in the first-party inbox only', async (t) => {
  const calls = [];
  stubFetch(async (url, init) => {
    assert.match(url, /test\.supabase\.co/);
    assert.match(url, /\/rpc\/fn_record_operational_alerts$/);
    calls.push(JSON.parse(init.body).p_events[0]);
    return { ok: true, json: async () => [41] };
  }, t);
  const result = await invoke(event());
  assert.equal(result.code, 200);
  assert.equal(result.body.action, 'recorded');
  assert.equal(result.body.status, 'firing');
  assert.deepEqual(result.body.receipts, [41]);
  assert.equal(calls[0].alertname, 'VercelDeploymentFailed');
  assert.equal(calls[0].source, 'worldhub.deploy-monitor');
  assert.equal(calls[0].payload.deploymentId, 'dpl-1');
});

test('recovery resolves only an existing failure for the exact deployment', async (t) => {
  const events = [];
  stubFetch(async (url, init) => {
    if (isLookup(url)) return { ok: true, json: async () => [{ id: 7 }] };
    events.push(JSON.parse(init.body).p_events[0]);
    return { ok: true, json: async () => [42] };
  }, t);
  const result = await invoke(event('deployment.ready'));
  assert.equal(result.code, 200);
  assert.equal(result.body.status, 'resolved');
  assert.equal(events[0].status, 'resolved');
  assert.equal(events[0].payload.resolutionScope, 'deployment_only');
});

test('healthy deploys with no open failure do not invent inbox rows', async (t) => {
  let writes = 0;
  stubFetch(async (url) => {
    if (isLookup(url)) return { ok: true, json: async () => [] };
    writes += 1;
    return { ok: true, json: async () => [43] };
  }, t);
  const result = await invoke(event('deployment.succeeded'));
  assert.equal(result.body.action, 'no_open_failure');
  assert.equal(writes, 0);
});

test('invalid auth, unrelated events, and unsupported methods cannot write alerts', async (t) => {
  stubFetch(async () => assert.fail('request must not call a provider'), t);
  assert.equal((await invoke(event(), { authorized: false })).code, 401);
  assert.equal((await invoke(event(), { authorized: false, querySecret: secret })).code, 401,
    'a correct secret in the URL must not authorize a webhook');
  assert.equal((await invoke(event(), { method: 'GET' })).code, 405);
  const unrelated = event();
  unrelated.payload.project.id = 'another-project';
  assert.equal((await invoke(unrelated)).body.action, 'ignored');
  assert.equal((await invoke(event('deployment.created'))).body.action, 'ignored');
});

test('webhook credentials are never accepted from the request URL', async () => {
  const fileSource = await readFile(new URL('../pages/api/deploy-monitor.js', import.meta.url), 'utf8');
  assert.doesNotMatch(fileSource, /req\.query\?\.secret|req\.query\.secret/);
  assert.match(fileSource, /req\.headers\?\.\['x-webhook-secret'\]/);
});

test('inbox delivery failures remain retryable and no repair path exists', async (t) => {
  stubFetch(async () => ({ ok: false, status: 503, json: async () => ({}) }), t);
  const result = await invoke(event());
  assert.equal(result.code, 503);
  assert.equal(result.body.action, 'alert_delivery_failed');
  assert.equal(result.body.retryable, true);
  const fileSource = await readFile(new URL('../pages/api/deploy-monitor.js', import.meta.url), 'utf8');
  for (const forbidden of ['/api/deploy-autofix', 'api.anthropic.com', 'api.x.ai', 'api.github.com', 'api.vercel.com', 'AUTOFIX_ROLLBACK_ENABLED', 'GH_PAT', 'VERCEL_TOKEN']) {
    assert.equal(fileSource.includes(forbidden), false, `report-only monitor must not contain ${forbidden}`);
  }
});
