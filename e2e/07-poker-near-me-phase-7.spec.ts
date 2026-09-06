import { test, expect, type Page } from '@playwright/test';

async function expectNoOverflow(page: Page, route: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${route} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
}

test.describe('Poker Near Me phase 7 map scale and operations', () => {
  test.describe.configure({ timeout: 60_000 });

  test('map runtime serves local styles and publishes live coverage telemetry', async ({ page }, testInfo) => {
    testInfo.snapshotSuffix = '';
    const remoteMapAssets: string[] = [];
    page.on('request', (request) => {
      if (!['script', 'stylesheet'].includes(request.resourceType())) return;
      const hostname = new URL(request.url()).hostname;
      const isFirstParty = hostname === 'smarter.poker' || hostname === 'localhost' || hostname === '127.0.0.1';
      if (/leaflet|markercluster/i.test(request.url()) && !isFirstParty) {
        remoteMapAssets.push(request.url());
      }
    });

    const response = await page.goto('/hub/poker-series', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBeLessThan(500);
    const map = page.locator('[data-map-ready="true"]').first();
    await expect(map).toBeVisible({ timeout: 30_000 });
    await expect(map).toHaveAttribute('data-map-style-source', 'local');
    await expect.poll(async () => Number(await map.getAttribute('data-map-load-ms'))).toBeGreaterThanOrEqual(0);

    const coverage = page.locator('[data-map-coverage="true"]').first();
    await expect(coverage).toBeVisible();
    await expect.poll(async () => Number(await coverage.getAttribute('data-map-total-count')), { timeout: 20_000 }).toBeGreaterThan(0);
    const total = Number(await coverage.getAttribute('data-map-total-count'));
    const visible = Number(await coverage.getAttribute('data-map-visible-count'));
    expect(total).toBeGreaterThan(0);
    expect(visible).toBeGreaterThanOrEqual(0);
    expect(visible).toBeLessThanOrEqual(total);
    expect(remoteMapAssets).toEqual([]);
    await expect(coverage.locator('.pnm-map-coverage__signal')).toHaveScreenshot(
      `phase7-map-signal-${testInfo.project.name}.png`,
      {
        animations: 'disabled',
        caret: 'hide',
        maxDiffPixelRatio: 0.02,
      }
    );
    await expectNoOverflow(page, '/hub/poker-series');
  });

  test('venue API validates and enforces viewport bounds', async ({ request }) => {
    const partial = await request.get('/api/poker/venues?north=37&limit=10');
    expect(partial.status()).toBe(400);
    expect((await partial.json()).error).toContain('must be provided together');

    const bounded = await request.get('/api/poker/venues?north=37&south=35&east=-114&west=-116.5&limit=1000');
    expect(bounded.status()).toBeLessThan(500);
    const payload = await bounded.json();
    expect(payload.success).toBeTruthy();
    expect(payload.viewport).toEqual({ north: 37, south: 35, east: -114, west: -116.5 });
    expect(Array.isArray(payload.data)).toBeTruthy();
    for (const venue of payload.data) {
      const lat = Number(venue.latitude ?? venue.lat);
      const lng = Number(venue.longitude ?? venue.lng);
      expect(Number.isFinite(lat)).toBeTruthy();
      expect(Number.isFinite(lng)).toBeTruthy();
      expect(lat).toBeGreaterThanOrEqual(35);
      expect(lat).toBeLessThanOrEqual(37);
      expect(lng).toBeGreaterThanOrEqual(-116.5);
      expect(lng).toBeLessThanOrEqual(-114);
    }
  });

  test('lobby map can search a user-selected area and restore the network view', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('pnm_lobby_tutorial_seen', '1'));
    const viewportRequest: { current: URL | null } = { current: null };
    await page.route('**/api/poker/venues?*', async (route) => {
      const url = new URL(route.request().url());
      if (!url.searchParams.has('north')) return route.continue();
      viewportRequest.current = url;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            { id: 910001, name: 'Phase Seven North', venue_type: 'casino', city: 'Las Vegas', state: 'NV', latitude: 36.18, longitude: -115.14 },
            { id: 910002, name: 'Phase Seven South', venue_type: 'card_room', city: 'Las Vegas', state: 'NV', latitude: 36.08, longitude: -115.18 },
          ],
          total: 2,
          viewport: Object.fromEntries(['north', 'south', 'east', 'west'].map((key) => [key, Number(url.searchParams.get(key))])),
        }),
      });
    });

    const response = await page.goto('/hub/poker-near-me/lobby?pod=mapview', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBeLessThan(500);
    const map = page.locator('[data-map-ready="true"]').first();
    await expect(map).toBeVisible({ timeout: 30_000 });
    const box = await map.boundingBox();
    expect(box).toBeTruthy();
    if (!box) return;
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.35);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.35, { steps: 8 });
    await page.mouse.up();

    const searchArea = page.getByRole('button', { name: 'Search this area' });
    await expect(searchArea).toBeVisible({ timeout: 10_000 });
    expect((await searchArea.boundingBox())?.height || 0).toBeGreaterThanOrEqual(44);
    await searchArea.click();
    await expect.poll(() => viewportRequest.current?.searchParams.has('north') || false).toBeTruthy();
    for (const key of ['north', 'south', 'east', 'west']) expect(viewportRequest.current?.searchParams.has(key)).toBeTruthy();

    const coverage = page.locator('[data-map-coverage="true"]').first();
    await expect(coverage).toHaveAttribute('data-map-area-scoped', 'true');
    const showAll = page.getByRole('button', { name: 'Show all' });
    await expect(showAll).toBeVisible();
    await showAll.click();
    await expect(coverage).toHaveAttribute('data-map-area-scoped', 'false');
    await expectNoOverflow(page, '/hub/poker-near-me/lobby?pod=mapview');
  });
});
