import { test, expect } from '@playwright/test';
import { expectPageLoads } from './utils';

// ╔═══════════════════════════════════════════════════════════╗
// ║  SMOKE TESTS — Core pages load without 500 errors         ║
// ║  Tests every major route in the platform                  ║
// ║  NO login required — tests public accessibility           ║
// ╚═══════════════════════════════════════════════════════════╝

test.describe('Smoke Tests — Public Pages', () => {
  test('homepage loads', async ({ page }) => {
    await expectPageLoads(page, '/');
    await expect(page.locator('body')).toBeVisible();
  });

  test('terms page loads', async ({ page }) => {
    await expectPageLoads(page, '/terms');
  });

  test('login page loads', async ({ page }) => {
    await expectPageLoads(page, '/auth/login');
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });

  test('signup page loads', async ({ page }) => {
    await expectPageLoads(page, '/auth/signup');
  });

  test('404 page renders for bad route', async ({ page }) => {
    const response = await page.goto('/this-page-does-not-exist-xyz');
    expect(response?.status()).toBe(404);
  });
});

test.describe('Smoke Tests — Hub Pages (may redirect to login)', () => {
  const hubRoutes = [
    'training',
    'news',
    'poker-near-me-lobby',
    'diamond-store',
    'bankroll',
    'preflop-charts',
    'diamond-arena',
    'trivia',
    'leaderboards',
    'social-media',
    'reels',
    'messenger',
    'settings',
    'profile',
  ];

  for (const route of hubRoutes) {
    test(`/hub/${route} loads without 500`, async ({ page }) => {
      const response = await page.goto(`/hub/${route}`);
      // Should either load (200) or redirect to auth (302) — never crash (500)
      expect(response?.status()).toBeLessThan(500);
    });
  }
});

test.describe('Smoke Tests — Demo Pages', () => {
  test('poker room demo loads', async ({ page }) => {
    await expectPageLoads(page, '/poker-room-demo');
  });

  test('premium table demo loads', async ({ page }) => {
    await expectPageLoads(page, '/premium-table-demo');
  });

  test('training table demo loads', async ({ page }) => {
    await expectPageLoads(page, '/training-table-demo');
  });
});

test.describe('Smoke Tests — Error Pages', () => {
  test('500 page exists', async ({ page }) => {
    // /500 is a Next.js convention — verify the custom 500 page renders
    const response = await page.goto('/500');
    // 500.js exists as a page file, should render (status may vary)
    expect(response?.status()).toBeLessThan(500);
  });

  test('clear-cache page loads', async ({ page }) => {
    const response = await page.goto('/clear-cache');
    expect(response?.status()).toBeLessThan(500);
  });

  test('investor page loads', async ({ page }) => {
    const response = await page.goto('/investor');
    expect(response?.status()).toBeLessThan(500);
  });
});
