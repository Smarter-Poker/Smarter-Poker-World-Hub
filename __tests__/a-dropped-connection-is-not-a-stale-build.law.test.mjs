// LAW (2026-11-27): a chunk that fails because the connection dropped is not a
// stale build. pages/_document.js's PWA stale-cache buster used to delete every
// cache and reload whenever any _next/static/chunks script failed. Offline, that
// threw the player onto the browser's ERR_INTERNET_DISCONNECTED page and wiped
// the offline copy the PWA needed. Found by e2e/029's Bankroll Export offline
// spec on a production build: going offline prefetched the dashboard chunk, it
// failed, and the Export page was replaced.
//
// The rule: offline does nothing; online, only the server answering 404/410 for
// that chunk URL busts caches and reloads. This test runs the real script.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const doc = fs.readFileSync(root + 'pages/_document.js', 'utf8');
const marker = doc.indexOf('PWA STALE CACHE BUSTER');
assert.ok(marker > 0, 'the stale cache buster is still in _document.js');
const start = doc.indexOf("window.addEventListener('error'", marker);
const end = doc.indexOf('}, true);', start) + '}, true);'.length;
// The script lives in a template literal, so undo its backslash escaping.
const script = doc.slice(start, end).replace(/\\\\/g, '\\');

async function run({ onLine, head }) {
  const calls = { reload: 0, cacheDeletes: 0, heads: [] };
  let listener;
  const store = new Map();
  const window = {
    addEventListener: (type, fn) => { if (type === 'error') listener = fn; },
    location: { reload: () => { calls.reload += 1; } },
    caches: undefined,
  };
  const caches = {
    keys: async () => ['pwa-pages', 'next-static'],
    delete: async () => { calls.cacheDeletes += 1; return true; },
  };
  window.caches = caches;
  const context = {
    window,
    caches,
    navigator: { onLine, serviceWorker: { getRegistrations: async () => [] } },
    sessionStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) },
    console: { warn: () => {} },
    fetch: async (url, init) => {
      calls.heads.push([url, init && init.method]);
      if (head === 'reject') throw new TypeError('Failed to fetch');
      return { status: head };
    },
    Promise,
  };
  vm.runInNewContext(script, context);
  assert.equal(typeof listener, 'function', 'the buster registers an error listener');
  listener({ target: { tagName: 'SCRIPT', src: 'https://smarter.poker/_next/static/chunks/pages/hub/bankroll-manager-abc.js' } });
  for (let i = 0; i < 10; i += 1) await new Promise(r => setImmediate(r));
  return calls;
}

test('offline: a failed chunk keeps the page and every cache', async () => {
  const calls = await run({ onLine: false, head: 404 });
  assert.equal(calls.reload, 0);
  assert.equal(calls.cacheDeletes, 0);
  assert.equal(calls.heads.length, 0, 'offline does not even probe');
});

test('online but the probe cannot connect: still not a stale build', async () => {
  const calls = await run({ onLine: true, head: 'reject' });
  assert.equal(calls.reload, 0);
  assert.equal(calls.cacheDeletes, 0);
});

test('online and the chunk is still served: a blip, not a stale build', async () => {
  const calls = await run({ onLine: true, head: 200 });
  assert.equal(calls.heads[0][1], 'HEAD');
  assert.equal(calls.reload, 0);
  assert.equal(calls.cacheDeletes, 0);
});

for (const status of [404, 410]) {
  test(`online and the chunk is gone (${status}): caches are cleared and the page reloads once`, async () => {
    const calls = await run({ onLine: true, head: status });
    assert.equal(calls.cacheDeletes, 2);
    assert.equal(calls.reload, 1);
  });
}
