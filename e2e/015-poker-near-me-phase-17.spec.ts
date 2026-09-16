import { expect, test, type Locator, type Page } from '@playwright/test';

async function expectNoOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow, `${label} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
}

// The PNM overlay replaces drawn borders with the approved complete raster
// frames. Verify the rendered CSS asset actually decodes at its native size.
async function expectPaintedFrame(locator: Locator, asset: string, dimensions: [number, number], repeat = 'no-repeat') {
  const frame = await locator.evaluate(async (element) => {
    const style = getComputedStyle(element);
    const match = /^url\(["']?(.*?)["']?\)$/.exec(style.backgroundImage);
    if (!match) throw new Error(`Expected one painted frame, received ${style.backgroundImage}`);
    const image = new Image();
    image.src = match[1];
    await image.decode();
    const box = element.getBoundingClientRect();
    return {
      path: new URL(image.currentSrc || image.src).pathname,
      dimensions: [image.naturalWidth, image.naturalHeight],
      size: style.backgroundSize,
      repeat: style.backgroundRepeat,
      left: box.left,
      right: box.right,
      width: box.width,
      viewport: window.innerWidth,
    };
  });
  expect(frame.path).toBe(`/images/pnm-console/${asset}`);
  expect(frame.dimensions).toEqual(dimensions);
  expect(frame.size).toBe('100% auto');
  expect(frame.repeat).toBe(repeat);
  expect(frame.width).toBeGreaterThan(0);
  expect(frame.left).toBeGreaterThanOrEqual(0);
  expect(frame.right).toBeLessThanOrEqual(frame.viewport);
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

  test('deep-linked map stays anchored and expands as one accessible fullscreen surface', async ({ page }) => {
    const response = await page.goto('/hub/poker-near-me/map', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);
    await waitForDiscovery(page);

    const section = page.locator('#pnm-section-map');
    const surface = section.locator('[data-pnm-map-surface]').first();
    const map = surface.locator('.pnm-leaflet-map');
    await expect(surface).toBeVisible({ timeout: 60_000 });
    await expect(map).toHaveAttribute('data-map-ready', 'true', { timeout: 60_000 });

    // Lazy panels and venue imagery above this section continue to grow well
    // after the first fetch resolves. The bounded landing stabilizer must keep
    // the URL's destination under the persistent header after that growth.
    await page.waitForTimeout(6_600);
    const landing = await section.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const raw = getComputedStyle(document.documentElement).getPropertyValue('--sp-header-height');
      return { top: box.top, header: Number.parseFloat(raw) || 56 };
    });
    expect(landing.top).toBeGreaterThanOrEqual(landing.header - 2);
    expect(landing.top).toBeLessThanOrEqual(landing.header + 110);

    const trigger = surface.locator('[data-map-fullscreen-control]');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await trigger.click();
    await expect(surface).toHaveAttribute('data-map-fullscreen', 'true');
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(trigger).toBeFocused();

    const expanded = await surface.boundingBox();
    const viewport = page.viewportSize();
    expect(expanded?.x).toBeCloseTo(0, 0);
    expect(expanded?.y).toBeCloseTo(0, 0);
    expect(expanded?.width).toBeCloseTo(viewport?.width || 0, 0);
    expect(expanded?.height).toBeCloseTo(viewport?.height || 0, 0);
    expect(await page.evaluate(() => ({
      body: document.body.style.overflow,
      root: document.documentElement.style.overflow,
    }))).toEqual({ body: 'hidden', root: 'hidden' });

    const fullscreenMap = await map.boundingBox();
    expect(fullscreenMap?.width).toBeCloseTo(viewport?.width || 0, 0);
    expect(fullscreenMap?.height || 0).toBeGreaterThan((viewport?.height || 0) * 0.65);
    await expectNoOverflow(page, 'fullscreen Poker Near Me map');

    await page.keyboard.press('Escape');
    await expect(surface).toHaveAttribute('data-map-fullscreen', 'false');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger).toBeFocused();
    await expect.poll(() => page.evaluate(() => ({
      body: document.body.style.overflow,
      root: document.documentElement.style.overflow,
    }))).toEqual({ body: '', root: '' });
    await expectNoOverflow(page, 'restored Poker Near Me map');
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

  test('road-trip and venue-detail maps share the fullscreen contract without render loops', async ({ context }) => {
    const roadTripPage = await context.newPage();
    await roadTripPage.setViewportSize({ width: 390, height: 844 });
    const roadTripErrors: string[] = [];
    roadTripPage.on('pageerror', (error) => roadTripErrors.push(error.message));
    roadTripPage.on('console', (message) => {
      if (message.type() === 'error' && /Maximum update depth exceeded/i.test(message.text())) {
        roadTripErrors.push(message.text());
      }
    });

    const roadTripResponse = await roadTripPage.goto('/hub/poker-near-me/roadtrip', {
      waitUntil: 'domcontentloaded',
    });
    expect(roadTripResponse?.status()).toBe(200);
    await waitForDiscovery(roadTripPage);
    // The planner is intentionally action-gated. Reproduce the same client
    // access-granted signal emitted after a verified pass purchase so this
    // route-family test exercises the tool instead of the purchase dialog.
    await roadTripPage.evaluate(() => {
      window.dispatchEvent(new CustomEvent('feature-access-changed', {
        detail: { featureKey: 'poker_near_me' },
      }));
    });
    await roadTripPage.waitForTimeout(100);
    await roadTripPage.getByRole('textbox', { name: 'Trip origin' }).fill('Dallas, TX');
    await roadTripPage.getByRole('textbox', { name: 'Trip destination' }).fill('Houston, TX');
    await roadTripPage.getByRole('button', { name: 'Plan My Trip' }).click();

    const routeSurface = roadTripPage.locator('.pnm-map-surface--road-trip');
    await expect(routeSurface.locator('[data-map-ready="true"]')).toBeVisible({ timeout: 60_000 });
    const routeFullscreen = routeSurface.locator('[data-map-fullscreen-control]');
    await routeFullscreen.click();
    await expect(routeSurface).toHaveAttribute('data-map-fullscreen', 'true');
    const routeBox = await routeSurface.boundingBox();
    expect(routeBox?.x).toBeCloseTo(0, 0);
    expect(routeBox?.y).toBeCloseTo(0, 0);
    expect(routeBox?.width).toBeCloseTo(390, 0);
    expect(routeBox?.height).toBeCloseTo(844, 0);
    await expectNoOverflow(roadTripPage, 'fullscreen road-trip map');
    await roadTripPage.keyboard.press('Escape');
    await expect(routeSurface).toHaveAttribute('data-map-fullscreen', 'false');
    expect(roadTripErrors, `road-trip uncaught errors: ${roadTripErrors.join(' | ')}`).toEqual([]);
    await roadTripPage.close();

    const venuePage = await context.newPage();
    await venuePage.setViewportSize({ width: 390, height: 844 });
    const venueErrors: string[] = [];
    venuePage.on('pageerror', (error) => venueErrors.push(error.message));
    const venueResponse = await venuePage.goto('/hub/venues/2730', { waitUntil: 'domcontentloaded' });
    expect(venueResponse?.status()).toBe(200);
    const venueSurface = venuePage.locator('.map-section [data-pnm-map-surface]');
    await expect(venueSurface.locator('[data-map-ready="true"]')).toBeVisible({ timeout: 60_000 });
    const venueFullscreen = venueSurface.locator('[data-map-fullscreen-control]');
    await venueFullscreen.click();
    await expect(venueSurface).toHaveAttribute('data-map-fullscreen', 'true');
    const venueBox = await venueSurface.boundingBox();
    expect(venueBox?.x).toBeCloseTo(0, 0);
    expect(venueBox?.y).toBeCloseTo(0, 0);
    expect(venueBox?.width).toBeCloseTo(390, 0);
    expect(venueBox?.height).toBeCloseTo(844, 0);
    await venuePage.keyboard.press('Escape');
    await expect(venueSurface).toHaveAttribute('data-map-fullscreen', 'false');
    await expectNoOverflow(venuePage, 'restored venue-detail map');
    expect(venueErrors, `venue uncaught errors: ${venueErrors.join(' | ')}`).toEqual([]);
    await venuePage.close();
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

  test('mobile header focus and command selectors remain visible without detached borders', async ({ page, browserName }) => {
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
    await expect(drawer).toHaveAttribute('data-pnm-console', 'painted-command-drawer-v1');
    await expectPaintedFrame(drawer, 'painted-panels-v1/panel-mid.png', [1000, 8], 'repeat-y');
    expect(drawerFrame.rightBorder).toBe('0px');
    expect(drawerFrame.rightBorderStyle).toBe('none');
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
        radius: style.borderRadius,
        clipPath: style.clipPath,
        decoration: after.content,
      };
    });
    expect(new Set(frame.widths).size).toBe(1);
    expect(frame.widths[0]).toBe('0px');
    expect(frame.radius).toBe('0px');
    await expectPaintedFrame(selected, 'painted-controls-v1/button-primary.png', [348, 114]);
    const unselected = drawer.locator(".sp-grid-tile:not([aria-current='page'])").first();
    await expectPaintedFrame(unselected, 'painted-controls-v1/button-secondary.png', [348, 114]);
    // Enter keyboard modality through real navigation. Programmatic focus
    // after a pointer-opened drawer does not prove :focus-visible styling.
    // Mac WebKit's plain Tab visits text inputs; Option+Tab also visits links
    // and buttons. Use that native navigation chord to reach the selected link.
    const tabKey = process.platform === 'darwin' && browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
    const tabLimit = await drawer.locator('button, a[href], input, select, textarea, [tabindex]').count() + 1;
    for (let index = 0; index < tabLimit; index += 1) {
      await page.keyboard.press(tabKey);
      if (await selected.evaluate((element) => element === document.activeElement)) break;
    }
    await expect(selected).toBeFocused();
    await expect(selected).toHaveCSS('outline-style', 'solid');
    await expect(selected).toHaveCSS('outline-width', '2px');
    expect(frame.clipPath).toBe('none');
    expect(frame.decoration).toBe('none');
    await expectNoOverflow(page, 'open Poker Near Me command menu');
  });

  test('Commander Home Games right drawer keeps a continuous inward edge', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const response = await page.goto('/hub/commander/home-games', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);
    await expect(page.locator('body')).toHaveClass(/world-poker-near-me/);

    const trigger = page.getByRole('button', { name: 'Open Menu' });
    const triggerBox = await trigger.boundingBox();
    expect(triggerBox?.width).toBeGreaterThanOrEqual(44);
    expect(triggerBox?.height).toBeGreaterThanOrEqual(44);
    await trigger.click();

    const drawer = page.locator(".sp-drawer[data-direction='right']");
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveAttribute('data-world-command-menu', 'global');
    await expect.poll(() => drawer.evaluate((element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      const body = getComputedStyle(document.body);
      return {
        x: Math.round(box.x),
        leftBorder: style.borderLeftWidth,
        leftBorderStyle: style.borderLeftStyle,
        rightBorder: style.borderRightWidth,
        radius: style.borderRadius,
        clipPath: style.clipPath,
        overflowX: body.overflowX,
      };
    }), { timeout: 15_000 }).toEqual({
      x: 0,
      leftBorder: '1px',
      leftBorderStyle: 'solid',
      rightBorder: '0px',
      radius: '0px',
      clipPath: 'none',
      overflowX: 'clip',
    });
    await expectNoOverflow(page, 'Commander right command menu');
  });

  test('Commander dialogs lock and release the real document scroller', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/hub/commander/home-games', { waitUntil: 'domcontentloaded' });
    const joinButton = page.getByRole('button', { name: 'JOIN BY CODE' });
    await expect(joinButton).toBeVisible();
    await page.evaluate(() => {
      document.getElementById('scroll-lock-probe-spacer')?.remove();
      const spacer = document.createElement('div');
      spacer.id = 'scroll-lock-probe-spacer';
      spacer.setAttribute('aria-hidden', 'true');
      spacer.style.cssText = 'height:3000px;width:1px;pointer-events:none;';
      document.body.appendChild(spacer);
      document.documentElement.style.scrollBehavior = 'auto';
    });
    expect(await page.evaluate(() => (
      (document.scrollingElement?.scrollHeight ?? 0) > window.innerHeight
    ))).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 700));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

    await joinButton.click();
    const dialog = page.getByRole('dialog', { name: 'Join By Invite Code' });
    await expect(dialog).toBeVisible();
    const lockedY = await page.evaluate(() => window.scrollY);
    const lockedStyles = await page.evaluate(() => ({
      bodyInline: document.body.style.overflow,
      bodyComputed: getComputedStyle(document.body).overflow,
      rootInline: document.documentElement.style.overflow,
      rootComputed: getComputedStyle(document.documentElement).overflow,
    }));
    expect(lockedStyles).toEqual({
      bodyInline: 'hidden',
      bodyComputed: 'clip',
      rootInline: 'hidden',
      rootComputed: 'hidden',
    });

    await page.evaluate(() => {
      const nextRouter = (window as typeof window & {
        next?: {
          router?: {
            events?: { emit: (event: string, url: string, options: { shallow: boolean }) => void };
          };
        };
      }).next?.router;
      if (!nextRouter?.events) throw new Error('Next router events are unavailable for the lock probe');
      const probeUrl = `${window.location.pathname}?scrollLockProbe=1`;
      nextRouter.events.emit('routeChangeStart', probeUrl, { shallow: true });
      nextRouter.events.emit('routeChangeComplete', probeUrl, { shallow: true });
    });
    expect(await page.evaluate(() => ({
      bodyInline: document.body.style.overflow,
      rootInline: document.documentElement.style.overflow,
    }))).toEqual({ bodyInline: 'hidden', rootInline: 'hidden' });

    const supportsMouseWheel = testInfo.project.name !== 'pnm-mobile-webkit';
    if (supportsMouseWheel) {
      await page.mouse.wheel(0, 500);
      await page.waitForTimeout(100);
      expect(await page.evaluate(() => window.scrollY)).toBe(lockedY);
    }

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect.poll(() => page.evaluate(() => ({
      bodyInline: document.body.style.overflow,
      rootInline: document.documentElement.style.overflow,
    }))).toEqual({ bodyInline: '', rootInline: '' });

    const releasedY = await page.evaluate(() => window.scrollY);
    if (supportsMouseWheel) {
      await page.mouse.wheel(0, 500);
    } else {
      // Playwright's iPhone/WebKit transport does not implement mouse.wheel.
      // Desktop WebKit above exercises the real wheel path; this project still
      // proves the mobile root lock is removed and its scrolling element can
      // accept a new position after Escape.
      await page.evaluate((top) => {
        if (document.scrollingElement) document.scrollingElement.scrollTop = top;
      }, releasedY + 500);
    }
    await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 5_000 })
      .toBeGreaterThan(releasedY);
  });
});
