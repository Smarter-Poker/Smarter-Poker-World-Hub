import { test, expect, type Page, type Locator } from '@playwright/test';
import { installRealtimeSessionGuard } from './fixtures/realtimeSessionGuard';

// This file plants a fabricated session. Keep it off live Supabase Realtime.
test.beforeEach(async ({ context }) => {
  await installRealtimeSessionGuard(context);
});
const OWNER = '33333333-3333-4333-8333-333333333333';
const UPLOAD = '/hub/reels?category=poker&upload=1';
const snapshot = { generatedAt: '2026-10-14T00:00:00Z', windowHours: 24, organicSessions: 3,
    sources: [{ active: 6 }], candidates: [{ status: 'published', count: 5 }, { status: 'approved', count: 20 }],
    moderationCases: [{ status: 'submitted', count: 2 }], jobs: [{ status: 'dead_letter', count: 4 }], controls: [{ control_key: 'video_library_discovery', enabled: true }] };
async function fixtures(page: Page) {
    await page.route('**/api/video-library/catalog**', route => route.fulfill({ contentType: 'application/json', body: '{"success":true,"data":[],"pagination":{"total":0,"hasMore":false}}' }));
    await page.route('**/api/video-library/live**', route => route.fulfill({ contentType: 'application/json', body: '{"success":true,"data":[],"checkedAt":"2026-10-14T00:00:00Z","unavailableChannels":0}' }));
    await page.route('**/api/reels/feed**', route => route.fulfill({ contentType: 'application/json', body: '{"success":true,"reels":[],"data":[],"hasMore":false,"nextCursor":null}' }));
    await page.route('**/rest/v1/**', route => route.fulfill({ contentType: 'application/json', body: '[]' }));
    await page.route('**/api/vip/check-status**', route => route.fulfill({ contentType: 'application/json', body: '{"isVip":false}' }));
}
async function authenticated(page: Page) {
    await page.addInitScript(({ owner }) => {
        const user = { id: owner, email: 'owner-tools-fixture@example.invalid', user_metadata: {} };
        localStorage.setItem('smarter-poker-auth', JSON.stringify({ access_token: 'local-browser-fixture-only', refresh_token: 'local-browser-fixture-only', expires_at: Math.floor(Date.now() / 1000) + 3600, user }));
    }, { owner: OWNER });
    await page.route('**/auth/v1/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ id: OWNER, email: 'owner-tools-fixture@example.invalid' }) }));
}
async function nativeClick(locator: Locator) {
    await locator.evaluate(element => element.scrollIntoView({ block: 'center', inline: 'nearest' }));
    await locator.click();
}
async function geometry(page: Page) {
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    const footer = page.getByRole('navigation', { name: /Video Library Footer/i });
    await expect.poll(() => footer.evaluate(element => Math.abs(element.getBoundingClientRect().bottom - innerHeight))).toBeLessThanOrEqual(1);
    expect(await footer.evaluate(element => getComputedStyle(element).position)).toBe('fixed');
}
test.describe('Phase 8 Video Library Owner Tools', () => {
    test('library omits the public control panel entry and direct owner sign-in preserves mobile shell', async ({ page }) => {
        await fixtures(page);
        let adminReads = 0;
        await page.route('**/api/admin/video-operations**', route => { adminReads += 1; return route.fulfill({ status: 401, body: '{}' }); });
        await page.goto('/hub/video-library', { waitUntil: 'commit' });
        const entry = page.getByRole('link', { name: 'Control Panel', exact: true });
        await expect(page.getByRole('heading', { name: 'Poker Video Library', exact: true })).toBeVisible();
        await expect(entry).toHaveCount(0);
        await geometry(page);
        await page.goto('/hub/video-library/owner', { waitUntil: 'commit' });
        const panel = page.locator('[data-video-library-owner-panel]');
        const signIn = panel.getByRole('link', { name: 'Sign In To Open The Control Panel', exact: true });
        await expect(signIn).toHaveAttribute('href', '/auth/login?redirect=%2Fhub%2Fvideo-library%2Fowner');
        expect((await signIn.boundingBox())?.height).toBeGreaterThanOrEqual(44);
        await expect(panel.getByRole('navigation', { name: 'Owner Tools' })).toHaveCount(0);
        expect(adminReads).toBe(0);
        await geometry(page);
    });
    test('native owner snapshot renders truthful metrics, retries, refreshes and denies member access', async ({ page }) => {
        await fixtures(page); await authenticated(page);
        let outcome = 503, reads = 0;
        await page.route('**/api/admin/video-operations**', route => {
            expect(route.request().headers().authorization).toBe('Bearer local-browser-fixture-only');
            reads += 1;
            return route.fulfill({ status: outcome, contentType: 'application/json', body: JSON.stringify(outcome === 200 ? { snapshot } : { error: 'Fixture Denial' }) });
        });
        await page.goto('/hub/video-library/owner', { waitUntil: 'commit' });
        const panel = page.locator('[data-video-library-owner-panel]');
        await expect(panel.getByRole('alert')).toHaveText('The Control Panel Could Not Be Loaded.');
        outcome = 200;
        await panel.getByRole('button', { name: 'Reload Control Panel', exact: true }).click();
        const metrics = panel.locator('dl > div');
        await expect(metrics).toHaveCount(5);
        expect(await metrics.locator('dd').allTextContents()).toEqual(['6', '5', '3', '2', '4']);
        const links = panel.getByRole('navigation', { name: 'Owner Tools', exact: true }).locator('a');
        await expect(links).toHaveCount(5);
        for (const link of await links.all()) expect((await link.boundingBox())?.height).toBeGreaterThanOrEqual(44);
        const before = reads;
        await nativeClick(panel.getByRole('button', { name: 'Refresh', exact: true }));
        await expect.poll(() => reads).toBe(before + 1);
        await expect(metrics).toHaveCount(5);
        await geometry(page);
        outcome = 403;
        await nativeClick(panel.getByRole('button', { name: 'Refresh', exact: true }));
        await expect(panel.getByRole('alert')).toHaveText('An Owner Or Admin Account Is Required To Open The Control Panel.');
        await expect(metrics).toHaveCount(0);
        await expect(links).toHaveCount(0);
    });
    test('member clip native deep link preserves sign-in destination and requires sharing rights', async ({ page }) => {
        await fixtures(page);
        await page.goto('/hub/video-library', { waitUntil: 'commit' });
        const upload = page.getByRole('link', { name: 'Upload Poker Clip', exact: true });
        await expect(upload).toHaveAttribute('href', UPLOAD);
        expect((await upload.boundingBox())?.height).toBeGreaterThanOrEqual(44);
        await nativeClick(upload);
        await expect(page).toHaveURL(url => url.pathname === '/auth/login' && url.searchParams.get('redirect') === UPLOAD);
        // The guest router still owns its redirect. A separate document models
        // the fixture's new signed-in identity without racing that navigation.
        const memberPage = await page.context().newPage();
        await page.close();
        await fixtures(memberPage);
        await authenticated(memberPage);
        await memberPage.goto(UPLOAD, { waitUntil: 'domcontentloaded' });
        const dialog = memberPage.getByRole('dialog', { name: 'Upload Reel', exact: true });
        await expect(dialog).toBeVisible();
        const consent = dialog.getByRole('checkbox');
        await expect(consent).not.toBeChecked();
        await expect(dialog.getByText('Confirmation Required', { exact: true })).toBeVisible();
        const submit = dialog.getByRole('button', { name: 'Upload Reel', exact: true });
        await expect(submit).toHaveCount(0);
        await expect(dialog.getByRole('button', { name: 'Choose Video', exact: true })).toBeVisible();
        await dialog.locator('input[type=file]').setInputFiles({ name: 'invalid.txt', mimeType: 'text/plain', buffer: Buffer.from('Not Video') });
        await expect(dialog.getByText('Please Select A Valid Video File', { exact: true })).toBeVisible();
        await dialog.getByText('Confirmation Required', { exact: true }).click();
        await expect(consent).toBeChecked();
        await expect(dialog.getByText('Rights Confirmed', { exact: true })).toBeVisible();
        await expect(submit).toHaveCount(0);
        await dialog.getByText('Rights Confirmed', { exact: true }).click();
        await expect(consent).not.toBeChecked();
        await expect(submit).toHaveCount(0);
        await memberPage.close();
    });
});
