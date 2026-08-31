import { expect, test, type Page } from '@playwright/test';

async function expectNoOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${label} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
}

function collectMapRuntimeErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    if (/leaflet|map container|already initialized|removeLayer/i.test(error.message)) errors.push(error.message);
  });
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error' && /leaflet|map container|already initialized|removeLayer/i.test(text)) errors.push(text);
  });
  return errors;
}

test.describe('Poker Near Me phase 14 shared map foundation', () => {
  test.setTimeout(120_000);

  test('primary discovery map renders shared markers and popup actions', async ({ page }) => {
    const runtimeErrors = collectMapRuntimeErrors(page);
    const response = await page.goto('/hub/poker-near-me/map', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);

    const map = page.locator('[data-map-foundation="shared-v2"][data-map-ready]').first();
    await expect(map).toHaveAttribute('data-map-ready', 'true', { timeout: 30_000 });
    await expect(map).toHaveAttribute('data-map-style-source', 'local');
    await expect(map).toHaveAttribute('data-map-clustering', /available|disabled/);
    await expect.poll(async () => Number(await map.getAttribute('data-map-marker-count')), {
      timeout: 30_000,
      message: 'expected live venue data to reach the shared marker layer',
    }).toBeGreaterThan(0);

    const marker = map.locator('.venue-map-marker').first();
    if (await marker.count()) {
      await marker.click({ force: true });
      const popup = map.locator('.leaflet-popup').last();
      await expect(popup).toBeVisible();
      await expect(popup.locator('.fsp-trigger')).toHaveAttribute('data-url', /^\/hub\/(?:venues|tours)\//);
      await expect(popup.locator('.directions-trigger')).toBeVisible();
    }

    await expect(page.locator('link[data-pnm-map-style="poker-map-controls"]')).toHaveCount(1);
    await expectNoOverflow(page, 'primary discovery map');
    expect(runtimeErrors).toEqual([]);
  });

  test('lobby map survives rapid pod teardown and recreation', async ({ page }) => {
    const runtimeErrors = collectMapRuntimeErrors(page);
    await page.addInitScript(() => {
      localStorage.setItem('pnm_lobby_tutorial_seen', '1');
    });
    const response = await page.goto('/hub/poker-near-me/lobby?pod=mapview', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);

    const sharedMap = page.getByRole('region', { name: 'Poker venues map' });
    await expect(sharedMap).toHaveAttribute('data-map-foundation', 'shared-v2', { timeout: 30_000 });
    await expect(sharedMap).toHaveAttribute('data-map-ready', 'true', { timeout: 30_000 });

    for (let cycle = 0; cycle < 2; cycle += 1) {
      await page.getByRole('button', { name: 'Search', exact: true }).click();
      await expect(sharedMap).toHaveCount(0);
      await page.getByRole('button', { name: 'Map', exact: true }).click();
      await expect(sharedMap).toHaveAttribute('data-map-ready', 'true', { timeout: 30_000 });
    }

    await expect(page.locator('link[data-pnm-map-style="poker-map-controls"]')).toHaveCount(1);
    await expectNoOverflow(page, 'lobby map panel');
    expect(runtimeErrors).toEqual([]);
  });

  test('shared map shell remains usable when background tiles are unavailable', async ({ page }) => {
    const runtimeErrors = collectMapRuntimeErrors(page);
    await page.route(/^https:\/\/[^/]*\.basemaps\.cartocdn\.com\//, (route) => route.abort());
    await page.goto('/hub/poker-near-me/map', { waitUntil: 'domcontentloaded' });

    const map = page.locator('[data-map-foundation="shared-v2"]').first();
    await expect(map).toHaveAttribute('data-map-ready', 'true', { timeout: 30_000 });
    await expect(map.locator('.leaflet-control-zoom')).toBeVisible();
    await expect.poll(async () => Number(await map.getAttribute('data-map-marker-count')), {
      timeout: 30_000,
    }).toBeGreaterThan(0);
    await expectNoOverflow(page, 'degraded-tile map');
    expect(runtimeErrors).toEqual([]);
  });

  test('road-trip map replaces malformed stale storage with a shared session', async ({ page }) => {
    const runtimeErrors = collectMapRuntimeErrors(page);
    await page.addInitScript(() => {
      localStorage.setItem('pnm_trip_draft_v1', '{stale-invalid-json');
    });
    await page.goto('/hub/poker-near-me/roadtrip', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('textbox', { name: 'Trip origin' })).toBeVisible({ timeout: 30_000 });
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('feature-access-changed', {
        detail: { featureKey: 'poker_near_me' },
      }));
    });
    await page.getByRole('textbox', { name: 'Trip origin' }).fill('Dallas, TX');
    await page.getByRole('textbox', { name: 'Trip destination' }).fill('Las Vegas, NV');
    await page.getByRole('button', { name: 'Plan My Trip' }).click();

    const routeMap = page.getByRole('region', { name: 'Poker road trip route map' });
    await expect(routeMap).toHaveAttribute('data-map-foundation', 'shared-v2', { timeout: 30_000 });
    await expect(page.locator('.rtp-map-overlay')).toHaveCount(0, { timeout: 30_000 });
    await expectNoOverflow(page, 'road-trip shared map');
    expect(runtimeErrors).toEqual([]);
  });
});
