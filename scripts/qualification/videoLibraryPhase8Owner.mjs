import assert from 'node:assert/strict';
import { VIDEO_OWNER_TOOLS, summarizeVideoOwnerSnapshot } from '../../src/lib/videoLibraryOwnerPanel.mjs';

// A read-only proof against the actual authenticated application. The calling
// qualification owns sign-in, identity verification, browser and publication.
export async function qualifyVideoLibraryPhase8Owner({ page, baseUrl = 'https://smarter.poker', accessToken, report = {} }) {
    assert.ok(accessToken, 'The Owner Proof Requires The Configured Authenticated Session');
    const origin = new URL(baseUrl).origin;
    const endpoint = `${origin}/api/admin/video-operations?windowHours=24`;
    const denied = await page.request.get(endpoint, { headers: { Authorization: '' } });
    assert.equal(denied.status(), 401, 'Anonymous Operations Access Must Be Denied');
    const authorized = await page.request.get(endpoint, { headers: { Authorization: `Bearer ${accessToken}` } });
    assert.equal(authorized.status(), 200, 'The Configured Owner Must Have Actual Administrative Access');
    const cache = authorized.headers()['cache-control'] || '';
    assert.match(cache, /private/); assert.match(cache, /no-store/);
    summarizeVideoOwnerSnapshot((await authorized.json()).snapshot);

    const isSnapshot = response => response.url().startsWith(endpoint) && response.request().method() === 'GET';
    const initialResponse = page.waitForResponse(isSnapshot, { timeout: 30000 });
    await page.goto(`${origin}/hub/video-library/owner`, { waitUntil: 'domcontentloaded' });
    const initial = await initialResponse;
    assert.equal(initial.status(), 200);
    let metrics = summarizeVideoOwnerSnapshot((await initial.json()).snapshot);
    const panel = page.locator('[data-video-library-owner-panel]');
    await panel.getByRole('heading', { name: 'Control Panel', exact: true }).waitFor();
    for (const metric of metrics) {
        const row = panel.locator('dl > div').filter({ has: page.locator('dt', { hasText: metric.label }) });
        await row.locator('dd').filter({ hasText: metric.value.toLocaleString() }).waitFor();
        assert.equal((await row.locator('dd').innerText()).trim(), metric.value.toLocaleString(), `Actual Snapshot Metric Mismatch: ${metric.label}`);
    }
    const toolLinks = panel.getByRole('navigation', { name: 'Owner Tools', exact: true }).locator('a');
    assert.equal(await toolLinks.count(), VIDEO_OWNER_TOOLS.length);
    for (const tool of VIDEO_OWNER_TOOLS) {
        const link = panel.locator(`a[href="${tool.href}"]`).filter({ has: page.locator('h2') });
        assert.equal(await link.count(), 1);
        const box = await link.boundingBox();
        assert.ok(box && box.height >= 44, `Owner Tool Tap Target Is Too Small: ${tool.title}`);
        const destination = await page.request.get(`${origin}${tool.href}`);
        assert.equal(destination.status(), 200, `Existing Owner Tool Page Is Unavailable: ${tool.title}`);
    }
    const refreshResponse = page.waitForResponse(isSnapshot, { timeout: 30000 });
    await panel.getByRole('button', { name: 'Refresh', exact: true }).click();
    const refreshed = await refreshResponse;
    assert.equal(refreshed.status(), 200);
    metrics = summarizeVideoOwnerSnapshot((await refreshed.json()).snapshot);
    await panel.getByRole('navigation', { name: 'Owner Tools', exact: true }).waitFor();
    for (const metric of metrics) {
        const row = panel.locator('dl > div').filter({ has: page.locator('dt', { hasText: metric.label }) });
        await row.locator('dd').filter({ hasText: metric.value.toLocaleString() }).waitFor();
        assert.equal((await row.locator('dd').innerText()).trim(), metric.value.toLocaleString());
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    const geometry = await page.evaluate(() => {
        const footer = document.querySelector('.bottom-nav-bar, [data-bottom-nav], nav.bottom-nav');
        const rect = footer?.getBoundingClientRect();
        return { width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth,
            footer: rect ? { bottom: rect.bottom, height: rect.height, position: getComputedStyle(footer).position } : null, viewportHeight: innerHeight };
    });
    assert.ok(geometry.scrollWidth <= geometry.width + 1, 'The Owner Panel Must Not Overflow Horizontally');
    // The root driver owns the shared footer locator and full shell assertion.
    const sourcesHref = VIDEO_OWNER_TOOLS[0].href;
    await panel.locator(`a[href="${sourcesHref}"]`).click();
    await page.waitForURL(`${origin}${sourcesHref}`, { timeout: 30000 });
    await page.getByRole('heading', { level: 1 }).waitFor();
    report.owner = { status: 'passed', observedAt: new Date().toISOString(), anonymousStatus: denied.status(), authorizedStatus: authorized.status(),
        refreshed: true, metrics, tools: VIDEO_OWNER_TOOLS.map(tool => tool.href), nativeDestination: page.url(), geometry };
    return report.owner;
}
