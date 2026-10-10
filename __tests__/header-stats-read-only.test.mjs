import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const source = await readFile(new URL('../src/lib/headerStats.js', import.meta.url), 'utf8');
const header = await readFile(new URL('../src/components/ui/UniversalHeader.js', import.meta.url), 'utf8');
const api = await readFile(new URL('../pages/api/user/get-header-stats.js', import.meta.url), 'utf8');
test('shared authenticated header reads use bodyless private GET and preserve account isolation', async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const originalStorage = globalThis.localStorage;
  const pending = [];
  globalThis.window = {};
  globalThis.localStorage = { getItem: () => JSON.stringify({ access_token: 'test-bearer' }) };
  globalThis.fetch = (url, options) => new Promise(resolve => pending.push({ url, options, resolve }));
  try {
    const { getHeaderStats } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
    const first = getHeaderStats({ userId: 'account-a' });
    assert.equal(getHeaderStats({ userId: 'account-a' }), first);
    assert.equal(pending.length, 1);
    assert.equal(pending[0].url, '/api/user/get-header-stats');
    assert.equal(pending[0].options.method, 'GET');
    assert.equal(pending[0].options.cache, 'no-store');
    assert.equal(pending[0].options.body, undefined);
    assert.equal(pending[0].options.headers.Authorization, 'Bearer test-bearer');
    const second = getHeaderStats({ userId: 'account-b' });
    assert.notEqual(second, first);
    assert.equal(pending.length, 2);
    pending[1].resolve({ json: async () => ({ profile: { diamonds: 22 } }) });
    assert.equal((await second).profile.diamonds, 22);
    pending[0].resolve({ json: async () => ({ profile: { diamonds: 11 } }) });
    await first;
    assert.equal((await getHeaderStats({ userId: 'account-b' })).profile.diamonds, 22);
    assert.equal(pending.length, 2);
    const forced = getHeaderStats({ userId: 'account-b', force: true });
    assert.equal(getHeaderStats({ userId: 'account-b', force: true }), forced);
    assert.equal(pending.length, 3);
    pending[2].resolve({ json: async () => ({ profile: { diamonds: 33 } }) });
    await forced;
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
    globalThis.localStorage = originalStorage;
  }
});
test('profile refresh shares the authenticated forced read and server derives identity', () => {
  const handler = header.slice(header.indexOf('const handleProfileUpdate = async'), header.indexOf('// Update localStorage cache with fresh profile data'));
  assert.match(handler, /getHeaderStats\(\{ userId: user\.id, force: true \}\)/);
  assert.doesNotMatch(handler, /fetch\(|method: 'POST'|JSON\.stringify/);
  assert.match(api, /req\.method !== 'POST' && req\.method !== 'GET'/);
  assert.match(api, /Cache-Control', 'private, no-store'/);
  assert.match(api, /const userId = localUser\.id/);
  assert.doesNotMatch(api, /req\.(?:body|query)\.userId/);
});
