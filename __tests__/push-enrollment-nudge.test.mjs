/**
 * PUSH ENROLLMENT: WHEN WE MAY ASK, AND WHO THE SILENT SYNC MAY ENROLL
 * (2026-09-27).
 *
 * Production, 2026-09-27: 218 human profiles, 4 accounts ever enrolled. The
 * old flow asked once, 20 seconds after landing, and recorded ANY answer
 * (including Not Now) permanently. The new policy asks at meaningful moments
 * with a cool-down. These tests RUN the policy and the repair gate.
 *
 * Run: node --test __tests__/push-enrollment-nudge.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
    decideNudge, recordDismissed, recordShown, parseLedger, readNudgeState, writeLedger,
    ledgerKey, legacyAskedKey, OWNER_USER_ID, COOLDOWNS_MS, MAX_DISMISSALS, NUDGE_MOMENTS,
} from '../src/lib/push/enrollment-nudge.mjs';
import { hasRepairableEnrollment, isSystemRetirement, endpointIsExpired } from '../src/lib/push/subscription-repair.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DAY = 86_400_000;
const NOW = Date.parse('2026-09-27T16:00:00Z');
const PLAYER = '00000000-0000-4000-8000-000000000001';
const READY = { supported: true, iosNeedsInstall: false, permission: 'default', subscribed: false, optedOut: false };
const EMPTY = parseLedger(null);

const decide = (over = {}) => decideNudge({ userId: PLAYER, moment: 'club_joined', now: NOW, ledger: EMPTY, device: READY, ...over });

test('a fresh player on a capable device is asked at a meaningful moment', () => {
    for (const moment of NUDGE_MOMENTS) assert.deepEqual(decide({ moment }), { show: true, variant: 'ask' });
});

test('never asks when there is nothing a person could say yes to', () => {
    assert.equal(decide({ userId: null }).reason, 'signed_out');
    assert.equal(decide({ device: { ...READY, subscribed: true } }).reason, 'already_on');
    assert.equal(decide({ device: { ...READY, optedOut: true } }).reason, 'opted_out');
    assert.equal(decide({ device: { ...READY, permission: 'denied' } }).reason, 'blocked');
    assert.equal(decide({ device: { ...READY, supported: false } }).reason, 'unsupported');
    assert.equal(decide({ moment: 'bogus' }).reason, 'unknown_moment');
});

test('iPhone Safari before install is offered the Home Screen steps, not the permission ask', () => {
    assert.deepEqual(decide({ device: { ...READY, supported: false, iosNeedsInstall: true } }), { show: true, variant: 'install' });
    const deferred = decide({ device: { ...READY, supported: false, iosNeedsInstall: true }, legacyInstallAt: NOW - DAY });
    assert.equal(deferred.reason, 'cooling_down', 'the legacy seven-day install deferral is honoured');
});

test('Not Now starts a cool-down that lengthens, and three Not Nows end the contextual asks', () => {
    let ledger = recordDismissed(EMPTY, NOW);
    assert.equal(decide({ ledger, now: NOW + COOLDOWNS_MS[0] - 1 }).reason, 'cooling_down');
    assert.equal(decide({ ledger, now: NOW + COOLDOWNS_MS[0] + 1 }).show, true);

    ledger = recordDismissed(ledger, NOW + 8 * DAY);
    assert.equal(ledger.dismissals, 2);
    assert.equal(decide({ ledger, now: NOW + 8 * DAY + COOLDOWNS_MS[1] - 1 }).reason, 'cooling_down');
    assert.equal(decide({ ledger, now: NOW + 8 * DAY + COOLDOWNS_MS[1] + 1 }).show, true);

    ledger = recordDismissed(ledger, NOW + 60 * DAY);
    assert.equal(ledger.dismissals, MAX_DISMISSALS);
    assert.equal(decide({ ledger, now: NOW + 3650 * DAY }).reason, 'declined_repeatedly');
});

test('at most one ask a day, whatever the moment', () => {
    const ledger = recordShown(EMPTY, NOW);
    assert.equal(decide({ ledger, moment: 'rakeback_receipt', now: NOW + DAY - 1 }).reason, 'asked_recently');
    assert.equal(decide({ ledger, moment: 'rakeback_receipt', now: NOW + DAY + 1 }).show, true);
});

test('the first-visit ask runs once; a legacy one-time answer becomes a cool-down, not a wall', () => {
    assert.equal(decide({ moment: 'first_run', ledger: recordShown(EMPTY, NOW - 30 * DAY) }).reason, 'first_run_already_asked');
    const legacy = NOW - 20 * DAY;
    assert.equal(decide({ moment: 'first_run', legacyAskedAt: legacy }).reason, 'first_run_already_asked');
    assert.equal(decide({ moment: 'club_joined', legacyAskedAt: legacy }).show, true, 'a meaningful moment may ask again after the cool-down');
    assert.equal(decide({ moment: 'club_joined', legacyAskedAt: NOW - DAY }).reason, 'cooling_down');
    // The legacy answer is carried into the ledger as the first dismissal.
    assert.equal(recordDismissed(EMPTY, NOW, legacy).dismissals, 2);
});

test('the owner is never nudged to enroll for receipts; other players are', () => {
    for (const moment of ['rakeback_receipt', 'invoice_workspace']) {
        assert.equal(decide({ userId: OWNER_USER_ID, moment }).reason, 'owner_receipts_route_to_production_alerts');
        assert.equal(decide({ userId: OWNER_USER_ID.toUpperCase(), moment }).reason, 'owner_receipts_route_to_production_alerts');
        assert.equal(decide({ moment }).show, true);
    }
});

test('the ledger survives corrupt storage and throwing storage', () => {
    for (const raw of ['{', 'null', '"x"', JSON.stringify({ dismissals: -4, lastShownAt: 'x' }), JSON.stringify({ dismissals: 99 })]) {
        const l = parseLedger(raw);
        assert.ok(l.dismissals >= 0 && l.dismissals <= MAX_DISMISSALS);
        assert.equal(typeof l.lastShownAt, 'number');
    }
    const throwing = { getItem() { throw new Error('private mode'); }, setItem() { throw new Error('private mode'); } };
    assert.deepEqual(readNudgeState(throwing, PLAYER), { ledger: EMPTY, legacyAskedAt: 0, legacyInstallAt: 0 });
    writeLedger(throwing, PLAYER, EMPTY); // must not throw

    const map = new Map([[legacyAskedKey(PLAYER), String(NOW)]]);
    const storage = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) };
    writeLedger(storage, PLAYER, recordDismissed(EMPTY, NOW));
    assert.equal(JSON.parse(map.get(ledgerKey(PLAYER))).dismissals, 1);
    assert.equal(readNudgeState(storage, PLAYER).legacyAskedAt, NOW);
});

// ── The silent sync may repair, never enroll ─────────────────────────────
function fakeDb(rows, { fail = false } = {}) {
    const calls = [];
    return {
        calls,
        from(table) {
            assert.equal(table, 'push_subscriptions');
            const filters = {};
            const q = {
                select() { return q; },
                eq(col, val) { filters[col] = val; return q; },
                order() { return q; },
                limit() {
                    calls.push({ ...filters });
                    if (fail) return Promise.resolve({ data: null, error: { message: 'down' } });
                    const hit = rows.filter((r) => Object.entries(filters).every(([k, v]) => r[k] === v))
                        .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
                    return Promise.resolve({ data: hit, error: null });
                },
            };
            return q;
        },
    };
}

test('repair is allowed only for an enrollment this account already holds on this device', async () => {
    const other = '00000000-0000-4000-8000-000000000002';
    const rows = [
        { user_id: PLAYER, endpoint: 'https://fcm.googleapis.com/a', device_id: 'device-aaaa', is_active: true },
        { user_id: other, endpoint: 'https://fcm.googleapis.com/b', device_id: 'device-bbbb', is_active: true },
        // The PERSON turned this device off (the ownership RPC leaves no system reason).
        { user_id: PLAYER, endpoint: 'https://fcm.googleapis.com/c', device_id: 'device-cccc', is_active: false, last_failure_reason: null },
        // Moved to another account on a shared browser.
        { user_id: PLAYER, endpoint: 'https://fcm.googleapis.com/d', device_id: 'device-dddd', is_active: false, last_failure_reason: 'reassigned_to_other_user' },
    ];
    const db = fakeDb(rows);
    assert.equal(await hasRepairableEnrollment(db, PLAYER, { endpoint: 'https://fcm.googleapis.com/a' }), true);
    assert.equal(await hasRepairableEnrollment(db, PLAYER, { endpoint: 'https://fcm.googleapis.com/new', device_id: 'device-aaaa' }), true, 'a rotated endpoint on the same device is a repair');
    assert.equal(await hasRepairableEnrollment(db, PLAYER, { endpoint: 'https://fcm.googleapis.com/b', device_id: 'device-bbbb' }), false, 'another account\'s device is never taken over silently');
    assert.equal(await hasRepairableEnrollment(db, PLAYER, { endpoint: 'https://fcm.googleapis.com/c', device_id: 'device-cccc' }), false, 'a device the person turned off is never re-enrolled silently');
    assert.equal(await hasRepairableEnrollment(db, PLAYER, { endpoint: 'https://fcm.googleapis.com/d', device_id: 'device-dddd' }), false, 'a device handed to another account is never taken back silently');
    assert.equal(await hasRepairableEnrollment(db, PLAYER, { endpoint: 'x', device_id: 'bad id!' }), false);
    assert.ok(db.calls.every((c) => c.user_id === PLAYER), 'every probe is scoped to the verified account');
    await assert.rejects(hasRepairableEnrollment(fakeDb([], { fail: true }), PLAYER, { endpoint: 'e' }), (e) => e.status === 503);
});

// Dan, 2026-11-05: Apple 410'd his iPhone endpoint on Nov 2, the dispatcher
// retired the row, and the old "active rows only" gate then refused every
// silent repair for ever. The device must heal itself without a tap.
test('a device the PUSH SERVICE retired (expired, superseded) is repaired silently', async () => {
    const rows = [
        { user_id: PLAYER, endpoint: 'https://web.push.apple.com/dead', device_id: 'iphone-1111', is_active: false, last_failure_reason: 'expired_410', updated_at: '2026-11-02T19:04:01Z' },
        { user_id: PLAYER, endpoint: 'https://fcm.googleapis.com/old', device_id: 'mac-22222222', is_active: false, last_failure_reason: 'superseded_same_device', updated_at: '2026-10-09T00:00:00Z' },
    ];
    const db = fakeDb(rows);
    assert.equal(await hasRepairableEnrollment(db, PLAYER, { endpoint: 'https://web.push.apple.com/fresh', device_id: 'iphone-1111' }), true, 'expired endpoint on this device: re-enroll the fresh one');
    assert.equal(await hasRepairableEnrollment(db, PLAYER, { endpoint: 'https://web.push.apple.com/fresh2', replaces_endpoint: 'https://web.push.apple.com/dead' }), true, 'the endpoint it replaces proves the enrollment even with no device id');
    assert.equal(await hasRepairableEnrollment(db, PLAYER, { endpoint: 'https://fcm.googleapis.com/new', device_id: 'mac-22222222' }), true);
});

test('the NEWEST row decides: an old system retirement never outvotes a later deliberate off', async () => {
    const rows = [
        { user_id: PLAYER, endpoint: 'https://fcm.googleapis.com/1', device_id: 'device-eeee', is_active: false, last_failure_reason: 'superseded_same_device', updated_at: '2026-10-01T00:00:00Z' },
        { user_id: PLAYER, endpoint: 'https://fcm.googleapis.com/2', device_id: 'device-eeee', is_active: false, last_failure_reason: null, updated_at: '2026-10-20T00:00:00Z' },
    ];
    assert.equal(await hasRepairableEnrollment(fakeDb(rows), PLAYER, { endpoint: 'https://fcm.googleapis.com/3', device_id: 'device-eeee' }), false);
});

test('system-retirement classification is exact', () => {
    for (const r of ['expired_410', 'expired_404', 'superseded', 'superseded_same_device', 'superseded_by_confirmed_device', 'no_receipt_while_sibling_confirmed']) assert.equal(isSystemRetirement(r), true, r);
    for (const r of [null, undefined, '', 'reassigned_to_other_user', 'user_disabled', 'expired_', 'http_500']) assert.equal(isSystemRetirement(r), false, String(r));
});

test('a dead (expired) endpoint is never re-saved: the route answers 410 so the client rotates', async () => {
    const rows = [
        { user_id: PLAYER, endpoint: 'https://web.push.apple.com/dead', is_active: false, last_failure_reason: 'expired_410' },
        { user_id: PLAYER, endpoint: 'https://fcm.googleapis.com/live', is_active: true, last_failure_reason: null },
    ];
    assert.equal(await endpointIsExpired(fakeDb(rows), PLAYER, 'https://web.push.apple.com/dead'), true);
    assert.equal(await endpointIsExpired(fakeDb(rows), PLAYER, 'https://fcm.googleapis.com/live'), false);
    assert.equal(await endpointIsExpired(fakeDb(rows), PLAYER, 'https://fcm.googleapis.com/unknown'), false);
    const route = readFileSync(join(ROOT, 'pages/api/push/subscribe.js'), 'utf8');
    const probe = route.indexOf('endpointIsExpired(supabase, user.id, endpoint)');
    const write = route.indexOf('await changePushSubscription(supabase, user.id, {\n            endpoint, p256dh');
    assert.ok(probe > -1 && probe < write, 'the expired-endpoint refusal runs before the enrollment transaction');
    assert.match(route.slice(probe, write), /status\(410\)[\s\S]*endpoint_expired/);
    const client = readFileSync(join(ROOT, 'src/lib/push-client.js'), 'utf8');
    assert.match(client, /endpoint_expired/, 'the client rotates on endpoint_expired');
});

test('the subscribe route checks repair eligibility before any write, and the sync asks for repair only', () => {
    const route = readFileSync(join(ROOT, 'pages/api/push/subscribe.js'), 'utf8');
    const gate = route.indexOf('body?.repairOnly === true');
    const write = route.indexOf('await changePushSubscription(supabase, user.id, {\n            endpoint, p256dh');
    assert.ok(gate > -1 && write > -1 && gate < write, 'the repair gate must run before the enrollment transaction');
    assert.match(route.slice(gate, write), /hasRepairableEnrollment\(supabase, user\.id/);
    assert.match(route.slice(gate, write), /status\(409\)[\s\S]*repair_not_enrolled/);

    const sync = readFileSync(join(ROOT, 'src/components/notifications/PushSubscriptionSync.jsx'), 'utf8');
    assert.match(sync, /enablePush\(\{ repairOnly: true \}\)/);
    const client = readFileSync(join(ROOT, 'src/lib/push-client.js'), 'utf8');
    assert.match(client, /repairOnly: repairOnly === true \? true : undefined/);
    assert.match(client, /if \(repairOnly && permission !== 'granted'\) return/, 'repair never raises the permission dialog');
});

test('the Messenger invoice workspace announces its moment', () => {
    const page = readFileSync(join(ROOT, 'pages/hub/messenger.js'), 'utf8');
    assert.match(page, /workspaceSelection\.folder === 'invoices'/);
    assert.match(page, /requestPushNudge\('invoice_workspace'\)/);
});

test('Messenger delegates consent and retry decisions to the shared push host', () => {
    const page = readFileSync(join(ROOT, 'pages/hub/messenger.js'), 'utf8');
    assert.doesNotMatch(page, /PushPromptModal/, 'Messenger must not mount a second consent modal');
    assert.doesNotMatch(page, /messenger_push_prompt_handled/, 'legacy permanent dismissal must not bypass the shared cool-down ledger');
    assert.doesNotMatch(page, /setExternalUserId\(/, 'the VAPID provider authenticates enrollment server-side');
});

// Dan, 2026-11-05: the test button said "sent" because his Mac answered for
// the iPhone he tapped it on. The test must heal and then judge THIS device.
test('the test button enrolls this device first and the route judges this device, not the account', () => {
    const client = readFileSync(join(ROOT, 'src/lib/push-client.js'), 'utf8');
    const fn = client.slice(client.indexOf('export async function sendTestPush'), client.indexOf('export async function thisDeviceServerEnrolled'));
    assert.ok(fn.indexOf('await enablePush()') > -1 && fn.indexOf('await enablePush()') < fn.indexOf("fetch('/api/push/test'"), 'heal before testing');
    assert.match(fn, /JSON\.stringify\(endpoint \? \{ endpoint \} : \{\}\)/);
    assert.match(fn, /json\.thisDevice === true/);
    const route = readFileSync(join(ROOT, 'pages/api/push/test.js'), 'utf8');
    assert.match(route, /deviceReport\(supabase, targetId, deviceEndpoint, startedAt\)/);
    assert.match(route, /thisDevice: false/);
    const toggle = readFileSync(join(ROOT, 'src/components/notifications/PushNotificationToggle.jsx'), 'utf8');
    assert.match(toggle, /thisDeviceServerEnrolled\(supabase\)/, 'On means the server holds a live row for this device');
});
