import { expect, test } from '@playwright/test';
import { WORLD_MENU_VISUAL_CASES } from './fixtures/world-menu-cases';

test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ mode: 'serial', timeout: 60_000 });

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
