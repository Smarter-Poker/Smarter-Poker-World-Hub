#!/usr/bin/env node
/*
 * Incoming-call notification and Turn On Notifications verification
 * (suite messenger-calls-notify). Throwaway example.com users only; the
 * designated test account and real contacts are never involved.
 *
 * Evidence is kept in separate tiers and never merged:
 *   in-app ringing      - the full-screen ringing call on the callee's page;
 *   bell row            - the callee's incoming_call notifications row;
 *   server push accept  - push_outbox `sent` and the subscription's
 *                         last_used_at advanced (the push service took it);
 *   worker display      - last_receipt_at advanced and the notification is in
 *                         registration.getNotifications(): the browser's
 *                         service worker called showNotification. In headless
 *                         CI that is NOT a banner a person saw.
 *
 * Part A  Turn On Notifications in an authenticated browser: eligible (real
 *         enrolment through the menu), already enabled, denied and
 *         unsupported. Denied and unsupported are produced by overriding the
 *         browser API in an init script, and are reported as emulated.
 * Part B  Ringing outside Messenger after client-side navigation, after a
 *         network drop, while frozen (backgrounded) and offline, a missed call
 *         and an answered call: one bell row per call, the row cleared, one
 *         missed-call notice, no raw receipt notification or push.
 * Part C  The push chain for the subscription Part A created, with the
 *         callee's pages closed, then opening the notification's Accept URL.
 */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
    APP_ORIGIN, sleep, until, clients, assertLiveRevision, createProbeUser, createConversation,
    cleanup, cleanupFailed, incomingOpen, callOpen, videos,
} from './messenger-calls-lib.mjs';

const RESULT_DIR = 'test-results/messenger-calls-notify';
const MENU_BUTTON = '[aria-controls^="sp-world-command-menu"]';
const ROW = 'Turn On Notifications';
const PARTS = new Set((process.env.NOTIFY_PARTS || 'A,B,C').split(',').map(x => x.trim().toUpperCase()));
const HEADED_PUSH = process.env.NOTIFY_HEADED_PUSH === '1';
const FAKE_MEDIA = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'];

export const EMULATE_DENIED = `(() => {
    try {
        Object.defineProperty(Notification, 'permission', { get: () => 'denied', configurable: true });
        Notification.requestPermission = () => Promise.resolve('denied');
    } catch (e) { /* ignore */ }
})();`;
export const EMULATE_NO_PUSH = `(() => { try { delete window.PushManager; } catch (e) { /* ignore */ } })();`;

async function session(browser, s, options = {}, { initScript = null, media = false } = {}) {
    const context = await browser.newContext({ viewport: { width: 393, height: 852 }, ...options });
    if (media) await context.grantPermissions(['camera', 'microphone'], { origin: APP_ORIGIN });
    await context.addInitScript(({ s: sess }) => {
        localStorage.setItem('smarter-poker-auth', JSON.stringify(sess));
        localStorage.setItem(`sp_firstrun_notif_v2_${sess.user.id}`, String(Date.now()));
        sessionStorage.setItem('social-intro-seen', 'true');
    }, { s });
    if (initScript) await context.addInitScript(initScript);
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    return { context, page };
}

async function openMenu(page) {
    await page.locator(MENU_BUTTON).first().click();
    await page.locator('[role="dialog"][data-world-command-menu]').first().waitFor({ state: 'visible', timeout: 10000 });
    await sleep(2500); // the row's state is read asynchronously when the menu opens
    return page.getByRole('button', { name: new RegExp(`^${ROW}$`, 'i') });
}

async function toastText(page, pattern, timeout = 20000) {
    return until(async () => {
        const text = await page.locator('body').innerText().catch(() => '');
        const m = text.match(pattern);
        return m ? m[0] : null;
    }, { timeout, interval: 300 }).catch(() => null);
}

async function main() {
    for (const name of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'MESSENGER_EXPECTED_SHA']) assert.ok(process.env[name]?.trim(), `${name} is required`);
    mkdirSync(RESULT_DIR, { recursive: true });
    const report = { suite: 'messenger-calls-notify', startedAt: new Date().toISOString(), checks: [], cleanup: null };
    const check = (part, name, ok, evidence, extra = {}) => { report.checks.push({ part, name, ok: Boolean(ok), ...extra, evidence }); console.log(`${ok ? 'PASS' : extra.limitation ? 'LIMIT' : 'FAIL'} [${part}] ${name}`); };
    const created = { users: [], conversations: [] };
    const sb = await clients();
    const { admin } = sb;
    const browsers = [];
    let C = null;
    try {
        report.health = await assertLiveRevision();
        const B = await createProbeUser(sb, created, 'ntb', 'Notify Verification Caller');
        C = await createProbeUser(sb, created, 'ntc', 'Notify Verification Callee');
        const conversationId = await createConversation(admin, created, B.id, C.id, { senderId: C.id, content: 'Notify Verification Thread' });

        const { chromium, webkit, devices } = await import('playwright');
        const chrome = await chromium.launch({ headless: true, args: FAKE_MEDIA });
        browsers.push(chrome);
        report.browsers = { chromium: chrome.version() };

        // Caller B, desktop.
        const { page: caller } = await session(chrome, B.session, { viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' }, { media: true });
        await caller.goto(`${APP_ORIGIN}/hub/messenger?conversation=${conversationId}`, { waitUntil: 'domcontentloaded' });
        await caller.getByLabel('Start Video Call', { exact: true }).waitFor({ timeout: 60000 });
        const callerScreenClosed = () => until(async () => !(await callOpen(caller)), { timeout: 30000 }).catch(() => {});
        const placeCall = async () => { await caller.getByLabel('Start Video Call', { exact: true }).click(); return new Date().toISOString(); };
        const rows = async (type, since) => ((await admin.from('notifications').select('id, title, message, data').eq('user_id', C.id).eq('type', type).gte('created_at', since)).data || []);
        const rawReceiptAlerts = async since => ({
            notifications: ((await admin.from('notifications').select('id').eq('user_id', C.id).like('message', '%[CALL_RECEIPT]%').gte('created_at', since)).data || []).length,
            pushes: ((await admin.from('push_outbox').select('id').eq('recipient_user_id', C.id).like('body', '%[CALL_RECEIPT]%').gte('created_at', since)).data || []).length,
        });
        const receipts = async since => ((await admin.from('social_messages').select('sender_id, content').eq('conversation_id', conversationId).like('content', '[CALL_RECEIPT]%').gte('created_at', since)).data || [])
            .map(r => ({ byCaller: r.sender_id === B.id, status: JSON.parse(r.content.slice('[CALL_RECEIPT]'.length)).status }));

        // ── Part A: Turn On Notifications ────────────────────────────────
        let pushContext = null;
        let subscriptionId = null;
        if (PARTS.has('A')) try {
            // Headless Chrome registers the worker but cannot reach Google's
            // push service (run 41250392204); headed Chrome under a virtual
            // display can, when NOTIFY_HEADED_PUSH=1.
            // Run 41251100828: Playwright's grant covers `notifications` but not
            // Chrome's separate `push` permission, so subscribe() answered
            // "Registration failed - permission denied", and Playwright's
            // default --disable-background-networking keeps Chrome off Google's
            // push service. A persistent Chrome profile without that flag, with
            // `push` granted through DevTools, is a real Chrome enrolment.
            const { mkdtempSync } = await import('node:fs');
            const { tmpdir } = await import('node:os');
            const profile = mkdtempSync(`${tmpdir()}/sp-push-`);
            const pushContextPersistent = await chromium.launchPersistentContext(profile, {
                channel: 'chrome', headless: !HEADED_PUSH, args: FAKE_MEDIA, ignoreDefaultArgs: ['--disable-background-networking'], ...devices['Pixel 7'],
            });
            browsers.push(pushContextPersistent);
            report.pushBrowserMode = `${HEADED_PUSH ? 'headed' : 'headless'} Google Chrome, persistent profile, background networking on`;
            await pushContextPersistent.addInitScript(({ s: sess }) => {
                localStorage.setItem('smarter-poker-auth', JSON.stringify(sess));
                localStorage.setItem(`sp_firstrun_notif_v2_${sess.user.id}`, String(Date.now()));
                sessionStorage.setItem('social-intro-seen', 'true');
            }, { s: C.session });
            await pushContextPersistent.grantPermissions(['notifications', 'camera', 'microphone'], { origin: APP_ORIGIN });
            const eligiblePage = pushContextPersistent.pages()[0] || await pushContextPersistent.newPage();
            eligiblePage.setDefaultTimeout(20000);
            const devtools = await pushContextPersistent.newCDPSession(eligiblePage);
            report.chromePushPermission = await devtools.send('Browser.setPermission', { permission: { name: 'push', userVisibleOnly: true }, setting: 'granted', origin: APP_ORIGIN }).then(() => 'granted through DevTools', error => `not granted: ${String(error?.message || error).slice(0, 120)}`);
            report.browsers.chrome = await devtools.send('Browser.getVersion').then(v => v.product, () => null);
            const eligible = { context: pushContextPersistent, page: eligiblePage };
            pushContext = eligible.context;
            await eligible.page.goto(`${APP_ORIGIN}/hub/friends`, { waitUntil: 'domcontentloaded' });
            await sleep(4000);
            const row = await openMenu(eligible.page);
            const shown = await row.count();
            check('A', 'Eligible (Chrome, permission allowed, no subscription): the menu shows Turn On Notifications', shown > 0, { shown });
            if (shown) {
                // A toast can come and go between polls (run 41252778117 missed
                // one), so record every text node added from the tap onward.
                await eligible.page.evaluate(() => {
                    window.__spAdded = [];
                    new MutationObserver(records => records.forEach(r => r.addedNodes.forEach(n => {
                        const t = (n.textContent || '').trim();
                        if (t) window.__spAdded.push(t.slice(0, 200));
                    }))).observe(document.body, { childList: true, subtree: true });
                });
                await row.first().click();
                const seen = await until(async () => (await eligible.page.evaluate(() => window.__spAdded || [])).find(t => /Notifications Are On For This Device|Could Not Be Turned On|Are Blocked|Registration|Push Service/i.test(t)), { timeout: 50000, interval: 300 }).catch(() => null);
                const toast = seen || await toastText(eligible.page, /Notifications Are On For This Device|[^\n]*(Notifications (Are Blocked|Could Not Be Turned On)|Push Service|Registration|Not Supported|Timed Out|Failed)[^\n]*/i, 50000);
                const sub = await until(async () => (await admin.from('push_subscriptions').select('id, endpoint, transport, is_active, user_agent, created_at').eq('user_id', C.id).eq('is_active', true)).data?.[0], { timeout: 20000 }).catch(() => null);
                subscriptionId = sub?.id || null;
                const local = await eligible.page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration('/push/'); const s = await r?.pushManager.getSubscription(); return { worker: r?.active?.scriptURL || null, endpointHost: s ? new URL(s.endpoint).host : null, permission: Notification.permission }; }).catch(error => ({ error: String(error?.message || error).slice(0, 120) }));
                check('A', 'Eligible: the tap granted permission, registered a browser subscription and showed the success toast', /Are On For This Device/i.test(toast || '') && Boolean(local.endpointHost), { toast, local });
                check('A', 'Eligible: the subscription is stored server-side for this account', Boolean(sub), sub ? { endpointHost: new URL(sub.endpoint).host, transport: sub.transport } : null);
                await eligible.page.keyboard.press('Escape').catch(() => {});
                await eligible.page.reload({ waitUntil: 'domcontentloaded' });
                await sleep(4000);
                const again = await openMenu(eligible.page);
                check('A', 'Already enabled: the row is gone after enrolment', (await again.count()) === 0, null);
                await eligible.page.keyboard.press('Escape').catch(() => {});
            }
        } catch (error) {
            check('A', 'Eligible enrolment in Google Chrome', false, { error: String(error?.message || error).slice(0, 200) }, { limitation: true });
        }

        if (PARTS.has('A')) {
            const denied = await session(chrome, C.session, { ...devices['Pixel 7'] }, { initScript: EMULATE_DENIED });
            await denied.page.goto(`${APP_ORIGIN}/hub/friends`, { waitUntil: 'domcontentloaded' });
            await sleep(4000);
            const row = await openMenu(denied.page);
            const shown = await row.count();
            if (shown) await row.first().click();
            const landed = shown ? await until(async () => (new URL(denied.page.url()).pathname === '/hub/settings/notifications' ? denied.page.url() : null), { timeout: 15000 }).catch(() => null) : null;
            check('A', 'Denied (emulated Notification.permission): the row opens Settings, Notifications', shown > 0 && Boolean(landed), { shown, landed }, { emulated: true });
            await denied.context.close();
        }
        if (PARTS.has('A')) {
            const wk = await webkit.launch({ headless: true });
            browsers.push(wk);
            report.browsers.webkit = wk.version();
            const ios = await session(wk, C.session, { ...devices['iPhone 13'] }, { initScript: EMULATE_NO_PUSH });
            await ios.page.goto(`${APP_ORIGIN}/hub/friends`, { waitUntil: 'domcontentloaded' });
            await sleep(4000);
            const row = await openMenu(ios.page);
            const shown = await row.count();
            if (shown) await row.first().click();
            const landed = shown ? await until(async () => (new URL(ios.page.url()).pathname === '/hub/install' ? ios.page.url() : null), { timeout: 15000 }).catch(() => null) : null;
            check('A', 'Unsupported, iPhone Safari tab (WebKit with PushManager removed): the row opens Add To Home Screen steps', shown > 0 && Boolean(landed), { shown, landed }, { emulated: true });
            await ios.context.close();
        }
        if (PARTS.has('A')) {
            const desk = await session(chrome, C.session, { viewport: { width: 1280, height: 800 } }, { initScript: EMULATE_NO_PUSH });
            await desk.page.goto(`${APP_ORIGIN}/hub/friends`, { waitUntil: 'domcontentloaded' });
            await sleep(4000);
            const row = await openMenu(desk.page);
            check('A', 'Unsupported desktop browser (PushManager removed): no row is offered', (await row.count()) === 0, null, { emulated: true });
            await desk.context.close();
        }

        // ── Part B: ringing outside Messenger ────────────────────────────
        // Only one callee device may be open: close Part A's Chrome pages (its
        // service worker stays registered for Part C).
        // Headed Chrome quits with its last window (run 41252155283), so the
        // app page is left for about:blank: the app is closed, the browser and
        // its push worker stay up.
        if (pushContext) for (const p of pushContext.pages()) await p.goto('about:blank').catch(() => {});
        if (PARTS.has('B')) {
        const callee = await session(chrome, C.session, { ...devices['Pixel 7'] }, { media: true });
        const cdp = await callee.context.newCDPSession(callee.page);
        const ringCase = async (name, prepare, { during = null, answer = false } = {}) => {
            const extra = await prepare();
            const t0 = await placeCall();
            if (during) await during();
            const rangAt = await until(() => incomingOpen(callee.page), { timeout: 30000 }).then(() => Date.now(), () => null);
            const bell = await rows('incoming_call', t0);
            let media = null;
            if (rangAt && answer) {
                await callee.page.getByRole('button', { name: 'Accept Call', exact: true }).click();
                media = await until(async () => { const v = await videos(caller); return v.remote >= 1 ? v : null; }, { timeout: 30000 }).catch(() => null);
                await sleep(3000);
                await callee.page.getByLabel('End Call', { exact: true }).first().click().catch(() => {});
            } else if (rangAt) {
                await callee.page.getByRole('button', { name: 'Decline Call', exact: true }).click();
            } else {
                await caller.getByLabel('End Call', { exact: true }).first().click().catch(() => {});
            }
            await callerScreenClosed();
            await sleep(4000);
            const after = await rows('incoming_call', t0);
            const r = await receipts(t0);
            const raw = await rawReceiptAlerts(t0);
            check('B', name, Boolean(rangAt) && bell.length === 1 && after.length === 0 && r.length === 1 && raw.notifications === 0 && raw.pushes === 0,
                { rang: Boolean(rangAt), bellRowsWhileRinging: bell.length, bellRowsAfter: after.length, receipts: r, rawReceiptAlerts: raw, media, ...extra });
        };

        await ringCase('After client-side navigation (hub -> friends -> leaderboards): rings once, one bell row, cleared on decline', async () => {
            await callee.page.goto(`${APP_ORIGIN}/hub/friends`, { waitUntil: 'domcontentloaded' });
            await sleep(3000);
            await callee.page.evaluate(() => window.next?.router?.push('/hub/leaderboards'));
            await until(async () => new URL(callee.page.url()).pathname === '/hub/leaderboards', { timeout: 15000 });
            await sleep(4000);
            return { path: new URL(callee.page.url()).pathname, fullReloads: 0 };
        });
        await ringCase('After a 20 second network drop: rings once on the next call', async () => {
            await callee.context.setOffline(true);
            await sleep(20000);
            await callee.context.setOffline(false);
            await sleep(10000);
            return {};
        });
        await ringCase('Called while offline: rings when the network returns, while the call is still ringing', async () => {
            await callee.context.setOffline(true);
            await sleep(2000);
            return {};
        }, { during: async () => { await sleep(10000); await callee.context.setOffline(false); } });
        await ringCase('Called while backgrounded (page frozen and offline), then foregrounded: rings on return', async () => {
            await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
            await callee.context.setOffline(true);
            return { lifecycle: 'frozen+offline' };
        }, { during: async () => { await sleep(12000); await callee.context.setOffline(false); await cdp.send('Page.setWebLifecycleState', { state: 'active' }); } });
        await ringCase('Answered on the callee: two-way call, bell row cleared, one completed receipt, no raw receipt alert', async () => ({}), { answer: true });

        {
            const t0 = await placeCall();
            await until(() => incomingOpen(callee.page), { timeout: 30000 }).catch(() => {});
            const ringing = await rows('incoming_call', t0);
            await until(async () => !(await callOpen(caller)), { timeout: 70000 }).catch(() => {});
            await sleep(6000);
            const missed = await rows('missed_call', t0);
            const after = await rows('incoming_call', t0);
            const r = await receipts(t0);
            const raw = await rawReceiptAlerts(t0);
            const calleeStillRinging = await incomingOpen(callee.page);
            check('B', 'Unanswered: rings, then exactly one missed-call notice, the ringing row cleared, one missed receipt, no raw receipt alert', ringing.length === 1 && missed.length === 1 && after.length === 0 && r.length === 1 && r[0].status === 'missed' && !raw.notifications && !raw.pushes && !calleeStillRinging,
                { bellRowsWhileRinging: ringing.length, missedNotices: missed.map(m => m.title), bellRowsAfter: after.length, receipts: r, rawReceiptAlerts: raw, calleeStillRinging });
        }
        await callee.context.close();
        }

        // ── Part C: push chain for the subscription Part A created ────────
        if (!PARTS.has('C')) { /* not requested */ } else if (pushContext && subscriptionId) {
            const before = (await admin.from('push_subscriptions').select('last_used_at, last_receipt_at').eq('id', subscriptionId).maybeSingle()).data;
            const t0 = await placeCall();
            const after = await until(async () => { const d = (await admin.from('push_subscriptions').select('last_used_at, last_receipt_at, last_failure_reason').eq('id', subscriptionId).maybeSingle()).data; return d?.last_receipt_at && d.last_receipt_at !== before?.last_receipt_at ? d : null; }, { timeout: 15000 }).catch(async () => (await admin.from('push_subscriptions').select('last_used_at, last_receipt_at, last_failure_reason').eq('id', subscriptionId).maybeSingle()).data);
            const outbox = ((await admin.from('push_outbox').select('status, failure_reason, event').eq('recipient_user_id', C.id).eq('event', 'incoming_call').gte('created_at', t0)).data || []);
            const advanced = (x, y) => Boolean(y && (!x || new Date(y) > new Date(x)));
            check('C', 'Server push acceptance: exactly one incoming-call push, sent, subscription last_used_at advanced', outbox.length === 1 && outbox[0].status === 'sent' && advanced(before?.last_used_at, after?.last_used_at), { outbox, lastUsedAdvanced: advanced(before?.last_used_at, after?.last_used_at), lastFailure: after?.last_failure_reason || null });
            const page = await pushContext.newPage();
            await page.goto(`${APP_ORIGIN}/hub/friends`, { waitUntil: 'domcontentloaded' }).catch(() => {});
            const shown = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration('/push/'); const n = await r?.getNotifications(); return (n || []).map(x => ({ title: x.title, url: x.data?.url || null, actions: (x.actions || []).map(a => a.action) })); }).catch(() => []);
            const callNote = shown.find(n => /Incoming Video Call/i.test(n.title));
            check('C', 'Worker display (headless Chrome, not a person-visible banner): showNotification ran and the receipt was recorded', advanced(before?.last_receipt_at, after?.last_receipt_at) && Boolean(callNote), { lastReceiptAdvanced: advanced(before?.last_receipt_at, after?.last_receipt_at), notifications: shown }, { tier: 'worker-display' });
            if (callNote?.url) {
                await page.goto(`${APP_ORIGIN}${callNote.url}&answer=1`, { waitUntil: 'domcontentloaded' });
                const media = await until(async () => { const v = await videos(caller); return v.remote >= 1 ? v : null; }, { timeout: 40000 }).catch(() => null);
                check('C', 'Accept URL from the notification answers the call: the caller receives the callee video', Boolean(media), { media }, { tier: 'accept-url' });
                await caller.getByLabel('End Call', { exact: true }).first().click().catch(() => {});
                await callerScreenClosed();
            } else {
                await caller.getByLabel('End Call', { exact: true }).first().click().catch(() => {});
                await callerScreenClosed();
            }
        } else {
            check('C', 'Push chain', false, { reason: 'Part A produced no subscription to test' }, { limitation: true });
        }
    } catch (error) {
        report.error = String(error?.message || error).slice(0, 300);
        console.log(`ERROR ${report.error}`);
    } finally {
        for (const browser of browsers) await browser.close().catch(() => {});
        report.cleanup = await cleanup(admin, created, async () => {
            if (!C) return {};
            const { error } = await admin.from('push_subscriptions').delete().eq('user_id', C.id);
            return { pushSubscriptions: error?.message || 'ok' };
        });
        report.finishedAt = new Date().toISOString();
        const failed = report.checks.filter(c => !c.ok && !c.limitation);
        report.status = report.error || failed.length ? 'failed' : report.checks.some(c => c.limitation) ? 'passed-with-limitations' : 'passed';
        writeFileSync(`${RESULT_DIR}/result.json`, JSON.stringify(report, null, 2));
        console.log(JSON.stringify({ status: report.status, cleanup: report.cleanup, error: report.error }, null, 2));
    }
    if (report.status === 'failed' || cleanupFailed(report.cleanup)) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    if (process.argv.includes('--self-test')) {
        assert.match(EMULATE_DENIED, /'denied'/);
        assert.match(EMULATE_NO_PUSH, /delete window\.PushManager/);
        console.log('messenger-calls-notify self-test passed');
    } else {
        await main();
    }
}
