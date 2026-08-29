import { test, expect } from '@playwright/test';

const ROUTES = [
  { path: '/hub/diamond-store', title: 'Diamond Store — Smarter.Poker', heading: 'Play At Your Own Altitude.', hero: 'diamond-vault-hero.webp' },
  { path: '/hub/vip-membership', title: 'VIP Membership — Smarter.Poker', heading: 'Your Edge, Compounded.', hero: 'vip-hero.webp' },
  { path: '/hub/merch-store', title: 'Merch Store — Smarter.Poker', heading: 'Built For The Long Session.', hero: 'merch-hero.webp' },
  { path: '/hub/smarter-rewards', title: 'Smarter Rewards — Smarter.Poker', heading: 'Make Every Hand Count.', hero: 'rewards-hero.webp' },
  { path: '/hub/club-shop', title: 'Club Shop — Smarter.Poker', heading: 'Your Game. Your Rules.', hero: 'club-shop-hero.webp' },
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

  test('global header markup is identical across all five storefront routes', async ({ page }) => {
    const headerMarkup: string[] = [];
    for (const route of ROUTES) {
      await page.goto(route.path, { waitUntil: 'domcontentloaded' });
      const header = page.locator('header').first();
      await expect(header).toBeVisible();
      headerMarkup.push(await header.evaluate((element) => {
        const clone = element.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('[style]').forEach((node) => node.removeAttribute('style'));
        return clone.outerHTML.replace(/\s+/g, ' ').trim();
      }));
    }
    expect(new Set(headerMarkup).size).toBe(1);
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
    await page.route('**/api/store/merch-catalog*', (route) => route.fulfill({
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
    }));

    await page.goto('/hub/merch-store/hoodie-neural', { waitUntil: 'domcontentloaded' });
    const purchaseConsole = page.locator('#purchase-console');
    await expect(purchaseConsole).toBeVisible();
    await expect(purchaseConsole.getByRole('article')).toHaveCount(1);
    await expect(page.getByRole('searchbox', { name: 'Search Marketplace Gear' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Open Purchase Console' })).toHaveAttribute('href', /#purchase-console$/);
    await expect(page.getByRole('link', { name: 'Open Purchase Console' })).not.toHaveAttribute('target');
    await purchaseConsole.getByRole('button', { name: 'Add Diamond Altitude Hoodie To Cart' }).click();
    await expect(page.getByRole('navigation', { name: 'Marketplace Commerce' }).getByRole('link', { name: /Cart/ })).toContainText('1');
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

  test('VIP daily access exposes verified card and diamond settlement controls', async ({ page }) => {
    await page.goto('/hub/vip-membership', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Select VIP Daily Pass/ }).click();
    await expect(page.getByRole('button', { name: /Activate Daily VIP With Diamonds/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pay For Daily VIP With Card' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Compare Every VIP Plan' })).toHaveAttribute('href', '/hub/vip-membership/compare');
  });

  test('reward details own a signed-in telemetry console without leaving the page', async ({ page }) => {
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
    await page.route('**/api/store/switch-vip-plan', async (route) => {
      requestedPlan = (await route.request().postDataJSON()).plan;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Annual plan verified.' }),
      });
    });
    await page.route('**/api/store/cancel-vip', async (route) => {
      cancellationReason = (await route.request().postDataJSON()).reason;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Cancellation scheduled at renewal.' }),
      });
    });

    await page.goto('/hub/vip-membership/manage', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Switch To Annual' }).click();
    await expect(page.getByText('Annual plan verified.')).toBeVisible();
    expect(requestedPlan).toBe('annual');

    await page.getByRole('button', { name: 'Schedule End Of Membership' }).click();
    const dialog = page.getByRole('dialog', { name: 'Confirm End Of Membership' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Why are you leaving?').selectOption('missing_features');
    await dialog.getByRole('button', { name: 'Confirm End At Renewal' }).click();
    await expect(page.getByText('Cancellation scheduled at renewal.')).toBeVisible();
    expect(cancellationReason).toBe('missing_features');
    await expect(page).toHaveURL('/hub/vip-membership/manage');
  });

  test('marketplace readiness is public, boolean-only, and capability-aware', async ({ request }) => {
    const response = await request.get('/api/store/readiness');
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
});
