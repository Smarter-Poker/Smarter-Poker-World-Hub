import { expect, test, type Page, type Route } from '@playwright/test';
const AXE_PATH = require.resolve('axe-core/axe.min.js');

/*
 * Video Library browser contract — YouTube-style layout (owner update
 * 2026-10-11) and poker-first curation (Phase 1, 2026-10-12).
 *
 * The page renders only rows that carry a fresh persisted YouTube
 * verification, so every mock row below is verified, embeddable and checked
 * now. (The previous version of this file mocked rows without those fields,
 * which the page correctly refused, so its assertions could never pass.)
 */

const CHECKED_AT = new Date().toISOString();
const VERIFIED = { availabilityStatus: 'verified', embeddable: true, availabilityCheckedAt: CHECKED_AT };

const VIDEO_A = {
  ...VERIFIED,
  id: 'dQw4w9WgXcQ',
  videoId: 'dQw4w9WgXcQ',
  source: 'HCL',
  sourceName: 'Hustler Casino Live',
  attributionName: 'Hustler Casino Live',
  type: 'cash',
  title: 'River Decision Command Test',
  views: '120K',
  duration: '18:42',
  thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
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
  attributionName: 'Triton Poker',
  type: 'tournament',
  title: 'Final Table Pressure Test',
  tags: ['tournament'],
};

const SPORTS_VIDEO = {
  ...VIDEO_A,
  id: 'aqz-KE-bpKQ',
  videoId: 'aqz-KE-bpKQ',
  source: 'SPORTSCLIPS',
  sourceName: 'Sports Clips',
  attributionName: 'Sports Clips',
  type: 'sports',
  title: 'Buzzer Beater Highlights',
};

const CREATOR_VIDEO = {
  ...VIDEO_A,
  id: 'jNQXAC9IVRw',
  videoId: 'jNQXAC9IVRw',
  source: '3f8136ba-51e4-4093-9866-d0a1b2c3d4e5',
  sourceName: '3f8136ba-51e4-4093-9866-d0a1b2c3d4e5',
  attributionName: '3f8136ba-51e4-4093-9866-d0a1b2c3d4e5',
  title: 'Creator Upload Without A Name',
};

const BLOCKED_VIDEO = {
  ...VIDEO_B,
  id: '524_3UypGkU',
  videoId: '524_3UypGkU',
  title: 'Legacy Non-Embeddable Video',
};

const UNSUPPORTED_VIDEO = {
  ...VIDEO_A,
  id: 'ScMzIvxBSi4',
  videoId: 'ScMzIvxBSi4',
  type: 'chess',
  title: 'Stale Unsupported Catalog Record',
};

function watchForCrashes(page: Page): string[] {
  const crashes: string[] = [];
  page.on('pageerror', error => crashes.push(String(error?.message || error)));
  return crashes;
}

/** Mirrors the catalog API: no type chosen means poker only (cash + tournament). */
async function mockCatalog(route: Route): Promise<void> {
  const url = new URL(route.request().url());
  const source = url.searchParams.get('source');
  const type = url.searchParams.get('type');
  const query = (url.searchParams.get('q') || '').toLowerCase();
  const offset = Number(url.searchParams.get('offset') || 0);
  let videos = [VIDEO_A, VIDEO_B, CREATOR_VIDEO, SPORTS_VIDEO];
  videos = type
    ? videos.filter(video => video.type === type)
    : videos.filter(video => video.type === 'cash' || video.type === 'tournament');
  if (source) videos = videos.filter(video => video.source === source);
  if (query) videos = videos.filter(video => `${video.title} ${video.tags.join(' ')}`.toLowerCase().includes(query));
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      success: true,
      data: offset === 0 ? videos : [],
      pagination: { limit: 30, offset, total: videos.length, nextOffset: videos.length, hasMore: false },
    }),
  });
}

test.describe('21. Video Library — YouTube layout, poker first', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try { window.localStorage.removeItem('sp-filters-video-library'); } catch { /* storage unavailable */ }
    });
    await page.route('**/api/video-library/catalog**', mockCatalog);
    await page.route('**/api/video-library/discovery**', mockCatalog);
  });

  test('All Videos is poker only; Sports shows on its own chip; filters, search and sort stay in the URL', async ({ page }) => {
    const crashes = watchForCrashes(page);
    await page.goto('/hub/video-library', { waitUntil: 'commit' });

    await expect(page.locator('.vl-card-title', { hasText: VIDEO_A.title })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.vl-card-title', { hasText: VIDEO_B.title })).toBeVisible();
    await expect(page.locator('.vl-card-title', { hasText: SPORTS_VIDEO.title })).toHaveCount(0);
    await expect(page.locator('.vl-video-card.is-featured')).toHaveCount(1);

    await page.getByRole('button', { name: 'Sports', exact: true }).click();
    await expect(page).toHaveURL(/type=sports/);
    await expect(page.locator('.vl-card-title', { hasText: SPORTS_VIDEO.title })).toBeVisible();
    await expect(page.locator('.vl-card-title', { hasText: VIDEO_A.title })).toHaveCount(0);

    await page.getByRole('button', { name: 'Cash Games' }).click();
    await expect(page).toHaveURL(/type=cash/);
    await expect(page.locator('.vl-card-title', { hasText: VIDEO_A.title })).toBeVisible();
    await expect(page.locator('.vl-card-title', { hasText: VIDEO_B.title })).toHaveCount(0);

    const search = page.getByRole('searchbox', { name: 'Search the poker video library' });
    await search.fill('river');
    await expect(page).toHaveURL(/q=river/, { timeout: 5_000 });
    await expect(page.locator('.vl-card-title', { hasText: VIDEO_A.title })).toBeVisible();

    await page.getByRole('button', { name: 'Sort videos by Top Rated' }).click();
    await expect(page).toHaveURL(/sort=top_rated/);
    expect(crashes).toEqual([]);
  });

  test('a card shows channel, views and age, never a raw database id', async ({ page }) => {
    await page.goto('/hub/video-library', { waitUntil: 'commit' });
    const card = page.locator('.vl-video-card', { has: page.locator('.vl-card-title', { hasText: VIDEO_A.title }) });
    await expect(card.locator('.vl-card-meta')).toContainText('Hustler Casino Live', { timeout: 20_000 });
    await expect(card.locator('.vl-card-meta')).toContainText('120K Views');
    await expect(card.locator('.vl-card-meta')).toContainText(/Ago$/);

    const creator = page.locator('.vl-video-card', { has: page.locator('.vl-card-title', { hasText: CREATOR_VIDEO.title }) });
    await expect(creator.locator('.vl-card-meta')).toContainText('Independent Creator');
    await expect(creator.locator('.vl-card-meta')).not.toContainText('3f8136ba');
  });

  test('the three-dot menu offers library actions and closes cleanly', async ({ page }) => {
    const crashes = watchForCrashes(page);
    await page.goto('/hub/video-library', { waitUntil: 'commit' });
    await page.getByRole('button', { name: `More Actions For ${VIDEO_A.title}` }).click({ timeout: 20_000 });

    const sheet = page.getByRole('dialog', { name: VIDEO_A.title });
    await expect(sheet).toBeVisible();
    for (const action of ['Play', 'Save To Watch Later', 'Add To Favorites', 'Save To Playlist', 'Share']) {
      await expect(sheet.getByRole('button', { name: action, exact: true })).toBeVisible();
    }
    await sheet.getByRole('button', { name: 'Cancel' }).click();
    await expect(sheet).toHaveCount(0);
    expect(crashes).toEqual([]);
  });

  test('opening a card shows the watch page with the player on top, and Close returns', async ({ page }) => {
    const crashes = watchForCrashes(page);
    await page.route('https://www.youtube-nocookie.com/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<html></html>' }));
    await page.goto('/hub/video-library', { waitUntil: 'commit' });
    // Phase 2: a card is a real link to the video's own page; a plain click
    // still opens the in-page viewer.
    const cardLink = page.getByRole('link', { name: `Play ${VIDEO_A.title}` });
    await expect(cardLink).toHaveAttribute('href', `/hub/video-library/watch/${VIDEO_A.videoId}/river-decision-command-test`, { timeout: 20_000 });
    await cardLink.click();

    const viewer = page.getByRole('dialog', { name: VIDEO_A.title });
    await expect(viewer).toBeVisible();
    await expect(page.locator('#youtube-player')).toHaveAttribute('src', new RegExp(`/embed/${VIDEO_A.videoId}\\?`));
    for (const action of ['Like', 'Share', 'Save', 'Playlist', 'Train This Spot']) {
      await expect(viewer.locator('.vl-hud').getByText(action, { exact: true })).toBeVisible();
    }
    await viewer.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.locator('#youtube-player')).toHaveCount(0);
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

    await expect(page.getByRole('button', { name: 'Retry Catalog' }).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.vl-video-card')).toHaveCount(0);
    expect(crashes).toEqual([]);
  });

  test('rejects a blocked video from a stale API response and an old bookmark', async ({ page }) => {
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

  test('rejects unsupported rows from a stale catalog response', async ({ page }) => {
    await page.unroute('**/api/video-library/catalog**');
    await page.route('**/api/video-library/catalog**', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: [UNSUPPORTED_VIDEO, VIDEO_A],
        pagination: { limit: 30, offset: 0, total: 2, hasMore: false },
      }),
    }));
    const crashes = watchForCrashes(page);
    await page.goto('/hub/video-library', { waitUntil: 'commit' });

    await expect(page.locator('.vl-card-title', { hasText: VIDEO_A.title })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.vl-card-title', { hasText: UNSUPPORTED_VIDEO.title })).toHaveCount(0);
    expect(await page.locator('body').innerHTML()).not.toContain(UNSUPPORTED_VIDEO.videoId);
    expect(crashes).toEqual([]);
  });

  test('a dropped catalog fails closed: retry offered, nothing playable', async ({ page }) => {
    await page.unroute('**/api/video-library/catalog**');
    await page.route('**/api/video-library/catalog**', route => route.abort('connectionfailed'));
    const crashes = watchForCrashes(page);
    await page.goto(`/hub/video-library?v=${BLOCKED_VIDEO.videoId}`, { waitUntil: 'commit' });

    await expect(page.getByRole('button', { name: 'Retry Catalog' }).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#youtube-player')).toHaveCount(0);
    expect(await page.locator('body').innerHTML()).not.toContain(BLOCKED_VIDEO.videoId);
    expect(crashes).toEqual([]);
  });

  test('phone layout: one chip row scrolls sideways, no page overflow, 44px targets', async ({ page }, testInfo) => {
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

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    for (const name of ['Cash Games', `More Actions For ${VIDEO_A.title}`]) {
      const box = await page.getByRole('button', { name }).boundingBox();
      expect(box?.height || 0).toBeGreaterThanOrEqual(44);
      expect(box?.width || 0).toBeGreaterThanOrEqual(44);
    }
  });

  test('the library has no serious automated accessibility violations', async ({ page }) => {
    await page.goto('/hub/video-library', { waitUntil: 'commit' });
    await expect(page.locator('.vl-card-title').first()).toBeVisible({ timeout: 20_000 });
    await page.addScriptTag({ path: AXE_PATH });
    const violations = await page.evaluate(async () => {
      const axe = (window as typeof window & { axe?: { run: (...args: unknown[]) => Promise<{ violations: Array<{ id: string; impact: string | null; nodes: Array<{ target?: string[] }> }> }> } }).axe;
      if (!axe) throw new Error('axe-core did not load');
      const result = await axe.run('.vl-yt', {
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
    await page.getByRole('button', { name: 'Playlists, 0 playlists' }).click();
    // The view banner and the empty state both offer sign-in.
    await expect(page.getByRole('button', { name: 'Sign In To Sync' }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Sign In To Sync' }).first().click();
    await expect(page).toHaveURL(/\/auth\/login\?redirect=%2Fhub%2Fvideo-library/);
  });

  test('Phase 3 timeline markers, description and mini-player use one retained iframe', async ({ page }) => {
    await page.route('https://www.youtube-nocookie.com/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>Player Fixture</body></html>' }));
    await page.goto('/hub/video-library', { waitUntil: 'commit' });
    await page.getByRole('link', { name: `Play ${VIDEO_A.title}` }).click();
    const player = page.locator('#youtube-player');
    await expect(player).toBeVisible();
    const frame = await (await player.elementHandle())!.contentFrame();
    await frame!.evaluate(() => parent.postMessage(JSON.stringify({ event: 'infoDelivery', info: { currentTime: 72, duration: 1122 } }), '*'));
    await page.getByRole('button', { name: 'Mark This Hand', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Hand 1 · 1:12', exact: true })).toBeVisible();
    await frame!.evaluate(() => {
      (window as any).seekCommands = [];
      addEventListener('message', event => { try { const value = JSON.parse(event.data); if (value.func === 'seekTo') (window as any).seekCommands.push(value.args); } catch {} });
    });
    await page.getByRole('button', { name: 'Hand 1 · 1:12', exact: true }).click();
    await expect.poll(() => frame!.evaluate(() => (window as any).seekCommands.length)).toBe(1);
    expect(await frame!.evaluate(() => (window as any).seekCommands[0])).toEqual([72, true]);
    await page.getByRole('button', { name: 'Show More', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Show Less', exact: true })).toHaveAttribute('aria-expanded', 'true');
    await player.evaluate(element => element.setAttribute('data-retained-player', 'yes'));
    await page.getByRole('button', { name: 'Mini-Player', exact: true }).click();
    await expect(page.locator('.vl-viewer')).toHaveClass(/is-mini-player/);
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
    await expect(player).toHaveAttribute('data-retained-player', 'yes');
    await page.getByRole('button', { name: 'Expand Player', exact: true }).click();
    await expect(player).toHaveAttribute('data-retained-player', 'yes');
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
    await page.getByRole('button', { name: 'Remove Hand Marker At 1:12' }).click();
    await expect(page.getByRole('list', { name: 'Hand Markers' })).toHaveCount(0);
  });

  test('Phase 3 autoplay cancels, rejects forged messages and advances once on real end', async ({ page }) => {
    await page.route('https://www.youtube-nocookie.com/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>Player Fixture</body></html>' }));
    await page.goto('/hub/video-library', { waitUntil: 'commit' });
    await page.getByRole('link', { name: `Play ${VIDEO_A.title}` }).click();
    const player = page.locator('#youtube-player');
    const frame = await (await player.elementHandle())!.contentFrame();
    await page.evaluate(() => window.postMessage(JSON.stringify({ event: 'onStateChange', info: 0 }), '*'));
    await expect(page.locator('.vl-autoplay-countdown')).toHaveCount(0);
    await frame!.evaluate(() => parent.postMessage(JSON.stringify({ event: 'onStateChange', info: 0 }), '*'));
    await expect(page.locator('.vl-autoplay-countdown')).toContainText('Up Next In 5');
    await page.locator('.vl-autoplay-countdown').getByRole('button', { name: 'Cancel', exact: true }).click();
    await frame!.evaluate(() => parent.postMessage(JSON.stringify({ event: 'onStateChange', info: 0 }), '*'));
    await expect(page.locator('.vl-autoplay-countdown')).toHaveCount(0);
    await frame!.evaluate(() => { parent.postMessage(JSON.stringify({ event: 'onStateChange', info: 1 }), '*'); parent.postMessage(JSON.stringify({ event: 'onStateChange', info: 0 }), '*'); });
    await expect(page.locator('.vl-autoplay-countdown')).toBeVisible();
    await frame!.evaluate(() => parent.postMessage(JSON.stringify({ event: 'onStateChange', info: 2 }), '*'));
    await expect(page.locator('.vl-autoplay-countdown')).toHaveCount(0);
    await page.getByRole('checkbox', { name: 'Autoplay Next' }).uncheck();
    await frame!.evaluate(() => parent.postMessage(JSON.stringify({ event: 'onStateChange', info: 0 }), '*'));
    await expect(page.locator('.vl-autoplay-countdown')).toHaveCount(0);
    await page.getByRole('checkbox', { name: 'Autoplay Next' }).check();
    await frame!.evaluate(() => { parent.postMessage(JSON.stringify({ event: 'onStateChange', info: 1 }), '*'); parent.postMessage(JSON.stringify({ event: 'onStateChange', info: 0 }), '*'); });
    await expect(page.locator('.vl-autoplay-countdown')).toBeVisible();
    await expect(player).not.toHaveAttribute('src', new RegExp(`/embed/${VIDEO_A.videoId}\\?`), { timeout: 8000 });
    await expect(page.locator('.vl-autoplay-countdown')).toHaveCount(0);
    await expect(page.locator('iframe#youtube-player')).toHaveCount(1);
  });

});
