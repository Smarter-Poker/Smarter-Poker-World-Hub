#!/usr/bin/env node
/*
 * Incoming calls and Turn On Notifications inside Club Arena
 * (suite messenger-calls-clubarena).
 *
 *   1. Menu: Club Arena's hamburger offers Turn On Notifications; a throwaway
 *      callee (an ordinary role-user account this run creates) in a
 *      persistent Google Chrome profile enrols through it and the
 *      subscription is stored server-side.
 *   2. Call at a live table: the same throwaway observes a running cash table
 *      (no seat, no chips) with that table open. A second throwaway calls it.
 *      Club Arena must show the "Tap To Answer" alert; tapping it must answer
 *      the call in a "+" hub tab while the table tab stays open and
 *      connected; after the call the alert is gone and the table still
 *      updates.
 *
 * Table step account (run 41277947387): Club Arena's row-level security shows
 * a club's tables only to its members, so a throwaway sees every cash table as
 * "Table Closed". Joining it to a real club would add a member to a production
 * club and could trigger that club's welcome chips. The table step therefore
 * uses the configured service identity, which is already a member: it only
 * observes and receives the call, never sits, and moves no chips. Its god role
 * is not exercised. The menu step uses an ordinary throwaway.
 *
 * No real contact is called. A brand-new
 * account meets Club Arena's Terms, age and analytics prompts; the throwaway
 * answers them for itself (it is created and hard-deleted by this run), and
 * the receipt lists each one. Throwaways are example.com and hard-deleted.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import {
    APP_ORIGIN, sleep, until, clients, assertLiveRevision, signInTestAccount, createProbeUser, createConversation,
    cleanup, cleanupFailed, callOpen, videos,
} from './messenger-calls-lib.mjs';

const RESULT_DIR = 'test-results/messenger-calls-clubarena';
const CA = `${APP_ORIGIN}/hub/club-arena`;
const FAKE_MEDIA = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'];
const seed = (s) => ({ s });
async function signIn(context, session) {
    await context.addInitScript(({ s }) => {
        localStorage.setItem('smarter-poker-auth', JSON.stringify(s));
        localStorage.setItem(`sp_firstrun_notif_v2_${s.user.id}`, String(Date.now()));
        sessionStorage.setItem('social-intro-seen', 'true');
    }, seed(session));
}

/** A coarse fingerprint of what the table shows; it changes as hands play. */
const tableFingerprint = page => page.evaluate(() => (document.body?.innerText || '').slice(0, 4000)).then(t => createHash('sha1').update(t).digest('hex').slice(0, 12)).catch(() => null);
/**
 * A new account's first visit meets Club Arena's Terms, age and analytics
 * prompts. The throwaway answers them for itself; each one is recorded.
 */
export const PROBE_BIRTHDAY = '1990-01-01';
async function passArenaGates(page, seen) {
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
        const agree = page.getByText('I Have Read And Agree To The Terms Of Service And Privacy Policy');
        if (await agree.isVisible().catch(() => false)) {
            await agree.click();
            await page.getByRole('button', { name: 'Accept & Continue', exact: true }).click();
            seen.push('terms accepted by the throwaway');
            await sleep(2000);
            continue;
        }
        const age = page.locator('#age-gate-birthday');
        if (await age.isVisible().catch(() => false)) {
            await age.fill(PROBE_BIRTHDAY);
            await page.getByRole('button', { name: 'Continue', exact: true }).click();
            seen.push('age gate answered by the throwaway');
            await sleep(2000);
            continue;
        }
        const bonusClose = page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true });
        if (await page.locator('#dbs-title').isVisible().catch(() => false) && await bonusClose.first().isVisible().catch(() => false)) {
            await bonusClose.first().click();
            seen.push('daily bonus sheet closed without claiming');
            await sleep(1000);
            continue;
        }
        const notNow = page.locator('.ca-consent').getByRole('button', { name: 'Not Now', exact: true });
        if (await notNow.isVisible().catch(() => false)) {
            await notNow.click();
            seen.push('analytics prompt declined');
            await sleep(1000);
            continue;
        }
        if (await page.locator('[aria-label="Open Menu"]').first().isVisible().catch(() => false)) return true;
        await sleep(1000);
    }
    return false;
}

/** Realtime frames that mention the notifications stream, for diagnosis. */
function watchRealtime(page) {
    const seen = { sockets: 0, notificationJoins: 0, notificationEvents: 0, errors: [] };
    page.on('websocket', ws => {
        if (!/realtime/.test(ws.url())) return;
        seen.sockets += 1;
        ws.on('framesent', f => { const t = String(f.payload || ''); if (/phx_join/.test(t) && /"table":"notifications"/.test(t)) seen.notificationJoins += 1; });
        ws.on('framereceived', f => {
            const t = String(f.payload || '');
            if (/postgres_changes/.test(t) && /"table":"notifications"/.test(t)) seen.notificationEvents += 1;
            if (/"status":"error"|phx_error/.test(t)) seen.errors.push(t.slice(0, 200));
        });
    });
    return seen;
}

const liveTables = page => page.evaluate(() => Number(document.body?.dataset.caLiveTables || '0')).catch(() => 0);
const reconnecting = page => page.evaluate(() => /Reconnecting To The Table/i.test(document.body?.innerText || '')).catch(() => false);

async function main() {
    for (const name of ['TEST_USER_EMAIL', 'TEST_USER_PASSWORD', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'MESSENGER_EXPECTED_SHA', 'CLUB_ARENA_EXPECTED_SHA']) assert.ok(process.env[name]?.trim(), `${name} is required`);
    mkdirSync(RESULT_DIR, { recursive: true });
    const report = { suite: 'messenger-calls-clubarena', startedAt: new Date().toISOString(), checks: [], probeGates: [], cleanup: null };
    const check = (name, ok, evidence) => { report.checks.push({ name, ok: Boolean(ok), evidence }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); };
    const created = { users: [], conversations: [] };
    const sb = await clients();
    const { admin } = sb;
    const browsers = [];
    let A = null;
    let callee = null;
    const enrolled = new Set();
    try {
        report.health = await assertLiveRevision();
        const build = await (await fetch(`${CA}/build-info.json`, { cache: 'no-store' })).json();
        report.clubArena = build;
        assert.equal(build.ca_sha, process.env.CLUB_ARENA_EXPECTED_SHA, 'Club Arena revision differs from the expected published revision');

        const C = await createProbeUser(sb, created, 'cac', 'Arena Notifications Verification');
        const session = C.session;
        A = C.id;
        report.enroller = { role: ((await admin.from('profiles').select('role').eq('id', A).maybeSingle()).data || {}).role || null, throwaway: true };
        const B = await createProbeUser(sb, created, 'cab', 'Arena Call Verification Caller');
        const t0 = new Date().toISOString();

        const { chromium, devices } = await import('playwright');

        // ── 1. Turn On Notifications from Club Arena's menu ──────────────
        try {
            const profile = mkdtempSync(`${tmpdir()}/sp-ca-push-`);
            const ctx = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: process.env.NOTIFY_HEADED_PUSH !== '1', args: FAKE_MEDIA, ignoreDefaultArgs: ['--disable-background-networking'], ...devices['Pixel 7'] });
            browsers.push(ctx);
            await signIn(ctx, session);
            await ctx.grantPermissions(['notifications'], { origin: APP_ORIGIN });
            const page = ctx.pages()[0] || await ctx.newPage();
            const devtools = await ctx.newCDPSession(page);
            await devtools.send('Browser.setPermission', { permission: { name: 'push', userVisibleOnly: true }, setting: 'granted', origin: APP_ORIGIN }).catch(() => {});
            await page.goto(`${CA}/`, { waitUntil: 'domcontentloaded' });
            const ready = await passArenaGates(page, report.probeGates);
            check('The throwaway passes Club Arena\'s first-visit prompts and reaches the lobby', ready, { prompts: report.probeGates });
            await page.locator('[aria-label="Open Menu"]').first().click({ timeout: 60000 });
            const row = page.getByRole('button', { name: /^Turn On Notifications$/i });
            const shown = await row.waitFor({ timeout: 15000 }).then(() => true, () => false);
            check('Club Arena menu offers Turn On Notifications to a device without push', shown, null);
            if (shown) {
                await row.click();
                const sub = await until(async () => (await admin.from('push_subscriptions').select('id, endpoint, transport').eq('user_id', A).eq('is_active', true).gte('created_at', t0)).data?.[0], { timeout: 45000 }).catch(() => null);
                if (sub) enrolled.add(sub.id);
                check('Club Arena menu enrols the device: subscription stored server-side', Boolean(sub), sub ? { endpointHost: new URL(sub.endpoint).host, transport: sub.transport } : null);
                await page.reload({ waitUntil: 'domcontentloaded' });
                await page.locator('[aria-label="Open Menu"]').first().click({ timeout: 60000 });
                await sleep(3000);
                check('Club Arena menu hides the row once the device is enrolled', (await row.count()) === 0, null);
            }
            // Same throwaway, in the Club Arena lobby: does a ringing call reach a
            // non-table page? Separates "no alert anywhere" from "no alert at a table".
            try {
                const lobbyRt = watchRealtime(page);
                await page.goto(`${CA}/`, { waitUntil: 'domcontentloaded' });
                await passArenaGates(page, report.probeGates).catch(() => false);
                await page.evaluate(() => { window.__caCallEvents = []; window.addEventListener('ca:incoming-call', e => window.__caCallEvents.push(e.detail?.type)); });
                await sleep(8000);
                const lobbyConversation = await createConversation(admin, created, B.id, A, { senderId: B.id, content: 'Club Arena Lobby Call Verification' });
                const lctx = await chromium.launch({ headless: true, args: FAKE_MEDIA });
                browsers.push(lctx);
                const lc = await lctx.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
                await lc.grantPermissions(['camera', 'microphone'], { origin: APP_ORIGIN });
                await signIn(lc, B.session);
                const lcaller = await lc.newPage();
                await lcaller.goto(`${APP_ORIGIN}/hub/messenger?conversation=${lobbyConversation}`, { waitUntil: 'domcontentloaded' });
                await lcaller.getByLabel('Start Video Call', { exact: true }).waitFor({ timeout: 60000 });
                await sleep(3000);
                await lcaller.getByLabel('Start Video Call', { exact: true }).click();
                const lobbyAlert = await page.getByText(/Tap To Answer/i).first().waitFor({ timeout: 25000 }).then(() => true, () => false);
                report.lobbyRing = { alert: lobbyAlert, eventsOnPage: await page.evaluate(() => window.__caCallEvents || []).catch(() => null), realtime: lobbyRt };
                check('Club Arena lobby shows the incoming-call alert (throwaway, no table)', lobbyAlert, report.lobbyRing);
                await lcaller.getByLabel('End Call', { exact: true }).first().click().catch(() => {});
                await sleep(4000);
                await lctx.close();
            } catch (error) {
                check('Club Arena lobby call step completed', false, { error: String(error?.message || error).split('\n')[0].slice(0, 200) });
            }
            await ctx.close();
        } catch (error) {
            const page = browsers.at(-1)?.pages?.()[0];
            const where = page ? { url: page.url(), text: (await page.evaluate(() => (document.body?.innerText || '').slice(0, 400)).catch(() => null)) } : null;
            if (page) await page.screenshot({ path: `${RESULT_DIR}/menu-failure.png` }).catch(() => {});
            check('Club Arena menu step completed', false, { error: String(error?.message || error).split('\n')[0].slice(0, 200), where });
        }

        // ── 2. Call while observing a live table ─────────────────────────
        // Club membership is needed to see a table (see the header); the
        // service identity is the configured account that holds one.
        const observer = await signInTestAccount(sb.anon);
        const O = observer.user.id;
        callee = O;
        report.tableObserver = { account: 'configured service identity (club member)', reason: 'club tables are visible only to members', seat: false, chips: false };
        const conversationId = await createConversation(admin, created, B.id, O, { senderId: B.id, content: 'Club Arena Call Verification' });
        const t1 = new Date().toISOString();
        const { data: recent } = await admin.from('hand_history').select('table_id, created_at').gte('created_at', new Date(Date.now() - 120000).toISOString()).order('created_at', { ascending: false }).limit(200);
        const tableIds = [...new Set((recent || []).map(r => r.table_id))];
        const handCount = new Map();
        for (const r of recent || []) handCount.set(r.table_id, (handCount.get(r.table_id) || 0) + 1);
        const { data: tables } = await admin.from('tables').select('id, name, status, tournament_id').in('id', tableIds.slice(0, 100)).is('tournament_id', null).eq('status', 'running');
        // Lightning tables are short-lived pools that close under an observer
        // (run 41277527639 opened one as it closed); a classic cash table stays.
        const candidates = (tables || []).filter(t => !/lightning/i.test(t.name || '')).sort((a, b) => (handCount.get(b.id) || 0) - (handCount.get(a.id) || 0));
        assert.ok(candidates.length, 'No running classic cash table with recent hands to observe');

        const browser = await chromium.launch({ headless: true, args: FAKE_MEDIA });
        browsers.push(browser);
        const actx = await browser.newContext({ ...devices['Pixel 7'] });
        await actx.grantPermissions(['camera', 'microphone'], { origin: APP_ORIGIN });
        await signIn(actx, observer);
        const arena = await actx.newPage();
        arena.setDefaultTimeout(20000);
        const consoleErrors = [];
        const tableRt = watchRealtime(arena);
        arena.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160)); });
        // Record whether the call event reached this page, separately from the toast.
        await actx.addInitScript(() => {
            window.__caCallEvents = [];
            window.addEventListener('ca:incoming-call', e => window.__caCallEvents.push({ t: Date.now(), type: e.detail?.type }));
            window.addEventListener('ca:call-alert-cleared', () => window.__caCallEvents.push({ t: Date.now(), type: 'cleared' }));
        });
        let table = null;
        for (const candidate of candidates.slice(0, 4)) {
            await arena.goto(`${CA}/table/${candidate.id}`, { waitUntil: 'domcontentloaded' });
            await passArenaGates(arena, report.probeGates).catch(() => false);
            if (!/\/table\//.test(new URL(arena.url()).pathname)) await arena.goto(`${CA}/table/${candidate.id}`, { waitUntil: 'domcontentloaded' });
            await until(async () => (await liveTables(arena)) >= 1, { timeout: 60000 }).catch(() => {});
            await sleep(3000);
            if (!(await arena.getByText(/Table Closed/i).count())) { table = candidate; break; }
        }
        assert.ok(table, 'Every candidate classic cash table closed under the observer');
        report.table = { name: table.name, recentHands: handCount.get(table.id) || 0 };
        report.tablePage = { url: arena.url() };
        await arena.screenshot({ path: `${RESULT_DIR}/arena-table.png` }).catch(() => {});
        const fp1 = await tableFingerprint(arena);
        await sleep(15000);
        const fp2 = await tableFingerprint(arena);
        const before = { liveTables: await liveTables(arena), changing: fp1 !== fp2, reconnecting: await reconnecting(arena) };
        check('The callee (club member) is observing a live table that updates (no seat taken)', before.liveTables >= 1 && before.changing && !before.reconnecting, before);

        const bctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
        await bctx.grantPermissions(['camera', 'microphone'], { origin: APP_ORIGIN });
        await signIn(bctx, B.session);
        const caller = await bctx.newPage();
        await caller.goto(`${APP_ORIGIN}/hub/messenger?conversation=${conversationId}`, { waitUntil: 'domcontentloaded' });
        await caller.getByLabel('Start Video Call', { exact: true }).waitFor({ timeout: 60000 });
        await sleep(3000);
        await caller.getByLabel('Start Video Call', { exact: true }).click();

        const alert = arena.getByText(/Tap To Answer/i).first();
        const callRow = until(async () => ((await admin.from('notifications').select('id, type, data').eq('user_id', O).eq('type', 'incoming_call').gte('created_at', t1)).data || [])[0], { timeout: 20000 }).catch(() => null);
        const alerted = await alert.waitFor({ timeout: 25000 }).then(() => true, () => false);
        const row = await callRow;
        report.ring = { incomingCallRowWritten: Boolean(row), rowHasRoom: Boolean(row?.data?.roomName), eventsOnPage: await arena.evaluate(() => window.__caCallEvents || []).catch(() => null), consoleErrors: consoleErrors.slice(-8), realtime: tableRt };
        if (!alerted) await arena.screenshot({ path: `${RESULT_DIR}/arena-during-ring.png` }).catch(() => {});
        const alertText = alerted ? (await alert.textContent())?.trim() : null;
        check('Club Arena shows the incoming-call alert at the table', alerted, { alertText, ...report.ring });
        if (alerted) {
            await alert.click();
            const media = await until(async () => { const v = await videos(caller); return v.remote >= 1 ? v : null; }, { timeout: 60000 }).catch(() => null);
            const during = { liveTables: await liveTables(arena), path: new URL(arena.url()).pathname, reconnecting: await reconnecting(arena) };
            check('Tap To Answer answers the call in a hub tab: the caller receives the callee video', Boolean(media), { media });
            check('The table stays open during the call (still a live table tab, no reconnect)', during.liveTables >= 1 && !during.reconnecting, during);
            await sleep(5000);
            await caller.getByLabel('End Call', { exact: true }).first().click().catch(() => {});
            await until(async () => !(await callOpen(caller)), { timeout: 30000 }).catch(() => {});
        } else {
            await caller.getByLabel('End Call', { exact: true }).first().click().catch(() => {});
        }
        await sleep(6000);
        const leftover = ((await admin.from('notifications').select('id').eq('user_id', O).eq('type', 'incoming_call').gte('created_at', t1)).data || []).length;
        const alertGone = (await arena.getByText(/Tap To Answer/i).count()) === 0;
        const fp3 = await tableFingerprint(arena);
        await sleep(15000);
        const fp4 = await tableFingerprint(arena);
        const after = { liveTables: await liveTables(arena), changing: fp3 !== fp4, reconnecting: await reconnecting(arena), ringingRowsLeft: leftover, alertGone };
        check('After the call: alert gone, ringing notification cleared, the table still live and updating', after.liveTables >= 1 && after.changing && !after.reconnecting && leftover === 0 && alertGone, after);
        await arena.screenshot({ path: `${RESULT_DIR}/arena-after-call.png` }).catch(() => {});
    } catch (error) {
        report.error = String(error?.message || error).slice(0, 300);
        console.log(`ERROR ${report.error}`);
    } finally {
        for (const b of browsers) await b.close().catch(() => {});
        report.cleanup = await cleanup(admin, created, async () => {
            const result = {};
            if (callee && created.users.length) result.observerCallNotifications = (await admin.from('notifications').delete().eq('user_id', callee).in('actor_id', created.users)).error?.message || 'ok';
            if (enrolled.size) {
                const ids = [...enrolled];
                const { error } = await admin.from('push_subscriptions').delete().in('id', ids);
                const { data: left } = await admin.from('push_subscriptions').select('id').in('id', ids);
                result.calleeSubscription = !error && !(left || []).length ? 'ok' : `NOT REMOVED: ${error?.message || 'still present'}`;
            }
            return result;
        });
        report.finishedAt = new Date().toISOString();
        report.status = !report.error && report.checks.length && report.checks.every(c => c.ok) ? 'passed' : 'failed';
        writeFileSync(`${RESULT_DIR}/result.json`, JSON.stringify(report, null, 2));
        console.log(JSON.stringify({ status: report.status, cleanup: report.cleanup, error: report.error }, null, 2));
    }
    if (report.status !== 'passed' || cleanupFailed(report.cleanup)) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    if (process.argv.includes('--self-test')) {
        const src = (await import('node:fs')).readFileSync(new URL(import.meta.url), 'utf8').split("process.argv.includes('--self-test')")[0];
        // The service identity appears once, for the table step only.
        assert.equal((src.match(/await signInTestAccount\(/g) || []).length, 1, 'service identity used once');
        assert.ok(src.indexOf('await signInTestAccount(') > src.indexOf('2. Call while observing a live table'), 'service identity only in the table step');
        console.log('messenger-calls-clubarena self-test passed');
    } else {
        await main();
    }
}
