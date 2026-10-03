import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { APP_ORIGIN, AUTH_ORIGIN } from '../scripts/ci/messenger-live-configuration.mjs';
import { allowMutation } from '../scripts/ci/messenger-live-check.mjs';
import { FIXTURE_TITLE, continuityConfiguration, allowedContinuityRequest, validateContinuityFixture, validateFreshContinuity, validateHistory, runContinuity } from '../scripts/ci/messenger-continuity-live.mjs';

const id = n => `00000000-0000-5000-8000-${String(n).padStart(12, '0')}`;
const env = { TEST_USER_EMAIL: 'fixture@example.invalid', TEST_USER_PASSWORD: 'fixture-value', NEXT_PUBLIC_SUPABASE_URL: AUTH_ORIGIN, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture-key', MESSENGER_EXPECTED_SHA: 'a'.repeat(40), MESSENGER_VERIFY_MODE: 'isolated-continuity', MESSENGER_FIXTURE_CONVERSATION_ID: id(1), MESSENGER_FIXTURE_MESSAGE_ID: id(2), MESSENGER_FIXTURE_FIRST_UNREAD_ID: id(3) };
const fixture = continuityConfiguration(env);
const route = APP_ORIGIN + '/api/messenger/continuity';
const write = (field, value, expectedRevision = 0) => ({ action: 'write', conversationId: fixture.conversationId, field, expectedRevision, value });
const empty = () => ({ success: true, state: { draft: { text: '', replyToId: null, revision: 0 }, pin: { value: false, revision: 0 }, position: { messageId: null, offset: 0, revision: 0 } }, saved: [] });

test('actual continuity CLI fails closed before network and writes a sanitized receipt', () => {
  const dir = mkdtempSync(join(tmpdir(), 'messenger-continuity-entry-'));
  try {
    const result = spawnSync(process.execPath, ['scripts/ci/messenger-continuity-live.mjs'], { env: { PATH: process.env.PATH, MESSENGER_EVIDENCE_DIR: dir }, encoding: 'utf8', timeout: 5000 });
    assert.ifError(result.error);
    assert.equal(result.status, 1);
    assert.doesNotMatch(result.stderr, /unsettled top-level await/);
    const receipt = JSON.parse(readFileSync(join(dir, 'result.json'), 'utf8'));
    assert.equal(receipt.status, 'failed');
    assert.match(receipt.failure, /TEST_USER_EMAIL is required/);
    assert.equal(receipt.cleanup, 'not-needed');
    assert.doesNotMatch(JSON.stringify(receipt), /fixture-value|access_token|password/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('continuity requires explicit mode, exact revision and three distinct UUIDs', () => {
  for (const key of Object.keys(env)) assert.throws(() => continuityConfiguration({ ...env, [key]: '' }), key);
  assert.throws(() => continuityConfiguration({ ...env, MESSENGER_VERIFY_MODE: 'isolated-send' }));
  assert.throws(() => continuityConfiguration({ ...env, MESSENGER_FIXTURE_MESSAGE_ID: fixture.conversationId }));
  assert.throws(() => continuityConfiguration({ ...env, NEXT_PUBLIC_SUPABASE_URL: 'https://other.invalid' }));
  assert.equal(fixture.messageId, id(2), 'Existing version-five UUIDs remain supported');
});

test('continuity write guard accepts only fixed fixture values and canonical route', () => {
  for (const body of [write('draft', fixture.draft), write('draft', fixture.staleDraft), write('draft', { text: '', replyToId: null }), write('pin', true), write('pin', false), write('saved', { messageId: fixture.messageId, saved: true }), write('saved', { messageId: fixture.messageId, saved: false }), write('position', { messageId: fixture.messageId, offset: 12 }), write('position', { messageId: null, offset: 0 })]) assert.equal(allowedContinuityRequest('POST', route, body, fixture), true);
  for (const body of [write('draft', { text: 'Real User Text', replyToId: null }), write('draft', { ...fixture.draft, replyToId: fixture.messageId }), write('pin', 'true'), write('position', { messageId: id(7), offset: 12 }), write('position', { messageId: fixture.messageId, offset: 13 }), write('saved', { messageId: id(7), saved: true }), write('saved', { messageId: fixture.messageId, saved: true, userId: id(9) }), write('pin', true, -1), write('pin', true, 1.2), { ...write('pin', true), userId: id(9) }, { ...write('pin', true), conversationId: id(8) }, null]) assert.equal(allowedContinuityRequest('POST', route, body, fixture), false, JSON.stringify(body));
  for (const url of [route + '?target=other', route + '#extra', 'https://other.invalid/api/messenger/continuity', APP_ORIGIN + '/api/messenger/send-message', APP_ORIGIN + '/api/messenger/mark-read', 'not-a-url']) assert.equal(allowedContinuityRequest('POST', url, write('pin', true), fixture), false);
  assert.equal(allowedContinuityRequest('PUT', route, write('pin', true), fixture), false);
  assert.equal(allowMutation('POST', route, write('pin', true), new Map(), new Set()), false, 'Default read probe is unchanged');
});

test('read guard requires exact conversation and forward cursor returned by preceding page', () => {
  assert.equal(allowedContinuityRequest('POST', route, { action: 'read', conversationId: fixture.conversationId }, fixture), true);
  assert.equal(allowedContinuityRequest('POST', route, { action: 'read' }, fixture), false);
  const messages = APP_ORIGIN + '/api/messenger/get-messages';
  assert.equal(allowedContinuityRequest('POST', messages, { conversationId: fixture.conversationId, firstUnread: true }, fixture), true);
  assert.equal(allowedContinuityRequest('POST', messages, { conversationId: fixture.conversationId, anchorMessageId: fixture.messageId }, fixture), true);
  const cursor = { conversationId: fixture.conversationId, after: '2026-09-27T12:00:00Z', afterId: id(5) };
  assert.equal(allowedContinuityRequest('POST', messages, cursor, fixture), false);
  assert.equal(allowedContinuityRequest('POST', messages, cursor, fixture, new Set([`${cursor.after}|${cursor.afterId}`])), true);
  assert.equal(allowedContinuityRequest('POST', messages, { ...cursor, before: cursor.after }, fixture, new Set([`${cursor.after}|${cursor.afterId}`])), false);
});

test('fixture validation rejects ordinary recipients, accounting and dirty initial state', () => {
  const workspace = { success: true, workspace: 'social', clubId: null, conversation: { id: fixture.conversationId, title: FIXTURE_TITLE, is_group: true } };
  validateContinuityFixture(workspace, fixture);
  for (const changed of [{ otherUser: { id: id(9) } }, { title: 'Ordinary Conversation' }, { is_group: false }, { isAccounting: true }, { clubId: id(6) }, { id: id(8) }]) assert.throws(() => validateContinuityFixture({ ...workspace, conversation: { ...workspace.conversation, ...changed } }, fixture));
  validateFreshContinuity(empty(), fixture);
  for (const field of ['draft', 'pin', 'position']) { const data = empty(); data.state[field].revision = 1; assert.throws(() => validateFreshContinuity(data, fixture)); }
  const saved = empty(); saved.saved.push({ messageId: fixture.messageId, conversationId: fixture.conversationId });
  assert.throws(() => validateFreshContinuity(saved, fixture));
});

test('history proof rejects duplicate, unrelated, unlabeled or unbounded rows', () => {
  const row = { id: fixture.messageId, conversation_id: fixture.conversationId, sender_id: '00000000-0000-0000-0000-000000000069', content: `${FIXTURE_TITLE}: Seed`, message_type: 'text' };
  validateHistory({ success: true, messages: [row] }, fixture, fixture.messageId);
  for (const messages of [[], [row, row], [{ ...row, conversation_id: id(9) }], [{ ...row, sender_id: id(9) }], [{ ...row, content: 'ordinary message' }], [{ ...row, message_type: 'invoice' }], Array.from({ length: 51 }, (_, i) => ({ ...row, id: id(i + 10) }))]) assert.throws(() => validateHistory({ success: true, messages }, fixture, fixture.messageId));
});

test('hosted continuity mode preserves defaults and reads only owning credential store', () => {
  const source = readFileSync('.github/workflows/e2e-tests.yml', 'utf8');
  assert.match(source, /options: \[full, messenger-live, messenger-send-live, messenger-continuity-live, reels-live, reels-reconciliation-audit, reels-reconciliation-apply\]/);
  assert.match(source, /default: full/);
  assert.match(source, /if: \$\{\{ inputs\.suite == 'full' \|\| inputs\.suite == '' \}\}/);
  assert.match(source, /run: node scripts\/ci\/messenger-continuity-live\.mjs/);
  assert.match(source, /MESSENGER_VERIFY_MODE: isolated-continuity/);
  for (const suffix of ['conversation_id', 'message_id', 'first_unread_id']) assert.ok(source.includes('${{ inputs.messenger_fixture_' + suffix + ' }}'));
  assert.match(source, /TEST_USER_PASSWORD: \$\{\{ secrets\.TEST_USER_PASSWORD \}\}/);
});

test('whole finite continuity probe persists, rejects stale changes and restores values using local transport only', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'messenger-continuity-finite-'));
  const originalFetch = globalThis.fetch;
  const oldEnv = Object.fromEntries([...Object.keys(env), 'MESSENGER_EVIDENCE_DIR'].map(key => [key, process.env[key]]));
  const oldExitCode = process.exitCode;
  const state = empty().state;
  let saved = null;
  const calls = [];
  const user = { id: '2d1cd6c3-5700-4af9-a271-d4863fdab20d', email: env.TEST_USER_EMAIL };
  const messages = Array.from({ length: 120 }, (_, index) => ({ id: index === 6 ? fixture.messageId : index === 10 ? fixture.firstUnreadId : id(100 + index), conversation_id: fixture.conversationId, sender_id: '00000000-0000-0000-0000-000000000069', message_type: 'text', content: `${FIXTURE_TITLE}: ${index + 1}`, created_at: new Date(Date.UTC(2026, 8, 27, 12, 0, index)).toISOString() }));
  const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  globalThis.fetch = async (address, options = {}) => {
    const url = new URL(address);
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ origin: url.origin, path: url.pathname, body });
    if (url.origin === AUTH_ORIGIN && url.pathname === '/auth/v1/token') return response({ access_token: 'local-fixture-token', refresh_token: 'local-fixture-refresh', expires_in: 3600, token_type: 'bearer', user });
    if (url.origin === AUTH_ORIGIN && url.pathname === '/auth/v1/user') return response(user);
    assert.equal(url.origin, APP_ORIGIN, 'All fixture transport must stay on the canonical mock origin');
    if (url.pathname === '/api/health') return response({ status: 'ok', commitSha: env.MESSENGER_EXPECTED_SHA, deploymentId: 'fixture-deployment' });
    if (url.pathname === '/api/messenger/get-conversations') return response({ success: true, workspace: 'social', conversation: { id: fixture.conversationId, title: FIXTURE_TITLE, is_group: true } });
    if (url.pathname === '/api/messenger/get-messages') {
      const start = body.after ? messages.findIndex(row => row.id === body.afterId) + 1 : 0;
      return response({ success: true, messages: messages.slice(start, start + 50), firstUnreadMessageId: fixture.firstUnreadId, hasNewer: start + 50 < messages.length });
    }
    assert.equal(url.pathname, '/api/messenger/continuity', 'Unexpected probe route');
    if (body.action === 'read') return response({ success: true, state, saved: saved?.saved ? [{ ...saved, message: messages[6] }] : [] });
    const current = body.field === 'saved' ? saved || { revision: 0, saved: false } : state[body.field];
    const old = body.field === 'saved' ? { messageId: fixture.messageId, saved: current.saved } : body.field === 'pin' ? current.value : Object.fromEntries(Object.entries(current).filter(([key]) => key !== 'revision'));
    const sameValue = JSON.stringify(old) === JSON.stringify(body.value);
    if (!sameValue && body.expectedRevision !== current.revision) return response({ success: false, field: body.field, revision: current.revision, value: old }, 409);
    const revision = current.revision + (sameValue ? 0 : 1);
    if (body.field === 'saved') saved = { ...body.value, conversationId: fixture.conversationId, revision };
    else state[body.field] = { ...(body.field === 'pin' ? { value: body.value } : body.value), revision };
    return response({ success: true, field: body.field, revision, value: body.value });
  };
  try {
    Object.assign(process.env, env, { MESSENGER_EVIDENCE_DIR: dir });
    await runContinuity();
    const receipt = JSON.parse(readFileSync(join(dir, 'result.json'), 'utf8'));
    assert.equal(receipt.status, 'passed', JSON.stringify(receipt));
    assert.equal(receipt.cleanup, 'baseline-values-restored-parent-owns-row-cleanup');
    assert.equal(receipt.history.uniqueMessages, 120);
    assert.equal(state.draft.text, ''); assert.equal(state.pin.value, false); assert.equal(state.position.messageId, null); assert.equal(saved.saved, false);
    assert.equal(calls.filter(call => call.body?.action === 'write').length, 10, 'Finite proof has six test writes and four exact restorations');
    assert.ok(calls.every(call => !call.path.includes('send-message') && !call.path.includes('mark-read')));
    assert.doesNotMatch(JSON.stringify(receipt), /local-fixture-token|local-fixture-refresh|fixture-value|Continuity Draft/);
  } finally {
    globalThis.fetch = originalFetch;
    process.exitCode = oldExitCode;
    for (const [key, value] of Object.entries(oldEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    rmSync(dir, { recursive: true, force: true });
  }
});
