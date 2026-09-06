import { expect, test, type Page } from '@playwright/test';
import { WORLD_MENU_VISUAL_CASES, type WorldMenuVisualCase } from './fixtures/world-menu-cases';

test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ mode: 'serial', timeout: 90_000 });

async function openMenu(page: Page, world: WorldMenuVisualCase) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  if (world.id === 'news') {
    await page.addInitScript(() => window.sessionStorage.setItem('news-intro-seen', 'true'));
  }
  await page.goto(world.path, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => document.fonts.ready);
  const trigger = page.locator('[data-world-menu-trigger]');
  await expect(trigger).toHaveCount(1);
  await expect(trigger).toHaveAttribute('data-menu-symbol', 'hamburger');
  await trigger.click();
  const drawer = page.locator(`[data-world-command-menu="${world.id}"]`);
  await expect(drawer).toBeVisible();
  await expect(drawer).toHaveAttribute('data-world-menu-scheme', world.scheme);
  await expect(drawer).toHaveAttribute('data-world-menu-texture', world.texture);
  await expect(drawer.locator(`[data-world-primary-commands="${world.id}"] .sp-grid-tile`)).toHaveCount(6);
  await page.addStyleTag({
    content: '*,*::before,*::after{animation:none!important;caret-color:transparent!important;font-family:Arial,sans-serif!important;}',
  });
  return drawer;
}

for (const world of WORLD_MENU_VISUAL_CASES) {
  test(`${world.label} premium drawer matches desktop and mobile references`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    let drawer = await openMenu(page, world);
    expect(page.viewportSize()).toEqual({ width: 1440, height: 900 });
    expect(await page.evaluate(() => matchMedia('(max-height: 620px)').matches)).toBe(false);
    const desktopContract = await drawer.evaluate((element) => {
      const style = getComputedStyle(element);
      const deck = element.querySelector('[data-world-primary-commands]');
      return {
        accent: style.getPropertyValue('--world-accent').trim().toLowerCase(),
        canvas: style.getPropertyValue('--world-canvas').trim(),
        panel: style.getPropertyValue('--world-panel').trim(),
        tile: style.getPropertyValue('--world-tile').trim(),
        activeTile: style.getPropertyValue('--world-tile-active').trim(),
        border: style.getPropertyValue('--world-border').trim(),
        text: style.getPropertyValue('--world-text').trim(),
        muted: style.getPropertyValue('--world-muted').trim(),
        columns: deck ? getComputedStyle(deck).gridTemplateColumns.split(' ').length : 0,
      };
    });
    expect(desktopContract.accent).toBe(world.accent.toLowerCase());
    expect(desktopContract.columns).toBe(2);
    for (const [name, value] of Object.entries(desktopContract)) {
      if (name !== 'columns') expect(value, `${world.label} has an empty ${name} token`).not.toBe('');
    }
    await expect(page).toHaveScreenshot(`${world.id}-desktop.png`, {
      animations: 'disabled',
      caret: 'hide',
      clip: { x: 0, y: 0, width: 400, height: 900 },
      timeout: 20_000,
      threshold: 0.3,
      // Geometry and all semantic colors are asserted independently above.
      // Leave bounded room for Chromium rasterization differences between the
      // macOS authoring host and the Linux CI runner.
      maxDiffPixelRatio: 0.15,
    });

    await page.setViewportSize({ width: 320, height: 568 });
    drawer = await openMenu(page, world);
    expect(page.viewportSize()).toEqual({ width: 320, height: 568 });
    await expect(drawer).toHaveAttribute(
      'data-responsive-composition',
      world.id === 'social-media' ? 'preserved' : 'adaptive'
    );
    const mobileContract = await drawer.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const controls = Array.from(element.querySelectorAll(
        '.sp-command-utility-button, [data-world-primary-commands] .sp-grid-tile'
      ));
      const boxes = controls.map((control) => control.getBoundingClientRect());
      return {
        width: rect.width,
        height: rect.height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        horizontalOverflow: element.scrollWidth - element.clientWidth,
        documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        minControlWidth: Math.min(...boxes.map((box) => box.width)),
        minControlHeight: Math.min(...boxes.map((box) => box.height)),
      };
    });
    expect(mobileContract.width).toBeLessThanOrEqual(mobileContract.viewportWidth + 1);
    expect(Math.abs(mobileContract.height - mobileContract.viewportHeight)).toBeLessThanOrEqual(1);
    expect(mobileContract.horizontalOverflow).toBeLessThanOrEqual(1);
    expect(mobileContract.documentOverflow).toBeLessThanOrEqual(1);
    expect(mobileContract.minControlWidth).toBeGreaterThanOrEqual(44);
    expect(mobileContract.minControlHeight).toBeGreaterThanOrEqual(44);

    const lastAction = drawer.locator('a[href], button:not([disabled])').last();
    await lastAction.scrollIntoViewIfNeeded();
    await expect(lastAction).toBeVisible();
    const lastActionBox = await lastAction.boundingBox();
    expect(lastActionBox).not.toBeNull();
    expect((lastActionBox?.y || 0) + (lastActionBox?.height || 0)).toBeLessThanOrEqual(568);

    // Reachability deliberately scrolls the drawer. Reset the captured state so
    // the visual baseline always represents the menu entrance, independent of
    // each world's number of secondary actions or the browser's scroll anchor.
    await drawer.evaluate((element) => {
      element.scrollTop = 0;
      element.scrollLeft = 0;
    });
    await expect.poll(() => drawer.evaluate((element) => element.scrollTop)).toBe(0);

    if (world.id === 'social-media') {
      const socialTiles = await drawer.locator('.sp-grid-tile').evaluateAll((tiles) =>
        tiles.map((tile) => getComputedStyle(tile).backgroundColor)
      );
      expect(socialTiles.every((color) => ['rgb(255, 255, 255)', 'rgb(231, 243, 255)'].includes(color))).toBe(true);
    }
    await expect(page).toHaveScreenshot(`${world.id}-mobile.png`, {
      animations: 'disabled',
      caret: 'hide',
      clip: { x: 0, y: 0, width: 320, height: 568 },
      timeout: 20_000,
      threshold: 0.3,
      maxDiffPixelRatio: 0.15,
    });
  });
}
