import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ALERT_OWNER_ID, ROUTED_REASON, isOwnerOperationalPush,
  routeOperationalPushRows, routeQueuedOperationalPushes, enqueueOperationalPush,
} from '../src/lib/push/operational-push-routing.mjs';

const ordinary = '00000000-0000-0000-0000-000000000002';
const row = (id, event = 'engine_break_failed', owner = ALERT_OWNER_ID) => ({
  id: `00000000-0000-0000-0000-${String(id).padStart(12, '0')}`,
  recipient_user_id: owner, event, title: 'Engine Break Needs A Look', body: 'Original failure',
  status: 'processing', created_at: new Date().toISOString(), attempts: 1,
});

function database(initial = [], options = {}) {
  const tables = { push_outbox: initial.map((r) => ({ ...r })), push_dispatch_runs: [],
    notifications: options.notifications || [],
    push_subscriptions: [{ id: 'device', user_id: ordinary, is_active: true }] };
  const calls = [];
  const db = {
    tables, calls,
    async rpc(name) {
      if (name === 'requeue_stuck_push_outbox') return { data: 0 };
      if (name === 'claim_push_outbox_batch') return { data: tables.push_outbox.map((r) => ({ ...r })) };
      throw new Error(`Unexpected RPC ${name}`);
    },
    from(table) {
      let action = 'select', values, one = false;
      const filters = [];
      const q = {
        insert(v) { action = 'insert'; values = v; return q; },
        update(v) { action = 'update'; values = v; return q; },
        select() { return q; },
        maybeSingle() { one = true; return q; },
        eq(k, v) { filters.push((r) => r[k] === v); return q; },
        in(k, v) { filters.push((r) => v.includes(r[k])); return q; },
        or(value) {
          calls.push({ table, action: 'or', value });
          // Controlled query boundary. The behavioral checks also inspect the
          // actual emitted filter and ensure unrelated queue rows are untouched.
          filters.push((r) => isOwnerOperationalPush(r.recipient_user_id, r));
          return q;
        },
        order() { return q; },
        limit(value) { calls.push({ table, action: 'limit', value }); return q; },
        abortSignal() { return q; },
        then(resolve, reject) {
          try {
            calls.push({ table, action, values });
            if (table === 'notifications' && options.metadataError) {
              return Promise.resolve({ error: { message: 'metadata unavailable' } }).then(resolve, reject);
            }
            if (table === 'push_outbox' && action === 'select' && options.readError) {
              return Promise.resolve({ error: { message: 'read refused' } }).then(resolve, reject);
            }
            if (table === 'push_outbox' && action === 'select' && Object.hasOwn(options, 'readData')) {
              return Promise.resolve({ data: options.readData, error: null }).then(resolve, reject);
            }
            if (table === 'push_outbox' && action === 'insert' && options.insertError) {
              return Promise.resolve({ error: { message: 'insert refused' } }).then(resolve, reject);
            }
            if (table === 'push_outbox' && action === 'update' && options.updateError) {
              return Promise.resolve({ error: { message: 'update refused' } }).then(resolve, reject);
            }
            const entries = tables[table] || (tables[table] = []);
            let data;
            if (action === 'insert') {
              data = { id: 'run', ...values }; entries.push(data);
            } else {
              data = entries.filter((r) => filters.every((f) => f(r)));
              if (action === 'update') for (const r of data) Object.assign(r, values);
            }
            return Promise.resolve({ data: one ? (Array.isArray(data) ? data[0] : data) : data, error: null }).then(resolve, reject);
          } catch (error) { return Promise.reject(error).then(resolve, reject); }
        },
      };
      return q;
    },
  };
  return db;
}

function recorder(options = {}) {
  const events = [], receipts = new Map(), groups = [];
  const record = async (batch) => {
    groups.push(batch.length);
    if (options.fail) throw new Error('inbox unavailable');
    if (options.malformed) return [];
    return batch.map((event) => {
      events.push(structuredClone(event));
      if (!receipts.has(event.event_key)) receipts.set(event.event_key, receipts.size + 1);
      return receipts.get(event.event_key);
    });
  };
  return { events, receipts, groups, record };
}

// Load the actual entrypoint body, replacing only external imports. This
// executes its branching/ordering, not a copied routing implementation.
function entrypoint(path, exported, dependencies) {
  let source = readFileSync(new URL(path, import.meta.url), 'utf8');
  source = source.replace(/^import[^\n]+;\s*$/gm, '')
    .replace(/^export default[^\n]+;\s*$/gm, '').replace(/^export /gm, '');
  return new Function(...Object.keys(dependencies), `${source}\nreturn ${exported};`)(...Object.values(dependencies));
}

for (const event of ['financial_incident', 'financial_incident_resolved', 'financial_attestation',
  'engine_break_failed', 'engine_break_recovered', 'guarantee_bank_short', 'guarantee_bank_recovered', 'estate_digest']) {
  test(`${event} follows owner's destination without changing another recipient`, () => {
    assert.equal(isOwnerOperationalPush(ALERT_OWNER_ID, { event }), true);
    assert.equal(isOwnerOperationalPush(ordinary, { event }), false);
  });
}

test('legacy operational system titles are recognized without muting account or customer notices', () => {
  for (const title of ['Push Health Alert', 'Notifications May Not Be Reaching This Device', 'Horse Fleet Alert: stale', 'Horse Fleet Recovered: current']) {
    assert.equal(isOwnerOperationalPush(ALERT_OWNER_ID, { event: 'system', title }), true);
    assert.equal(isOwnerOperationalPush(ordinary, { event: 'system', title }), false);
  }
  for (const event of ['accounting_invoice', 'accounting_invoice_detail', 'new_message', 'waitlist_seat_open', 'financial_digest']) {
    assert.equal(isOwnerOperationalPush(ALERT_OWNER_ID, { event, title: 'Normal customer notice' }), false);
  }
  assert.equal(isOwnerOperationalPush(ALERT_OWNER_ID, { event: 'system', title: 'Notifications moved to another account' }), false);
});

test('all original notices reach the task separately before any digest, including recovery', async () => {
  const rows = [row(1), row(2), row(3, 'engine_break_recovered'), row(4, 'new_message', ordinary)];
  const db = database(rows), r = recorder();
  const result = await routeOperationalPushRows(db, rows, r.record);
  assert.equal(result.routed, 3);
  assert.deepEqual(result.remaining, [rows[3]]);
  assert.equal(new Set(r.events.map((e) => e.event_key)).size, 3);
  assert.equal(r.events[2].status, 'resolved');
  assert.equal(r.events[0].payload.target_task_id, '01a09b86-5ba8-7290-8657-1041f13dd3ca');
  assert.deepEqual(r.events[0].payload.original_push, rows[0]);
  assert.ok(db.tables.push_outbox.slice(0, 3).every((x) => x.status === 'skipped' && x.failure_reason === ROUTED_REASON));
});

test('legacy horse recovery keeps its resolved status and original evidence', async () => {
  const rows = [
    { ...row(31, 'system'), title: 'Horse Fleet Alert: heartbeat stale' },
    { ...row(32, 'system'), title: 'Horse Fleet Recovered: heartbeat current' },
    { ...row(33, 'system'), title: 'Push Health Alert', body: 'Recovered appears only in this body' },
  ];
  const db = database(rows), r = recorder();
  const result = await routeOperationalPushRows(db, rows, r.record);
  assert.equal(result.routed, 3);
  assert.deepEqual(result.remaining, []);
  assert.deepEqual(r.events.map((e) => e.status), ['firing', 'resolved', 'firing']);
  assert.deepEqual(r.events.map((e) => e.payload.original_push), rows);
  assert.equal(new Set(r.events.map((e) => e.event_key)).size, 3);
});

for (const unavailable of [false, true]) {
  test(`actual batch routing retains linked severity or explicit unresolved evidence; unavailable=${unavailable}`, async () => {
    const notification = { id: row(91).id, user_id: ALERT_OWNER_ID, type: 'engine_break_failed',
      title: 'Measured engine failure', message: 'Exact original evidence', data: { severity: 'critical' } };
    const original = { ...row(92), related_entity_id: notification.id, title: notification.title, body: notification.message };
    const db = database([original], { notifications: [notification], metadataError: unavailable }), r = recorder();
    const result = await routeOperationalPushRows(db, [original], r.record);
    assert.equal(result.routed, 1);
    assert.equal(r.events[0].severity, unavailable ? 'warning' : 'critical');
    assert.equal(r.events[0].payload.push_metadata.status, unavailable ? 'unresolved' : 'verified');
    assert.deepEqual(r.events[0].payload.original_push, original);
    assert.equal(db.tables.push_outbox[0].failure_reason, ROUTED_REASON);
  });
}

test('direct inbox fallback retains verified metadata when the outbox insert fails', async () => {
  const notification = { id: row(93).id, user_id: ALERT_OWNER_ID, type: 'engine_break_failed',
    title: 'Measured engine failure', message: 'Exact original evidence', data: { severity: 'critical' } };
  const db = database([], { insertError: true, notifications: [notification] }), r = recorder();
  const result = await enqueueOperationalPush(db, { userId: ALERT_OWNER_ID, event: notification.type,
    title: notification.title, body: notification.message, relatedEntityId: notification.id }, r.record);
  assert.equal(result.sent, false);
  assert.equal(result.reason, ROUTED_REASON);
  assert.equal(r.events[0].severity, 'critical');
  assert.equal(r.events[0].payload.push_metadata.notification_id, notification.id);
});

test('oversized dispatcher claim is split into actual inbox-sized receipt batches', async () => {
  const rows = Array.from({ length: 205 }, (_, i) => row(i + 1)), r = recorder();
  const result = await routeOperationalPushRows(database(rows), rows, r.record);
  assert.deepEqual(r.groups, [200, 5]);
  assert.equal(result.routed, 205);
  assert.equal(r.receipts.size, 205);
});

test('second-batch failure preserves the first 200 receipts and retries only the remaining rows', async () => {
  const rows = Array.from({ length: 205 }, (_, i) => row(i + 1)), db = database(rows);
  let calls = 0;
  const result = await routeOperationalPushRows(db, rows, async (batch) => {
    if (++calls === 2) throw new Error('second batch failed');
    return batch.map((_, i) => i + 1);
  });
  assert.equal(result.routed, 200); assert.equal(result.pending, 5);
  assert.deepEqual(result.remaining, []);
  assert.ok(db.tables.push_outbox.slice(0, 200).every((x) => x.status === 'skipped'));
  assert.ok(db.tables.push_outbox.slice(200).every((x) => x.status === 'pending'));
});

for (const kind of ['fail', 'malformed']) {
  test(`${kind} inbox leaves durable rows pending and never makes them phone-deliverable`, async () => {
    const rows = [row(1)], db = database(rows), r = recorder({ [kind]: true });
    const result = await routeOperationalPushRows(db, rows, r.record);
    assert.equal(result.routed, 0);
    assert.equal(result.pending, 1);
    assert.deepEqual(result.remaining, []);
    assert.equal(db.tables.push_outbox[0].status, 'pending');
    assert.equal(db.tables.push_outbox[0].failure_reason, 'operational_inbox_pending');
  });
}

test('failed finalization retries the same receipt identity and cannot fall through to push', async () => {
  const rows = [row(1)], options = { updateError: true }, db = database(rows, options), r = recorder();
  assert.equal((await routeOperationalPushRows(db, rows, r.record)).pending, 1);
  assert.equal(db.tables.push_outbox[0].status, 'processing');
  options.updateError = false;
  assert.equal((await routeOperationalPushRows(db, rows, r.record)).routed, 1);
  assert.equal(r.receipts.size, 1);
  assert.equal(r.events[0].event_key, r.events[1].event_key);
});

test('outbox failure uses a verified inbox receipt, never imaginary phone delivery', async () => {
  const db = database([], { insertError: true }), r = recorder();
  const result = await enqueueOperationalPush(db, { userId: ALERT_OWNER_ID, event: 'engine_break_failed' }, r.record);
  assert.equal(result.sent, false); assert.equal(result.accepted, 0);
  assert.equal(result.skipped, true); assert.equal(result.reason, ROUTED_REASON);
  assert.equal(result.outboxId, null); assert.equal(r.receipts.size, 1);
});

test('failure of both durable destinations reports failure without a phone fallback', async () => {
  const result = await enqueueOperationalPush(database([], { insertError: true }),
    { userId: ALERT_OWNER_ID, event: 'engine_break_failed' }, recorder({ fail: true }).record);
  assert.equal(result.sent, false); assert.equal(result.skipped, false);
  assert.equal(result.reason, 'operational_persistence_failed');
});

test('actual inline entrypoint routes even force:true and absent push credentials before any device lookup', async () => {
  const db = database(), r = recorder(); let providerCalls = 0;
  const forbiddenGate = () => { throw new Error('operational path reached customer gate'); };
  const enqueue = entrypoint('../src/lib/push/push-enqueue.js', 'enqueuePush', {
    deliverPushNow: () => { providerCalls++; }, loadGateContext: forbiddenGate,
    gateDecision: forbiddenGate, needsDailyCount: forbiddenGate, countSentToday: forbiddenGate,
    isPushConfigured: () => false, isOwnerOperationalPush,
    enqueueOperationalPush: (client, args) => enqueueOperationalPush(client, args, r.record),
  });
  const result = await enqueue(db, { userId: ALERT_OWNER_ID, event: 'system', title: 'Push Health Alert', force: true });
  assert.equal(result.reason, ROUTED_REASON); assert.equal(result.sent, false);
  assert.equal(providerCalls, 0); assert.equal(r.events.length, 1);
  assert.ok(db.calls.every((x) => x.table !== 'push_subscriptions'));
});

for (const owner of [ALERT_OWNER_ID.toUpperCase(), ALERT_OWNER_ID.replace(/-/g, ''), `{${ALERT_OWNER_ID}}`, '4796-5354-0e56-43ef-931c-ddaa-b82a-f765']) {
test(`caller-supplied owner UUID cannot bypass operational routing: ${owner}`, async () => {
  const db = database(), r = recorder();
  const forbidden = () => { throw new Error('owner operational notice reached a phone path'); };
  const enqueue = entrypoint('../src/lib/push/push-enqueue.js', 'enqueuePush', {
    deliverPushNow: forbidden, loadGateContext: forbidden, gateDecision: forbidden,
    needsDailyCount: forbidden, countSentToday: forbidden, isPushConfigured: () => true,
    isOwnerOperationalPush,
    enqueueOperationalPush: (client, args) => enqueueOperationalPush(client, args, r.record),
  });
  const result = await enqueue(db, { userId: owner, event: 'engine_break_failed', force: true });
  assert.equal(result.sent, false);
  assert.equal(result.reason, ROUTED_REASON);
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].payload.original_push.recipient_user_id, owner);
  assert.equal(isOwnerOperationalPush(owner, { event: 'new_message' }), false);
  assert.equal(isOwnerOperationalPush(ordinary.toUpperCase(), { event: 'engine_break_failed' }), false);
});
}

for (const [userId, event] of [[ALERT_OWNER_ID, 'new_message'], [ordinary, 'engine_break_failed']]) {
  test(`actual inline customer delivery is preserved for ${userId}/${event}`, async () => {
    const db = database(); let providerCalls = 0;
    const enqueue = entrypoint('../src/lib/push/push-enqueue.js', 'enqueuePush', {
      deliverPushNow: async () => { providerCalls++; return { accepted: 1, errors: [] }; },
      loadGateContext: async () => new Map(), gateDecision: () => ({ allowed: true }),
      needsDailyCount: () => false, countSentToday: async () => 0,
      isPushConfigured: () => true, isOwnerOperationalPush,
      enqueueOperationalPush: () => { throw new Error('customer notification was rerouted'); },
    });
    const result = await enqueue(db, { userId, event, title: 'Ordinary notification' });
    assert.equal(result.sent, true); assert.equal(result.accepted, 1);
    assert.equal(providerCalls, 1);
  });
}

for (const failed of [false, true]) {
  test(`actual dispatcher routes before stale/quiet/digest gates; inbox failed=${failed}`, async () => {
    const rows = [row(1), row(2), row(3)];
    rows[0].created_at = '2026-09-06T16:30:00Z';
    const db = database(rows), r = recorder({ fail: failed }); let providerCalls = 0;
    const dispatch = entrypoint('../pages/api/cron/push-dispatch.js', 'handler', {
      createClient: () => db, validateCronAuth: () => true, withCronHealth: (name, fn) => fn,
      isPushConfigured: () => true, sendPush: () => { providerCalls++; }, SUBSCRIPTION_COLUMNS: 'id',
      recordSendFailure: () => { throw new Error('not a device failure'); },
      routeOperationalPushRows: (client, claimed) => routeOperationalPushRows(client, claimed, r.record),
      isTournamentReminder: () => false, deliverTournamentReminder: () => { throw new Error('not a customer reminder'); },
      loadGateContext: async () => new Map(), gateDecision: () => ({ allowed: false }),
      needsDailyCount: () => false, countSentTodayBatch: async () => new Map(),
    });
    const response = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await dispatch({}, response);
    assert.equal(response.code, failed ? 503 : 200);
    assert.equal(response.body.sent, 0); assert.equal(response.body.digested, 0);
    assert.equal(providerCalls, 0);
    assert.equal(response.body[failed ? 'failed' : 'skipped'], 3);
    assert.equal(r.events.length, failed ? 0 : 3);
  });
}

for (const fault of [null, 'inbox', 'query', 'null', 'object']) {
  test(`unconfigured dispatcher still routes operational originals without touching customer retries; fault=${fault}`, async () => {
    const operational = { ...row(71, 'system'), title: 'Horse Fleet Recovered: current', attempts: 5 };
    const customer = { ...row(72, 'new_message', ALERT_OWNER_ID), status: 'pending', attempts: 4 };
    const otherOwner = { ...row(73, 'engine_break_failed', ordinary), status: 'pending', attempts: 3 };
    const rows = [operational, customer, otherOwner];
    const options = { readError: fault === 'query' };
    if (fault === 'null') options.readData = null;
    if (fault === 'object') options.readData = {};
    const db = database(rows, options), r = recorder({ fail: fault === 'inbox' });
    db.rpc = () => { throw new Error('unconfigured provider consumed queue claims'); };
    const forbidden = () => { throw new Error('unconfigured provider reached customer delivery'); };
    const dispatch = entrypoint('../pages/api/cron/push-dispatch.js', 'handler', {
      createClient: () => db, validateCronAuth: () => true, withCronHealth: (name, fn) => fn,
      isPushConfigured: () => false, sendPush: forbidden, SUBSCRIPTION_COLUMNS: 'id',
      recordSendFailure: forbidden, routeOperationalPushRows: forbidden,
      routeQueuedOperationalPushes: (client) => routeQueuedOperationalPushes(client, r.record),
      isTournamentReminder: forbidden, deliverTournamentReminder: forbidden,
      loadGateContext: forbidden, gateDecision: forbidden, needsDailyCount: forbidden, countSentTodayBatch: forbidden,
    });
    const response = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await dispatch({}, response);
    assert.equal(response.code, fault ? 503 : 200);
    assert.equal(response.body.sent, 0);
    assert.equal(response.body.claimed, 0);
    assert.equal(r.events.length, fault ? 0 : 1);
    if (!fault) {
      assert.equal(r.events[0].event_key, operational.id);
      assert.equal(r.events[0].status, 'resolved');
    }
    assert.deepEqual(db.tables.push_outbox.slice(1), [customer, otherOwner]);
    assert.equal(db.tables.push_outbox[0].attempts, 5);
    assert.ok(db.calls.every((x) => x.table !== 'push_subscriptions'));
    assert.equal(db.calls.find((x) => x.action === 'limit').value, 300);
    const filter = db.calls.find((x) => x.action === 'or').value;
    assert.ok(filter.includes('event.in.(financial_incident,financial_incident_resolved,financial_attestation,engine_break_failed,engine_break_recovered,guarantee_bank_short,guarantee_bank_recovered,estate_digest)'));
    assert.ok(filter.includes('and(event.eq.system,or(title.eq.Push Health Alert,title.eq.Notifications May Not Be Reaching This Device,title.like.Horse Fleet Alert: *,title.like.Horse Fleet Recovered: *))'));
  });
}
