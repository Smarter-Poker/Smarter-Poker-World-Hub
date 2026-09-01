import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import footerRegistry from '../src/config/world-footer-navigation.json';

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 360, height: 800 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 414, height: 896 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 844, height: 390 },
  { width: 932, height: 430 },
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1600, height: 900 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
];

const WORLD_ROUTES = [
  { id: 'personal-assistant', route: '/hub/personal-assistant', childRoute: '/hub/personal-assistant/leaks' },
  { id: 'training', route: '/hub/training', childRoute: '/hub/training/progress' },
  { id: 'news', route: '/hub/news', childRoute: '/hub/news/sources' },
  { id: 'trivia', route: '/hub/trivia', childRoute: '/hub/trivia/stats' },
  { id: 'social-media', route: '/hub/social-media', childRoute: '/hub/reels' },
  { id: 'diamond-arena', route: '/hub/diamond-arena', childRoute: '/hub/diamond-arena/stats' },
  { id: 'my-clubs', route: '/hub/my-clubs', childRoute: '/hub/home-games' },
  { id: 'video-library', route: '/hub/video-library', childRoute: '/hub/video-library?filter=history' },
  { id: 'odds-calculator', route: '/hub/poker-tools', childRoute: '/hub/poker-tools#results' },
  { id: 'bankroll-manager', route: '/hub/bankroll-manager', childRoute: '/hub/bankroll-manager/export' },
  { id: 'toke-tracker', route: '/hub/toke-tracker', childRoute: '/hub/toke-tracker/analytics' },
  { id: 'preflop-charts', route: '/hub/preflop-charts', childRoute: '/hub/preflop-charts/stats' },
  { id: 'poker-near-me', route: '/hub/poker-near-me/lobby', childRoute: '/hub/poker-near-me/events' },
  { id: 'marketplace', route: '/hub/marketplace', childRoute: '/hub/merch-store' },
];

const walkPages = (directory: string): string[] =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walkPages(absolute) : [absolute];
  });

const dynamicSamples: Record<string, string> = {
  categoryId: 'preflop',
  city: 'oak-lawn',
  clinicId: 'sample',
  code: 'wsop',
  gameId: 'preflop-race',
  id: 'sample',
  itemId: 'sample',
  mode: 'cash',
  orderId: 'sample',
  pageId: 'sample',
  pnmTab: 'venues',
  productId: 'card-protector-gold',
  rewardId: 'daily_login',
  slug: 'sample',
  state: 'il',
  tableId: 'sample',
  username: 'sample',
};

const reachableRouteOverrides: Record<string, string> = {
  '/hub/home-games/[slug]': '/hub/home-games/the-midway-club',
  '/hub/poker-near-me/in/[state]/[city]': '/hub/poker-near-me/in/il/des-plaines',
  '/hub/venues/[id]': '/hub/venues/1868',
};

const routeMatrix = walkPages(path.join(process.cwd(), 'pages'))
  .filter((file) => /\.(?:js|jsx|ts|tsx)$/.test(file) && !file.includes(`${path.sep}api${path.sep}`))
  .map((file) => {
    const relative = path.relative(path.join(process.cwd(), 'pages'), file).replace(/\\/g, '/');
    return (`/${relative}`
      .replace(/\.(?:js|jsx|ts|tsx)$/, '')
      .replace(/\/index$/, '') || '/');
  })
  .filter((route) => !/^\/(?:_|404$|500$)/.test(route))
  .flatMap((sourceRoute) => {
    // Live Training gameplay owns the Club Arena action dock at the viewport
    // bottom. Browse, setup, progress, and review remain in this footer matrix;
    // only the dynamic arena table is deliberately immersive.
    if (sourceRoute.startsWith('/hub/training/arena/')) return [];
    const world = footerRegistry.worlds.find((candidate) =>
      candidate.routePrefixes.some(
        (prefix) => sourceRoute === prefix || sourceRoute.startsWith(`${prefix}/`)
      )
    );
    if (!world) return [];
    const reachableRoute =
      reachableRouteOverrides[sourceRoute] ||
      sourceRoute.replace(/\[([^.[\]]+)\]/g, (_, name: string) => dynamicSamples[name] || 'sample');
    return [{ sourceRoute, reachableRoute, world }];
  });

// Mirrors Club Arena's shipped `clamp(44px, 13.72vw, 132px)` navigation token.
const expectedClubFooterHeight = (viewportWidth: number) =>
  Math.min(132, Math.max(44, viewportWidth * 0.1372));

const visit = async (page: Page, route: string) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      return;
    } catch (error) {
      const isDocumentReplacement =
        /ERR_ABORTED|Frame load interrupted|is interrupted by another navigation/.test(String(error));
      if (attempt === 2 || !isDocumentReplacement) throw error;
      // The app updater can intentionally replace the first document after a
      // fresh production build. Let that replacement settle, then restore the
      // requested canonical URL. WebKit reports this as an overlapping
      // navigation instead of ERR_ABORTED.
      await page.waitForLoadState('domcontentloaded').catch(() => undefined);
    }
  }
};

test.describe('dynamic World Hub footer route and visual contract', () => {
  test('all 202 applicable routes server-render exactly one correct artwork footer', async ({ request }) => {
    test.setTimeout(300_000);
    expect(routeMatrix).toHaveLength(202);

    for (let offset = 0; offset < routeMatrix.length; offset += 8) {
      const batch = routeMatrix.slice(offset, offset + 8);
      await Promise.all(
        batch.map(async ({ sourceRoute, reachableRoute, world }) => {
          const response = await request.get(reachableRoute, {
            failOnStatusCode: false,
            timeout: 30_000,
          });
          expect(response.status(), `${sourceRoute} returned a server error`).toBeLessThan(500);
          const html = await response.text();
          const matches = html.match(
            new RegExp(`<nav[^>]+data-footer-world="${world.id}"`, 'g')
          );
          expect(matches || [], `${sourceRoute} did not render the ${world.id} footer`).toHaveLength(1);
          expect(html, `${sourceRoute} used the wrong exact asset`).toContain(
            `data-footer-artwork="${world.artwork.src}"`
          );
        })
      );
    }
  });

  test('all 14 worlds render their own complete, wired footer at 320px', async ({ page }) => {
    // The first request to each production page can perform SSR/data work on a
    // cold CI runner. This matrix deliberately visits 28 distinct URLs, so its
    // budget must cover cold starts without weakening any assertion.
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 320, height: 568 });

    for (const entry of WORLD_ROUTES) {
      const definition = footerRegistry.worlds.find((world) => world.id === entry.id);
      expect(definition, `missing registry definition for ${entry.id}`).toBeTruthy();

      await visit(page, entry.route);
      const nav = page.locator('[data-global-bottom-nav="true"]');
      await expect(nav).toHaveCount(1);
      await expect(nav).toBeVisible();
      await expect(nav).toHaveAttribute('data-footer-world', entry.id);
      await expect(nav).toHaveAttribute('data-footer-artwork', definition!.artwork.src);
      await expect(nav).toHaveAttribute('data-footer-cropped', 'true');
      await expect(nav).toHaveCSS('position', 'fixed');
      await expect(nav).toHaveCSS('pointer-events', 'none');
      await expect(nav).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(nav).toHaveCSS('padding-top', '0px');
      await expect(nav).toHaveCSS('padding-right', '0px');
      await expect(nav).toHaveCSS('padding-bottom', '0px');
      await expect(nav).toHaveCSS('padding-left', '0px');

      const links = nav.getByRole('link');
      await expect(links).toHaveCount(6);
      expect(await links.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href')))).toEqual(
        definition!.items.map((item) => item.href)
      );

      const navBox = await nav.boundingBox();
      expect(navBox).not.toBeNull();
      expect(navBox!.x).toBeGreaterThanOrEqual(-1);
      expect(navBox!.x + navBox!.width).toBeLessThanOrEqual(321);
      expect(Math.abs(navBox!.y + navBox!.height - 568)).toBeLessThan(4);

      const stage = nav.locator('.bn-artwork-stage');
      const artwork = nav.locator('[data-exact-approved-artwork="true"]');
      await expect(stage).toHaveCount(1);
      await expect(stage).toHaveCSS('pointer-events', 'none');
      await expect(stage).toHaveCSS('overflow', 'hidden');
      await expect(artwork).toHaveCount(1);
      await expect(artwork).toBeVisible();
      await expect(artwork).toHaveCSS('object-fit', 'contain');
      await expect(artwork).toHaveCSS('filter', 'none');
      await artwork.evaluate(async (image: HTMLImageElement) => {
        if (!image.complete || image.naturalWidth === 0) await image.decode();
      });

      const stageBox = await stage.boundingBox();
      expect(stageBox).not.toBeNull();
      const displayBounds = definition!.artwork.contentBounds;
      expect(Math.abs(stageBox!.width / stageBox!.height - displayBounds.width / displayBounds.height)).toBeLessThan(0.01);
      expect(Math.abs(stageBox!.y + stageBox!.height - 568)).toBeLessThan(4);
      expect(Math.abs(navBox!.height - stageBox!.height)).toBeLessThan(2);
      expect(await artwork.evaluate((image: HTMLImageElement) => [image.naturalWidth, image.naturalHeight])).toEqual([
        definition!.artwork.width,
        definition!.artwork.height,
      ]);

      for (let index = 0; index < 6; index += 1) {
        const link = links.nth(index);
        const linkBox = await link.boundingBox();
        expect(linkBox).not.toBeNull();
        expect(linkBox!.width).toBeGreaterThanOrEqual(44);
        expect(linkBox!.height).toBeGreaterThanOrEqual(44);
        expect(linkBox!.x).toBeGreaterThanOrEqual(stageBox!.x - 1);
        expect(linkBox!.x + linkBox!.width).toBeLessThanOrEqual(stageBox!.x + stageBox!.width + 1);
        await expect(link.locator('svg')).toHaveCount(0);
        await expect(link).toHaveCSS('pointer-events', 'auto');
        expect((await link.textContent()) || '').toBe('');
      }

      await visit(page, entry.childRoute);
      await expect(page.locator('[data-global-bottom-nav="true"]')).toHaveAttribute(
        'data-footer-world',
        entry.id
      );
    }
  });

  test('footer remains fixed, complete, and non-scrolling at every supported width', async ({
    page,
  }) => {
    // Seven full navigations plus WebKit viewport changes can exceed the
    // project-wide 30s default on a cold shared runner. Geometry assertions
    // remain strict; only the execution budget is widened.
    test.setTimeout(120_000);
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await visit(page, '/hub/training');

      const nav = page.locator('[data-global-bottom-nav="true"]');
      await expect(nav).toHaveCount(1);
      await expect(nav).toHaveAttribute('data-footer-world', 'training');
      await expect(nav).toHaveAttribute(
        'data-footer-artwork',
        '/images/footers/world-hub/footer-training-games.png'
      );
      await expect(nav).toHaveCSS('position', 'fixed');
      await expect(nav).toHaveCSS('transform', 'none');
      await expect(nav).toHaveCSS('transition-duration', '0s');

      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      // ServiceWorkerUpdater can replace the document once after a fresh
      // production build. WebKit may observe the locator during that narrow
      // replacement window even though the fixed footer is present before and
      // after it, so wait for the stable visible node before sampling geometry.
      await expect(nav).toBeVisible();
      const navBox = await nav.boundingBox();
      expect(navBox).not.toBeNull();
      expect(Math.abs(navBox!.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(navBox!.y + navBox!.height - viewport.height)).toBeLessThan(4);
      expect(navBox!.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(await nav.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);

      const links = nav.getByRole('link');
      await expect(links).toHaveCount(6);
      for (let index = 0; index < 6; index += 1) {
        const box = await links.nth(index).boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(-1);
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }

      const clearance = page.locator('[data-bottom-nav-clearance="true"]');
      await expect(clearance).toHaveCount(1);
      const clearanceBox = await clearance.boundingBox();
      expect(clearanceBox).not.toBeNull();
      expect(Math.abs(clearanceBox!.height - navBox!.height)).toBeLessThan(2);
    }
  });

  test('the fallback remains available on legacy World Hub pages', async ({ page }) => {
    await visit(page, '/hub/install');
    const nav = page.locator('[data-global-bottom-nav="true"]');
    await expect(nav).toHaveCount(1);
    await expect(nav).toHaveAttribute('data-footer-world', 'global');
    await expect(nav.getByRole('link')).toHaveCount(6);
  });

  test('the World Hub landing page stays footerless', async ({ page }) => {
    await visit(page, '/hub');
    await expect(page.locator('[data-global-bottom-nav="true"]')).toHaveCount(0);
    await expect(page.locator('[data-bottom-nav-clearance="true"]')).toHaveCount(0);
  });

  test('all 84 transparent controls dispatch their exact existing destinations', async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 390, height: 844 });

    // Install the audit listener before any document is created. The app
    // updater can replace the first production document in WebKit; an init
    // script is reapplied to that replacement, while an evaluate-installed
    // listener would be lost midway through this matrix.
    await page.addInitScript(() => {
      (window as Window & { __footerClickAudit?: string[] }).__footerClickAudit = [];
      document.addEventListener(
        'click',
        (event) => {
          const target = event.target as Element | null;
          const link = target?.closest?.('[data-footer-destination]') as HTMLAnchorElement | null;
          if (!link) return;
          event.preventDefault();
          (window as Window & { __footerClickAudit?: string[] }).__footerClickAudit?.push(
            link.getAttribute('href') || ''
          );
        },
        { capture: true, once: false }
      );
    });

    for (const entry of WORLD_ROUTES) {
      const definition = footerRegistry.worlds.find((world) => world.id === entry.id)!;
      await visit(page, entry.route);
      // Page-owned onboarding must remain above the footer. Dismiss it before
      // auditing footer destinations instead of depending on navigation to
      // incorrectly cover an active dialog/popover.
      const dismissOnboarding = page.getByRole('button', { name: "Don't Show Again" });
      if (entry.id === 'poker-near-me') {
        await dismissOnboarding.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => undefined);
      }
      if (await dismissOnboarding.isVisible().catch(() => false)) {
        await dismissOnboarding.click();
      }
      const nav = page.locator(`[data-footer-world="${entry.id}"]`);
      await expect(nav).toHaveCount(1);

      // Poker Near Me can legitimately open its first-run tutorial above the
      // global footer. Close that modal before auditing the footer itself; a
      // modal intercepting navigation while open is the correct stack order.
      const dismissTutorial = page.getByRole('button', { name: "Don't Show Again" });
      if (entry.id === 'poker-near-me') {
        await dismissTutorial.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => undefined);
      }
      if (await dismissTutorial.isVisible().catch(() => false)) {
        await dismissTutorial.click();
      }
      const dismissInstall = page.getByRole('button', { name: 'Later' });
      if (await dismissInstall.isVisible().catch(() => false)) await dismissInstall.click();

      await page.evaluate(() => {
        (window as Window & { __footerClickAudit?: string[] }).__footerClickAudit = [];
      });

      const links = nav.getByRole('link');
      for (let index = 0; index < definition.items.length; index += 1) {
        await links.nth(index).click();
      }

      expect(
        await page.evaluate(
          () => (window as Window & { __footerClickAudit?: string[] }).__footerClickAudit
        )
      ).toEqual(definition.items.map((item) => item.href));
    }
  });

  test('Club Arena lobby stays footerless and its probe route stays complete', async ({ page }) => {
    await visit(page, '/hub/club-arena');
    await expect(page.locator('[data-global-bottom-nav="true"]')).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Club Arena' })).toHaveCount(0);

    const probePage = await page.context().newPage();
    await probePage.goto('/hub/club-arena/dev/footer', { waitUntil: 'domcontentloaded' });
    const clubNav = probePage.getByRole('navigation', { name: 'Club Arena' });
    await expect(clubNav).toHaveCount(1);
    await expect(clubNav).toHaveCSS('position', 'fixed');
    await expect(clubNav.locator('[data-footer-control]')).toHaveCount(6);

    const viewport = probePage.viewportSize();
    const box = await clubNav.boundingBox();
    expect(viewport).not.toBeNull();
    expect(box).not.toBeNull();
    expect(Math.abs(box!.y + box!.height - viewport!.height)).toBeLessThan(4);
    expect(Math.abs(box!.height - expectedClubFooterHeight(viewport!.width))).toBeLessThanOrEqual(1);
    await probePage.close();
  });
});
