import { expect, test, type Locator, type Page } from '@playwright/test';
import { WORLD_MENU_VISUAL_CASES, expectStillInWorld, type WorldMenuVisualCase } from './fixtures/world-menu-cases';

test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ mode: 'serial', timeout: 90_000 });

async function openMenu(page: Page, world: WorldMenuVisualCase) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  if (world.id === 'news') {
    await page.addInitScript(() => window.sessionStorage.setItem('news-intro-seen', 'true'));
  }
  await page.goto(world.path, { waitUntil: 'domcontentloaded' });
  await expectStillInWorld(page, world);
  await page.evaluate(() => document.fonts.ready);
  const trigger = page.locator('[data-world-menu-trigger]');
  await expect(trigger).toHaveCount(1);
  await expect(trigger).toHaveAttribute('data-menu-symbol', 'hamburger');
  const drawer = page.locator(`[data-world-command-menu="${world.id}"]:visible`);
  await expect.poll(async () => {
    if (await drawer.count()) return true;
    const currentTrigger = page.locator('[data-world-menu-trigger]:visible').first();
    if (await currentTrigger.count()) await currentTrigger.click();
    return false;
  }, { timeout: 10_000 }).toBe(true);
  await expect(drawer).toHaveCount(1);
  await expect(drawer).toBeVisible();
  await expect(drawer).toHaveAttribute('data-world-menu-scheme', world.scheme);
  await expect(drawer).toHaveAttribute('data-world-menu-texture', world.texture);
  await expect(drawer.locator(`[data-world-primary-commands="${world.id}"] .sp-grid-tile`)).toHaveCount(6);
  await page.addStyleTag({
    content: '*,*::before,*::after{animation:none!important;caret-color:transparent!important;font-family:Arial,sans-serif!important;}',
  });
  return drawer;
}

async function expectDrawerSnapshot(
  page: Page,
  drawer: Locator,
  name: string,
  size: { width: number; height: number },
) {
  const rect = await drawer.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  });
  expect(Math.abs(rect.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(rect.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(rect.width - size.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(rect.height - size.height)).toBeLessThanOrEqual(1);

  // Capture the already-verified drawer pixels directly. Locator screenshots
  // wait for the host page to become stable before they rasterize, so a heavy
  // route hydrating behind the fixed drawer can time out despite an unchanged
  // command surface.
  // An unrelated background API failure may raise the global app notice while
  // a data-heavy world hydrates. Keep this drawer snapshot deterministic.
  const dismissErrorNotice = page.getByRole('button', { name: 'Dismiss Error Notice' });
  if (await dismissErrorNotice.isVisible().catch(() => false)) {
    await dismissErrorNotice.click();
  }
  const pixels = await page.screenshot({
    animations: 'disabled',
    caret: 'hide',
    clip: { x: 0, y: 0, width: size.width, height: size.height },
    timeout: 20_000,
  });
  expect(pixels).toMatchSnapshot(name, {
    threshold: 0.3,
    maxDiffPixelRatio: 0.15,
  });
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
    await expectDrawerSnapshot(page, drawer, `${world.id}-desktop.png`, {
      width: 400,
      height: 900,
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

    if (world.id === 'social-media') {
      const socialTiles = await drawer.locator('.sp-grid-tile').evaluateAll((tiles) =>
        tiles.map((tile) => getComputedStyle(tile).backgroundColor)
      );
      expect(socialTiles.every((color) => ['rgb(255, 255, 255)', 'rgb(231, 243, 255)'].includes(color))).toBe(true);
    }
    await expectDrawerSnapshot(page, drawer, `${world.id}-mobile.png`, {
      width: 320,
      height: 568,
    });

    // Exercise the bottom only after capturing the deterministic entrance.
    // The atomic query tolerates legitimate secondary-action rerenders without
    // holding a stale child element in Chromium or WebKit.
    await expect.poll(() => drawer.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      const actions = element.querySelectorAll('a[href], button:not([disabled])');
      const lastAction = actions.item(actions.length - 1);
      if (!lastAction) return false;
      const box = lastAction.getBoundingClientRect();
      return box.top >= 0 && box.bottom <= window.innerHeight;
    })).toBe(true);
  });
}
