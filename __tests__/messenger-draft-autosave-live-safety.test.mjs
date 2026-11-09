/*
 * The draft-autosave probe may only ever touch its own fixture (2026-11-09).
 *
 * The probe signs in as the designated test identity against the published
 * app, so its request allowlist is the thing standing between a verification
 * run and a real person's conversation. These run offline.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { APP_ORIGIN, AUTH_ORIGIN } from '../scripts/ci/messenger-live-configuration.mjs';
import { FIXTURE_TITLE, SURFACE_DEBOUNCE_MS, draftConfiguration, allowedDraftRequest } from '../scripts/ci/messenger-draft-autosave-live.mjs';

const id = n => `00000000-0000-5000-8000-${String(n).padStart(12, '0')}`;
const env = {
  TEST_USER_EMAIL: 'fixture@example.invalid', TEST_USER_PASSWORD: 'fixture-value',
  NEXT_PUBLIC_SUPABASE_URL: AUTH_ORIGIN, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture-key',
  MESSENGER_EXPECTED_SHA: 'a'.repeat(40), MESSENGER_VERIFY_MODE: 'isolated-draft-autosave',
  MESSENGER_FIXTURE_CONVERSATION_ID: id(1), MESSENGER_FIXTURE_SECOND_CONVERSATION_ID: id(2),
};
const fixture = draftConfiguration(env);
const route = APP_ORIGIN + '/api/messenger/continuity';
const write = (conversationId, text, expectedRevision = 0) => ({ action: 'write', conversationId, field: 'draft', expectedRevision, value: { text, replyToId: null } });
const allow = (method, url, body) => allowedDraftRequest(method, url, body, fixture);

test('configuration demands the explicit mode and two distinct fixture conversations', () => {
  assert.throws(() => draftConfiguration({ ...env, MESSENGER_VERIFY_MODE: 'isolated-continuity' }));
  assert.throws(() => draftConfiguration({ ...env, MESSENGER_FIXTURE_SECOND_CONVERSATION_ID: id(1) }));
  assert.throws(() => draftConfiguration({ ...env, MESSENGER_FIXTURE_SECOND_CONVERSATION_ID: 'not-a-uuid' }));
  assert.throws(() => draftConfiguration({ ...env, TEST_USER_PASSWORD: '' }));
  assert.equal(SURFACE_DEBOUNCE_MS, 600);
});

const social = { workspace: 'social', folder: 'messages' };

test('both read shapes the controller sends are permitted, and only for owned scope', () => {
  // A refused read is indistinguishable from an empty draft, so the allowlist
  // must admit exactly what the controller sends: one conversation, or the
  // whole social workspace.
  assert.equal(allow('POST', route, { action: 'read', conversationId: fixture.a, workspace: social }), true);
  assert.equal(allow('POST', route, { action: 'read', conversationId: fixture.b, workspace: social }), true);
  assert.equal(allow('POST', route, { action: 'read', workspace: social }), true);
  assert.equal(allow('POST', route, { action: 'read', conversationId: id(99), workspace: social }), false);
  assert.equal(allow('POST', route, { action: 'read', workspace: { workspace: 'club', clubId: id(5) } }), false);
  assert.equal(allow('POST', route, { action: 'read', conversationId: fixture.a, workspace: social, savedCursor: {} }), false);
  assert.equal(allow('POST', route, write(id(99), `${FIXTURE_TITLE}: x`)), false);
});

test('only the draft field, only labelled text, and never another endpoint or origin', () => {
  assert.equal(allow('POST', route, write(fixture.a, `${FIXTURE_TITLE}: x`)), true);
  assert.equal(allow('POST', route, write(fixture.a, '')), true, 'clearing a draft is part of the contract');
  assert.equal(allow('POST', route, write(fixture.a, 'unlabelled text')), false);
  assert.equal(allow('POST', route, { ...write(fixture.a, `${FIXTURE_TITLE}: x`), field: 'pin' }), false);
  assert.equal(allow('POST', route, { ...write(fixture.a, `${FIXTURE_TITLE}: x`), field: 'saved' }), false);
  assert.equal(allow('POST', route, { ...write(fixture.a, `${FIXTURE_TITLE}: x`), value: { text: `${FIXTURE_TITLE}: x`, replyToId: id(3) } }), false);
  assert.equal(allow('POST', route, { ...write(fixture.a, `${FIXTURE_TITLE}: x`), expectedRevision: -1 }), false);
  assert.equal(allow('GET', route, { action: 'read', conversationId: fixture.a }), false);
  assert.equal(allow('POST', APP_ORIGIN + '/api/messenger/delete-conversation', { conversationId: fixture.a }), false);
  assert.equal(allow('POST', APP_ORIGIN + '/api/messenger/mark-read', { conversationId: fixture.a }), false);
  assert.equal(allow('POST', 'https://example.invalid/api/messenger/continuity', { action: 'read', conversationId: fixture.a }), false);
  assert.equal(allow('POST', route + '?x=1', { action: 'read', conversationId: fixture.a }), false);
});

test('the one send may only reach fixture A with labelled content', () => {
  const send = APP_ORIGIN + '/api/messenger/send-message';
  assert.equal(allow('POST', send, { conversationId: fixture.a, content: `${FIXTURE_TITLE}: Sent 1` }), true);
  assert.equal(allow('POST', send, { conversationId: fixture.b, content: `${FIXTURE_TITLE}: Sent 1` }), false);
  assert.equal(allow('POST', send, { conversationId: fixture.a, content: 'hello' }), false);
  assert.equal(allow('POST', send, { conversationId: id(99), content: `${FIXTURE_TITLE}: Sent 1` }), false);
});

test('the CLI fails closed before any network call and writes a sanitized receipt', () => {
  const dir = mkdtempSync(join(tmpdir(), 'messenger-draft-autosave-'));
  try {
    const result = spawnSync(process.execPath, ['scripts/ci/messenger-draft-autosave-live.mjs'],
      { env: { PATH: process.env.PATH, MESSENGER_EVIDENCE_DIR: dir }, encoding: 'utf8', timeout: 20000 });
    assert.ifError(result.error);
    assert.equal(result.status, 1, 'an unconfigured run must fail');
    const receipt = JSON.parse(readFileSync(join(dir, 'result.json'), 'utf8'));
    assert.equal(receipt.status, 'failed');
    assert.ok(receipt.error, 'the receipt names why it refused');
    const text = JSON.stringify(receipt);
    assert.equal(/fixture-value|password|anon-key|Bearer |eyJ/i.test(text), false, 'no credential may reach the receipt');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
