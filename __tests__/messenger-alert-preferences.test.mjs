import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function loadMessengerPreferences(supabase) {
  const path = new URL('../src/services/preferences-service.js', import.meta.url);
  const source = readFileSync(path, 'utf8')
    .replace(/^import[^\n]+;\s*$/gm, '')
    .replace(/^export /gm, '');
  return new Function('supabase', `${source}\nreturn messengerPreferences;`)(supabase);
}

function localStore() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    values,
  };
}

function preferencesDb({ row = null, writeError = null } = {}) {
  const calls = [];
  const chain = {
    select() { return chain; },
    eq() { return chain; },
    maybeSingle() { return Promise.resolve({ data: row, error: null }); },
    upsert(value, options) {
      calls.push({ value, options });
      return Promise.resolve({ error: writeError });
    },
  };
  return { calls, from: (table) => { assert.equal(table, 'user_notification_preferences'); return chain; } };
}

test('Messenger reads the persisted alert choice used by Settings and the push gate', async () => {
  const previous = globalThis.localStorage;
  const store = localStore();
  globalThis.localStorage = store;
  try {
    const preferences = loadMessengerPreferences(preferencesDb({ row: { messenger_alerts: false } }));
    const result = await preferences.get('member-1');
    assert.equal(result.notifications, false);
    assert.equal(store.getItem('messenger-notifications'), 'false');
  } finally {
    globalThis.localStorage = previous;
  }
});

test('Messenger alert changes persist to the account preference rather than only this browser', async () => {
  const previous = globalThis.localStorage;
  const store = localStore();
  globalThis.localStorage = store;
  try {
    const db = preferencesDb();
    const preferences = loadMessengerPreferences(db);
    await preferences.update('member-1', { notifications: false });
    assert.equal(store.getItem('messenger-notifications'), 'false');
    assert.deepEqual(db.calls, [{
      value: { user_id: 'member-1', messenger_alerts: false },
      options: { onConflict: 'user_id' },
    }]);
  } finally {
    globalThis.localStorage = previous;
  }
});

test('a rejected Messenger alert write is surfaced to the caller for rollback', async () => {
  const previous = globalThis.localStorage;
  const store = localStore();
  store.setItem('messenger-notifications', 'true');
  globalThis.localStorage = store;
  try {
    const preferences = loadMessengerPreferences(preferencesDb({ writeError: { message: 'write failed' } }));
    await assert.rejects(() => preferences.update('member-1', { notifications: false }));
    assert.equal(store.getItem('messenger-notifications'), 'true');
  } finally {
    globalThis.localStorage = previous;
  }
});
