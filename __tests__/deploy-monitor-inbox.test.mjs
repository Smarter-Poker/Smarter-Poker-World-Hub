import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { createHmac } from 'node:crypto';

// Replace only the external telemetry adapter so the real Next handler can run
// under Node without the package's extensionless bundler-only re-export.
const source = (await readFile(new URL('../pages/api/deploy-monitor.js', import.meta.url), 'utf8'))
  .replace("import { reportApiError } from '../../src/lib/sentryWrap';", 'const reportApiError = () => {};')
  .replace("'../../src/lib/operationalAlerts.mjs'", JSON.stringify(new URL('../src/lib/operationalAlerts.mjs', import.meta.url).href));
const { default: handler } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
process.env.DEPLOY_WEBHOOK_SECRET = 'test-webhook-secret';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
delete process.env.GH_PAT;
delete process.env.VERCEL_TOKEN;
delete process.env.RESEND_API_KEY;
const project = 'prj_op66GkZyZcygXQKm76iyycfVFAQx';
const event = (type = 'deployment.error') => ({ id: 'evt-1', type, payload: {
  project: { id: project }, deployment: { id: 'dpl-1', meta: { githubCommitSha: 'a'.repeat(40) } },
} });
async function invoke(payload, authorized = true) {
  const body = Buffer.from(JSON.stringify(payload));
  const req = Readable.from([body]);
  req.method = 'POST'; req.query = {};
  req.headers = { 'x-vercel-signature': authorized
    ? createHmac('sha1', process.env.DEPLOY_WEBHOOK_SECRET).update(body).digest('hex') : 'invalid' };
  const res = { code: 200, headersSent: false, status(code) { this.code = code; return this; },
    json(body) { this.body = body; this.headersSent = true; return this; } };
  await handler(req, res); return res;
}
function stubFetch(fn, t) {
  const original = globalThis.fetch;
  globalThis.fetch = fn;
  t.after(() => { globalThis.fetch = original; });
}
test('authenticated failures enter the inbox before any processing, with stable retry identity', async (t) => {
  const calls = [];
  stubFetch(async (url, init) => {
    assert.match(url, /\/rpc\/fn_record_operational_alerts$/);
    calls.push(JSON.parse(init.body).p_events[0]); return { ok: true, json: async () => [41] };
  }, t);
  for (let retry = 0; retry < 2; retry++) assert.equal((await invoke(event())).code, 500);
  assert.equal(calls[0].alertname, 'VercelDeploymentFailed');
  assert.deepEqual(calls[0].payload.webhook, event());
  assert.equal(calls[1].alertname, 'DeploymentWebhookProcessingFailed');
  assert.equal(calls[1].payload.summary, 'Deploy monitor misconfigured - VERCEL_TOKEN missing');
  assert.equal(calls[0].event_key, calls[2].event_key);
  assert.equal(calls[1].event_key, calls[3].event_key);
});
test('ready evidence is scoped to the exact deployment, stored before successful acknowledgment, and never texted', async (t) => {
  const events = [];
  stubFetch(async (url, init) => {
    assert.match(url, /\/rpc\/fn_record_operational_alerts$/);
    events.push(JSON.parse(init.body).p_events[0]); return { ok: true, json: async () => [42] };
  }, t);
  const res = await invoke(event('deployment.ready'));
  assert.equal(res.code, 200); assert.equal(res.body.sent, false);
  assert.deepEqual(res.body.receipts, [42]);
  assert.equal(events[0].status, 'resolved');
  assert.equal(events[0].payload.resolutionScope, 'deployment_only');
  assert.equal(events[0].payload.deploymentId, 'dpl-1');
});
test('queue failure or malformed receipt keeps failure and recovery deliveries retryable', async (t) => {
  const responses = [{ ok: false, status: 503 }, { ok: true, json: async () => [] }];
  for (const response of responses) {
    stubFetch(async () => response, t);
    for (const type of ['deployment.error', 'deployment.ready']) {
      const result = await invoke(event(type));
      assert.equal(result.code, 503); assert.equal(result.body.sent, false);
    }
  }
});
test('unauthenticated, unrelated, ambiguous, canceled and check-only events cannot create actionable alerts', async (t) => {
  stubFetch(async () => { assert.fail('irrelevant request must not call any external service'); }, t);
  assert.equal((await invoke(event(), false)).code, 401);
  const unrelated = event(); unrelated.payload.project.id = 'another-project';
  assert.equal((await invoke(unrelated)).body.action, 'ignored');
  const conflict = event(); conflict.payload.deployment.projectId = 'another-project';
  assert.equal((await invoke(conflict)).body.action, 'ignored');
  for (const type of ['deployment.canceled', 'deployment.check-rerequested', 'deployment.created']) {
    assert.equal((await invoke(event(type))).body.action, 'ignored');
  }
  const missing = event(); delete missing.payload.deployment.id;
  assert.equal((await invoke(missing)).code, 400);
});
test('legacy project identity remains supported, but missing identity never falls through', async (t) => {
  stubFetch(async () => ({ ok: true, json: async () => [44] }), t);
  const legacy = event('deployment.succeeded'); delete legacy.payload.project; legacy.payload.projectId = project;
  assert.equal((await invoke(legacy)).body.status, 'resolved');
  delete legacy.payload.projectId;
  assert.equal((await invoke(legacy)).body.action, 'ignored');
});
test('an autofix commit is recorded as an outcome, never as deployment recovery', async (t) => {
  process.env.VERCEL_TOKEN = 'test-vercel-token';
  t.after(() => { delete process.env.VERCEL_TOKEN; });
  const calls = [];
  stubFetch(async (url, init) => {
    if (url.includes('/rpc/fn_record_operational_alerts')) {
      const e = JSON.parse(init.body).p_events[0]; calls.push(e);
      return { ok: true, json: async () => [45] };
    }
    assert.equal(calls[0]?.alertname, 'VercelDeploymentFailed', 'fault receipt must precede processing');
    if (url.includes('api.vercel.com')) return { ok: true, json: async () => [{ type: 'error', text: 'build failed' }] };
    assert.match(url, /\/api\/deploy-autofix$/);
    return { ok: true, json: async () => ({ action: 'fixed', newSha: 'b'.repeat(40), filePath: 'example.js' }) };
  }, t);
  const res = await invoke(event());
  assert.equal(res.code, 200); assert.equal(res.body.action, 'fixed');
  assert.equal(calls[1].alertname, 'DeploymentAutofixOutcome');
  assert.equal(calls[1].status, 'firing');
  assert.equal(calls[1].payload.result.newSha, 'b'.repeat(40));
  assert.equal(calls.some((e) => e.status === 'resolved'), false);
});
