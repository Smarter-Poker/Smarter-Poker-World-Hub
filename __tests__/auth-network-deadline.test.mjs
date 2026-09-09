import { test, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { fetchAuthWithDeadline, AUTH_FETCH_DEADLINE_MS } from '../src/lib/authFetchDeadline.js';
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; mock.timers.reset(); });
test('an auth fetch that never returns is aborted', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  let signal;
  globalThis.fetch = (_input, init) => { signal = init.signal; return new Promise(() => {}); };
  const result = fetchAuthWithDeadline('https://auth.test/auth/v1/token').catch(e => e);
  mock.timers.tick(AUTH_FETCH_DEADLINE_MS);
  assert.equal((await result).name, 'AbortError');
  assert.equal(signal.aborted, true);
});
test('the auth deadline includes a stalled response body', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  globalThis.fetch = async () => ({ arrayBuffer: () => new Promise(() => {}) });
  const result = fetchAuthWithDeadline('https://auth.test/auth/v1/token').catch(e => e);
  await Promise.resolve();
  mock.timers.tick(AUTH_FETCH_DEADLINE_MS);
  assert.equal((await result).name, 'AbortError');
});
test('auth status, headers and JSON survive buffering', async () => {
  globalThis.fetch = async () => new Response('{"ok":true}', { headers: { 'x-request-id': 'test' } });
  const result = await fetchAuthWithDeadline('https://auth.test/auth/v1/user');
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('x-request-id'), 'test');
  assert.deepEqual(await result.json(), { ok: true });
});
test('cancelled auth work never starts a request', async () => {
  const c = new AbortController(); c.abort();
  let sent = false;
  globalThis.fetch = () => { sent = true; throw Error('unexpected request'); };
  await assert.rejects(fetchAuthWithDeadline('https://auth.test/auth/v1/token', { signal: c.signal }), { name: 'AbortError' });
  assert.equal(sent, false);
});
