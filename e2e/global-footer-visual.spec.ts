import { expect, test, type Page } from '@playwright/test';
import footerRegistry from '../src/config/world-footer-navigation.json';

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 1100, height: 720 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
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

const expectedClubFooterHeight = (viewportWidth: number) =>
  Math.min(263, Math.max(44, viewportWidth * 0.1372));

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
      await expect(nav).toHaveCSS('position', 'fixed');

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

      for (let index = 0; index < 6; index += 1) {
        const link = links.nth(index);
        const linkBox = await link.boundingBox();
        const iconBox = await link.locator('svg').first().boundingBox();
        const labelBox = await link.locator('.bn-label').boundingBox();
        expect(linkBox).not.toBeNull();
        expect(iconBox).not.toBeNull();
        expect(labelBox).not.toBeNull();
        expect(linkBox!.width).toBeGreaterThanOrEqual(44);
        expect(linkBox!.height).toBeGreaterThanOrEqual(44);
        expect(iconBox!.x).toBeGreaterThanOrEqual(linkBox!.x - 1);
        expect(iconBox!.x + iconBox!.width).toBeLessThanOrEqual(linkBox!.x + linkBox!.width + 1);
        expect(labelBox!.x).toBeGreaterThanOrEqual(linkBox!.x - 1);
        expect(labelBox!.x + labelBox!.width).toBeLessThanOrEqual(linkBox!.x + linkBox!.width + 1);
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
      expect(clearanceBox!.height).toBeGreaterThan(navBox!.height);
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
