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
function gateway(options = {}) {
  const calls = [], sent = [], originals = [];
  const id = '33333333-3333-4333-8333-333333333333';
  const client = { rpc(name, args) {
    calls.push({ rpc: name, args });
    assert.equal(name, 'fn_retry_owner_notification_destination');
    assert.deepEqual(args, { p_notification_id: id });
    return { abortSignal() { return Promise.resolve({ data: { notification_id: id,
      target_task_id: ALERT_TASK_ID, inbox_event_id: options.retrySucceeds ? 101 : null }, error: null }); } };
  }, from(table) {
    const call = { table }; calls.push(call);
    const chain = {
      insert(value) { call.insert = value; originals.push(value); return chain; },
      select() { return chain; },
      eq(key, value) { (call.filters ||= []).push([key, value]); return chain; },
      abortSignal(signal) { assert.equal(signal.aborted, false); call.bounded = true; return chain; },
      async maybeSingle() {
        if (table === 'notifications') return options.insertError
          ? { data: null, error: { message: 'original persistence refused' } }
          : { data: options.missingInsert ? null : { id: options.invalidInsertId ? 'invalid' : id }, error: null };
        assert.equal(table, 'operational_notification_destinations');
        assert.equal(call.bounded, true);
        assert.deepEqual(call.filters, [['notification_id', id], ['target_task_id', ALERT_TASK_ID]]);
        if (options.lookupError) return { data: null, error: { message: 'destination read refused' } };
        if (options.missing) return { data: null, error: null };
        return { data: { notification_id: options.wrongId ? 'wrong' : id,
          target_task_id: options.wrongTask ? 'wrong' : ALERT_TASK_ID,
          inbox_event_id: options.pending ? null : options.invalidReceipt ? -1 : 100 }, error: null };
      },
    }; return chain;
  } };
  const dependencies = {
    enqueuePush: async (...args) => { sent.push(args); return { sent: true }; },
    isOwnerOperationalNotification, retryOwnerNotificationDestination, ROUTED_REASON, ALERT_TASK_ID,
    console: { warn() {} },
  };
  const source = readFileSync(new URL('../src/lib/notify.js', import.meta.url), 'utf8')
    .replace(/^import[^\n]+;\s*$/gm, '')
    .replace(/^export default[^\n]+;\s*$/gm, '').replace(/^export /gm, '');
  const notify = new Function(...Object.keys(dependencies), `${source}\nreturn notify;`)(...Object.values(dependencies));
  return { notify: (args) => notify(client, args), calls, sent, originals };
}

for (const withPush of [true, false]) {
  for (const item of [
    { type: 'system', title: 'Push Health Alert' },
    { type: 'system', title: 'Notifications May Not Be Reaching This Device' },
    { type: 'financial_incident', title: 'Chip drift' },
    { type: 'financial_incident_resolved', title: 'Chip drift recovered' },
    { type: 'system', title: 'Horse Fleet Recovered: heartbeat' },
    { type: 'system', title: 'Engine fault', data: { component: 'club-arena-engine', alertname: 'EngineFault' } },
  ]) {
    test(`gateway retains ${item.title}, withPush=${withPush}, and acknowledges exact destination`, async () => {
      const g = gateway();
      const out = await g.notify({ userId: ALERT_OWNER_ID, withPush, body: 'original body', ...item });
      assert.equal(out.ok, true);
      assert.equal(out.destination, 'operational_task');
      assert.equal(out.operationalEventId, 100);
      assert.equal(g.sent.length, 0);
      assert.equal(g.originals.length, 1);
      assert.equal(g.originals[0].message, 'original body');
      assert.equal(g.originals[0].read, false);
      assert.equal(g.originals[0].data._push, withPush ? 'inline' : 'none');
      assert.equal(withPush ? out.push.reason : out.push, withPush ? ROUTED_REASON : null);
    });
  }
}

for (const fault of ['insertError', 'missingInsert', 'invalidInsertId', 'lookupError', 'missing', 'wrongId', 'wrongTask', 'invalidReceipt']) {
  test(`gateway cannot claim queue acceptance or fall back to a phone when ${fault}`, async () => {
    const g = gateway({ [fault]: true });
    const out = await g.notify({ userId: ALERT_OWNER_ID, type: 'system', title: 'Push Health Alert' });
    assert.equal(out.ok, false);
    assert.equal(out.operationalEventId, null);
    assert.equal(g.sent.length, 0);
  });
}

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
  assert.equal(g.calls.filter(call => call.rpc).length, 1);
});
test('owning request retries only its exact durable original once', async () => {
  const g = gateway({ pending: true, retrySucceeds: true });
  const out = await g.notify({ userId: ALERT_OWNER_ID, type: 'system', title: 'Push Health Alert' });
  assert.equal(out.ok, true);
  assert.equal(out.operationalEventId, 101);
  assert.equal(out.push.reason, ROUTED_REASON);
  assert.equal(g.calls.filter(call => call.rpc).length, 1);
  assert.equal(g.sent.length, 0);
});
for (const args of [
  { userId: ALERT_OWNER_ID, type: 'system', title: 'Notifications moved to another account' },
  { userId: ALERT_OWNER_ID, type: 'accounting_invoice', title: 'Your invoice' },
  { userId: ALERT_OWNER_ID, type: 'new_message', title: 'Push Health Alert' },
  { userId: '22222222-2222-4222-8222-222222222222', type: 'system', title: 'Push Health Alert' },
]) {
  test(`ordinary or other-recipient notification keeps its existing gateway behavior: ${args.type}/${args.userId}`, async () => {
    const g = gateway(); const out = await g.notify(args);
    assert.equal(out.ok, true);
    assert.equal(out.destination, undefined);
    assert.equal(g.calls.some(call => call.table === 'operational_notification_destinations'), false);
    assert.equal(g.sent.length, 1);
  });
}
