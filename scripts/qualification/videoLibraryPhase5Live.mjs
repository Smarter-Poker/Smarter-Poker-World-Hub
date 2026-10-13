// Manually invoked affected-release proof. Uses the existing CI test identity;
// does not publish, create accounts, schedule work or reveal credentials.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import { isDedicatedProbeAccount } from '../../src/lib/probeIdentity.js';

const base = 'https://smarter.poker';
const channelId = '2abde3a3-86b6-4552-9600-e4256aae0c47';
const expected = process.env.VIDEO_CHANNEL_EXPECTED_REVISION;
assert.match(expected || '', /^[0-9a-f]{40}$/);
const evidence = process.env.VIDEO_CHANNEL_LIVE_EVIDENCE_DIR;
assert(evidence && path.isAbsolute(evidence), 'An explicit evidence directory is required');
fs.mkdirSync(evidence, { recursive: true });
const email = String(process.env.TEST_USER_EMAIL || '').trim();
assert(isDedicatedProbeAccount(email), 'The configured CI identity must be a dedicated probe or platform service');
assert(process.env.TEST_USER_PASSWORD, 'Existing CI test password is required');
const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const report = { startedAt: new Date().toISOString(), base, expectedRevision: expected, mockedRequests: false, cases: [], status: 'running' };
let session; let ownerId; let prior; let browser;
async function request(route, body) {
    const response = await fetch(`${base}${route}`, { method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(20_000),
        headers: { Authorization: `Bearer ${session.access_token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const payload = await response.json();
    return { status: response.status, payload };
}
async function read() {
    const result = await request(`/api/video-library/channel-follow?channelId=${channelId}&expectedOwnerId=${ownerId}`);
    assert.equal(result.status, 200); assert.equal(result.payload.success, true); assert.equal(result.payload.ownerId, ownerId); return result.payload;
}
async function set(following, notificationsEnabled) {
    const result = await request('/api/video-library/channel-follow', { channelId, expectedOwnerId: ownerId, following, notificationsEnabled });
    assert.equal(result.status, 200); assert.equal(result.payload.ownerId, ownerId); assert.equal(result.payload.channelId, channelId);
    assert.equal(result.payload.following, following); assert.equal(result.payload.notificationsEnabled, following && notificationsEnabled);
    return result.payload;
}
const pass = (name, observations = {}) => report.cases.push({ name, status: 'passed', ...observations });
try {
    const health = await (await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(20_000) })).json();
    assert.equal(health.commitSha, expected); report.health = health; pass('Exact published serving identity');
    const signedIn = await client.auth.signInWithPassword({ email, password: process.env.TEST_USER_PASSWORD });
    assert(!signedIn.error && signedIn.data?.session, 'Configured CI test authentication must succeed');
    session = signedIn.data.session; ownerId = signedIn.data.user.id;
    const verified = await client.auth.getUser(session.access_token);
    assert(!verified.error && verified.data.user.id === ownerId && verified.data.user.email.toLowerCase() === email.toLowerCase(), 'Verified test identity must agree');
    const profile = await client.from('profiles').select('id,display_name,role').eq('id', ownerId).maybeSingle();
    assert(!profile.error && profile.data, 'Configured test profile must exist');
    if (!email.toLowerCase().endsWith('@probe.smarter.poker')) assert(profile.data.display_name === 'Smarter.Poker Official' && profile.data.role === 'god', 'Service identity must be the canonical official account');
    report.ownerId = ownerId; pass('Dedicated configured test identity verified');
    prior = await read();
    await Promise.all([set(true, true), set(true, true)]);
    const following = await read(); assert(following.following && following.notificationsEnabled); pass('Repeated desired-state follows persist one authoritative choice');
    const wrong = await request('/api/video-library/channel-follow', { channelId, expectedOwnerId: '11111111-1111-4111-8111-111111111111', following: false, notificationsEnabled: false });
    assert.equal(wrong.status, 409); assert.equal((await read()).following, true); pass('Cross-account mutation refused without changing state');
    const rows = await client.from('video_library_channel_follows').select('source_id,notifications_enabled').eq('source_id', channelId);
    assert(!rows.error); assert.equal(rows.data.length, 1); pass('Authenticated RLS read exposes only own single follow');
    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 393, height: 852 }, serviceWorkers: 'block' });
    await context.addInitScript(({ authSession }) => { localStorage.setItem('smarter-poker-auth', JSON.stringify(authSession)); }, { authSession: session });
    const page = await context.newPage();
    const crashes = []; page.on('pageerror', error => crashes.push(error.message));
    await page.goto(`${base}/hub/video-library/channels/${channelId}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Hustler Casino Live', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Unfollow Channel', exact: true }).waitFor({ timeout: 30_000 });
    const bell = page.getByRole('checkbox', { name: 'Notify Me About New Videos' });
    assert(await bell.isChecked());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Unfollow Channel', exact: true }).waitFor({ timeout: 30_000 });
    assert(await bell.isChecked()); pass('Native published channel shows persisted follow and notification preference after reload');
    await bell.click();
    await page.waitForFunction(() => { const input = document.querySelector('.vl-channel-notifications input'); return input && !input.disabled && !input.checked; });
    assert.equal((await read()).notificationsEnabled, false); pass('Native notification opt-out reaches persisted authoritative state');
    await page.screenshot({ path: path.join(evidence, 'live-channel-authenticated-393.png') });
    const geometry = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    assert.equal(geometry.width, geometry.scrollWidth); assert.deepEqual(crashes, []); pass('Authenticated channel has no horizontal overflow or page crashes', geometry);
    await page.getByRole('button', { name: 'Unfollow Channel', exact: true }).click();
    await page.getByRole('button', { name: 'Follow Channel', exact: true }).waitFor({ timeout: 30_000 });
    assert.equal((await read()).following, false); pass('Native unfollow reaches persisted authoritative state');
    report.status = 'passed';
} catch (error) {
    report.status = 'failed'; report.error = error.message; process.exitCode = 1;
} finally {
    if (browser) await browser.close();
    if (session && prior) {
        try { await set(prior.following, prior.notificationsEnabled); const restored = await read(); assert.equal(restored.following, prior.following); assert.equal(restored.notificationsEnabled, prior.notificationsEnabled); report.restored = true; }
        catch { report.restored = false; report.status = 'failed'; report.cleanupError = 'Original follow state could not be restored'; process.exitCode = 1; }
    }
    if (session) await client.auth.signOut({ scope: 'local' });
    report.completedAt = new Date().toISOString();
    fs.writeFileSync(path.join(evidence, 'phase5-live-authenticated.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ status: report.status, cases: report.cases.length, restored: report.restored, error: report.error, cleanupError: report.cleanupError }));
}
