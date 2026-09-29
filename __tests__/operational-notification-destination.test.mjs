import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ALERT_TASK_ID } from '../src/lib/operationalAlerts.mjs';
import { notificationCache, readNotificationCache } from '../src/lib/notificationVisibility.mjs';
import { ALERT_OWNER_ID, ROUTED_REASON, isOwnerOperationalNotification, retryOwnerNotificationDestination }
  from '../src/lib/push/operational-push-routing.mjs';

// Executes the real gateway with controlled I/O. This cannot qualify database
// triggers, RLS, Realtime or the actual installed loader; those are separate
// mandatory checks in the destination component's qualification contract.
const NOTIFY_SOURCE = readFileSync(new URL('../src/lib/notify.js', import.meta.url), 'utf8');
const DESTINATIONS = 'operational_notification_destinations';
// What the column default (gen_random_uuid()) gives a row sent without an id.
const DEFAULT_ID = '33333333-3333-4333-8333-333333333333';
// What the gateway's randomUUID() chooses for an owner-operational notice.
const CHOSEN_ID = '44444444-4444-4444-8444-444444444444';
const OTHER = '22222222-2222-4222-8222-222222222222';

// The harness strips notify.js's imports and injects these bindings instead,
// so deleting an import would still pass here and throw in production. Each
// one is pinned to its module by the import tests below.
const IMPORTS = {
  randomUUID: 'node:crypto',
  enqueuePush: './push/push-enqueue',
  isOwnerOperationalNotification: './push/operational-push-routing.mjs',
  retryOwnerNotificationDestination: './push/operational-push-routing.mjs',
  ROUTED_REASON: './push/operational-push-routing.mjs',
  ALERT_TASK_ID: './operationalAlerts.mjs',
};

// A PostgREST stand-in for the requests the gateway makes.
//
// The notifications INSERT keeps an id the caller sends (PostgREST echoes it)
// and otherwise gets DEFAULT_ID. The database captures an owner-operational
// original into its destination. Before Club Arena's store-only delivery is
// installed the capture returns NEW, so the row is written and returned; with
// `storeOnly` it returns NULL, so nothing is written or returned. A body comes
// back only when .select() asked for one (otherwise return=minimal: data null).
// Awaiting the chain is a plural request. A singular one - .single(), and the
// fake gives .maybeSingle() the postgrest-js 1.x wire behaviour so the gateway
// is held to the strictest client - gets PostgREST's answer: zero rows is a
// 406 (PGRST116) and the whole transaction is rolled back, capture included.
//
// Options:
//   storeOnly        store-only delivery is installed
//   insertError      PostgREST answers the insert with an error
//   insertThrows     the insert request itself rejects
//   committed        with insertError/insertThrows: the transaction had
//                    committed and only the response was lost
//   invalidInsertId  the row comes back with an id nobody sent
//   lookupError, missing, wrongId, wrongTask, invalidReceipt, pending:
//                    what the destination read answers
//   retrySucceeds    the bounded retry records the pending receipt
function gateway(options = {}) {
  const calls = [], sent = [], originals = [], violations = [];
  // A request the database would not answer this way is recorded here, not
  // thrown: notify() catches everything, which would hide the reason.
  const check = (holds, message) => { if (!holds) violations.push(message); };
  const db = { id: null, captured: false };
  const client = {
    rpc(name, args) {
      calls.push({ rpc: name, args });
      check(name === 'fn_retry_owner_notification_destination', `unexpected rpc ${name}`);
      check(args?.p_notification_id === db.id,
        `retry named ${args?.p_notification_id}, not the original the gateway inserted (${db.id})`);
      return { abortSignal(signal) {
        check(signal?.aborted === false, 'the retry is bounded');
        // fn_try_record_owner_notification reads the destination INTO STRICT.
        if (!db.captured) return Promise.resolve({ data: null, error: { message: 'query returned no rows' } });
        return Promise.resolve({ data: { notification_id: args.p_notification_id, target_task_id: ALERT_TASK_ID,
          inbox_event_id: options.retrySucceeds ? 101 : null }, error: null });
      } };
    },
    from(table) {
      const call = { table }; calls.push(call);
      let routed = false;
      const insertReply = (singular) => {
        if (options.insertThrows) return Promise.reject(new Error('socket hang up'));
        if (options.insertError) return Promise.resolve({ data: null, error: { message: 'original persistence refused' } });
        const rows = options.storeOnly && routed ? [] : [{ id: options.invalidInsertId ? 'invalid' : db.id }];
        if (!singular) return Promise.resolve({ data: call.selected ? rows : null, error: null });
        if (rows.length !== 1) {
          db.captured = false; // PostgREST condemns the transaction: capture and receipt are gone
          return Promise.resolve({ data: null,
            error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } });
        }
        return Promise.resolve({ data: call.selected ? rows[0] : null, error: null });
      };
      const chain = {
        insert(value) {
          call.insert = value; originals.push(value);
          routed = isOwnerOperationalNotification(value.user_id, value);
          db.id = value.id ?? DEFAULT_ID;
          db.captured = routed && (!(options.insertError || options.insertThrows) || options.committed === true);
          return chain;
        },
        select(columns) { call.selected = columns; return chain; },
        eq(key, value) { (call.filters ||= []).push([key, value]); return chain; },
        abortSignal(signal) { check(signal?.aborted === false, `${table} read is bounded`); call.bounded = true; return chain; },
        then(resolve, reject) {
          if (table !== 'notifications') {
            check(false, `unexpected plural read of ${table}`);
            return Promise.reject(new Error(`unexpected plural read of ${table}`)).then(resolve, reject);
          }
          call.plural = true;
          return insertReply(false).then(resolve, reject);
        },
        single() { call.singular = '.single()'; return insertReply(true); },
        maybeSingle() {
          if (table === 'notifications') { call.singular = '.maybeSingle()'; return insertReply(true); }
          check(table === DESTINATIONS, `unexpected singular read of ${table}`);
          check(call.bounded === true, 'the destination read is bounded');
          check(JSON.stringify(call.filters) === JSON.stringify([['notification_id', db.id], ['target_task_id', ALERT_TASK_ID]]),
            `destination read by ${JSON.stringify(call.filters)}, not by the original the gateway inserted (${db.id})`);
          if (options.lookupError) return Promise.resolve({ data: null, error: { message: 'destination read refused' } });
          if (options.missing || !db.captured) return Promise.resolve({ data: null, error: null });
          return Promise.resolve({ data: { notification_id: options.wrongId ? 'wrong' : db.id,
            target_task_id: options.wrongTask ? 'wrong' : ALERT_TASK_ID,
            inbox_event_id: options.pending ? null : options.invalidReceipt ? -1 : 100 }, error: null });
        },
      };
      return chain;
    },
  };
  const injected = {
    randomUUID: () => CHOSEN_ID,
    enqueuePush: async (...args) => { sent.push(args); return { sent: true }; },
    isOwnerOperationalNotification, retryOwnerNotificationDestination, ROUTED_REASON, ALERT_TASK_ID,
  };
  assert.deepEqual(Object.keys(injected).sort(), Object.keys(IMPORTS).sort());
  const dependencies = { ...injected, console: { warn() {} } };
  const source = NOTIFY_SOURCE
    .replace(/^import[^\n]+;\s*$/gm, '')
    .replace(/^export default[^\n]+;\s*$/gm, '').replace(/^export /gm, '');
  const notify = new Function(...Object.keys(dependencies), `${source}\nreturn notify;`)(...Object.values(dependencies));
  return {
    notify: async (args) => {
      const out = await notify(client, args);
      assert.deepEqual(violations, []);
      return out;
    },
    calls, sent, originals,
  };
}

const rpcArgs = (g) => g.calls.filter((call) => call.rpc).map((call) => call.args);
const destinationReads = (g) => g.calls.filter((call) => call.table === DESTINATIONS);

for (const withPush of [true, false]) {
  for (const item of [
    { type: 'system', title: 'Push Health Alert' },
    { type: 'system', title: 'Notifications May Not Be Reaching This Device' },
    { type: 'financial_incident', title: 'Chip drift' },
    { type: 'financial_incident_resolved', title: 'Chip drift recovered' },
    { type: 'system', title: 'Horse Fleet Recovered: heartbeat' },
    { type: 'system', title: 'Engine fault', data: { component: 'club-arena-engine', alertname: 'EngineFault' } },
  ]) {
    test(`before store-only delivery is installed, the gateway retains ${item.title}, withPush=${withPush}: the row comes back with the id it chose, and it acknowledges that exact destination`, async () => {
      const g = gateway();
      const out = await g.notify({ userId: ALERT_OWNER_ID, withPush, body: 'original body', ...item });
      assert.equal(out.ok, true);
      assert.equal(out.destination, 'operational_task');
      assert.equal(out.notificationId, CHOSEN_ID);
      assert.equal(out.operationalEventId, 100);
      assert.equal(g.sent.length, 0);
      assert.equal(g.originals.length, 1);
      assert.equal(g.originals[0].id, CHOSEN_ID);
      assert.equal(g.originals[0].message, 'original body');
      assert.equal(g.originals[0].read, false);
      assert.equal(g.originals[0].data._push, withPush ? 'inline' : 'none');
      assert.equal(withPush ? out.push.reason : out.push, withPush ? ROUTED_REASON : null);
    });
  }
}

for (const withPush of [true, false]) {
  for (const item of [
    { type: 'financial_incident', title: 'Chip drift' },
    { type: 'estate_digest', title: 'Estate Digest' },
    { type: 'system', title: 'Push Health Alert' },
    { type: 'system', title: 'Engine fault', data: { component: 'club-arena-engine', alertname: 'EngineFault' } },
  ]) {
    test(`store-only delivery: no personal row comes back for ${item.title}, withPush=${withPush}, and the gateway confirms the destination by the id it chose`, async () => {
      const g = gateway({ storeOnly: true });
      const out = await g.notify({ userId: ALERT_OWNER_ID, withPush, body: 'original body', ...item });
      assert.equal(out.ok, true);
      assert.equal(out.destination, 'operational_task');
      assert.equal(out.operationalEventId, 100);
      assert.equal(g.sent.length, 0);
      assert.equal(withPush ? out.push.reason : out.push, withPush ? ROUTED_REASON : null);
      assert.equal(g.originals.length, 1);
      assert.equal(g.originals[0].id, CHOSEN_ID);
      assert.equal(out.notificationId, CHOSEN_ID);
    });
  }
}

test('store-only delivery with no recorded destination is not acknowledged and never falls back to a phone', async () => {
  const g = gateway({ storeOnly: true, missing: true });
  const out = await g.notify({ userId: ALERT_OWNER_ID, type: 'financial_incident', title: 'Chip drift' });
  assert.equal(out.ok, false);
  assert.equal(out.operationalEventId, null);
  assert.equal(out.push, null);
  assert.equal(g.sent.length, 0);
});

test('store-only delivery with a pending receipt is retried by the id the gateway chose, and succeeds', async () => {
  const g = gateway({ storeOnly: true, pending: true, retrySucceeds: true });
  const out = await g.notify({ userId: ALERT_OWNER_ID, type: 'financial_incident', title: 'Chip drift' });
  assert.deepEqual(rpcArgs(g), [{ p_notification_id: CHOSEN_ID }]);
  assert.equal(out.ok, true);
  assert.equal(out.notificationId, CHOSEN_ID);
  assert.equal(out.operationalEventId, 101);
  assert.equal(out.push.reason, ROUTED_REASON);
  assert.equal(g.sent.length, 0);
});

test('store-only delivery whose retry leaves the receipt pending is retained but not acknowledged', async () => {
  const g = gateway({ storeOnly: true, pending: true });
  const out = await g.notify({ userId: ALERT_OWNER_ID, type: 'financial_incident', title: 'Chip drift' });
  assert.deepEqual(rpcArgs(g), [{ p_notification_id: CHOSEN_ID }]);
  assert.equal(out.ok, false);
  assert.equal(out.notificationId, CHOSEN_ID);
  assert.equal(out.operationalEventId, null);
  assert.equal(out.push.reason, 'operational_inbox_pending');
  assert.equal(g.sent.length, 0);
});

test('the insert is a plural request: a singular one (.single(), or .maybeSingle() in postgrest-js 1.x) is rolled back by PostgREST on zero rows, erasing the capture and its receipt', async () => {
  // The locked 2.112.4 maybeSingle() counts rows in the client and would not
  // be rolled back, but the gateway must not depend on which client is
  // installed: it awaits the insert itself and reads the returned array.
  const g = gateway({ storeOnly: true });
  const routed = await g.notify({ userId: ALERT_OWNER_ID, type: 'financial_incident', title: 'Chip drift' });
  const ordinary = await g.notify({ userId: ALERT_OWNER_ID, type: 'accounting_invoice', title: 'Your invoice' });
  const inserts = g.calls.filter((call) => call.table === 'notifications');
  assert.equal(inserts.length, 2);
  for (const call of inserts) {
    assert.equal(call.plural, true);
    assert.equal(call.singular, undefined, `${call.singular} can make the insert singular on the wire`);
    assert.equal(call.selected, 'id');
  }
  assert.equal(routed.ok, true);
  assert.equal(ordinary.ok, true);
});

test('an ordinary notification never gets a gateway-chosen id', async () => {
  const g = gateway();
  await g.notify({ userId: ALERT_OWNER_ID, type: 'accounting_invoice', title: 'Your invoice' });
  await g.notify({ userId: OTHER, type: 'financial_incident', title: 'Chip drift' });
  assert.equal(g.originals.length, 2);
  assert.equal('id' in g.originals[0], false);
  assert.equal('id' in g.originals[1], false);
});

test('an ordinary notification takes its id from the row the database returned, which only .select() asks for', async () => {
  const g = gateway();
  const out = await g.notify({ userId: OTHER, type: 'new_message', title: 'Message from a friend' });
  assert.equal(g.calls.find((call) => call.table === 'notifications').selected, 'id');
  assert.equal(out.ok, true);
  assert.equal(out.notificationId, DEFAULT_ID);
  assert.equal(g.sent.length, 1);
});

for (const storeOnly of [false, true]) {
  for (const fault of ['insertError', 'insertThrows', 'lookupError', 'missing', 'wrongId', 'wrongTask', 'invalidReceipt']) {
    test(`gateway cannot claim queue acceptance or fall back to a phone when ${fault}${storeOnly ? ' (store-only delivery)' : ''}`, async () => {
      const g = gateway({ storeOnly, [fault]: true });
      const out = await g.notify({ userId: ALERT_OWNER_ID, type: 'system', title: 'Push Health Alert' });
      assert.equal(out.ok, false);
      assert.equal(out.operationalEventId, null);
      assert.equal(out.push, null);
      assert.equal(g.sent.length, 0);
    });
  }
}

// The response to the insert never decides an owner-operational outcome, even
// when it names a row the gateway did not send: the destination read by the
// chosen id does, and it is never a phone.
for (const missing of [false, true]) {
  test(`an insert answered with an id the gateway did not send: ${missing ? 'no destination under the chosen id, not acknowledged' : 'the destination under the chosen id decides, acknowledged'}`, async () => {
    const g = gateway({ invalidInsertId: true, missing });
    const out = await g.notify({ userId: ALERT_OWNER_ID, type: 'system', title: 'Push Health Alert' });
    assert.deepEqual(destinationReads(g).map((read) => read.filters),
      [[['notification_id', CHOSEN_ID], ['target_task_id', ALERT_TASK_ID]]]);
    assert.equal(out.ok, !missing);
    assert.equal(out.notificationId, missing ? null : CHOSEN_ID);
    assert.equal(out.operationalEventId, missing ? null : 100);
    assert.equal(g.sent.length, 0);
  });
}

// A failed or thrown INSERT is not proof that nothing was stored: the
// transaction can commit and only its response be lost. The gateway already
// holds the id it chose, so it reads the durable outcome before reporting.
for (const failure of ['insertError', 'insertThrows']) {
  for (const storeOnly of [false, true]) {
    const mode = storeOnly ? 'store-only delivery' : 'before store-only delivery';
    test(`${failure} after the database committed (${mode}): the destination is read by the chosen id and the notice is acknowledged`, async () => {
      const g = gateway({ storeOnly, [failure]: true, committed: true });
      const out = await g.notify({ userId: ALERT_OWNER_ID, type: 'financial_incident', title: 'Chip drift' });
      assert.equal(out.ok, true);
      assert.equal(out.notificationId, CHOSEN_ID);
      assert.equal(out.operationalEventId, 100);
      assert.equal(out.push.reason, ROUTED_REASON);
      assert.equal(g.sent.length, 0);
      assert.deepEqual(destinationReads(g).map((read) => read.filters),
        [[['notification_id', CHOSEN_ID], ['target_task_id', ALERT_TASK_ID]]]);
    });

    test(`${failure} with nothing committed (${mode}): the destination read by the chosen id finds nothing, so it is not acknowledged and never reaches a phone`, async () => {
      const g = gateway({ storeOnly, [failure]: true });
      const out = await g.notify({ userId: ALERT_OWNER_ID, type: 'financial_incident', title: 'Chip drift' });
      assert.equal(destinationReads(g).length, 1, 'the durable outcome is read before reporting');
      assert.equal(out.ok, false);
      assert.equal(out.notificationId, null);
      assert.equal(out.operationalEventId, null);
      assert.equal(out.push, null);
      assert.equal(g.sent.length, 0);
    });
  }
}

test('a committed original whose insert failed and whose receipt is pending is retried by the chosen id', async () => {
  const g = gateway({ storeOnly: true, insertError: true, committed: true, pending: true, retrySucceeds: true });
  const out = await g.notify({ userId: ALERT_OWNER_ID, type: 'financial_incident', title: 'Chip drift' });
  assert.deepEqual(rpcArgs(g), [{ p_notification_id: CHOSEN_ID }]);
  assert.equal(out.ok, true);
  assert.equal(out.notificationId, CHOSEN_ID);
  assert.equal(out.operationalEventId, 101);
  assert.equal(g.sent.length, 0);
});

test(`notify.js imports randomUUID from 'node:crypto': the harness injects it, so a deleted import would pass here and throw for every owner-operational notice in production`, () => {
  assert.match(NOTIFY_SOURCE, /^import \{ randomUUID \} from 'node:crypto';$/m);
});

test('every binding the harness injects is an import of notify.js from the module it stands in for, and nothing else is imported', () => {
  const imported = {};
  for (const [, names, from] of NOTIFY_SOURCE.matchAll(/^import \{([^}]+)\} from '([^']+)';$/gm)) {
    for (const name of names.split(',').map((part) => part.trim()).filter(Boolean)) imported[name] = from;
  }
  assert.deepEqual(imported, IMPORTS);
  assert.equal((NOTIFY_SOURCE.match(/^import /gm) || []).length, new Set(Object.values(IMPORTS)).size);
});

for (const alertname of [7, {}, [], null, '']) {
  test(`structured engine classifier refuses a non-string/empty alert identity: ${JSON.stringify(alertname)}`, () => {
    assert.equal(isOwnerOperationalNotification(ALERT_OWNER_ID, { type: 'system', title: 'Engine fault',
      data: { component: 'club-arena-engine', alertname } }), false);
  });
}
const retryId = '33333333-3333-4333-8333-333333333333';
const validRetry = { notification_id: retryId, target_task_id: ALERT_TASK_ID, inbox_event_id: 1 };
test('a pre-destination cache cannot repopulate the personal feed after cutover', () => {
  const old = JSON.stringify([{ id: 'old-alert', type: 'system', _cache_version: 2,
    _cache_user: ALERT_OWNER_ID, _cache_ts: 1000 }]);
  assert.equal(readNotificationCache(old, ALERT_OWNER_ID, 1001), null);
  const current = notificationCache([{ id: 'personal', type: 'new_message' }], ALERT_OWNER_ID, 1000);
  assert.equal(readNotificationCache(current, ALERT_OWNER_ID, 1001)[0].id, 'personal');
});
for (const [result, accepted] of [
  [{ data: validRetry }, true],
  [{ data: { ...validRetry, inbox_event_id: null } }, true],
  [{ data: null }, false], [{ error: { message: 'recorder unavailable' } }, false],
  [{ data: { ...validRetry, inbox_event_id: -1 } }, false],
  [{ data: { ...validRetry, inbox_event_id: Number.MAX_SAFE_INTEGER + 1 } }, false],
  [{ data: { ...validRetry, target_task_id: 'wrong' } }, false],
  [{ data: { ...validRetry, notification_id: 'wrong' } }, false],
]) {
  test(`bounded destination retry reports its actual receipt: ${JSON.stringify(result)}`, async () => {
    const calls = [];
    const db = { rpc(name, args) {
      calls.push([name, args]);
      return { abortSignal(signal) { assert.equal(signal.aborted, false); return Promise.resolve(result); } };
    } };
    const receipt = await retryOwnerNotificationDestination(db, retryId);
    assert.deepEqual(calls, [['fn_retry_owner_notification_destination', { p_notification_id: retryId }]]);
    if (accepted) {
      assert.deepEqual(receipt, { eventId: result.data.inbox_event_id, error: null });
    } else {
      assert.equal(receipt.eventId, null);
      assert.equal(typeof receipt.error, 'string');
    }
  });
}
test('a durably pending destination is distinct from a recorded inbox receipt', async () => {
  const g = gateway({ pending: true });
  const out = await g.notify({ userId: ALERT_OWNER_ID, type: 'system', title: 'Push Health Alert' });
  assert.equal(out.ok, false);
  assert.equal(out.operationalEventId, null);
  assert.equal(out.push.reason, 'operational_inbox_pending');
  assert.equal(g.sent.length, 0);
  assert.deepEqual(rpcArgs(g), [{ p_notification_id: CHOSEN_ID }]);
});
test('owning request retries only its exact durable original once', async () => {
  const g = gateway({ pending: true, retrySucceeds: true });
  const out = await g.notify({ userId: ALERT_OWNER_ID, type: 'system', title: 'Push Health Alert' });
  assert.equal(out.ok, true);
  assert.equal(out.operationalEventId, 101);
  assert.equal(out.push.reason, ROUTED_REASON);
  assert.deepEqual(rpcArgs(g), [{ p_notification_id: CHOSEN_ID }]);
  assert.equal(g.sent.length, 0);
});
for (const args of [
  { userId: ALERT_OWNER_ID, type: 'system', title: 'Notifications moved to another account' },
  { userId: ALERT_OWNER_ID, type: 'accounting_invoice', title: 'Your invoice' },
  { userId: ALERT_OWNER_ID, type: 'new_message', title: 'Push Health Alert' },
  { userId: OTHER, type: 'system', title: 'Push Health Alert' },
]) {
  test(`ordinary or other-recipient notification keeps its existing gateway behavior: ${args.type}/${args.userId}`, async () => {
    const g = gateway(); const out = await g.notify(args);
    assert.equal(out.ok, true);
    assert.equal(out.notificationId, DEFAULT_ID);
    assert.equal(out.destination, undefined);
    assert.equal(g.calls.some(call => call.table === DESTINATIONS), false);
    assert.equal(g.sent.length, 1);
  });
}

// Personal messages and current invoices remain eligible. Archived per-payee
// invoice details must stay out of both newly written and retained caches.
test('versioned cache retains personal and current invoice rows, excludes archived detail and isolates accounts', () => {
  const rows = [{ id: 'invoice-detail', type: 'accounting_invoice_detail' },
    { id: 'personal', type: 'new_message' },
    { id: 'current-invoice', type: 'accounting_invoice' }];
  const raw = notificationCache(rows, ALERT_OWNER_ID, 1000);
  assert.deepEqual(JSON.parse(raw), [
    { ...rows[1], _cache_ts: 1000, _cache_user: ALERT_OWNER_ID, _cache_version: 4 },
    rows[2],
  ]);
  assert.deepEqual(readNotificationCache(raw, ALERT_OWNER_ID, 1001).map(row => row.id),
    ['personal', 'current-invoice']);
  assert.equal(readNotificationCache(raw, OTHER, 1001), null);
  assert.equal(readNotificationCache(raw, null, 1001), null);
  assert.equal(notificationCache(rows, null, 1000), null);
});
test('a retained current-version cache cannot restore archived invoice details on read', () => {
  const visible = [{ id: 'personal', type: 'new_message' },
    { id: 'current-invoice', type: 'accounting_invoice' }];
  // Construct the prior cache directly so write-time filtering cannot mask a
  // missing read-time filter. Its first, now-hidden row still owns the cache.
  const raw = JSON.stringify([
    { id: 'invoice-detail', type: 'accounting_invoice_detail', _cache_ts: 1000,
      _cache_user: ALERT_OWNER_ID, _cache_version: 4 },
    ...visible,
  ]);
  assert.deepEqual(readNotificationCache(raw, ALERT_OWNER_ID, 1001), visible);
  assert.equal(readNotificationCache(raw, OTHER, 1001), null);
  assert.equal(readNotificationCache(raw, null, 1001), null);
});
test('versioned cache refuses unversioned, malformed, expired and future-dated input', () => {
  assert.equal(readNotificationCache(JSON.stringify([{ id: 'old', _cache_ts: 1000 }]), ALERT_OWNER_ID, 1001), null);
  assert.equal(readNotificationCache('{', ALERT_OWNER_ID, 1001), null);
  assert.equal(readNotificationCache('{}', ALERT_OWNER_ID, 1001), null);
  const raw = notificationCache([{ id: 'personal' }], ALERT_OWNER_ID, 1000);
  assert.equal(readNotificationCache(raw, ALERT_OWNER_ID, 999), null);
  assert.equal(readNotificationCache(raw, ALERT_OWNER_ID, 301000), null);
  assert.equal(readNotificationCache(raw, ALERT_OWNER_ID, 300999)[0].id, 'personal');
});
