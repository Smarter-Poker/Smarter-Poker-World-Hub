// Explicit bounded release proof, called by the owning driver with its
// configured dedicated session. No synthetic watch credit or reward claims.
import assert from 'node:assert/strict';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { expect } from 'playwright/test';
import { isDedicatedProbeAccount } from '../../src/lib/probeIdentity.js';
import { durationSeconds } from '../../src/lib/videoLibraryCuration.mjs';
import { watchPath } from '../../src/lib/videoLibraryWatch.mjs';

export async function runPhase8Tracking({ page, client, admin, session, ownerId, email, base = 'https://smarter.poker', evidence, report, readFinancialSnapshot }) {
    assert(isDedicatedProbeAccount(email));
    assert.equal((await client.auth.getUser(session.access_token)).data?.user?.id, ownerId);
    assert.equal(typeof readFinancialSnapshot, 'function');
    const checked = result => { assert(!result.error, 'Authoritative owned watch history must be readable'); return result.data; };
    const existing = checked(await admin.from('video_watch_history').select('video_id').eq('user_id', ownerId));
    const alreadyWatched = new Set(existing.map(row => row.video_id));
    const catalogs = await Promise.all(['HCL', 'POKERGO', 'WPT'].map(async source => {
        const response = await fetch(`${base}/api/video-library/catalog?source=${source}&limit=30`, { signal: AbortSignal.timeout(20000) });
        assert(response.ok); const catalog = await response.json();
        return catalog.data?.find(item => durationSeconds(item.duration) >= 300 && !alreadyWatched.has(item.videoId));
    }));
    const candidates = catalogs.filter(Boolean);
    let video = candidates[0];
    assert(video, 'An eligible long catalog video without prior dedicated-account history is required');
    const readRow = async () => checked(await admin.from('video_watch_history').select('id,user_id,video_id,watch_duration_seconds,progress_seconds,watch_started_at,last_heartbeat_at').eq('user_id', ownerId).eq('video_id', video.videoId).maybeSingle());
    assert.equal(await readRow(), null);
    const financialBefore = await readFinancialSnapshot(ownerId);
    let createdRowId;
    const pendingWrites = new Set();
    const watchWrite = request => {
        const pathname = new URL(request.url()).pathname;
        if (request.method() === 'POST' && (pathname.endsWith('/rest/v1/rpc/record_video_watch_session') || pathname === '/api/video-library/watch-progress')) pendingWrites.add(request);
    };
    const finishedWrite = request => pendingWrites.delete(request);
    page.on('request', watchWrite);
    page.on('requestfinished', finishedWrite);
    page.on('requestfailed', finishedWrite);
    // Observes only real provider replies. Nothing is sent to the provider.
    await page.addInitScript(() => {
        window.__phase8WatchObserved = [];
        addEventListener('message', event => {
            const iframe = document.querySelector('iframe[src*="youtube-nocookie.com/embed/"]');
            if (!iframe || event.source !== iframe.contentWindow || !['https://www.youtube.com', 'https://www.youtube-nocookie.com'].includes(event.origin)) return;
            try {
                const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                if (data.event === 'onStateChange' || data.event === 'infoDelivery') {
                    window.__phase8WatchObserved.push({ event: data.event, state: data.event === 'onStateChange' ? data.info : data.info?.playerState, position: data.info?.currentTime });
                    if (window.__phase8WatchObserved.length > 200) window.__phase8WatchObserved.shift();
                }
            } catch { /* unrelated page messages are not provider telemetry */ }
        });
    });
    const state = () => page.evaluate(() => [...(window.__phase8WatchObserved || [])].reverse().find(item => [-1, 0, 1, 2, 3, 5].includes(item.state))?.state ?? null);
    const position = () => page.evaluate(() => [...(window.__phase8WatchObserved || [])].reverse().find(item => Number.isFinite(item.position))?.position ?? 0);
    const diagnostics = async (stage, error) => {
        const iframe = page.locator('iframe[src*="youtube-nocookie.com/embed/"]');
        const handle = await iframe.elementHandle().catch(() => null);
        const provider = await handle?.contentFrame().catch(() => null);
        const observation = {
            stage, videoId: video.videoId, source: video.source, observedAt: new Date().toISOString(),
            error: String(error?.message || error).slice(0, 1000), providerState: await state(),
            providerPosition: await position(), frameSource: await iframe.getAttribute('src').catch(() => null),
            providerBody: await provider?.locator('body').innerText({ timeout: 3000 }).then(value => value.slice(0, 2000)).catch(() => null),
            media: await provider?.locator('video').evaluateAll(elements => elements.map(element => ({
                currentTime: element.currentTime, paused: element.paused, readyState: element.readyState,
                errorCode: element.error?.code || null,
            }))).catch(() => null),
            providerEvents: await page.evaluate(() => window.__phase8WatchObserved || []),
        };
        report.trackingProviderDiagnostics ||= [];
        report.trackingProviderDiagnostics.push(observation);
        if (evidence) {
            const prefix = `phase8-tracking-${stage}-${video.videoId}`;
            await page.screenshot({ path: path.join(evidence, `${prefix}.png`), fullPage: false });
            await writeFile(path.join(evidence, `${prefix}.json`), JSON.stringify(observation, null, 2));
        }
        return observation;
    };
    const startProvider = async () => {
        const frame = page.frameLocator('iframe[src*="youtube-nocookie.com/embed/"]');
        await expect.poll(async () => (await state()) === 1 || await frame.locator('button.ytp-large-play-button').isVisible(), { timeout: 20000 }).toBe(true);
        if ((await state()) !== 1) await frame.locator('button.ytp-large-play-button').click();
        await expect.poll(state, { timeout: 20000 }).toBe(1);
        return frame;
    };
    try {
        let frame;
        for (let index = 0; index < candidates.length; index += 1) {
            video = candidates[index];
            assert.equal(await readRow(), null, 'Every candidate must have no existing dedicated-account history');
            await page.goto(`${base}${watchPath(video)}`, { waitUntil: 'domcontentloaded' });
            await page.locator('[data-watch-tracking="ready"]').waitFor({ timeout: 20000 });
            const discoverablePlayer = page.locator('iframe[src*="youtube-nocookie.com/embed/"]');
            await expect(discoverablePlayer).toBeVisible();
            const discoverableSource = new URL(await discoverablePlayer.getAttribute('src'));
            assert.equal(discoverableSource.searchParams.get('autoplay'), '0');
            assert(!discoverableSource.searchParams.has('start'));
            assert.equal(await readRow(), null, 'Discovering the non-autoplaying iframe must not write watch credit');
            try { frame = await startProvider(); break; }
            catch (error) {
                const observed = await diagnostics('provider-unavailable', error);
                // Only an unstarted provider may move to another actual
                // catalog candidate. Tracking or persistence failures never
                // become a skipped assertion or a fabricated pass.
                assert.notEqual(observed.providerState, 1);
                assert(!observed.media?.some(media => !media.paused || media.currentTime > 0), 'A playing provider without valid telemetry requires diagnosis');
                await page.goto(`${base}/hub/video-library`, { waitUntil: 'domcontentloaded' });
                await expect.poll(() => pendingWrites.size, { timeout: 20000 }).toBe(0);
                assert.equal(await readRow(), null, 'Unavailable provider must not have written watch credit');
                if (index === candidates.length - 1) throw error;
            }
        }
        assert(frame, 'An actual available catalog provider is required');
        const iframe = await page.locator('iframe[src*="youtube-nocookie.com/embed/"]').elementHandle();
        const initialSource = await iframe.getAttribute('src');
        await expect.poll(async () => {
            const row = await readRow();
            if (row) createdRowId = row.id;
            return row?.watch_duration_seconds || 0;
        }, { timeout: 30000 }).toBeGreaterThanOrEqual(10);
        assert(await iframe.evaluate(element => element.isConnected && element === document.querySelector('iframe[src*="youtube-nocookie.com/embed/"]')));
        assert.equal(await iframe.getAttribute('src'), initialSource, 'Saving must not reload the running iframe');
        await expect(page.locator('[data-watch-tracking="saved"]')).toBeVisible();
        // Cross a real elapsed interval after the heartbeat so pause submits
        // a distinct segment, and await that exact server acknowledgment.
        const afterHeartbeatPosition = await position();
        await expect.poll(position, { timeout: 15000 }).toBeGreaterThan(afterHeartbeatPosition + 5);
        const pauseSaved = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/rest/v1/rpc/record_video_watch_session'), { timeout: 20000 });
        // The normal native provider control acknowledges a real pause.
        await frame.locator('button.ytp-play-button').click();
        await expect.poll(state).toBe(2);
        assert((await pauseSaved).ok());
        await page.locator('[data-watch-tracking="saved"]').waitFor();
        // A database read and passive provider observation, never injected
        // commands or manufactured seconds, establish the stopped interval.
        const paused = await readRow();
        assert(paused && paused.id === createdRowId && paused.user_id === ownerId && paused.video_id === video.videoId);
        await new Promise(resolve => setTimeout(resolve, 6000));
        const stopped = await readRow();
        assert.equal(stopped.watch_duration_seconds, paused.watch_duration_seconds);
        assert.equal(stopped.progress_seconds, paused.progress_seconds);
        assert(stopped.watch_duration_seconds > 0 && stopped.watch_duration_seconds < 300);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.locator('[data-watch-tracking="ready"]').waitFor();
        const resumedIframe = page.locator('iframe[src*="youtube-nocookie.com/embed/"]');
        await expect(resumedIframe).toBeVisible();
        const resumedHandle = await resumedIframe.elementHandle();
        const resumeSource = await resumedIframe.getAttribute('src');
        assert.equal(resumeSource, initialSource, 'Reload keeps the same non-autoplaying player address');
        assert.equal(new URL(resumeSource).searchParams.get('autoplay'), '0');
        assert(!new URL(resumeSource).searchParams.has('start'));
        const resumePosition = Math.floor(stopped.progress_seconds);
        // Wait for the actual provider's native poster before asking the
        // app's visible resume control to seek/play the existing player.
        const resumeFrame = page.frameLocator('iframe[src*="youtube-nocookie.com/embed/"]');
        await expect(resumeFrame.locator('button.ytp-large-play-button')).toBeVisible({ timeout: 20000 });
        const resumeButton = page.getByRole('button', { name: 'Resume Saved Position', exact: true });
        await expect(resumeButton).toBeVisible();
        await resumeButton.evaluate(element => element.scrollIntoView({ block: 'center' }));
        await resumeButton.click();
        await expect.poll(state, { timeout: 20000 }).toBe(1);
        await expect.poll(position, { timeout: 5000 }).toBeGreaterThanOrEqual(resumePosition);
        assert((await position()) < resumePosition + 10, 'The real provider must resume near the saved position');
        assert.equal(await resumedIframe.getAttribute('src'), resumeSource, 'Resume commands must not reload the iframe');
        assert(await resumedHandle.evaluate(element => element.isConnected && element === document.querySelector('iframe[src*="youtube-nocookie.com/embed/"]')));
        if (evidence) await page.screenshot({ path: path.join(evidence, 'phase8-authenticated-watch-tracking.png'), fullPage: false });
        report.cases.push({ name: 'Canonical real playback saves owned server-confirmed history, pause excludes time and reload resumes without heartbeat reload', status: 'passed', videoId: video.videoId, createdRowId, savedSeconds: stopped.watch_duration_seconds, savedPositionSeconds: stopped.progress_seconds, resumeStart: resumePosition });
    } catch (error) {
        await diagnostics('qualification-failure', error);
        throw error;
    } finally {
        // Stop the task's player before removing only its previously absent row.
        await page.goto(`${base}/hub/video-library`, { waitUntil: 'domcontentloaded' });
        await expect.poll(() => pendingWrites.size, { timeout: 20000 }).toBe(0);
        const row = await readRow();
        if (row) {
            assert(!alreadyWatched.has(row.video_id) && row.user_id === ownerId && row.video_id === video.videoId);
            if (createdRowId) assert.equal(row.id, createdRowId);
            assert(row.watch_duration_seconds < 300, 'This bounded playback qualification must not cross reward eligibility');
            checked(await client.from('video_watch_history').delete().eq('id', row.id).eq('user_id', ownerId).eq('video_id', video.videoId).select('id'));
            assert.equal(await readRow(), null);
        }
        assert.deepEqual(await readFinancialSnapshot(ownerId), financialBefore, 'Watch qualification must leave authoritative rewards and balance unchanged');
        report.trackingFixtureRemoved = true;
        page.off('request', watchWrite);
        page.off('requestfinished', finishedWrite);
        page.off('requestfailed', finishedWrite);
    }
}
