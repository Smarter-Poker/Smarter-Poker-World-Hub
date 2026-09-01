import { test, expect, type Page } from '@playwright/test';

async function assertNoOverflow(page: Page, route: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${route} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
}

test.describe('Poker Near Me phase 5 data and detail surfaces', () => {
  test('series directory stays within its hydration budget and reaches a real detail page', async ({ page, request }) => {
    const response = await page.goto('/hub/poker-series', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBeLessThan(500);
    await expect(page.locator('[data-source-state]').first()).toBeVisible({ timeout: 20_000 });
    await assertNoOverflow(page, '/hub/poker-series');

    const nextDataBytes = await page.locator('#__NEXT_DATA__').evaluate((node) => new Blob([node.textContent || '']).size);
    expect(nextDataBytes, `series __NEXT_DATA__ is ${nextDataBytes} bytes`).toBeLessThan(128_000);

    const api = await request.get('/api/poker/series?limit=20');
    expect(api.status()).toBeLessThan(500);
    const payload = await api.json();
    expect(Array.isArray(payload?.data)).toBeTruthy();
    expect(payload?.meta?.generatedAt).toBeTruthy();
    const series = payload.data.find((entry: { id?: number }) => entry.id);
    test.skip(!series?.id, 'No public series is available in this environment');

    const detail = await page.goto(`/hub/series/${series.id}`, { waitUntil: 'domcontentloaded' });
    expect(detail?.status()).toBeLessThan(500);
    await expect(page.locator('h1')).toHaveCount(1, { timeout: 20_000 });
    await expect(page.locator('.pnm-identity-mark').first()).toBeVisible();
    await assertNoOverflow(page, `/hub/series/${series.id}`);
  });

  test('series API failure preserves the ranked cached directory and offers retry', async ({ page }) => {
    const response = await page.goto('/hub/poker-series', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBeLessThan(500);
    await expect(page.locator('.tour-card-premium').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('[data-source-state="live"], [data-source-state="degraded"]')).toBeVisible({ timeout: 20_000 });

    await page.route('**/api/poker/series?limit=999', (route) => route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ success: false, error: 'Synthetic audit outage' }),
    }));
    const refresh = page.getByRole('button', { name: 'Refresh' });
    await expect(refresh).toBeVisible({ timeout: 20_000 });
    await refresh.click();
    await expect(page.locator('[data-source-state="cached"]')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect(page.locator('.tour-card-premium').first()).toBeVisible();
    await assertNoOverflow(page, '/hub/poker-series');
  });

  test('daily schedule exposes provenance and valid deep links', async ({ page, request }) => {
    const response = await page.goto('/hub/daily-tournaments', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBeLessThan(500);
    await expect(page.locator('[data-source-state]').first()).toBeVisible({ timeout: 25_000 });
    await assertNoOverflow(page, '/hub/daily-tournaments');

    const api = await request.get('/api/poker/daily-tournaments?limit=25');
    expect(api.status()).toBeLessThan(500);
    const payload = await api.json();
    expect(payload?.meta?.generatedAt).toBeTruthy();
    expect(typeof payload?.meta?.degraded).toBe('boolean');

    const firstCardLink = page.locator('.tournament-card a[href^="/hub/venues/"], .tournament-card a[href^="/hub/home-games/"]').first();
    if (await firstCardLink.count()) {
      const href = await firstCardLink.getAttribute('href');
      expect(href).not.toContain('home_game_');
    }
  });

  test('broken remote identity media falls back without collapsing the card', async ({ page }) => {
    await page.goto('/hub/poker-series', { waitUntil: 'domcontentloaded' });
    const mark = page.locator('.pnm-identity-mark').first();
    await expect(mark).toBeVisible({ timeout: 20_000 });
    await expect.poll(async () => {
      const state = await mark.getAttribute('data-media-state');
      const image = mark.locator('img');
      if (state === 'image' && await image.count()) {
        // The live series list can replace its first card while data settles.
        // Dispatch the browser failure signal against whichever first card is
        // current instead of repeatedly changing an image URL and racing that
        // replacement render.
        await image.dispatchEvent('error');
      }
      return mark.getAttribute('data-media-state');
    }, { timeout: 15_000 }).toBe('fallback');
    await expect(mark.locator('.pnm-identity-mark__initials')).toBeVisible();
  });

  test('tour directory and a real tour detail remain healthy', async ({ page, request }) => {
    const directory = await page.goto('/hub/poker-tours', { waitUntil: 'domcontentloaded' });
    expect(directory?.status()).toBeLessThan(500);
    await assertNoOverflow(page, '/hub/poker-tours');

    const api = await request.get('/api/poker/tours?include_series=true&limit=20&traveling_only=true');
    expect(api.status()).toBeLessThan(500);
    const payload = await api.json();
    const tours = Array.isArray(payload) ? payload : (payload?.data || payload?.tours || []);
    const tour = tours.find((entry: { tour_code?: string }) => entry.tour_code);
    test.skip(!tour?.tour_code, 'No public tour is available in this environment');
    const detail = await page.goto(`/hub/tours/${encodeURIComponent(tour.tour_code)}`, { waitUntil: 'domcontentloaded' });
    expect(detail?.status()).toBeLessThan(500);
    await expect(page.locator('h1')).toHaveCount(1, { timeout: 20_000 });
    await assertNoOverflow(page, `/hub/tours/${tour.tour_code}`);
  });
});
