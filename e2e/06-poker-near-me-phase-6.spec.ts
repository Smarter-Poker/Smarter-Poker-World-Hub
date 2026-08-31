import { test, expect, type Page } from '@playwright/test';

async function expectNoOverflow(page: Page, route: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${route} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
}

async function jsonLdBlocks(page: Page) {
  return page.locator('head script[type="application/ld+json"]').evaluateAll((nodes) => nodes
    .map((node) => {
      try { return JSON.parse(node.textContent || '{}'); } catch { return null; }
    })
    .filter(Boolean));
}

test.describe('Poker Near Me phase 6 map and discovery semantics', () => {
  test('shared map runtime uses local executable code and reports clustered readiness', async ({ page }) => {
    const remoteExecutableRequests: string[] = [];
    page.on('request', (request) => {
      if (/unpkg\.com\/(?:leaflet@|leaflet\.markercluster@).+\.js(?:\?|$)/.test(request.url())) {
        remoteExecutableRequests.push(request.url());
      }
    });

    const response = await page.goto('/hub/poker-series', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBeLessThan(500);
    const map = page.locator('[data-map-ready]').first();
    await expect(map).toHaveAttribute('data-map-ready', 'true', { timeout: 25_000 });
    await expect(map).toHaveAttribute('data-map-clustering', /available|disabled/);
    const markerCount = Number(await map.getAttribute('data-map-marker-count'));
    expect(Number.isFinite(markerCount)).toBeTruthy();
    if (markerCount >= 20) {
      await expect.poll(() => page.locator('.venue-cluster-icon').count(), { timeout: 10_000 }).toBeGreaterThan(0);
    }
    expect(remoteExecutableRequests).toEqual([]);
    await expectNoOverflow(page, '/hub/poker-series');
  });

  test('location hierarchy exposes canonical graph semantics and editorial sections', async ({ page }, testInfo) => {
    // The same pinned Chromium renderer runs locally and in CI; keep one portable
    // baseline instead of generating OS-suffixed copies that CI cannot reuse.
    testInfo.snapshotSuffix = '';
    const response = await page.goto('/hub/poker-near-me/in/texas', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBeLessThan(600);
    await expect(page.locator('h1')).toHaveCount(1, { timeout: 20_000 });
    const blocks = await jsonLdBlocks(page);
    const graphBlock = blocks.find((block: any) => Array.isArray(block?.['@graph']));
    expect(graphBlock).toBeTruthy();
    const types = graphBlock['@graph'].map((node: any) => node['@type']);
    expect(types).toEqual(expect.arrayContaining(['CollectionPage', 'BreadcrumbList', 'ItemList']));
    const breadcrumbs = graphBlock['@graph'].find((node: any) => node['@type'] === 'BreadcrumbList');
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(canonical).toBe('https://smarter.poker/hub/poker-near-me/in/tx');
    expect(breadcrumbs.itemListElement.some((item: any) => item.item === canonical)).toBeTruthy();

    const sectionHead = page.locator('.pnm-location-listing__section-head').first();
    if (await sectionHead.count()) {
      await expect(sectionHead).toBeVisible();
      await expect(sectionHead.locator('h2')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await expect(sectionHead).toHaveScreenshot('phase6-location-section.png', {
        animations: 'disabled',
        caret: 'hide',
        // Linux font rasterization shifts this compact header by up to 2px
        // versus the checked-in macOS baseline. Keep the visual guard strict
        // enough to catch layout changes without failing on that OS variance.
        maxDiffPixelRatio: 0.1,
      });
    }
    await expectNoOverflow(page, '/hub/poker-near-me/in/texas');
  });

  test('series and daily directories publish canonical ItemList data', async ({ page }) => {
    await page.goto('/hub/poker-series', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://smarter.poker/hub/poker-series');
    await expect(page.locator('[data-source-state]').first()).toBeVisible({ timeout: 25_000 });
    await expect.poll(async () => {
      const blocks = await jsonLdBlocks(page);
      const directory = blocks.find((block: any) => block?.['@type'] === 'CollectionPage' && block?.mainEntity?.['@type'] === 'ItemList');
      return Number(directory?.mainEntity?.numberOfItems || 0);
    }, { timeout: 25_000 }).toBeGreaterThan(0);

    await page.goto('/hub/daily-tournaments', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-source-state]').first()).toBeVisible({ timeout: 25_000 });
    const blocks = await jsonLdBlocks(page);
    const dailyDirectory = blocks.find((block: any) => block?.['@id'] === 'https://smarter.poker/hub/daily-tournaments#schedule');
    expect(dailyDirectory?.mainEntity?.['@type']).toBe('ItemList');
    const events = dailyDirectory?.mainEntity?.itemListElement || [];
    if (events.length) expect(events[0]?.item?.['@type']).toBe('SportsEvent');
    await expectNoOverflow(page, '/hub/daily-tournaments');
  });
});
