#!/usr/bin/env node
// Maintained, finite browser qualification against a coordinated local Next app.
// Every API/auth/socket request is intercepted. No production account or writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const base = new URL(process.env.MESSENGER_BROWSER_BASE_URL || 'http://localhost:3147');
assert.ok(['localhost', '127.0.0.1'].includes(base.hostname) && base.protocol === 'http:' && !base.username && !base.password, 'Browser fixture requires a local HTTP application');
const evidence = path.resolve(process.env.MESSENGER_BROWSER_EVIDENCE || `test-results/messenger-send-browser-${Date.now()}`);
fs.mkdirSync(evidence, { recursive: false });
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const user = { id: uuid(1), email: 'messenger-send-fixture@example.invalid', user_metadata: { full_name: 'Send Fixture', username: 'send_fixture' } };
const conversationId = uuid(3);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let browser;
const report = { observedAt: new Date().toISOString(), base: base.origin, passed: false, cases: [], errors: [], limitation: 'Actual local frontend with isolated API persistence and WebSocket fixtures; database correctness and published API proof are separate checks. No physical device or real peer delivery is asserted.' };

async function scenario(name, behavior) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const sent = new Map();
  const requests = [];
  const joins = [];
  const backgroundSends = [];
  const continuity = {
    draft: { text: '', replyToId: null, revision: 0 },
    pin: { value: false, revision: 0 },
    position: { messageId: null, offset: 0, revision: 0 },
  };
  let releaseResponse;
  let conversationJoined;
  const seed = { id: uuid(11), conversation_id: conversationId, sender_id: uuid(2), content: 'Local Verification Seed', created_at: '2026-09-26T12:00:00Z', message_type: 'text' };
  const conv = { id: conversationId, title: 'Local Send Verification', is_group: true, last_message_at: seed.created_at, last_message_preview: seed.content, unreadCount: 0, otherUser: null };
  await context.addInitScript(({ user }) => {
    const payload = btoa(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated' }));
    const session = { user, access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.local-fixture`, refresh_token: 'local-fixture', expires_at: Math.floor(Date.now() / 1000) + 3600 };
    localStorage.setItem('smarter-poker-auth', JSON.stringify(session));
    localStorage.setItem('sp-cached-header-user', JSON.stringify(user));
    localStorage.setItem(`sp_firstrun_notif_v2_${user.id}`, String(Date.now()));
    sessionStorage.setItem('social-intro-seen', 'true');
  }, { user });
  await context.routeWebSocket('**/*', socket => {
    socket.onMessage(raw => {
      let wire; try { wire = JSON.parse(raw.toString()); } catch { return; }
      const array = Array.isArray(wire);
      const message = array ? { join_ref: wire[0], ref: wire[1], topic: wire[2], event: wire[3], payload: wire[4] } : wire;
      const send = (event, payload) => socket.send(JSON.stringify(array ? [message.join_ref, message.ref, message.topic, event, payload] : { join_ref: message.join_ref, ref: message.ref, topic: message.topic, event, payload }));
      if (message.event === 'phx_join') {
        const filters = (message.payload?.config?.postgres_changes || []).map((filter, index) => ({ ...filter, id: index + 1 }));
        send('phx_reply', { status: 'ok', response: { postgres_changes: filters } });
        joins.push({ topic: message.topic, filters, send });
        if (message.topic === `realtime:conversation:${conversationId}`) conversationJoined?.();
      } else if (['heartbeat', 'phx_leave'].includes(message.event)) send('phx_reply', { status: 'ok', response: {} });
    });
  });
  function insertRealtime(row) {
    const channel = joins.findLast(join => join.topic === `realtime:conversation:${conversationId}`);
    assert.ok(channel, 'Actual conversation socket must have joined before fixture event');
    channel.send('postgres_changes', { ids: channel.filters.filter(filter => filter.event === 'INSERT').map(filter => filter.id), data: { schema: 'public', table: 'social_messages', type: 'INSERT', commit_timestamp: row.created_at, record: row, old_record: {}, columns: Object.keys(row).map(name => ({ name, type: 'text' })), errors: null } });
  }
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const respond = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    let body = {}; try { body = request.postDataJSON() || {}; } catch {}
    if (url.pathname.startsWith('/api/')) {
      if (url.pathname === '/api/messenger/get-conversations') return respond({ success: true, workspace: 'social', clubId: null, folder: 'messages', clubs: [], conversations: [conv], conversation: conv, unreadCounts: { messages: 0, invoices: 0 } });
      if (url.pathname === '/api/messenger/get-messages') return respond({ success: true, messages: [seed, ...sent.values()], savedItems: [], firstUnreadMessageId: null, hasOlder: false, hasNewer: false, anchorMessageId: body.anchorMessageId || null, anchorUnavailable: false });
      if (url.pathname === '/api/messenger/continuity') {
        if (body.action === 'read') return respond({ success: true, state: continuity, states: { [conversationId]: continuity }, pins: [], saved: [], hasMoreSaved: false, nextSavedCursor: null });
        assert.equal(body.conversationId, conversationId, 'Continuity write escaped the local send fixture');
        assert.ok(['draft', 'position'].includes(body.field), 'Send fixture unexpectedly changed pin or saved state');
        const previous = continuity[body.field];
        const oldValue = Object.fromEntries(Object.entries(previous).filter(([key]) => key !== 'revision'));
        const unchanged = JSON.stringify(oldValue) === JSON.stringify(body.value);
        if (!unchanged && previous.revision !== body.expectedRevision) return respond({ success: false, field: body.field, revision: previous.revision, value: oldValue, error: 'Fixture Revision Conflict' }, 409);
        const revision = previous.revision + (unchanged ? 0 : 1);
        continuity[body.field] = { ...body.value, revision };
        return respond({ success: true, field: body.field, revision, value: body.value, state: continuity });
      }
      if (url.pathname === '/api/messenger/mark-read') return respond({ success: true, marked: 0, readThrough: seed.created_at });
      if (url.pathname === '/api/user/get-header-stats') return respond({ success: true, profile: { ...user, full_name: 'Send Fixture', diamonds: 0 }, notificationCount: 0, unreadMessages: 0, messengerUnread: { social: 0, total: 0, clubs: {} } });
      if (url.pathname === '/api/messenger/send-message') {
        requests.push(body);
        if (!UUID.test(body.requestId || '')) return respond({ success: false, error: 'Missing Stable Request Identity' }, 400);
        if (body.conversationId !== conversationId || request.method() !== 'POST') return respond({ success: false }, 403);
        if (behavior === 'denied' || behavior === 'unavailable') return respond({ success: false, error: behavior === 'denied' ? 'Cannot Send To This Conversation' : 'Permissions Temporarily Unavailable' }, behavior === 'denied' ? 403 : 503);
        const replayed = sent.has(body.requestId);
        const row = sent.get(body.requestId) || { id: uuid(20 + sent.size), conversation_id: conversationId, sender_id: user.id, request_id: body.requestId, content: body.content, created_at: new Date().toISOString(), message_type: body.message_type || 'text', media_metadata: body.media_metadata || {} };
        if (replayed) assert.equal(row.content, body.content, 'Retry changed its original payload');
        sent.set(body.requestId, row);
        if (behavior === 'lost' && requests.length === 1) return route.abort('failed');
        if (behavior === 'realtime-first' && requests.length === 1) {
          insertRealtime(row);
          await new Promise(resolve => { releaseResponse = resolve; });
        }
        return respond({ success: true, msgId: row.id, content: row.content, requestId: body.requestId, replayed });
      }
      if (url.pathname === '/api/friends') return respond({ success: true, data: { friends: [] } });
      if (url.pathname === '/api/messenger/block-user') return respond({ success: true, blockedUsers: [] });
      if (request.method() !== 'GET') backgroundSends.push(url.pathname);
      return respond({ success: true, data: [], pages: [], requests: [], count: 0, notifications: [], isAdmin: false });
    }
    if (url.pathname.startsWith('/auth/v1/user')) return respond(user);
    if (url.pathname.startsWith('/rest/v1/')) return respond([]);
    if (url.origin === base.origin && request.method() === 'GET') return route.continue();
    // Public artwork is safe to fetch without cookies or authorization.
    if (url.origin === 'https://smarter.poker' && request.method() === 'GET' && /^(\/images\/|\/_next\/|\/assets\/)/.test(url.pathname)) {
      const response = await fetch(url, { redirect: 'error' });
      return route.fulfill({ status: response.status, contentType: response.headers.get('content-type') || 'application/octet-stream', body: Buffer.from(await response.arrayBuffer()) });
    }
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  page.setDefaultTimeout(30000);
  try {
    await page.goto(`${base.origin}/hub/messenger?conversation=${conversationId}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.getByPlaceholder('Aa', { exact: true }).waitFor();
    await page.getByText(seed.content, { exact: true }).waitFor();
    if (behavior === 'realtime-first' && !joins.some(join => join.topic === `realtime:conversation:${conversationId}`)) {
      await new Promise((resolve, reject) => {
        const deadline = setTimeout(() => reject(new Error('Conversation socket did not join')), 30000);
        conversationJoined = () => { clearTimeout(deadline); resolve(); };
      });
    }
    const content = `Local Verification ${name}`;
    await page.getByPlaceholder('Aa', { exact: true }).fill(content);
    await page.getByTitle('Send Message', { exact: true }).click();
    if (behavior === 'realtime-first') {
      await page.locator('[data-client-request-id][data-send-status="sent"]').waitFor();
      assert.equal(requests.length, 1);
      const operation = page.locator(`[data-client-request-id="${requests[0].requestId}"]`);
      assert.equal(await operation.count(), 1, 'Realtime duplicated the optimistic message');
      const acknowledged = page.waitForResponse(response => new URL(response.url()).pathname === '/api/messenger/send-message');
      releaseResponse();
      await acknowledged;
      assert.equal(await operation.count(), 1, 'HTTP acknowledgment duplicated Realtime message');
    } else {
      await page.locator('[data-send-status="failed"]').waitFor();
      assert.equal(requests.length, 1);
      assert.match(requests[0].requestId, UUID);
      if (behavior === 'lost') {
        assert.equal(sent.size, 1, 'Fixture must commit before losing its response');
        await page.getByRole('button', { name: 'Retry Message', exact: true }).click();
        await page.locator('[data-send-status="sent"]').waitFor();
        assert.equal(requests.length, 2, 'Exactly one explicit retry expected');
        assert.deepEqual(requests[1], requests[0], 'Explicit retry must preserve exact operation payload');
        assert.equal(sent.size, 1, 'Retry inserted a duplicate persisted message');
        assert.equal(await page.locator(`[data-client-request-id="${requests[0].requestId}"]`).count(), 1);
      } else {
        assert.equal(sent.size, 0, 'Failed permissions may not persist a message');
        assert.equal(await page.locator('[data-send-status="sent"][data-client-request-id]').count(), 0, 'Failed permissions reported false success');
      }
    }
    await page.screenshot({ path: path.join(evidence, `${name}.png`) });
    if (behavior === 'lost' || behavior === 'realtime-first') {
      await page.reload({ waitUntil: 'domcontentloaded' });
      // The application consumes the one-time deep link after opening it.
      // A reload correctly returns to the inbox; reopen the same conversation.
      await page.getByText('Local Send Verification', { exact: true }).click();
      await page.locator(`[data-client-request-id="${requests[0].requestId}"]`).waitFor();
      assert.equal(await page.locator(`[data-client-request-id="${requests[0].requestId}"]`).count(), 1, 'Reload must retain exactly one acknowledged message');
    }
    report.cases.push({ name, passed: true, sends: requests.length, persisted: sent.size });
  } catch (error) {
    report.cases.push({ name, passed: false, failure: error.message });
    await page.screenshot({ path: path.join(evidence, `${name}-failure.png`) }).catch(() => {});
    throw error;
  } finally {
    releaseResponse?.();
    await context.close();
  }
}

(async () => {
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  browser = await chromium.launch({ headless: true, ...(fs.existsSync(chrome) ? { executablePath: chrome } : {}) });
  await scenario('lost-response-explicit-retry', 'lost');
  await scenario('realtime-before-http', 'realtime-first');
  await scenario('permission-denied', 'denied');
  await scenario('permission-unavailable', 'unavailable');
  assert.deepEqual(report.errors, [], 'Browser raised application errors');
  report.passed = true;
})().catch(error => { report.failure = error.message; process.exitCode = 1; }).finally(async () => {
  await browser?.close();
  fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
});
