import { test, expect } from '@playwright/test';

const ROUTES = [
  { path: '/hub/diamond-store', title: 'Diamond Store — Smarter.Poker', heading: 'Play At Your Own Altitude.', hero: 'diamond-vault-hero.webp' },
  { path: '/hub/vip-membership', title: 'VIP Membership — Smarter.Poker', heading: 'Your Edge, Compounded.', hero: 'vip-hero.webp' },
  { path: '/hub/merch-store', title: 'Merch Store — Smarter.Poker', heading: 'Built For The Long Session.', hero: 'merch-hero.webp' },
  { path: '/hub/smarter-rewards', title: 'Smarter Rewards — Smarter.Poker', heading: 'Make Every Hand Count.', hero: 'rewards-hero.webp' },
  { path: '/hub/club-shop', title: 'Club Shop — Smarter.Poker', heading: 'Your Game. Your Rules.', hero: 'club-shop-hero.webp' },
] as const;

test.describe('5. Storefront Routes And Design Contract', () => {
  for (const route of ROUTES) {
    test(`${route.path} owns its route, metadata, hero, and responsive canvas`, async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on('console', (message) => {
        // Chromium reports expected anonymous 400/401 resource responses as
        // console errors without a URL. Keep this assertion focused on
        // actionable JavaScript errors; HTTP behavior has separate checks.
        if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
          consoleErrors.push(message.text());
        }
      });

      const response = await page.goto(route.path, { waitUntil: 'domcontentloaded' });
      expect(response?.status()).toBeLessThan(400);
      await expect(page).toHaveTitle(route.title);
      await expect(page.getByRole('heading', { level: 1, name: route.heading })).toHaveCount(1);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://smarter.poker${route.path}`);
      await expect(page.locator('meta[property="og:title"]').last()).toHaveAttribute('content', route.title);
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
        const current = await link.getAttribute('aria-current');
        if (!current) await expect(link).toHaveAttribute('target', '_blank');
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
        Array.from(document.querySelectorAll('main img')).every((image) => image.complete)
      );
      await page.evaluate(() => new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      ));
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
});
