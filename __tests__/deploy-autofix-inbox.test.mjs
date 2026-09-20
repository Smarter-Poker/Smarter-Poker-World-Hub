import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = (await readFile(process.env.AUTOFIX_TEST_SOURCE || new URL('../pages/api/deploy-autofix.js', import.meta.url), 'utf8'))
  .replace("import { reportApiError } from '../../src/lib/apiErrorHandler';", 'const reportApiError = () => {};')
  .replace("import { sendSMS } from '../../src/lib/commander/twilio';", 'const sendSMS = () => { throw new Error("SMS is forbidden"); };')
  .replace("'../../src/lib/operationalAlerts.mjs'", JSON.stringify(new URL('../src/lib/operationalAlerts.mjs', import.meta.url).href));
const { default: handler } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const originalContent = 'export const current = 1;';
const repairedContent = 'export const current = 2;';
const request = { deploymentId: 'dpl-provider-test', commitSha: 'a'.repeat(40), attempt: 1,
  buildErrors: './src/example.js:1:1 build failed' };
const ok = (body) => ({ ok: true, json: async () => body });
const httpFailure = (status, body) => ({ ok: false, status, text: async () => body });
async function invoke(body = request, secret = 'test-internal') {
  const req = { method: 'POST', headers: { 'x-internal-secret': secret }, body };
  const res = { code: 200, headersSent: false, status(code) { this.code = code; return this; },
    json(body) { this.body = body; this.headersSent = true; return this; } };
  await handler(req, res); return res;
}
const fixtureContexts = new WeakSet();
function fixture(t, { anthropic, xai, inbox = () => ok([77]), allowPush = false } = {}) {
  const env = { DEPLOY_INTERNAL_SECRET: 'test-internal', ANTHROPIC_API_KEY: 'test-anthropic',
    XAI_API_KEY: xai ? 'test-xai' : undefined, GH_PAT: 'test-github', MY_PHONE_NUMBER: undefined,
    ADMIN_PHONE: undefined, NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service' };
  const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(env)) value === undefined ? delete process.env[key] : process.env[key] = value;
  const savedFetch = globalThis.fetch;
  const calls = []; const events = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET' });
    if (url.endsWith('/rpc/fn_record_operational_alerts')) {
      events.push(JSON.parse(init.body).p_events[0]); return inbox();
    }
    if (url === 'https://api.anthropic.com/v1/messages') return anthropic();
    if (url === 'https://api.x.ai/v1/chat/completions') return xai();
    assert.match(url, /^https:\/\/api\.github\.com\//, 'no SMS or unexpected outbound delivery');
    if (init.method === 'PUT') {
      assert.equal(allowPush, true, 'tests must explicitly simulate source writes');
      return ok({ commit: { sha: 'b'.repeat(40) } });
    }
    assert.equal(init.method, undefined, 'unexpected GitHub mutation');
    if (url.includes('/commits?')) return ok([]);
    assert.match(url, /\/contents\/src\//);
    return ok({ type: 'file', sha: 'source-sha', content: Buffer.from(originalContent).toString('base64') });
  };
  if (!fixtureContexts.has(t)) {
    fixtureContexts.add(t);
    t.after(() => {
      globalThis.fetch = savedFetch;
      for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : process.env[key] = value;
    });
  }
  return { calls, events };
}
test('billing failure is durably recorded before a healthy fallback even without an admin phone', async (t) => {
  const state = fixture(t, { anthropic: () => httpFailure(402, 'credit balance too low: test-private-detail'),
    xai: () => { assert.equal(state.events.length, 1); return ok({ choices: [{ message: { content: originalContent } }] }); } });
  const res = await invoke();
  assert.equal(res.code, 200); assert.equal(res.body.action, 'skipped');
  const event = state.events[0];
  assert.equal(event.alertname, 'DeploymentRepairProviderBillingFailed');
  assert.equal(event.status, 'firing'); assert.equal(event.payload.provider, 'anthropic');
  assert.equal(event.payload.deploymentId, request.deploymentId);
  assert.equal(event.payload.httpStatus, 402); assert.equal(event.payload.filePath, 'src/example.js');
  assert.match(event.payload.responseDigest, /^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(event).includes('test-private-detail'));
  assert.equal(state.events.some((item) => item.status === 'resolved'), false, 'fallback success does not prove primary provider recovery');
});
test('retry identities remain stable while deployment, attempt, file and provider failures remain distinct', async (t) => {
  const { events } = fixture(t, { anthropic: () => httpFailure(400, 'Your credit balance is too low') });
  await invoke(); await invoke();
  await invoke({ ...request, deploymentId: 'dpl-another' });
  await invoke({ ...request, attempt: 2 });
  await invoke({ ...request, buildErrors: './src/different.js:1:1 build failed' });
  assert.equal(events.length, 5);
  assert.equal(events[0].event_key, events[1].event_key);
  assert.equal(new Set(events.map((event) => event.event_key)).size, 4);
});
test('failed or malformed inbox receipts return retryable 503 before fallback or source mutation', async (t) => {
  for (const response of [httpFailure(503, 'unavailable'), ok([]), ok([null])]) {
    const { calls } = fixture(t, { anthropic: () => httpFailure(402, 'payment required'),
      xai: () => assert.fail('fallback must wait for fault receipt'), inbox: () => response });
    const res = await invoke();
    assert.equal(res.code, 503); assert.equal(res.body.action, 'alert_delivery_failed');
    assert.equal(res.body.retryable, true); assert.equal(res.body.sent, false);
    assert.equal(calls.some((call) => call.method === 'PUT'), false);
  }
});
test('a later file receipt failure cannot be hidden by an earlier successful repair', async (t) => {
  let attempts = 0;
  const { calls } = fixture(t, { allowPush: true, anthropic: () => ++attempts === 1
    ? ok({ content: [{ type: 'text', text: repairedContent }] }) : httpFailure(402, 'payment required'),
    inbox: () => httpFailure(503, 'unavailable') });
  const res = await invoke({ ...request, buildErrors: './src/first.js:1:1 error\n./src/second.js:1:1 error' });
  assert.equal(calls.filter((call) => call.method === 'PUT').length, 1, 'first successful repair is simulated');
  assert.equal(res.code, 503); assert.equal(res.body.action, 'alert_delivery_failed');
});
test('transport, empty response and secondary HTTP faults each retain their own evidence', async (t) => {
  const { events } = fixture(t, { anthropic: () => { throw new Error('connection closed'); },
    xai: () => httpFailure(429, 'token quota exceeded') });
  assert.equal((await invoke()).body.action, 'api_error');
  assert.deepEqual(events.map((event) => event.payload.provider), ['anthropic', 'xai']);
  assert.deepEqual(events.map((event) => event.payload.kind), ['transport', 'http']);
  assert.notEqual(events[0].event_key, events[1].event_key);
  const empty = fixture(t, { anthropic: () => ok({ content: [] }) });
  await invoke();
  assert.equal(empty.events[0].payload.kind, 'empty_response');
});
test('successful provider requests and unauthorized requests do not invent faults', async (t) => {
  const { events, calls } = fixture(t, { anthropic: () => ok({ content: [{ type: 'text', text: originalContent }] }) });
  assert.equal((await invoke(request, 'wrong-secret')).code, 401);
  assert.equal(calls.length, 0);
  assert.equal((await invoke()).code, 200); assert.equal(events.length, 0);
});
