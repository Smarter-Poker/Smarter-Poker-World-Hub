import { expect, test, type BrowserContext, type Page } from '@playwright/test';
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
  {
    id: 'personal-assistant',
    route: '/hub/personal-assistant',
    childRoute: '/hub/personal-assistant/leaks',
  },
  { id: 'training', route: '/hub/training', childRoute: '/hub/training/progress' },
  { id: 'news', route: '/hub/news', childRoute: '/hub/news/sources' },
  { id: 'trivia', route: '/hub/trivia', childRoute: '/hub/trivia/stats' },
  { id: 'social-media', route: '/hub/social-media', childRoute: '/hub/reels' },
  { id: 'my-clubs', route: '/hub/my-venues', childRoute: '/hub/my-venues?view=saved' },
  {
    id: 'video-library',
    route: '/hub/video-library',
    childRoute: '/hub/video-library?filter=history',
  },
  { id: 'odds-calculator', route: '/hub/poker-tools', childRoute: '/hub/poker-tools#results' },
  {
    id: 'bankroll-manager',
    route: '/hub/bankroll-manager',
    childRoute: '/hub/bankroll-manager/export',
  },
  { id: 'toke-tracker', route: '/hub/toke-tracker', childRoute: '/hub/toke-tracker/analytics' },
  { id: 'preflop-charts', route: '/hub/preflop-charts', childRoute: '/hub/preflop-charts/stats' },
  {
    id: 'poker-near-me',
    route: '/hub/poker-near-me/lobby',
    childRoute: '/hub/poker-near-me/events',
  },
  { id: 'marketplace', route: '/hub/merch-store', childRoute: '/hub/vip-membership' },
];

const PAGE_OWNED_FOOTER_ROUTES = new Set(['/hub/diamond-store', '/hub/marketplace']);

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

// These legacy pages are still physical Pages Router routes, but their
// runtime owner is the immersive Training Arena. The arena deliberately has
// no World Hub footer, so the route matrix must verify the redirect boundary
// instead of attributing a footer to the pre-redirect page.
const redirectOwnedRoutes: Record<string, { pathname: string }> = {
  '/hub/training/quiz-gauntlet': {
    pathname: '/hub/training/arena/quiz-gauntlet',
  },
};

const routeMatrix = walkPages(path.join(process.cwd(), 'pages'))
  .filter(
    (file) => /\.(?:js|jsx|ts|tsx)$/.test(file) && !file.includes(`${path.sep}api${path.sep}`)
  )
  .map((file) => {
    const relative = path.relative(path.join(process.cwd(), 'pages'), file).replace(/\\/g, '/');
    return `/${relative}`.replace(/\.(?:js|jsx|ts|tsx)$/, '').replace(/\/index$/, '') || '/';
  })
  .filter((route) => !/^\/(?:_|404$|500$)/.test(route))
  .flatMap((sourceRoute) => {
    // Live Training gameplay owns the Club Arena action dock at the viewport
    // bottom. Browse, setup, progress, and review remain in this footer matrix;
    // only the dynamic arena table is deliberately immersive.
    if (sourceRoute.startsWith('/hub/training/arena/')) return [];
    if (PAGE_OWNED_FOOTER_ROUTES.has(sourceRoute)) return [];
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

// Mirrors Club Arena's shipped `clamp(44px, 12.326vw, 132px)` navigation token.
const expectedClubFooterHeight = (viewportWidth: number) =>
  Math.min(132, Math.max(44, viewportWidth * 0.12326));

const expectedArtworkStage = (
  viewportWidth: number,
  world: (typeof footerRegistry.worlds)[number]
) => {
  const artwork = world.artwork;
  const display =
    artwork.cropToContentBounds !== false && artwork.contentBounds
      ? artwork.contentBounds
      : artwork;
  const aspect = display.width / display.height;
  const width = Math.min(
    viewportWidth,
    Math.max(world.items.length * 44 + 1, expectedClubFooterHeight(viewportWidth) * aspect)
  );
  return { width, height: width / aspect };
};

const visit = async (page: Page, route: string) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      return;
    } catch (error) {
      const isDocumentReplacement =
        /ERR_ABORTED|Frame load interrupted|is interrupted by another navigation/.test(
          String(error)
        );
      if (attempt === 2 || !isDocumentReplacement) throw error;
      // The app updater can intentionally replace the first document after a
      // fresh production build. Let that replacement settle, then restore the
      // requested canonical URL. WebKit reports this as an overlapping
      // navigation instead of ERR_ABORTED.
      await page.waitForLoadState('domcontentloaded').catch(() => undefined);
    }
  }
};

const withIsolatedPage = async <T>(
  context: BrowserContext,
  callback: (page: Page) => Promise<T>
) => {
  const page = await context.newPage();
  try {
    return await callback(page);
  } finally {
    await page.close();
  }
};

// `/hub/my-venues` owns the my-clubs footer, but its client shell is auth-gated
// after SSR. Keep the visual/navigation contract on that canonical route while
// giving each isolated page a deterministic, non-secret session-shaped value;
// otherwise the shell redirects to Secure Sign In before the footer assertions
// can settle. This is deliberately test-local and does not grant access to any
// production data or call a privileged API.
const installFooterAuthBoundary = async (page: Page, worldId: string) => {
  if (worldId !== 'my-clubs') return;
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'smarter-poker-auth',
      JSON.stringify({
        access_token: 'footer-visual-boundary-token',
        refresh_token: 'footer-visual-boundary-refresh',
        expires_at: 4102444800,
        expires_in: 2147483647,
        token_type: 'bearer',
        user: {
          id: '00000000-0000-4000-8000-000000000099',
          email: 'footer-visual-boundary@example.test',
          role: 'authenticated',
        },
      })
    );
  });
};

/**
 * HOW MANY ROUTES THIS SUITE EXPECTS, DERIVED RATHER THAN TYPED (2026-09-07).
 *
 * This was the literal `202`, and on 2026-09-07 PR #1538 added "/home-game" to
 * the poker-near-me world's routePrefixes. That correctly pulled
 * `pages/home-game/[code].js` into the matrix and made it 203. The same PR
 * updated the OTHER two copies of the count — `scripts/generate-world-footer-
 * route-matrix.mjs` and `docs/world-hub-footer-route-matrix.md`, both 203 -> 204
 * — and missed this one. Push Delivery Watchdog went red and stayed red,
 * because the footer probe is bolted into that workflow and neither is a
 * required check. Three copies of one number is three chances to drift.
 *
 * The count now comes from the committed matrix document, which is generated
 * output a human reviews in the diff — so the guard still guards. Adding a
 * route means regenerating that doc deliberately; it cannot happen silently.
 *
 * The document counts every applicable physical route. This suite additionally
 * excludes the live Training arena (see the flatMap above), so the expectation
 * is the document's total minus those.
 */
const matrixDoc = fs.readFileSync(
  path.join(process.cwd(), 'docs/world-hub-footer-route-matrix.md'),
  'utf8'
);
const documentedTotal = Number(
  /Total applicable physical routes:\s*(\d+)/.exec(matrixDoc)?.[1] ?? NaN
);
const arenaRoutesExcluded = (matrixDoc.match(/^\|\s*`?\/hub\/training\/arena\//gm) || []).length;
const EXPECTED_ROUTES = documentedTotal - arenaRoutesExcluded;

test.describe('dynamic World Hub footer route and visual contract', () => {
  test('Diamond Marketplace owns one in-flow footer without losing its copy policy', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await visit(page, '/hub/diamond-store');

    await expect(page.locator('[data-global-bottom-nav="true"]')).toHaveCount(0);
    const pageFooter = page.locator('[data-marketplace-page-footer="true"]');
    await expect(pageFooter).toHaveCount(1);
    await expect(pageFooter).toBeVisible();
    await expect(pageFooter).toHaveAttribute('data-footer-layout', 'in-flow');
    await expect(pageFooter).toHaveCSS('position', 'static');
    await expect(page.locator('body')).toHaveAttribute('data-world-copy-policy', 'marketplace');
    await expect(page.locator('.world-copy-scope')).toHaveCount(1);
  });

  test('every applicable route server-renders exactly one correct artwork footer', async ({
    request,
  }) => {
    test.setTimeout(300_000);
    expect(
      Number.isFinite(documentedTotal),
      'docs/world-hub-footer-route-matrix.md no longer states its total; regenerate it with scripts/generate-world-footer-route-matrix.mjs'
    ).toBe(true);
    expect(
      routeMatrix,
      `the walked route matrix disagrees with docs/world-hub-footer-route-matrix.md ` +
        `(${documentedTotal} documented, ${arenaRoutesExcluded} arena route(s) excluded here). ` +
        `If you added or removed a route, regenerate that document in the same commit.`
    ).toHaveLength(EXPECTED_ROUTES);

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
          const redirectOwner = redirectOwnedRoutes[sourceRoute];
          if (redirectOwner) {
            expect(new URL(response.url()).pathname, `${sourceRoute} redirect owner drifted`).toBe(
              redirectOwner.pathname
            );
            expect(
              html,
              `${sourceRoute} must not render a World Hub footer before arena ownership`
            ).not.toContain('data-global-bottom-nav="true"');
            return;
          }
          const matches = html.match(new RegExp(`<nav[^>]+data-footer-world="${world.id}"`, 'g'));
          expect(
            matches || [],
            `${sourceRoute} did not render the ${world.id} footer`
          ).toHaveLength(1);
          expect(html, `${sourceRoute} used the wrong exact asset`).toContain(
            `data-footer-artwork="${world.artwork.src}"`
          );
        })
      );
    }
  });

  test('all 14 worlds render their own complete, wired footer at 320px', async ({ context }) => {
    // The first request to each production page can perform SSR/data work on a
    // cold CI runner. This matrix deliberately visits 28 distinct URLs, so its
    // budget must cover cold starts without weakening any assertion.
    test.setTimeout(120_000);
    for (const entry of WORLD_ROUTES) {
      await withIsolatedPage(context, async (page) => {
        const definition = footerRegistry.worlds.find((world) => world.id === entry.id);
        expect(definition, `missing registry definition for ${entry.id}`).toBeTruthy();

        await page.setViewportSize({ width: 320, height: 568 });
        await installFooterAuthBoundary(page, entry.id);
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
        expect(
          await links.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href')))
        ).toEqual(definition!.items.map((item) => item.href));

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
        await expect(artwork).toHaveCSS('object-fit', 'fill');
        await expect(artwork).toHaveCSS('filter', 'none');
        await artwork.evaluate(async (image: HTMLImageElement) => {
          if (!image.complete || image.naturalWidth === 0) await image.decode();
        });

        const stageBox = await stage.boundingBox();
        expect(stageBox).not.toBeNull();
        // Every authored frame keeps its measured aspect ratio. The stage uses
        // Club Arena's shared height token unless it needs a small width floor to
        // keep six 44px destinations usable, and it never exceeds the viewport.
        const expectedStage = expectedArtworkStage(320, definition!);
        expect(Math.abs(stageBox!.width - expectedStage.width)).toBeLessThanOrEqual(1);
        expect(Math.abs(stageBox!.height - expectedStage.height)).toBeLessThanOrEqual(1);
        expect(Math.abs(stageBox!.y + stageBox!.height - 568)).toBeLessThan(4);
        expect(Math.abs(navBox!.height - stageBox!.height)).toBeLessThan(2);
        expect(
          await artwork.evaluate((image: HTMLImageElement) => [
            image.naturalWidth,
            image.naturalHeight,
          ])
        ).toEqual([definition!.artwork.width, definition!.artwork.height]);

        for (let index = 0; index < 6; index += 1) {
          const link = links.nth(index);
          const linkBox = await link.boundingBox();
          expect(linkBox).not.toBeNull();
          expect(linkBox!.width).toBeGreaterThanOrEqual(44);
          expect(linkBox!.height).toBeGreaterThanOrEqual(44);
          expect(linkBox!.x).toBeGreaterThanOrEqual(stageBox!.x - 1);
          expect(linkBox!.x + linkBox!.width).toBeLessThanOrEqual(
            stageBox!.x + stageBox!.width + 1
          );
          await expect(link.locator('svg')).toHaveCount(0);
          await expect(link).toHaveCSS('pointer-events', 'auto');
          expect((await link.textContent()) || '').toBe('');
        }

        await visit(page, entry.childRoute);
        await expect(page.locator('[data-global-bottom-nav="true"]')).toHaveAttribute(
          'data-footer-world',
          entry.id
        );
      });
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
        '/images/footers/world-hub/footer-training-games-v2.png'
      );
      await expect(nav).toHaveCSS('position', 'fixed');
      await expect(nav).toHaveCSS('transform', 'none');
      await expect(nav).toHaveCSS('transition-duration', '0s');

      // Travel to the end of the page and back. Since 2026-09-04 the footer
      // hides while the reader is moving down (Dan's Facebook behaviour), so
      // the weld is asserted where it is shown — after coming back up.
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(80);
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
      // The Club Arena height token, at every supported width. This is the one
      // assertion that keeps the estate looking like a single product.
      expect(
        Math.abs(navBox!.height - expectedClubFooterHeight(viewport.width))
      ).toBeLessThanOrEqual(3);
      expect(await nav.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true
      );

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

  /**
   * Dan, 2026-09-04: "any other pages that you can 'scroll up to see more'
   * need this same disappearing footer functionality... implement this
   * everywhere its needed."
   *
   * Every world, plus the legacy fallback. The page is forced tall so the
   * assertion measures the behaviour rather than whether that particular route
   * happened to have enough content to scroll on the day CI ran.
   */
  test('every footer drops while the reader travels down and returns on the way back up', async ({
    context,
  }) => {
    test.setTimeout(180_000);

    for (const entry of [...WORLD_ROUTES, { id: 'global', route: '/hub/install' }]) {
      await withIsolatedPage(context, async (page) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.addInitScript(() => {
          window.localStorage.setItem('pnm_lobby_tutorial_seen', '1');
          window.localStorage.setItem('pnm_tutorial_seen', '1');
        });
        await installFooterAuthBoundary(page, entry.id);
        await visit(page, entry.route);
        const nav = page.locator('[data-global-bottom-nav="true"]');
        await expect(nav).toHaveCount(1);
        await expect(nav).toHaveAttribute('data-footer-hide-on-scroll', 'true');
        await expect(nav).toHaveAttribute('data-footer-hidden', 'false');
        // The listener is installed by an effect after hydration. On a loaded
        // Linux WebKit (CI, 2026-09-04) the first scrolls below landed BEFORE
        // it existed, nothing saw them, and "should hide" failed on whichever
        // world happened to hydrate slowest. Wait for the fact, not the clock.
        await expect(nav).toHaveAttribute('data-footer-scroll-armed', 'true');

        await page.evaluate(() => {
          document.body.style.minHeight = '400vh';
          window.scrollTo(0, 0);
        });
        await page.waitForTimeout(60);

        // Down, in steps, the way a thumb moves - AND A FRAME BETWEEN THEM, the
        // way a thumb moves. Two scrollTo calls with no yield between them let
        // the browser deliver ONE scroll event for the pair, at whichever
        // position it sampled: traced on 2026-09-04 as `200` delivered, `600`
        // never delivered, then the up-scroll reported as `400` - which the bar
        // correctly read as 200 -> 400, still downward, and stayed hidden. The
        // hook was right about the events it was given; the test had not given
        // it the ones it assumed. One frame per step is what a finger does.
        await page.evaluate(() => window.scrollTo(0, 200));
        await page.waitForTimeout(50);
        await page.evaluate(() => window.scrollTo(0, 600));
        await page.waitForTimeout(50);
        await expect(nav, `${entry.id} should hide while reading downward`).toHaveAttribute(
          'data-footer-hidden',
          'true'
        );
        await expect
          .poll(
            async () => {
              const hiddenBox = await nav.boundingBox();
              return hiddenBox ? hiddenBox.y : -Infinity;
            },
            { message: `${entry.id} must park below the viewport, not shrink or fade` }
          )
          .toBeGreaterThanOrEqual(844 - 1);

        // Back up, and it is there again.
        await page.evaluate(() => window.scrollTo(0, 400));
        await page.waitForTimeout(60);
        // A second short upward sample makes the return observable even when a
        // page-owned horizontal rail emits a scroll in the same animation frame
        // (notably Video Library). The footer still sees ordinary document
        // travel; this only prevents unrelated horizontal work from coalescing
        // with the one reverse sample under WebKit.
        await page.evaluate(() => window.scrollTo(0, 300));
        await page.waitForTimeout(60);
        await expect(nav, `${entry.id} should return on the way back up`).toHaveAttribute(
          'data-footer-hidden',
          'false'
        );
        // data-footer-hidden flips when the return transition begins. WebKit
        // occasionally reports the element one frame before its transform has
        // reached zero, so assert the settled geometry rather than sampling the
        // transition's first frame.
        await expect
          .poll(async () => {
            const shownBox = await nav.boundingBox();
            return shownBox ? Math.abs(shownBox.y + shownBox.height - 844) : Infinity;
          })
          .toBeLessThan(4);
      });
    }
  });

  test('a small inner scroller cannot countermand document travel', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await visit(page, '/hub/video-library');

    const nav = page.locator('[data-global-bottom-nav="true"]');
    await expect(nav).toHaveAttribute('data-footer-scroll-armed', 'true');
    await page.evaluate(() => {
      document.body.style.minHeight = '400vh';
      window.scrollTo(0, 200);
    });
    await page.waitForTimeout(50);
    await page.evaluate(() => window.scrollTo(0, 600));
    await expect(nav).toHaveAttribute('data-footer-hidden', 'true');

    // A late-loading rail can transiently gain a few pixels of vertical
    // overflow. It never met MIN_SCROLLER_RANGE, so its own scroll event must
    // not reveal a footer that document travel parked below the viewport.
    await page.evaluate(() => {
      const rail = document.createElement('div');
      rail.dataset.footerSmallScrollerProbe = 'true';
      rail.style.cssText =
        'position:fixed;top:0;left:0;width:20px;height:44px;overflow-y:auto;pointer-events:none';
      const content = document.createElement('div');
      content.style.height = '64px';
      rail.appendChild(content);
      document.body.appendChild(rail);
      rail.scrollTop = 1;
    });

    await page.waitForTimeout(50);
    await expect(nav).toHaveAttribute('data-footer-hidden', 'true');
    await expect
      .poll(async () => (await nav.boundingBox())?.y ?? -Infinity)
      .toBeGreaterThanOrEqual(844 - 1);
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

  test('all 84 transparent controls dispatch their exact existing destinations', async ({
    context,
  }) => {
    test.setTimeout(180_000);

    for (const entry of WORLD_ROUTES) {
      await withIsolatedPage(context, async (page) => {
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
              const link = target?.closest?.(
                '[data-footer-destination]'
              ) as HTMLAnchorElement | null;
              if (!link) return;
              event.preventDefault();
              (window as Window & { __footerClickAudit?: string[] }).__footerClickAudit?.push(
                link.getAttribute('href') || ''
              );
            },
            { capture: true, once: false }
          );
        });

        await page.setViewportSize({ width: 390, height: 844 });
        await installFooterAuthBoundary(page, entry.id);
        const definition = footerRegistry.worlds.find((world) => world.id === entry.id)!;
        await visit(page, entry.route);
        // Page-owned onboarding must remain above the footer. Dismiss it before
        // auditing footer destinations instead of depending on navigation to
        // incorrectly cover an active dialog/popover.
        const dismissOnboarding = page.getByRole('button', { name: "Don't Show Again" });
        if (entry.id === 'poker-near-me') {
          await dismissOnboarding
            .waitFor({ state: 'visible', timeout: 5_000 })
            .catch(() => undefined);
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
          await dismissTutorial
            .waitFor({ state: 'visible', timeout: 5_000 })
            .catch(() => undefined);
        }
        if (await dismissTutorial.isVisible().catch(() => false)) {
          await dismissTutorial.click();
        }
        const dismissInstall = page.getByRole('button', { name: 'Later' });
        if (await dismissInstall.isVisible().catch(() => false)) await dismissInstall.click();

        const links = nav.getByRole('link');
        const capturedWorldHrefs: string[] = [];
        for (let index = 0; index < definition.items.length; index += 1) {
          const expectedHref = definition.items[index].href;
          let capturedHref: string | undefined;

          // WebKit can replace the first production document while the app
          // updater settles. A locator click that began against that retired
          // document may complete without reaching its capture listener. Keep
          // each click's browser audit isolated so a replacement cannot erase a
          // prior click and shift every later array index. Retry only when no
          // click was observed; a captured wrong destination still fails
          // immediately below, and the Node-owned aggregate remains an exact
          // one-for-one check of all 84 destinations.
          for (let attempt = 0; attempt < 3 && capturedHref === undefined; attempt += 1) {
            await page.evaluate(() => {
              (window as Window & { __footerClickAudit?: string[] }).__footerClickAudit = [];
            });
            await links.nth(index).click();
            capturedHref = await page.evaluate(
              () => (window as Window & { __footerClickAudit?: string[] }).__footerClickAudit?.[0]
            );
            if (capturedHref === undefined) await page.waitForTimeout(100);
          }

          if (capturedHref === undefined) {
            throw new Error(`Footer click ${index + 1} for ${definition.id} was not captured.`);
          }
          expect(capturedHref).toBe(expectedHref);
          capturedWorldHrefs.push(capturedHref);
        }

        expect(capturedWorldHrefs).toEqual(definition.items.map((item) => item.href));
      });
    }
  });

  test('Poker Arena lobby stays footerless and its probe route stays complete', async ({ page }) => {
    await visit(page, '/hub/club-arena');
    await expect(page.locator('[data-global-bottom-nav="true"]')).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Poker Arena' })).toHaveCount(0);

    const probePage = await page.context().newPage();
    await probePage.goto('/hub/club-arena/dev/footer', { waitUntil: 'domcontentloaded' });
    const clubNav = probePage.getByRole('navigation', { name: 'Poker Arena' });
    await expect(clubNav).toHaveCount(1);
    await expect(clubNav).toHaveCSS('position', 'fixed');
    await expect(clubNav.locator('[data-footer-control]')).toHaveCount(6);

    const viewport = probePage.viewportSize();
    const box = await clubNav.boundingBox();
    expect(viewport).not.toBeNull();
    expect(box).not.toBeNull();
    expect(Math.abs(box!.y + box!.height - viewport!.height)).toBeLessThan(4);
    expect(Math.abs(box!.height - expectedClubFooterHeight(viewport!.width))).toBeLessThanOrEqual(
      1
    );
    await probePage.close();
  });
});
