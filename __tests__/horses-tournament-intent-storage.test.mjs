import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { cancellationIntent } from '../src/components/horses/tournamentCancellationIntent.mjs';
const event = '22222222-2222-4222-8222-222222222222';
const key = `stable-tournament-cancel:11111111-1111-4111-8111-111111111111:${event}`;
const a = { action: 'cancel_refund', tournamentId: event, opId: '33333333-3333-4333-8333-333333333333', reason: 'Original isolated review' };
const b = { ...a, opId: '44444444-4444-4444-8444-444444444444' };
const current = () => true;
function setup(legacy = null) {
  globalThis.indexedDB = new IDBFactory();
  const values = new Map(legacy === null ? [] : [[key, legacy]]);
  globalThis.localStorage = { getItem: k => values.get(k) ?? null, setItem() { throw new Error('Legacy Writes Forbidden'); }, removeItem() { throw new Error('Legacy Removal Forbidden'); } };
  return values;
}
test('legacy request imports transactionally and bytes survive resolution', async () => {
  const raw = JSON.stringify(a), values = setup(raw);
  assert.deepEqual(await cancellationIntent(key, 'read', null, current), a);
  await cancellationIntent(key, 'resolve', a, current);
  assert.equal(await cancellationIntent(key, 'read', null, current), null);
  assert.equal(values.get(key), raw);
  await assert.rejects(cancellationIntent(key, 'retain', a, current), /Already Resolved/);
});
test('concurrent new operations share one authoritative readwrite transaction order', async () => {
  setup();
  const results = await Promise.allSettled([cancellationIntent(key, 'retain', a, current), cancellationIntent(key, 'retain', b, current)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter(r => r.status === 'rejected').length, 1);
  const retained = await cancellationIntent(key, 'read', null, current);
  assert.deepEqual(retained, results.find(r => r.status === 'fulfilled').value);
});
test('resolved tombstones reject old retries after a newer command also resolves', async () => {
  setup();
  await cancellationIntent(key, 'retain', a, current);
  await cancellationIntent(key, 'resolve', a, current);
  await cancellationIntent(key, 'retain', b, current);
  await assert.rejects(cancellationIntent(key, 'resolve', a, current), /Another Cancellation/);
  assert.deepEqual(await cancellationIntent(key, 'read', null, current), b);
  await cancellationIntent(key, 'resolve', b, current);
  await assert.rejects(cancellationIntent(key, 'retain', a, current), /Already Resolved/);
  await assert.rejects(cancellationIntent(key, 'retain', b, current), /Already Resolved/);
  assert.equal(await cancellationIntent(key, 'read', null, current), null);
});
test('altered legacy bytes are preserved and cannot overwrite the imported identity', async () => {
  const values = setup(JSON.stringify(a));
  await cancellationIntent(key, 'read', null, current);
  values.set(key, JSON.stringify(b));
  await assert.rejects(cancellationIntent(key, 'retain', a, current), /Legacy/);
  await assert.rejects(cancellationIntent(key, 'resolve', a, current), /Legacy/);
  assert.equal(values.get(key), JSON.stringify(b));
});
test('storage errors and stale account refuse before committing a command', async () => {
  setup(); globalThis.indexedDB = undefined;
  await assert.rejects(cancellationIntent(key, 'retain', a, current), /Unavailable/);
  setup();
  let active = true;
  const pending = cancellationIntent(key, 'retain', a, () => active);
  active = false;
  await assert.rejects(pending, /Account Or View Changed/);
  assert.equal(await cancellationIntent(key, 'read', null, current), null);
});
test('malformed legacy content is unknown, never an empty operation slot', async () => {
  const values = setup('{broken');
  await assert.rejects(cancellationIntent(key, 'read', null, current));
  await assert.rejects(cancellationIntent(key, 'retain', a, current));
  assert.equal(values.get(key), '{broken');
});

for (const raw of ['false', 'null', '0', '""']) test(`non-request legacy JSON ${raw} is preserved and refuses admission`, async () => {
 const values = setup(raw);
 await assert.rejects(cancellationIntent(key, 'read', null, current));
 await assert.rejects(cancellationIntent(key, 'retain', a, current));
 assert.equal(values.get(key), raw);
});

test('unanswered storage open is bounded and a late connection is closed', async t => {
 setup(); t.mock.timers.enable({ apis: ['setTimeout'] });
 const opening = {}; let closed = 0, settled = false;
 globalThis.indexedDB = { open: () => opening };
 const pending = cancellationIntent(key, 'read', null, current).catch(error => { settled = true; return error; });
 t.mock.timers.tick(30000); await new Promise(setImmediate);
 assert.equal(settled, true);
 assert.match((await pending).message, /Storage.*Unknown/);
 opening.result = { close() { closed++; } }; opening.onsuccess();
 assert.equal(closed, 1);
});

test('unanswered storage transaction aborts at the same boundary without dispatch', async t => {
 setup(); t.mock.timers.enable({ apis: ['setTimeout'] });
 let aborted = 0, closed = 0;
 const tx = { objectStore: () => ({ get: () => ({}) }), abort() { aborted++; this.onabort?.(); } };
 const db = { close() { closed++; }, transaction: () => tx };
 globalThis.indexedDB = { open() { const request = {}; queueMicrotask(() => { request.result = db; request.onsuccess(); }); return request; } };
 let settled = false;
 const pending = cancellationIntent(key, 'read', null, current).catch(error => { settled = true; return error; });
 await new Promise(setImmediate);
 t.mock.timers.tick(30000); await new Promise(setImmediate);
 assert.equal(settled, true); assert.equal(aborted, 1); assert.ok(closed >= 1);
 assert.match((await pending).message, /Storage|Commit/);
});
