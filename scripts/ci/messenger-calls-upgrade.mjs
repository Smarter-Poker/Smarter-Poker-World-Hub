#!/usr/bin/env node
/*
 * Old-to-new client upgrade observation (suite messenger-calls-upgrade).
 *
 * Vercel deployment URLs sit behind SSO, so two builds cannot be put on one
 * test origin without a protection-bypass credential. Instead this watches a
 * REAL upgrade on the real origin: it opens the app on the build that is live
 * now (MESSENGER_EXPECTED_SHA), with the service worker in control, keeps
 * those pages open while the next production deployment lands, and records
 * what each open page does:
 *
 *   idle      - a controlled page nobody touches;
 *   resumed   - a controlled page that is hidden and shown again every minute
 *               (what an installed phone app does when it is backgrounded);
 *   after the deploy: the build each page runs, service worker updates,
 *   reloads, a client-side navigation, a fresh page load, and whether a call
 *   still rings on each open page.
 *
 * Throwaway example.com users only. Read-only towards production apart from
 * the throwaway call it places.
 */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
    APP_ORIGIN, sleep, until, clients, createProbeUser, createConversation, cleanup, cleanupFailed, incomingOpen, callOpen,
} from './messenger-calls-lib.mjs';

const RESULT_DIR = 'test-results/messenger-calls-upgrade';

const health = async () => (await (await fetch(`${APP_ORIGIN}/api/health`, { cache: 'no-store', signal: AbortSignal.timeout(15000) })).json()).commitSha;

// Visibility the way a backgrounded installed app reports it.
export const VISIBILITY_SHIM = `(() => {
    let state = 'visible';
    Object.defineProperty(document, 'visibilityState', { get: () => state, configurable: true });
    Object.defineProperty(document, 'hidden', { get: () => state === 'hidden', configurable: true });
    window.__spSetVisibility = next => { state = next; document.dispatchEvent(new Event('visibilitychange')); };
})();`;

async function snapshot(page) {
    return page.evaluate(async () => {
        const reg = await navigator.serviceWorker.getRegistration('/').catch(() => null);
        // __NEXT_DATA__.buildId is the same string on every release (measured
        // 2026-10-31: build-TfctsWXpff2fKS on 037dcf17 and on 1e8650c8), so the
        // loaded _app chunk URL identifies the build and timeOrigin identifies
        // a real document load (a reload changes it, a client route does not).
        // Next 16 loads _app through the runtime, not a <script src>, so read
        // the chunk the document actually fetched (run 41250843386 read null).
        const app = performance.getEntriesByType('resource').map(e => e.name).find(n => /\/pages\/_app-[^/]+\.js$/.test(n)) || null;
        return {
            appChunk: app ? app.split('/').pop() : null,
            timeOrigin: Math.round(performance.timeOrigin),
            buildId: window.__NEXT_DATA__?.buildId || null,
            controlled: Boolean(navigator.serviceWorker.controller),
            worker: { active: reg?.active?.state || null, waiting: Boolean(reg?.waiting), installing: Boolean(reg?.installing) },
            path: location.pathname,
        };
    }).catch(error => ({ error: String(error?.message || error).slice(0, 120) }));
}

async function main() {
    for (const name of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'MESSENGER_EXPECTED_SHA']) assert.ok(process.env[name]?.trim(), `${name} is required`);
    const oldSha = process.env.MESSENGER_EXPECTED_SHA;
    const waitMinutes = Math.min(Math.max(Number(process.env.UPGRADE_WAIT_MINUTES) || 60, 5), 150);
    mkdirSync(RESULT_DIR, { recursive: true });
    const report = { suite: 'messenger-calls-upgrade', startedAt: new Date().toISOString(), oldSha, pages: {}, timeline: [], cleanup: null };
    const log = (event, detail = {}) => { const entry = { at: new Date().toISOString(), event, ...detail }; report.timeline.push(entry); console.log(JSON.stringify(entry)); };
    const created = { users: [], conversations: [] };
    const sb = await clients();
    let browser;
    try {
        const live = await health();
        assert.equal(live, oldSha, `Live revision is ${live}, not the expected old revision`);
        const B = await createProbeUser(sb, created, 'upb', 'Upgrade Verification Caller');
        const C = await createProbeUser(sb, created, 'upc', 'Upgrade Verification Callee');
        const conversationId = await createConversation(sb.admin, created, B.id, C.id, { senderId: C.id, content: 'Upgrade Verification Thread' });

        const { chromium, devices } = await import('playwright');
        browser = await chromium.launch({ headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
        const ctx = await browser.newContext({ ...devices['Pixel 7'] });
        await ctx.addInitScript(({ s }) => {
            localStorage.setItem('smarter-poker-auth', JSON.stringify(s));
            localStorage.setItem(`sp_firstrun_notif_v2_${s.user.id}`, String(Date.now()));
            sessionStorage.setItem('social-intro-seen', 'true');
        }, { s: C.session });
        await ctx.addInitScript(VISIBILITY_SHIM);
        const reloads = { idle: 0, resumed: 0 };
        const open = async (label, path) => {
            const page = await ctx.newPage();
            page.setDefaultTimeout(20000);
            await page.goto(`${APP_ORIGIN}${path}`, { waitUntil: 'domcontentloaded' });
            await until(async () => (await snapshot(page)).worker?.active === 'activated', { timeout: 60000 }).catch(() => {});
            // Reload once so the page is controlled, as an installed app is.
            await page.reload({ waitUntil: 'domcontentloaded' });
            await until(async () => (await snapshot(page)).controlled, { timeout: 30000 }).catch(() => {});
            page.on('framenavigated', frame => { if (frame === page.mainFrame()) { reloads[label] += 1; log('navigated', { page: label, url: frame.url() }); } });
            report.pages[label] = { before: await snapshot(page) };
            return page;
        };
        const idle = await open('idle', '/hub/friends');
        const resumed = await open('resumed', '/hub/leaderboards');
        log('opened', { idle: report.pages.idle.before, resumed: report.pages.resumed.before });

        // Wait for the next production deployment, cycling the resumed page.
        let newSha = null;
        const deadline = Date.now() + waitMinutes * 60000;
        let cycles = 0;
        while (Date.now() < deadline) {
            const sha = await health().catch(() => null);
            if (sha && sha !== oldSha) { newSha = sha; break; }
            if (++cycles % 3 === 0) {
                await resumed.evaluate(() => window.__spSetVisibility('hidden')).catch(() => {});
                await sleep(2000);
                await resumed.evaluate(() => window.__spSetVisibility('visible')).catch(() => {});
            }
            await sleep(20000);
        }
        report.newSha = newSha;
        if (!newSha) throw new Error(`No new production revision within ${waitMinutes} minutes`);
        const freshBuildId = await (async () => { const html = await (await fetch(`${APP_ORIGIN}/hub/friends`, { cache: 'no-store' })).text(); return /\/pages\/_app-([^/"]+)\.js/.exec(html) ? `_app-${/\/pages\/_app-([^/"]+)\.js/.exec(html)[1]}.js` : null; })();
        report.newBuildId = freshBuildId;
        report.oldAppChunk = report.pages.idle.before.appChunk;
        log('deployed', { newSha, newBuildId: freshBuildId });

        // Observe four minutes; the resumed page is hidden and shown each minute.
        for (let minute = 0; minute < 6; minute++) {
            await resumed.evaluate(() => window.__spSetVisibility('hidden')).catch(() => {});
            await sleep(3000);
            await resumed.evaluate(() => window.__spSetVisibility('visible')).catch(() => {});
            await sleep(57000);
            log('minute', { minute: minute + 1, idle: await snapshot(idle), resumed: await snapshot(resumed) });
        }
        for (const [label, page] of Object.entries({ idle, resumed })) {
            const after = await snapshot(page);
            report.pages[label].after = after;
            report.pages[label].reloads = reloads[label];
            report.pages[label].runsNewBuild = Boolean(freshBuildId) && after.appChunk === freshBuildId;
            report.pages[label].documentReloaded = after.timeOrigin !== report.pages[label].before.timeOrigin;
        }

        // Does a call still ring on each open page, whatever build it runs?
        const callerCtx = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
        await callerCtx.grantPermissions(['camera', 'microphone'], { origin: APP_ORIGIN });
        await callerCtx.addInitScript(({ s }) => { localStorage.setItem('smarter-poker-auth', JSON.stringify(s)); localStorage.setItem(`sp_firstrun_notif_v2_${s.user.id}`, String(Date.now())); }, { s: B.session });
        const caller = await callerCtx.newPage();
        await caller.goto(`${APP_ORIGIN}/hub/messenger?conversation=${conversationId}`, { waitUntil: 'domcontentloaded' });
        await caller.getByLabel('Start Video Call', { exact: true }).waitFor({ timeout: 60000 });
        await caller.getByLabel('Start Video Call', { exact: true }).click();
        const rang = {};
        for (const [label, page] of Object.entries({ idle, resumed })) rang[label] = await until(() => incomingOpen(page), { timeout: 20000 }).then(() => true, () => false);
        report.ringAfterDeploy = rang;
        log('ring', rang);
        await caller.getByLabel('End Call', { exact: true }).first().click().catch(() => {});
        await until(async () => !(await callOpen(caller)), { timeout: 20000 }).catch(() => {});

        // Client-side navigation on the idle page, then a fresh page.
        await idle.evaluate(() => window.next?.router?.push('/hub/settings')).catch(() => {});
        await sleep(8000);
        report.pages.idle.afterClientNavigation = await snapshot(idle);
        const fresh = await ctx.newPage();
        await fresh.goto(`${APP_ORIGIN}/hub/friends`, { waitUntil: 'domcontentloaded' });
        await sleep(5000);
        report.freshPage = await snapshot(fresh);
        report.freshPage.runsNewBuild = report.freshPage.appChunk === freshBuildId;
        log('done', { idle: report.pages.idle, resumed: report.pages.resumed, fresh: report.freshPage });
    } catch (error) {
        report.error = String(error?.message || error).slice(0, 300);
        console.log(`ERROR ${report.error}`);
    } finally {
        await browser?.close().catch(() => {});
        report.cleanup = await cleanup(sb.admin, created);
        report.finishedAt = new Date().toISOString();
        writeFileSync(`${RESULT_DIR}/result.json`, JSON.stringify(report, null, 2));
    }
    if (report.error || cleanupFailed(report.cleanup)) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    if (process.argv.includes('--self-test')) {
        assert.match(VISIBILITY_SHIM, /__spSetVisibility/);
        console.log('messenger-calls-upgrade self-test passed');
    } else {
        await main();
    }
}
