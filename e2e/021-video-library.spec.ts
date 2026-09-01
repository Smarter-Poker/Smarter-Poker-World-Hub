import { expect, test, type Page, type Route } from '@playwright/test';
const AXE_PATH = require.resolve('axe-core/axe.min.js');

const VIDEO_A = {
  id: 'dQw4w9WgXcQ',
  videoId: 'dQw4w9WgXcQ',
  source: 'HCL',
  sourceName: 'Hustler Casino Live',
  type: 'cash',
  title: 'River Decision Command Test',
  views: '120K',
  duration: '18:42',
  thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
  publishedAt: '2026-08-26T12:00:00.000Z',
  scrapedAt: '2026-08-26T12:00:00.000Z',
  tags: ['river'],
};

const VIDEO_B = {
  ...VIDEO_A,
  id: 'M7lc1UVf-VE',
  videoId: 'M7lc1UVf-VE',
  source: 'TRITON',
  sourceName: 'Triton Poker',
  type: 'tournament',
  title: 'Final Table Pressure Test',
  tags: ['tournament'],
};

const BLOCKED_VIDEO = {
  ...VIDEO_B,
  id: '524_3UypGkU',
  videoId: '524_3UypGkU',
  title: 'Legacy Non-Embeddable Video',
};

function watchForCrashes(page: Page): string[] {
  const crashes: string[] = [];
  page.on('pageerror', error => crashes.push(String(error?.message || error)));
  return crashes;
}

async function mockCatalog(route: Route): Promise<void> {
  const url = new URL(route.request().url());
  const source = url.searchParams.get('source');
  const type = url.searchParams.get('type');
  const query = (url.searchParams.get('q') || '').toLowerCase();
  const offset = Number(url.searchParams.get('offset') || 0);
  let videos = [VIDEO_A, VIDEO_B];
  if (source) videos = videos.filter(video => video.source === source);
  if (type) videos = videos.filter(video => video.type === type);
  if (query) videos = videos.filter(video => `${video.title} ${video.tags.join(' ')}`.toLowerCase().includes(query));
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      success: true,
      data: offset === 0 ? videos : [],
      pagination: { limit: 30, offset, total: videos.length, hasMore: false },
    }),
  });
}

test.describe('21. Video Library command system', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try { window.localStorage.removeItem('sp-filters-video-library'); } catch { /* storage unavailable */ }
    });
    await page.route('**/api/video-library/catalog**', mockCatalog);
  });

  test('loads the server catalog and keeps filter, search, and sort in the URL', async ({ page }) => {
    const crashes = watchForCrashes(page);
    await page.goto('/hub/video-library', { waitUntil: 'commit' });

    await expect(page.locator('.vl-card-title', { hasText: VIDEO_A.title })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.vl-card-title', { hasText: VIDEO_B.title })).toBeVisible();
    await expect(page.locator('.vl-video-card.is-featured')).toHaveCount(1);

    await page.getByRole('button', { name: 'Cash Games' }).click();
    await expect(page).toHaveURL(/type=cash/);
    await expect(page.locator('.vl-card-title', { hasText: VIDEO_A.title })).toBeVisible();
    await expect(page.locator('.vl-card-title', { hasText: VIDEO_B.title })).toHaveCount(0);
    await expect(page.locator('.vl-video-card.is-featured')).toHaveCount(0);

    const search = page.getByRole('textbox', { name: 'Search the poker video library' });
    await search.fill('river');
    await expect(page).toHaveURL(/q=river/, { timeout: 5_000 });
    await expect(page.locator('.vl-card-title', { hasText: VIDEO_A.title })).toBeVisible();

    await page.getByRole('button', { name: 'Sort videos by Top Rated' }).click();
    await expect(page).toHaveURL(/sort=top_rated/);
    expect(crashes).toEqual([]);
  });

  test('renders a recoverable catalog failure without a runtime crash', async ({ page }) => {
    await page.unroute('**/api/video-library/catalog**');
    await page.route('**/api/video-library/catalog**', route => route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ success: false, error: 'offline' }),
    }));
    const crashes = watchForCrashes(page);
    await page.goto('/hub/video-library', { waitUntil: 'commit' });

    await expect(page.getByRole('button', { name: 'Retry Catalog' })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.vl-video-card').first()).toBeVisible();
    expect(crashes).toEqual([]);
  });

  test('rejects a blocked video from a stale API response and old bookmark', async ({ page }) => {
    await page.unroute('**/api/video-library/catalog**');
    await page.route('**/api/video-library/catalog**', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: [BLOCKED_VIDEO, VIDEO_A],
        pagination: { limit: 30, offset: 0, total: 2, hasMore: false },
      }),
    }));
    const crashes = watchForCrashes(page);
    await page.goto(`/hub/video-library?v=${BLOCKED_VIDEO.videoId}`, { waitUntil: 'commit' });

    await expect(page.locator('.vl-card-title', { hasText: VIDEO_A.title })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.vl-card-title', { hasText: BLOCKED_VIDEO.title })).toHaveCount(0);
    await expect(page.locator('#youtube-player')).toHaveCount(0);
    expect(crashes).toEqual([]);
  });

  test('stale filters and a dropped catalog use only the audited fallback', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('sp-filters-video-library', JSON.stringify({
        __v: { selectedSource: 'TRITON', selectedType: 'ALL' },
        __exp: Date.now() + 86_400_000,
      }));
    });
    await page.unroute('**/api/video-library/catalog**');
    await page.route('**/api/video-library/catalog**', route => route.abort('connectionfailed'));
    const crashes = watchForCrashes(page);
    await page.goto(`/hub/video-library?v=${BLOCKED_VIDEO.videoId}`, { waitUntil: 'commit' });

    await expect(page.getByRole('button', { name: 'Retry Catalog' })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.vl-card-title', { hasText: '10 Years of Triton Poker' })).toBeVisible();
    await expect(page.locator('#youtube-player')).toHaveCount(0);
    expect(await page.locator('body').innerHTML()).not.toContain(BLOCKED_VIDEO.videoId);
    expect(crashes).toEqual([]);
  });

  test('mobile command tabs are swipeable and controls meet the touch target', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chrome', 'mobile geometry contract');
    await page.goto('/hub/video-library', { waitUntil: 'commit' });
    await expect(page.locator('.vl-card-title', { hasText: VIDEO_A.title })).toBeVisible({ timeout: 20_000 });

    const rail = page.locator('.vl-type-toggle-row');
    const railMetrics = await rail.evaluate(element => ({
      overflowX: getComputedStyle(element).overflowX,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }));
    expect(railMetrics.overflowX).toBe('auto');
    expect(railMetrics.scrollWidth).toBeGreaterThan(railMetrics.clientWidth);

    const cashBox = await page.getByRole('button', { name: 'Cash Games' }).boundingBox();
    expect(cashBox?.height || 0).toBeGreaterThanOrEqual(44);
  });

  test('command layout has no serious automated accessibility violations', async ({ page }) => {
    await page.goto('/hub/video-library', { waitUntil: 'commit' });
    await expect(page.locator('.vl-card-title').first()).toBeVisible({ timeout: 20_000 });
    await page.addScriptTag({ path: AXE_PATH });
    const violations = await page.evaluate(async () => {
      const axe = (window as typeof window & { axe?: { run: (...args: unknown[]) => Promise<{ violations: Array<{ id: string; impact: string | null; nodes: Array<{ target?: string[] }> }> }> } }).axe;
      if (!axe) throw new Error('axe-core did not load');
      const result = await axe.run('.vl-command-layout', {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
      });
      return result.violations
        .filter(violation => violation.impact === 'critical' || violation.impact === 'serious')
        .map(violation => ({ id: violation.id, impact: violation.impact, nodes: violation.nodes.map(node => node.target || []) }));
    });
    expect(violations).toEqual([]);
  });

  test('signed-out personal views lead to sign-in and preserve the return path', async ({ page }) => {
    await page.addInitScript(() => {
      try { window.localStorage.clear(); } catch { /* storage unavailable */ }
    });
    await page.goto('/hub/video-library', { waitUntil: 'commit' });
    await expect(page.locator('.vl-card-title').first()).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Playlists, 0 Playlists' }).click();
    await expect(page.getByRole('button', { name: /Sign In To Sync/ })).toBeVisible();
    await page.getByRole('button', { name: /Sign In To Sync/ }).click();
    await expect(page).toHaveURL(/\/auth\/login\?redirect=%2Fhub%2Fvideo-library/);
  });
});
