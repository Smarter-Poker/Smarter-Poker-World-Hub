#!/usr/bin/env node
// Real local app, real browser storage/tabs, entirely isolated API/socket fixtures.
// Never authenticates a real account or sends traffic to a remote user API.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, expect } = require('@playwright/test');

const base = new URL(process.env.MESSENGER_BROWSER_BASE_URL || 'http://localhost:3112');
assert.ok(base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname) && !base.username && !base.password, 'A coordinated local HTTP app is required');
const evidence = path.resolve(process.env.MESSENGER_BROWSER_EVIDENCE || `test-results/messenger-continuity-browser-${Date.now()}`);
fs.mkdirSync(evidence, { recursive: false });
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const actors = [1, 2].map(n => ({ id: id(n), email: `continuity-${n}@example.invalid`, user_metadata: { full_name: `Continuity Fixture ${n}`, username: `continuity_${n}` } }));
const club = { id: id(90), pageId: id(91), name: 'Continuity Fixture Club', canManage: false };
const conversations = [10, 20, 30].map((n, index) => ({ id: id(n), title: ['Continuity Social One', 'Continuity Social Two', 'Continuity Club One'][index], is_group: true, otherUser: null, clubId: index === 2 ? club.id : null, last_message_at: '2026-09-27T12:00:00Z', last_message_preview: 'Local Continuity Fixture', unreadCount: 0 }));
const empty = () => ({ draft: { text: '', replyToId: null, revision: 0 }, pin: { value: false, revision: 0 }, position: { messageId: null, offset: 0, revision: 0 } });
const clone = value => structuredClone(value);
const selectedCase = process.env.MESSENGER_BROWSER_CASE || null;
const report = { observedAt: new Date().toISOString(), base: base.origin, selection: selectedCase || 'all', passed: false, cases: [], errors: [], limitation: 'Actual local app with isolated synthetic APIs and WebSockets. This proves frontend/storage/tab behavior; real database permissions, deployed persistence, physical devices and push delivery are separate checks.' };
let browser;

function session(actor) {
  const payload = Buffer.from(JSON.stringify({ sub: actor.id, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated' })).toString('base64url');
  return { user: actor, access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.local-fixture`, refresh_token: 'local-fixture', expires_at: Math.floor(Date.now() / 1000) + 3600 };
}

async function fixture(options = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const states = new Map(), saved = new Map(), histories = new Map(), watermarks = new Map(), revoked = new Set();
  const requests = [], readReceipts = [], sockets = [], failures = [], forbidden = [];
  const count = options.long ? 120 : 8;
  for (const [index, conv] of conversations.entries()) histories.set(conv.id, Array.from({ length: count }, (_, n) => ({ id: id(1000 + index * 1000 + n + 1), conversation_id: conv.id, sender_id: id(69), content: `Local Continuity Fixture ${index + 1} Message ${String(n + 1).padStart(3, '0')}`, created_at: new Date(Date.UTC(2026, 8, 27, 12, 0, n)).toISOString(), message_type: 'text', media_metadata: {} })));
  const key = (actor, conv) => `${actor}:${conv}`;
  const state = (actor = actors[0].id, conv = conversations[0].id) => { const k = key(actor, conv); if (!states.has(k)) states.set(k, empty()); return states.get(k); };
  const savedFor = (actor, conv) => [...saved.values()].filter(item => item.actor === actor && (!conv || item.conversationId === conv) && item.saved && !item.unavailable && !revoked.has(item.conversationId) && histories.get(item.conversationId)?.some(message => message.id === item.messageId)).map(({ actor: _actor, ...item }) => ({ ...clone(item), message: clone(histories.get(item.conversationId)?.find(message => message.id === item.messageId)) }));
  let holdRead = false, readHeld = false, failDraft = 0;
  const releaseReads = [];
  const actorFrom = request => { try { const token = request.headers().authorization?.replace(/^Bearer /, ''); const uid = JSON.parse(Buffer.from(token.split('.')[1], 'base64url')).sub; return actors.find(actor => actor.id === uid) || actors[0]; } catch { return actors[0]; } };
  await context.exposeBinding('__recordContinuityRead', (_source, receipt) => {
    readReceipts.push(receipt);
    if (!receipt.visible.includes(receipt.throughMessageId) || receipt.paneConversation !== receipt.conversationId) failures.push('Read acknowledgment included an offscreen or different-conversation message');
  });
  await context.addInitScript(({ initial }) => {
    if (!localStorage.getItem('smarter-poker-auth')) localStorage.setItem('smarter-poker-auth', JSON.stringify(initial));
    const current = JSON.parse(localStorage.getItem('smarter-poker-auth'));
    localStorage.setItem(`sp_firstrun_notif_v2_${current.user.id}`, String(Date.now()));
    sessionStorage.setItem('social-intro-seen', 'true');
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, options) => {
      const address = typeof input === 'string' ? input : input?.url;
      if (address && new URL(address, location.href).pathname === '/api/messenger/mark-read') {
        let body; try { body = JSON.parse(options?.body || '{}'); } catch { body = {}; }
        const container = document.querySelector('[data-messenger-message-scroll]');
        const bounds = container?.getBoundingClientRect();
        const visible = container ? [...container.querySelectorAll('[data-message-id]')].filter(el => { const rect = el.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 && rect.bottom > Math.max(0, bounds.top) && rect.top < Math.min(innerHeight, bounds.bottom); }).map(el => el.dataset.messageId) : [];
        void window.__recordContinuityRead({ ...body, visible, paneConversation: container?.dataset.conversationId || null });
      }
      return originalFetch(input, options);
    };
  }, { initial: session(actors[0]) });
  await context.routeWebSocket('**/*', socket => {
    socket.onMessage(raw => {
      let wire; try { wire = JSON.parse(raw.toString()); } catch { return; }
      const array = Array.isArray(wire);
      const message = array ? { join_ref: wire[0], ref: wire[1], topic: wire[2], event: wire[3], payload: wire[4] } : wire;
      const send = (event, payload) => socket.send(JSON.stringify(array ? [message.join_ref, message.ref, message.topic, event, payload] : { ...message, event, payload }));
      if (message.event === 'phx_join') {
        const filters = (message.payload?.config?.postgres_changes || []).map((filter, index) => ({ ...filter, id: index + 1 }));
        sockets.push({ topic: message.topic, filters, send });
        send('phx_reply', { status: 'ok', response: { postgres_changes: filters } });
      } else if (['heartbeat', 'phx_leave'].includes(message.event)) send('phx_reply', { status: 'ok', response: {} });
    });
  });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), actor = actorFrom(request);
    let body = {}; try { body = request.postDataJSON() || {}; } catch {}
    const respond = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    if (url.pathname.startsWith('/api/')) {
      requests.push({ actor: actor.id, route: url.pathname, body: clone(body) });
      if (revoked.has(body.conversationId)) return respond({ success: false, error: 'Conversation Unavailable' }, 403);
      if (url.pathname === '/api/messenger/get-conversations') {
        const resolved = conversations.find(conv => conv.id === body.conversationId);
        const clubId = body.workspace === 'resolve' ? resolved?.clubId : body.clubId;
        const selected = conversations.filter(conv => !revoked.has(conv.id) && (conv.clubId || null) === (clubId || null));
        return respond({ success: true, workspace: clubId ? 'club' : 'social', clubId: clubId || null, folder: 'messages', clubs: [club], conversations: clone(selected), conversation: clone(resolved), unreadCounts: { messages: 0, invoices: 0 } });
      }
      if (url.pathname === '/api/messenger/continuity') {
        if (body.action === 'read') {
          const selected = conversations.filter(conv => !revoked.has(conv.id) && (body.conversationId ? conv.id === body.conversationId : (conv.clubId || null) === (body.workspace?.clubId || null)));
          const data = { success: true, states: Object.fromEntries(selected.map(conv => [conv.id, clone(state(actor.id, conv.id))])), ...(body.conversationId ? { state: clone(state(actor.id, body.conversationId)) } : {}), pins: selected.filter(conv => state(actor.id, conv.id).pin.value).map(conv => conv.id), saved: savedFor(actor.id, body.conversationId), hasMoreSaved: false, nextSavedCursor: null };
          if (holdRead) { readHeld = true; await new Promise(resolve => { releaseReads.push(resolve); }); }
          return respond(data);
        }
        if (body.action === 'write') {
          const current = state(actor.id, body.conversationId);
          if (body.field === 'draft' && failDraft > 0) { failDraft--; return respond({ success: false, error: 'Fixture Save Temporarily Unavailable' }, 503); }
          const savedKey = `${actor.id}:${body.value?.messageId}`;
          const previous = body.field === 'saved' ? saved.get(savedKey) || { revision: 0, saved: false } : current[body.field];
          const oldValue = body.field === 'saved' ? { messageId: body.value.messageId, saved: previous.saved }
            : body.field === 'pin' ? previous.value : Object.fromEntries(Object.entries(previous).filter(([key]) => key !== 'revision'));
          if (JSON.stringify(oldValue) !== JSON.stringify(body.value) && previous.revision !== body.expectedRevision) return respond({ success: false, field: body.field, revision: previous.revision, value: oldValue, error: 'Saved In Another Tab' }, 409);
          const revision = JSON.stringify(oldValue) === JSON.stringify(body.value) ? previous.revision : previous.revision + 1;
          if (body.field === 'saved') saved.set(savedKey, { actor: actor.id, conversationId: body.conversationId, ...body.value, revision });
          else current[body.field] = { ...(body.field === 'pin' ? { value: body.value } : body.value), revision };
          return respond({ success: true, field: body.field, revision, value: body.value, state: clone(current), ...(body.field === 'saved' ? { item: { ...body.value, conversationId: body.conversationId, revision, message: clone(histories.get(body.conversationId)?.find(message => message.id === body.value.messageId)) } } : {}) });
        }
        return respond({ success: false }, 400);
      }
      if (url.pathname === '/api/messenger/get-messages') {
        const all = histories.get(body.conversationId) || [];
        const watermark = watermarks.get(key(actor.id, body.conversationId)) ?? (options.long ? 9 : all.length - 1);
        const firstUnread = all[watermark + 1]?.id || null;
        let start = Math.max(0, all.length - 50), end = all.length;
        const anchor = body.anchorMessageId || (body.firstUnread ? firstUnread : null);
        let anchorUnavailable = false;
        if (anchor) { const index = all.findIndex(row => row.id === anchor); anchorUnavailable = index < 0; if (index >= 0) { start = Math.max(0, index - 12); end = Math.min(all.length, start + 50); } }
        else if (body.after) { start = all.findIndex(row => row.id === body.afterId) + 1; end = Math.min(all.length, start + 50); }
        else if (body.before) { end = all.findIndex(row => row.id === body.beforeId); if (end < 0) end = all.findIndex(row => row.created_at >= body.before); start = Math.max(0, end - 50); }
        const messages = clone(all.slice(start, end));
        return respond({ success: true, messages, savedItems: messages.map(message => ({ messageId: message.id, conversationId: body.conversationId, saved: false, revision: 0, ...clone(saved.get(`${actor.id}:${message.id}`) || {}) })), firstUnreadMessageId: firstUnread, hasOlder: start > 0, hasNewer: end < all.length, anchorMessageId: anchorUnavailable ? null : anchor, anchorUnavailable });
      }
      if (url.pathname === '/api/messenger/mark-read') {
        const index = (histories.get(body.conversationId) || []).findIndex(row => row.id === body.throughMessageId);
        watermarks.set(key(actor.id, body.conversationId), Math.max(watermarks.get(key(actor.id, body.conversationId)) ?? -1, index));
        return respond({ success: true, marked: 1, readThrough: histories.get(body.conversationId)?.[index]?.created_at });
      }
      if (url.pathname === '/api/messenger/send-message') { forbidden.push(url.pathname); return respond({ success: false, error: 'Continuity Fixture Does Not Send' }, 403); }
      if (url.pathname === '/api/user/get-header-stats') return respond({ success: true, profile: { ...actor, full_name: actor.user_metadata.full_name, diamonds: 0 }, notificationCount: 0, unreadMessages: 0, messengerUnread: { social: 0, total: 0, clubs: { [club.id]: { messages: 0, invoices: 0 } } } });
      if (url.pathname === '/api/friends') return respond({ success: true, data: { friends: [] } });
      if (url.pathname === '/api/messenger/block-user') return respond({ success: true, blockedUsers: [] });
      return respond({ success: true, data: [], pages: [], requests: [], count: 0, notifications: [], isAdmin: false });
    }
    if (url.pathname.startsWith('/auth/v1/user')) return respond(actor);
    if (url.pathname.startsWith('/rest/v1/')) return respond([]);
    if (url.origin === base.origin && request.method() === 'GET') return route.continue();
    if (url.origin === 'https://smarter.poker' && request.method() === 'GET' && /^(\/images\/|\/_next\/|\/assets\/)/.test(url.pathname)) {
      const response = await fetch(url, { redirect: 'error' });
      return route.fulfill({ status: response.status, contentType: response.headers.get('content-type') || 'application/octet-stream', body: Buffer.from(await response.arrayBuffer()) });
    }
    return route.abort();
  });
  const newPage = async () => { const page = await context.newPage(); page.setDefaultTimeout(20000); page.on('pageerror', error => report.errors.push(error.message)); return page; };
  const open = async (page, conv = conversations[0]) => { await page.goto(`${base.origin}/hub/messenger?conversation=${conv.id}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.getByRole('textbox', { name: 'Message', exact: true }).waitFor(); };
  return { context, state, states, saved, histories, watermarks, revoked, requests, readReceipts, failures, forbidden, newPage, open,
    hold: () => { holdRead = true; }, held: () => readHeld, release: () => { holdRead = false; releaseReads.splice(0).forEach(resolve => resolve()); }, failDraft: () => { failDraft++; },
    async switchActor(page, actor) {
      await page.evaluate(current => { localStorage.setItem('smarter-poker-auth', JSON.stringify(current)); const channel = new BroadcastChannel('smarter-poker-auth'); channel.postMessage({ event: 'SIGNED_IN', session: current }); channel.close(); }, session(actor));
      const broadcaster = await context.newPage();
      await broadcaster.goto(`${base.origin}/404`, { waitUntil: 'domcontentloaded' });
      await broadcaster.evaluate(current => { const channel = new BroadcastChannel('smarter-poker-auth'); channel.postMessage({ event: 'SIGNED_IN', session: current }); channel.close(); }, session(actor));
      await broadcaster.close();
    },
    insert(conv = conversations[0]) {
      const all = histories.get(conv.id), row = { ...all.at(-1), id: id(9000 + all.length), content: 'Local Continuity Fixture Incoming', created_at: new Date().toISOString() };
      all.push(row);
      const targets = sockets.filter(socket => socket.topic === `realtime:conversation:${conv.id}`);
      assert.ok(targets.length, 'Actual conversation channel must join before incoming fixture');
      for (const socket of targets) socket.send('postgres_changes', { ids: socket.filters.filter(filter => filter.event === 'INSERT').map(filter => filter.id), data: { schema: 'public', table: 'social_messages', type: 'INSERT', commit_timestamp: row.created_at, record: row, old_record: {}, columns: [], errors: null } });
      return row;
    } };
}

async function check(name, options, run) {
  if (selectedCase && selectedCase !== name) return;
  const f = await fixture(options);
  try {
    await run(f);
    assert.deepEqual(f.forbidden, [], 'Continuity interactions attempted a send');
    assert.deepEqual(f.failures, [], 'Read acknowledgment escaped displayed messages');
    report.cases.push({ name, passed: true, reads: f.readReceipts.length, continuityWrites: f.requests.filter(r => r.route.endsWith('/continuity') && r.body.action === 'write').length });
  } catch (error) {
    for (const [index, page] of f.context.pages().entries()) await page.screenshot({ path: path.join(evidence, `${name}-failure-${index}.png`) }).catch(() => {});
    report.cases.push({ name, passed: false, failure: error.message, lastReads: f.readReceipts.slice(-4) });
    throw error;
  } finally { f.release(); await f.context.close(); }
}

async function menuFor(page, messageId) {
  const bubble = page.locator(`[data-message-id="${messageId}"]`);
  await bubble.locator(':scope > div').first().dispatchEvent('touchstart');
  await bubble.getByRole('button', { name: '⋯', exact: true }).waitFor();
  await bubble.locator(':scope > div').first().dispatchEvent('touchend');
  await bubble.getByRole('button', { name: '⋯', exact: true }).click();
  return bubble;
}

async function visibleInPane(page, messageId) {
  return page.locator(`[data-message-id="${messageId}"]`).evaluate(node => {
    const rect = node.getBoundingClientRect(), pane = document.querySelector('[data-messenger-message-scroll]').getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > Math.max(0, pane.top) && rect.top < Math.min(innerHeight, pane.bottom);
  }).catch(() => false);
}

(async () => {
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  browser = await chromium.launch({ headless: true, ...(fs.existsSync(chrome) ? { executablePath: chrome } : {}) });
  await check('draft-reload-social-club-account-isolation', {}, async f => {
    const page = await f.newPage();
    for (const [index, conv] of conversations.entries()) {
      await f.open(page, conv);
      await page.getByRole('textbox', { name: 'Message', exact: true }).fill(`Account One Draft ${index + 1}`);
      await expect.poll(() => f.state(actors[0].id, conv.id).draft.text).toBe(`Account One Draft ${index + 1}`);
    }
    await f.open(page);
    await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('Account One Draft 1');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await f.open(page);
    await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('Account One Draft 1');
    await f.switchActor(page, actors[1]);
    await expect.poll(() => f.requests.some(r => r.actor === actors[1].id && r.route.endsWith('/get-conversations'))).toBe(true);
    await f.open(page);
    await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('');
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Account Two Draft');
    await expect.poll(() => f.state(actors[1].id).draft.text).toBe('Account Two Draft');
    assert.equal(f.state().draft.text, 'Account One Draft 1');
    await f.switchActor(page, actors[0]);
    await f.open(page);
    await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('Account One Draft 1');
    await page.screenshot({ path: path.join(evidence, 'draft-account-isolation.png') });
  });
  await check('delayed-draft-load-and-explicit-error-conflict', {}, async f => {
    f.state().draft = { text: 'Earlier Server Draft', replyToId: null, revision: 1 };
    f.hold();
    const page = await f.newPage();
    await f.open(page);
    await expect.poll(f.held).toBe(true);
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Newer Local Typing');
    f.release();
    await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('Newer Local Typing');
    await page.getByRole('button', { name: 'Keep This Draft', exact: true }).click();
    await expect.poll(() => f.state().draft.text).toBe('Newer Local Typing');
    f.failDraft();
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Explicit Retry Draft');
    await page.getByRole('button', { name: 'Retry Continuity', exact: true }).first().waitFor();
    assert.equal(f.state().draft.text, 'Newer Local Typing');
    await page.getByRole('button', { name: 'Retry Continuity', exact: true }).first().click();
    await expect.poll(() => f.state().draft.text).toBe('Explicit Retry Draft');
    f.state().draft = { text: 'Other Tab Draft', replyToId: null, revision: f.state().draft.revision + 1 };
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Keep Local Conflict Draft');
    await page.getByRole('button', { name: 'Keep This Draft', exact: true }).click();
    await expect.poll(() => f.state().draft.text).toBe('Keep Local Conflict Draft');
    await page.screenshot({ path: path.join(evidence, 'draft-conflict-recovered.png') });
  });
  await check('two-tabs-pin-save-remove-convergence', {}, async f => {
    const page = await f.newPage(), peer = await f.newPage();
    await f.open(page); await f.open(peer);
    await page.keyboard.press('Escape');
    await page.getByText(conversations[0].title, { exact: true }).click({ button: 'right' });
    await page.getByRole('button', { name: 'Pin To Top', exact: true }).click();
    await expect.poll(() => f.state().pin.value).toBe(true);
    await peer.keyboard.press('Escape');
    await peer.getByText(conversations[0].title, { exact: true }).click({ button: 'right' });
    await peer.getByRole('button', { name: 'Unpin', exact: true }).click();
    await expect.poll(() => f.state().pin.value).toBe(false);
    await f.open(page); await f.open(peer);
    const messageId = f.histories.get(conversations[0].id).at(-1).id;
    const bubble = page.locator(`[data-message-id="${messageId}"]`);
    await bubble.locator(':scope > div').first().dispatchEvent('touchstart');
    await bubble.getByRole('button', { name: '⋯', exact: true }).waitFor();
    await bubble.locator(':scope > div').first().dispatchEvent('touchend');
    await bubble.getByRole('button', { name: '⋯', exact: true }).click();
    await bubble.getByRole('button', { name: 'Save Message', exact: true }).click();
    await expect.poll(() => [...f.saved.values()].some(row => row.messageId === messageId && row.saved)).toBe(true);
    const peerBubble = peer.locator(`[data-message-id="${messageId}"]`);
    await peerBubble.locator(':scope > div').first().dispatchEvent('touchstart');
    await peerBubble.getByRole('button', { name: '⋯', exact: true }).waitFor();
    await peerBubble.locator(':scope > div').first().dispatchEvent('touchend');
    await peerBubble.getByRole('button', { name: '⋯', exact: true }).click();
    await peerBubble.getByRole('button', { name: 'Remove Saved Message', exact: true }).click();
    await expect.poll(() => [...f.saved.values()].some(row => row.messageId === messageId && row.saved)).toBe(false);
    await bubble.locator(':scope > div').first().dispatchEvent('touchstart');
    await bubble.getByRole('button', { name: '⋯', exact: true }).waitFor();
    await bubble.locator(':scope > div').first().dispatchEvent('touchend');
    await bubble.getByRole('button', { name: '⋯', exact: true }).click();
    await expect(bubble.getByRole('button', { name: 'Save Message', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Saved Messages', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Open Saved Message', exact: true })).toHaveCount(0);
    await page.screenshot({ path: path.join(evidence, 'saved-removed-two-tabs.png') });
  });
  await check('older-reading-anchor-first-unread-and-incoming', { long: true }, async f => {
    const old = f.histories.get(conversations[0].id)[6];
    const firstUnread = f.histories.get(conversations[0].id)[10];
    f.state().position = { messageId: old.id, offset: 12, revision: 1 };
    const page = await f.newPage(); await f.open(page);
    const target = page.locator(`[data-message-id="${old.id}"]`);
    await expect(target).toBeVisible();
    const initial = await target.boundingBox();
    assert.ok(initial.y > 0 && initial.y < 844, 'Restored old anchor must lie in viewport');
    await expect.poll(() => f.requests.some(r => r.route.endsWith('/get-messages') && r.body.anchorMessageId === old.id)).toBe(true);
    const inboxRequests = f.requests.filter(r => r.route.endsWith('/get-conversations')).length;
    const newer = f.insert();
    await expect.poll(() => f.requests.filter(r => r.route.endsWith('/get-conversations')).length).toBeGreaterThan(inboxRequests);
    assert.equal(await page.locator(`[data-message-id="${newer.id}"]`).count(), 0, 'An incoming row must not create a gap in the older contiguous window');
    const retained = await target.boundingBox();
    assert.ok(Math.abs(retained.y - initial.y) < 4, 'Incoming message moved the older reading viewport');
    assert.ok(!f.readReceipts.some(receipt => receipt.throughMessageId === newer.id), 'Unseen incoming message was acknowledged');
    await page.getByRole('button', { name: 'Jump To First Unread', exact: true }).click();
    await expect.poll(() => visibleInPane(page, firstUnread.id)).toBe(true);
    await expect.poll(() => f.requests.some(r => r.route.endsWith('/get-messages') && (r.body.firstUnread || r.body.anchorMessageId === firstUnread.id))).toBe(true);
    await page.getByRole('button', { name: 'Load Newer Messages', exact: true }).click();
    await expect.poll(() => f.requests.some(r => r.route.endsWith('/get-messages') && r.body.after)).toBe(true);
    await page.locator('[data-messenger-message-scroll]').evaluate(pane => { pane.scrollTop += 160; pane.dispatchEvent(new Event('scroll')); });
    await expect.poll(() => f.state().position.revision).toBeGreaterThan(1);
    const position = clone(f.state().position);
    report.readingCheckpoint = { position, visibleOffset: await page.locator(`[data-message-id="${position.messageId}"]`).evaluate(node => Math.round(node.getBoundingClientRect().top - document.querySelector('[data-messenger-message-scroll]').getBoundingClientRect().top)).catch(() => null) };
    await f.open(page, conversations[1]);
    await f.open(page);
    await expect.poll(() => visibleInPane(page, position.messageId)).toBe(true);
    const restoredOffset = await page.locator(`[data-message-id="${position.messageId}"]`).evaluate(node => Math.round(node.getBoundingClientRect().top - document.querySelector('[data-messenger-message-scroll]').getBoundingClientRect().top));
    assert.ok(Math.abs(restoredOffset - position.offset) <= 4, 'Reading offset did not restore after changing conversations');
    await page.screenshot({ path: path.join(evidence, 'reading-first-unread.png') });
  });
  await check('saved-reload-deleted-and-revoked-targets', {}, async f => {
    const page = await f.newPage(); await f.open(page);
    const conv = conversations[0], row = f.histories.get(conv.id).at(-1);
    await (await menuFor(page, row.id)).getByRole('button', { name: 'Save Message', exact: true }).click();
    await expect.poll(() => [...f.saved.values()].some(item => item.saved)).toBe(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Saved Messages', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Open Saved Message', exact: true })).toHaveCount(1);
    f.histories.set(conv.id, f.histories.get(conv.id).filter(message => message.id !== row.id));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByRole('button', { name: 'Open Saved Message', exact: true })).toHaveCount(0);
    f.histories.get(conv.id).push(row);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByRole('button', { name: 'Open Saved Message', exact: true })).toHaveCount(1);
    f.revoked.add(conv.id);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByRole('button', { name: 'Open Saved Message', exact: true })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Saved Messages List' })).not.toContainText(row.content);
    await page.screenshot({ path: path.join(evidence, 'saved-revoked.png') });
  });
  assert.deepEqual(report.errors, [], 'Application raised browser errors');
  assert.ok(report.cases.length > 0, 'Selected browser scenario does not exist');
  report.passed = true;
})().catch(error => { report.failure = error.message; process.exitCode = 1; }).finally(async () => {
  await browser?.close();
  fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
});
