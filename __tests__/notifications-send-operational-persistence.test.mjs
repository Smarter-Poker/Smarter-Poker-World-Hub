import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { enqueueOperationalPush, ALERT_OWNER_ID } from '../src/lib/push/operational-push-routing.mjs';

const ordinary = '00000000-0000-4000-8000-000000000002';
const queuedUser = '00000000-0000-4000-8000-000000000003';
const mutedUser = '00000000-0000-4000-8000-000000000004';
const routedUser = '00000000-0000-4000-8000-000000000005';

// Execute the real endpoint body with controlled dependency boundaries. No
// network, notification provider, environment secret, or database is used.
function endpoint(enqueuePush, overrides = {}) {
  const source = readFileSync(new URL('../pages/api/notifications/send.js', import.meta.url), 'utf8')
    .replace(/^import[^\n]+;\s*$/gm, '')
    .replace('export default async function handler', 'async function handler');
  const deps = {
    createClient: () => ({}),
    getServerUserWithFallback: async () => ({ user: null }),
    applyRateLimit: () => true, LIMITS: { write: {} }, reportApiError: () => {},
    enqueuePush, isPushConfigured: () => true, LEGACY_PREF_COLUMNS: [],
    process: { env: { ADMIN_ROUTE_SECRET: 'fixture-admin' } },
    ...overrides,
  };
  return new Function(...Object.keys(deps), `${source}\nreturn handler;`)(...Object.values(deps));
}

function request(externalUserIds = [ALERT_OWNER_ID]) {
  return { method: 'POST', headers: { 'x-admin-secret': 'fixture-admin' },
    body: { externalUserIds, title: 'Engine Break Needs A Look',
      message: 'Original operational failure', event: 'engine_break_failed' } };
}

function response() {
  return { status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; } };
}

function refusedOutbox() {
  return { from(name) {
    assert.equal(name, 'push_outbox');
    return { insert() { return this; }, select() { return this; },
      async maybeSingle() { return { error: { message: 'private database diagnostic' } }; } };
  } };
}

const noDurableStore = async (_db, args) => enqueueOperationalPush(refusedOutbox(), args,
  async () => { throw new Error('private inbox diagnostic'); });

test('both real operational stores failing returns retryable failure, never a queued receipt', async () => {
  const res = response();
  await endpoint(noDurableStore)(request(), res);
  assert.equal(res.code, 503);
  assert.equal(res.body.success, false);
  assert.equal(res.body.code, 'operational_persistence_failed');
  assert.equal(res.body.retryable, true);
  assert.equal(res.body.failed, 1);
  assert.deepEqual(res.body.failedUserIds, [ALERT_OWNER_ID]);
  assert.equal(res.body.delivered, 0);
  assert.equal(res.body.queued, 0);
  assert.equal(res.body.skipped, 0);
  assert.equal(res.body.notificationId, null);
  assert.doesNotMatch(JSON.stringify(res.body), /private (database|inbox) diagnostic/);
});

test('partial persistence failure retains delivered, queued and skipped counts and identifies only failed targets', async () => {
  const successful = new Map([
    [ordinary, { sent: true, skipped: false, outboxId: 'delivered-id', reason: 'delivered' }],
    [queuedUser, { sent: false, skipped: false, outboxId: 'queued-id', reason: 'queued_for_retry' }],
    [mutedUser, { sent: false, skipped: true, outboxId: null, reason: 'user_disabled' }],
    [routedUser, { sent: false, skipped: true, outboxId: 'routed-id', reason: 'operational_routed_to_codex' }],
  ]);
  const res = response();
  await endpoint((db, args) => args.userId === ALERT_OWNER_ID ? noDurableStore(db, args) : successful.get(args.userId))(
    request([ordinary, ALERT_OWNER_ID, queuedUser, mutedUser, routedUser]), res);
  assert.equal(res.code, 503);
  assert.equal(res.body.success, false);
  assert.equal(res.body.recipients, 1);
  assert.equal(res.body.delivered, 1);
  assert.equal(res.body.queued, 1);
  assert.equal(res.body.skipped, 2);
  assert.equal(res.body.failed, 1);
  assert.deepEqual(res.body.failedUserIds, [ALERT_OWNER_ID]);
  assert.equal(res.body.notificationId, 'delivered-id');
});

test('an inbox receipt after outbox failure remains accepted without reporting a phone send', async () => {
  const res = response();
  await endpoint((_db, args) => enqueueOperationalPush(refusedOutbox(), args, async () => [123]))(request(), res);
  assert.equal(res.code, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.delivered, 0);
  assert.equal(res.body.queued, 0);
  assert.equal(res.body.skipped, 1);
  assert.equal(res.body.failed, undefined);
});

test('a durable outbox awaiting inbox delivery is truthfully queued', async () => {
  const res = response();
  await endpoint(async () => ({ sent: false, skipped: false, outboxId: 'durable-id', reason: 'operational_inbox_pending' }))(request(), res);
  assert.equal(res.code, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.queued, 1);
  assert.equal(res.body.notificationId, 'durable-id');
});

test('ordinary successful, queued and muted recipient behavior stays unchanged', async () => {
  const res = response();
  const outcomes = [{ sent: true, skipped: false, outboxId: 'ordinary-id' },
    { sent: false, skipped: false, outboxId: 'ordinary-queued-id' }, { sent: false, skipped: true }];
  await endpoint(async () => outcomes.shift())(request([ordinary, queuedUser, mutedUser]), res);
  assert.equal(res.code, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.delivered, 1);
  assert.equal(res.body.queued, 1);
  assert.equal(res.body.skipped, 1);
  assert.equal(res.body.failed, undefined);
});

test('authentication refusal occurs before enqueue', async () => {
  const req = request(); req.headers = {};
  const res = response();
  await endpoint(() => { throw new Error('unauthenticated enqueue'); })(req, res);
  assert.equal(res.code, 401);
});
