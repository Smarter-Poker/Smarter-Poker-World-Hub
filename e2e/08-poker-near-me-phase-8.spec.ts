import { test, expect, type Page } from '@playwright/test';

async function expectNoOverflow(page: Page, route: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${route} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
}

test.describe('Poker Near Me phase 8 signal integrity', () => {
  test('bounded venue responses publish integrity metadata and never return held pins', async ({ request }) => {
    const response = await request.get('/api/poker/venues?north=37&south=35&east=-114&west=-116.5&limit=1000');
    expect(response.status()).toBeLessThan(500);
    const payload = await response.json();
    expect(payload.success).toBeTruthy();
    expect(payload.data_integrity).toEqual(expect.objectContaining({
      input: expect.any(Number),
      mapped: expect.any(Number),
      held: expect.any(Number),
      duplicate_count: expect.any(Number),
    }));
    for (const venue of payload.data || []) {
      expect(venue.location_quality?.status).not.toBe('conflict');
      expect(venue.location_quality?.mappable).not.toBe(false);
    }
  });

  test('map console exposes signal integrity without horizontal overflow', async ({ page }) => {
    const route = '/hub/poker-near-me/map';
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    const map = page.locator('[data-map-ready="true"]').first();
    await expect(map).toBeVisible({ timeout: 30_000 });
    await expect(map).toHaveAttribute('data-map-integrity-held', /^\d+$/);
    const coverage = page.locator('[data-map-coverage="true"]').first();
    await expect(coverage).toBeVisible();
    await expect(coverage).toHaveAttribute('data-map-verified-count', /^\d+$/);
    await expect(coverage).toHaveAttribute('data-map-approximate-count', /^\d+$/);
    await expect(coverage).toHaveAttribute('data-map-integrity-held', /^\d+$/);
    await expectNoOverflow(page, route);
  });

  test('a held venue suppresses directions and structured geo when one is available', async ({ page, request }) => {
    const response = await request.get('/api/poker/venues?limit=1000');
    expect(response.status()).toBeLessThan(500);
    const payload = await response.json();
    const held = (payload.data || []).find((venue: { id?: string | number; location_quality?: { status?: string } }) =>
      venue?.id && venue.location_quality?.status === 'conflict');
    test.skip(!held, 'No held venue is present in this environment');

    await page.goto(`/hub/venues/${held.id}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Location signal held for review')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'Get directions' })).toHaveCount(0);
    const jsonLd = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(jsonLd.join('\n')).not.toContain('GeoCoordinates');
    await expectNoOverflow(page, `/hub/venues/${held.id}`);
  });
});
