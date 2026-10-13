import { test, expect } from '@playwright/test';

const OWNER = '33333333-3333-4333-8333-333333333333';
const ID = 'abcdefghijk';
const VIDEO = { id: ID, videoId: ID, title: 'Verified Catalog Poker Study', sourceName: 'PokerGO', thumbnail: `https://i.ytimg.com/vi/${ID}/hqdefault.jpg` };
test.describe('Phase 6 Video Library Social Share Preparation', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(({ owner }) => {
      const user = { id: owner, email: 'video-share-fixture@example.invalid', user_metadata: { username: 'ShareFixture' } };
      localStorage.setItem('smarter-poker-auth', JSON.stringify({ access_token: 'local-browser-fixture-only', refresh_token: 'local-browser-fixture-only', expires_at: Math.floor(Date.now() / 1000) + 3600, user }));
      localStorage.setItem('sp-social-user', JSON.stringify({ id: owner, username: 'ShareFixture', name: 'ShareFixture', ts: Date.now() }));
      localStorage.setItem('sp-post-draft', 'My existing commentary');
    }, { owner: OWNER });
    await page.route('**/auth/v1/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ id: OWNER, email: 'video-share-fixture@example.invalid', user_metadata: { username: 'ShareFixture' } }) }));
    await page.route('**/rest/v1/**', route => route.fulfill({ contentType: 'application/json', body: '[]' }));
    await page.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: [], posts: [], contacts: [] }) }));
  });
  test('the real composer presents catalog facts and preserved editable commentary before any post publication', async ({ page }) => {
    const writes: string[] = [];
    const externalPreviews: string[] = [];
    page.on('request', request => {
      if (request.method() === 'POST' && /(?:create_social_post|social\/create-post|social\/pages\/posts)/.test(request.url())) writes.push(request.url());
      if (request.url().includes('/api/link-preview')) externalPreviews.push(request.url());
    });
    await page.route('**/api/video-library/catalog**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: [VIDEO] }) }));
    await page.goto(`/hub/social-media?compose=1&shareVideo=${ID}`, { waitUntil: 'commit' });
    const composer = page.locator('#shared-post-creator');
    const preview = composer.locator(`[data-video-library-share="${ID}"]`);
    await expect(preview).toBeVisible();
    await expect(preview).toContainText(VIDEO.title);
    await expect(preview).toContainText('PokerGO');
    await expect(preview.locator('img')).toHaveAttribute('src', VIDEO.thumbnail);
    const input = composer.getByRole('textbox').first();
    await expect(input).toHaveValue('My existing commentary');
    await input.fill('I am reviewing this video before sharing.');
    await expect(input).toHaveValue('I am reviewing this video before sharing.');
    expect(writes).toEqual([]);
    expect(externalPreviews).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
  test('an unavailable handoff preserves the draft and cannot fabricate a preview or publish', async ({ page }) => {
    await page.route('**/api/video-library/catalog**', route => route.fulfill({ contentType: 'application/json', body: '{"success":true,"data":[]}' }));
    await page.goto(`/hub/social-media?compose=1&shareVideo=${ID}`, { waitUntil: 'commit' });
    const composer = page.locator('#shared-post-creator');
    await expect(composer).toContainText(/This video could not be prepared for sharing\. Your post has not been published\./i);
    await expect(composer.locator(`[data-video-library-share="${ID}"]`)).toHaveCount(0);
    await expect(composer.getByRole('textbox').first()).toHaveValue('My existing commentary');
  });
});
