import assert from 'node:assert/strict';
import { videoLibrarySocialShareHref } from '../../src/lib/videoLibrarySocialShare.mjs';

// The caller owns the configured authenticated test session and serving-revision
// proof. This section prepares a local draft only; it never clicks Post.
export async function runPhase6Social(page, context, video, report, evidence) {
    const href = videoLibrarySocialShareHref(video);
    assert(href, 'A verified public catalog video is required');
    const videoId = video.videoId || video.id;
    const postWrites = [];
    const externalPreviews = [];
    const onRequest = request => {
        if (request.method() === 'POST' && /(?:fn_create_social_post|social\/create-post|social\/pages\/posts)/.test(request.url())) postWrites.push(request.url());
        if (request.url().includes('/api/link-preview')) {
            // Other existing feed cards may legitimately hydrate external news.
            // This proof owns only the canonical video being shared.
            let requestText = `${request.url()} ${request.postData() || ''}`;
            try { requestText = decodeURIComponent(requestText); } catch { /* retain literal URL */ }
            if (requestText.includes(`/hub/video-library/watch/${videoId}`)) externalPreviews.push(request.url());
        }
    };
    let originalDraft;
    page.on('request', onRequest);
    try {
        // Existing context is already same-origin and authenticated. Preserve
        // browser-only drafts even though qualification uses a fresh context.
        originalDraft = await page.evaluate(() => localStorage.getItem('sp-post-draft'));
        const response = await page.goto(`https://smarter.poker${href}`, { waitUntil: 'commit' });
        assert.equal(response.status(), 200);
        const composer = page.locator('#shared-post-creator');
        const preview = composer.locator(`[data-video-library-share="${videoId}"]`);
        await preview.waitFor({ state: 'visible', timeout: 20000 });
        assert((await preview.textContent()).includes(video.title), 'Preview uses the verified catalog title');
        assert((await preview.textContent()).includes(video.sourceName || video.channelName || 'Video Library'), 'Preview uses catalog attribution');
        assert.equal(await preview.locator('img').getAttribute('src'), video.thumbnail || video.thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`);
        const input = composer.getByRole('textbox').first();
        await input.fill('Reviewing this Video Library study before sharing.');
        assert.equal(await input.inputValue(), 'Reviewing this Video Library study before sharing.');
        assert.equal(await composer.getByRole('button', { name: 'Post', exact: true }).isEnabled(), true, 'Publication remains an explicit available action');
        assert.equal(postWrites.length, 0, 'Preparing and editing a share cannot publish a post');
        assert.equal(externalPreviews.length, 0, 'Canonical video share never hydrates through the external preview service');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
        await page.screenshot({ path: `${evidence}/phase6-social-share-prepared.png`, fullPage: false });
        report.cases.push({ name: 'authenticated real composer prepares catalog-backed editable Video Library share without publication', status: 'passed', videoId });
    } finally {
        // Stop the composer draft debounce by leaving the page first, then
        // restore precisely the browser-local value captured above.
        await page.goto('https://smarter.poker/hub/video-library', { waitUntil: 'commit' });
        if (originalDraft !== undefined) {
            await page.evaluate(value => {
                if (value === null) localStorage.removeItem('sp-post-draft');
                else localStorage.setItem('sp-post-draft', value);
            }, originalDraft);
        }
        page.off('request', onRequest);
    }
    assert.equal(postWrites.length, 0);
    return { videoId, prepared: true, published: false, draftRestored: true };
}
