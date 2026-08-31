import { expect, test, type Page } from '@playwright/test';

async function expectNoOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${label} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
}

test.describe('Poker Near Me phase 13 closeout', () => {
  test.setTimeout(90_000);

  test('map discovery uses one local runtime skin with accessible controls', async ({ page }) => {
    const remoteLeaflet: string[] = [];
    page.on('request', (request) => {
      if (/unpkg\.com\/(?:leaflet|leaflet\.markercluster)/i.test(request.url())) remoteLeaflet.push(request.url());
    });

    const response = await page.goto('/hub/poker-near-me/map', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);
    const map = page.locator('[data-map-ready]').first();
    await expect(map).toHaveAttribute('data-map-ready', 'true', { timeout: 30_000 });
    await expect(map).toHaveAttribute('data-map-style-source', 'local');
    await expect(page.locator('link[data-pnm-map-style="poker-map-controls"]')).toHaveCount(1);
    const zoomControls = map.locator('.leaflet-control-zoom a');
    await expect(zoomControls).toHaveCount(2);
    for (let index = 0; index < 2; index += 1) {
      const box = await zoomControls.nth(index).boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
    expect(remoteLeaflet).toEqual([]);
    await expectNoOverflow(page, 'map discovery');
  });

  test('road-trip draft survives reload and renders a route without stale map sizing', async ({ page, isMobile }) => {
    const response = await page.goto('/hub/poker-near-me/roadtrip', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);
    const origin = page.getByRole('textbox', { name: 'Trip origin' });
    const destination = page.getByRole('textbox', { name: 'Trip destination' });
    await expect(origin).toBeVisible({ timeout: 30_000 });
    await origin.fill('Dallas, TX');
    await destination.fill('Las Vegas, NV');
    await page.getByRole('button', { name: 'Add Stop' }).click();
    await page.getByRole('textbox', { name: 'Trip waypoint 1' }).fill('Denver, CO');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(origin).toHaveValue('Dallas, TX');
    await expect(destination).toHaveValue('Las Vegas, NV');
    await expect(page.getByRole('textbox', { name: 'Trip waypoint 1' })).toHaveValue('Denver, CO');

    await page.getByRole('button', { name: 'Plan My Trip' }).click();
    await expect(page.locator('.rtp-stats-bar')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('region', { name: 'Poker road trip route map' })).toBeVisible();
    await expect(page.locator('.rtp-map-overlay')).toHaveCount(0, { timeout: 30_000 });

    if (isMobile) {
      const toggle = page.getByRole('button', { name: 'Hide Map' });
      await expect(toggle).toBeVisible();
      await toggle.click();
      await expect(page.getByRole('button', { name: 'Show Map' })).toHaveAttribute('aria-expanded', 'false');
      await page.getByRole('button', { name: 'Show Map' }).click();
      const box = await page.getByRole('region', { name: 'Poker road trip route map' }).boundingBox();
      expect(box?.width).toBeGreaterThan(300);
      expect(box?.height).toBeGreaterThanOrEqual(240);
    }

    await expectNoOverflow(page, 'road-trip planner');
  });

  test('road-trip dates reject incomplete and reversed ranges', async ({ page }) => {
    await page.goto('/hub/poker-near-me/roadtrip', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('textbox', { name: 'Trip origin' })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('textbox', { name: 'Trip origin' }).fill('Dallas, TX');
    await page.getByRole('textbox', { name: 'Trip destination' }).fill('Las Vegas, NV');
    await page.getByLabel('Trip start date').fill('2026-09-10');
    await page.getByRole('button', { name: 'Plan My Trip' }).click();
    await expect(page.locator('.rtp-error')).toContainText('both a start date and an end date');
    await page.getByLabel('Trip end date').fill('2026-09-01');
    await page.getByRole('button', { name: 'Plan My Trip' }).click();
    await expect(page.locator('.rtp-error')).toContainText('on or after the start date');
  });
});
