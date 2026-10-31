#!/usr/bin/env node
/*
 * PUBLISHED MESSENGER CALLS - TWO-DEVICE LIVE VERIFICATION (2026-10-31).
 *
 * Dan: "use the supported test-account route to verify real voice and video
 * calls between two authenticated devices ... Do not call real contacts."
 *
 * Identities (nobody real is ever called):
 *   A  the designated test account (TEST_USER_EMAIL / TEST_USER_PASSWORD,
 *      the same sign-in path as scripts/ci/messenger-live-check.mjs). A only
 *      ever PLACES calls, so no device subscribed to the test account rings.
 *   B  a throwaway callee, C an unrelated throwaway. Both are created with the
 *      service role exactly like the signup probe's throwaway user
 *      (pages/api/cron/signup-probe.js): an RFC 2606 reserved example.com
 *      address that can never receive mail, user_metadata.messenger_call_probe = true, and hard
 *      deletion in `finally`, confirmed gone. B and C have no push
 *      subscriptions, so no phone anywhere rings.
 *
 * Every call runs through production: smarter.poker pages and APIs, Supabase
 * Realtime, and LiveKit media. Chromium supplies a synthetic camera and
 * microphone (--use-fake-device-for-media-stream), so two-way audio and video
 * are measured from the received streams, not inferred.
 *
 * Evidence: test-results/messenger-calls-live/result.json and screenshots of
 * call screens and the synthetic conversation only (never the test account's
 * inbox or other conversations). No credentials, tokens or message bodies are
 * written.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { APP_ORIGIN, AUTH_ORIGIN } from './messenger-live-configuration.mjs';
import { makeCallRoomName, CALL_RING_TIMEOUT_MS } from '../../src/lib/calls/callRoom.mjs';

// RFC 2606 reserves example.com: it can never receive mail. Not `.invalid`:
// fn_ca_is_cert_account classes every `%.invalid` address as certification
// equipment, and fn_get_user_conversations hides those threads from real
// users, so a `.invalid` callee's conversation vanished from the caller's
// inbox after its first message and later receipts were refused.
export const PROBE_DOMAIN = 'call-probe.example.com';
export const PROBE_FLAG = 'messenger_call_probe';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LONG_NAME = 'Call Probe Bartholomew Featherstonehaugh-Smythe The Third';

export function validateCallProbeConfiguration(env) {
    for (const name of ['TEST_USER_EMAIL', 'TEST_USER_PASSWORD', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'MESSENGER_EXPECTED_SHA']) {
        assert.ok(env[name]?.trim(), `${name} is required; no account or credential fallback is allowed`);
    }
    assert.equal(env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, ''), AUTH_ORIGIN, 'Unexpected authentication origin');
    assert.match(env.MESSENGER_EXPECTED_SHA, /^[0-9a-f]{40}$/i, 'Expected deployed SHA must be a full commit');
}

export function probeEmail(role, now = Date.now(), random = randomBytes(4).toString('hex')) {
    assert.match(role, /^[bc]$/, 'Only the two throwaway roles exist');
    return `messenger-call-probe-${role}-${now}-${random}@${PROBE_DOMAIN}`;
}

/** A call may only ever be placed to a throwaway this run created. */
export function assertProbeCallee(calleeId, probeIds) {
    assert.ok(UUID.test(calleeId || '') && probeIds.has(calleeId), 'Refusing to call anyone but this run\'s throwaway callee');
}

export function selfTest() {
    assert.throws(() => validateCallProbeConfiguration({}), /TEST_USER_EMAIL/);
    assert.match(probeEmail('b', 1, 'abcd'), /^messenger-call-probe-b-1-abcd@call-probe\.example\.com$/);
    assert.throws(() => probeEmail('a'));
    const probe = new Set(['00000000-0000-4000-8000-000000000001']);
    assert.doesNotThrow(() => assertProbeCallee('00000000-0000-4000-8000-000000000001', probe));
    assert.throws(() => assertProbeCallee('00000000-0000-4000-8000-000000000002', probe), /throwaway callee/);
    assert.ok(CALL_RING_TIMEOUT_MS >= 30000 && CALL_RING_TIMEOUT_MS <= 60000);
    console.log('Messenger calls live probe safety checks passed');
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, { timeout = 15000, interval = 250, message = 'Timed out' } = {}) {
    const end = Date.now() + timeout;
    let last;
    while (Date.now() < end) {
        try { last = await fn(); if (last) return last; } catch { /* keep polling */ }
        await sleep(interval);
    }
    throw new Error(message);
}

// Remote audio: peak amplitude of every RoomAudioRenderer stream over `ms`.
async function audioPeak(page, ms = 3000) {
    return page.evaluate(async duration => {
        const els = [...document.querySelectorAll('audio')].filter(a => a.srcObject && a.srcObject.getAudioTracks().length);
        if (!els.length) return { streams: 0, peak: 0 };
        const ctx = new AudioContext();
        try { await ctx.resume(); } catch { /* headless */ }
        const analysers = els.map(a => {
            const source = ctx.createMediaStreamSource(a.srcObject);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 2048;
            source.connect(analyser);
            return analyser;
        });
        const buffer = new Float32Array(2048);
        let peak = 0;
        const end = performance.now() + duration;
        while (performance.now() < end) {
            for (const analyser of analysers) {
                analyser.getFloatTimeDomainData(buffer);
                for (const value of buffer) peak = Math.max(peak, Math.abs(value));
            }
            await new Promise(resolve => setTimeout(resolve, 40));
        }
        await ctx.close();
        return { streams: els.length, peak };
    }, ms);
}

// Playing videos, split by the local picture-in-picture mirror transform.
async function videos(page) {
    return page.evaluate(() => {
        const playing = [...document.querySelectorAll('video')].filter(v => v.videoWidth > 0 && v.readyState >= 2 && !v.paused);
        const local = playing.filter(v => getComputedStyle(v).transform !== 'none').length;
        return { total: playing.length, local, remote: playing.length - local };
    });
}

async function callStatus(page) {
    return page.evaluate(() => {
        const host = document.querySelector('[role="dialog"][aria-label*="Call With"], [role="region"][aria-label^="Call With"]');
        return host?.querySelector('[role="status"]')?.textContent?.trim() || null;
    });
}
const callOpen = page => page.locator('[role="dialog"][aria-label*="Call With"]').count().then(n => n > 0);
const incomingOpen = page => page.getByRole('button', { name: 'Accept Call', exact: true }).count().then(n => n > 0);

async function layoutReport(page, labels) {
    return page.evaluate(names => {
        const vw = document.documentElement.clientWidth;
        const vh = window.innerHeight;
        const boxes = {};
        for (const name of names) {
            const el = [...document.querySelectorAll(`[aria-label="${name}"]`)].find(e => e.getBoundingClientRect().width > 0);
            const r = el?.getBoundingClientRect();
            boxes[name] = r ? { x: Math.round(r.left), right: Math.round(r.right), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), inView: r.left >= 0 && r.right <= vw && r.top >= 0 && r.bottom <= vh } : null;
        }
        return { vw, vh, scrollWidth: document.documentElement.scrollWidth, boxes };
    }, labels);
}

export async function run() {
    validateCallProbeConfiguration(process.env);
    const evidenceDir = process.env.MESSENGER_EVIDENCE_DIR || 'test-results/messenger-calls-live';
    await mkdir(evidenceDir, { recursive: true });
    const report = { observedAt: new Date().toISOString(), expectedSha: process.env.MESSENGER_EXPECTED_SHA, status: 'running', checks: [], limitations: [], devices: {} };
    const record = (name, ok, detail = null) => { report.checks.push({ name, ok: !!ok, ...(detail ? { detail } : {}) }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` ${JSON.stringify(detail)}` : ''}`); };
    const livePages = new Map();
    // Content-free diagnostics: where each device is and which controls it
    // shows. No message text, names of other conversations or account data.
    const diagnose = async () => {
        const out = {};
        for (const [label, page] of livePages) {
            if (page.isClosed()) continue;
            out[label] = await page.evaluate(() => ({
                path: location.pathname,
                dialogs: [...document.querySelectorAll('[role="dialog"],[role="alertdialog"]')].map(d => (d.getAttribute('aria-label') || '').slice(0, 60)),
                buttons: [...document.querySelectorAll('button[aria-label]')].filter(b => b.getBoundingClientRect().width > 0).map(b => b.getAttribute('aria-label')).filter(l => !/\d{3,}/.test(l)).slice(0, 25),
                dock: document.querySelectorAll('.messenger-dock, .dock-chat').length,
                alerts: [...document.querySelectorAll('[role="alert"]')].map(a => (a.textContent || '').trim().slice(0, 80)).slice(0, 5),
            })).then(view => ({ ...view, httpErrors: page.__httpErrors || {} })).catch(error => ({ error: String(error?.message || error).slice(0, 120) }));
        }
        return out;
    };
    const step = async (name, fn) => {
        try { const detail = await fn(); record(name, true, detail || null); return true; }
        catch (error) { record(name, false, { error: String(error?.message || error).split('\n')[0].slice(0, 300), devices: await diagnose() }); return false; }
    };
    const shot = async (page, name) => { try { await page.screenshot({ path: `${evidenceDir}/${name}.png` }); } catch { /* evidence only */ } };

    const { createClient } = await import('@supabase/supabase-js');
    const clientOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
    const admin = createClient(AUTH_ORIGIN, process.env.SUPABASE_SERVICE_ROLE_KEY, clientOptions);
    const anon = () => createClient(AUTH_ORIGIN, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, clientOptions);
    const created = { users: [], conversations: [] };
    const probeIds = new Set();
    let browsers = [];

    try {
        // ── Revision under test ───────────────────────────────────────────
        const health = await (await fetch(`${APP_ORIGIN}/api/health`, { cache: 'no-store', signal: AbortSignal.timeout(20000) })).json();
        assert.equal(health.commitSha, process.env.MESSENGER_EXPECTED_SHA, 'Live revision differs from expected protected revision');
        report.deploymentId = health.deploymentId;

        // ── A: designated test account ────────────────────────────────────
        const signedA = await anon().auth.signInWithPassword({ email: process.env.TEST_USER_EMAIL, password: process.env.TEST_USER_PASSWORD });
        assert.ok(!signedA.error && signedA.data?.session?.access_token, 'Configured test account authentication failed; no fallback account was used');
        const sessionA = signedA.data.session;
        assert.equal(sessionA.user.email?.toLowerCase(), process.env.TEST_USER_EMAIL.toLowerCase(), 'Authenticated identity differs from configured test account');
        const A = sessionA.user.id;
        report.accountFingerprint = createHash('sha256').update(A).digest('hex').slice(0, 16);

        // ── B and C: throwaway identities ─────────────────────────────────
        const makeProbe = async (role, displayName) => {
            const email = probeEmail(role);
            const password = `${randomBytes(24).toString('base64url')}aA1!`;
            const username = `callprobe_${role}_${randomBytes(3).toString('hex')}`;
            const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { [PROBE_FLAG]: true, username } });
            assert.ok(!error && data?.user?.id, `Throwaway ${role.toUpperCase()} could not be created`);
            created.users.push(data.user.id);
            probeIds.add(data.user.id);
            await until(async () => (await admin.from('profiles').select('id').eq('id', data.user.id).maybeSingle()).data, { timeout: 20000, message: `Throwaway ${role.toUpperCase()} profile was not created` });
            const { error: profileError } = await admin.from('profiles').update({ username, display_name: displayName }).eq('id', data.user.id);
            assert.ok(!profileError, `Throwaway ${role.toUpperCase()} profile could not be named`);
            const signed = await anon().auth.signInWithPassword({ email, password });
            assert.ok(!signed.error && signed.data?.session?.access_token, `Throwaway ${role.toUpperCase()} could not sign in`);
            return { id: data.user.id, session: signed.data.session, name: displayName, username };
        };
        const B = await makeProbe('b', LONG_NAME);
        const C = await makeProbe('c', 'Call Probe Unrelated');

        const conversation = async (other) => {
            const { data, error } = await admin.from('social_conversations')
                .insert({ is_group: false, is_request: false, last_message_at: new Date().toISOString(), last_message_preview: 'Call Verification' })
                .select('id').maybeSingle();
            assert.ok(!error && data?.id, 'Synthetic conversation could not be created');
            created.conversations.push(data.id);
            const { error: partError } = await admin.from('social_conversation_participants').insert([{ conversation_id: data.id, user_id: A }, { conversation_id: data.id, user_id: other }]);
            assert.ok(!partError, 'Synthetic conversation participants could not be added');
            return data.id;
        };
        const AB = await conversation(B.id);
        const AC = await conversation(C.id);
        const t0 = new Date().toISOString();

        // ── Devices ───────────────────────────────────────────────────────
        const { chromium, webkit, devices } = await import('playwright');
        const chrome = await chromium.launch({ headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
        browsers.push(chrome);
        const device = async (browser, session, options, label) => {
            const context = await browser.newContext({ ...options, serviceWorkers: 'block' });
            if (browser === chrome) await context.grantPermissions(['camera', 'microphone'], { origin: APP_ORIGIN });
            await context.addInitScript(({ s }) => {
                localStorage.setItem('smarter-poker-auth', JSON.stringify(s));
                localStorage.setItem(`sp_firstrun_notif_v2_${s.user.id}`, String(Date.now()));
                sessionStorage.setItem('social-intro-seen', 'true');
            }, { s: session });
            const page = await context.newPage();
            page.setDefaultTimeout(20000);
            const errors = [];
            page.on('pageerror', error => errors.push(String(error?.message || error).slice(0, 160)));
            const httpErrors = {};
            page.on('response', response => {
                if (response.status() < 400) return;
                const url = new URL(response.url());
                if (url.origin !== APP_ORIGIN) return;
                const key = `${response.status()} ${url.pathname}`;
                httpErrors[key] = (httpErrors[key] || 0) + 1;
            });
            page.__httpErrors = httpErrors;
            report.devices[label] = { userAgent: options.userAgent || 'desktop-chromium', viewport: options.viewport };
            livePages.set(label.split(' ')[0], page);
            return { context, page, errors };
        };
        const a = await device(chrome, sessionA, { ...devices['Pixel 7'] }, 'A (Android Chrome emulation, test account)');
        const b = await device(chrome, B.session, { viewport: { width: 1280, height: 800 } }, 'B (desktop Chromium, throwaway)');
        const tokenRooms = [];
        a.page.on('request', request => {
            if (new URL(request.url()).pathname === '/api/livekit/token') { try { tokenRooms.push(request.postDataJSON()?.roomName); } catch { /* ignore */ } }
        });

        // B waits OUTSIDE Messenger.
        await b.page.goto(`${APP_ORIGIN}/hub`, { waitUntil: 'domcontentloaded' });
        await a.page.goto(`${APP_ORIGIN}/hub/messenger?conversation=${AB}`, { waitUntil: 'domcontentloaded' });
        await a.page.getByLabel('Start Video Call', { exact: true }).waitFor({ timeout: 60000 });
        await sleep(4000); // both realtime listeners joined

        await step('Mobile chat header: phone, video, search and info on screen with a long name', async () => {
            const layout = await layoutReport(a.page, ['Start Voice Call', 'Start Video Call', 'Search Messages', 'User Info', 'Back To Conversations']);
            for (const name of ['Start Voice Call', 'Start Video Call']) assert.ok(layout.boxes[name]?.inView && layout.boxes[name].w >= 40, `${name} not fully on screen`);
            assert.ok(layout.scrollWidth <= layout.vw, 'Page scrolls sideways');
            return layout;
        });

        // ── 1. Video call A -> B, answered outside Messenger ──────────────
        assertProbeCallee(B.id, probeIds);
        await a.page.getByLabel('Start Video Call', { exact: true }).click();
        await step('Callee rings outside Messenger (/hub) and caller sees Ringing...', async () => {
            await until(() => incomingOpen(b.page), { timeout: 20000, message: 'B never rang' });
            const status = await until(async () => { const s = await callStatus(a.page); return s === 'Ringing...' ? s : null; }, { timeout: 10000, message: 'Caller never showed Ringing...' });
            await shot(b.page, '01-incoming-outside-messenger');
            await shot(a.page, '01-caller-ringing');
            return { status, calleePath: new URL(b.page.url()).pathname };
        });
        await b.page.getByRole('button', { name: 'Accept Call', exact: true }).click();
        const connected = await step('Answered video call: two-way video and audio', async () => {
            const va = await until(async () => { const v = await videos(a.page); return v.remote >= 1 && v.local >= 1 ? v : null; }, { timeout: 30000, message: 'A never received B video' });
            const vb = await until(async () => { const v = await videos(b.page); return v.remote >= 1 && v.local >= 1 ? v : null; }, { timeout: 30000, message: 'B never received A video' });
            const audioAtA = await audioPeak(a.page);
            const audioAtB = await audioPeak(b.page);
            assert.ok(audioAtA.streams >= 1 && audioAtA.peak > 0.01, 'A hears nothing from B');
            assert.ok(audioAtB.streams >= 1 && audioAtB.peak > 0.01, 'B hears nothing from A');
            const timer = await until(async () => { const s = await callStatus(a.page); return /^\d+:\d{2}$/.test(s || '') ? s : null; }, { timeout: 10000, message: 'Call timer never started' });
            await shot(a.page, '02-video-call-caller');
            await shot(b.page, '02-video-call-callee');
            return { videoAtA: va, videoAtB: vb, audioPeakAtA: +audioAtA.peak.toFixed(3), audioPeakAtB: +audioAtB.peak.toFixed(3), timer };
        });

        if (connected) {
            await step('Mute silences the caller for the callee; unmute restores it', async () => {
                await a.page.getByLabel('Mute', { exact: true }).click();
                await sleep(2500);
                const muted = await audioPeak(b.page, 3000);
                await a.page.getByLabel('Unmute', { exact: true }).click();
                await sleep(2500);
                const unmuted = await audioPeak(b.page, 3000);
                assert.ok(muted.peak < 0.005, `B still hears A while muted (${muted.peak})`);
                assert.ok(unmuted.peak > 0.01, 'B does not hear A after unmute');
                return { mutedPeak: +muted.peak.toFixed(4), unmutedPeak: +unmuted.peak.toFixed(3) };
            });
            await step('Camera off removes the caller video for the callee; on restores it', async () => {
                await a.page.getByLabel('Turn Camera Off', { exact: true }).click();
                await until(async () => (await videos(b.page)).remote === 0, { timeout: 10000, message: 'B still sees A video with camera off' });
                await a.page.getByLabel('Turn Camera On', { exact: true }).click();
                await until(async () => (await videos(b.page)).remote >= 1, { timeout: 15000, message: 'A video did not return' });
                const flip = await a.page.getByLabel('Flip Camera', { exact: true }).count();
                return { flipButtonShown: flip > 0 };
            });
            report.limitations.push('Camera switching (front/back) needs a device with two cameras; the synthetic Chromium camera is single, so Flip Camera is correctly hidden and only camera on/off was exercised.');

            await step('Minimize, switch chats and leave Messenger during the call; audio continues; return to call', async () => {
                await a.page.getByLabel('Minimize Call', { exact: true }).click();
                await a.page.getByLabel('Return To Call', { exact: true }).waitFor();
                assert.equal(await callOpen(a.page), false, 'Full call screen still covers the page');
                await a.page.getByLabel(/^back to conversations$/i).click();
                await a.page.getByText('Call Probe Unrelated').first().click();
                await until(async () => (await a.page.locator('[data-messenger-chat-header]').textContent())?.includes('Call Probe Unrelated'), { message: 'Did not switch to the other chat' });
                const duringSwitch = await audioPeak(b.page, 2500);
                assert.ok(duringSwitch.peak > 0.01, 'Call audio stopped while switching chats');
                await a.page.evaluate(() => window.next?.router?.push('/hub'));
                await until(async () => new URL(a.page.url()).pathname === '/hub', { message: 'In-app navigation to /hub failed' });
                await a.page.getByLabel('Return To Call', { exact: true }).waitFor();
                const statusOnHub = await callStatus(a.page);
                const outside = await audioPeak(b.page, 2500);
                assert.ok(outside.peak > 0.01, 'Call audio stopped outside Messenger');
                await shot(a.page, '03-minimized-outside-messenger');
                await a.page.getByLabel('Return To Call', { exact: true }).click();
                await until(() => callOpen(a.page), { message: 'Call screen did not return' });
                return { statusOnHub };
            });
        }

        await step('Callee hangs up: caller screen closes; exactly one completed receipt from the caller', async () => {
            await b.page.getByLabel('End Call', { exact: true }).first().click();
            await until(async () => !(await callOpen(a.page)) && !(await a.page.getByLabel('Return To Call', { exact: true }).count()), { timeout: 10000, message: 'Caller screen stayed open' });
            const rows = await until(async () => { const { data } = await admin.from('social_messages').select('sender_id, content').eq('conversation_id', AB).like('content', '[CALL_RECEIPT]%').gte('created_at', t0); return data?.length >= 1 ? data : null; }, { timeout: 15000, message: 'No receipt written' });
            await sleep(3000);
            const { data: settled } = await admin.from('social_messages').select('sender_id, content').eq('conversation_id', AB).like('content', '[CALL_RECEIPT]%').gte('created_at', t0);
            assert.equal(settled.length, 1, `Expected exactly one receipt, found ${settled.length}`);
            const receipt = JSON.parse(settled[0].content.slice('[CALL_RECEIPT]'.length));
            assert.equal(settled[0].sender_id, A, 'Receipt not written by the caller');
            assert.equal(receipt.status, 'completed');
            assert.ok(receipt.duration > 0, 'Completed receipt has no duration');
            return { receipt, rowsSeen: rows.length };
        });

        // ── 2. Second incoming call without reload, declined (B ended the last call) ──
        await a.page.evaluate(id => window.next?.router?.push(`/hub/messenger?conversation=${id}`), AB);
        await a.page.getByLabel('Start Voice Call', { exact: true }).waitFor({ timeout: 30000 }).catch(async () => {
            await a.page.goto(`${APP_ORIGIN}/hub/messenger?conversation=${AB}`, { waitUntil: 'domcontentloaded' });
            await a.page.getByLabel('Start Voice Call', { exact: true }).waitFor({ timeout: 60000 });
        });
        await sleep(1500);
        assertProbeCallee(B.id, probeIds);
        await a.page.getByLabel('Start Voice Call', { exact: true }).click();
        await step('Second incoming call rings without reloading (callee ended the previous call); decline closes the caller', async () => {
            await until(() => incomingOpen(b.page), { timeout: 20000, message: 'Second call never rang - listener lost after hang-up' });
            const label = await b.page.locator('[role="alertdialog"]').getAttribute('aria-label');
            assert.match(label || '', /Incoming Voice Call/, 'Voice call announced as the wrong type');
            await b.page.getByRole('button', { name: 'Decline Call', exact: true }).click();
            await until(async () => !(await callOpen(a.page)), { timeout: 10000, message: 'Caller screen stayed open after decline' });
            return { announced: label };
        });

        // ── 3. Floating chat call, unanswered timeout (third call, still no reload) ──
        await a.page.evaluate(([actor, id]) => sessionStorage.setItem(`sp-messenger-dock-v1:${actor}`, JSON.stringify([{ id, minimized: false }])), [A, AB]);
        await a.page.goto(`${APP_ORIGIN}/hub/settings`, { waitUntil: 'domcontentloaded' });
        const dockVoice = a.page.getByLabel(`Voice Call ${LONG_NAME}`, { exact: true });
        const dockOk = await step('Floating chat shows phone and video buttons on a phone', async () => {
            await dockVoice.waitFor({ timeout: 60000 });
            const layout = await layoutReport(a.page, [`Voice Call ${LONG_NAME}`, `Video Call ${LONG_NAME}`]);
            for (const box of Object.values(layout.boxes)) assert.ok(box?.inView && box.w >= 36, 'Floating chat call button not on screen');
            await shot(a.page, '04-floating-chat-call-buttons');
            return layout;
        });
        if (dockOk) {
            assertProbeCallee(B.id, probeIds);
            await dockVoice.click();
            await step('Unanswered call from the floating chat times out as No Answer and stops ringing for the callee', async () => {
                await until(() => incomingOpen(b.page), { timeout: 20000, message: 'Third call never rang' });
                const started = Date.now();
                await until(async () => !(await callOpen(a.page)), { timeout: CALL_RING_TIMEOUT_MS + 20000, interval: 1000, message: 'Caller never timed out' });
                const waitedMs = Date.now() - started;
                await until(async () => !(await incomingOpen(b.page)), { timeout: 15000, message: 'Callee kept ringing after the caller timed out' });
                assert.ok(waitedMs >= CALL_RING_TIMEOUT_MS - 10000, `Timed out too early (${waitedMs}ms)`);
                return { waitedMs };
            });
        }

        // ── 4. Authorization ──────────────────────────────────────────────
        const abRoom = tokenRooms.find(room => typeof room === 'string' && room.includes(AB));
        await step('Unrelated user cannot join, start or fake a call', async () => {
            assert.ok(abRoom, 'No call room was captured');
            const asC = (path, body) => fetch(`${APP_ORIGIN}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${C.session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
            const join = await asC('/api/livekit/token', { roomName: abRoom, participantName: 'Intruder', participantId: C.id });
            const start = await asC('/api/calls/create', { calleeId: B.id, conversationId: AB, roomName: makeCallRoomName(AB), callType: 'video', callerName: 'Intruder' });
            const borrow = await asC('/api/calls/create', { calleeId: B.id, conversationId: AC, roomName: makeCallRoomName(AC), callType: 'video', callerName: 'Intruder' });
            const own = await asC('/api/livekit/token', { roomName: makeCallRoomName(AC), participantName: 'Call Probe Unrelated', participantId: C.id });
            assert.equal(join.status, 403, `Intruder token for A-B room returned ${join.status}`);
            assert.equal(start.status, 403, `Intruder call in A-B conversation returned ${start.status}`);
            assert.equal(borrow.status, 403, `Intruder call to B through A-C conversation returned ${borrow.status}`);
            assert.equal(own.status, 200, `Positive control: C token for its own conversation returned ${own.status}`);
            // A forged ring on B's public topic must not ring.
            const forger = createClient(AUTH_ORIGIN, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { ...clientOptions, global: { headers: { Authorization: `Bearer ${C.session.access_token}` } } });
            const channel = forger.channel(`call-signal:${B.id}`);
            const sent = await channel.httpSend('incoming_call', { roomName: makeCallRoomName(AB), callerId: C.id, callerName: 'Smarter.Poker Support', callType: 'video', conversationId: AB });
            await sleep(8000);
            const rang = await incomingOpen(b.page);
            await forger.removeChannel(channel);
            assert.equal(rang, false, 'A forged realtime ring was shown');
            return { join: join.status, start: start.status, borrow: borrow.status, ownConversation: own.status, forgedRingDelivered: sent?.success !== false, forgedRingShown: rang };
        });

        // ── 5. Unreachable, then answered from the push route on mobile WebKit ──
        await b.context.close();
        const reopened = await step('Caller reopens the conversation for the next call', async () => {
            await a.page.goto(`${APP_ORIGIN}/hub/messenger?conversation=${AB}`, { waitUntil: 'domcontentloaded' });
            await a.page.getByLabel('Start Video Call', { exact: true }).waitFor({ timeout: 60000 });
            await sleep(1500);
        });
        if (reopened) {
            assertProbeCallee(B.id, probeIds);
            await a.page.getByLabel('Start Video Call', { exact: true }).click();
        }
        const unreachable = reopened && await step('Offline callee with notifications off: caller sees Not Reachable Right Now and why', async () => {
            const status = await until(async () => { const s = await callStatus(a.page); return s === 'Not Reachable Right Now' ? s : null; }, { timeout: 15000, message: 'Not Reachable status never shown' });
            const explained = await a.page.getByText('Has Notifications Turned Off', { exact: false }).count();
            assert.ok(explained > 0, 'No explanation shown');
            await shot(a.page, '05-unreachable');
            const { data: pushes } = await admin.from('push_outbox').select('status, failure_reason, event').eq('recipient_user_id', B.id).eq('event', 'incoming_call').gte('created_at', t0);
            return { status, pushAttempts: (pushes || []).map(p => `${p.status}:${p.failure_reason || ''}`) };
        });
        let pushRoute = null;
        if (unreachable) {
            const { data: pending } = await admin.from('pending_calls').select('room_name').eq('caller_id', A).eq('callee_id', B.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
            pushRoute = pending?.room_name || null;
            let safari = null;
            try {
                const wk = await webkit.launch({ headless: true });
                browsers.push(wk);
                safari = await device(wk, B.session, { ...devices['iPhone 13'] }, 'B2 (WebKit iPhone 13 emulation, throwaway)');
            } catch (error) {
                report.limitations.push(`WebKit could not launch here: ${String(error?.message || error).split('\n')[0].slice(0, 160)}`);
            }
            const answering = safari || await device(chrome, B.session, { ...devices['Pixel 7'] }, 'B2 (Android Chrome emulation, throwaway)');
            await step(`Push Accept route answers the call (${safari ? 'mobile WebKit' : 'mobile Chromium'})`, async () => {
                assert.ok(pushRoute, 'No pending call to answer');
                await answering.page.goto(`${APP_ORIGIN}/hub/messenger?incomingCall=${encodeURIComponent(pushRoute)}&answer=1`, { waitUntil: 'domcontentloaded' });
                await until(() => callOpen(answering.page), { timeout: 30000, message: 'Push route did not open the call' });
                const atA = await until(async () => { const s = await callStatus(a.page); return /^\d+:\d{2}$/.test(s || '') || s === 'Waiting For Them To Join...' ? s : null; }, { timeout: 30000, message: 'Caller never saw the answer' });
                const received = await until(async () => { const v = await videos(answering.page); return v.remote >= 1 ? v : null; }, { timeout: 30000, message: 'Answering device received no video' }).catch(error => ({ error: error.message }));
                const heard = await audioPeak(answering.page, 3000).catch(() => ({ streams: 0, peak: 0 }));
                const sentBack = await videos(a.page);
                await shot(answering.page, '06-answered-from-push-route');
                if (safari) report.limitations.push('WebKit here is Playwright WebKit with iPhone 13 emulation on Linux, not Safari on an iPhone; it has no synthetic camera or microphone, so it can only receive.');
                return { statusAtCaller: atA, answeringReceivedVideo: received, answeringAudioPeak: +((heard.peak || 0).toFixed(3)), callerReceivesVideoFromAnswerer: sentBack.remote };
            });
            await a.page.getByLabel('End Call', { exact: true }).first().click().catch(() => {});
            await until(async () => !(await callOpen(answering.page)), { timeout: 15000, message: 'Answering device stayed in the call' }).catch(() => {});
        }

        // ── Exactly one receipt per call, exactly one missed-call notice ──
        await sleep(4000);
        await step('Exactly one receipt per call and one missed-call notice', async () => {
            const { data: receipts } = await admin.from('social_messages').select('sender_id, content, created_at').eq('conversation_id', AB).like('content', '[CALL_RECEIPT]%').gte('created_at', t0).order('created_at');
            const statuses = (receipts || []).map(r => JSON.parse(r.content.slice('[CALL_RECEIPT]'.length)).status);
            const senders = new Set((receipts || []).map(r => r.sender_id));
            const { data: notices } = await admin.from('notifications').select('type, actor_id').eq('user_id', B.id).eq('type', 'missed_call').gte('created_at', t0);
            const expected = ['completed', 'declined', ...(dockOk ? ['missed'] : []), ...(unreachable ? ['completed'] : [])];
            assert.deepEqual(statuses, expected, `Receipts were ${JSON.stringify(statuses)}`);
            assert.ok(senders.size === 1 && senders.has(A), 'A receipt was written by the callee');
            assert.equal((notices || []).length, dockOk ? 1 : 0, `Missed-call notices: ${(notices || []).length}`);
            return { receipts: statuses, missedCallNotices: (notices || []).length };
        });

        // ── Narrow phone layouts with real components ─────────────────────
        const narrow = await device(chrome, sessionA, { ...devices['iPhone SE'], userAgent: devices['Pixel 7'].userAgent }, 'A narrow (320x568 Chromium)');
        await narrow.page.setViewportSize({ width: 320, height: 568 });
        await step('320px: call buttons, composer and Send on screen; keyboard-height viewport keeps the composer', async () => {
            await narrow.page.goto(`${APP_ORIGIN}/hub/messenger?conversation=${AB}`, { waitUntil: 'domcontentloaded' });
            await narrow.page.getByLabel('Start Voice Call', { exact: true }).waitFor({ timeout: 60000 });
            const header = await layoutReport(narrow.page, ['Start Voice Call', 'Start Video Call', 'User Info']);
            for (const name of ['Start Voice Call', 'Start Video Call']) assert.ok(header.boxes[name]?.inView, `${name} off screen at 320px`);
            const composer = narrow.page.getByLabel('Message', { exact: true });
            await composer.click();
            await composer.fill('Layout Check '.repeat(12));
            const typed = await layoutReport(narrow.page, ['Send Message', 'Choose Emoji', 'Send Photo Or Video']);
            assert.ok(typed.boxes['Send Message']?.inView, 'Send off screen at 320px');
            assert.ok(typed.scrollWidth <= typed.vw, 'Page scrolls sideways at 320px');
            await narrow.page.setViewportSize({ width: 320, height: 300 }); // keyboard open
            await sleep(800);
            const keyboard = await layoutReport(narrow.page, ['Send Message', 'Message']);
            assert.ok(keyboard.boxes['Send Message']?.inView, 'Send hidden with the keyboard open');
            await composer.fill('');
            return { header: header.boxes, typed: typed.boxes['Send Message'], keyboard: keyboard.boxes };
        });
        report.limitations.push('The on-screen keyboard is emulated by shrinking the viewport to 300px; a real iOS/Android keyboard was not opened.');
        report.limitations.push('Real push notifications to a phone were not delivered: throwaway accounts have no push subscription (by design, so no real phone rings). The server push enqueue was read back and the Accept destination route was exercised instead.');

        const pageErrors = Object.fromEntries([['A', a.errors], ['narrow', narrow.errors]].map(([k, v]) => [k, v.length]));
        report.pageErrors = pageErrors;
        report.httpErrors = Object.fromEntries([...livePages].map(([label, page]) => [label, page.__httpErrors || {}]));
        const failed = report.checks.filter(check => !check.ok);
        report.status = failed.length ? 'failed' : 'passed';
        if (failed.length) process.exitCode = 1;
        const finalHealth = await (await fetch(`${APP_ORIGIN}/api/health`, { cache: 'no-store' })).json();
        report.finalCommit = finalHealth.commitSha;
    } catch (error) {
        report.status = 'failed';
        report.failure = String(error?.message || error).split('\n')[0].slice(0, 300);
        console.error(report.failure);
        process.exitCode = 1;
    } finally {
        for (const browser of browsers) { try { await browser.close(); } catch { /* closing */ } }
        // Cleanup: everything this run created, then the throwaway users, confirmed gone.
        const cleanup = {};
        try {
            const users = created.users;
            if (created.conversations.length) {
                cleanup.messages = (await admin.from('social_messages').delete().in('conversation_id', created.conversations)).error?.message || 'ok';
                cleanup.participants = (await admin.from('social_conversation_participants').delete().in('conversation_id', created.conversations)).error?.message || 'ok';
                cleanup.conversations = (await admin.from('social_conversations').delete().in('id', created.conversations)).error?.message || 'ok';
            }
            if (users.length) {
                cleanup.pendingCalls = (await admin.from('pending_calls').delete().or(`caller_id.in.(${users.join(',')}),callee_id.in.(${users.join(',')})`)).error?.message || 'ok';
                cleanup.notifications = (await admin.from('notifications').delete().or(`user_id.in.(${users.join(',')}),actor_id.in.(${users.join(',')})`)).error?.message || 'ok';
                cleanup.pushOutbox = (await admin.from('push_outbox').delete().in('recipient_user_id', users)).error?.message || 'ok';
                for (const id of users) {
                    const { error } = await admin.auth.admin.deleteUser(id);
                    const { data } = await admin.auth.admin.getUserById(id);
                    cleanup[`user_${users.indexOf(id) === 0 ? 'b' : 'c'}`] = !error && !data?.user?.id ? 'deleted' : `NOT DELETED: ${error?.message || 'still present'}`;
                    await admin.from('profiles').delete().eq('id', id);
                }
            }
        } catch (error) {
            cleanup.error = String(error?.message || error).slice(0, 200);
        }
        report.cleanup = cleanup;
        if (Object.values(cleanup).some(value => typeof value === 'string' && value !== 'ok' && value !== 'deleted')) {
            report.status = 'failed';
            process.exitCode = 1;
        }
        await writeFile(`${evidenceDir}/result.json`, JSON.stringify(report, null, 2));
        console.log(JSON.stringify({ status: report.status, checks: report.checks.map(c => `${c.ok ? 'PASS' : 'FAIL'} ${c.name}`), cleanup }, null, 2));
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    if (process.argv.includes('--self-test')) selfTest();
    else await run();
}
