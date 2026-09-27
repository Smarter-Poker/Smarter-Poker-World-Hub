#!/usr/bin/env node
// Finite production API verification inside the parent's exact isolated fixture.
// The parent owns sole-participant SQL verification and guarded fixture cleanup.
// This mode never discovers a recipient, seeds data, or sends an ordinary message.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { APP_ORIGIN, AUTH_ORIGIN, validateConfiguration } from './messenger-live-configuration.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const FIXTURE_TITLE = 'Messenger Verification Only';
// Established from the designated Smarter.Poker Official identity in the owning
// read-verification receipt. A changed configured identity requires inspection.
export const OFFICIAL_ACCOUNT_FINGERPRINT = '9fec7638c003ad1c';

export function sendConfiguration(env) {
  validateConfiguration(env);
  assert.equal(env.MESSENGER_VERIFY_MODE, 'isolated-send', 'Explicit isolated-send mode is required');
  assert.match(env.MESSENGER_FIXTURE_CONVERSATION_ID || '', UUID, 'Exact fixture conversation UUID is required');
  assert.match(env.MESSENGER_REQUEST_ID || '', UUID, 'Exact send request UUID is required');
  return {
    conversationId: env.MESSENGER_FIXTURE_CONVERSATION_ID,
    requestId: env.MESSENGER_REQUEST_ID,
    content: `${FIXTURE_TITLE}: Idempotent Send ${env.MESSENGER_REQUEST_ID}`,
    message_type: 'text', media_metadata: {},
  };
}

export function allowedSendRequest(method, url, body, expected) {
  const target = new URL(url);
  if (target.origin !== APP_ORIGIN || target.pathname !== '/api/messenger/send-message'
    || target.search || method !== 'POST' || !UUID.test(expected?.conversationId || '')
    || !UUID.test(expected?.requestId || '')) return false;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const keys = ['conversationId', 'requestId', 'content', 'message_type', 'media_metadata'];
  return Object.keys(body).length === keys.length && keys.every(key => Object.hasOwn(body, key))
    && body.conversationId === expected.conversationId && body.requestId === expected.requestId
    && body.content === expected.content && body.message_type === 'text'
    && body.media_metadata !== null && typeof body.media_metadata === 'object'
    && !Array.isArray(body.media_metadata) && Object.keys(body.media_metadata).length === 0;
}

export function validateFixture(workspace, expected) {
  const row = workspace?.conversation;
  assert.ok(workspace?.success === true && row?.id === expected.conversationId, 'Exact fixture is not reachable');
  assert.equal(row.title, FIXTURE_TITLE, 'Conversation is not the labeled verification fixture');
  assert.equal(row.is_group, true, 'Verification fixture must be a group');
  assert.ok(!row.isAccounting && !row.clubId && !row.otherUser, 'Verification fixture must have no recipient or accounting scope');
}

export function verifyPersistedSend(messages, expected, actorId, expectedId) {
  assert.ok(Array.isArray(messages) && messages.length < 50, 'Fixture history must be bounded and complete');
  const rows = messages.filter(row => row.request_id === expected.requestId);
  assert.equal(rows.length, 1, 'Expected exactly one persisted message for the request identity');
  assert.equal(rows[0].conversation_id, expected.conversationId, 'Persisted conversation differs');
  assert.equal(rows[0].sender_id, actorId, 'Persisted sender differs from configured identity');
  assert.equal(rows[0].content, expected.content, 'Persisted content differs from fixed fixture text');
  assert.equal(rows[0].message_type, 'text', 'Unexpected persisted message type');
  assert.match(rows[0].id || '', UUID, 'Persisted message UUID missing');
  if (expectedId) assert.equal(rows[0].id, expectedId, 'Retry inserted another message');
  return rows[0].id;
}

export async function runIsolatedSend() {
  const evidenceDir = process.env.MESSENGER_EVIDENCE_DIR || 'test-results/messenger-send-live';
  await mkdir(evidenceDir, { recursive: true });
  const report = { observedAt: new Date().toISOString(), status: 'running', mode: 'isolated-send', checks: [], limitations: ['API persistence and duplicate retry in an isolated sole-participant fixture; physical-device delivery and composer retry are separate evidence.'] };
  let browser;
  try {
    const expected = sendConfiguration(process.env);
    report.expectedSha = process.env.MESSENGER_EXPECTED_SHA;
    report.conversationId = expected.conversationId;
    report.requestId = expected.requestId;
    const health = async () => {
      const response = await fetch(`${APP_ORIGIN}/api/health`, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000) });
      const data = await response.json();
      assert.ok(response.ok && data.status === 'ok', 'Published health unavailable');
      assert.equal(data.commitSha, report.expectedSha, 'Published revision differs from exact expected SHA');
      return data;
    };
    report.deploymentId = (await health()).deploymentId;
    const { createClient } = await import('@supabase/supabase-js');
    const auth = createClient(AUTH_ORIGIN, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(20000) }) } });
    const signedIn = await auth.auth.signInWithPassword({ email: process.env.TEST_USER_EMAIL, password: process.env.TEST_USER_PASSWORD });
    assert.ok(!signedIn.error && signedIn.data?.session?.access_token, 'Configured test identity could not authenticate');
    const session = signedIn.data.session;
    const verified = await auth.auth.getUser(session.access_token);
    assert.ok(!verified.error && verified.data?.user?.id === session.user.id, 'Configured identity could not be verified');
    assert.equal(verified.data.user.email?.toLowerCase(), process.env.TEST_USER_EMAIL.toLowerCase(), 'Configured identity differs');
    report.accountFingerprint = createHash('sha256').update(session.user.id).digest('hex').slice(0, 16);
    assert.equal(report.accountFingerprint, OFFICIAL_ACCOUNT_FINGERPRINT, 'Send verification refuses a different configured identity');
    const read = async (path, body) => {
      assert.ok(['/api/messenger/get-conversations', '/api/messenger/get-messages'].includes(path), 'Unapproved read route');
      const response = await fetch(APP_ORIGIN + path, { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000) });
      const data = await response.json();
      assert.ok(response.ok && data.success === true, 'Fixture read failed');
      return data;
    };
    validateFixture(await read('/api/messenger/get-conversations', { workspace: 'resolve', conversationId: expected.conversationId }), expected);
    const before = await read('/api/messenger/get-messages', { conversationId: expected.conversationId, limit: 50 });
    assert.ok(Array.isArray(before.messages) && before.messages.length < 10, 'Unexpected fixture history');
    assert.ok(before.messages.every(row => row.content?.startsWith(FIXTURE_TITLE)), 'Fixture contains ordinary messages');
    assert.equal(before.messages.filter(row => row.request_id === expected.requestId).length, 0, 'Request already exists; inspect durable outcome rather than repeating this probe');
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.routeWebSocket('**/*', socket => socket.close());
    let sends = 0;
    const responses = [];
    const routeFailures = [];
    await context.route('**/*', async route => {
      const request = route.request();
      // A blank same-origin document is enough to exercise the browser's HTTP
      // transport. It cannot mount app effects that alter unrelated read state.
      if (request.isNavigationRequest()) return route.fulfill({ contentType: 'text/html', body: '<title>Isolated Messenger Verification</title>' });
      let body; try { body = request.postDataJSON(); } catch { body = null; }
      if (!allowedSendRequest(request.method(), request.url(), body, expected) || sends >= 2) return route.abort();
      sends++;
      try {
        const response = await route.fetch({ maxRedirects: 0, timeout: 20000 });
        const data = await response.json().catch(() => null);
        assert.ok(response.ok() && data?.success === true && UUID.test(data.msgId || ''), 'Exact fixture send did not persist');
        assert.equal(data.requestId, expected.requestId, 'Send receipt lost its request identity');
        responses.push({ msgId: data.msgId, requestId: data.requestId, replayed: data.replayed });
        if (sends === 1) return route.abort('failed'); // Database acknowledged; browser loses the response.
        return route.fulfill({ response });
      } catch {
        routeFailures.push('Send transport or receipt failed; inspect durable operation outcome');
        return route.abort('failed');
      }
    });
    const page = await context.newPage();
    await page.goto(APP_ORIGIN + '/hub/messenger');
    const send = () => page.evaluate(async ({ body, token }) => {
      try {
        const response = await fetch('/api/messenger/send-message', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const data = await response.json();
        return { ok: response.ok && data.success === true };
      } catch { return { ok: false }; }
    }, { body: expected, token: session.access_token });
    assert.equal((await send()).ok, false, 'First response must be lost at the browser boundary');
    assert.equal(routeFailures.length, 0, 'Initial send outcome was not acknowledged; inspect before retry');
    assert.equal(responses.length, 1, 'Lost response was not acknowledged by the server');
    const firstId = verifyPersistedSend((await read('/api/messenger/get-messages', { conversationId: expected.conversationId, limit: 50 })).messages, expected, session.user.id, responses[0].msgId);
    assert.equal((await send()).ok, true, 'Explicit same-request retry did not succeed');
    assert.equal(routeFailures.length, 0, 'Retry receipt unavailable; inspect durable outcome');
    assert.equal(responses[1]?.replayed, true, 'Retry was not identified as an existing operation');
    assert.equal(responses[1]?.msgId, firstId, 'Retry receipt refers to a different message');
    verifyPersistedSend((await read('/api/messenger/get-messages', { conversationId: expected.conversationId, limit: 50 })).messages, expected, session.user.id, firstId);
    await health();
    report.sends = sends;
    report.persistedMessages = 1;
    report.messageId = firstId;
    report.checks.push('Exact official identity and labeled fixture verified', 'Committed first send survived a lost browser response', 'Explicit retry reused request and persisted message identity', 'Fresh application readback contains exactly one request row');
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed';
    report.failure = error instanceof assert.AssertionError ? error.message.split('\n')[0] : 'Isolated send verification could not complete; inspect the retained operation before retry';
    process.exitCode = 1;
  } finally {
    await browser?.close();
    await writeFile(`${evidenceDir}/result.json`, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runIsolatedSend();
