/**
 * MESSENGER PREFERENCE SYNC — diff + merge tests
 *
 * Added 2026-08-15 with the fix that made messenger bookmarks, labels and
 * themes actually persist. The two behaviours these lock down are exactly the
 * two the old code got wrong:
 *
 *   1. Removals must produce DELETEs. The old sync only ever upserted, so
 *      un-bookmarking a message never reached the database — and the moment a
 *      read-back existed, every removed bookmark would have come back.
 *   2. A server that has nothing must not wipe what the user has locally. All
 *      three tables are empty today, so the first load after this ships is the
 *      backfill path, not an edge case.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syncMessengerPrefs, mergeServerPrefs } from '../src/lib/messengerPrefsSync.js';

/** Minimal Supabase query-builder stand-in that records what it was asked to do. */
function fakeSupabase() {
  const calls = [];
  const builder = (table, op) => {
    const record = { table, op, filters: {}, rows: null };
    calls.push(record);
    const chain = {
      upsert(rows) {
        record.op = 'upsert';
        record.rows = rows;
        return chain;
      },
      delete() {
        record.op = 'delete';
        return chain;
      },
      eq(col, val) {
        record.filters[col] = val;
        return chain;
      },
      in(col, vals) {
        record.filters[col] = vals;
        return chain;
      },
      then(resolve) {
        return Promise.resolve({ error: null }).then(resolve);
      },
    };
    return chain;
  };
  return { calls, from: (table) => builder(table, 'unknown') };
}

const EMPTY = { bookmarks: [], labels: {}, themes: {} };
const UID = 'user-1';

test('adding a bookmark upserts it', async () => {
  const sb = fakeSupabase();
  await syncMessengerPrefs(sb, UID, { ...EMPTY, bookmarks: [{ id: 'm1' }] }, EMPTY);
  const op = sb.calls.find((c) => c.table === 'messenger_bookmarks');
  assert.equal(op.op, 'upsert');
  assert.deepEqual(op.rows, [{ message_id: 'm1', user_id: UID }]);
});

test('removing a bookmark DELETEs it (the old code only ever upserted)', async () => {
  const sb = fakeSupabase();
  await syncMessengerPrefs(sb, UID, EMPTY, { ...EMPTY, bookmarks: [{ id: 'm1' }] });
  const op = sb.calls.find((c) => c.table === 'messenger_bookmarks');
  assert.equal(op.op, 'delete');
  assert.deepEqual(op.filters.message_id, ['m1']);
  assert.equal(op.filters.user_id, UID);
});

test('removing one label of two deletes only that label', async () => {
  const sb = fakeSupabase();
  await syncMessengerPrefs(
    sb,
    UID,
    { ...EMPTY, labels: { m1: ['urgent'] } },
    { ...EMPTY, labels: { m1: ['urgent', 'low'] } }
  );
  const ops = sb.calls.filter((c) => c.table === 'messenger_labels');
  assert.equal(ops.length, 1);
  assert.equal(ops[0].op, 'delete');
  assert.equal(ops[0].filters.label, 'low');
  assert.equal(ops[0].filters.message_id, 'm1');
});

test('clearing a conversation theme DELETEs the row', async () => {
  const sb = fakeSupabase();
  await syncMessengerPrefs(sb, UID, EMPTY, { ...EMPTY, themes: { c1: '#FFFFFF' } });
  const op = sb.calls.find((c) => c.table === 'messenger_themes');
  assert.equal(op.op, 'delete');
  assert.deepEqual(op.filters.conversation_id, ['c1']);
});

test('an unchanged theme issues no write at all', async () => {
  const sb = fakeSupabase();
  const same = { ...EMPTY, themes: { c1: '#FFFFFF' } };
  await syncMessengerPrefs(sb, UID, same, same);
  assert.equal(sb.calls.length, 0);
});

test('changing a theme upserts the new value', async () => {
  const sb = fakeSupabase();
  await syncMessengerPrefs(
    sb,
    UID,
    { ...EMPTY, themes: { c1: '#F0F8FF' } },
    { ...EMPTY, themes: { c1: '#FFFFFF' } }
  );
  const op = sb.calls.find((c) => c.table === 'messenger_themes');
  assert.equal(op.op, 'upsert');
  assert.deepEqual(op.rows, [{ conversation_id: 'c1', user_id: UID, theme_value: '#F0F8FF' }]);
});

test('signed out: nothing is written', async () => {
  const sb = fakeSupabase();
  await syncMessengerPrefs(sb, null, { ...EMPTY, bookmarks: [{ id: 'm1' }] }, EMPTY);
  assert.equal(sb.calls.length, 0);
});

test('mergeServerPrefs: server wins where it has rows', () => {
  const { prefs, backfill } = mergeServerPrefs(
    { bookmarks: [{ id: 'local' }], labels: {}, themes: {}, templates: ['keep me'] },
    { bookmarks: [{ id: 'server' }], labels: {}, themes: {} }
  );
  assert.deepEqual(prefs.bookmarks, [{ id: 'server' }]);
  // Keys with no table are untouched.
  assert.deepEqual(prefs.templates, ['keep me']);
  assert.equal(backfill, false);
});

test('mergeServerPrefs: an empty server does NOT wipe local, it flags a backfill', () => {
  const { prefs, backfill } = mergeServerPrefs(
    { bookmarks: [{ id: 'local' }], labels: { m1: ['urgent'] }, themes: {} },
    { bookmarks: [], labels: {}, themes: {} }
  );
  assert.deepEqual(prefs.bookmarks, [{ id: 'local' }]);
  assert.deepEqual(prefs.labels, { m1: ['urgent'] });
  assert.equal(backfill, true);
});

test('mergeServerPrefs: an unreadable server leaves local completely alone', () => {
  const local = { bookmarks: [{ id: 'local' }], labels: {}, themes: {} };
  const { prefs, backfill } = mergeServerPrefs(local, null);
  assert.equal(prefs, local);
  assert.equal(backfill, false);
});
