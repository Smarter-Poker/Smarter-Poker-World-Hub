import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveOperationalPushMetadata } from '../src/lib/push/operational-push-metadata.mjs';

const owner = '47965354-0e56-43ef-931c-ddaab82af765';
const other = '00000000-0000-4000-8000-000000000002';
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const notice = (n = 1) => ({ id: id(n), user_id: owner, type: 'financial_incident',
  title: 'Measured financial fault', message: 'Exact original finding', data: { severity: 'critical' } });
const push = (n = 1) => ({ id: id(1000 + n), related_entity_id: id(n), recipient_user_id: owner,
  event: 'financial_incident', title: notice().title, body: notice().message });

function database(rows, options = {}) {
  const calls = [];
  return { calls, from(table) {
    assert.equal(table, 'notifications');
    const call = { filters: {} }; calls.push(call);
    const query = {
      select(columns) { call.columns = columns; return query; },
      in(key, values) { call.filters[key] = values; return query; },
      limit(limit) { call.limit = limit; return query; },
      abortSignal(signal) { call.signal = signal; return query; },
      then(resolve, reject) {
        if (options.hang) return new Promise(() => {}).then(resolve, reject);
        if (options.throw) return Promise.reject(new Error('private diagnostic')).then(resolve, reject);
        const data = options.raw !== undefined ? options.raw : rows.filter((r) => call.filters.id.includes(r.id));
        return Promise.resolve(options.error ? { error: { message: 'private diagnostic' } } : { data }).then(resolve, reject);
      },
    };
    return query;
  } };
}

test('verified id, recipient, event and content retain critical severity and leave original data untouched', async () => {
  const rows = [push()], before = structuredClone(rows), db = database([notice()]);
  const result = (await resolveOperationalPushMetadata(db, rows)).get(rows[0].id);
  assert.equal(result.severity, 'critical');
  assert.equal(result.metadata.status, 'verified');
  assert.equal(result.metadata.notification_id, id(1));
  assert.deepEqual(rows, before);
  assert.deepEqual(db.calls[0].filters, { id: [id(1)], user_id: [owner] });
  assert.equal(db.calls[0].limit, 1);
});

for (const [name, changes] of [
  ['recipient', { user_id: other }], ['event', { type: 'accounting_invoice' }],
  ['title', { title: 'Different fault' }], ['body', { message: 'Different evidence' }],
]) {
  test(`caller-supplied link cannot import ${name}-mismatched severity`, async () => {
    const original = { ...push(), severity: 'critical', data: { severity: 'critical' } };
    const result = (await resolveOperationalPushMetadata(database([{ ...notice(), ...changes }]), [original])).get(original.id);
    assert.equal(result.severity, 'warning');
    assert.equal(result.metadata.status, 'unresolved');
    assert.equal(result.metadata.reason, 'unverified_notification');
    assert.equal(result.metadata.recipient_user_id, undefined);
  });
}

test('only recognized server metadata supplies severity; caller severity cannot override it', async () => {
  for (const severity of ['critical', 'warning', 'info', 'CRITICAL', null, {}]) {
    const original = { ...push(), severity: 'critical' };
    const result = (await resolveOperationalPushMetadata(database([{ ...notice(), data: { severity } }]), [original])).get(original.id);
    assert.equal(result.severity, ['critical', 'warning', 'info'].includes(severity) ? severity : 'warning');
    assert.equal(result.metadata.status, ['critical', 'warning', 'info'].includes(severity) ? 'verified' : 'unresolved');
  }
});

test('unlinked/invalid linked originals remain available without a database lookup', async () => {
  const db = database([]), rows = [push(1), push(2)];
  rows[0].related_entity_id = null; rows[1].related_entity_id = 'not-a-uuid';
  const result = await resolveOperationalPushMetadata(db, rows);
  assert.equal(result.size, 2); assert.equal(db.calls.length, 0);
  assert.equal(result.get(rows[0].id).metadata.reason, 'no_notification_link');
  assert.equal(result.get(rows[1].id).metadata.reason, 'unverified_notification');
});

test('equivalent UUID identity is validated without rewriting original caller evidence', async () => {
  const original = { ...push(), related_entity_id: '{' + id(1).toUpperCase() + '}',
    recipient_user_id: owner.replace(/-/g, '').toUpperCase() };
  const result = (await resolveOperationalPushMetadata(database([notice()]), [original])).get(original.id);
  assert.equal(result.severity, 'critical'); assert.equal(original.related_entity_id[0], '{');
  assert.equal(result.metadata.recipient_user_id, owner);
});

test('matches PostgreSQL code-point truncation and null-message fallback', async () => {
  const title = '🃏'.repeat(121), message = '🃏'.repeat(501);
  const original = { ...push(), title: '🃏'.repeat(120), body: '🃏'.repeat(500) };
  const result = (await resolveOperationalPushMetadata(database([{ ...notice(), title, message }]), [original])).get(original.id);
  assert.equal(result.severity, 'critical');
  const fallback = { ...push(), body: notice().title };
  assert.equal((await resolveOperationalPushMetadata(database([{ ...notice(), message: null }]), [fallback])).get(fallback.id).severity, 'critical');
});

for (const [name, options, reason] of [
  ['database refusal', { error: true }, 'lookup_failed'],
  ['thrown transport error', { throw: true }, 'lookup_failed'],
  ['null success body', { raw: null }, 'invalid_lookup_response'],
  ['object success body', { raw: {} }, 'invalid_lookup_response'],
  ['duplicate rows', { raw: [notice(), notice()] }, 'invalid_lookup_response'],
  ['unexpected returned id', { raw: [notice(2)] }, 'invalid_lookup_response'],
]) {
  test(`${name} reports unresolved metadata instead of losing the original`, async () => {
    const original = push(), result = await resolveOperationalPushMetadata(database([], options), [original]);
    assert.equal(result.size, 1); assert.equal(result.get(original.id).severity, 'warning');
    assert.equal(result.get(original.id).metadata.reason, reason);
    assert.doesNotMatch(JSON.stringify([...result.values()]), /private diagnostic/);
  });
}

test('bounded timeout aborts stalled lookup and retains original intake metadata', async () => {
  const db = database([], { hang: true }), original = push();
  const result = await resolveOperationalPushMetadata(db, [original], { timeoutMs: 5 });
  assert.equal(result.get(original.id).metadata.reason, 'lookup_timeout');
  assert.equal(db.calls[0].signal.aborted, true);
});

test('300-row claim has bounded queries, and an oversized caller performs none', async () => {
  const rows = Array.from({ length: 300 }, (_, i) => push(i + 1));
  const db = database(rows.map((_, i) => notice(i + 1)));
  const result = await resolveOperationalPushMetadata(db, rows);
  assert.deepEqual(db.calls.map((call) => call.limit), [200, 100]);
  assert.equal(result.size, 300);
  assert.ok([...result.values()].every((entry) => entry.severity === 'critical'));
  const oversized = database([]), all = [...rows, push(301)];
  const refused = await resolveOperationalPushMetadata(oversized, all);
  assert.equal(refused.size, 301); assert.equal(oversized.calls.length, 0);
  assert.ok([...refused.values()].every((entry) => entry.metadata.reason === 'lookup_batch_limit'));
});
