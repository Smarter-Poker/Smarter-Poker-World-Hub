import { test, expect } from '@playwright/test';
const OWNER = '33333333-3333-4333-8333-333333333333';
const PLAYLIST = '44444444-4444-4444-8444-444444444444';
const PATH = `/hub/video-library/playlists/${PLAYLIST}`;
const IDS = ['abcdefghijk', 'bcdefghijkl', 'cdefghijklm'];
const VIDEO = IDS.map((videoId, index) => ({ videoId, id: videoId, title: `Playlist Contract Video ${index + 1}`, source: 'HCL', type: 'cash', availabilityStatus: 'verified', embeddable: true, availabilityCheckedAt: new Date().toISOString(), duration: '10:00' }));
test.describe('Phase 6 Playlist Browsing', () => {
  test('playlist sign-in destination and private indexing stay scoped', async ({ page }) => {
    await page.goto(PATH, { waitUntil: 'commit' });
    await expect(page.getByRole('heading', { name: 'Sign In To Open Your Playlist' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign In', exact: true })).toHaveAttribute('href', `/auth/login?redirect=${encodeURIComponent(PATH)}`);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });
  test('owner playlist reorder persists, stale write requires reload, and Play All/Shuffle create session-only queues', async ({ page }) => {
    await page.addInitScript(({ owner }) => {
      const user = { id: owner, email: 'playlist-fixture@example.invalid', user_metadata: {} };
      localStorage.setItem('smarter-poker-auth', JSON.stringify({ access_token: 'local-browser-fixture-only', refresh_token: 'local-browser-fixture-only', expires_at: Math.floor(Date.now() / 1000) + 3600, user }));
    }, { owner: OWNER });
    await page.route('**/auth/v1/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ id: OWNER, email: 'playlist-fixture@example.invalid' }) }));
    let order = [...IDS];
    let rejectWrite = false;
    await page.route('**/rest/v1/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/rpc/fn_reorder_video_playlist')) {
        const body = route.request().postDataJSON();
        expect(body.p_playlist_id).toBe(PLAYLIST);
        expect(body.p_expected_video_ids).toEqual(order);
        if (rejectWrite) return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ code: '40001', message: 'Playlist changed' }) });
        order = body.p_video_ids;
        return route.fulfill({ contentType: 'application/json', body: 'true' });
      }
      if (url.pathname.endsWith('/video_playlists')) {
        expect(url.searchParams.get('user_id')).toBe(`eq.${OWNER}`);
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ id: PLAYLIST, user_id: OWNER, name: 'Contract Playlist', created_at: '2026-10-01T00:00:00Z', items: order.map((video_id, sort_order) => ({ id: video_id, video_id, sort_order, created_at: '2026-10-01T00:00:00Z' })) }) });
      }
      return route.fulfill({ contentType: 'application/json', body: '[]' });
    });
    await page.route('**/api/video-library/catalog**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: VIDEO, pagination: { hasMore: false } }) }));
    await page.route('**/api/vip/check-status**', route => route.fulfill({ contentType: 'application/json', body: '{"isVip":false}' }));
    await page.goto(PATH, { waitUntil: 'commit' });
    await expect(page.getByRole('heading', { name: 'Contract Playlist' })).toBeVisible();
    await expect(page.locator('.vl-playlist-video-row')).toHaveCount(3);
    await page.getByRole('button', { name: 'Move Video 2 Up', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Playlist Order Saved.');
    expect(order).toEqual([IDS[1], IDS[0], IDS[2]]);
    await page.reload({ waitUntil: 'commit' });
    await expect(page.locator('.vl-playlist-video-link strong').first()).toHaveText(VIDEO[1].title);
    rejectWrite = true;
    await page.getByRole('button', { name: 'Move Video 2 Up', exact: true }).click();
    await expect(page.locator('.vl-playlist-page').getByRole('alert')).toContainText('Reload Before Trying Again');
    await expect(page.getByRole('button', { name: 'Move Video 2 Up', exact: true })).toHaveCount(0);
    rejectWrite = false;
    await page.getByRole('button', { name: 'Reload Playlist' }).click();
    await expect(page.getByRole('button', { name: 'Play All', exact: true })).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    for (const button of await page.locator('.vl-playlist-reorder button, .vl-playlist-play-actions button').all()) {
      const bounds = await button.boundingBox(); expect(bounds?.height || 0).toBeGreaterThanOrEqual(44);
    }
    await page.getByRole('button', { name: 'Play All', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/watch/${IDS[1]}/.*\\?play=1`));
    await expect(page.locator('.vl-playlist-page')).toHaveCount(0);
    const queue = await page.evaluate(() => JSON.parse(sessionStorage.getItem('video-library-session-queue-v1') || '{}'));
    expect(queue.ownerId).toBe(OWNER);
    expect(queue.items.map((item: { videoId: string }) => item.videoId)).toEqual(order);
    await page.goto(PATH, { waitUntil: 'commit' });
    await page.getByRole('button', { name: 'Shuffle', exact: true }).click();
    await expect(page).toHaveURL(/\/watch\/[A-Za-z0-9_-]{11}\/.*\?play=1/);
    await expect(page.locator('.vl-playlist-page')).toHaveCount(0);
    const shuffled = await page.evaluate(() => JSON.parse(sessionStorage.getItem('video-library-session-queue-v1') || '{}'));
    expect(shuffled.items.map((item: { videoId: string }) => item.videoId).sort()).toEqual([...IDS].sort());
    expect(shuffled.currentId).toBe(shuffled.items[0].videoId);
  });
});
