import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  WORLD_MENU_VISUAL_CASES,
  type WorldMenuVisualCase,
} from './fixtures/world-menu-cases';

const PHONE = { width: 375, height: 812 } as const;
const LANDSCAPE = { width: 812, height: 375 } as const;
const NON_SOCIAL_WORLDS = WORLD_MENU_VISUAL_CASES.filter(
  (world) => world.id !== 'social-media',
);

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: PHONE,
});
test.describe.configure({ mode: 'serial', timeout: 90_000 });

async function visitWorld(page: Page, world: WorldMenuVisualCase, path = world.path) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  if (world.id === 'news') {
    await page.addInitScript(() => window.sessionStorage.setItem('news-intro-seen', 'true'));
  }
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-world-menu-trigger]:visible')).toHaveCount(1, {
    timeout: 20_000,
  });
}

async function openMenu(page: Page, world: WorldMenuVisualCase) {
  const trigger = page.locator('[data-world-menu-trigger]:visible');
  await expect(trigger).toHaveCount(1);
  await expect(trigger).toHaveAttribute('data-menu-symbol', 'hamburger');
  await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');

  const triggerBox = await trigger.boundingBox();
  expect(triggerBox, `${world.label} trigger needs a measurable box`).not.toBeNull();
  // The approved header is exact artwork and only 38px tall at this viewport.
  // Its transparent hit regions must stay aligned to the baked-in controls;
  // enlarging this box to 44px would overlap Back and alter interaction with
  // the artwork. WCAG 2.2's 24px target-size minimum applies here, while all
  // independently laid-out controls inside the drawer retain the 44px floor.
  expect(triggerBox!.width, `${world.label} trigger width`).toBeGreaterThanOrEqual(24);
  expect(triggerBox!.height, `${world.label} trigger height`).toBeGreaterThanOrEqual(24);

  await trigger.click();
  const drawer = page.locator(`[data-world-command-menu="${world.id}"]:visible`);
  await expect(drawer).toHaveCount(1);
  await expect(drawer).toBeVisible();
  await expect(drawer).toHaveAttribute('role', 'dialog');
  await expect(drawer).toHaveAttribute('aria-modal', 'true');
  await expect(drawer).toHaveAttribute('data-responsive-composition', 'adaptive');
  await expect(drawer).toHaveAttribute('data-world-menu-scheme', world.scheme);
  const transitionSeconds = await drawer.evaluate((element) => {
    const duration = getComputedStyle(element).transitionDuration.split(',')[0].trim();
    return duration.endsWith('ms')
      ? Number.parseFloat(duration) / 1000
      : Number.parseFloat(duration);
  });
  expect(transitionSeconds).toBeLessThanOrEqual(0.001);
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(drawer.locator(`[data-world-primary-commands="${world.id}"] .sp-grid-tile`))
    .toHaveCount(6);
  return { trigger, drawer };
}

async function assertContained(page: Page, drawer: Locator) {
  const metrics = await drawer.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      drawerOverflow: element.scrollWidth - element.clientWidth,
      documentOverflow:
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(Math.abs(metrics.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(metrics.top)).toBeLessThanOrEqual(1);
  expect(metrics.right).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.bottom).toBeLessThanOrEqual(metrics.viewportHeight + 1);
  expect(Math.abs(metrics.height - metrics.viewportHeight)).toBeLessThanOrEqual(1);
  expect(metrics.drawerOverflow).toBeLessThanOrEqual(1);
  expect(metrics.documentOverflow).toBeLessThanOrEqual(1);
}

async function assertModalIsolation(page: Page, drawer: Locator) {
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
  await expect(page.locator('body')).toHaveCSS('position', 'fixed');

  const isolation = await drawer.evaluate((element) => {
    const branches = Array.from(document.querySelectorAll('[inert][aria-hidden="true"]'));
    const escapedFocusable = Array.from(document.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), '
        + 'select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter((candidate) => {
      if (element.contains(candidate)) return false;
      if (candidate.closest('[data-world-command-child-dialog="true"]')) return false;
      const box = candidate.getBoundingClientRect();
      const style = getComputedStyle(candidate);
      if (!box.width || !box.height || style.display === 'none' || style.visibility === 'hidden') {
        return false;
      }
      return !candidate.closest('[inert], [aria-hidden="true"]');
    });
    return {
      isolatedBranchCount: branches.length,
      escapedFocusable: escapedFocusable.map((node) =>
        node.getAttribute('aria-label') || node.textContent?.trim().slice(0, 60) || node.tagName,
      ),
    };
  });
  expect(isolation.isolatedBranchCount).toBeGreaterThan(0);
  expect(isolation.escapedFocusable).toEqual([]);
}

async function assertMobileSizing(drawer: Locator) {
  const audit = await drawer.evaluate((element) => {
    const rendered = (node: Element) => {
      if (node.closest('[hidden], [aria-hidden="true"]')) return false;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity) !== 0;
    };
    const controls = Array.from(element.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), '
        + 'select:not([disabled]), [role="button"]:not([aria-disabled="true"])',
    )).filter(rendered);
    const undersizedControls = controls.flatMap((node) => {
      const rect = node.getBoundingClientRect();
      if (rect.width >= 44 && rect.height >= 44) return [];
      return [{
        name: node.getAttribute('aria-label') || node.textContent?.trim().slice(0, 60) || node.tagName,
        width: rect.width,
        height: rect.height,
      }];
    });
    const smallInputs = Array.from(element.querySelectorAll('input, textarea, select'))
      .filter(rendered)
      .flatMap((node) => {
        const fontSize = Number.parseFloat(getComputedStyle(node).fontSize);
        return fontSize >= 16 ? [] : [{ name: node.getAttribute('aria-label'), fontSize }];
      });
    const smallPhaseThreeText = Array.from(element.querySelectorAll(
      '.sp-command-eyebrow, .sp-command-status, .sp-command-context p, '
        + '.sp-menu-description, .sp-grid-description',
    )).filter(rendered).flatMap((node) => {
      const fontSize = Number.parseFloat(getComputedStyle(node).fontSize);
      return fontSize >= 12 ? [] : [{ text: node.textContent?.trim().slice(0, 60), fontSize }];
    });
    return { undersizedControls, smallInputs, smallPhaseThreeText };
  });
  expect(audit.undersizedControls).toEqual([]);
  expect(audit.smallInputs).toEqual([]);
  expect(audit.smallPhaseThreeText).toEqual([]);
}

async function assertStickyUtilities(drawer: Locator) {
  await expect(drawer.locator('.sp-command-utility-rail')).toBeVisible();
  await expect(drawer.locator('.sp-command-search')).toBeVisible();
  await expect.poll(async () => drawer.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    const rail = element.querySelector('.sp-command-utility-rail')?.getBoundingClientRect();
    const search = element.querySelector('.sp-command-search')?.getBoundingClientRect();
    const frame = element.getBoundingClientRect();
    if (!rail || !search) return null;
    return {
      railPinned: Math.abs(rail.top - frame.top) <= 1,
      noOverlap: search.top >= rail.bottom - 1,
      searchContained: search.bottom <= frame.bottom + 1,
    };
  })).toEqual({ railPinned: true, noOverlap: true, searchContained: true });
}

for (const world of NON_SOCIAL_WORLDS) {
  test(`${world.label}: Phase 3 mobile menu contract`, async ({ page }) => {
    await page.setViewportSize(PHONE);
    await visitWorld(page, world);
    const viewportPolicy = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(viewportPolicy || '').not.toMatch(/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?:\.0)?(?:\D|$)/i);
    const { trigger, drawer } = await openMenu(page, world);

    await assertContained(page, drawer);
    await assertModalIsolation(page, drawer);
    await assertMobileSizing(drawer);
    await assertStickyUtilities(drawer);

    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(page.locator('body')).not.toHaveCSS('position', 'fixed');
  });
}

test('adaptive command menu is contained in short landscape', async ({ page }) => {
  const world = NON_SOCIAL_WORLDS.find((candidate) => candidate.id === 'personal-assistant')!;
  await page.setViewportSize(LANDSCAPE);
  await visitWorld(page, world);
  const { drawer } = await openMenu(page, world);
  await assertContained(page, drawer);
  await assertStickyUtilities(drawer);
  await expect.poll(() => drawer.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    const actions = Array.from(element.querySelectorAll('a[href], button:not([disabled])'))
      .filter((node) => !node.closest('[hidden], [aria-hidden="true"]'));
    const box = actions.at(-1)?.getBoundingClientRect();
    return Boolean(box && box.top >= 0 && box.bottom <= window.innerHeight);
  })).toBe(true);
});

test('Geeves collapse state is exposed and removes collapsed controls from navigation', async ({ page }) => {
  const world = NON_SOCIAL_WORLDS.find((candidate) => candidate.id === 'personal-assistant')!;
  await visitWorld(page, world);
  const { drawer } = await openMenu(page, world);
  await drawer.evaluate((element) => { element.scrollTop = element.scrollHeight; });

  const toggle = drawer.getByRole('button', { name: 'Ask Geeves' });
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  const panelId = await toggle.getAttribute('aria-controls');
  expect(panelId).toBeTruthy();
  const panel = drawer.locator(`[id="${panelId}"]`);
  await expect(panel).toHaveAttribute('aria-hidden', 'true');
  await expect(panel).toBeHidden();

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(panel).toHaveAttribute('aria-hidden', 'false');
  await expect(panel).toBeVisible();
  const input = panel.getByPlaceholder('Ask anything...');
  const send = panel.getByRole('button', { name: 'Send Message To Geeves' });
  await expect(input).toHaveCSS('font-size', '16px');
  const inputBox = await input.boundingBox();
  const sendBox = await send.boundingBox();
  expect(inputBox?.height).toBeGreaterThanOrEqual(44);
  expect(sendBox?.width).toBeGreaterThanOrEqual(44);
  expect(sendBox?.height).toBeGreaterThanOrEqual(44);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(panel).toBeHidden();
  await expect(panel.locator(':focus')).toHaveCount(0);
});

test('Report Bug portal owns focus and Escape before returning control to the menu', async ({ page }) => {
  const world = NON_SOCIAL_WORLDS.find((candidate) => candidate.id === 'personal-assistant')!;
  await visitWorld(page, world);
  const { trigger, drawer } = await openMenu(page, world);
  await drawer.evaluate((element) => { element.scrollTop = element.scrollHeight; });

  const reportTrigger = drawer.getByRole('button', { name: 'Report A Bug' });
  await reportTrigger.click();
  const childDialog = page.locator('[data-world-command-child-dialog="true"]');
  await expect(childDialog).toBeVisible();
  await expect(childDialog).toHaveAttribute('role', 'dialog');
  await expect(childDialog).toHaveAttribute('aria-modal', 'true');
  expect(await childDialog.evaluate((element) => (
    element.closest('[data-world-command-child-overlay="true"]')?.parentElement === document.body
  ))).toBe(true);
  const childBox = await childDialog.boundingBox();
  expect(childBox).not.toBeNull();
  expect(childBox!.x).toBeGreaterThanOrEqual(0);
  expect(childBox!.y).toBeGreaterThanOrEqual(0);
  expect(childBox!.x + childBox!.width).toBeLessThanOrEqual(PHONE.width + 1);
  expect(childBox!.y + childBox!.height).toBeLessThanOrEqual(PHONE.height + 1);

  const close = childDialog.getByRole('button', { name: 'Close Bug Report' });
  await expect(close).toBeFocused();

  const lastControl = childDialog.locator(
    'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), '
      + 'select:not([disabled]), [tabindex]:not([tabindex="-1"])',
  ).last();
  await lastControl.focus();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(childDialog).toBeHidden();
  await expect(drawer).toBeVisible();
  await expect(reportTrigger).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('Poker Near Me deep Series route keeps its approved header trigger after document scroll', async ({ page }) => {
  const world = NON_SOCIAL_WORLDS.find((candidate) => candidate.id === 'poker-near-me')!;
  await visitWorld(page, world, '/hub/poker-near-me/series');
  const trigger = page.locator('[data-world-menu-trigger="approved-header"]');
  await expect(trigger).toBeVisible();

  await page.evaluate(() => {
    const shell = document.querySelector('.pnm-shell');
    const bottomWithinShell = shell
      ? shell.getBoundingClientRect().top + window.scrollY + shell.scrollHeight - window.innerHeight
      : document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, Math.max(1, bottomWithinShell - 1));
  });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await expect(trigger).toBeVisible();
  const box = await trigger.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(PHONE.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(PHONE.height + 1);
});

test('Social Media remains on its preserved Facebook composition', async ({ page }) => {
  const world = WORLD_MENU_VISUAL_CASES.find((candidate) => candidate.id === 'social-media')!;
  await visitWorld(page, world);
  const trigger = page.locator('[data-world-menu-trigger]:visible');
  await trigger.click();
  const drawer = page.locator('[data-world-command-menu="social-media"]');
  await expect(drawer).toBeVisible();
  await expect(drawer).toHaveAttribute('data-responsive-composition', 'preserved');
  await expect(drawer).toHaveAttribute('data-world-menu-scheme', 'facebook');
  await expect(drawer.locator('[data-world-primary-commands="social-media"] .sp-grid-tile'))
    .toHaveCount(6);
});
