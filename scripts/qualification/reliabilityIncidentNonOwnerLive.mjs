// Manually invoked production proof that a signed-in NON-owner cannot read a
// Reliability Controller incident, at the API boundary and on the page.
// Uses the existing CI test identity; does not publish, create accounts,
// schedule work, change any row or reveal credentials. Fails closed: if the
// configured identity were ever the alert recipient, the RPC would return the
// incident and the refusal assertion below would fail.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import { isDedicatedProbeAccount } from '../../src/lib/probeIdentity.js';

const base = 'https://smarter.poker';
const incidentId = '17b7b46a-9a6f-424e-b0fa-6f99533e711c';
// Text that only an authorized read of this incident could put on the wire.
const INCIDENT_TEXT = ['HorseFleetCollapsed'];
const INCIDENT_FIELDS = ['incident_id', 'incident_class', 'title', 'alertname', 'scope', 'labels', 'events', 'handoff'];
const NOT_AUTHORIZED_TITLE = 'Not Authorized';
const NOT_AUTHORIZED_DETAIL = 'This Incident Is Only Available To The Platform Alert Recipient. Nothing About It Is Shown To This Account.';

const expected = String(process.env.RELIABILITY_EXPECTED_REVISION || '').trim();
if (expected) assert.match(expected, /^[0-9a-f]{40}$/);
const evidence = process.env.RELIABILITY_NON_OWNER_EVIDENCE_DIR;
assert(evidence && path.isAbsolute(evidence), 'An explicit evidence directory is required');
fs.mkdirSync(evidence, { recursive: true });
const email = String(process.env.TEST_USER_EMAIL || '').trim();
assert(isDedicatedProbeAccount(email), 'The configured CI identity must be a dedicated probe or platform service');
assert(process.env.TEST_USER_PASSWORD, 'Existing CI test password is required');
const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
assert(supabaseUrl && anonKey, 'The publishable Supabase URL and key are required');
const client = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const report = { startedAt: new Date().toISOString(), base, incidentId, expectedRevision: expected || null, mockedRequests: false, cases: [], status: 'running' };
const pass = (name, observations = {}) => { report.cases.push({ name, status: 'passed', ...observations }); console.log(`PASS ${name} ${JSON.stringify(observations)}`); };
const leaks = (text) => INCIDENT_TEXT.filter((needle) => text.includes(needle));
let session; let browser;
try {
    const health = await (await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(20_000) })).json();
    report.health = { commitSha: health.commitSha };
    if (expected) assert.equal(health.commitSha, expected);
    pass('Production serving identity recorded', { commitSha: health.commitSha });

    const signedIn = await client.auth.signInWithPassword({ email, password: process.env.TEST_USER_PASSWORD });
    assert(!signedIn.error && signedIn.data?.session, 'Configured CI test authentication must succeed');
    session = signedIn.data.session;
    const verified = await client.auth.getUser(session.access_token);
    assert(!verified.error && verified.data.user.id === signedIn.data.user.id, 'Verified test identity must agree');
    pass('Configured CI test identity signed in');

    // 1. The RPC exactly as the app calls it: publishable key plus the user's token.
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/fn_reliability_incident_for_owner`, {
        method: 'POST', signal: AbortSignal.timeout(20_000),
        headers: { apikey: anonKey, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ p_incident_id: incidentId }),
    });
    const raw = await response.text();
    let payload = null;
    try { payload = JSON.parse(raw); } catch { payload = null; }
    report.rpc = { status: response.status, code: payload?.code ?? null, keys: payload && typeof payload === 'object' ? Object.keys(payload) : null };
    assert.equal(response.status, 403, `RPC must be refused for a non-owner, got HTTP ${response.status}`);
    assert(payload && typeof payload === 'object' && !Array.isArray(payload), 'RPC refusal must be a PostgREST error object');
    assert.equal(payload.code, '42501');
    assert.deepEqual(Object.keys(payload).filter((key) => !['code', 'message', 'details', 'hint'].includes(key)), []);
    assert.deepEqual(INCIDENT_FIELDS.filter((field) => raw.includes(`"${field}"`)), []);
    assert.deepEqual(leaks(raw), []);
    pass('RPC refuses the non-owner with 42501 and returns no incident fields', { httpStatus: response.status, errorCode: payload.code });

    // 2. The page, signed in, at 375x812.
    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, serviceWorkers: 'block' });
    await context.addInitScript(({ authSession }) => { localStorage.setItem('smarter-poker-auth', JSON.stringify(authSession)); }, { authSession: session });
    const page = await context.newPage();
    const crashes = []; page.on('pageerror', (error) => crashes.push(error.message));
    const rpcBodies = [];
    page.on('response', async (res) => {
        if (!res.url().includes('/rest/v1/rpc/fn_reliability_incident_for_owner')) return;
        rpcBodies.push({ status: res.status(), body: await res.text().catch(() => '') });
    });
    await page.goto(`${base}/hub/reliability/incidents/${incidentId}`, { waitUntil: 'domcontentloaded' });
    const view = page.locator('[data-testid="reliability-incident"][data-state="not_authorized"]');
    await view.waitFor({ timeout: 45_000 });
    await page.getByRole('heading', { name: NOT_AUTHORIZED_TITLE, exact: true }).waitFor();
    await page.getByText(NOT_AUTHORIZED_DETAIL, { exact: true }).waitFor();
    pass('Page shows its not-authorized state', { title: NOT_AUTHORIZED_TITLE, detailFound: true });

    await page.waitForTimeout(1_000);
    const html = await page.content();
    const visible = await page.evaluate(() => document.body.innerText);
    assert.deepEqual(leaks(html), []); assert.deepEqual(leaks(visible), []);
    assert.equal(await page.locator('[data-testid="incident-handoff"]').count(), 0);
    assert(rpcBodies.length >= 1, 'The page must have asked the RPC');
    for (const { status, body } of rpcBodies) { assert.equal(status, 403); assert.deepEqual(leaks(body), []); }
    pass('Page carries none of the incident text', { checked: INCIDENT_TEXT, pageRpcStatuses: rpcBodies.map((r) => r.status) });

    const geometry = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    await page.screenshot({ path: path.join(evidence, 'reliability-incident-non-owner-375.png') });
    assert.equal(geometry.scrollWidth, geometry.clientWidth, 'Page must not overflow horizontally at 375px');
    assert.deepEqual(crashes, []);
    pass('Not-authorized page has no horizontal overflow or page crashes at 375x812', geometry);
    report.status = 'passed';
} catch (error) {
    report.status = 'failed'; report.error = error.message; process.exitCode = 1;
} finally {
    if (browser) await browser.close();
    if (session) await client.auth.signOut({ scope: 'local' });
    report.completedAt = new Date().toISOString();
    fs.writeFileSync(path.join(evidence, 'reliability-incident-non-owner.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ status: report.status, cases: report.cases.length, rpc: report.rpc, error: report.error }));
}
