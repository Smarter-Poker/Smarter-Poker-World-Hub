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

// Mounted-consumer proof only. The existing authenticated service-account
// setup is retained; controlled page responses do not qualify production SQL,
// RLS, financial producers or inbox receipts. No notification is inserted.
test.describe('Social — Notification Cache Cutover', () => {
  for (const cacheKind of ['pre-cutover', 'previous-account'] as const) {
    test(`${cacheKind} cache cannot paint and a personal response writes account/version provenance`, async ({ page }) => {
      const staleTitle = `Alerts cache regression: ${cacheKind} must not paint`;
      const freshTitle = `Alerts cache regression: ${cacheKind} personal result`;
      const freshId = `personal-cache-${cacheKind}`;
      let releaseResponse!: () => void;
      const responseAllowed = new Promise<void>(resolve => { releaseResponse = resolve; });
      let noteRequested!: () => void;
      const requested = new Promise<void>(resolve => { noteRequested = resolve; });

      // The mounted route normally marks the inbox seen. Keep that unrelated
      // write inside this browser fixture; do not mutate the standing account.
      await page.route('**/api/notifications/mark-seen', route => route.fulfill({
        status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }),
      }));
      await page.route('**/api/notifications/feed?limit=200', async route => {
        noteRequested();
        await responseAllowed;
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          success: true, totalUnread: 0, notifications: [{ id: freshId,
            type: 'new_message', title: freshTitle, message: freshTitle, actor_name: freshTitle,
            read: true, is_read: true, created_at: new Date().toISOString(), _source: 'social' }],
        }) });
      });
      await page.addInitScript(({ cacheKind, staleTitle }) => {
        const userId = JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}')?.user?.id;
        if (!userId) throw new Error('Notification cache fixture requires the existing authenticated setup');
        const cacheUser = cacheKind === 'previous-account' ? `previous-account:${userId}` : userId;
        localStorage.setItem('sp-notif-cache', JSON.stringify([{ id: 'old-operational-original',
          type: 'system', title: staleTitle, message: staleTitle, actor_name: staleTitle,
          read: true, created_at: new Date().toISOString(), _cache_ts: Date.now(),
          _cache_user: cacheUser, _cache_version: cacheKind === 'pre-cutover' ? 2 : 3 }]));
        const probe = window as Window & { __notificationCacheLeak?: boolean };
        probe.__notificationCacheLeak = false;
        new MutationObserver(records => {
          for (const record of records) {
            if (Array.from(record.addedNodes).some(node => node.textContent?.includes(staleTitle))) {
              probe.__notificationCacheLeak = true;
            }
          }
        }).observe(document, { childList: true, subtree: true });
      }, { cacheKind, staleTitle });

      try {
        await page.goto('/hub/notifications');
        await requested;
        // Two paint boundaries make the negative assertion observe hydration,
        // rather than passing before React has had a chance to use the cache.
        await page.evaluate(() => new Promise<void>(resolve => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }));
        expect(await page.evaluate(() =>
          (window as Window & { __notificationCacheLeak?: boolean }).__notificationCacheLeak)).toBe(false);
        await expect(page.getByText(staleTitle, { exact: true })).toHaveCount(0);
        releaseResponse();
        await expect(page.getByText(freshTitle, { exact: true }).first()).toBeVisible();
        await expect.poll(() => page.evaluate((expectedId) => {
          const rows = JSON.parse(localStorage.getItem('sp-notif-cache') || 'null');
          const userId = JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}')?.user?.id;
          return { id: rows?.[0]?.id, version: rows?.[0]?._cache_version,
            accountMatches: !!userId && rows?.[0]?._cache_user === userId,
            expected: rows?.[0]?.id === expectedId };
        }, freshId)).toEqual({ id: freshId, version: 3, accountMatches: true, expected: true });
      } finally {
        releaseResponse();
      }
    });
  }
});
