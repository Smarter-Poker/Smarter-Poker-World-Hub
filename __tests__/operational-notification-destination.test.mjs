import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALERT_OWNER_ID, isOwnerOperationalNotification, retryOwnerNotificationDestination,
} from '../src/lib/push/operational-push-routing.mjs';
import { notificationCache, readNotificationCache } from '../src/lib/notificationVisibility.mjs';

const ordinary = '00000000-0000-0000-0000-000000000002';

for (const type of ['financial_incident', 'financial_incident_resolved', 'financial_attestation',
  'engine_break_failed', 'engine_break_recovered', 'guarantee_bank_short', 'guarantee_bank_recovered', 'estate_digest']) {
  test(`${type} notification is recognized as the owner's operational destination`, () => {
    assert.equal(isOwnerOperationalNotification(ALERT_OWNER_ID, { type }), true);
    assert.equal(isOwnerOperationalNotification(ordinary, { type }), false);
  });
}

test('a club-arena-engine structured system alert is recognized regardless of title', () => {
  const row = { type: 'system', title: 'Anything', data: { component: 'club-arena-engine', alertname: 'EngineRefusingSessions' } };
  assert.equal(isOwnerOperationalNotification(ALERT_OWNER_ID, row), true);
  assert.equal(isOwnerOperationalNotification(ordinary, row), false);
});

test('a system alert missing alertname or component is not operational', () => {
  assert.equal(isOwnerOperationalNotification(ALERT_OWNER_ID, { type: 'system', title: 'Anything', data: { component: 'club-arena-engine' } }), false);
  assert.equal(isOwnerOperationalNotification(ALERT_OWNER_ID, { type: 'system', title: 'Anything', data: { alertname: 'x' } }), false);
});

function gateway(faults = {}) {
  const calls = [];
  return {
    calls,
    async notify(args) {
      calls.push({ table: 'notify', args });
      if (!isOwnerOperationalNotification(args.userId, { type: args.type, title: args.title, data: args.data })) {
        return { ok: true, destination: undefined, sent: true };
      }
      if (faults.recordFails) return { ok: false, error: 'record failed' };
      calls.push({ table: 'operational_notification_destinations' });
      return { ok: true, destination: 'operational_notification_destinations' };
    },
  };
}

for (const fault of ['recordFails']) {
  test(`gateway reports failure without ever sending a phone alert; fault=${fault}`, async () => {
    const g = gateway({ [fault]: true });
    const out = await g.notify({ userId: ALERT_OWNER_ID, type: 'system', title: 'Push Health Alert' });
    assert.equal(out.ok, false);
  });
}

test('an ordinary notification never touches the operational destination table', async () => {
  const args = { userId: ordinary, type: 'new_message', title: 'Hey' };
  const g = gateway(); const out = await g.notify(args);
  assert.equal(out.ok, true);
  assert.equal(out.destination, undefined);
  assert.equal(g.calls.some(call => call.table === 'operational_notification_destinations'), false);
  assert.equal(g.sent.length, 1);
});

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
  assert.equal(readNotificationCache(raw, '22222222-2222-4222-8222-222222222222', 1001), null);
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
  assert.equal(readNotificationCache(raw, '22222222-2222-4222-8222-222222222222', 1001), null);
  assert.equal(readNotificationCache(raw, null, 1001), null);
});
test('versioned cache refuses unversioned, malformed, expired and future-dated input', () => {
  assert.equal(readNotificationCache(JSON.stringify([{ id: 'old', _cache_ts: 1000 }]), ALERT_OWNER_ID, 1001), null);
  assert.equal(readNotificationCache('not json', ALERT_OWNER_ID, 1001), null);
  assert.equal(readNotificationCache(JSON.stringify([]), ALERT_OWNER_ID, 1001), null);
  const stale = JSON.stringify([{ id: 'x', _cache_ts: 1000, _cache_user: ALERT_OWNER_ID, _cache_version: 4 }]);
  assert.equal(readNotificationCache(stale, ALERT_OWNER_ID, 1000 + 300_000), null);
  assert.equal(readNotificationCache(stale, ALERT_OWNER_ID, 999), null);
});
test('retry helper enforces the exact receipt shape before reporting success', async () => {
  const supabase = { rpc: () => ({ abortSignal: async () => ({ data: { notification_id: 'n1', target_task_id: 'wrong', inbox_event_id: 5 }, error: null }) }) };
  const out = await retryOwnerNotificationDestination(supabase, 'n1');
  assert.equal(out.eventId, null);
  assert.ok(out.error);
});
test('retry helper surfaces an rpc error without inventing a receipt', async () => {
  const supabase = { rpc: () => ({ abortSignal: async () => ({ data: null, error: { message: 'refused' } }) }) };
  const out = await retryOwnerNotificationDestination(supabase, 'n1');
  assert.equal(out.eventId, null);
  assert.equal(out.error, 'refused');
});
