import { expect, test, type Page } from '@playwright/test';

async function expectNoOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow, `${label} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
}

async function waitForDiscovery(page: Page) {
  await expect(page.getByRole('tablist', { name: 'Poker Near Me sections' })).toBeVisible({
    timeout: 30_000,
  });
}

async function expectDiscoveryUrl(page: Page, pattern: RegExp) {
  // WebKit reports same-document History API changes as navigation events that
  // never emit a second load event. Poll the address directly so the assertion
  // verifies the URL contract without waiting for a load that must not occur.
  await expect.poll(() => page.url(), { timeout: 15_000 }).toMatch(pattern);
}

async function activateDiscoveryTab(page: Page, name: RegExp, browserName: string) {
  const tab = page.getByRole('tab', { name });
  if (browserName === 'webkit') {
    // The animated live-data rail can keep WebKit's actionability probe in its
    // stability phase. Queue the real DOM activation; the URL and selected-state
    // assertions below still prove that the application's click handler completed.
    await tab.evaluate((element: HTMLElement) => {
      window.setTimeout(() => element.click(), 0);
    });
    return;
  }
  await tab.click();
}

test.describe('Poker Near Me phase 17 cross-engine and accessibility hardening', () => {
  test.setTimeout(150_000);

  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      localStorage.setItem('pnm_lobby_tutorial_seen', '1');
      localStorage.setItem('pnm_location_prompt_dismissed', '1');
      localStorage.removeItem('sp-filters-poker-near-me');
    });
  });

  test('browser Back and Forward restore canonical discovery state', async ({ page, browserName }) => {
    if (browserName === 'webkit') await page.emulateMedia({ reducedMotion: 'reduce' });
    const response = await page.goto('/hub/poker-near-me/venues', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);
    await waitForDiscovery(page);

    await activateDiscoveryTab(page, /Events/i, browserName);
    await expectDiscoveryUrl(page, /\/hub\/poker-near-me\/daily-tournaments(?:\?.*)?$/);
    await activateDiscoveryTab(page, /Map/i, browserName);
    await expectDiscoveryUrl(page, /\/hub\/poker-near-me\/map(?:\?.*)?$/);

    await page.evaluate(() => window.setTimeout(() => window.history.back(), 0));
    await expectDiscoveryUrl(page, /\/hub\/poker-near-me\/daily-tournaments(?:\?.*)?$/);
    await expect(page.getByRole('tab', { name: /Events/i })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.pnm-route-announcer')).toContainText('Showing Daily Tournaments');

    await page.evaluate(() => window.setTimeout(() => window.history.forward(), 0));
    await expectDiscoveryUrl(page, /\/hub\/poker-near-me\/map(?:\?.*)?$/);
    await expect(page.getByRole('tab', { name: /Map/i })).toHaveAttribute('aria-selected', 'true');
    await expectNoOverflow(page, 'history-restored map');
  });

  test('keyboard tab semantics and reduced motion survive each browser engine', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/hub/poker-near-me/venues', { waitUntil: 'domcontentloaded' });
    await waitForDiscovery(page);

    const venuesTab = page.getByRole('tab', { name: /Venues/i });
    await venuesTab.focus();
    await venuesTab.press('End');
    const moreTab = page.getByRole('tab', { name: /More/i });
    await expect(moreTab).toBeFocused();
    await expect(moreTab).toHaveAttribute('aria-selected', 'true');
    await expectDiscoveryUrl(page, /\/hub\/poker-near-me\/more(?:\?.*)?$/);

    const motion = await page.locator('.pnm-page').evaluate((element) => {
      const style = getComputedStyle(element);
      return { animationDuration: style.animationDuration, transitionDuration: style.transitionDuration };
    });
    expect(Number.parseFloat(motion.animationDuration)).toBeLessThanOrEqual(0.00001);
    expect(Number.parseFloat(motion.transitionDuration)).toBeLessThanOrEqual(0.00001);
  });

  test('representative inherited route families stay semantic and overflow-free at 390x844', async ({ context }) => {
    for (const route of [
      '/hub/poker-near-me/map',
      '/hub/poker-near-me/in/nv',
      '/hub/venues/1823',
      '/hub/home-games',
      '/hub/poker-series',
      '/hub/events-calendar',
    ]) {
      // Each URL is an independent route-family audit. A fresh document avoids
      // carrying a discovery page's intentionally delayed URL synchronizer into
      // Playwright's synthetic `page.goto()` for the next family.
      const routePage = await context.newPage();
      await routePage.setViewportSize({ width: 390, height: 844 });
      const response = await routePage.goto(route, { waitUntil: 'domcontentloaded' });
      expect(response?.status(), route).toBe(200);
      expect(new URL(routePage.url()).pathname, route).toBe(route);
      await expect(routePage.locator('main')).toHaveCount(1);
      await expectNoOverflow(routePage, route);
      await routePage.close();
    }

    // The full-screen 3D lobby can schedule a same-URL recovery reload while
    // WebKit is compiling the next page in development. Audit it last so that
    // teardown cannot interrupt the following route's navigation.
    const lobbyPage = await context.newPage();
    await lobbyPage.setViewportSize({ width: 390, height: 844 });
    const lobbyResponse = await lobbyPage.goto('/hub/poker-near-me/lobby', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    expect(lobbyResponse?.status()).toBe(200);
    await expect(lobbyPage.locator('main')).toHaveCount(1);
    await expectNoOverflow(lobbyPage, '/hub/poker-near-me/lobby');
    await lobbyPage.close();
  });

  test('forced colors preserve visible selected and focus states', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'forced-colors emulation is Chromium-only');
    await page.emulateMedia({ forcedColors: 'active' });
    await page.goto('/hub/poker-near-me/venues', { waitUntil: 'domcontentloaded' });
    await waitForDiscovery(page);

    const selected = page.getByRole('tab', { name: /Venues/i });
    await selected.focus();
    const colors = await selected.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        background: style.backgroundColor,
        color: style.color,
        outline: style.outlineStyle,
        outlineWidth: style.outlineWidth,
      };
    });
    expect(colors.background).not.toBe('rgba(0, 0, 0, 0)');
    expect(colors.color).not.toBe(colors.background);
    expect(colors.outline).not.toBe('none');
    expect(Number.parseFloat(colors.outlineWidth)).toBeGreaterThanOrEqual(3);
  });

  test('mobile header and command selectors keep continuous contained borders', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/hub/poker-near-me/venues', { waitUntil: 'domcontentloaded' });
    await waitForDiscovery(page);

    const trigger = page.getByRole('button', { name: /Open Poker Near Me Command Menu/i });
    await trigger.focus();
    const triggerFocus = await trigger.evaluate((element) => {
      const style = getComputedStyle(element);
      const ring = getComputedStyle(element, '::before');
      const triggerBox = element.getBoundingClientRect();
      return {
        outline: style.outlineStyle,
        ringContent: ring.content,
        ringBorder: ring.borderTopWidth,
        ringColor: ring.borderTopColor,
        visualBottom: triggerBox.bottom - Number.parseFloat(ring.bottom),
        headerBottom: document.querySelector('.approved-global-header')?.getBoundingClientRect().bottom || 0,
      };
    });
    expect(triggerFocus.outline).toBe('none');
    expect(triggerFocus.ringContent).not.toBe('none');
    expect(triggerFocus.ringBorder).toBe('2px');
    expect(triggerFocus.ringColor).toBe('rgb(54, 186, 255)');
    expect(triggerFocus.visualBottom).toBeLessThanOrEqual(triggerFocus.headerBottom + 0.5);

    await trigger.click();
    const drawer = page.getByRole('dialog', { name: 'Poker Near Me Command Menu' });
    await expect(drawer).toBeVisible();
    const selected = drawer.locator(".sp-grid-tile[aria-current='page']");
    await expect(selected).toHaveCount(1);
    const frame = await selected.evaluate((element) => {
      const style = getComputedStyle(element);
      const after = getComputedStyle(element, '::after');
      return {
        widths: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth],
        color: style.borderTopColor,
        radius: style.borderRadius,
        clipPath: style.clipPath,
        decoration: after.content,
      };
    });
    expect(new Set(frame.widths).size).toBe(1);
    expect(frame.widths[0]).toBe('1px');
    expect(frame.color).toBe('rgb(72, 199, 255)');
    expect(frame.radius).toBe('3px');
    expect(frame.clipPath).toBe('none');
    expect(frame.decoration).toBe('none');
    await expectNoOverflow(page, 'open Poker Near Me command menu');
  });
});
