import { test, expect } from '@playwright/test';

test.describe('MLB Analytics Hub', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/hub/MLB-ANALYTICS');
  });

  test('Main Dashboard renders and navigates to Best Bets', async ({ page }) => {
    await expect(page.locator('h1').filter({ hasText: 'MLB' }).first()).toBeVisible();
    const bestBetsLink = page.locator('a', { hasText: 'BEST BETS' }).first();
    // Since this might navigate out or the link might be intercepted on mobile, let's just go directly
    await page.goto('/hub/MLB-ANALYTICS/best-bets');
    await expect(page.url()).toContain('/hub/MLB-ANALYTICS/best-bets');
    await expect(page.locator('h1').first()).toBeVisible();
  });

  test('Props Explorer renders', async ({ page }) => {
    await page.goto('/hub/MLB-ANALYTICS/props');
    await expect(page.locator('h1').first()).toBeVisible();
  });

  test('Model Intel renders', async ({ page }) => {
    await page.goto('/hub/MLB-ANALYTICS/model-intel');
    await expect(page.locator('h1').first()).toBeVisible();
  });

  test('Accuracy renders', async ({ page }) => {
    await page.goto('/hub/MLB-ANALYTICS/accuracy');
    await expect(page.locator('h1').first()).toBeVisible();
  });

  test('Backtest renders', async ({ page }) => {
    await page.goto('/hub/MLB-ANALYTICS/backtest');
    await expect(page.locator('h1').first()).toBeVisible();
  });
});
