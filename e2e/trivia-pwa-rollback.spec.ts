import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const workerSource = fs.readFileSync(path.join(process.cwd(), 'worker/index.js'), 'utf8');
const currentCacheMatch = workerSource.match(/const TRIVIA_ART_CACHE = '(trivia-art-[0-9a-f]+)'/);
if (!currentCacheMatch) throw new Error('worker/index.js does not declare its compiled Trivia art cache');
const CURRENT_TRIVIA_CACHE = currentCacheMatch[1];

async function waitForRootWorker(page: import('@playwright/test').Page, expectedSearch = '') {
  await page.waitForFunction(async (search) => {
    const registration = await navigator.serviceWorker.getRegistration('/');
    const active = registration?.active;
    if (!active || active.state !== 'activated') return false;
    const url = new URL(active.scriptURL);
    return url.pathname === '/sw.js' && url.search === search;
  }, expectedSearch, { timeout: 30_000 });
}

async function activateRootWorker(
  page: import('@playwright/test').Page,
  scriptURL: string,
  expectedSearch: string,
) {
  await page.evaluate(async ({ script, search }) => {
    // This test owns worker activation, not updater reload behavior. Keep the
    // updater's existing one-minute reload guard closed so Playwright observes
    // one document and can await the exact candidate's state transition.
    sessionStorage.setItem('sp_sw_reloaded_at', String(Date.now()));
    const registration = await navigator.serviceWorker.register(script, { scope: '/' });
    const matches = (worker: ServiceWorker | null) => {
      if (!worker) return false;
      const url = new URL(worker.scriptURL);
      return url.pathname === '/sw.js' && url.search === search;
    };
    if (matches(registration.active) && registration.active?.state === 'activated') return;

    const candidate = registration.installing || registration.waiting;
    if (!candidate) throw new Error(`No service-worker candidate was created for ${script}`);
    if (candidate.state !== 'activated') {
      await new Promise<void>((resolve, reject) => {
        candidate.addEventListener('statechange', () => {
          if (candidate.state === 'activated') resolve();
          if (candidate.state === 'redundant') reject(new Error(`Service-worker activation failed for ${script}`));
        });
      });
    }
    if (!matches(registration.active)) throw new Error(`Unexpected active service worker for ${script}`);
  }, { script: scriptURL, search: expectedSearch });
  await waitForRootWorker(page, expectedSearch);
}

async function seedRejectedCaches(page: import('@playwright/test').Page) {
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
}

async function waitForAuthoritativeCaches(page: import('@playwright/test').Page) {
  await page.waitForFunction(async (currentCache) => {
    const names = await caches.keys();
    if (!names.includes(currentCache)) return false;
    if (names.includes('trivia-art-prior-rejected') || names.includes('trivia-art-forward-candidate')) return false;
    const shared = await caches.open('static-assets');
    const paths = (await shared.keys()).map((request) => new URL(request.url).pathname);
    return !paths.includes('/images/trivia/shared-cache-rejected.webp') && paths.includes('/images/world/shared-cache-kept.webp');
  }, CURRENT_TRIVIA_CACHE, { timeout: 30_000 });
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

  await seedRejectedCaches(page);

  // A different script URL forces a real update lifecycle without unregistering
  // the worker that still controls this installed-PWA document. Unregistering
  // leaves that old controller alive until the document closes, so merely
  // finding an active /sw.js can observe the previous worker and falsely race
  // event.waitUntil. The query is release identity only; both directions still
  // execute the exact generated worker bytes under test.
  await activateRootWorker(page, '/sw.js?trivia-release=forward-candidate', '?trivia-release=forward-candidate');
  await waitForAuthoritativeCaches(page);

  // Re-seed rejected forward state, then return to the canonical script URL.
  // This is the rollback direction and must run the same atomic activation.
  await seedRejectedCaches(page);
  await activateRootWorker(page, '/sw.js', '');
  await waitForAuthoritativeCaches(page);

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
