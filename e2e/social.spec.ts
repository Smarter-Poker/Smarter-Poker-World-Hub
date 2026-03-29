import { test, expect } from '@playwright/test';

// ╔═══════════════════════════════════════════════════════════╗
// ║  SOCIAL & COMMUNITY — Page Load Tests                     ║
// ║  Verifies social features load without crashing           ║
// ╚═══════════════════════════════════════════════════════════╝

test.describe('Social — Hub Routes Load', () => {
  const socialRoutes = [
    { path: '/hub/friends', name: 'Friends' },
    { path: '/hub/messenger', name: 'Messenger' },
    { path: '/hub/social-media', name: 'Social Media' },
    { path: '/hub/social-pages', name: 'Social Pages' },
    { path: '/hub/reels', name: 'Reels' },
    { path: '/hub/lives', name: 'Lives' },
    { path: '/hub/leaderboards', name: 'Leaderboards' },
    { path: '/hub/news', name: 'News' },
    { path: '/hub/notifications', name: 'Notifications' },
  ];

  for (const { path, name } of socialRoutes) {
    test(`${name} (${path}) loads without 500`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBeLessThan(500);
    });
  }
});

test.describe('Social — Content Routes', () => {
  test('/hub/video-library loads without 500', async ({ page }) => {
    const response = await page.goto('/hub/video-library');
    expect(response?.status()).toBeLessThan(500);
  });

  test('/hub/events-calendar loads without 500', async ({ page }) => {
    const response = await page.goto('/hub/events-calendar');
    expect(response?.status()).toBeLessThan(500);
  });

  test('/hub/daily-tournaments loads without 500', async ({ page }) => {
    const response = await page.goto('/hub/daily-tournaments');
    expect(response?.status()).toBeLessThan(500);
  });

  test('/hub/promotions loads without 500', async ({ page }) => {
    const response = await page.goto('/hub/promotions');
    expect(response?.status()).toBeLessThan(500);
  });
});
