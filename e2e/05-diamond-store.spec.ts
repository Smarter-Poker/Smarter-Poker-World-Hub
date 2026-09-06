import { test, expect } from '@playwright/test';

const AXE_PATH = require.resolve('axe-core/axe.min.js');
const COPY_AUDIT_CLUB_ID = '00000000-0000-4000-8000-000000000093';
const COPY_AUDIT_CLUB_ITEM_ID = '00000000-0000-4000-8000-000000000094';

const ROUTES = [
  { path: '/hub/diamond-store', title: 'Diamond Store: Smarter.Poker', heading: 'Play At Your Own Altitude.', hero: 'diamond-vault-hero.webp' },
  { path: '/hub/vip-membership', title: 'VIP Membership: Smarter.Poker', heading: 'Your Edge, Compounded.', hero: 'vip-hero.webp' },
  { path: '/hub/merch-store', title: 'Merch Store: Smarter.Poker', heading: 'Built For The Long Session.', hero: 'merch-hero.webp' },
  { path: '/hub/smarter-rewards', title: 'Smarter Rewards: Smarter.Poker', heading: 'Make Every Hand Count.', hero: 'rewards-hero.webp' },
  { path: '/hub/club-shop', title: 'Club Shop: Smarter.Poker', heading: 'Your Game. Your Rules.', hero: 'club-shop-hero.webp' },
] as const;

const MARKETPLACE_COPY_ROUTES = [
  '/hub/diamond-store',
  '/hub/diamond-store/cart',
  '/hub/diamond-store/orders',
  '/hub/diamond-store/orders/phase-2-proof?source=merchandise',
  '/hub/diamond-store/wishlist',
  '/hub/vip-membership',
  '/hub/vip-membership/compare',
  '/hub/vip-membership/manage',
  '/hub/merch-store',
  '/hub/merch-store/hoodie-neural',
  '/hub/merch-store/fulfillment',
  '/hub/smarter-rewards',
  '/hub/smarter-rewards/daily_login',
  '/hub/club-shop',
  `/hub/club-shop/${COPY_AUDIT_CLUB_ITEM_ID}?clubId=${COPY_AUDIT_CLUB_ID}`,
] as const;

test.describe('5. Storefront Routes And Design Contract', () => {
  test('raw HTML owns route metadata and primary content before hydration', async ({ request }) => {
    for (const route of ROUTES) {
      const response = await request.get(route.path);
      expect(response.status()).toBeLessThan(400);
      const html = await response.text();
      // Next.js annotates page-owned head tags with data-next-head in exported
      // HTML, so assert the title content without requiring a tag with no
      // framework attributes.
      expect(html).toContain(`${route.title}</title>`);
      expect(html).toContain(`rel="canonical" href="https://smarter.poker${route.path}"`);
      expect(html).toContain(route.heading);
      expect(html).toContain(route.hero);
      expect(html).toContain('data-marketplace-header-reserve="true"');
    }
  });

  for (const route of ROUTES) {
    test(`${route.path} owns its route, metadata, hero, and responsive canvas`, async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on('console', (message) => {
        const text = message.text();
        // Chromium reports expected anonymous 400/401 resource responses as
        // console errors without a URL. Keep this assertion focused on
        // actionable JavaScript errors; HTTP behavior has separate checks.
        // Local optimized builds also run without production Supabase secrets;
        // Vercel supplies them for preview and production deployments.
        const isLocalMissingEnv = text.startsWith('[ANTIGRAVITY] Required env vars are NOT set:');
        if (
          message.type() === 'error' &&
          !text.startsWith('Failed to load resource:') &&
          !isLocalMissingEnv
        ) {
          consoleErrors.push(text);
        }
      });

      const response = await page.goto(route.path, { waitUntil: 'domcontentloaded' });
      expect(response?.status()).toBeLessThan(400);
      await expect(page).toHaveTitle(route.title);
      await expect(page.getByRole('heading', { level: 1, name: route.heading })).toHaveCount(1);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://smarter.poker${route.path}`);
      // _document carries a site-wide fallback OG title for pages that do not
      // provide one. Verify this route's exact tag instead of relying on DOM
      // order between the page head and that shared fallback.
      await expect(
        page.locator(`meta[property="og:title"][content="${route.title}"]`),
      ).toHaveCount(1);
      await expect(page.locator(`link[rel="preload"][as="image"][href$="${route.hero}"]`)).toHaveCount(1);

      const widths = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        document: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
        main: document.querySelector('main')?.scrollWidth || 0,
      }));
      expect(widths.document).toBeLessThanOrEqual(widths.viewport);
      expect(widths.body).toBeLessThanOrEqual(widths.viewport);
      expect(widths.main).toBeLessThanOrEqual(widths.viewport);

      const storeNav = page.getByRole('navigation', { name: 'Store Sections' });
      await expect(storeNav.getByRole('link')).toHaveCount(5);
      await expect(storeNav.getByRole('link', { name: /Current Page/ })).toHaveAttribute('aria-current', 'page');
      for (const link of await storeNav.getByRole('link').all()) {
        await expect(link).not.toHaveAttribute('target');
      }
      expect(consoleErrors).toEqual([]);
    });
  }

  test('marketplace copy is title-cased and contains no banned long bars', async ({ page }) => {
    // The matrix includes private cart, order, wishlist and membership routes.
    // Seed the same deterministic local session used by the authenticated
    // commerce tests so this assertion audits the actual page instead of the
    // correct unauthenticated redirect boundary.
    await page.addInitScript(() => {
      const user = {
        id: '00000000-0000-4000-8000-000000000022',
        email: 'phase22-copy@example.test',
        role: 'authenticated',
      };
      window.localStorage.setItem('smarter-poker-auth', JSON.stringify({
        access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMjIiLCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImF1ZCI6ImF1dGhlbnRpY2F0ZWQiLCJleHAiOjQxMDI0NDQ4MDB9.phase22signature',
        refresh_token: 'phase-22-copy-refresh',
        expires_at: 4102444800,
        expires_in: 2147483647,
        token_type: 'bearer',
        user,
      }));
    });
    // The Club Shop detail route is owner-scoped and therefore cannot rely on
    // anonymous production inventory. Supply one deterministic item so the
    // copy audit exercises the fully rendered subpage instead of a not-found
    // boundary. All other Marketplace requests continue to their real target.
    await page.route('**/api/club-arena/marketplace-items?*', async (route) => {
      const requestUrl = new URL(route.request().url());
      if (requestUrl.searchParams.get('clubId') !== COPY_AUDIT_CLUB_ID) {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          clubId: COPY_AUDIT_CLUB_ID,
          balance: 5000,
          items: [{
            id: COPY_AUDIT_CLUB_ITEM_ID,
            name: 'Verified Club Detail',
            description: 'Every Dynamic Word Follows The Marketplace Copy Contract',
            price: 1500,
            category: 'Time Banks',
          }],
        }),
      });
    });

    for (const path of MARKETPLACE_COPY_ROUTES) {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      const main = page.locator('main');
      await expect(main).toBeVisible();
      // Authenticated commerce pages briefly own a deliberately minimal
      // loading main while their local cart or ledger hydrates. Wait for the
      // real Marketplace shell before asserting its inherited copy contract.
      await expect.poll(
        () => main.evaluate((element) => getComputedStyle(element).textTransform),
        { message: `${path} should render inside the Title Case Marketplace shell` },
      ).toBe('capitalize');
      expect(await main.innerText()).not.toMatch(/[\u2013\u2014]/u);
      expect(await page.title()).not.toMatch(/[\u2013\u2014]/u);
      await expect(main.locator('a[target="_blank"]')).toHaveCount(0);
    }
  });

  test('global header structure is identical across all five storefront routes', async ({ page }) => {
    const headerStructures: string[] = [];
    for (const route of ROUTES) {
      await page.goto(route.path, { waitUntil: 'domcontentloaded' });
      const header = page.locator('header').first();
      await expect(header).toBeVisible();
      headerStructures.push(await header.evaluate((element) => {
        // Profile, wallet and notification text hydrate asynchronously and are
        // supposed to change. Compare the actual navigation/control contract,
        // not volatile account copy captured at different network moments.
        const controls = Array.from(element.querySelectorAll('a, button, img')).map((node) => ({
          tag: node.tagName,
          href: node.getAttribute('href'),
          target: node.getAttribute('target'),
          type: node.getAttribute('type'),
          ariaLabel: node.getAttribute('aria-label'),
          title: node.getAttribute('title'),
          src: node.getAttribute('src'),
          alt: node.getAttribute('alt'),
        }));
        return JSON.stringify({
          tag: element.tagName,
          className: element.className,
          artwork: element.getAttribute('data-artwork'),
          controls,
        });
      }));
    }
    expect(new Set(headerStructures).size).toBe(1);
  });

  test('marketplace canvases have no serious automated WCAG A or AA violations', async ({ page }) => {
    for (const route of ROUTES) {
      await page.goto(route.path, { waitUntil: 'domcontentloaded' });
      await page.addScriptTag({ path: AXE_PATH });
      const violations = await page.evaluate(async () => {
        const axe = (window as typeof window & {
          axe?: {
            run: (...args: unknown[]) => Promise<{
              violations: Array<{
                id: string;
                impact: string | null;
                nodes: Array<{ target?: string[] }>;
              }>;
            }>;
          };
        }).axe;
        if (!axe) throw new Error('axe-core did not load');
        const result = await axe.run('main', {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
        });
        return result.violations
          .filter((violation) => violation.impact === 'critical' || violation.impact === 'serious')
          .map((violation) => ({
            id: violation.id,
            impact: violation.impact,
            nodes: violation.nodes.map((node) => node.target || []),
          }));
      });
      expect(violations, `${route.path} accessibility violations`).toEqual([]);
    }
  });

  test('merchandise renders immediately and refreshes without blanking the catalog', async ({ page }) => {
    await page.goto('/hub/merch-store', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Official Merch' })).toBeVisible();
    await expect(page.getByText('Loading Merch Store...', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Buy .* With Card/ }).first()).toBeVisible();
  });

  test('live merchandise variants stay available and update both displayed prices', async ({ page }) => {
    await page.route('**/api/store/merch-catalog*', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          items: [{
            id: 'hoodie-neural',
            name: 'Neural Network Hoodie',
            description: 'Premium Hoodie With Neural Poker Design',
            category: 'apparel',
            price_usd: 59.99,
            price_diamonds: 5999,
            has_variants: true,
            in_stock: true,
            stock: 60,
            fulfillment_ready: true,
            fulfillment_provider: 'printful',
            variants: [
              { id: 'small', size: 'S', color: 'Black', price_usd: 59.99, price_diamonds: 5999, stock: 40, in_stock: true, fulfillment_ready: true },
              { id: '2xl', size: '2XL', color: 'Black', price_usd: 61.99, price_diamonds: 6199, stock: 20, in_stock: true, fulfillment_ready: true },
            ],
          }],
        },
      }),
    }));

    await page.goto('/hub/merch-store', { waitUntil: 'domcontentloaded' });
    const card = page.getByRole('article', { name: 'Diamond Altitude Hoodie' });
    await expect(card).toBeVisible({ timeout: 15000 });
    await expect(card.getByText('Sold Out', { exact: true })).toHaveCount(0);
    await card.getByRole('button', { name: 'Black / 2XL' }).click();
    await expect(card.getByText('$61.99', { exact: true })).toBeVisible();
    await expect(card.getByRole('button', { name: /With Card For \$61\.99/ })).toBeEnabled();
    const diamondButton = card.getByRole('button', { name: /With 6,199 Diamonds/ });
    await expect(diamondButton).not.toHaveAttribute('title', /Sold Out|Options Temporarily Unavailable/i);
    await card.getByRole('button', { name: 'Add Diamond Altitude Hoodie To Cart' }).click();
    await expect(page.getByRole('navigation', { name: 'Marketplace Commerce' }).getByRole('link', { name: /Cart/ })).toContainText('1');
    await card.getByRole('link', { name: 'View Diamond Altitude Hoodie Details' }).click();
    await expect(page).toHaveURL('/hub/merch-store/hoodie-neural');
    await expect(page.getByRole('heading', { level: 1, name: 'Diamond Altitude Hoodie' })).toBeVisible();
  });

  test('product detail owns one focused purchase console and shared cart flow', async ({ page }) => {
    // Exercise the account-owned persistence path explicitly. The shared
    // suite is authenticated in CI, while focused local runs may not have the
    // saved account origin; a deterministic owner keeps this regression test
    // from silently falling back to the simpler guest-cart path.
    await page.addInitScript(() => {
      window.localStorage.setItem('smarter-poker-auth', JSON.stringify({
        access_token: 'marketplace-cart-owner-test-token',
        user: {
          id: '00000000-0000-4000-8000-000000000021',
          email: 'marketplace-cart-owner@example.test',
          role: 'authenticated',
        },
      }));
    });
    let catalogRequestUrl = '';
    await page.route('**/api/store/merch-catalog*', async (route) => {
      catalogRequestUrl = route.request().url();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            items: [{
              id: 'hoodie-neural',
              name: 'Diamond Altitude Hoodie',
              description: 'Heavyweight Black Hoodie With The Diamond Altitude Circuit Graphic',
              category: 'apparel',
              price_usd: 59.99,
              price_diamonds: 5999,
              has_variants: true,
              in_stock: true,
              stock: 20,
              fulfillment_ready: true,
              fulfillment_provider: 'printful',
              variants: [
                { id: 'small', size: 'S', color: 'Black', price_usd: 59.99, price_diamonds: 5999, stock: 20, in_stock: true, fulfillment_ready: true },
              ],
            }],
          },
        }),
      });
    });

    await page.goto('/hub/merch-store/hoodie-neural', { waitUntil: 'domcontentloaded' });
    const purchaseConsole = page.locator('#purchase-console');
    await expect(purchaseConsole).toBeVisible();
    await expect(purchaseConsole.getByRole('article')).toHaveCount(1);
    await expect(page.getByRole('searchbox', { name: 'Search Marketplace Gear' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Open Purchase Console' })).toHaveAttribute('href', /#purchase-console$/);
    await expect(page.getByRole('link', { name: 'Open Purchase Console' })).not.toHaveAttribute('target');
    await expect(page.locator('meta[property="og:type"][content="product"]')).toHaveCount(1);
    await expect.poll(() => catalogRequestUrl).toContain('category=apparel');
    await purchaseConsole.getByRole('button', { name: 'Add Diamond Altitude Hoodie To Cart' }).click();
    const cartLink = page.getByRole('navigation', { name: 'Marketplace Commerce' }).getByRole('link', { name: /Cart/ });
    await expect(cartLink).toContainText('1');
    const persistedCart = await page.evaluate(() => JSON.parse(localStorage.getItem('smarter-poker-cart') || '{}'));
    expect(persistedCart.state.items).toHaveLength(1);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('navigation', { name: 'Marketplace Commerce' }).getByRole('link', { name: /Cart/ })).toContainText('1');
  });

  test('populated cart fits 320px and exposes accessible payment choices', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.addInitScript(() => {
      const user = {
        id: '00000000-0000-4000-8000-000000000022',
        email: 'phase22-cart@example.test',
        role: 'authenticated',
      };
      window.localStorage.setItem('smarter-poker-auth', JSON.stringify({
        access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMjIiLCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImF1ZCI6ImF1dGhlbnRpY2F0ZWQiLCJleHAiOjQxMDI0NDQ4MDB9.phase22signature',
        refresh_token: 'phase-22-cart-refresh',
        expires_at: 4102444800,
        expires_in: 2147483647,
        token_type: 'bearer',
        user,
      }));
      const explicitAuth = JSON.parse(window.localStorage.getItem('smarter-poker-auth') || '{}');
      const cachedUser = JSON.parse(window.localStorage.getItem('sp-cached-header-user') || '{}');
      const ownerId = explicitAuth?.user?.id || cachedUser?.id || 'guest';
      window.localStorage.setItem('smarter-poker-cart', JSON.stringify({
        state: {
          items: [{
            id: 'hoodie-neural',
            name: 'Diamond Altitude Hoodie With A Deliberately Long Product Name',
            price: 59.99,
            priceDiamonds: 5999,
            quantity: 1,
            type: 'merchandise',
            image: '/images/merch/neural-steel/mockups/diamond-altitude-hoodie.webp',
          }],
          ownerId,
        },
        version: 2,
      }));
    });

    await page.goto('/hub/diamond-store/cart', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1, name: 'Your Cart' })).toBeVisible({ timeout: 15000 });
    const paymentChoices = page.getByRole('radiogroup', { name: 'Payment Method' });
    await expect(paymentChoices.getByRole('radio')).toHaveCount(2);
    await expect(paymentChoices.getByRole('radio', { name: /Pay With Card/ })).toHaveAttribute('aria-checked', 'true');

    const widths = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
      main: document.querySelector('main')?.scrollWidth || 0,
    }));
    expect(widths.document).toBeLessThanOrEqual(widths.viewport);
    expect(widths.body).toBeLessThanOrEqual(widths.viewport);
    expect(widths.main).toBeLessThanOrEqual(widths.viewport);

    for (const control of await page.getByRole('button', { name: /Decrease|Increase|Remove/ }).all()) {
      const box = await control.boundingBox();
      expect(box?.height || 0).toBeGreaterThanOrEqual(44);
      expect(box?.width || 0).toBeGreaterThanOrEqual(44);
    }
  });

  test('private order receipt route owns noindex metadata before authentication', async ({ request }) => {
    const response = await request.get('/hub/diamond-store/orders/phase-11-proof?source=merchandise');
    expect(response.status()).toBeLessThan(400);
    const html = await response.text();
    expect(html).toContain('Private Marketplace Receipt');
    expect(html).toContain('name="robots" content="noindex,nofollow"');
    expect(html).toContain('/hub/diamond-store/orders');
  });

  test('merch discovery filters and sorts without leaving the marketplace', async ({ page }) => {
    await page.goto('/hub/merch-store', { waitUntil: 'domcontentloaded' });
    const search = page.getByRole('searchbox', { name: 'Search Marketplace Gear' });
    await search.fill('tumbler');
    await expect(page.getByRole('article', { name: 'Tournament Wire Insulated Tumbler' })).toBeVisible();
    await expect(page.locator('article[id^="merch-product-"]')).toHaveCount(1);
    await search.fill('');
    await page.getByRole('button', { name: 'Lifestyle Gear' }).click();
    await expect(page.getByText(/Showing \d+ Of \d+ Products/)).toBeVisible();
    await page.getByRole('combobox', { name: 'Sort Products' }).selectOption('price-high');
  });

  test('marketplace product inspection stays in-page and supports keyboard dismissal', async ({ page }) => {
    await page.goto('/hub/merch-store/hoodie-neural', { waitUntil: 'domcontentloaded' });
    const inspect = page.getByRole('button', { name: /Inspect Diamond Altitude Hoodie image full screen/i });
    await expect(inspect).toBeVisible();
    await inspect.click();
    const dialog = page.getByRole('dialog', { name: /Diamond Altitude Hoodie image inspection/i });
    await expect(dialog).toBeVisible();
    await expect(inspect).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
    await expect(dialog.getByRole('button', { name: 'Close image inspection' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(inspect).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
    await expect(inspect).toBeFocused();
    await expect(page).toHaveURL('/hub/merch-store/hoodie-neural');
  });

  /* REWRITTEN 2026-09-06. This demanded, as literals, BOTH
     `Buy VIP Lifetime With Card: $499.00 Once` and
     `Pay With Diamonds Instead: 49,900`, and the page renders neither for
     Lifetime. It has failed on chromium and mobile-chrome on every run since
     it landed.

     Both halves of one decision shipped the same day and this is the half that
     was left behind. #1376 introduced Lifetime with
     `cardCheckoutReady: false` - "the server-side card path is retained behind
     this capability flag while its cross-method refund/provenance state
     machine is completed. Diamond settlement is live and atomic." #1390 then
     wrote this test against the card-ready shape. So the flag hides the card
     button on purpose, and the diamond button is not the ALTERNATE one either:
     the store says so where it renders it, "Lifetime's primary action is
     already the Diamond purchase, so do not render the same action twice."
     Selecting Lifetime gives exactly one button,
     `Lifetime VIP Is Bought With Diamonds: 49,900`.

     So this pins the release contract instead of one side of a flag, and it
     stays true the day card checkout is switched on rather than going red for
     a change that was correct. Neither branch can pass on an empty page: one
     settlement presentation must be there, priced, whichever it is.

     Not imported from VIP_MEMBERSHIP on purpose - that module pulls in
     lucide-react, and a spec should not drag React into the runner to read two
     numbers. */
  test('VIP lifetime settles in Diamonds, and offers card checkout only once that path is ready', async ({
    page,
  }) => {
    await page.goto('/hub/vip-membership', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Select VIP Lifetime/ }).click();

    const withCard = page.getByRole('button', { name: 'Buy VIP Lifetime With Card: $499.00 Once' });
    const diamondsPrimary = page.getByRole('button', {
      name: 'Lifetime VIP Is Bought With Diamonds: 49,900',
    });
    const diamondsAlternate = page.getByRole('button', {
      name: /Pay With Diamonds Instead: 49,900/,
    });

    if ((await withCard.count()) > 0) {
      // cardCheckoutReady is on: card is the primary action and Diamonds is
      // the alternate, exactly as it is for Monthly and Yearly.
      await expect(withCard).toBeVisible();
      await expect(diamondsAlternate).toBeVisible();
      await expect(diamondsPrimary).toHaveCount(0);
    } else {
      // cardCheckoutReady is off: Diamonds IS the primary action, and the
      // alternate must not appear beside it - the same action twice is the
      // thing the store's own comment forbids.
      await expect(diamondsPrimary).toBeVisible();
      await expect(diamondsAlternate).toHaveCount(0);
    }

    await expect(page.getByRole('link', { name: 'Compare Every VIP Plan' })).toHaveAttribute('href', '/hub/vip-membership/compare');
  });

  test('reward details own a signed-in telemetry console without leaving the page', async ({ page }) => {
    await page.context().clearCookies();
    await page.addInitScript(() => window.localStorage.clear());
    await page.goto('/hub/smarter-rewards/daily_login', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1, name: 'Daily Login' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Verified Reward Telemetry' })).toBeVisible();
    const telemetry = page.locator('#reward-telemetry');
    await expect(telemetry.getByText('Connect Your Diamond Ledger')).toBeVisible({ timeout: 15000 });
    await expect(telemetry.getByRole('link', { name: 'Sign In To View My Telemetry' })).toHaveAttribute(
      'href',
      /\/auth\/login\?redirect=%2Fhub%2Fsmarter-rewards%2Fdaily_login$/
    );
    await expect(page).toHaveURL('/hub/smarter-rewards/daily_login');
  });

  test('reward telemetry renders verified caps, streak, and multiplier', async ({ page }) => {
    await page.addInitScript(() => {
      const user = { id: '00000000-0000-4000-8000-000000000012', email: 'phase12@example.test', role: 'authenticated' };
      window.localStorage.setItem('smarter-poker-auth', JSON.stringify({
        access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMTIiLCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImF1ZCI6ImF1dGhlbnRpY2F0ZWQiLCJleHAiOjQxMDI0NDQ4MDB9.phase12signature',
        refresh_token: 'phase-12-refresh',
        expires_at: 4102444800,
        expires_in: 2147483647,
        token_type: 'bearer',
        user,
      }));
    });
    await page.route('**/api/rewards/progress', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        earnedToday: 55,
        dailyCap: 110,
        dailyRemaining: 55,
        earnedThisMonth: 1650,
        monthlyCap: 3300,
        monthlyRemaining: 1650,
        loginStreak: 7,
        multiplier: 1.5,
        isVip: false,
        partial: false,
        timezone: 'America/Chicago',
      }),
    }));

    await page.goto('/hub/smarter-rewards/daily_login', { waitUntil: 'domcontentloaded' });
    const telemetry = page.locator('#reward-telemetry');
    await expect(telemetry.getByRole('progressbar', { name: /Daily Earning Circuit/ })).toHaveAttribute('aria-valuenow', '55');
    await expect(telemetry.getByRole('progressbar', { name: /Monthly Earning Circuit/ })).toHaveAttribute('aria-valuenow', '1650');
    await expect(telemetry.getByText('7 Days', { exact: true })).toBeVisible();
    await expect(telemetry.getByText('1.50×', { exact: true })).toBeVisible();
  });

  test('VIP command center is private and preserves a same-surface sign-in flow', async ({ page, request }) => {
    const apiResponse = await request.get('/api/store/vip-membership-status');
    expect(apiResponse.status()).toBe(401);

    await page.context().clearCookies();
    await page.addInitScript(() => window.localStorage.clear());
    await page.goto('/hub/vip-membership/manage', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,nofollow');
    await expect(page.getByRole('heading', { level: 1, name: 'VIP Command Center' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Connect Your Private Membership Record' })).toBeVisible({ timeout: 15000 });
    const signIn = page.getByRole('link', { name: 'Sign In To Manage VIP' });
    await expect(signIn).toHaveAttribute('href', /\/auth\/login\?redirect=%2Fhub%2Fvip-membership%2Fmanage$/);
    await expect(signIn).not.toHaveAttribute('target');
  });

  test('VIP command center submits verified plan and cancellation actions in place', async ({ page }) => {
    await page.addInitScript(() => {
      const user = { id: '00000000-0000-4000-8000-000000000012', email: 'phase12@example.test', role: 'authenticated' };
      window.localStorage.setItem('smarter-poker-auth', JSON.stringify({
        access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMTIiLCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImF1ZCI6ImF1dGhlbnRpY2F0ZWQiLCJleHAiOjQxMDI0NDQ4MDB9.phase12signature',
        refresh_token: 'phase-12-refresh',
        expires_at: 4102444800,
        expires_in: 2147483647,
        token_type: 'bearer',
        user,
      }));
    });
    await page.route('**/api/store/vip-membership-status', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        membership: {
          isVip: true,
          tier: 'monthly',
          source: 'card',
          recurring: true,
          canSwitch: true,
          canCancel: true,
          cancelAtPeriodEnd: false,
          currentPeriodEnd: '2030-01-01T00:00:00.000Z',
        },
      }),
    }));

    let requestedPlan = '';
    let cancellationReason = '';
    let planIdempotencyKey = '';
    let cancellationIdempotencyKey = '';
    await page.route('**/api/store/switch-vip-plan', async (route) => {
      requestedPlan = (await route.request().postDataJSON()).plan;
      planIdempotencyKey = route.request().headers()['x-idempotency-key'] || '';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Yearly plan verified.' }),
      });
    });
    await page.route('**/api/store/cancel-vip', async (route) => {
      cancellationReason = (await route.request().postDataJSON()).reason;
      cancellationIdempotencyKey = route.request().headers()['x-idempotency-key'] || '';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Cancellation scheduled at renewal.' }),
      });
    });

    await page.goto('/hub/vip-membership/manage', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Switch To Yearly' }).click();
    const planDialog = page.getByRole('dialog', { name: 'Confirm Plan Switch' });
    await expect(planDialog).toBeVisible();
    await planDialog.getByRole('button', { name: /Confirm Yearly Plan/i }).click();
    await expect(page.getByText('Yearly plan verified.')).toBeVisible();
    expect(requestedPlan).toBe('yearly');
    expect(planIdempotencyKey).toMatch(/^[A-Za-z0-9._:-]{8,128}$/);

    await page.getByRole('button', { name: 'Schedule End Of Membership' }).click();
    const dialog = page.getByRole('dialog', { name: 'Confirm End Of Membership' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Why are you leaving?').selectOption('missing_features');
    await dialog.getByRole('button', { name: 'Confirm End At Renewal' }).click();
    await expect(page.getByText('Cancellation scheduled at renewal.')).toBeVisible();
    expect(cancellationReason).toBe('missing_features');
    expect(cancellationIdempotencyKey).toMatch(/^[A-Za-z0-9._:-]{8,128}$/);
    expect(cancellationIdempotencyKey).not.toBe(planIdempotencyKey);
    await expect(page).toHaveURL('/hub/vip-membership/manage');
  });

  test('club item detail reviews one diamond settlement before submitting it', async ({ page }) => {
    const clubId = '00000000-0000-4000-8000-000000000013';
    const itemId = '00000000-0000-4000-8000-000000000014';
    await page.addInitScript(() => {
      const user = { id: '00000000-0000-4000-8000-000000000015', email: 'phase13@example.test', role: 'authenticated' };
      window.localStorage.setItem('smarter-poker-auth', JSON.stringify({
        access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMTUiLCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImF1ZCI6ImF1dGhlbnRpY2F0ZWQiLCJleHAiOjQxMDI0NDQ4MDB9.phase13signature',
        refresh_token: 'phase-13-refresh',
        expires_at: 4102444800,
        expires_in: 2147483647,
        token_type: 'bearer',
        user,
      }));
    });
    await page.route('**/api/club-arena/marketplace-items?*', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        clubId,
        balance: 5000,
        items: [{ id: itemId, name: 'Phase 13 Time Bank', description: 'Verified test item', price: 1500, category: 'Time Banks' }],
      }),
    }));
    let purchaseRequests = 0;
    await page.route('**/api/club-arena/marketplace-purchase', async (route) => {
      purchaseRequests += 1;
      await new Promise((resolve) => setTimeout(resolve, 75));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, newBalance: 3500, pricePaid: 1500 }),
      });
    });

    await page.goto(`/hub/club-shop/${itemId}?clubId=${clubId}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1, name: 'Phase 13 Time Bank' })).toBeVisible();
    await page.getByRole('button', { name: 'Review Diamond Purchase' }).click();
    const reviewTitle = page.getByRole('heading', { name: 'Confirm Diamond Purchase' });
    await expect(reviewTitle).toBeFocused();
    const confirm = page.getByRole('button', { name: 'Confirm 1,500 Diamonds' });
    await confirm.evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
    await expect(
      page.getByRole('status').getByText('Phase 13 Time Bank is now in your club inventory.'),
    ).toBeVisible();
    expect(purchaseRequests).toBe(1);
  });

  test('marketplace readiness is public, boolean-only, and capability-aware', async ({ request }) => {
    test.setTimeout(60_000);
    const response = await request.get('/api/store/readiness', { timeout: 45_000 });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toMatchObject({
      success: true,
      checks: { stripe: expect.any(Boolean), supabase: expect.any(Boolean), printful: expect.any(Boolean) },
      capabilities: {
        cardCheckout: expect.any(Boolean),
        diamondCheckout: expect.any(Boolean),
        automaticMerchFulfillment: expect.any(Boolean),
      },
    });
    expect(JSON.stringify(body)).not.toContain('sk_');
    expect(JSON.stringify(body)).not.toContain('service_role');
  });

  test('diamond starter and cinematic packs are all purchasable without covering the art', async ({ page }) => {
    await page.goto('/hub/diamond-store', { waitUntil: 'domcontentloaded' });
    await expect(page.getByLabel('Starter Diamond Packs').locator('article')).toHaveCount(2);
    await expect(page.locator('main article')).toHaveCount(8);
    const centered = await page.locator('main article').nth(2).locator('h3').evaluate((element) => {
      const style = getComputedStyle(element.parentElement as Element);
      return { align: style.textAlign, position: style.position };
    });
    expect(centered).toEqual({ align: 'center', position: 'relative' });
  });

  test('canceled checkout return is explained and the transport query is removed', async ({ page }) => {
    await page.goto('/hub/diamond-store?canceled=true', { waitUntil: 'domcontentloaded' });
    const status = page.locator('[data-checkout-status="canceled"]');
    await expect(status).toBeVisible();
    await expect(status).toBeFocused();
    await expect(status).toContainText('No Payment Was Made');
    await expect(page).toHaveURL(/\/hub\/diamond-store$/);
    const mainSections = await page.locator('main > section').evaluateAll((sections) =>
      sections.map((section) => section.getAttribute('data-checkout-status') || section.className)
    );
    expect(mainSections[0]).toBe('canceled');
  });

  test('verified card return retries and removes only owner-matched paid cart lines', async ({ page }) => {
    const userId = '00000000-0000-4000-8000-000000000023';
    const orderId = '00000000-0000-4000-8000-000000000024';
    const sessionId = 'cs_test_phase23purchaseassurance';
    await page.addInitScript(({ ownerId }) => {
      const user = { id: ownerId, email: 'phase23@example.test', role: 'authenticated' };
      window.localStorage.setItem('smarter-poker-auth', JSON.stringify({
        access_token: 'eyJhbGciOiJub25lIn0.eyJleHAiOjQxMDI0NDQ4MDB9.phase23',
        refresh_token: 'phase-23-refresh-token',
        expires_at: 4102444800,
        expires_in: 2147483647,
        token_type: 'bearer',
        user,
      }));
      window.localStorage.setItem('smarter-poker-cart', JSON.stringify({
        state: {
          ownerId,
          syncPending: false,
          items: [
            {
              id: 'hoodie-neural::small',
              catalogId: 'hoodie-neural',
              variantId: 'small',
              name: 'Diamond Altitude Hoodie',
              type: 'Merchandise: Small',
              price: 59.99,
              quantity: 2,
            },
            {
              id: 'range-grid-desk-mat::standard',
              catalogId: 'range-grid-desk-mat',
              name: 'Range Grid Desk Mat',
              type: 'Merchandise',
              price: 39.99,
              quantity: 1,
            },
          ],
        },
        version: 3,
      }));
    }, { ownerId: userId });

    let statusRequests = 0;
    await page.route('**/api/store/checkout-status?*', (route) => {
      statusRequests += 1;
      if (statusRequests === 1) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, error: 'Verification Temporarily Unavailable' }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            status: 'complete',
            sessionId,
            type: 'merchandise',
            paymentStatus: 'paid',
            amountTotal: 5999,
            currency: 'usd',
            requestId: 'phase23-card-request-0001',
            orderId,
            orderSource: 'merchandise',
            cartItems: [{
              kind: 'merchandise',
              id: 'hoodie-neural',
              variantId: 'small',
              quantity: 1,
            }],
          },
        }),
      });
    });

    await page.goto(`/hub/merch-store?success=true&session_id=${sessionId}`, {
      waitUntil: 'domcontentloaded',
    });
    const failed = page.locator('[data-checkout-status="failed"]');
    await expect(failed).toBeVisible();
    await failed.getByRole('button', { name: 'Verify Again' }).click();

    const complete = page.locator('[data-checkout-status="complete"]');
    await expect(complete).toBeVisible();
    await expect(complete.getByRole('link', { name: 'View Verified Receipt' })).toHaveAttribute(
      'href',
      `/hub/diamond-store/orders/${orderId}?source=merchandise`
    );
    await expect(page).toHaveURL(/\/hub\/merch-store$/);
    await expect.poll(() => page.evaluate(() => {
      const persisted = JSON.parse(window.localStorage.getItem('smarter-poker-cart') || '{}');
      return persisted?.state;
    })).toMatchObject({
      ownerId: userId,
      syncPending: true,
      items: [
        expect.objectContaining({ id: 'hoodie-neural::small', quantity: 1 }),
        expect.objectContaining({ id: 'range-grid-desk-mat::standard', quantity: 1 }),
      ],
    });
    expect(statusRequests).toBe(2);
  });

  test('mobile purchase rails expose labels, focus, and keyboard scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/hub/diamond-store', { waitUntil: 'domcontentloaded' });

    const packageRail = page.getByRole('region', { name: 'Diamond Packages' });
    await expect(packageRail).toHaveAttribute('tabindex', '0');
    await expect(packageRail).toHaveAttribute('aria-describedby', 'diamond-package-scroll-hint');
    await packageRail.focus();
    await packageRail.press('ArrowRight');
    await expect.poll(() => packageRail.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);

    await page.goto('/hub/vip-membership', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('region', { name: 'VIP Membership Plans' })).toHaveAttribute('tabindex', '0');
    await expect(page.getByRole('heading', { level: 2, name: 'Everything Included With VIP' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Frequently Asked Questions' })).toBeVisible();
  });

  test('store controls meet the 44-pixel target and legal text remains readable', async ({ page }) => {
    for (const route of ROUTES) {
      await page.goto(route.path, { waitUntil: 'domcontentloaded' });
      // VIP cards derive their height from lazy images. Measure controls only
      // after those images settle, otherwise the absolute overlay is briefly
      // the only visible part of the button and produces a false 6px result.
      await page.waitForFunction(() =>
        Array.from(document.querySelectorAll<HTMLImageElement>('main img')).every((image) =>
          image.loading === 'lazy' || image.complete
        )
      );
      // Let the metal-card entrance animation settle before measuring the
      // rendered hit box. Measuring mid-transform can report 43.x for a
      // correctly declared 44px control and produce a false regression.
      await page.waitForTimeout(900);
      const undersized = await page.locator('main button, main nav a').evaluateAll((elements) =>
        elements.map((element) => {
          const rect = element.getBoundingClientRect();
          return { text: (element.textContent || '').trim(), width: rect.width, height: rect.height };
        }).filter((item) => item.width > 0 && item.height > 0 && (item.width < 44 || item.height < 44))
      );
      expect(undersized).toEqual([]);
    }

    await page.goto('/hub/diamond-store', { waitUntil: 'domcontentloaded' });
    const legal = page.locator('main').getByText(/Diamonds Are Virtual Currency/).last();
    const legalStyle = await legal.evaluate((element) => {
      const style = getComputedStyle(element);
      return { size: Number.parseFloat(style.fontSize), color: style.color };
    });
    expect(legalStyle.size).toBeGreaterThanOrEqual(12);
    expect(legalStyle.color).not.toBe('rgba(255, 255, 255, 0.4)');
  });

  test('wide merchandise purchase controls retain the 44-pixel target', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/hub/merch-store', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll<HTMLImageElement>('main img')).every((image) =>
        image.loading === 'lazy' || image.complete
      )
    );
    await page.waitForTimeout(900);

    const purchaseControls = page.locator('main button').filter({
      hasText: /Buy With Card|Pay With Diamonds/,
    });
    await expect(purchaseControls.first()).toBeVisible();
    const undersized = await purchaseControls.evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return { text: (element.textContent || '').trim(), width: rect.width, height: rect.height };
      }).filter((item) => item.width > 0 && item.height > 0 && (item.width < 44 || item.height < 44))
    );
    expect(undersized).toEqual([]);
  });

  test('wide authenticated Club Shop controls retain the 44-pixel target', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/hub/club-shop', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);

    const clubShopViews = page.getByRole('group', { name: 'Club Shop Views' });
    // The production-authenticated fixture exposes this surface. If an
    // environment has no club, the static contract above still guards it.
    if (await clubShopViews.count()) {
      const clubShop = clubShopViews.locator('..');
      const undersized = await clubShop.locator('button, [role="button"]').evaluateAll((elements) =>
        elements.map((element) => {
          const rect = element.getBoundingClientRect();
          return { text: (element.textContent || '').trim(), width: rect.width, height: rect.height };
        }).filter((item) => item.width > 0 && item.height > 0 && (item.width < 44 || item.height < 44))
      );
      expect(undersized).toEqual([]);
    }
  });

  test('Club Shop operators delete through one guarded in-page dialog', async ({ page }) => {
    const userId = '00000000-0000-4000-8000-000000000020';
    const clubId = '00000000-0000-4000-8000-000000000021';
    const itemId = '00000000-0000-4000-8000-000000000022';
    await page.addInitScript(({ id }) => {
      const user = { id, email: 'phase20@example.test', role: 'authenticated' };
      window.localStorage.setItem('smarter-poker-auth', JSON.stringify({
        access_token: 'eyJhbGciOiJub25lIn0.eyJleHAiOjQxMDI0NDQ4MDB9.signature',
        refresh_token: 'phase-20-refresh-token',
        expires_at: 4102444800,
        expires_in: 2147483647,
        token_type: 'bearer',
        user,
      }));
    }, { id: userId });

    await page.route('**/rest/v1/profiles?*', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        is_vip: false,
        vip_tier: null,
        vip_expires_at: null,
        diamonds: 5000,
        diamond_multiplier: 1,
      }),
    }));
    await page.route('**/api/club-arena/marketplace-items*', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        clubId,
        role: 'owner',
        balance: 5000,
        items: [{
          id: itemId,
          name: 'Phase 20 Time Bank',
          description: 'Operator dialog test item',
          price: 500,
          category: 'Time Banks',
        }],
        purchases: [],
      }),
    }));
    let reportRequests = 0;
    await page.route('**/api/club-arena/manage-shop?*', (route) => {
      reportRequests += 1;
      if (reportRequests === 1) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, error: 'Verified ledger temporarily unavailable' }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
        success: true,
        items: [{
          id: itemId,
          club_id: clubId,
          name: 'Phase 20 Time Bank',
          description: 'Operator dialog test item',
          price: 500,
          image_url: null,
          category: 'Time Banks',
          is_active: true,
          purchase_count: 0,
          refunded_purchase_count: 0,
          net_purchase_count: 0,
          gross_revenue: 0,
          refunded_revenue: 0,
          revenue: 0,
          revenue_by_currency: {},
        }],
        report: {
          primaryCurrency: 'diamonds',
          complete: true,
          processedRows: 0,
          totalRows: 0,
          totalRowsExact: true,
          byCurrency: {},
          diamondTotals: {
            sales: 0,
            refundedSales: 0,
            netSales: 0,
            gross: 0,
            refunded: 0,
            net: 0,
          },
          legacyChipTotals: {
            sales: 0,
            refundedSales: 0,
            netSales: 0,
            gross: 0,
            refunded: 0,
            net: 0,
          },
        },
        }),
      });
    });

    let deleteRequests = 0;
    await page.route('**/api/club-arena/shop-items', async (route) => {
      const payload = route.request().postDataJSON();
      if (payload.action === 'delete') deleteRequests += 1;
      await new Promise((resolve) => setTimeout(resolve, 75));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    await page.goto('/hub/club-shop', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Manage' }).click();
    const reportAlert = page.getByRole('alert').filter({
      hasText: 'Verified Ledger Temporarily Unavailable',
    });
    await expect(reportAlert).toContainText('Verified Ledger Temporarily Unavailable');
    await expect(page.getByText('Net Diamond Sales')).toHaveCount(0);
    await expect(page.getByText('No shop items yet. Create one above.')).toHaveCount(0);
    await reportAlert.getByRole('button', { name: 'Retry Report' }).click();
    await expect(page.getByText('Net Diamond Sales')).toBeVisible();
    expect(reportRequests).toBe(2);
    const deleteButton = page.getByRole('button', { name: 'Delete' });
    await expect(deleteButton).toBeVisible();
    await deleteButton.click();

    let dialog = page.getByRole('dialog', { name: 'Remove Club Shop Item?' });
    await expect(dialog).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(deleteButton).toBeFocused();

    await deleteButton.click();
    dialog = page.getByRole('dialog', { name: 'Remove Club Shop Item?' });
    const removeButton = dialog.getByRole('button', { name: 'Remove Item' });
    await removeButton.evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
    await expect(dialog).toBeHidden();
    expect(deleteRequests).toBe(1);
  });
});
