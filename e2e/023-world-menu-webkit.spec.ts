import { expect, test, type Page } from '@playwright/test';
import { WORLD_MENU_VISUAL_CASES } from './fixtures/world-menu-cases';

test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ mode: 'serial', timeout: 60_000 });

async function installReelsFixture(page: Page) {
  const fixture = [{
    id: 'phase-2-menu-audit-reel',
    author_id: 'phase-2-menu-audit-author',
    caption: 'Phase 2 Menu Audit',
    video_url: 'https://media.smarter.poker.test/phase-2-menu-audit.mp4',
    thumbnail_url: null,
    view_count: 0,
    like_count: 0,
    comment_count: 0,
    created_at: '2026-09-06T00:00:00.000Z',
    is_public: true,
    source_type: 'user',
  }];
  await page.route('**/rest/v1/social_reels*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'content-range': '0-0/1' },
      body: JSON.stringify(fixture),
    });
  });
  await page.route('**/rest/v1/profiles*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        id: 'phase-2-menu-audit-author',
        username: 'MenuAudit',
        avatar_url: null,
        full_name: 'Menu Audit',
      }]),
    });
  });
  await page.route('https://media.smarter.poker.test/phase-2-menu-audit.mp4', async (route) => {
    await route.fulfill({ status: 204, body: '' });
  });
}

for (const world of WORLD_MENU_VISUAL_CASES) {
  test(`${world.label} is contained and reachable in mobile WebKit`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    if (world.id === 'news') {
      await page.addInitScript(() => window.sessionStorage.setItem('news-intro-seen', 'true'));
    }
    await page.goto(world.path, { waitUntil: 'domcontentloaded' });
    const trigger = page.locator('[data-world-menu-trigger]');
    await expect(trigger).toHaveCount(1);
    await expect(trigger).toHaveAttribute('data-menu-symbol', 'hamburger');
    await trigger.click();

    const drawer = page.locator(`[data-world-command-menu="${world.id}"]`);
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveAttribute('data-world-menu-scheme', world.scheme);
    await expect(drawer.locator(`[data-world-primary-commands="${world.id}"] .sp-grid-tile`)).toHaveCount(6);

    const metrics = await drawer.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const controls = Array.from(element.querySelectorAll(
        '.sp-command-utility-button, [data-world-primary-commands] .sp-grid-tile'
      )).map((control) => control.getBoundingClientRect());
      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        horizontalOverflow: element.scrollWidth - element.clientWidth,
        minControlWidth: Math.min(...controls.map((box) => box.width)),
        minControlHeight: Math.min(...controls.map((box) => box.height)),
        bodyOverflow: getComputedStyle(document.body).overflow,
      };
    });
    expect(Math.abs(metrics.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(metrics.y)).toBeLessThanOrEqual(1);
    expect(metrics.width).toBeLessThanOrEqual(metrics.viewportWidth + 1);
    expect(Math.abs(metrics.height - metrics.viewportHeight)).toBeLessThanOrEqual(1);
    expect(metrics.horizontalOverflow).toBeLessThanOrEqual(1);
    expect(metrics.minControlWidth).toBeGreaterThanOrEqual(44);
    expect(metrics.minControlHeight).toBeGreaterThanOrEqual(44);
    expect(metrics.bodyOverflow).toBe('hidden');

    await expect.poll(() => drawer.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      const actions = element.querySelectorAll('a[href], button:not([disabled])');
      const lastAction = actions.item(actions.length - 1);
      if (!lastAction) return false;
      const box = lastAction.getBoundingClientRect();
      return box.top >= 0 && box.bottom <= window.innerHeight;
    })).toBe(true);

    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  });
}

for (const path of ['/hub/friends', '/hub/messenger', '/hub/reels']) {
  test(`Social Media fallback stays tappable in mobile WebKit on ${path}`, async ({ page }) => {
    if (path === '/hub/reels') await installReelsFixture(page);
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    const trigger = page.locator('[data-world-menu-trigger="route-fallback"]');
    await expect(page.locator('[data-world-menu-trigger]')).toHaveCount(1);
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute('data-menu-symbol', 'hamburger');
    await expect(trigger).toHaveAttribute('data-world-menu-scheme', 'facebook');
    await trigger.click();

    const drawer = page.locator('[data-world-command-menu="social-media"]');
    await expect(drawer).toHaveCount(1);
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveAttribute('data-world-menu-scheme', 'facebook');
    await expect(drawer).toHaveAttribute('data-responsive-composition', 'preserved');
    await expect(drawer.locator('[data-world-primary-commands="social-media"] .sp-grid-tile')).toHaveCount(6);
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(trigger).toBeFocused();

    if (path === '/hub/reels') {
      const reelsOverlay = page.locator('[data-reels-overlay-trigger="true"]');
      await expect(reelsOverlay).toHaveCount(1);
      await trigger.click();
      await reelsOverlay.evaluate((element: HTMLElement) => element.click());
      const approvedTrigger = page.locator('[data-world-menu-trigger="approved-header"]');
      await expect(approvedTrigger).toHaveCount(1);
      await expect(drawer).toBeHidden();
      await approvedTrigger.click();
      await expect(drawer).toBeVisible();
      await page.waitForTimeout(5_500);
      await expect(approvedTrigger).toHaveCount(1);
      await expect(drawer).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(drawer).toBeHidden();
      await expect(page.locator('[data-world-menu-trigger="route-fallback"]')).toHaveCount(1, {
        timeout: 7_000,
      });
      await expect(page.locator('[data-world-menu-trigger="route-fallback"]')).toBeFocused();
      await expect(drawer).toBeHidden();
    }
  });
}
