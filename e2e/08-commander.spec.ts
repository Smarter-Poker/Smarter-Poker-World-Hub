import { test, expect } from '@playwright/test';
import { expectPageLoads } from './utils';

// ╔═══════════════════════════════════════════════════════════╗
// ║  COMMANDER (Tournament Director) — Page Load Tests        ║
// ║  Verifies all Commander sub-routes load without crashing  ║
// ╚═══════════════════════════════════════════════════════════╝

test.describe('Commander — Sub-Routes Load', () => {
  const commanderRoutes = [
    'admin',
    'check-in',
    'dealer',
    'displays',
    'docs',
    'members',
    'player',
    'reports',
    'table',
    'tablet',
    'td',
    'tournaments',
    'waitlist',
  ];

  for (const route of commanderRoutes) {
    test(`/commander/${route} loads without 500`, async ({ page }) => {
      const response = await page.goto(`/commander/${route}`);
      expect(response?.status()).toBeLessThan(500);
    });
  }
});

test.describe('Commander — Hub Integration', () => {
  test('/hub/commander loads without 500', async ({ page }) => {
    const response = await page.goto('/hub/commander');
    expect(response?.status()).toBeLessThan(500);
  });
});
