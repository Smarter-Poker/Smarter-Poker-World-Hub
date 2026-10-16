import { test, expect, type Page } from '@playwright/test';
import { installRealtimeSessionGuard } from './fixtures/realtimeSessionGuard';

// This file plants a fabricated session. Keep it off live Supabase Realtime.
test.beforeEach(async ({ context }) => {
  await installRealtimeSessionGuard(context);
});
const OWNER = '33333333-3333-4333-8333-333333333333';
const video = { id: 'phase6v0000', videoId: 'phase6v0000', source: 'HCL', sourceName: 'Hustler Casino Live', title: 'NLH Personal Study Lesson', type: 'cash', duration: '18:42', thumbnail: 'https://i.ytimg.com/vi/phase6v0000/hqdefault.jpg', availabilityStatus: 'verified', embeddable: true, availabilityCheckedAt: new Date().toISOString(), publishedAt: new Date().toISOString(), recommendationReasons: ['Continue where you stopped'] };
const catalog = { success: true, data: [video], pagination: { total: 1, nextOffset: 1, hasMore: false } };
async function fixtures(page: Page) {
    await page.route('**/api/video-library/catalog**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(catalog) }));
    await page.route('**/api/video-library/live**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: [], checkedAt: new Date().toISOString(), unavailableChannels: 0 }) }));
}
async function geometry(page: Page) {
    // Scroll-triggered hiding is allowed; check the footer after returning upward.
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    const footer = page.getByRole('navigation', { name: /Video Library Footer/i });
    await expect.poll(() => footer.evaluate(element => Math.abs(element.getBoundingClientRect().bottom - innerHeight))).toBeLessThanOrEqual(1);
}
test.describe('Phase 6 Personal Video Study', () => {
    test('signed-out study never fetches personal credits and recommendations use verified cold-start discovery', async ({ page }) => {
        await fixtures(page); let personalReads = 0, recommendations = 0;
        await page.route('**/api/video-library/study-status**', route => { personalReads += 1; return route.fulfill({ status: 401, body: '{}' }); });
        await page.route('**/api/video-library/discovery**', route => {
            const url = new URL(route.request().url()); expect(url.searchParams.get('mode')).toBe('recommended'); expect(url.searchParams.get('q')).toBeNull(); expect(route.request().headers().authorization).toBeUndefined(); recommendations += 1;
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...catalog, ownerId: null, ranking: { mode: 'recommended', personalized: false, coldStart: true, basis: 'verified_catalog' } }) });
        });
        await page.goto('/hub/video-library', { waitUntil: 'commit' });
        const study = page.getByRole('region', { name: 'Diamond Study Streak', exact: true });
        await expect(study.getByRole('link', { name: 'Sign In To See Your Study Streak' })).toHaveAttribute('href', '/auth/login?redirect=%2Fhub%2Fvideo-library');
        await page.getByRole('button', { name: /^Recommended For You/ }).first().click();
        await expect(page).toHaveURL(/filter=recommended/);
        await expect(page.locator('#video-library-grid .vl-card-title').first()).toHaveText('NLH Personal Study Lesson');
        expect(recommendations).toBeGreaterThan(0); expect(personalReads).toBe(0); await geometry(page);
    });
    test('study status renders acknowledged credits and exposes retry on failed reads', async ({ page }) => {
        await fixtures(page);
        await page.addInitScript(({ owner }) => { const user = { id: owner, email: 'study-test@example.invalid', user_metadata: {} }; localStorage.setItem('smarter-poker-auth', JSON.stringify({ access_token: 'local-browser-fixture-only', refresh_token: 'local-browser-fixture-only', expires_at: Math.floor(Date.now() / 1000) + 3600, user })); }, { owner: OWNER });
        await page.route('**/auth/v1/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ id: OWNER, email: 'study-test@example.invalid' }) }));
        await page.route('**/rest/v1/**', route => route.fulfill({ contentType: 'application/json', body: '[]' }));
        await page.route('**/api/vip/check-status**', route => route.fulfill({ contentType: 'application/json', body: '{"isVip":false}' }));
        let outcome: 'ready' | 'error' = 'error'; let reads = 0;
        await page.route('**/api/video-library/study-status**', route => {
            expect(new URL(route.request().url()).searchParams.get('ownerId')).toBe(OWNER); expect(route.request().headers().authorization).toBe('Bearer local-browser-fixture-only'); reads += 1;
            return route.fulfill({ status: outcome === 'error' ? 503 : 200, contentType: 'application/json', body: JSON.stringify(outcome === 'error' ? { success: false, error: 'Study Status Is Temporarily Unavailable' } : { success: true, ownerId: OWNER, data: { currentStreak: 2, studiedToday: true, diamondsToday: 7, basis: 'rewarded_video_watch_days' } }) });
        });
        await page.goto('/hub/video-library', { waitUntil: 'commit' });
        const study = page.getByRole('region', { name: 'Diamond Study Streak', exact: true });
        await expect(study.getByRole('alert')).toHaveText('Study Status Is Temporarily Unavailable');
        await expect(study.getByText(/Diamonds Earned/)).toHaveCount(0);
        outcome = 'ready'; await study.getByRole('button', { name: 'Reload Study Status' }).click();
        await expect(study.getByText('7 Diamonds Earned From Videos Today', { exact: true })).toBeVisible();
        await expect(study.getByText(/No Extra Streak Bonus/)).toBeVisible(); expect(reads).toBe(2); await geometry(page);
    });
});
