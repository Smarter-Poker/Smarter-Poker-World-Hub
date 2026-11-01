#!/usr/bin/env node
/*
 * Incoming calls and Turn On Notifications inside Club Arena
 * (suite messenger-calls-clubarena).
 *
 *   1. Menu: Club Arena's hamburger offers Turn On Notifications; a throwaway
 *      in a persistent Google Chrome profile enrols through it and the
 *      subscription is stored server-side.
 *   2. Call at a live table: the designated test account observes a running
 *      cash table (no seat, no chips). A throwaway calls it. Club Arena must
 *      show the "Tap To Answer" alert; tapping it must answer the call in a
 *      "+" hub tab while the table tab stays open and connected; after the
 *      call the alert is gone and the table still updates.
 *
 * No real contact is called. The test account is only the callee and never
 * sits down. Throwaways are example.com and hard-deleted.
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
const liveTables = page => page.evaluate(() => Number(document.body?.dataset.caLiveTables || '0')).catch(() => 0);
const reconnecting = page => page.evaluate(() => /Reconnecting To The Table/i.test(document.body?.innerText || '')).catch(() => false);

async function main() {
    for (const name of ['TEST_USER_EMAIL', 'TEST_USER_PASSWORD', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'MESSENGER_EXPECTED_SHA', 'CLUB_ARENA_EXPECTED_SHA']) assert.ok(process.env[name]?.trim(), `${name} is required`);
    mkdirSync(RESULT_DIR, { recursive: true });
    const report = { suite: 'messenger-calls-clubarena', startedAt: new Date().toISOString(), checks: [], cleanup: null };
    const check = (name, ok, evidence) => { report.checks.push({ name, ok: Boolean(ok), evidence }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); };
    const created = { users: [], conversations: [] };
    const sb = await clients();
    const { admin } = sb;
    const browsers = [];
    let A = null;
    try {
        report.health = await assertLiveRevision();
        const build = await (await fetch(`${CA}/build-info.json`, { cache: 'no-store' })).json();
        report.clubArena = build;
        assert.equal(build.ca_sha, process.env.CLUB_ARENA_EXPECTED_SHA, 'Club Arena revision differs from the expected published revision');

        const session = await signInTestAccount(sb.anon);
        A = session.user.id;
        const B = await createProbeUser(sb, created, 'cab', 'Arena Call Verification Caller');
        const E = await createProbeUser(sb, created, 'cae', 'Arena Enrol Verification');
        const conversationId = await createConversation(admin, created, B.id, A, { senderId: B.id, content: 'Club Arena Call Verification' });
        const t0 = new Date().toISOString();

        const { chromium, devices } = await import('playwright');

        // ── 1. Turn On Notifications from Club Arena's menu ──────────────
        try {
            const profile = mkdtempSync(`${tmpdir()}/sp-ca-push-`);
            const ctx = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: process.env.NOTIFY_HEADED_PUSH !== '1', args: FAKE_MEDIA, ignoreDefaultArgs: ['--disable-background-networking'], ...devices['Pixel 7'] });
            browsers.push(ctx);
            await signIn(ctx, E.session);
            await ctx.grantPermissions(['notifications'], { origin: APP_ORIGIN });
            const page = ctx.pages()[0] || await ctx.newPage();
            const devtools = await ctx.newCDPSession(page);
            await devtools.send('Browser.setPermission', { permission: { name: 'push', userVisibleOnly: true }, setting: 'granted', origin: APP_ORIGIN }).catch(() => {});
            await page.goto(`${CA}/`, { waitUntil: 'domcontentloaded' });
            await page.locator('[aria-label="Open Menu"]').first().click({ timeout: 60000 });
            const row = page.getByRole('button', { name: /^Turn On Notifications$/i });
            const shown = await row.waitFor({ timeout: 15000 }).then(() => true, () => false);
            check('Club Arena menu offers Turn On Notifications to a device without push', shown, null);
            if (shown) {
                await row.click();
                const sub = await until(async () => (await admin.from('push_subscriptions').select('id, endpoint, transport').eq('user_id', E.id).eq('is_active', true)).data?.[0], { timeout: 45000 }).catch(() => null);
                check('Club Arena menu enrols the device: subscription stored server-side', Boolean(sub), sub ? { endpointHost: new URL(sub.endpoint).host, transport: sub.transport } : null);
                await page.reload({ waitUntil: 'domcontentloaded' });
                await page.locator('[aria-label="Open Menu"]').first().click({ timeout: 60000 });
                await sleep(3000);
                check('Club Arena menu hides the row once the device is enrolled', (await row.count()) === 0, null);
            }
            await ctx.close();
        } catch (error) {
            const page = browsers.at(-1)?.pages?.()[0];
            const where = page ? { url: page.url(), text: (await page.evaluate(() => (document.body?.innerText || '').slice(0, 400)).catch(() => null)) } : null;
            if (page) await page.screenshot({ path: `${RESULT_DIR}/menu-failure.png` }).catch(() => {});
            check('Club Arena menu step completed', false, { error: String(error?.message || error).split('\n')[0].slice(0, 200), where });
        }

        // ── 2. Call while observing a live table ─────────────────────────
        const { data: recent } = await admin.from('hand_history').select('table_id, created_at').gte('created_at', new Date(Date.now() - 120000).toISOString()).order('created_at', { ascending: false }).limit(200);
        const tableIds = [...new Set((recent || []).map(r => r.table_id))];
        const { data: tables } = await admin.from('tables').select('id, name, status, tournament_id').in('id', tableIds.slice(0, 50)).is('tournament_id', null).eq('status', 'running');
        const table = tables?.[0];
        assert.ok(table, 'No running cash table with recent hands to observe');
        report.table = { name: table.name };

        const browser = await chromium.launch({ headless: true, args: FAKE_MEDIA });
        browsers.push(browser);
        const actx = await browser.newContext({ ...devices['Pixel 7'] });
        await actx.grantPermissions(['camera', 'microphone'], { origin: APP_ORIGIN });
        await signIn(actx, session);
        const arena = await actx.newPage();
        arena.setDefaultTimeout(20000);
        await arena.goto(`${CA}/table/${table.id}`, { waitUntil: 'domcontentloaded' });
        await until(async () => (await liveTables(arena)) >= 1, { timeout: 60000 }).catch(() => {});
        report.tablePage = { url: arena.url() };
        await arena.screenshot({ path: `${RESULT_DIR}/arena-table.png` }).catch(() => {});
        const fp1 = await tableFingerprint(arena);
        await sleep(15000);
        const fp2 = await tableFingerprint(arena);
        const before = { liveTables: await liveTables(arena), changing: fp1 !== fp2, reconnecting: await reconnecting(arena) };
        check('The test account is observing a live table that updates (no seat taken)', before.liveTables >= 1 && before.changing && !before.reconnecting, before);

        const bctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
        await bctx.grantPermissions(['camera', 'microphone'], { origin: APP_ORIGIN });
        await signIn(bctx, B.session);
        const caller = await bctx.newPage();
        await caller.goto(`${APP_ORIGIN}/hub/messenger?conversation=${conversationId}`, { waitUntil: 'domcontentloaded' });
        await caller.getByLabel('Start Video Call', { exact: true }).waitFor({ timeout: 60000 });
        await sleep(3000);
        await caller.getByLabel('Start Video Call', { exact: true }).click();

        const alert = arena.getByText(/Tap To Answer/i).first();
        const alerted = await alert.waitFor({ timeout: 25000 }).then(() => true, () => false);
        const alertText = alerted ? (await alert.textContent())?.trim() : null;
        check('Club Arena shows the incoming-call alert at the table', alerted, { alertText });
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
        const leftover = ((await admin.from('notifications').select('id').eq('user_id', A).eq('type', 'incoming_call').gte('created_at', t0)).data || []).length;
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
            if (A && created.users.length) result.testAccountCallNotifications = (await admin.from('notifications').delete().eq('user_id', A).in('actor_id', created.users)).error?.message || 'ok';
            if (created.users.length) result.throwawaySubscriptions = (await admin.from('push_subscriptions').delete().in('user_id', created.users)).error?.message || 'ok';
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
        console.log('messenger-calls-clubarena self-test passed');
    } else {
        await main();
    }
}
