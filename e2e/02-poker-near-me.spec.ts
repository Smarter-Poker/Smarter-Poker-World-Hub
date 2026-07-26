import { test, expect } from '@playwright/test';

// The legacy lobby URL 301s to the canonical sub-route (see redirects() in next.config.js).
const CANONICAL_LOBBY_URL = /\/hub\/poker-near-me\/lobby\/?(\?.*)?$/;

test.describe('2. Poker Near Me Flow', () => {
  test('Venue cards render securely on the Poker Near Me directory', async ({ page }) => {
    // Any uncaught client-side exception (e.g. a crash right after hydration) must fail
    // this test — otherwise an empty shell still counts as a pass.
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err?.message || String(err)));

    const response = await page.goto('/hub/poker-near-me-lobby', { waitUntil: 'domcontentloaded' });

    // 1. The legacy URL must actually resolve (not 404/500) and land on the canonical lobby route
    expect(response, 'no response for /hub/poker-near-me-lobby').not.toBeNull();
    expect(response!.status(), `unexpected HTTP status ${response!.status()}`).toBeLessThan(400);
    await expect(page).toHaveURL(CANONICAL_LOBBY_URL, { timeout: 15000 });

    // 2. The lobby shell itself rendered — the 404 page has neither of these
    await expect(page).toHaveTitle(/Poker Near Me/i, { timeout: 15000 });
    await expect(page.locator('.pnm-lobby-page')).toBeVisible({ timeout: 15000 });

    // 3. The client bundle hydrated and the (ssr:false) overlay mounted. The search bar is
    //    the only overlay chrome guaranteed to have a layout box, so assert visibility here.
    await expect(
      page.getByRole('button', { name: 'Search for poker venues, tours, and series' })
    ).toBeVisible({ timeout: 20000 });

    // 4. Safety read-only test: the feature pods populated without any database mutation.
    //    The hotspots are intentionally transparent overlays sized off the grid image, so
    //    assert presence in the DOM rather than paint-level visibility.
    const podHotspots = page.locator('[data-tutorial-id^="pod-"]');
    await expect(podHotspots.first()).toBeAttached({ timeout: 20000 });
    expect(await podHotspots.count(), 'no Poker Near Me feature pods rendered').toBeGreaterThan(0);
    await expect(page.getByRole('button', { name: 'Open Poker Near Me' })).toBeAttached({ timeout: 20000 });

    // 5. No error shell and no client-side crash
    await expect(page.getByText('Application Error', { exact: true })).toHaveCount(0);
    expect(pageErrors, `uncaught client-side errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});
