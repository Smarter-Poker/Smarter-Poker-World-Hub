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
 *   idle  - a controlled page; hidden and shown once after the deploy, which
 *           is what makes it look for the new worker;
 *   draft - Messenger with a typed, unsent reply in the composer;
 *   call  - a page in a connected call with a throwaway caller.
 *
 * Passes only if the idle page takes the update, the draft and call pages do
 * NOT reload while the text or the call exists (and the call stays connected),
 * each reloads once its text is cleared or its call ends, and a call still
 * rings afterwards. Every deploy that lands during the run is logged.
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
            decisions: (() => { try { return JSON.parse(sessionStorage.getItem('sp_sw_decisions') || '[]').map(d => d.decision); } catch { return null; } })(),
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
        browser = await chromium.launch({ headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
        const ctx = await browser.newContext({ ...devices['Pixel 7'] });
        await ctx.grantPermissions(['camera', 'microphone'], { origin: APP_ORIGIN });
        await ctx.addInitScript(({ s }) => {
            localStorage.setItem('smarter-poker-auth', JSON.stringify(s));
            localStorage.setItem(`sp_firstrun_notif_v2_${s.user.id}`, String(Date.now()));
            sessionStorage.setItem('social-intro-seen', 'true');
        }, { s: C.session });
        await ctx.addInitScript(VISIBILITY_SHIM);

        // Every production deploy during the run, not only the first
        // (run 41252779970 missed ae604417 landing four minutes after 9461f04f).
        let lastSha = oldSha;
        report.deploys = [];
        const deployWatch = setInterval(async () => {
            const sha = await health().catch(() => null);
            if (sha && sha !== lastSha) { lastSha = sha; report.deploys.push({ at: new Date().toISOString(), sha }); log('deploy', { sha }); }
        }, 15000);

        const reloads = {};
        const open = async (label, path) => {
            const page = await ctx.newPage();
            page.setDefaultTimeout(20000);
            await page.goto(`${APP_ORIGIN}${path}`, { waitUntil: 'domcontentloaded' });
            await until(async () => (await snapshot(page)).worker?.active === 'activated', { timeout: 60000 }).catch(() => {});
            await page.reload({ waitUntil: 'domcontentloaded' });
            await until(async () => (await snapshot(page)).controlled, { timeout: 30000 }).catch(() => {});
            reloads[label] = 0;
            page.on('framenavigated', frame => { if (frame === page.mainFrame()) { reloads[label] += 1; log('navigated', { page: label, url: frame.url() }); } });
            report.pages[label] = { before: await snapshot(page) };
            return page;
        };
        const idle = await open('idle', '/hub/leaderboards');
        const draft = await open('draft', `/hub/messenger?conversation=${conversationId}`);
        const callPage = await open('call', '/hub/friends');
        const composer = draft.locator('textarea').first();
        await composer.waitFor({ timeout: 60000 });
        await composer.fill('Half written reply that must survive an update');
        log('opened', { pages: Object.keys(report.pages) });

        // Caller in its own context places a call the call page answers.
        const callerCtx = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
        await callerCtx.grantPermissions(['camera', 'microphone'], { origin: APP_ORIGIN });
        await callerCtx.addInitScript(({ s }) => { localStorage.setItem('smarter-poker-auth', JSON.stringify(s)); localStorage.setItem(`sp_firstrun_notif_v2_${s.user.id}`, String(Date.now())); }, { s: B.session });
        const caller = await callerCtx.newPage();
        await caller.goto(`${APP_ORIGIN}/hub/messenger?conversation=${conversationId}`, { waitUntil: 'domcontentloaded' });
        await caller.getByLabel('Start Video Call', { exact: true }).waitFor({ timeout: 60000 });

        // Wait for the next production deployment.
        const deadline = Date.now() + waitMinutes * 60000;
        while (Date.now() < deadline && !report.deploys.length) await sleep(10000);
        if (!report.deploys.length) throw new Error(`No new production revision within ${waitMinutes} minutes`);
        report.newSha = report.deploys[0].sha;

        // Put the call page into a live call, then let the idle page find the
        // new worker by being hidden and shown (the visibility re-check).
        await caller.getByLabel('Start Video Call', { exact: true }).click();
        await until(() => incomingOpen(callPage), { timeout: 30000 });
        await callPage.getByRole('button', { name: 'Accept Call', exact: true }).click();
        await until(async () => (await callPage.locator('[role="dialog"][aria-label*="Call With"]').count()) > 0, { timeout: 30000 });
        await sleep(8000);
        const t = label => report.pages[label].before.timeOrigin;
        const origin = async page => (await snapshot(page)).timeOrigin;
        await idle.evaluate(() => window.__spSetVisibility('hidden'));
        await sleep(2000);
        await idle.evaluate(() => window.__spSetVisibility('visible'));
        const idleReloaded = await until(async () => (await origin(idle)) !== t('idle'), { timeout: 150000 }).then(() => true, () => false);
        await sleep(20000);
        report.whileHeld = {
            idleReloaded,
            draftKept: (await origin(draft)) === t('draft') && (await composer.inputValue().catch(() => null)) === 'Half written reply that must survive an update',
            callKept: (await origin(callPage)) === t('call') && (await callPage.locator('[role="dialog"][aria-label*="Call With"]').count()) > 0,
            callerStillConnected: await callOpen(caller),
        };
        report.whileHeld.decisions = { idle: (await snapshot(idle)).decisions, draft: (await snapshot(draft)).decisions, call: (await snapshot(callPage)).decisions };
        log('held', report.whileHeld);

        // End the call: the call page should now take the update.
        await caller.getByLabel('End Call', { exact: true }).first().click().catch(() => {});
        report.callPageReloadedAfterHangUp = await until(async () => (await origin(callPage)) !== t('call'), { timeout: 40000 }).then(() => true, () => false);
        // Clear the draft: the draft page should now take the update.
        await composer.fill('');
        report.draftPageReloadedAfterClearing = await until(async () => (await origin(draft)) !== t('draft'), { timeout: 40000 }).then(() => true, () => false);
        report.ringAfterUpdate = await (async () => {
            await caller.getByLabel('Start Video Call', { exact: true }).click().catch(() => {});
            const rang = await until(() => incomingOpen(callPage), { timeout: 30000 }).then(() => true, () => false);
            await caller.getByLabel('End Call', { exact: true }).first().click().catch(() => {});
            return rang;
        })();
        for (const [label, page] of Object.entries({ idle, draft, call: callPage })) {
            report.pages[label].after = await snapshot(page);
            report.pages[label].reloads = reloads[label];
        }
        clearInterval(deployWatch);
        report.status = report.whileHeld.idleReloaded && report.whileHeld.draftKept && report.whileHeld.callKept && report.whileHeld.callerStillConnected
            && report.callPageReloadedAfterHangUp && report.draftPageReloadedAfterClearing && report.ringAfterUpdate ? 'passed' : 'failed';
        log('done', { status: report.status, callPageReloadedAfterHangUp: report.callPageReloadedAfterHangUp, draftPageReloadedAfterClearing: report.draftPageReloadedAfterClearing, ringAfterUpdate: report.ringAfterUpdate });
    } catch (error) {
        report.error = String(error?.message || error).slice(0, 300);
        console.log(`ERROR ${report.error}`);
    } finally {
        await browser?.close().catch(() => {});
        report.cleanup = await cleanup(sb.admin, created);
        report.finishedAt = new Date().toISOString();
        writeFileSync(`${RESULT_DIR}/result.json`, JSON.stringify(report, null, 2));
    }
    if (report.error || report.status !== 'passed' || cleanupFailed(report.cleanup)) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    if (process.argv.includes('--self-test')) {
        assert.match(VISIBILITY_SHIM, /__spSetVisibility/);
        console.log('messenger-calls-upgrade self-test passed');
    } else {
        await main();
    }
}
