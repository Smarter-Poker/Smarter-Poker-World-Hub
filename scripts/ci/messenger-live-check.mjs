#!/usr/bin/env node
// Explicit, finite verification of the designated test account on the published
// app. No message sends, seeds, invoice actions, credentials or account content
// are written to evidence. Only reads of displayed rows may change read state.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import { APP_ORIGIN, AUTH_ORIGIN, validateConfiguration } from './messenger-live-configuration.mjs';
export { APP_ORIGIN, AUTH_ORIGIN, validateConfiguration } from './messenger-live-configuration.mjs';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const READ_POSTS = new Set(['/api/messenger/get-conversations', '/api/messenger/get-messages']);

export function allowMutation(method, url, body, loadedConversations, visibleNotifications) {
  const target = new URL(url);
  if (target.origin !== APP_ORIGIN) return false;
  if (method === 'POST' && READ_POSTS.has(target.pathname)) return true;
  if (method === 'POST' && target.pathname === '/api/messenger/mark-read') {
    return UUID.test(body?.conversationId || '') && UUID.test(body?.throughMessageId || '')
      && loadedConversations.get(body.conversationId)?.has(body.throughMessageId) === true;
  }
  if (method === 'POST' && target.pathname === '/api/notifications/mark-read') {
    return Array.isArray(body?.ids) && body.ids.length > 0 && body.ids.length <= 200
      && body.ids.every(id => UUID.test(id) && visibleNotifications.has(id));
  }
  if (method === 'PUT' && target.pathname === '/api/poker/notifications') {
    return UUID.test(body?.notification_id || '') && visibleNotifications.has(`poker-${body.notification_id}`);
  }
  return false;
}

function unread(conversations) {
  assert.ok(Array.isArray(conversations), 'Conversation response is not a list');
  return conversations.reduce((total, row) => {
    assert.ok(UUID.test(row.id), 'Conversation identity is invalid');
    assert.ok(Number.isInteger(row.unreadCount) && row.unreadCount >= 0, 'Invalid unread count');
    return total + row.unreadCount;
  }, 0);
}

export function validateUnreadSnapshot(header, workspaces) {
  assert.equal(header.success, true, 'Header stats did not succeed');
  const social = workspaces.find(w => w.workspace === 'social');
  assert.ok(social, 'Social workspace is missing');
  assert.equal(unread(social.conversations), header.messengerUnread?.social, 'Social badge differs from reachable inbox');
  let total = unread(social.conversations);
  for (const workspace of workspaces.filter(w => w.workspace === 'club')) {
    const count = unread(workspace.conversations);
    assert.equal(count, header.messengerUnread?.clubs?.[workspace.clubId]?.[workspace.folder], 'Club tab badge differs from reachable inbox');
    total += count;
  }
  assert.equal(total, header.unreadMessages, 'Global Messenger badge differs from reachable inboxes');
  assert.equal(total, header.messengerUnread?.total, 'Messenger summary total is inconsistent');
  return total;
}

export function selfTest() {
  const id = '00000000-0000-4000-8000-000000000001';
  const loaded = new Map([[id, new Set([id])]]);
  const visible = new Set([id, `poker-${id}`]);
  const url = path => APP_ORIGIN + path;
  assert.equal(allowMutation('POST', url('/api/messenger/mark-read'), { conversationId: id, throughMessageId: id }, loaded, visible), true);
  assert.equal(allowMutation('POST', url('/api/messenger/mark-read'), { conversationId: id, throughMessageId: id }, new Map(), visible), false);
  assert.equal(allowMutation('POST', url('/api/messenger/mark-read'), { conversationId: id }, loaded, visible), false);
  assert.equal(allowMutation('POST', url('/api/messenger/mark-read'), { conversationId: id, throughMessageId: '00000000-0000-4000-8000-000000000002' }, loaded, visible), false);
  assert.equal(allowMutation('POST', url('/api/notifications/mark-read'), { ids: [id] }, loaded, visible), true);
  assert.equal(allowMutation('POST', url('/api/notifications/mark-read'), { ids: [id] }, loaded, new Set()), false);
  assert.equal(allowMutation('PUT', url('/api/poker/notifications'), { notification_id: id }, loaded, visible), true);
  for (const path of ['/api/messenger/send-message', '/api/live-help/report-bug', '/api/invoices/pay']) {
    assert.equal(allowMutation('POST', url(path), { conversationId: id }, loaded, visible), false);
  }
  assert.equal(allowMutation('POST', 'https://example.invalid/api/messenger/mark-read', { conversationId: id }, loaded, visible), false);
  assert.throws(() => validateConfiguration({}), /TEST_USER_EMAIL/);
  const social = { workspace: 'social', conversations: [{ id, unreadCount: 2 }] };
  assert.equal(validateUnreadSnapshot({ success: true, unreadMessages: 2, messengerUnread: { social: 2, total: 2 } }, [social]), 2);
  assert.throws(() => validateUnreadSnapshot({ success: true, unreadMessages: 32, messengerUnread: { social: 2, total: 32 } }, [social]), /reachable inboxes/);
  console.log('Messenger live verifier safety checks passed');
}

async function run() {
  validateConfiguration(process.env);
  const evidenceDir = process.env.MESSENGER_EVIDENCE_DIR || 'test-results/messenger-live';
  await mkdir(evidenceDir, { recursive: true });
  const report = { observedAt: new Date().toISOString(), expectedSha: process.env.MESSENGER_EXPECTED_SHA, status: 'running', coverage: {}, limitations: [], checks: [] };
  let browser;
  try {
    const healthResponse = await fetch(`${APP_ORIGIN}/api/health`, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000) });
    const health = await healthResponse.json();
    assert.ok(healthResponse.ok && health.status === 'ok', 'Production health is not healthy');
    assert.equal(health.commitSha, process.env.MESSENGER_EXPECTED_SHA, 'Live revision differs from expected protected revision');
    report.deploymentId = health.deploymentId;
    const { createClient } = await import('@supabase/supabase-js');
    const auth = createClient(AUTH_ORIGIN, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(20000) }) } });
    const signedIn = await auth.auth.signInWithPassword({ email: process.env.TEST_USER_EMAIL, password: process.env.TEST_USER_PASSWORD });
    assert.ok(!signedIn.error && signedIn.data?.session?.access_token, 'Configured test account authentication failed; no fallback account was used');
    const session = signedIn.data.session;
    const verified = await auth.auth.getUser(session.access_token);
    assert.ok(!verified.error && verified.data?.user?.id === session.user.id, 'Authenticated test account identity could not be verified');
    assert.equal(verified.data.user.email?.toLowerCase(), process.env.TEST_USER_EMAIL.toLowerCase(), 'Authenticated identity differs from configured test account');
    report.accountFingerprint = createHash('sha256').update(session.user.id).digest('hex').slice(0, 16);

    const api = async (path, body) => {
      assert.ok(['/api/user/get-header-stats', '/api/messenger/get-conversations', '/api/messenger/get-messages', '/api/notifications/feed'].includes(path), 'Unapproved API probe route');
      const response = await fetch(`${APP_ORIGIN}${path}${body ? '' : '?bust=1'}`, {
        method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
        body: body ? JSON.stringify(body) : undefined, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000),
      });
      assert.ok(response.ok, `${path} failed with HTTP ${response.status}`);
      const data = await response.json();
      assert.equal(data.success, true, `${path} did not return success`);
      return data;
    };
    const snapshot = async () => {
      const social = await api('/api/messenger/get-conversations', { workspace: 'social' });
      assert.ok(Array.isArray(social.clubs) && social.clubs.length <= 20, 'Expected a bounded designated test-account club list');
      const workspaces = [social];
      for (const club of social.clubs) for (const folder of ['messages', 'invoices']) {
        workspaces.push(await api('/api/messenger/get-conversations', { workspace: 'club', clubId: club.id, folder }));
      }
      const header = await api('/api/user/get-header-stats');
      return { workspaces, header, total: validateUnreadSnapshot(header, workspaces) };
    };
    const before = await snapshot();
    report.before = { messages: before.total, notifications: before.header.notificationCount, clubs: before.workspaces[0].clubs.length };
    report.checks.push('Authenticated header counts match every reachable workspace and tab');

    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    // No stored auth files, HARs, traces, screenshots, or live message contents.
    await context.addInitScript(({ currentSession }) => {
      localStorage.setItem('smarter-poker-auth', JSON.stringify(currentSession));
      localStorage.setItem(`sp_firstrun_notif_v2_${currentSession.user.id}`, String(Date.now()));
      sessionStorage.setItem('social-intro-seen', 'true');
    }, { currentSession: session });
    // This probe verifies persistence, not peer message delivery or presence.
    await context.routeWebSocket('**/*', socket => socket.close());
    const selected = new Set();
    const loaded = new Map();
    const messageReceipts = new Set();
    const notificationReceipts = new Set();
    const failures = [];
    const pageErrors = [];
    await context.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return route.continue();
      let body; try { body = request.postDataJSON(); } catch { body = null; }
      const visible = new Set(await request.frame().evaluate(() => Array.from(document.querySelectorAll('[data-notif-id]')).filter(el => {
        const r = el.getBoundingClientRect();
        return document.visibilityState === 'visible' && r.width > 0 && r.height > 0 && Math.min(r.bottom, innerHeight) - Math.max(r.top, 0) >= r.height / 2;
      }).map(el => el.getAttribute('data-notif-id'))).catch(() => []));
      if (!allowMutation(request.method(), request.url(), body, loaded, visible)) {
        if (url.pathname.includes('mark-read') || url.pathname === '/api/poker/notifications') failures.push('Read attempt was outside loaded or visible rows');
        return route.fulfill({ status: 403, contentType: 'application/json', body: '{"success":false,"error":"Outside Verification Scope"}' });
      }
      if (url.pathname === '/api/messenger/mark-read') {
        const conversationVisible = await request.frame().evaluate(() => {
          const main = document.querySelector('.messenger-page main');
          return location.pathname === '/hub/messenger' && document.visibilityState === 'visible'
            && !!main && main.getBoundingClientRect().height > 0 && getComputedStyle(main).display !== 'none';
        }).catch(() => false);
        if (!conversationVisible) {
          failures.push('Conversation read attempted while its pane was hidden');
          return route.fulfill({ status: 403, contentType: 'application/json', body: '{"success":false}' });
        }
      }
      const response = await route.fetch({ maxRedirects: 0 });
      const data = await response.json().catch(() => null);
      if (url.pathname === '/api/messenger/get-messages' && selected.has(body?.conversationId) && response.ok() && data?.success && data.messages?.length) loaded.set(body.conversationId, new Set(data.messages.map(m => m.id)));
      if (url.pathname === '/api/messenger/mark-read') {
        if (response.ok() && data?.success === true) messageReceipts.add(body.conversationId);
        else failures.push('Visible conversation read did not persist');
      }
      if (['/api/notifications/mark-read', '/api/poker/notifications'].includes(url.pathname)) {
        if (response.ok() && data?.success === true) for (const id of body.ids || [`poker-${body.notification_id}`]) notificationReceipts.add(id);
        else failures.push('Visible notification read did not persist');
      }
      return route.fulfill({ response });
    });
    const page = await context.newPage();
    page.on('pageerror', () => pageErrors.push('Browser page error'));
    page.setDefaultTimeout(30000);
    const available = before.workspaces.flatMap(w => w.conversations).filter((row, i, rows) => rows.findIndex(r => r.id === row.id) === i);
    const candidates = available.filter(c => c.unreadCount > 0).slice(0, 3);
    if (!candidates.length && available.length) candidates.push(available[0]);
    for (const conversation of candidates) {
      selected.add(conversation.id);
      const receipt = page.waitForResponse(r => new URL(r.url()).pathname === '/api/messenger/mark-read' && r.request().postDataJSON()?.conversationId === conversation.id, { timeout: 30000 });
      await page.goto(`${APP_ORIGIN}/hub/messenger?conversation=${conversation.id}`, { waitUntil: 'domcontentloaded' });
      await receipt;
      assert.ok(loaded.has(conversation.id) && messageReceipts.has(conversation.id), 'Selected visible conversation had no successful read receipt');
      const refreshed = await api('/api/messenger/get-conversations', { workspace: 'resolve', conversationId: conversation.id });
      assert.equal(refreshed.conversation?.unreadCount, 0, 'Persisted conversation unread count did not clear');
    }
    report.coverage.messageReadReceipts = messageReceipts.size;
    report.coverage.nonzeroMessageTransitions = candidates.filter(c => c.unreadCount > 0).length;
    if (!candidates.length) report.limitations.push('Designated test account has no existing conversations; no message read transition was exercised');
    else if (!report.coverage.nonzeroMessageTransitions) report.limitations.push('Designated test account had no unread conversations; only idempotent read persistence was exercised');

    const feedBefore = await api('/api/notifications/feed');
    const feedLoaded = page.waitForResponse(r => new URL(r.url()).pathname === '/api/notifications/feed');
    await page.goto(`${APP_ORIGIN}/hub/notifications`, { waitUntil: 'domcontentloaded' });
    await feedLoaded;
    const rows = page.locator('[data-notif-id]');
    if (feedBefore.notifications.length) {
      await rows.first().waitFor();
      // Traverse at most twelve actual rows. App visibility observers own writes.
      for (let i = 0; i < Math.min(await rows.count(), 12); i++) {
        const row = rows.nth(i);
        await row.scrollIntoViewIfNeeded();
        const id = await row.getAttribute('data-notif-id');
        const wasUnread = feedBefore.notifications.some(n => n.id === id && !n.read && !n.is_read);
        if (wasUnread) await page.waitForFunction(id => !document.querySelector(`[data-notif-id="${id}"]`)?.classList.contains('unread-notification-row'), id);
      }
    }
    const feedAfter = await api('/api/notifications/feed');
    for (const id of notificationReceipts) {
      const row = feedAfter.notifications.find(n => n.id === id);
      assert.ok(row && (row.read || row.is_read), 'Notification read receipt was not durable');
    }
    report.coverage.notificationReadReceipts = notificationReceipts.size;
    if (!notificationReceipts.size) report.limitations.push('No unread visible notification row existed; no notification read transition was exercised');
    const after = await snapshot();
    await page.goto(`${APP_ORIGIN}/hub/messenger`, { waitUntil: 'domcontentloaded' });
    await page.locator('.approved-global-header__messenger').waitFor();
    await page.waitForFunction(expected => {
      const label = document.querySelector('.approved-global-header__messenger')?.textContent?.trim() || '';
      return label === (expected > 99 ? '99+' : expected > 0 ? String(expected) : '');
    }, after.total);
    await page.waitForFunction(expected => {
      const label = document.querySelector('.approved-global-header__notifications')?.textContent?.trim() || '';
      return label === (expected > 99 ? '99+' : expected > 0 ? String(expected) : '');
    }, after.header.notificationCount);
    const finalHealth = await fetch(`${APP_ORIGIN}/api/health`, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000) });
    assert.equal((await finalHealth.json()).commitSha, report.expectedSha, 'Production revision changed during verification');
    assert.equal(failures.length, 0, failures[0] || 'Read safety failure');
    assert.equal(pageErrors.length, 0, 'Published page raised browser errors');
    report.after = { messages: after.total, notifications: after.header.notificationCount };
    report.checks.push('Persisted read receipts verified against fresh application APIs', 'Reloaded Messenger and notification badges match fresh authoritative counts');
    report.status = report.limitations.length ? 'passed-available-data-with-coverage-gaps' : 'passed';
    console.log(JSON.stringify(report));
  } catch (error) {
    // Assertions contain only fixed descriptions, counts, endpoint paths or SHA.
    // Provider errors and response bodies are deliberately never logged.
    report.status = 'failed';
    report.failure = error instanceof assert.AssertionError ? error.message.split('\n')[0] : 'Live probe could not complete; check configured test access and service availability';
    console.error(report.failure);
    process.exitCode = 1;
  } finally {
    await browser?.close();
    await writeFile(`${evidenceDir}/result.json`, JSON.stringify(report, null, 2));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--self-test')) selfTest();
  else if (process.argv.includes('--isolated-send')) await (await import('./messenger-send-live-check.mjs')).runIsolatedSend();
  else await run();
}
