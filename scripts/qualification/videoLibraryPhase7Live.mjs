// Explicit, finite public release proof. Real catalog and YouTube responses
// only; anonymous sessions, no account, reward, financial or social writes.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, webkit, expect } from 'playwright/test';

const base = 'https://smarter.poker';
const expected = process.env.VIDEO_PHASE7_EXPECTED_REVISION;
assert.match(expected || '', /^[a-f0-9]{40}$/);
const evidence = process.env.VIDEO_PHASE7_LIVE_EVIDENCE_DIR;
assert(evidence && path.isAbsolute(evidence), 'An explicit evidence directory is required');
if (process.platform === 'darwin') assert(evidence.startsWith('/Volumes/SmarterArchives/agent-evidence/'), 'Mac live evidence belongs on the archive SSD');
await fs.mkdir(evidence, { recursive: true });
const report = { startedAt: new Date().toISOString(), expectedRevision: expected, base, mockedRequests: false, accountWrites: false, financialWrites: false, cases: [], status: 'running' };
let browser, page;
const save = () => fs.writeFile(path.join(evidence, 'phase7-public-live.json'), JSON.stringify(report, null, 2));
async function get(route) {
    const response = await fetch(`${base}${route}`, { signal: AbortSignal.timeout(20000) });
    return { status: response.status, payload: await response.json() };
}
async function health() {
    const result = await get('/api/health');
    assert.equal(result.status, 200); assert.equal(result.payload.commitSha, expected);
    assert(result.payload.deploymentId); return result.payload;
}
async function layout(name) {
    await page.evaluate(() => window.scrollTo(0, 0));
    const footer = page.getByRole('navigation', { name: /Video Library Footer/i });
    await expect.poll(() => footer.evaluate(element => Math.abs(element.getBoundingClientRect().bottom - innerHeight))).toBeLessThanOrEqual(1);
    await expect(page.locator('.approved-global-header')).toBeVisible();
    const geometry = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    assert.equal(geometry.scrollWidth, geometry.width);
    await page.screenshot({ path: path.join(evidence, `${name}.png`), fullPage: false });
    return geometry;
}
async function timeline() {
    return page.evaluate(() => {
        const records = window.__phase7Provider || [];
        const current = [...records].reverse().find(record => record.event === 'infoDelivery' && Number.isFinite(record.info?.currentTime));
        const states = [-1, 0, 1, 2, 3, 5];
        const state = [...records].reverse().find(record => states.includes(record.event === 'onStateChange' ? record.info : record.info?.playerState));
        return { position: current?.info?.currentTime ?? null, state: state ? state.event === 'onStateChange' ? state.info : state.info.playerState : null, stateSource: state?.event || null, records };
    });
}
async function nativeClick(button) {
    await button.scrollIntoViewIfNeeded();
    await expect.poll(() => button.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        const hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        return hit === element || element.contains(hit);
    })).toBe(true);
    await button.click();
}
async function quizFlow(name, surface) {
    await expect(page.getByRole('region', { name: 'Playback Tools', exact: true })).toHaveCount(1);
    const region = page.getByRole('region', { name: 'What Would You Do?', exact: true });
    await expect(region).toHaveCount(1);
    const originalIframe = await page.locator('iframe[src*="youtube-nocookie.com/embed/"]').elementHandle();
    const providerFrame = await originalIframe.contentFrame();
    assert(providerFrame);
    const receivedCommands = () => providerFrame.evaluate(() => window.__phase7ParentCommands || []);
    const open = region.getByRole('button', { name: 'What Would You Do?', exact: true });
    await expect(open).toBeEnabled({ timeout: 45000 });
    await expect.poll(async () => (await timeline()).state, { timeout: 15000 }).toBe(1);
    await expect.poll(async () => (await timeline()).position, { timeout: 15000 }).toBeGreaterThan(0);
    const before = await timeline();
    const pauseCount = (await receivedCommands()).filter(command => command.func === 'pauseVideo').length;
    await nativeClick(open);
    await expect.poll(async () => (await receivedCommands()).filter(command => command.func === 'pauseVideo').length).toBe(pauseCount + 1);
    const call = region.getByRole('button', { name: 'Call', exact: true });
    await expect(call).toBeVisible({ timeout: 6000 });
    const paused = await timeline();
    assert.equal(paused.state, 2, 'The real provider must acknowledge its paused state');
    await nativeClick(call);
    const reason = region.getByRole('textbox', { name: 'Why This Decision?' });
    await reason.fill('Compare the price with the opponent range.');
    await expect(reason).toHaveValue('Compare the price with the opponent range.');
    await expect(region.getByText('You Chose Call.', { exact: true })).toBeVisible();
    await expect(region.getByText(/No Correct Answer Is Assigned To This Hand/i)).toBeVisible();
    const bounds = await call.boundingBox();
    assert(bounds && bounds.height >= 44 && bounds.width >= 44);
    await region.screenshot({ path: path.join(evidence, `${name}-${surface}-quiz.png`) });
    const playCount = (await receivedCommands()).filter(command => command.func === 'playVideo').length;
    await nativeClick(region.getByRole('button', { name: 'Continue Watching', exact: true }));
    await expect.poll(async () => (await receivedCommands()).filter(command => command.func === 'playVideo').length).toBe(playCount + 1);
    await expect.poll(async () => (await timeline()).state, { timeout: 15000 }).toBe(1);
    await expect.poll(async () => (await timeline()).position, { timeout: 15000 }).toBeGreaterThan(paused.position + 0.2);
    const resumed = await timeline();
    await expect(page.getByRole('region', { name: 'Playback Tools', exact: true })).toHaveCount(1);
    await expect(region).toHaveCount(1);
    assert(await originalIframe.evaluate(element => element.isConnected && element === document.querySelector('iframe[src*="youtube-nocookie.com/embed/"]')));
    assert(resumed.records.every(record => ['https://www.youtube.com', 'https://www.youtube-nocookie.com'].includes(record.origin)));
    report.cases.push({ name: `${name}: ${surface} real provider pause and explicit resume`, status: 'passed', before: { position: before.position, state: before.state, stateSource: before.stateSource }, paused: { position: paused.position, state: paused.state, stateSource: paused.stateSource }, resumed: { position: resumed.position, state: resumed.state, stateSource: resumed.stateSource }, providerEvents: resumed.records, receivedParentCommands: await receivedCommands() });
    await save();
}
try {
    report.healthBefore = await health();
    const result = await get('/api/video-library/catalog?playerId=daniel-negreanu&limit=30');
    assert.equal(result.status, 200); assert.equal(result.payload.success, true);
    assert.equal(result.payload.player?.id, 'daniel-negreanu');
    assert(result.payload.data?.length);
    const fullName = /(?:^|[^\p{L}\p{N}])daniel negreanu(?=$|[^\p{L}\p{N}])/iu;
    for (const video of result.payload.data) {
        assert(['cash', 'tournament'].includes(video.type));
        assert(video.embeddable === true && video.availabilityStatus === 'verified');
        assert(fullName.test(video.rawTitle || video.title) || (video.tags || []).some(tag => String(tag).trim().toLowerCase() === 'daniel negreanu'));
    }
    report.catalog = { player: result.payload.player, total: result.payload.pagination.total, videos: result.payload.data.map(({ videoId, title, source, type }) => ({ videoId, title, source, type })) };
    const unknown = await get('/api/video-library/catalog?playerId=not-a-player');
    assert.equal(unknown.status, 400);
    const variants = [
        { name: 'chromium375', engine: chromium, width: 375, height: 844, executablePath: process.env.VIDEO_LIBRARY_CHROMIUM_EXECUTABLE },
        { name: 'chromium1440', engine: chromium, width: 1440, height: 900, executablePath: process.env.VIDEO_LIBRARY_CHROMIUM_EXECUTABLE },
        { name: 'webkit393', engine: webkit, width: 393, height: 852, executablePath: process.env.VIDEO_LIBRARY_WEBKIT_EXECUTABLE },
    ];
    for (const variant of variants) {
        browser = await variant.engine.launch({ headless: true, ...(variant.executablePath ? { executablePath: variant.executablePath } : {}) });
        const context = await browser.newContext({ viewport: { width: variant.width, height: variant.height }, isMobile: variant.width < 500, hasTouch: variant.width < 500, serviceWorkers: 'block' });
        page = await context.newPage();
        const crashes = [], writes = [];
        page.on('pageerror', error => crashes.push(error.message));
        page.on('request', request => {
            if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method()) && (/\/rest\/v1\//.test(request.url()) || /\/api\/rewards\//.test(request.url()))) writes.push({ method: request.method(), url: request.url() });
        });
        await page.addInitScript(() => {
            window.__phase7Provider = [];
            window.__phase7ParentCommands = [];
            // Observe commands received by the provider frame; send nothing.
            window.addEventListener('message', event => {
                if (event.source !== parent || event.origin !== 'https://smarter.poker') return;
                try {
                    const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                    if (data?.event === 'command' && ['pauseVideo', 'playVideo'].includes(data.func)) window.__phase7ParentCommands.push({ at: Date.now(), func: data.func });
                } catch { /* Ignore unrelated parent messages. */ }
            });
            window.addEventListener('message', event => {
                const iframe = document.querySelector('iframe[src*="youtube-nocookie.com/embed/"]');
                if (!iframe || event.source !== iframe.contentWindow || !['https://www.youtube.com', 'https://www.youtube-nocookie.com'].includes(event.origin)) return;
                try {
                    const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                    if (!['infoDelivery', 'onStateChange', 'onError', 'onAutoplayBlocked'].includes(data?.event)) return;
                    window.__phase7Provider.push({ at: Date.now(), origin: event.origin, event: data.event, info: data.event === 'infoDelivery' ? { currentTime: data.info?.currentTime, duration: data.info?.duration, muted: data.info?.muted, playerState: data.info?.playerState } : data.info });
                    window.__phase7Provider = window.__phase7Provider.slice(-150);
                } catch { /* Ignore unrelated provider messages. */ }
            });
        });
        await page.goto(`${base}/hub/video-library`, { waitUntil: 'commit' });
        await page.getByRole('link', { name: 'Poker Players', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Poker Players', exact: true })).toBeVisible();
        const directoryGeometry = await layout(`${variant.name}-directory`);
        await page.getByRole('link', { name: 'Daniel Negreanu', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Daniel Negreanu', exact: true })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Videos Naming Daniel Negreanu', exact: true })).toBeVisible();
        const detailGeometry = await layout(`${variant.name}-player`);
        const first = page.locator('#video-library-grid a[aria-label^="Watch "]').first();
        const href = await first.getAttribute('href');
        assert.match(href || '', /^\/hub\/video-library\/watch\/[A-Za-z0-9_-]{11}\//);
        const id = href.split('/')[4];
        assert(result.payload.data.some(video => video.videoId === id), 'Native watch link must belong to the actual player catalog response');
        await first.click();
        await expect(page).toHaveURL(new RegExp(`/watch/${id}/`));
        const video = result.payload.data.find(video => video.videoId === id);
        await expect(page.getByRole('heading', { name: video.title, exact: true })).toBeVisible();
        const watchGeometry = await layout(`${variant.name}-watch`);
        report.cases.push({ name: `${variant.name}: directory, player and native catalog watch navigation`, status: 'passed', videoId: id, directoryGeometry, detailGeometry, watchGeometry });
        await page.getByRole('button', { name: `Play ${video.title}`, exact: true }).click();
        await quizFlow(variant.name, 'watch');
        await page.goto(`${base}/hub/video-library?v=${id}`, { waitUntil: 'commit' });
        await quizFlow(variant.name, 'library');
        await layout(`${variant.name}-library`);
        assert.deepEqual(writes, []); assert.deepEqual(crashes, []);
        await context.close(); await browser.close(); browser = null;
    }
    report.healthAfter = await health();
    assert.equal(report.healthBefore.deploymentId, report.healthAfter.deploymentId);
    assert.equal(report.cases.length, 9);
    report.status = 'passed'; report.finishedAt = new Date().toISOString(); await save();
    console.log(JSON.stringify({ status: report.status, cases: report.cases.length, revision: expected, evidence }));
} catch (error) {
    report.status = 'failed'; report.error = String(error.stack || error); report.finishedAt = new Date().toISOString();
    if (page && !page.isClosed()) {
        report.failureUrl = page.url();
        report.providerAtFailure = await timeline().catch(() => null);
        const handle = await page.locator('iframe[src*="youtube-nocookie.com/embed/"]').elementHandle().catch(() => null);
        const frame = await handle?.contentFrame();
        report.receivedParentCommandsAtFailure = await frame?.evaluate(() => window.__phase7ParentCommands || []).catch(() => null);
        report.visibleFailure = (await page.locator('body').innerText().catch(() => '')).slice(-12000);
        await page.screenshot({ path: path.join(evidence, 'failure.png'), fullPage: false }).catch(() => {});
    }
    await save(); throw error;
} finally { await browser?.close(); }
