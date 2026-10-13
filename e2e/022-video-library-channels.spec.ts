import { test, expect, type Page } from '@playwright/test';

// Isolated SSR catalog fixture supplied by the scoped runner. These records
// never enter production; follow/browser API mocks exercise real components.
const CHANNEL = '11111111-1111-4111-8111-111111111111';
const OWNER = '33333333-3333-4333-8333-333333333333';
const PATH = `/hub/video-library/channels/${CHANNEL}`;
const NAME = 'Channel Contract Poker';
const live = { channelId: CHANNEL, channelName: NAME, videoId: 'phase5v0000', title: 'NLH Live Contract', thumbnail: 'https://i.ytimg.com/vi/phase5v0000/hqdefault.jpg', watchUrl: 'https://www.youtube.com/watch?v=phase5v0000' };
const livePayload = (data: unknown[] = []) => ({ success: true, data, checkedAt: new Date().toISOString(), unavailableChannels: 0 });
async function geometry(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  const footer = page.getByRole('navigation', { name: /Video Library Footer/i });
  await expect(footer).toHaveCount(1);
  await expect.poll(() => footer.evaluate(element => Math.abs(element.getBoundingClientRect().bottom - innerHeight))).toBeLessThanOrEqual(1);
  const metrics = await footer.evaluate(element => { const rect = element.getBoundingClientRect(); return { position: getComputedStyle(element).position, bottom: rect.bottom, viewport: innerHeight }; });
  expect(metrics.position).toBe('fixed');
  expect(Math.abs(metrics.bottom - metrics.viewport)).toBeLessThanOrEqual(1);
  for (const button of await page.locator('.vl-channel-follow button, .vl-channel-follow a, .vl-live-heading button').all()) {
    const rect = await button.boundingBox();
    expect(rect?.height || 0).toBeGreaterThanOrEqual(44);
    expect(rect?.width || 0).toBeGreaterThanOrEqual(44);
  }
}
test.describe('Phase 5 Video Library Channels', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/video-library/live**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(livePayload()) }));
  });
  test('channel aliases redirect to stable identity; eligible videos paginate without duplicates and sign-in preserves destination', async ({ page, request }) => {
    const alias = await request.get('/hub/video-library/channels/HCL', { maxRedirects: 0 });
    expect(alias.status()).toBe(308);
    expect(alias.headers().location).toBe(PATH);
    const unknown = await request.get('/hub/video-library/channels/made-up-channel');
    expect(unknown.status()).toBe(404);
    await page.goto(PATH, { waitUntil: 'commit' });
    await expect(page.getByRole('heading', { name: NAME, exact: true })).toBeVisible();
    await expect(page.locator('.vl-channel-page')).toHaveAttribute('data-channel-id', CHANNEL);
    await expect(page.locator('.vl-card-title')).toHaveCount(30);
    const initial = await page.locator('.vl-card-title').allTextContents();
    expect(new Set(initial).size).toBe(30);
    await page.getByRole('button', { name: 'Load More Videos', exact: true }).click();
    await expect(page.locator('.vl-card-title')).toHaveCount(31);
    expect(new Set(await page.locator('.vl-card-title').allTextContents()).size).toBe(31);
    await expect(page.getByRole('button', { name: 'Load More Videos', exact: true })).toHaveCount(0);
    const signIn = page.getByRole('link', { name: 'Sign In To Follow', exact: true });
    await expect(signIn).toHaveAttribute('href', `/auth/login?redirect=${encodeURIComponent(PATH)}`);
    await geometry(page);
  });
  test('signed-in follow, refresh, notification opt-out and error readback reflect acknowledged owner state', async ({ page }) => {
    await page.addInitScript(({ owner }) => {
      const user = { id: owner, email: 'channel-test@example.invalid', user_metadata: {} };
      localStorage.setItem('smarter-poker-auth', JSON.stringify({ access_token: 'local-browser-fixture-only', refresh_token: 'local-browser-fixture-only', expires_at: Math.floor(Date.now() / 1000) + 3600, user }));
    }, { owner: OWNER });
    await page.route('**/auth/v1/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ id: OWNER, email: 'channel-test@example.invalid' }) }));
    await page.route('**/rest/v1/**', route => route.fulfill({ contentType: 'application/json', body: '[]' }));
    await page.route('**/api/vip/check-status**', route => route.fulfill({ contentType: 'application/json', body: '{"isVip":false}' }));
    let following = false, notificationsEnabled = false, failWrite = false;
    const writes: Record<string, unknown>[] = [];
    await page.route('**/api/video-library/channel-follow**', async route => {
      const req = route.request();
      const url = new URL(req.url());
      if (req.method() === 'POST') {
        const body = req.postDataJSON();
        expect(body.expectedOwnerId).toBe(OWNER);
        expect(body.channelId).toBe(CHANNEL);
        writes.push(body);
        if (failWrite) return route.fulfill({ status: 503, contentType: 'application/json', body: '{"success":false,"error":"Follow State Could Not Be Saved"}' });
        following = body.following; notificationsEnabled = body.notificationsEnabled;
      } else expect(url.searchParams.get('expectedOwnerId')).toBe(OWNER);
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, ownerId: OWNER, channelId: CHANNEL, following, notificationsEnabled }) });
    });
    await page.goto(PATH, { waitUntil: 'commit' });
    const follow = page.getByRole('button', { name: 'Follow Channel', exact: true });
    await expect(follow).toBeEnabled({ timeout: 20_000 });
    await follow.click();
    await expect(page.getByRole('button', { name: 'Unfollow Channel', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(writes).toHaveLength(1);
    const bell = page.getByRole('checkbox', { name: 'Notify Me About New Videos', exact: true });
    await expect(bell).not.toBeChecked();
    await bell.click();
    await expect(bell).toBeEnabled();
    await expect(bell).toBeChecked();
    await page.reload({ waitUntil: 'commit' });
    await expect(page.getByRole('button', { name: 'Unfollow Channel', exact: true })).toBeEnabled();
    await expect(bell).toBeChecked();
    await expect(bell).toBeChecked();
    await bell.click();
    await expect(bell).toBeEnabled();
    await expect(bell).not.toBeChecked();
    expect(notificationsEnabled).toBe(false);
    failWrite = true;
    await page.getByRole('button', { name: 'Unfollow Channel', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Follow State Could Not Be Saved' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Unfollow Channel', exact: true })).toHaveCount(0);
    failWrite = false;
    await page.getByRole('button', { name: 'Reload Follow Status', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Unfollow Channel', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Unfollow Channel', exact: true }).click();
    await expect(follow).toHaveAttribute('aria-pressed', 'false');
    await expect(bell).toBeDisabled();
    expect(following).toBe(false);
    await geometry(page);
  });
  test('Live Now reflects active, ended and failed provider reads and recovers explicitly', async ({ page }) => {
    let outcome: 'active' | 'ended' | 'error' = 'active';
    await page.route('**/api/video-library/live**', route => route.fulfill({ status: outcome === 'error' ? 503 : 200, contentType: 'application/json', body: JSON.stringify(outcome === 'error' ? { success: false } : livePayload(outcome === 'active' ? [live] : [])) }));
    await page.goto(PATH, { waitUntil: 'commit' });
    const row = page.getByRole('region', { name: 'Live Now', exact: true });
    const watch = row.getByRole('link', { name: 'Watch NLH Live Contract Live On YouTube', exact: true });
    await expect(watch).toHaveAttribute('href', live.watchUrl);
    await expect(watch).toHaveAttribute('target', '_blank');
    await expect(row.getByRole('link', { name: NAME, exact: true })).toHaveAttribute('href', PATH);
    outcome = 'ended';
    await row.getByRole('button', { name: 'Refresh Live Status', exact: true }).click();
    await expect(watch).toHaveCount(0);
    await expect(row.getByText('No Verified Live Streams Right Now.', { exact: true })).toBeVisible();
    outcome = 'error';
    await row.getByRole('button', { name: 'Refresh Live Status', exact: true }).click();
    await expect(row.getByRole('alert')).toHaveText('Live Status Is Temporarily Unavailable. Try Refreshing.');
    await expect(watch).toHaveCount(0);
    outcome = 'active';
    await row.getByRole('button', { name: 'Refresh Live Status', exact: true }).click();
    await expect(watch).toBeVisible();
    await geometry(page);
  });
});
