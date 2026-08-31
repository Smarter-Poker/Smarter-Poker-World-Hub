import { expect, test, type Page } from '@playwright/test';

async function expectNoOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow, `${label} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
}

test.describe('Poker Near Me phase 16 controller decomposition', () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('pnm_lobby_tutorial_seen', '1');
      localStorage.setItem('pnm_location_prompt_dismissed', '1');
    });
  });

  test('legacy deep links normalize through the shared route controller', async ({ page }) => {
    const response = await page.goto('/hub/poker-near-me/daily?filter=poker_tour', {
      waitUntil: 'domcontentloaded',
    });
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('tablist', { name: 'Poker Near Me sections' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page).toHaveURL(/\/hub\/poker-near-me\/daily-tournaments\?filter=tour_stop$/, {
      timeout: 15_000,
    });
    await expect(page.getByRole('tab', { name: /Events/i })).toHaveAttribute('aria-selected', 'true');
    await expectNoOverflow(page, 'normalized daily route');
  });

  test('lobby panel controller owns focus, Escape, and teardown', async ({ page }) => {
    const response = await page.goto('/hub/poker-near-me/lobby?pod=mapview', {
      waitUntil: 'domcontentloaded',
    });
    expect(response?.status()).toBe(200);
    const dialog = page.getByRole('dialog', { name: /Map View/i });
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Back to grid' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expectNoOverflow(page, 'lobby after panel teardown');
  });

  test('390x844 swipe navigation remains route-synchronized after extraction', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const response = await page.goto('/hub/poker-near-me/venues', {
      waitUntil: 'domcontentloaded',
    });
    expect(response?.status()).toBe(200);
    const content = page.locator('.pnm-content');
    await expect(content).toBeVisible({ timeout: 30_000 });

    await content.dispatchEvent('touchstart', {
      touches: [{ identifier: 0, clientX: 330, clientY: 360, pageX: 330, pageY: 360 }],
    });
    await content.dispatchEvent('touchmove', {
      touches: [{ identifier: 0, clientX: 100, clientY: 365, pageX: 100, pageY: 365 }],
    });
    await content.dispatchEvent('touchend', { touches: [] });

    await expect(page.getByRole('tab', { name: /Events/i })).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(/\/hub\/poker-near-me\/daily-tournaments(?:\?.*)?$/, {
      timeout: 15_000,
    });
    await expectNoOverflow(page, '390x844 swipe target');
  });
});
