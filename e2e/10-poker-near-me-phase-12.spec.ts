import { test, expect, type Page, type Route } from '@playwright/test';

const AXE_PATH = require.resolve('axe-core/axe.min.js');

const venue = (id: number, name: string) => ({
  id,
  name,
  venue_type: 'casino',
  city: 'Las Vegas',
  state: 'NV',
  latitude: 36.16 + (id / 100_000),
  longitude: -115.14,
  is_active: true,
  location_quality: { status: 'verified', mappable: true, reason: 'state_coordinate_match' },
});

async function fulfillDirectory(route: Route, data: ReturnType<typeof venue>[], total: number, offset: number) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'X-PNM-Data-Revision': 'supabase:e2e' },
    body: JSON.stringify({
      success: true,
      degraded: false,
      data_source: 'supabase',
      data_revision: 'supabase:e2e',
      data_integrity: { input: data.length, mappable: data.length, verified: data.length, approximate: 0, conflict: 0, missing: 0, unavailable: 0, held: 0 },
      data,
      total,
      offset,
      limit: 160,
      home_groups: [],
      total_home_groups: 0,
    }),
  });
}

async function expectNoOverflow(page: Page, route: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${route} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
}

test.describe('Poker Near Me phase 12 parity, performance, and regional surfaces', () => {
  test.setTimeout(120_000);

  test('progressive directory hydration merges pages before declaring the live registry complete', async ({ page }) => {
    const offsets: number[] = [];
    await page.route('**/api/poker/venues?view=directory&limit=160&offset=*', async (route) => {
      const offset = Number(new URL(route.request().url()).searchParams.get('offset') || 0);
      offsets.push(offset);
      if (offset === 0) return fulfillDirectory(route, [venue(90101, 'Phase Twelve North')], 161, offset);
      return fulfillDirectory(route, [venue(90102, 'Phase Twelve South')], 161, offset);
    });

    const route = '/hub/poker-near-me/venues';
    const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);
    await expect.poll(() => offsets.includes(0) && offsets.includes(160), { timeout: 20_000 }).toBe(true);
    expect(offsets.indexOf(0)).toBeLessThan(offsets.indexOf(160));
    await expect(page.locator('.pnm-directory-source')).toHaveCount(0);
    // The panel and its card renderer are separate production chunks. Under the
    // full desktop/mobile matrix they can arrive after the directory requests,
    // so wait on the user-visible result instead of inheriting Playwright's 5s
    // locator default.
    await expect(page.getByText('Phase Twelve North', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Phase Twelve South', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expectNoOverflow(page, route);
  });

  test('an interrupted later page preserves partial live results and exposes recovery', async ({ page }) => {
    const mapRuntimeErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' && /leaflet runtime/i.test(message.text())) {
        mapRuntimeErrors.push(message.text());
      }
    });
    await page.route('**/api/poker/venues?view=directory&limit=160&offset=*', async (route) => {
      const offset = Number(new URL(route.request().url()).searchParams.get('offset') || 0);
      if (offset === 0) return fulfillDirectory(route, [venue(90201, 'Partial Live Room')], 161, offset);
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'temporary outage' }) });
    });

    const route = '/hub/poker-near-me/map';
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    const status = page.locator('.pnm-directory-source');
    await expect(status).toHaveAttribute('data-directory-source', 'partial_live', { timeout: 20_000 });
    await expect(status).toContainText('Existing Results Remain Available');
    await expect(page.getByRole('button', { name: 'Retry live registry' })).toBeVisible();
    const map = page.locator('[data-map-ready]').first();
    await expect(map).toHaveAttribute('data-map-ready', 'true', { timeout: 30_000 });
    await expect(page.locator('.leaflet-container')).toBeVisible();
    expect(mapRuntimeErrors).toEqual([]);
    await expectNoOverflow(page, route);
  });

  test('regional location page uses purpose-built art, accurate freshness, and clean WCAG landmarks', async ({ page }) => {
    const route = '/hub/poker-near-me/in/nv';
    const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);
    await expect(page.locator('.pnm-deep-deck__visual img')).toHaveAttribute('src', /location-southwest-command-v1\.webp/);
    const socialImage = page.locator('meta[property="og:image"]');
    await expect(socialImage).toHaveCount(1);
    await expect(socialImage).toHaveAttribute('content', /location-southwest-command-v1\.webp/);
    await expect(page.getByRole('main')).toBeVisible();
    await page.addScriptTag({ path: AXE_PATH });
    const serious = await page.evaluate(async () => {
      const axe = (window as typeof window & { axe?: { run: (...args: unknown[]) => Promise<{ violations: Array<{ id: string; impact: string | null; nodes: Array<{ target?: string[] }> }> }> } }).axe;
      if (!axe) throw new Error('axe-core did not load');
      const result = await axe.run('main', { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } });
      return result.violations
        .filter((item) => item.impact === 'critical' || item.impact === 'serious')
        .map((item) => ({ id: item.id, targets: item.nodes.map((node) => node.target || []) }));
    });
    expect(serious).toEqual([]);
    await expectNoOverflow(page, route);
  });

  test('representative 390x844 and 200% layouts retain touch targets without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const route of ['/hub/poker-near-me/lobby', '/hub/poker-near-me/in/ca']) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
      await expectNoOverflow(page, `${route} at 200%`);
      await page.evaluate(() => { document.documentElement.style.zoom = '1'; });
      const controls = page.locator('main a:visible, main button:visible');
      const count = Math.min(await controls.count(), 10);
      for (let index = 0; index < count; index += 1) {
        const box = await controls.nth(index).boundingBox();
        if (box) {
          expect(box.width, `${route} control ${index} width`).toBeGreaterThanOrEqual(44);
          expect(box.height, `${route} control ${index} height`).toBeGreaterThanOrEqual(44);
        }
      }
      await expectNoOverflow(page, route);
    }
  });
});
