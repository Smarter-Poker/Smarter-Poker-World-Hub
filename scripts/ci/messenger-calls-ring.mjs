#!/usr/bin/env node
/*
 * Ring-everywhere verification (suite messenger-calls-ring).
 *
 * Dan, 2026-10-31: "THE ONLY TIME ANYTHING APPEARS IS ONLY IF YOU ARE INSIDE
 * THE MESSENGER WHILE THE CALL IS RINGING, ZERO NOTIFICATIONS ANYWHERE ELSE".
 *
 * Throwaway B calls throwaway C while C sits on pages OUTSIDE Messenger, with
 * service workers ALLOWED (real devices run the app's caching worker; the
 * other suites block it), on a phone-sized Chromium and on WebKit 27.2
 * (Playwright 1.64.1). For each page it checks that the full-screen ringing
 * call appears and that the callee's bell holds the ringing call; then C
 * declines and the bell row is confirmed cleared. Only throwaway example.com
 * users take part; everything is hard-deleted.
 */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
    APP_ORIGIN, sleep, until, clients, assertLiveRevision, createProbeUser, createConversation,
    cleanup, cleanupFailed, incomingOpen,
} from './messenger-calls-lib.mjs';

const RESULT_DIR = 'test-results/messenger-calls-ring';
export const PAGES = ['/hub', '/hub/social-media', '/hub/notifications', '/hub/friends', '/hub/settings', '/hub/leaderboards'];

async function phone(browser, session, device) {
    // serviceWorkers allowed on purpose: this is the condition real phones run in.
    const context = await browser.newContext({ ...device });
    await context.addInitScript(({ s }) => {
        localStorage.setItem('smarter-poker-auth', JSON.stringify(s));
        localStorage.setItem(`sp_firstrun_notif_v2_${s.user.id}`, String(Date.now()));
        sessionStorage.setItem('social-intro-seen', 'true');
    }, { s: session });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    return { context, page };
}

async function main() {
    for (const name of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'MESSENGER_EXPECTED_SHA']) assert.ok(process.env[name]?.trim(), `${name} is required`);
    mkdirSync(RESULT_DIR, { recursive: true });
    const report = { suite: 'messenger-calls-ring', startedAt: new Date().toISOString(), runs: [], cleanup: null };
    const created = { users: [], conversations: [] };
    const sb = await clients();
    const { admin } = sb;
    const browsers = [];
    try {
        report.health = await assertLiveRevision();
        const B = await createProbeUser(sb, created, 'rgb', 'Ring Verification Caller');
        const C = await createProbeUser(sb, created, 'rgc', 'Ring Verification Callee');
        const conversationId = await createConversation(admin, created, B.id, C.id, { senderId: C.id, content: 'Ring Verification Thread' });

        const { chromium, devices } = await import('playwright');
        const chrome = await chromium.launch({ headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
        browsers.push(chrome);
        const callerContext = await chrome.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
        await callerContext.grantPermissions(['camera', 'microphone'], { origin: APP_ORIGIN });
        await callerContext.addInitScript(({ s }) => { localStorage.setItem('smarter-poker-auth', JSON.stringify(s)); localStorage.setItem(`sp_firstrun_notif_v2_${s.user.id}`, String(Date.now())); }, { s: B.session });
        const caller = await callerContext.newPage();
        caller.setDefaultTimeout(20000);
        await caller.goto(`${APP_ORIGIN}/hub/messenger?conversation=${conversationId}`, { waitUntil: 'domcontentloaded' });
        await caller.getByLabel('Start Video Call', { exact: true }).waitFor({ timeout: 60000 });

        const targets = [{ label: 'Chromium Pixel 7', browser: chrome, device: devices['Pixel 7'] }];
        if (process.env.PLAYWRIGHT_WEBKIT_MODULE) {
            const pw = await import(pathToFileURL(process.env.PLAYWRIGHT_WEBKIT_MODULE).href);
            const wk = await pw.webkit.launch({ headless: true });
            browsers.push(wk);
            targets.push({ label: `WebKit ${wk.version()} iPhone 13`, browser: wk, device: pw.devices['iPhone 13'] });
        }

        for (const target of targets) {
            const { context, page } = await phone(target.browser, C.session, target.device);
            const run = { device: target.label, userAgent: null, pages: [] };
            report.runs.push(run);
            for (const path of PAGES) {
                const entry = { path };
                run.pages.push(entry);
                try {
                    await page.goto(`${APP_ORIGIN}${path}`, { waitUntil: 'domcontentloaded' });
                    run.userAgent ||= await page.evaluate(() => navigator.userAgent);
                    await sleep(6000); // realtime listeners joined, service worker registered
                    entry.landedOn = new URL(page.url()).pathname;
                    entry.serviceWorker = await page.evaluate(async () => { try { const r = await navigator.serviceWorker?.getRegistration('/'); return r ? (r.active ? 'active' : r.installing ? 'installing' : 'waiting') : 'none'; } catch { return 'error'; } });
                    const t0 = new Date().toISOString();
                    await caller.getByLabel('Start Video Call', { exact: true }).click();
                    const rangAt = await until(() => incomingOpen(page), { timeout: 15000 }).then(() => Date.now(), () => null);
                    entry.rang = Boolean(rangAt);
                    const { data: bell } = await admin.from('notifications').select('id, title, message').eq('user_id', C.id).eq('type', 'incoming_call').gte('created_at', t0);
                    entry.bellRow = (bell || []).length;
                    if (!entry.rang) await page.screenshot({ path: `${RESULT_DIR}/no-ring-${target.label.replace(/\W+/g, '-')}${path.replace(/\W+/g, '-')}.png` }).catch(() => {});
                    if (entry.rang) await page.getByRole('button', { name: 'Decline Call', exact: true }).click();
                    else await caller.getByLabel('End Call', { exact: true }).first().click().catch(() => {});
                    await until(async () => (await caller.locator('[role="dialog"][aria-label*="Call With"]').count()) === 0, { timeout: 20000 }).catch(() => {});
                    await sleep(3000);
                    const { data: left } = await admin.from('notifications').select('id').eq('user_id', C.id).eq('type', 'incoming_call').gte('created_at', t0);
                    entry.bellRowAfterDecline = (left || []).length;
                } catch (error) {
                    entry.error = String(error?.message || error).slice(0, 200);
                }
                console.log(`${entry.rang ? 'RANG' : 'NO RING'} ${target.label} ${path} bell=${entry.bellRow} after=${entry.bellRowAfterDecline} sw=${entry.serviceWorker}${entry.error ? ` error=${entry.error}` : ''}`);
                await sleep(2000);
            }
            await context.close();
        }
    } catch (error) {
        report.error = String(error?.message || error).slice(0, 300);
    } finally {
        for (const browser of browsers) await browser.close().catch(() => {});
        report.cleanup = await cleanup(admin, created);
        report.finishedAt = new Date().toISOString();
        const all = report.runs.flatMap(r => r.pages);
        report.status = !report.error && all.length && all.every(p => p.rang && p.bellRow >= 1 && p.bellRowAfterDecline === 0) ? 'passed' : 'failed';
        writeFileSync(`${RESULT_DIR}/result.json`, JSON.stringify(report, null, 2));
        console.log(JSON.stringify({ status: report.status, cleanup: report.cleanup, error: report.error }, null, 2));
    }
    if (report.status !== 'passed' || cleanupFailed(report.cleanup)) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    if (process.argv.includes('--self-test')) {
        assert.ok(PAGES.length >= 5 && PAGES.every(p => p.startsWith('/hub') && !p.includes('messenger')));
        console.log('messenger-calls-ring self-test passed');
    } else {
        await main();
    }
}
