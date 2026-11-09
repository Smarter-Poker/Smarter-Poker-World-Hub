// Friend and store settings are saved to the player's account, and a refused
// save says so (2026-10-20).
//
// The RPCs update_friend_preferences / update_store_preferences were service
// role only until 20261019101200, so every browser save was refused. The
// service wrote localStorage FIRST and then threw, and /hub/friends never
// caught it: the toggle looked saved in that one browser and nowhere else,
// with an unhandled rejection in the console. The account write now comes
// first, this browser's copy changes only after it succeeds, and the page
// moves the toggle back and shows an error toast when it fails.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SERVICE = readFileSync(new URL('../src/services/preferences-service.js', import.meta.url), 'utf8');
const FRIENDS = readFileSync(new URL('../pages/hub/friends.js', import.meta.url), 'utf8');

function load(name, supabase) {
  const source = SERVICE.replace(/^import[^\n]+;\s*$/gm, '').replace(/^export /gm, '');
  return new Function('supabase', 'getAccessToken', `${source}\nreturn ${name};`)(supabase, () => null);
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

function rpcDb({ error = null, row = null } = {}) {
  const calls = [];
  const chain = {
    select() { return chain; },
    eq() { return chain; },
    maybeSingle() { return Promise.resolve({ data: row, error: null }); },
  };
  return {
    calls,
    rpc(name, args) {
      calls.push({ name, args });
      return Promise.resolve(error ? { data: null, error } : { data: args.p_preferences, error: null });
    },
    from() { return chain; },
  };
}

async function withStore(fn) {
  const previous = globalThis.localStorage;
  const store = localStore();
  globalThis.localStorage = store;
  try { return await fn(store); } finally { globalThis.localStorage = previous; }
}

for (const [name, rpc, key, storageKey] of [
  ['friendPreferences', 'update_friend_preferences', 'showOnlineStatus', 'friends-show-online'],
  ['storePreferences', 'update_store_preferences', 'promotionalEmails', 'store-promotional-emails'],
]) {
  test(`${name}: the account is written first and this browser follows it`, async () => {
    await withStore(async (store) => {
      const db = rpcDb();
      const saved = await load(name, db).update('user-1', { [key]: false });
      assert.deepEqual(db.calls, [{ name: rpc, args: { p_user_id: 'user-1', p_preferences: { [key]: false } } }]);
      assert.deepEqual(saved, { [key]: false });
      assert.equal(store.values.get(storageKey), 'false');
    });
  });

  test(`${name}: a refused save throws and leaves this browser unchanged`, async () => {
    await withStore(async (store) => {
      const db = rpcDb({ error: { code: '42501', message: 'permission denied for function' } });
      const previousWarn = console.warn;
      console.warn = () => {};
      try {
        await assert.rejects(load(name, db).update('user-1', { [key]: false }), (error) => error?.code === '42501');
      } finally {
        console.warn = previousWarn;
      }
      assert.equal(store.values.has(storageKey), false);
    });
  });
}

test('a partial saved object keeps the defaults for keys it does not hold', async () => {
  await withStore(async () => {
    const prefs = await load('friendPreferences', rpcDb({ row: { friend_preferences: { allowRequests: false } } })).get('user-1');
    assert.deepEqual(prefs, { allowRequests: false, showOnlineStatus: true, friendSuggestions: true });
  });
});

test('/hub/friends moves a refused toggle back and shows an error toast', () => {
  const start = FRIENDS.indexOf('const updatePreference = async');
  const body = FRIENDS.slice(start, FRIENDS.indexOf('};', start));
  assert.match(body, /try \{\s*await friendPreferences\.update\(/);
  assert.match(body, /catch \(error\) \{\s*setPreferences\(prev => \(\{ \.\.\.prev, \[key\]: previous \}\)\);\s*toast\.error\(/);
});
