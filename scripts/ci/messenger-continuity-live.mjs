#!/usr/bin/env node
// Explicit finite API verification. The parent owns fixture seed/census/cleanup.
// No send endpoint, read receipt, account creation, invoice or unrelated write.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { APP_ORIGIN, AUTH_ORIGIN, validateConfiguration } from './messenger-live-configuration.mjs';

export const FIXTURE_TITLE = 'Messenger Verification Only';
export const OFFICIAL_FINGERPRINT = '9fec7638c003ad1c';
export const FIXTURE_SENDER = '00000000-0000-0000-0000-000000000069';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const keysAre = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function continuityConfiguration(env) {
  validateConfiguration(env);
  assert.equal(env.MESSENGER_VERIFY_MODE, 'isolated-continuity', 'Explicit isolated-continuity mode is required');
  for (const key of ['MESSENGER_FIXTURE_CONVERSATION_ID', 'MESSENGER_FIXTURE_MESSAGE_ID', 'MESSENGER_FIXTURE_FIRST_UNREAD_ID']) {
    assert.match(env[key] || '', UUID, `${key} must be an exact fixture UUID`);
  }
  const conversationId = env.MESSENGER_FIXTURE_CONVERSATION_ID;
  const messageId = env.MESSENGER_FIXTURE_MESSAGE_ID;
  const firstUnreadId = env.MESSENGER_FIXTURE_FIRST_UNREAD_ID;
  assert.equal(new Set([conversationId, messageId, firstUnreadId]).size, 3, 'Fixture conversation and message IDs must be distinct');
  return { conversationId, messageId, firstUnreadId,
    draft: { text: `${FIXTURE_TITLE}: Continuity Draft ${conversationId}`, replyToId: null },
    staleDraft: { text: `${FIXTURE_TITLE}: Stale Draft ${conversationId}`, replyToId: null } };
}

export function allowedContinuityRequest(method, address, body, fixture, loadedCursors = new Set()) {
  let target;
  try { target = new URL(address); } catch { return false; }
  if (!fixture || target.origin !== APP_ORIGIN || target.search || target.hash || target.username || target.password || method !== 'POST') return false;
  if (target.pathname === '/api/messenger/get-conversations') return keysAre(body, ['workspace', 'conversationId']) && body.workspace === 'resolve' && body.conversationId === fixture.conversationId;
  if (target.pathname === '/api/messenger/get-messages') {
    if (body?.conversationId !== fixture.conversationId) return false;
    if (keysAre(body, ['conversationId', 'anchorMessageId'])) return [fixture.messageId, fixture.firstUnreadId].includes(body.anchorMessageId);
    if (keysAre(body, ['conversationId', 'firstUnread'])) return body.firstUnread === true;
    return keysAre(body, ['conversationId', 'after', 'afterId']) && loadedCursors.has(`${body.after}|${body.afterId}`);
  }
  if (target.pathname !== '/api/messenger/continuity' || body?.conversationId !== fixture.conversationId) return false;
  if (keysAre(body, ['action', 'conversationId'])) return body.action === 'read';
  if (!keysAre(body, ['action', 'conversationId', 'field', 'expectedRevision', 'value']) || body.action !== 'write'
    || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0) return false;
  const value = body.value;
  if (body.field === 'draft') return keysAre(value, ['text', 'replyToId']) && value.replyToId === null && ['', fixture.draft.text, fixture.staleDraft.text].includes(value.text);
  if (body.field === 'pin') return typeof value === 'boolean';
  if (body.field === 'position') return keysAre(value, ['messageId', 'offset']) && ((value.messageId === fixture.messageId && value.offset === 12) || (value.messageId === null && value.offset === 0));
  return body.field === 'saved' && keysAre(value, ['messageId', 'saved']) && value.messageId === fixture.messageId && typeof value.saved === 'boolean';
}

export function validateContinuityFixture(workspace, fixture) {
  assert.equal(workspace?.success, true, 'Fixture conversation lookup failed');
  const row = workspace.conversation;
  assert.equal(row?.id, fixture.conversationId, 'Resolved conversation differs from exact fixture');
  assert.equal(row.title, FIXTURE_TITLE, 'Conversation is not labeled as a verification fixture');
  assert.equal(row.is_group, true, 'Fixture must be a technical group conversation');
  assert.ok(!row.otherUser && !row.accounting && !row.isAccounting && !row.clubId && !workspace.clubId && workspace.workspace === 'social', 'Fixture may not address a person or financial workspace');
}

function stateFrom(data, fixture) { return data.state || data.states?.[fixture.conversationId]; }
function fieldValue(state, field) {
  if (field === 'draft') return { text: state.draft.text, replyToId: state.draft.replyToId ?? null };
  if (field === 'pin') return state.pin.value;
  return { messageId: state.position.messageId ?? null, offset: state.position.offset };
}
export function validateFreshContinuity(data, fixture) {
  assert.equal(data?.success, true, 'Initial continuity read failed');
  const state = stateFrom(data, fixture);
  assert.ok(state, 'Initial continuity state missing');
  assert.deepEqual(fieldValue(state, 'draft'), { text: '', replyToId: null }, 'Fixture already contains a draft');
  assert.equal(fieldValue(state, 'pin'), false, 'Fixture is already pinned');
  assert.deepEqual(fieldValue(state, 'position'), { messageId: null, offset: 0 }, 'Fixture already contains a reading position');
  for (const field of ['draft', 'pin', 'position']) assert.equal(state[field].revision, 0, 'Fixture continuity is not fresh; inspect the owning outcome before reuse');
  assert.ok(Array.isArray(data.saved), 'Saved message response missing');
  assert.ok(!data.saved.some(item => item.conversationId === fixture.conversationId), 'Fixture has an existing saved message');
  return state;
}

export function validateHistory(data, fixture, expectedId) {
  assert.equal(data?.success, true, 'Fixture history read failed');
  assert.ok(Array.isArray(data.messages) && data.messages.length > 0 && data.messages.length <= 50, 'Expected a bounded nonempty history page');
  assert.equal(new Set(data.messages.map(row => row.id)).size, data.messages.length, 'History contains duplicate identities');
  for (const row of data.messages) {
    assert.match(row.id || '', UUID, 'Invalid fixture message identity');
    assert.equal(row.conversation_id, fixture.conversationId, 'History escaped the exact fixture');
    assert.equal(row.sender_id, FIXTURE_SENDER, 'History has an unexpected fixture sender');
    assert.ok(row.content?.startsWith(FIXTURE_TITLE) && row.message_type === 'text', 'History is not labeled plain fixture content');
  }
  if (expectedId) assert.ok(data.messages.some(row => row.id === expectedId), 'Requested fixture anchor was not returned');
  return data.messages;
}

export async function runContinuity() {
  const evidenceDir = process.env.MESSENGER_EVIDENCE_DIR || 'test-results/messenger-continuity-live';
  await mkdir(evidenceDir, { recursive: true });
  const report = { observedAt: new Date().toISOString(), status: 'running', checks: [], cleanup: 'not-needed',
    limitation: 'Authenticated deployed API and fresh-read persistence proof only. Actual frontend and two-tab behavior are verified by the separate local browser suite; physical-device and push behavior are not asserted.' };
  let fixture, api, initial, eligible = false;
  const attempted = new Set();
  const observedRevisions = new Map();
  const loadedCursors = new Set();
  try {
    fixture = continuityConfiguration(process.env);
    report.expectedSha = process.env.MESSENGER_EXPECTED_SHA;
    report.fixture = { conversationId: fixture.conversationId, messageId: fixture.messageId, firstUnreadId: fixture.firstUnreadId };
    const health = async () => {
      const response = await fetch(`${APP_ORIGIN}/api/health`, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20000) });
      const data = await response.json();
      assert.ok(response.ok && data.status === 'ok', 'Production health is not healthy');
      assert.equal(data.commitSha, report.expectedSha, 'Published revision differs from expected protected SHA');
      report.deploymentId = data.deploymentId;
    };
    await health();
    const { createClient } = await import('@supabase/supabase-js');
    const auth = createClient(AUTH_ORIGIN, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(20000) }) } });
    const signedIn = await auth.auth.signInWithPassword({ email: process.env.TEST_USER_EMAIL, password: process.env.TEST_USER_PASSWORD });
    const session = signedIn.data?.session;
    assert.ok(!signedIn.error && session?.access_token, 'Configured test identity could not authenticate; no fallback used');
    const verified = await auth.auth.getUser(session.access_token);
    assert.ok(!verified.error && verified.data?.user?.id === session.user.id, 'Test identity verification failed');
    assert.equal(verified.data.user.email?.toLowerCase(), process.env.TEST_USER_EMAIL.toLowerCase(), 'Authenticated identity differs from configured identity');
    report.accountFingerprint = createHash('sha256').update(session.user.id).digest('hex').slice(0, 16);
    assert.equal(report.accountFingerprint, OFFICIAL_FINGERPRINT, 'Only the established official test identity may run this probe');
    api = async (route, body, expectedStatus = 200) => {
      assert.equal(allowedContinuityRequest('POST', APP_ORIGIN + route, body, fixture, loadedCursors), true, 'Request is outside exact continuity fixture scope');
      const response = await fetch(APP_ORIGIN + route, { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }, body: JSON.stringify(body), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000) });
      assert.equal(response.status, expectedStatus, 'Fixture API returned an unexpected status');
      const data = await response.json();
      assert.equal(data.success, expectedStatus === 200, 'Fixture API success disagrees with status');
      return data;
    };
    const read = () => api('/api/messenger/continuity', { action: 'read', conversationId: fixture.conversationId });
    validateContinuityFixture(await api('/api/messenger/get-conversations', { workspace: 'resolve', conversationId: fixture.conversationId }), fixture);
    initial = validateFreshContinuity(await read(), fixture);
    const firstUnread = await api('/api/messenger/get-messages', { conversationId: fixture.conversationId, firstUnread: true });
    assert.equal(firstUnread.firstUnreadMessageId, fixture.firstUnreadId, 'First unread does not match the prepared watermark');
    validateHistory(firstUnread, fixture, fixture.firstUnreadId);
    let history = await api('/api/messenger/get-messages', { conversationId: fixture.conversationId, anchorMessageId: fixture.messageId });
    let rows = validateHistory(history, fixture, fixture.messageId);
    assert.equal(history.hasNewer, true, 'Prepared old anchor must be outside the latest history window');
    const ids = new Set(rows.map(row => row.id));
    let pages = 1;
    for (let page = 0; page < 3 && history.hasNewer; page++) {
      const last = rows.at(-1);
      loadedCursors.add(`${last.created_at}|${last.id}`);
      history = await api('/api/messenger/get-messages', { conversationId: fixture.conversationId, after: last.created_at, afterId: last.id });
      rows = validateHistory(history, fixture);
      for (const row of rows) { assert.ok(!ids.has(row.id), 'Forward pages overlap'); ids.add(row.id); }
      pages++;
    }
    assert.equal(history.hasNewer, false, 'Fixture navigation exceeded the finite page budget');
    assert.equal(ids.size, 120, 'Prepared fixture history must contain all 120 unique messages without a gap');
    report.history = { pages, uniqueMessages: ids.size };
    report.checks.push('Exact old anchor, earliest unread and bounded forward pages returned authorized fixture history');
    eligible = true;
    const write = async (field, value, expectedRevision = 0, status = 200) => {
      attempted.add(field);
      const data = await api('/api/messenger/continuity', { action: 'write', conversationId: fixture.conversationId, field, expectedRevision, value }, status);
      assert.equal(data.field, field, 'Write acknowledged a different field');
      assert.ok(Number.isSafeInteger(data.revision) && data.revision >= 0, 'Invalid continuity revision');
      observedRevisions.set(field, data.revision);
      return data;
    };
    const draft = await write('draft', fixture.draft);
    assert.ok(draft.revision > 0, 'Draft write did not advance revision');
    const replay = await write('draft', fixture.draft);
    assert.equal(replay.revision, draft.revision, 'Same-value replay changed revision');
    const conflict = await write('draft', fixture.staleDraft, 0, 409);
    assert.equal(conflict.revision, draft.revision, 'Conflict lost authoritative draft revision');
    await write('pin', true);
    await write('saved', { messageId: fixture.messageId, saved: true });
    await write('position', { messageId: fixture.messageId, offset: 12 });
    const persisted = await read();
    const state = stateFrom(persisted, fixture);
    assert.deepEqual(fieldValue(state, 'draft'), fixture.draft, 'Fresh read lost the accepted draft or persisted stale conflict');
    assert.equal(fieldValue(state, 'pin'), true, 'Fresh read lost the pin');
    assert.deepEqual(fieldValue(state, 'position'), { messageId: fixture.messageId, offset: 12 }, 'Fresh read lost the reading anchor');
    const saved = persisted.saved.filter(item => item.messageId === fixture.messageId && item.conversationId === fixture.conversationId);
    assert.equal(saved.length, 1, 'Saved fixture message is absent or duplicated');
    assert.equal(saved[0].saved, true, 'Saved fixture is not active');
    assert.ok(saved[0].message?.content?.startsWith(FIXTURE_TITLE), 'Saved message did not resolve authorized current content');
    report.checks.push('Draft, pin, saved message and reading position persisted through fresh API reads', 'Duplicate draft was idempotent and stale changed draft returned conflict');
    await health();
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed';
    report.failure = error instanceof assert.AssertionError ? error.message.split('\n')[0] : 'Continuity probe could not complete; inspect configured access and owning fixture outcome';
    process.exitCode = 1;
  } finally {
    if (eligible && attempted.size) {
      report.cleanup = 'requires-parent-readback';
      try {
        const fresh = await api('/api/messenger/continuity', { action: 'read', conversationId: fixture.conversationId });
        const state = stateFrom(fresh, fixture);
        // Restore only known fixture values. An unexpected concurrent change is
        // preserved and handed back to the fixture owner rather than overwritten.
        for (const field of ['saved', 'position', 'pin', 'draft'].filter(field => attempted.has(field))) {
          let revision, value;
          if (field === 'saved') {
            const item = fresh.saved.find(row => row.messageId === fixture.messageId && row.conversationId === fixture.conversationId);
            revision = item?.revision ?? observedRevisions.get('saved') ?? 0;
            value = { messageId: fixture.messageId, saved: false };
          } else {
            revision = state[field].revision;
            const actual = fieldValue(state, field);
            const owned = field === 'draft' ? fixture.draft : field === 'pin' ? true : { messageId: fixture.messageId, offset: 12 };
            value = fieldValue(initial, field);
            assert.ok(same(actual, owned) || same(actual, value), 'Unexpected concurrent fixture state; parent must reconcile cleanup');
          }
          await api('/api/messenger/continuity', { action: 'write', conversationId: fixture.conversationId, field, expectedRevision: revision, value });
        }
        const restored = await api('/api/messenger/continuity', { action: 'read', conversationId: fixture.conversationId });
        for (const field of ['draft', 'pin', 'position']) assert.deepEqual(fieldValue(stateFrom(restored, fixture), field), fieldValue(initial, field), 'Fixture values did not restore');
        assert.ok(!restored.saved.some(item => item.conversationId === fixture.conversationId), 'Fixture saved state did not clear');
        report.cleanup = 'baseline-values-restored-parent-owns-row-cleanup';
        report.checks.push('Fresh API readback confirms initial field values restored; revisions and tombstones retained for parent cleanup');
      } catch {
        report.status = 'failed';
        report.cleanup = 'requires-parent-reconciliation';
        process.exitCode = 1;
      }
    }
    await writeFile(`${evidenceDir}/result.json`, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runContinuity();
