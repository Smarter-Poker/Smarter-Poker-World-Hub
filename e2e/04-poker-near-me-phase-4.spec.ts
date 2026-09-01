import { test, expect, type Page } from '@playwright/test';

const PUBLIC_ROUTE_MATRIX = [
  '/hub/poker-near-me/lobby',
  '/hub/poker-near-me/live-games',
  '/hub/poker-near-me/venues',
  '/hub/poker-near-me/map',
  '/hub/poker-near-me/events',
  '/hub/poker-near-me/roadtrip',
  '/hub/poker-near-me/alerts',
  '/hub/poker-near-me/more',
  '/hub/poker-near-me/series',
  '/hub/events-calendar',
  '/hub/daily-tournaments',
  '/hub/poker-tours',
  '/hub/home-games/near-me',
  '/hub/poker-near-me/in',
];

async function assertHealthySurface(page: Page, route: string) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const response = await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  expect(response, `no response for ${route}`).not.toBeNull();
  expect(response!.status(), `${route} returned ${response!.status()}`).toBeLessThan(500);
  await expect(page.locator('body')).toBeVisible();
  await expect(page.getByText('Application Error', { exact: true })).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${route} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
  expect(errors, `${route} uncaught errors: ${errors.join(' | ')}`).toEqual([]);
}

test.describe('Poker Near Me phase 4 public route matrix', () => {
  for (const route of PUBLIC_ROUTE_MATRIX) {
    test(`${route} renders without regressions`, async ({ page }) => {
      await assertHealthySurface(page, route);
    });
  }

  test('state and city discovery drill down through real directory links', async ({ page }) => {
    await assertHealthySurface(page, '/hub/poker-near-me/in');
    const stateLink = page.locator('a[href^="/hub/poker-near-me/in/"]').first();
    await expect(stateLink).toBeVisible({ timeout: 20_000 });
    const stateHref = await stateLink.getAttribute('href');
    expect(stateHref).toBeTruthy();
    await assertHealthySurface(page, stateHref!);
    await expect(page.locator('.pnm-deep-deck h1')).toContainText(/Poker Rooms in/i);

    const cityLink = page.locator(`a[href^="${stateHref}/"]`).first();
    if (await cityLink.count()) {
      const cityHref = await cityLink.getAttribute('href');
      await assertHealthySurface(page, cityHref!);
      await expect(page.locator('.pnm-location-card').first()).toBeVisible({ timeout: 20_000 });
    }
  });

  test('a real venue detail inherits the shared chassis', async ({ page, request }) => {
    const api = await request.get('/api/poker/venues?limit=1');
    expect(api.status()).toBeLessThan(500);
    const payload = await api.json();
    const venue = payload?.data?.[0];
    test.skip(!venue?.id, 'No public venue is available in this environment');
    await assertHealthySurface(page, `/hub/venues/${venue.id}`);
    const venueTitle = page.locator('.pnm-deep-deck h1');
    await expect(venueTitle).toBeVisible({ timeout: 20_000 });
    expect((await venueTitle.innerText()).toLocaleLowerCase()).toContain(String(venue.name).toLocaleLowerCase());
    await expect(page.getByRole('button', { name: /Save Venue|Saved/ })).toBeVisible();
  });

  test('a real public home game inherits the shared chassis when available', async ({ page, request }) => {
    const api = await request.get('/api/public/home-games/discover?limit=1');
    test.skip(api.status() >= 500, 'Public home-game data is unavailable in this environment');
    const payload = await api.json();
    const group = (payload?.groups || []).find((entry: { slug?: string }) => entry.slug);
    test.skip(!group?.slug, 'No public home game is available in this environment');
    await assertHealthySurface(page, `/hub/home-games/${group.slug}`);
    await expect(page.locator('.pnm-deep-deck h1')).toContainText(group.name, { timeout: 20_000 });
  });

  test('map exposes a keyboard-focusable accessible region', async ({ page }) => {
    await page.goto('/hub/poker-near-me/map', { waitUntil: 'domcontentloaded' });
    const map = page.getByRole('region', { name: /poker venue map/i }).first();
    await expect(map).toBeAttached({ timeout: 25_000 });
    await map.focus();
    await expect(map).toBeFocused();
  });
});
