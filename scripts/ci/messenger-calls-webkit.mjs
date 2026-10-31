#!/usr/bin/env node
/*
 * Focused WebKit call verification (suite messenger-calls-webkit).
 *
 * Run 41236048552 classified mobile WebKit as BLOCKED: Playwright 1.62.1's
 * WebKit (r2336) logged "Invalid TURN URL query string" and LiveKit's signal
 * join failed. That matches WebKit bug 320931 (regression 316873@main, fixed
 * 319365@main on 2026-08-18). This suite checks the attribution instead of
 * assuming it, against more than one WebKit build:
 *
 *   1. Constructor matrix: new RTCPeerConnection() with TURN URLs with and
 *      without ?transport=. No server, no credentials. A build carrying the
 *      regression throws on the query string; a fixed build accepts it.
 *   2. End-to-end: throwaway B (Chromium, synthetic camera and microphone)
 *      video-calls throwaway C (this WebKit build, iPhone 13 emulation). An
 *      init script records the ICE server URLs LiveKit hands RTCPeerConnection
 *      (scheme, host, port and query only; username and credential are never
 *      read) and whether construction threw.
 *
 * Only throwaway example.com users take part: the designated test account is
 * not signed in and no real contact is involved. Everything is hard-deleted.
 *
 * PLAYWRIGHT_WEBKIT_BUILDS is a JSON array of { label, module } where module
 * is the path of a playwright package to import for that build.
 */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
    APP_ORIGIN, sleep, until, clients, assertLiveRevision, createProbeUser, createConversation,
    cleanup, cleanupFailed, audioPeak, videos, callStatus, incomingOpen, openDevice,
} from './messenger-calls-lib.mjs';

const RESULT_DIR = 'test-results/messenger-calls-webkit';

export const TURN_CASES = [
    { name: 'turn with ?transport=udp', urls: 'turn:turn.example.com:3478?transport=udp' },
    { name: 'turns with ?transport=tcp', urls: 'turns:turn.example.com:443?transport=tcp' },
    { name: 'turn without query', urls: 'turn:turn.example.com:3478' },
    { name: 'stun', urls: 'stun:stun.example.com:3478' },
];

/** Strip everything but scheme, host, port and query from an ICE URL. */
export function sanitizeIceUrl(url) {
    const match = /^(stuns?|turns?):([^?#\s]+)(\?[^#\s]*)?$/i.exec(String(url || '').trim());
    if (!match) return 'unparseable';
    const hostPort = match[2].replace(/^[^@]*@/, '');
    return `${match[1].toLowerCase()}:${hostPort}${match[3] || ''}`;
}

// Runs in the page before any app script. Records ICE server URLs only.
const ICE_RECORDER = `(() => {
    const sanitize = ${sanitizeIceUrl.toString()};
    const log = [];
    window.__iceLog = log;
    const Native = window.RTCPeerConnection;
    if (!Native) { log.push({ unavailable: true }); return; }
    const record = (config, outcome) => {
        const urls = [];
        for (const server of (config && config.iceServers) || []) {
            for (const u of [].concat(server.urls || server.url || [])) urls.push(sanitize(u));
        }
        log.push({ at: Date.now(), urls, transportPolicy: config && config.iceTransportPolicy || 'all', ...outcome });
    };
    function Wrapped(config, ...rest) {
        try { const pc = new Native(config, ...rest); record(config, { ok: true }); return pc; }
        catch (error) { record(config, { ok: false, error: (error && error.name) + ': ' + String(error && error.message).slice(0, 160) }); throw error; }
    }
    Wrapped.prototype = Native.prototype;
    Object.setPrototypeOf(Wrapped, Native);
    window.RTCPeerConnection = Wrapped;
})();`;

async function constructorMatrix(page) {
    return page.evaluate(cases => cases.map(({ name, urls }) => {
        try {
            const pc = new RTCPeerConnection({ iceServers: [{ urls, username: 'probe', credential: 'probe' }] });
            pc.close();
            return { name, urls, accepted: true };
        } catch (error) {
            return { name, urls, accepted: false, error: `${error?.name}: ${String(error?.message).slice(0, 160)}` };
        }
    }), TURN_CASES);
}

async function verifyBuild(build, ctx) {
    const { chromePage, B, C, conversationId, report } = ctx;
    const out = { label: build.label, module: build.module };
    report.builds.push(out);
    const playwright = await import(pathToFileURL(build.module).href);
    out.playwrightVersion = (await import(pathToFileURL(build.module.replace(/index\.(m?js)$/, 'package.json')).href, { with: { type: 'json' } }).catch(() => ({ default: {} }))).default.version || null;
    const browser = await playwright.webkit.launch({ headless: true });
    try {
        out.webkitVersion = browser.version();
        const { context, page } = await openDevice(browser, C.session, { ...playwright.devices['iPhone 13'] }, { initScript: ICE_RECORDER });
        const consoleLines = [];
        page.on('console', msg => { const text = msg.text(); if (/turn|ice|livekit|rtc|signal|connect/i.test(text)) consoleLines.push(`${msg.type()}: ${text.slice(0, 200)}`); });
        await page.goto(`${APP_ORIGIN}/hub`, { waitUntil: 'domcontentloaded' });
        out.userAgent = await page.evaluate(() => navigator.userAgent);
        out.constructorMatrix = await constructorMatrix(page);
        out.capture = await page.evaluate(async () => {
            try { const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: true }); const kinds = s.getTracks().map(t => t.kind); s.getTracks().forEach(t => t.stop()); return { ok: true, kinds }; }
            catch (error) { return { ok: false, error: `${error?.name}: ${String(error?.message).slice(0, 120)}` }; }
        });
        await sleep(5000); // C's realtime listener joined

        // B calls C from the shared thread.
        await chromePage.goto(`${APP_ORIGIN}/hub/messenger?conversation=${conversationId}`, { waitUntil: 'domcontentloaded' });
        await chromePage.getByLabel('Start Video Call', { exact: true }).waitFor({ timeout: 60000 });
        await sleep(3000);
        await chromePage.getByLabel('Start Video Call', { exact: true }).click();
        out.rang = await until(() => incomingOpen(page), { timeout: 25000, message: 'C never rang' }).then(() => true, () => false);
        if (out.rang) {
            await page.getByRole('button', { name: 'Accept Call', exact: true }).click();
            const sound = page.getByRole('button', { name: /Tap To Turn On Sound/i });
            await sleep(2000);
            if (await sound.count()) await sound.first().click().catch(() => {});
            const received = await until(async () => { const v = await videos(page); return v.remote >= 1 ? v : null; }, { timeout: 45000 }).catch(() => null);
            out.webkitReceivedVideo = received;
            out.webkitReceivedAudio = received ? await audioPeak(page, 2500) : null;
            out.chromiumView = await videos(chromePage);
            out.webkitStatus = await callStatus(page);
            out.chromiumStatus = await callStatus(chromePage);
        }
        out.iceLog = await page.evaluate(() => window.__iceLog || []);
        out.console = consoleLines.slice(-25);
        await page.screenshot({ path: `${RESULT_DIR}/${build.label}-webkit.png` }).catch(() => {});
        // End the call from B and let both sides settle.
        const end = chromePage.getByLabel('End Call', { exact: true });
        if (await end.count()) await end.first().click().catch(() => {});
        await sleep(4000);
        await context.close();
    } finally {
        await browser.close();
    }
    const rejectsQuery = out.constructorMatrix.filter(c => /\?transport=/.test(c.urls)).some(c => !c.accepted);
    const plainAccepted = out.constructorMatrix.filter(c => !/\?/.test(c.urls)).every(c => c.accepted);
    out.carriesBug320931 = rejectsQuery && plainAccepted;
    out.liveKitUrlsCarryTransportQuery = out.iceLog.some(entry => (entry.urls || []).some(u => /\?transport=/.test(u)));
    out.callConnected = Boolean(out.webkitReceivedVideo && out.webkitReceivedAudio?.peak > 0.01);
    return out;
}

export function attribute(builds) {
    const buggy = builds.filter(b => b.carriesBug320931);
    const fixed = builds.filter(b => !b.carriesBug320931);
    if (!buggy.length) return { conclusion: 'no-build-reproduced-320931', detail: 'No tested WebKit build rejected ?transport= TURN URLs.' };
    const buggyFailed = buggy.every(b => !b.callConnected);
    const fixedConnected = fixed.length > 0 && fixed.every(b => b.callConnected);
    if (buggyFailed && fixedConnected) return { conclusion: 'solely-320931', detail: `Builds rejecting ?transport= (${buggy.map(b => b.webkitVersion).join(', ')}) failed to connect; fixed builds (${fixed.map(b => b.webkitVersion).join(', ')}) connected with the same app revision, accounts and LiveKit URLs.` };
    if (buggyFailed && fixed.length && !fixedConnected) return { conclusion: 'not-solely-320931', detail: 'A WebKit build that accepts ?transport= still failed to connect; something besides bug 320931 is involved.' };
    return { conclusion: 'inconclusive', detail: 'The tested builds do not separate bug 320931 from other causes.' };
}

async function main() {
    for (const name of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'MESSENGER_EXPECTED_SHA', 'PLAYWRIGHT_WEBKIT_BUILDS']) assert.ok(process.env[name]?.trim(), `${name} is required`);
    const builds = JSON.parse(process.env.PLAYWRIGHT_WEBKIT_BUILDS);
    assert.ok(Array.isArray(builds) && builds.length && builds.every(b => /^[a-z0-9.-]+$/i.test(b.label) && b.module), 'PLAYWRIGHT_WEBKIT_BUILDS must list { label, module }');
    mkdirSync(RESULT_DIR, { recursive: true });
    const report = { suite: 'messenger-calls-webkit', startedAt: new Date().toISOString(), builds: [], cleanup: null };
    const created = { users: [], conversations: [] };
    const sb = await clients();
    let chrome;
    try {
        report.health = await assertLiveRevision();
        const B = await createProbeUser(sb, created, 'wkb', 'WebKit Verification Caller');
        const C = await createProbeUser(sb, created, 'wkc', 'WebKit Verification Callee');
        const conversationId = await createConversation(sb.admin, created, B.id, C.id, { senderId: C.id, content: 'WebKit Verification Thread' });
        const { chromium } = await import('playwright');
        chrome = await chromium.launch({ headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
        report.chromiumVersion = chrome.version();
        const { page: chromePage } = await openDevice(chrome, B.session, { viewport: { width: 1280, height: 800 } }, { grantMedia: true });
        for (const build of builds) {
            try { await verifyBuild(build, { chromePage, B, C, conversationId, report }); }
            catch (error) { report.builds.push({ label: build.label, error: String(error?.message || error).slice(0, 300) }); }
        }
        report.attribution = attribute(report.builds.filter(b => b.constructorMatrix));
    } catch (error) {
        report.error = String(error?.message || error).slice(0, 300);
    } finally {
        await chrome?.close().catch(() => {});
        report.cleanup = await cleanup(sb.admin, created);
        report.finishedAt = new Date().toISOString();
        writeFileSync(`${RESULT_DIR}/result.json`, JSON.stringify(report, null, 2));
        console.log(JSON.stringify({ attribution: report.attribution, builds: report.builds.map(b => ({ label: b.label, webkit: b.webkitVersion, carriesBug320931: b.carriesBug320931, callConnected: b.callConnected, error: b.error })), cleanup: report.cleanup, error: report.error }, null, 2));
    }
    if (report.error || cleanupFailed(report.cleanup) || !report.attribution) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    if (process.argv.includes('--self-test')) {
        assert.equal(sanitizeIceUrl('turn:user:pw@turn.example.com:3478?transport=udp'), 'turn:turn.example.com:3478?transport=udp');
        assert.equal(sanitizeIceUrl('TURNS:host.example:443?transport=tcp'), 'turns:host.example:443?transport=tcp');
        assert.equal(sanitizeIceUrl('https://x'), 'unparseable');
        assert.equal(attribute([{ carriesBug320931: true, callConnected: false, webkitVersion: '26.5' }, { carriesBug320931: false, callConnected: true, webkitVersion: '27.2' }]).conclusion, 'solely-320931');
        assert.equal(attribute([{ carriesBug320931: true, callConnected: false }, { carriesBug320931: false, callConnected: false }]).conclusion, 'not-solely-320931');
        console.log('messenger-calls-webkit self-test passed');
    } else {
        await main();
    }
}
