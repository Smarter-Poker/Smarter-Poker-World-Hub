import { test, expect, type Page } from '@playwright/test';

async function expectNoOverflow(page: Page, route: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${route} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
}

test.describe('Poker Near Me phase 11 resilience and accessibility', () => {
  test.setTimeout(90_000);

  test('discovery identifies projected snapshot mode and exposes live retry', async ({ page }) => {
    await page.route('**/api/poker/venues?view=directory&limit=1000&offset=0', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          degraded: true,
          data_source: 'static_snapshot',
          data_integrity: { input: 1, mappable: 1, conflict: 0, missing: 0, unavailable: 0 },
          data: [{
            id: 2140,
            name: 'Sahara',
            venue_type: 'casino',
            city: 'Las Vegas',
            state: 'NV',
            latitude: 36.14232,
            longitude: -115.15649,
            is_active: true,
            location_quality: { status: 'verified', mappable: true },
          }],
          total: 1,
          offset: 0,
          limit: 1000,
          home_groups: [],
          total_home_groups: 0,
        }),
      });
    });

    const route = '/hub/poker-near-me/venues';
    const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);
    const status = page.locator('.pnm-directory-source');
    await expect(page.getByRole('main', { name: 'Poker Near Me discovery results' })).toBeVisible();
    await expect(status).toHaveAttribute('data-directory-source', 'static_snapshot');
    await expect(status).toContainText('last published venue snapshot');
    await expect(page.getByRole('button', { name: 'Retry live registry' })).toBeVisible();
    await expectNoOverflow(page, route);
  });

  test('lobby has a main landmark, keyboard skip path, and 44px local search controls', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const route = '/hub/poker-near-me/lobby';
    const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('main', { name: 'Poker Near Me discovery lobby' })).toBeVisible();

    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to Poker Near Me choices' })).toBeFocused();

    for (const name of ['Voice search', 'Use GPS location']) {
      const control = page.getByRole('button', { name });
      await expect(control).toBeVisible();
      const box = await control.boundingBox();
      expect(box?.width || 0, `${name} width`).toBeGreaterThanOrEqual(44);
      expect(box?.height || 0, `${name} height`).toBeGreaterThanOrEqual(44);
    }
    await expectNoOverflow(page, route);
  });
});
