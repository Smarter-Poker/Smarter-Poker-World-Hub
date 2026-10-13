// Explicit manual release proof using configured dedicated CI authentication.
// Only its uniquely named playlist is written; no rewards or social posts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import { isDedicatedProbeAccount } from '../../src/lib/probeIdentity.js';
import { runPhase6Social } from './videoLibraryPhase6Social.mjs';
const base = 'https://smarter.poker';
const expected = process.env.VIDEO_PHASE6_EXPECTED_REVISION;
assert.match(expected || '', /^[0-9a-f]{40}$/);
const evidence = process.env.VIDEO_PHASE6_LIVE_EVIDENCE_DIR;
assert(evidence && path.isAbsolute(evidence), 'An explicit evidence directory is required');
fs.mkdirSync(evidence, { recursive: true });
const email = String(process.env.TEST_USER_EMAIL || '').trim();
assert(isDedicatedProbeAccount(email), 'Use the configured dedicated probe or platform service identity');
assert(process.env.TEST_USER_PASSWORD, 'Existing CI test authentication is required');
assert(process.env.SUPABASE_SERVICE_ROLE_KEY, 'Configured read-only ledger qualification access is required');
const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const ledgerClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const report = { startedAt: new Date().toISOString(), base, expectedRevision: expected, mockedRequests: false, financialWrites: false, cases: [], status: 'running' };
let session, ownerId, browser, playlistId, page;
const crashes = [], playlistResponses = [], pendingDiagnostics = new Set();
const safeText = value => {
    let text = String(value || '').slice(0, 8000);
    for (const secret of [process.env.TEST_USER_PASSWORD, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, process.env.SUPABASE_SERVICE_ROLE_KEY, session?.access_token, session?.refresh_token]) if (secret) text = text.split(secret).join('[redacted]');
    return text.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted]').slice(0, 4000);
};
const playlistName = `Phase 6 Live Qualification ${randomUUID()}`;
const pass = (name, observations = {}) => report.cases.push({ name, status: 'passed', ...observations });
async function request(route, authenticated = true) {
    const response = await fetch(`${base}${route}`, { signal: AbortSignal.timeout(20000), headers: authenticated ? { Authorization: `Bearer ${session.access_token}` } : {} });
    return { status: response.status, payload: await response.json() };
}
async function order() {
    const result = await client.from('video_playlist_items').select('video_id,sort_order,created_at,id').eq('playlist_id', playlistId).order('sort_order').order('created_at').order('id');
    assert(!result.error, 'Own playlist read must succeed'); return result.data.map(item => item.video_id);
}
try {
    const health = (await request('/api/health', false)).payload;
    assert.equal(health.commitSha, expected); report.health = health; pass('Exact published serving identity');
    const login = await client.auth.signInWithPassword({ email, password: process.env.TEST_USER_PASSWORD });
    assert(!login.error && login.data?.session, 'Configured authentication must succeed');
    session = login.data.session; ownerId = login.data.user.id;
    const verified = await client.auth.getUser(session.access_token);
    assert(!verified.error && verified.data.user.id === ownerId && verified.data.user.email.toLowerCase() === email.toLowerCase(), 'Verified configured identity must agree');
    const profile = await client.from('profiles').select('id,display_name,role').eq('id', ownerId).maybeSingle();
    assert(!profile.error && profile.data, 'Dedicated profile must exist');
    if (!email.toLowerCase().endsWith('@probe.smarter.poker')) assert(profile.data.display_name === 'Smarter.Poker Official' && profile.data.role === 'god', 'Service profile must be the canonical official identity');
    report.ownerId = ownerId; pass('Dedicated configured identity verified');
    const study = await request(`/api/video-library/study-status?ownerId=${ownerId}`);
    assert.equal(study.status, 200); assert.equal(study.payload.ownerId, ownerId); assert.equal(study.payload.data.basis, 'rewarded_video_watch_days');
    const rows = await ledgerClient.from('diamond_transactions').select('amount,created_at').eq('user_id', ownerId).eq('transaction_type', 'video_watch').gt('amount', 0).gte('created_at', new Date(Date.parse(study.payload.data.asOf) - 400 * 86400000).toISOString()).order('created_at', { ascending: false }).limit(2000);
    assert(!rows.error && rows.data.length < 2000, 'Authoritative reward ledger must be readable and complete');
    const day = value => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
    const observedAt = new Date(study.payload.data.asOf), today = day(observedAt);
    const actualRows = rows.data.filter(row => Date.parse(row.created_at) <= Number(observedAt));
    const actualDays = new Set(actualRows.map(row => day(row.created_at)));
    assert.equal(study.payload.data.diamondsToday, actualRows.filter(row => day(row.created_at) === today).reduce((sum, row) => sum + Number(row.amount), 0));
    const cursor = new Date(`${today}T12:00:00Z`); if (!actualDays.has(today)) cursor.setUTCDate(cursor.getUTCDate() - 1);
    let streak = 0; while (streak < 366 && actualDays.has(cursor.toISOString().slice(0, 10))) { streak += 1; cursor.setUTCDate(cursor.getUTCDate() - 1); }
    assert.equal(study.payload.data.currentStreak, streak);
    assert.equal((await request('/api/video-library/study-status', false)).status, 401);
    assert.equal((await request('/api/video-library/study-status?ownerId=11111111-1111-4111-8111-111111111111')).status, 409);
    pass('Read-only study status agrees with actual owner reward ledger and refuses wrong owner', { currentStreak: streak, diamondsToday: study.payload.data.diamondsToday });
    const discovery = await request(`/api/video-library/discovery?mode=recommended&ownerId=${ownerId}`);
    assert.equal(discovery.status, 200); assert.equal(discovery.payload.success, true); assert.equal(discovery.payload.ownerId, ownerId);
    assert.equal(typeof discovery.payload.ranking.personalized, 'boolean'); assert.equal(discovery.payload.ranking.coldStart, !discovery.payload.ranking.personalized);
    assert.equal((await request('/api/video-library/discovery?mode=recommended&ownerId=11111111-1111-4111-8111-111111111111')).status, 409);
    pass('Published recommended discovery identifies owner and truthful personalization basis', { videos: discovery.payload.data.length, ranking: discovery.payload.ranking });
    const catalog = await request('/api/video-library/catalog?source=HCL&limit=30', false);
    assert.equal(catalog.status, 200); assert(catalog.payload.success && catalog.payload.data.length >= 2, 'Two actual eligible public videos are required');
    const videos = catalog.payload.data.slice(0, 2); const ids = videos.map(video => video.videoId);
    assert.equal(new Set(ids).size, 2);
    // Allocate the operation identity before the possible write. A lost create
    // acknowledgment still leaves an exact task-owned cleanup target.
    playlistId = randomUUID();
    const created = await client.from('video_playlists').insert([{ id: playlistId, user_id: ownerId, name: playlistName }]).select('id,user_id,name').maybeSingle();
    assert(!created.error && created.data?.id === playlistId && created.data.user_id === ownerId && created.data.name === playlistName, 'Own task playlist creation must succeed');
    for (const video of videos) { const added = await client.rpc('fn_append_video_playlist', { p_playlist_id: playlistId, p_video_id: video.videoId, p_title: video.title, p_source: video.source }); assert(!added.error && added.data === true, 'Normal playlist append must succeed'); }
    assert.deepEqual(await order(), ids); pass('Own task playlist contains two actual catalog videos', { playlistId, videoIds: ids });
    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 393, height: 852 }, serviceWorkers: 'block' });
    await context.addInitScript(({ authSession }) => localStorage.setItem('smarter-poker-auth', JSON.stringify(authSession)), { authSession: session });
    page = await context.newPage(); page.on('pageerror', error => { if (crashes.length < 30) crashes.push(safeText(error.message)); });
    page.on('response', response => {
        const pathname = new URL(response.url()).pathname;
        if (!/^\/rest\/v1\/(?:video_playlists|video_playlist_items|rpc\/fn_(?:append|reorder)_video_playlist)$/.test(pathname) || playlistResponses.length >= 50) return;
        const observation = { status: response.status(), pathname };
        playlistResponses.push(observation);
        if (response.status() < 400) return;
        const diagnostic = (async () => {
            try {
                const body = await response.json();
                const error = body?.error && typeof body.error === 'object' ? body.error : body;
                if (typeof error?.message === 'string') observation.errorMessage = safeText(error.message);
                if (typeof error?.code === 'string') observation.errorCode = safeText(error.code).slice(0, 80);
            } catch { observation.errorBodyUnreadable = true; }
        })();
        pendingDiagnostics.add(diagnostic); diagnostic.finally(() => pendingDiagnostics.delete(diagnostic));
    });
    await page.goto(`${base}/hub/video-library`, { waitUntil: 'domcontentloaded' });
    const statusPanel = page.getByRole('region', { name: 'Diamond Study Streak', exact: true });
    await statusPanel.getByText(`${study.payload.data.diamondsToday} Diamonds Earned From Videos Today`, { exact: true }).waitFor({ timeout: 30000 });
    const recommendedRead = page.waitForResponse(response => response.url().includes('/api/video-library/discovery') && new URL(response.url()).searchParams.get('mode') === 'recommended');
    await page.getByRole('button', { name: /^Recommended For You/ }).first().click();
    const recommendedResponse = await recommendedRead;
    assert.equal(recommendedResponse.status(), 200); assert.equal(new URL(recommendedResponse.url()).searchParams.has('q'), false);
    assert.equal((await recommendedResponse.json()).ownerId, ownerId);
    await page.waitForURL(url => url.searchParams.get('filter') === 'recommended');
    await page.screenshot({ path: path.join(evidence, 'phase6-authenticated-recommended-393.png') });
    pass('Native authenticated study credits and Recommended For You use published owner-scoped data');
    const playlistUrl = `${base}/hub/video-library/playlists/${playlistId}`;
    await page.goto(playlistUrl, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: playlistName, exact: true }).waitFor({ timeout: 30000 });
    await page.getByRole('button', { name: 'Move Video 2 Up', exact: true }).click();
    await page.getByText('Playlist Order Saved.', { exact: true }).waitFor();
    assert.deepEqual(await order(), [...ids].reverse());
    const stale = await client.rpc('fn_reorder_video_playlist', { p_playlist_id: playlistId, p_expected_video_ids: ids, p_video_ids: ids }).abortSignal(AbortSignal.timeout(20000));
    report.staleWriteResponse = {
        status: stale.status,
        statusText: safeText(stale.statusText),
        error: stale.error ? {
            code: safeText(stale.error.code), message: safeText(stale.error.message),
            details: safeText(stale.error.details), hint: safeText(stale.error.hint),
        } : null,
    };
    assert.equal(stale.status, 409); assert.equal(stale.error?.code, 'PT409'); assert.deepEqual(await order(), [...ids].reverse());
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.getByRole('button', { name: 'Play All', exact: true }).waitFor();
    assert((await page.locator('.vl-playlist-video-row').first().innerText()).includes(videos[1].title));
    pass('Native reorder persists after reload and stale compare-and-swap cannot overwrite it');
    await page.getByRole('button', { name: 'Play All', exact: true }).click();
    await page.waitForURL(url => url.pathname.includes(`/watch/${ids[1]}`));
    const readQueue = () => page.evaluate(() => JSON.parse(sessionStorage.getItem('video-library-session-queue-v1')));
    let queue = await readQueue(); assert.equal(queue.ownerId, ownerId); assert.deepEqual(queue.items.map(item => item.videoId), [...ids].reverse());
    await page.reload({ waitUntil: 'domcontentloaded' });
    const next = page.getByRole('region', { name: 'Session Queue', exact: true }).getByRole('button', { name: videos[0].title, exact: true });
    await next.waitFor({ timeout: 30000 }); await next.click(); await page.waitForURL(url => url.pathname.includes(`/watch/${ids[0]}`));
    pass('Play All and native queued next navigation retain same-session playlist order');
    await page.goto(playlistUrl, { waitUntil: 'domcontentloaded' }); await page.getByRole('button', { name: 'Shuffle', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Shuffle', exact: true }).click(); await page.waitForURL(url => url.pathname.includes('/hub/video-library/watch/'));
    queue = await readQueue(); assert.deepEqual(queue.items.map(item => item.videoId).sort(), [...ids].sort()); assert.equal(new Set(queue.items.map(item => item.videoId)).size, 2); assert(page.url().includes(`/watch/${queue.currentId}`));
    await page.screenshot({ path: path.join(evidence, 'phase6-authenticated-queue-393.png') });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
    assert.deepEqual(crashes, []); pass('Native shuffle preserves every unique playlist item and opens its queued first video');
    report.social = await runPhase6Social(page, context, videos[0], report, evidence);
    const finalHealth = (await request('/api/health', false)).payload; assert.equal(finalHealth.commitSha, expected); report.finalHealth = finalHealth;
    report.status = 'passed';
} catch (error) {
    report.status = 'failed'; report.error = safeText(error.message); process.exitCode = 1;
    report.pageErrors = crashes;
    if (page && !page.isClosed()) {
        try {
            const url = new URL(page.url()); report.failurePageUrl = `${url.origin}${url.pathname}`;
            report.failureVisibleText = safeText(await page.locator('body').innerText({ timeout: 3000 }));
        } catch { report.failurePageTextUnavailable = true; }
        try { await page.screenshot({ path: path.join(evidence, 'phase6-authenticated-failure.png'), fullPage: false, timeout: 5000 }); }
        catch { report.failureScreenshotUnavailable = true; }
    }
    let deadline;
    await Promise.race([Promise.allSettled([...pendingDiagnostics]), new Promise(resolve => { deadline = setTimeout(resolve, 2000); })]);
    clearTimeout(deadline);
    report.playlistNetworkResponses = playlistResponses;
}
finally {
    if (browser) { try { await browser.close(); } catch { report.browserCleanupError = 'Browser Close Could Not Be Confirmed'; } }
    if (playlistId && ownerId) {
        try {
            const deleted = await client.from('video_playlists').delete().eq('id', playlistId).eq('user_id', ownerId).eq('name', playlistName); assert(!deleted.error);
            const remaining = await client.from('video_playlists').select('id').eq('id', playlistId).maybeSingle(); assert(!remaining.error && !remaining.data);
            const orphan = await client.from('video_playlist_items').select('id').eq('playlist_id', playlistId); assert(!orphan.error && orphan.data.length === 0); report.playlistRemoved = true;
        } catch { report.playlistRemoved = false; report.status = 'failed'; report.cleanupError = 'Task Playlist Cleanup Could Not Be Verified'; process.exitCode = 1; }
    }
    if (session) await client.auth.signOut({ scope: 'local' });
    report.completedAt = new Date().toISOString();
    fs.writeFileSync(path.join(evidence, 'phase6-live-authenticated.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ status: report.status, cases: report.cases.length, playlistRemoved: report.playlistRemoved, error: report.error, cleanupError: report.cleanupError }));
}
