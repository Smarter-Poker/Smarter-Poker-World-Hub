import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const workerSource = fs.readFileSync(path.join(process.cwd(), 'worker/index.js'), 'utf8');
const currentCacheMatch = workerSource.match(/const TRIVIA_ART_CACHE = '(trivia-art-[0-9a-f]+)'/);
if (!currentCacheMatch) throw new Error('worker/index.js does not declare its compiled Trivia art cache');
const CURRENT_TRIVIA_CACHE = currentCacheMatch[1];

async function waitForRootWorker(page: import('@playwright/test').Page) {
  await page.waitForFunction(async () => {
    const registration = await navigator.serviceWorker.getRegistration('/');
    return Boolean(registration?.active?.scriptURL.endsWith('/sw.js'));
  }, null, { timeout: 30_000 });
}

test('installed Trivia PWA upgrades and rolls back without retaining rejected art or stale page code', async ({ page }) => {
  test.setTimeout(120_000);

  const response = await page.goto('/hub/trivia/arcade', { waitUntil: 'load' });
  expect(response?.status()).toBeLessThan(400);
  await waitForRootWorker(page);

  // The initial uncontrolled document is intentionally not reloaded by the
  // updater. Reload once so this is the installed/controlled PWA shape that a
  // returning mobile player actually has during an upgrade.
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => navigator.serviceWorker.controller?.scriptURL.endsWith('/sw.js'));

  const manifest = await page.evaluate(async () => (await fetch('/manifest.json')).json());
  expect(manifest.start_url).toBe('/hub');
  expect(manifest.display).toBe('standalone');

  await page.evaluate(async (currentCache) => {
    const absolute = (path: string) => new URL(path, window.location.origin).toString();
    const seed = async (cacheName: string, requestPath: string, body: string) => {
      const cache = await caches.open(cacheName);
      await cache.put(absolute(requestPath), new Response(body, { status: 200 }));
    };

    await seed(currentCache, '/images/trivia/current-release.webp', 'current');
    await seed('trivia-art-prior-rejected', '/images/trivia/prior-rejected.webp', 'old');
    await seed('trivia-art-forward-candidate', '/images/trivia/forward-candidate.webp', 'newer');
    await seed('static-assets', '/images/trivia/shared-cache-rejected.webp', 'rejected');
    await seed('static-assets', '/images/world/shared-cache-kept.webp', 'keep');
  }, CURRENT_TRIVIA_CACHE);

  // Unregistering and letting the app-owned updater install the exact built
  // worker models both directions: a forward upgrade and a rollback to the
  // prior manifest. In either direction the worker being installed is the
  // authority, and every other trivia-art-* cache must retire on activation.
  const unregistered = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration('/');
    return registration ? registration.unregister() : false;
  });
  expect(unregistered).toBe(true);

  await page.reload({ waitUntil: 'load' });
  await waitForRootWorker(page);
  await page.waitForFunction(async (currentCache) => {
    const names = await caches.keys();
    if (!names.includes(currentCache)) return false;
    if (names.includes('trivia-art-prior-rejected') || names.includes('trivia-art-forward-candidate')) return false;
    const shared = await caches.open('static-assets');
    const paths = (await shared.keys()).map((request) => new URL(request.url).pathname);
    return !paths.includes('/images/trivia/shared-cache-rejected.webp') && paths.includes('/images/world/shared-cache-kept.webp');
  }, CURRENT_TRIVIA_CACHE, { timeout: 30_000 });

  const cacheState = await page.evaluate(async () => {
    const names = await caches.keys();
    const requests = (await Promise.all(names.map(async (name) => {
      const cache = await caches.open(name);
      return Promise.all((await cache.keys()).map(async (request) => ({
        cache: name,
        path: new URL(request.url).pathname,
      })));
    }))).flat();
    return { names, requests };
  });

  expect(cacheState.names).toContain(CURRENT_TRIVIA_CACHE);
  expect(cacheState.names).not.toContain('trivia-art-prior-rejected');
  expect(cacheState.names).not.toContain('trivia-art-forward-candidate');
  expect(cacheState.requests.some((entry) => entry.cache === CURRENT_TRIVIA_CACHE && entry.path === '/images/trivia/current-release.webp')).toBe(true);
  expect(cacheState.requests.some((entry) => entry.path === '/images/trivia/shared-cache-rejected.webp')).toBe(false);
  expect(cacheState.requests.some((entry) => entry.path === '/images/world/shared-cache-kept.webp')).toBe(true);
  expect(cacheState.requests.some((entry) => /\/_next\/static\/chunks\/pages\//.test(entry.path))).toBe(false);
  expect(cacheState.requests.some((entry) => entry.path === '/hub/trivia/arcade')).toBe(false);
  await expect(page.locator('body')).toBeVisible();
});
