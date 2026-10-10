import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { APP_ORIGIN, AUTH_ORIGIN, allowMutation } from '../scripts/ci/messenger-live-check.mjs';
import { FIXTURE_TITLE, sendConfiguration, allowedSendRequest, validateFixture, verifyPersistedSend } from '../scripts/ci/messenger-send-live-check.mjs';

const id = '00000000-0000-4000-8000-000000000001';
const requestId = '00000000-0000-4000-8000-000000000002';
const other = '00000000-0000-4000-8000-000000000003';
const env = { TEST_USER_EMAIL: 'fixture@example.invalid', TEST_USER_PASSWORD: 'local-fixture-value', NEXT_PUBLIC_SUPABASE_URL: AUTH_ORIGIN, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-fixture-key', MESSENGER_EXPECTED_SHA: 'a'.repeat(40), MESSENGER_VERIFY_MODE: 'isolated-send', MESSENGER_FIXTURE_CONVERSATION_ID: id, MESSENGER_REQUEST_ID: requestId };
const expected = sendConfiguration(env);
const url = APP_ORIGIN + '/api/messenger/send-message';

test('actual send entry points reach configuration validation and retain a receipt', () => {
  for (const args of [['scripts/ci/messenger-live-check.mjs', '--isolated-send'], ['scripts/ci/messenger-send-live-check.mjs']]) {
    const evidenceDir = mkdtempSync(join(tmpdir(), 'messenger-probe-entry-'));
    try {
      const result = spawnSync(process.execPath, args, {
        env: { PATH: process.env.PATH, MESSENGER_EVIDENCE_DIR: evidenceDir },
        encoding: 'utf8', timeout: 5000,
      });
      assert.ifError(result.error);
      assert.equal(result.status, 1, result.stderr);
      assert.doesNotMatch(result.stderr, /unsettled top-level await/);
      const receipt = JSON.parse(readFileSync(join(evidenceDir, 'result.json'), 'utf8'));
      assert.equal(receipt.status, 'failed');
      assert.match(receipt.failure, /TEST_USER_EMAIL is required/);
    } finally {
      rmSync(evidenceDir, { recursive: true, force: true });
    }
  }
});

test('send mode requires explicit fixture, operation identity, mode and exact deployed revision', () => {
  for (const field of ['MESSENGER_VERIFY_MODE', 'MESSENGER_FIXTURE_CONVERSATION_ID', 'MESSENGER_REQUEST_ID', 'MESSENGER_EXPECTED_SHA', 'TEST_USER_EMAIL', 'TEST_USER_PASSWORD']) {
    assert.throws(() => sendConfiguration({ ...env, [field]: '' }));
  }
  assert.throws(() => sendConfiguration({ ...env, NEXT_PUBLIC_SUPABASE_URL: 'https://example.invalid' }));
  assert.throws(() => sendConfiguration({ ...env, MESSENGER_FIXTURE_CONVERSATION_ID: 'ordinary-name' }));
  assert.throws(() => sendConfiguration({ ...env, MESSENGER_REQUEST_ID: 'new-each-time' }));
  assert.equal(expected.content, `${FIXTURE_TITLE}: Idempotent Send ${requestId}`);
});

test('send guard permits only exact bounded plain text payload to exact canonical route', () => {
  assert.equal(allowedSendRequest('POST', url, expected, expected), true);
  const rejected = [
    { ...expected, conversationId: other }, { ...expected, requestId: other },
    { ...expected, content: 'ordinary message' }, { ...expected, message_type: 'image' },
    { ...expected, media_metadata: { recipientId: other } }, { ...expected, media_metadata: [] },
    { ...expected, media_metadata: null }, { ...expected, recipientId: other },
    { ...expected, userId: other }, null,
  ];
  for (const body of rejected) assert.equal(allowedSendRequest('POST', url, body, expected), false);
  for (const route of [url + '?recipient=other', APP_ORIGIN + '/api/messenger/start-conversation', 'https://example.invalid/api/messenger/send-message']) assert.equal(allowedSendRequest('POST', route, expected, expected), false);
  assert.equal(allowedSendRequest('PUT', url, expected, expected), false);
  assert.equal(allowedSendRequest('POST', url, expected, {}), false);
});

test('normal read verifier still refuses every send', () => {
  assert.equal(allowMutation('POST', url, expected, new Map(), new Set()), false);
});

test('send fixture must be labeled, nonaccounting and show no other recipient', () => {
  const fixture = { success: true, conversation: { id, title: FIXTURE_TITLE, is_group: true, isAccounting: false, clubId: null, otherUser: null } };
  validateFixture(fixture, expected);
  for (const changes of [{ id: other }, { title: 'Ordinary Conversation' }, { is_group: false }, { otherUser: { id: other } }, { isAccounting: true }, { clubId: other }]) assert.throws(() => validateFixture({ ...fixture, conversation: { ...fixture.conversation, ...changes } }, expected));
});

test('persisted proof rejects duplicates, mismatched senders, wrong identity and incomplete history', () => {
  const row = { id: other, conversation_id: id, sender_id: id, request_id: requestId, content: expected.content, message_type: 'text' };
  assert.equal(verifyPersistedSend([row], expected, id), other);
  assert.throws(() => verifyPersistedSend([], expected, id));
  assert.throws(() => verifyPersistedSend([row, row], expected, id));
  assert.throws(() => verifyPersistedSend(Array(50).fill(row), expected, id));
  for (const changes of [{ sender_id: other }, { conversation_id: other }, { content: 'different' }, { message_type: 'image' }, { id: 'temporary' }]) assert.throws(() => verifyPersistedSend([{ ...row, ...changes }], expected, id));
  assert.throws(() => verifyPersistedSend([row], expected, id, requestId));
});

test('hosted suite uses existing configured credential store with explicit isolated-send inputs', () => {
  const source = readFileSync('.github/workflows/e2e-tests.yml', 'utf8');
  assert.match(source, /options: \[full, horses-phase9-postgrest, messenger-live, messenger-send-live, messenger-continuity-live, reels-live, video-operations-live, social-card-live, social-feed-normal-live, reels-reconciliation-audit, reels-reconciliation-apply\]/);
  assert.match(source, /if: \$\{\{ inputs\.suite == 'full' \|\| inputs\.suite == '' \}\}/);
  assert.match(source, /MESSENGER_FIXTURE_CONVERSATION_ID: \$\{\{ inputs\.messenger_fixture_conversation_id \}\}/);
  assert.match(source, /MESSENGER_REQUEST_ID: \$\{\{ inputs\.messenger_request_id \}\}/);
  assert.match(source, /MESSENGER_VERIFY_MODE: isolated-send/);
  assert.match(source, /TEST_USER_PASSWORD: \$\{\{ secrets\.TEST_USER_PASSWORD \}\}/);
});
