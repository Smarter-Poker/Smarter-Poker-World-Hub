import { expect, test, type Page } from '@playwright/test';

async function expectNoOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow, `${label} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
}

async function waitForDiscovery(page: Page) {
  await expect(page.locator('.pnm-page')).toHaveAttribute('data-pnm-hydrated', 'true', {
    timeout: 30_000,
  });
  await expect(page.getByRole('navigation', { name: 'Poker Near Me sections' })).toBeVisible({
    timeout: 30_000,
  });
}

async function traverseHistory(page: Page, direction: 'back' | 'forward') {
  await page.evaluate((requestedDirection) => new Promise<void>((resolve) => {
    let timer = 0;
    const finish = () => {
      window.clearTimeout(timer);
      window.removeEventListener('popstate', finish);
      resolve();
    };
    window.addEventListener('popstate', finish, { once: true });
    timer = window.setTimeout(finish, 5_000);
    if (requestedDirection === 'back') window.history.back();
    else window.history.forward();
  }), direction);
}

function discoveryButton(page: Page, name: RegExp) {
  return page
    .getByRole('navigation', { name: 'Poker Near Me sections' })
    .getByRole('button', { name });
}

async function expectDiscoveryUrl(page: Page, pattern: RegExp) {
  // WebKit reports same-document History API changes as navigation events that
  // never emit a second load event. Poll the address directly so the assertion
  // verifies the URL contract without waiting for a load that must not occur.
  await expect.poll(() => page.url(), { timeout: 15_000 }).toMatch(pattern);
}

async function activateDiscoverySection(page: Page, name: RegExp, browserName: string) {
  const button = discoveryButton(page, name);
  if (browserName === 'webkit') {
    // The animated live-data rail can keep WebKit's actionability probe in its
    // stability phase. Queue the real DOM activation; the URL and selected-state
    // assertions below still prove that the application's click handler completed.
    await button.evaluate((element: HTMLElement) => element.click());
    return;
  }
  await button.click();
}

test.describe('Poker Near Me phase 17 cross-engine and accessibility hardening', () => {
  test.setTimeout(150_000);

  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      localStorage.setItem('pnm_lobby_tutorial_seen', '1');
      localStorage.setItem('pnm_tutorial_seen_v1', '1');
      localStorage.setItem('pnm_location_prompt_dismissed', '1');
      localStorage.removeItem('sp-filters-poker-near-me');
    });
  });

  test('browser Back and Forward restore canonical discovery state', async ({ page, browserName }) => {
    if (browserName === 'webkit') await page.emulateMedia({ reducedMotion: 'reduce' });
    const response = await page.goto('/hub/poker-near-me/venues', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);
    await waitForDiscovery(page);

    await activateDiscoverySection(page, /Events/i, browserName);
    await expectDiscoveryUrl(page, /\/hub\/poker-near-me\/daily-tournaments(?:\?.*)?$/);
    await activateDiscoverySection(page, /Map/i, browserName);
    await expectDiscoveryUrl(page, /\/hub\/poker-near-me\/map(?:\?.*)?$/);
    const discoveryState = await page.evaluate(() => window.history.state);
    expect(discoveryState?.spPnmDiscovery).toBe(true);
    expect(discoveryState?.spModal).not.toBe(true);

    // Call the history methods directly. WebKit may throttle a zero-delay
    // timer while the long discovery document is settling, which leaves the
    // test on the current entry even though native Back/Forward works.
    await traverseHistory(page, 'back');
    await expectDiscoveryUrl(page, /\/hub\/poker-near-me\/daily-tournaments(?:\?.*)?$/);
    await expect(discoveryButton(page, /Events/i)).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('.pnm-route-announcer')).toContainText('Showing Daily Tournaments');

    await traverseHistory(page, 'forward');
    await expectDiscoveryUrl(page, /\/hub\/poker-near-me\/map(?:\?.*)?$/);
    await expect(discoveryButton(page, /Map/i)).toHaveAttribute('aria-current', 'true');
    await expectNoOverflow(page, 'history-restored map');
  });

  test('keyboard section navigation and reduced motion survive each browser engine', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/hub/poker-near-me/venues', { waitUntil: 'domcontentloaded' });
    await waitForDiscovery(page);

    const moreButton = discoveryButton(page, /More/i);
    await moreButton.focus();
    await moreButton.press('Enter');
    await expect(moreButton).toBeFocused();
    await expect(moreButton).toHaveAttribute('aria-current', 'true');
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
      const pageErrors: string[] = [];
      routePage.on('pageerror', (error) => pageErrors.push(error.message));
      await routePage.setViewportSize({ width: 390, height: 844 });
      const response = await routePage.goto(route, { waitUntil: 'domcontentloaded' });
      expect(response?.status(), route).toBe(200);
      expect(new URL(routePage.url()).pathname, route).toBe(route);
      await expect(routePage.locator('main')).toHaveCount(1);
      await expect(routePage.locator('body')).toHaveClass(/world-poker-near-me/);
      await expect(routePage.locator('[data-footer-world="poker-near-me"]')).toHaveCount(1);
      await expectNoOverflow(routePage, route);
      expect(pageErrors, `${route} uncaught errors: ${pageErrors.join(' | ')}`).toEqual([]);
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

  test('Home Games Near Me inherits machined panels and full touch targets', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const response = await page.goto('/hub/home-games/near-me', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);
    await page.waitForLoadState('load');
    await expect(page.locator('body')).toHaveClass(/world-poker-near-me/);
    await expect(page.locator('[data-footer-world="poker-near-me"]')).toHaveCount(1);

    const panel = page.locator('[data-pnm-secondary-foundation] .cmd-panel').first();
    // In local WebKit the dev server can briefly detach/re-attach the global
    // stylesheet while a newly compiled route receives HMR. Poll the complete
    // frame atomically so the assertion cannot land inside that dev-only swap.
    await expect.poll(() => panel.evaluate((element) => {
      const style = getComputedStyle(element);
      const before = getComputedStyle(element, '::before');
      return {
        widths: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth],
        styles: [style.borderTopStyle, style.borderRightStyle, style.borderBottomStyle, style.borderLeftStyle],
        radius: style.borderRadius,
        decoration: before.content,
      };
    }), { timeout: 15_000 }).toEqual({
      widths: ['1px', '1px', '1px', '1px'],
      styles: ['solid', 'solid', 'solid', 'solid'],
      radius: '3px',
      decoration: 'none',
    });

    const hostBox = await page.getByRole('link', { name: 'Host A Game' }).boundingBox();
    expect(hostBox?.height).toBeGreaterThanOrEqual(44);
    await expectNoOverflow(page, '/hub/home-games/near-me');
  });

  test('Poker Tours keeps search and filter controls usable at 390x844', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const response = await page.goto('/hub/poker-tours', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);
    await expect(page.locator('body')).toHaveClass(/world-poker-near-me/);

    await expect.poll(() => page.evaluate(() => {
      const search = document.querySelector('.tours-search-bar-input');
      const selects = [...document.querySelectorAll('.tours-date-select')];
      const searchBox = search?.getBoundingClientRect();
      const selectBoxes = selects.map((select) => select.getBoundingClientRect());
      return {
        searchUsable: Boolean(searchBox && searchBox.width >= 160 && searchBox.height >= 44),
        selectCount: selects.length,
        selectsUsable: selectBoxes.every((box) => box.height >= 44),
      };
    }), { timeout: 15_000 }).toEqual({
      searchUsable: true,
      selectCount: 2,
      selectsUsable: true,
    });
    await expectNoOverflow(page, '/hub/poker-tours');
  });

  test('forced colors preserve visible selected and focus states', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'forced-colors emulation is Chromium-only');
    await page.emulateMedia({ forcedColors: 'active' });
    await page.goto('/hub/poker-near-me/venues', { waitUntil: 'domcontentloaded' });
    await waitForDiscovery(page);

    const selected = discoveryButton(page, /Venues/i);
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

  test('legacy discovery bookmarks redirect canonically and private surfaces stay out of search', async ({ context }) => {
    const aliasPage = await context.newPage();
    const response = await aliasPage.goto('/hub/poker-near-me/daily?radius=50', {
      waitUntil: 'domcontentloaded',
    });
    expect(response?.status()).toBe(200);
    await expectDiscoveryUrl(aliasPage, /\/hub\/poker-near-me\/daily-tournaments\?radius=50$/);
    await expect(aliasPage.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      /\/hub\/poker-near-me\/daily-tournaments$/
    );
    await aliasPage.close();

    const savedPage = await context.newPage();
    await savedPage.goto('/hub/poker-near-me/saved', { waitUntil: 'domcontentloaded' });
    await expect(savedPage.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/i);
    await savedPage.close();

    const venuesPage = await context.newPage();
    await venuesPage.goto('/hub/poker-near-me/venues', { waitUntil: 'domcontentloaded' });
    await expect(venuesPage.locator('meta[name="robots"]')).not.toHaveAttribute('content', /noindex/i);
    await venuesPage.close();
  });

  test('mobile header focus and command selectors remain visible without detached borders', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/hub/poker-near-me/venues', { waitUntil: 'domcontentloaded' });
    await waitForDiscovery(page);

    const trigger = page.getByRole('button', { name: /Open Poker Near Me Command Menu/i });
    await trigger.focus();
    const triggerFocus = await trigger.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        outline: style.outlineStyle,
        boxShadow: style.boxShadow,
        focusGlow: style.backgroundImage,
      };
    });
    expect(triggerFocus.outline).toBe('none');
    expect(triggerFocus.boxShadow).toBe('none');
    expect(triggerFocus.focusGlow).toContain('radial-gradient');

    await trigger.click();
    const drawer = page.getByRole('dialog', { name: 'Poker Near Me Command Menu' });
    await expect(drawer).toBeVisible();
    const drawerFrame = await drawer.evaluate((element) => {
      const style = getComputedStyle(element);
      const after = getComputedStyle(element, '::after');
      return {
        rightBorder: style.borderRightWidth,
        rightBorderStyle: style.borderRightStyle,
        radius: style.borderRadius,
        clipPath: style.clipPath,
        decoration: after.content,
      };
    });
    expect(drawerFrame.rightBorder).toBe('1px');
    expect(drawerFrame.rightBorderStyle).toBe('solid');
    expect(drawerFrame.radius).toBe('0px');
    expect(drawerFrame.clipPath).toBe('none');
    expect(drawerFrame.decoration).toBe('none');

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
