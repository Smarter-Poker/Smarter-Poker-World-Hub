/**
 * LAW: THE HUB NOTICES A REVOKED SESSION
 *
 * 2026-09-04. A cron revoked Dan's session every 15 minutes for 22 hours.
 * The hub never noticed and never would have: PostgREST checks a JWT's
 * signature, not whether the session row exists, so every call kept
 * returning 200. The token lives seven days. Nothing asked GoTrue.
 *
 * PINS
 *   1. A definitively dead session (getUser AND refresh rejected) is
 *      'revoked'; it clears the LOCAL session only, prompts, and leaves for
 *      /auth/login?authError=no_session with a return path.
 *   2. "Could not ask" - network error, 5xx, 429 - is 'unknown' and NEVER
 *      signs anyone out. A dead access token with a live refresh token is
 *      'alive'.
 *   3. The question is throttled (one per minute) and single-flight.
 *   4. _app installs the watch once; the prompt copy is Title Case with no
 *      em dash; the copy names the cause.
 *
 * Registry: this repo has no docs/LAWS.md (see horses-phase4 law header).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  probeSessionAlive,
  isDefinitiveAuthRejection,
  checkSessionLiveness,
  loginRedirectUrl,
  SESSION_ENDED_TITLE,
  SESSION_ENDED_BODY,
  SESSION_ENDED_BUTTON,
  AUTH_STORAGE_KEY,
  _resetForTests,
} from '../src/lib/sessionLiveness.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Minimal browser globals: no document (prompt short-circuits to onGo),
// a localStorage that holds a session, a sessionStorage.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.sessionStorage = { setItem() {}, getItem: () => null };

function auth({ user, refresh, signOut } = {}) {
  const calls = { signOut: [] };
  return {
    calls,
    getUser: async () => {
      if (user === 'throw') throw new TypeError('Failed to fetch');
      return user ? { data: { user: null }, error: user } : { data: { user: { id: 'u1' } }, error: null };
    },
    refreshSession: async () => {
      if (refresh === 'throw') throw new TypeError('Failed to fetch');
      return refresh ? { data: { session: null }, error: refresh } : { data: { session: { access_token: 'n' } }, error: null };
    },
    signOut: async (opts) => {
      calls.signOut.push(opts);
      if (signOut === 'throw') throw new Error('x');
      return { error: null };
    },
  };
}
const DEAD = { status: 403, code: 'session_not_found' };
const DEAD_REFRESH = { status: 400, code: 'refresh_token_not_found', message: 'Invalid Refresh Token' };

test('LAW 1/2: the verdict', async () => {
  assert.equal(await probeSessionAlive(auth({})), 'alive');
  assert.equal(await probeSessionAlive(auth({ user: DEAD, refresh: DEAD_REFRESH })), 'revoked');
  assert.equal(await probeSessionAlive(auth({ user: { status: 403, code: 'bad_jwt' } })), 'alive', 'live refresh token wins');
  assert.equal(await probeSessionAlive(auth({ user: 'throw' })), 'unknown');
  assert.equal(await probeSessionAlive(auth({ user: DEAD, refresh: 'throw' })), 'unknown');
  for (const status of [0, 429, 500, 502, 503]) {
    assert.equal(await probeSessionAlive(auth({ user: { status } })), 'unknown', `status ${status}`);
    assert.equal(await probeSessionAlive(auth({ user: DEAD, refresh: { status } })), 'unknown');
  }
  assert.equal(isDefinitiveAuthRejection({ status: 400, message: 'Invalid Refresh Token: Already Used' }), true);
  assert.equal(isDefinitiveAuthRejection({ status: 400, message: 'Validation failed' }), false);
  assert.equal(isDefinitiveAuthRejection(null), false);
});

test('LAW 1: revoked -> local sign-out only, then leave for login with a return path', async () => {
  _resetForTests();
  store.set(AUTH_STORAGE_KEY, '{"access_token":"x"}');
  const a = auth({ user: DEAD, refresh: DEAD_REFRESH });
  let went = 0;
  const v = await checkSessionLiveness('test', { getAuth: async () => a, go: () => went++, force: true });
  assert.equal(v, 'revoked');
  assert.deepEqual(a.calls.signOut, [{ scope: 'local' }], "scope 'local' and nothing else - a global sign-out here is the outage in reverse");
  assert.equal(went, 1);
  // Once leaving, it stays leaving; it does not ask again.
  assert.equal(await checkSessionLiveness('again', { getAuth: async () => a, go: () => went++, force: true }), 'revoked');
  assert.equal(went, 1);
});

test('LAW 2: unknown and alive never sign anyone out', async () => {
  for (const cfg of [{ user: 'throw' }, { user: { status: 503 } }, {}]) {
    _resetForTests();
    store.set(AUTH_STORAGE_KEY, '{"access_token":"x"}');
    const a = auth(cfg);
    let went = 0;
    const v = await checkSessionLiveness('t', { getAuth: async () => a, go: () => went++, force: true });
    assert.notEqual(v, 'revoked');
    assert.equal(a.calls.signOut.length, 0);
    assert.equal(went, 0);
  }
});

test('LAW 3: throttled and single-flight; no local session means nothing to ask', async () => {
  _resetForTests();
  store.set(AUTH_STORAGE_KEY, '{"access_token":"x"}');
  let asks = 0;
  const a = auth({});
  const counting = { ...a, getUser: async () => { asks++; return a.getUser(); } };
  let t = 1_000_000;
  const deps = { getAuth: async () => counting, now: () => t };
  await checkSessionLiveness('a', deps);
  await checkSessionLiveness('b', deps); // inside the minimum gap
  assert.equal(asks, 1, 'second call inside the gap does not ask again');
  t += 61_000;
  await checkSessionLiveness('c', deps);
  assert.equal(asks, 2);
  store.delete(AUTH_STORAGE_KEY);
  _resetForTests();
  assert.equal(await checkSessionLiveness('d', deps), 'alive');
  assert.equal(asks, 2, 'no local session: nothing to check, nobody bounced');
});

test('LAW 4: installed once from _app, the copy obeys the popup rule, the redirect carries the code', () => {
  const app = readFileSync(join(ROOT, 'pages', '_app.js'), 'utf8');
  assert.match(app, /installSessionLivenessWatch\(\)/);
  for (const text of [SESSION_ENDED_TITLE, SESSION_ENDED_BODY, SESSION_ENDED_BUTTON]) {
    assert.ok(!text.includes('—'), 'no em dashes');
    for (const w of text.split(/\s+/)) {
      const c = w.replace(/^[^A-Za-z]+/, '')[0];
      if (c) assert.equal(c, c.toUpperCase(), `"${w}" in "${text}" is not Title Case`);
    }
  }
  assert.match(SESSION_ENDED_BODY, /Signed Out/);
  assert.equal(loginRedirectUrl('/hub/social', '?x=1'), '/auth/login?authError=no_session&redirect=' + encodeURIComponent('/hub/social?x=1'));
});
