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
  tags: ['river', 'nlh', 'low stakes', 'beginner'],
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
  tags: ['tournament', 'plo', 'high stakes', 'advanced'],
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
  tags: ['sports'],
};

const CREATOR_VIDEO = {
  ...VIDEO_A,
  id: 'jNQXAC9IVRw',
  videoId: 'jNQXAC9IVRw',
  source: '3f8136ba-51e4-4093-9866-d0a1b2c3d4e5',
  sourceName: '3f8136ba-51e4-4093-9866-d0a1b2c3d4e5',
  attributionName: '3f8136ba-51e4-4093-9866-d0a1b2c3d4e5',
  title: 'Creator Upload Without A Name',
  tags: [],
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
  // Independently specified fixture metadata: filtering must reach the API,
  // including discovery, rather than only changing a selected UI control.
  const dimensionTags: Record<string, Record<string, string>> = {
    game: { holdem: 'nlh', omaha: 'plo' },
    stakes: { low: 'low stakes', mid: 'mid stakes', high: 'high stakes' },
    skill: { beginner: 'beginner', intermediate: 'intermediate', advanced: 'advanced' },
  };
  for (const [dimension, values] of Object.entries(dimensionTags)) {
    const selected = url.searchParams.get(dimension);
    if (selected && selected !== 'ALL') videos = videos.filter(video => video.tags.includes(values[selected]));
  }
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

    const search = page.getByRole('combobox', { name: 'Search the poker video library' });
    await search.fill('river');
    await expect(page).toHaveURL(/q=river/, { timeout: 5_000 });
    await expect(page.locator('.vl-card-title', { hasText: VIDEO_A.title })).toBeVisible();

    // Dismiss search suggestions before choosing a chip beneath the popup.
    await search.press('Escape');
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

  test('Phase 3 timeline markers, description and mini-player use one retained iframe', async ({ page }, testInfo) => {
    await page.route('https://www.youtube-nocookie.com/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>Player Fixture</body></html>' }));
    await page.goto('/hub/video-library', { waitUntil: 'commit' });
    await page.getByRole('link', { name: `Play ${VIDEO_A.title}` }).click();
    const player = page.locator('#youtube-player');
    await expect(player).toBeVisible();
    const frame = await (await player.elementHandle())!.contentFrame();
    await frame!.evaluate(() => parent.postMessage(JSON.stringify({ event: 'infoDelivery', info: { currentTime: 72, duration: 1200 } }), '*'));
    await frame!.evaluate(() => parent.postMessage(JSON.stringify({ event: 'infoDelivery', info: { currentTime: 73 } }), '*'));
    await expect(page.getByRole('slider', { name: 'Seek Video' })).toHaveValue('73');
    await expect(page.getByRole('slider', { name: 'Seek Video' })).toHaveAttribute('max', '1200');
    await page.getByRole('button', { name: 'Mark This Hand', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Hand 1 · 1:13', exact: true })).toBeVisible();
    await frame!.evaluate(() => {
      (window as any).seekCommands = [];
      addEventListener('message', event => { try { const value = JSON.parse(event.data); if (value.func === 'seekTo') (window as any).seekCommands.push(value.args); } catch {} });
    });
    await page.getByRole('button', { name: 'Hand 1 · 1:13', exact: true }).click();
    await expect.poll(() => frame!.evaluate(() => (window as any).seekCommands.length)).toBe(1);
    expect(await frame!.evaluate(() => (window as any).seekCommands[0])).toEqual([73, true]);
    await page.getByRole('button', { name: 'Show More', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Show Less', exact: true })).toHaveAttribute('aria-expanded', 'true');
    await frame!.evaluate(() => {
      (window as any).autoplayCommands = [];
      addEventListener('message', event => { try { const value = JSON.parse(event.data); if (['mute', 'playVideo'].includes(value.func)) (window as any).autoplayCommands.push(value.func); } catch {} });
      parent.postMessage(JSON.stringify({ event: 'onAutoplayBlocked' }), '*');
      parent.postMessage(JSON.stringify({ event: 'onAutoplayBlocked' }), '*');
    });
    await expect.poll(() => frame!.evaluate(() => (window as any).autoplayCommands.filter((value: string) => value === 'mute').length)).toBe(1);
    await expect(page.getByText('Sound Starts Off. Turn It On In The Player.', { exact: true })).toBeVisible();
    await player.evaluate(element => element.setAttribute('data-retained-player', 'yes'));
    if (testInfo.project.name === 'chromium') {
      await page.keyboard.press('f');
      await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
    }
    await page.getByRole('button', { name: 'Mini-Player', exact: true }).click();
    await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
    await expect(page.locator('.vl-viewer')).toHaveClass(/is-mini-player/);
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
    await expect(player).toHaveAttribute('data-retained-player', 'yes');
    const retainedSource = await player.getAttribute('src');
    await page.getByRole('checkbox', { name: 'Autoplay Next' }).uncheck();
    await page.getByRole('link', { name: `Play ${VIDEO_A.title}` }).click();
    await expect(page.locator('.vl-viewer')).not.toHaveClass(/is-mini-player/);
    await expect(player).toHaveAttribute('src', retainedSource!);
    await page.getByRole('button', { name: 'Mini-Player', exact: true }).click();
    await page.getByRole('button', { name: 'Expand Player', exact: true }).click();
    await expect(player).toHaveAttribute('data-retained-player', 'yes');
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
    await page.getByRole('button', { name: 'Remove Hand Marker At 1:13' }).click();
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
    await frame!.evaluate(() => {
      (window as any).pauseCommands = [];
      addEventListener('message', event => { try { const value = JSON.parse(event.data); if (value.func === 'playVideo') (window as any).pauseCommands.push(value.func); } catch {} });
    });
    await page.getByRole('checkbox', { name: 'Autoplay Next' }).uncheck();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(await frame!.evaluate(() => (window as any).pauseCommands)).toEqual([]);
    await frame!.evaluate(() => parent.postMessage(JSON.stringify({ event: 'onStateChange', info: 0 }), '*'));
    await expect(page.locator('.vl-autoplay-countdown')).toHaveCount(0);
    await page.getByRole('checkbox', { name: 'Autoplay Next' }).check();
    await frame!.evaluate(() => { parent.postMessage(JSON.stringify({ event: 'onStateChange', info: 1 }), '*'); parent.postMessage(JSON.stringify({ event: 'onStateChange', info: 0 }), '*'); });
    await expect(page.locator('.vl-autoplay-countdown')).toBeVisible();
    await expect(player).not.toHaveAttribute('src', new RegExp(`/embed/${VIDEO_A.videoId}\\?`), { timeout: 8000 });
    await expect(page.locator('.vl-autoplay-countdown')).toHaveCount(0);
    await expect(page.locator('iframe#youtube-player')).toHaveCount(1);
  });

  test('Phase 4 suggestions are keyboard selectable and submitted recent searches persist, remove and clear', async ({ page }) => {
    const crashes = watchForCrashes(page);
    await page.goto('/hub/video-library', { waitUntil: 'commit' });
    await expect(page.locator('.vl-card-title', { hasText: VIDEO_A.title })).toBeVisible({ timeout: 20_000 });
    const catalogResponse = (query: string) => page.waitForResponse(response => { const url = new URL(response.url()); return /\/api\/video-library\/(catalog|discovery)$/.test(url.pathname) && (url.searchParams.get('q') || '') === query; }).then(response => response.finished());
    const search = page.getByRole('combobox', { name: 'Search the poker video library' });
    await search.evaluate(element => element.setAttribute('data-retained-search', 'yes'));
    const typedResponse = catalogResponse('river');
    await search.fill('river');
    await typedResponse;
    await expect(search).toHaveAttribute('data-retained-search', 'yes');
    await expect(search).toBeFocused();
    const suggestion = page.getByRole('option', { name: new RegExp(VIDEO_A.title) });
    await expect(suggestion).toBeVisible();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('video-library-recent-searches-v1'))).toBeNull();
    await search.press('ArrowDown');
    await expect(suggestion).toHaveAttribute('aria-selected', 'true');
    await expect(search).toHaveAttribute('aria-activedescendant', await suggestion.getAttribute('id') as string);
    const submittedResponse = catalogResponse(VIDEO_A.title);
    await search.press('Enter');
    await submittedResponse;
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('video-library-recent-searches-v1') || '[]'))).toEqual([VIDEO_A.title]);
    await expect(page).toHaveURL(/q=River/);
    const refreshedResponse = catalogResponse(VIDEO_A.title);
    await page.reload({ waitUntil: 'commit' });
    await refreshedResponse;
    await search.click();
    await expect(page.getByRole('button', { name: `Remove Recent Search ${VIDEO_A.title}`, exact: true })).toBeVisible();
    await search.press('Escape');
    await expect(search).toHaveValue(VIDEO_A.title);
    await expect(page.getByRole('listbox', { name: 'Video Search Suggestions' })).toHaveCount(0);
    const clearedResponse = catalogResponse('');
    await page.getByRole('button', { name: /^Clear Video Search$/i }).click();
    await clearedResponse;
    await page.getByRole('button', { name: `Remove Recent Search ${VIDEO_A.title}`, exact: true }).click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('video-library-recent-searches-v1'))).toBeNull();
    for (const query of ['river', 'tournament']) {
      const resultResponse = catalogResponse(query);
      await search.fill(query);
      await resultResponse;
      await page.getByRole('button', { name: 'Submit Video Search', exact: true }).click();
    }
    const historyClearResponse = catalogResponse('');
    await page.getByRole('button', { name: /^Clear Video Search$/i }).click();
    await historyClearResponse;
    await expect(page.getByRole('button', { name: 'Clear Recent Searches', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Clear Recent Searches', exact: true }).click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('video-library-recent-searches-v1'))).toBeNull();
    const outsideSearchResponse = catalogResponse('river');
    await search.fill('river');
    await outsideSearchResponse;
    await expect(suggestion).toBeVisible();
    await page.getByRole('button', { name: /^Show Videos From All Channels$/i }).click();
    await expect(page.getByRole('listbox', { name: 'Video Search Suggestions' })).toHaveCount(0);
    expect(crashes).toEqual([]);
  });

  test('Phase 4 published game, stakes and skill filters compose, survive refresh and reset an empty view', async ({ page }) => {
    const crashes = watchForCrashes(page);
    const browseRequests: URL[] = [];
    page.on('request', request => { if (/\/api\/video-library\/(catalog|discovery)/.test(request.url())) browseRequests.push(new URL(request.url())); });
    await page.goto('/hub/video-library', { waitUntil: 'commit' });
    await expect(page.locator('.vl-card-title', { hasText: VIDEO_A.title })).toBeVisible({ timeout: 20_000 });
    for (const name of ['Game', 'Stakes', 'Skill Level']) {
      const bounds = await page.getByRole('combobox', { name, exact: true }).boundingBox();
      expect(bounds?.height || 0, `${name} native control height`).toBeGreaterThanOrEqual(44);
      expect(bounds?.width || 0, `${name} native control width`).toBeGreaterThanOrEqual(44);
    }
    await page.getByRole('combobox', { name: 'Game', exact: true }).selectOption('holdem');
    await page.getByRole('combobox', { name: 'Stakes', exact: true }).selectOption('low');
    await page.getByRole('combobox', { name: 'Skill Level', exact: true }).selectOption('beginner');
    await expect.poll(() => new URL(page.url()).searchParams.get('skill')).toBe('beginner');
    expect(new URL(page.url()).searchParams.get('game')).toBe('holdem');
    expect(new URL(page.url()).searchParams.get('stakes')).toBe('low');
    await expect.poll(() => browseRequests.some(url => url.searchParams.get('game') === 'holdem' && url.searchParams.get('stakes') === 'low' && url.searchParams.get('skill') === 'beginner')).toBe(true);
    await expect(page.locator('.vl-card-title', { hasText: VIDEO_A.title })).toBeVisible();
    await expect(page.locator('.vl-card-title', { hasText: VIDEO_B.title })).toHaveCount(0);
    await expect(page.locator('.vl-card-title', { hasText: CREATOR_VIDEO.title })).toHaveCount(0);
    await page.reload({ waitUntil: 'commit' });
    await expect(page.getByRole('combobox', { name: 'Game', exact: true })).toHaveValue('holdem');
    await expect(page.getByRole('combobox', { name: 'Stakes', exact: true })).toHaveValue('low');
    await expect(page.getByRole('combobox', { name: 'Skill Level', exact: true })).toHaveValue('beginner');
    // Faceted search uses the catalog endpoint so facets apply before pagination.
    await page.getByRole('combobox', { name: 'Search the poker video library' }).fill('river');
    await expect(page.locator('.vl-card-title', { hasText: VIDEO_A.title })).toBeVisible();
    await expect.poll(() => browseRequests.some(url => url.pathname.endsWith('/catalog') && url.searchParams.get('q') === 'river' && url.searchParams.get('game') === 'holdem' && url.searchParams.get('stakes') === 'low' && url.searchParams.get('skill') === 'beginner')).toBe(true);
    await page.getByRole('combobox', { name: 'Game', exact: true }).selectOption('omaha');
    await expect(page.locator('.vl-card-title')).toHaveCount(0);
    await page.getByRole('button', { name: 'Clear Filters', exact: true }).first().click();
    await expect(page.locator('.vl-card-title', { hasText: VIDEO_A.title })).toBeVisible();
    await expect(page.locator('.vl-card-title', { hasText: VIDEO_B.title })).toBeVisible();
    await expect(page.locator('.vl-card-title', { hasText: CREATOR_VIDEO.title })).toBeVisible();
    for (const name of ['game', 'stakes', 'skill', 'q']) expect(new URL(page.url()).searchParams.has(name)).toBe(false);
    await page.getByRole('combobox', { name: 'Search the poker video library' }).fill('river');
    await expect.poll(() => browseRequests.some(url => url.pathname.endsWith('/discovery') && url.searchParams.get('q') === 'river' && !['game', 'stakes', 'skill'].some(key => url.searchParams.has(key)))).toBe(true);
    expect(crashes).toEqual([]);
  });

  test('Phase 4 scrolling preserves accessible mobile search and desktop sidebar navigation', async ({ page }) => {
    await page.goto('/hub/video-library', { waitUntil: 'commit' });
    await expect(page.locator('.vl-card-title', { hasText: VIDEO_A.title })).toBeVisible({ timeout: 20_000 });
    const search = page.getByRole('combobox', { name: 'Search the poker video library' });
    const wrap = page.locator('.vl-browse-search');
    if ((page.viewportSize()?.width || 0) < 1100) {
      await page.evaluate(() => window.scrollTo(0, 250));
      await expect(wrap).toHaveClass(/is-scroll-hidden/);
      await page.evaluate(() => window.scrollTo(0, 150));
      await expect(wrap).not.toHaveClass(/is-scroll-hidden/);
      await search.focus();
      await page.evaluate(() => window.scrollTo(0, 350));
      await expect(wrap).not.toHaveClass(/is-scroll-hidden/);
      await expect(search).toBeFocused();
      await search.press('Escape');
    } else {
      const rail = page.getByRole('navigation', { name: 'Video library filters' });
      const geometry = await rail.boundingBox();
      const grid = await page.locator('#video-library-grid').boundingBox();
      expect(geometry).not.toBeNull();
      expect(grid).not.toBeNull();
      expect(geometry!.x + geometry!.width).toBeLessThanOrEqual(grid!.x);
      await rail.getByRole('button', { name: 'Sports', exact: true }).click();
      await expect(page.locator('.vl-card-title', { hasText: SPORTS_VIDEO.title })).toBeVisible();
      await rail.getByRole('button', { name: 'Cash Games', exact: true }).click();
      await expect(page.locator('.vl-card-title', { hasText: VIDEO_A.title })).toBeVisible();
      await rail.getByRole('button', { name: /^Watch Later, 0 Videos$/i }).click();
      await expect(page.getByRole('button', { name: 'Sign In To Sync' }).first()).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });

});
