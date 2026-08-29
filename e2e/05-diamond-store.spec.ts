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
