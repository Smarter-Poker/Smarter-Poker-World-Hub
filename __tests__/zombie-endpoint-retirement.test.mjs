/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  A DEAD PUSH ENDPOINT IS RETIRED ON EVIDENCE, NEVER ON A GUESS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Dan 2026-08-30. `push-health` has always DETECTED endpoints that were pushed
 * to and never confirmed a receipt, and has always only ALERTED. So a dead
 * endpoint stayed `is_active` forever and every send paid for it. Measured
 * 2026-08-29: one account held eleven active subscriptions, nine of them
 * redundant, and a single seat offer was delivered to the same iPhone twice.
 *
 * WHY IT ONLY ALERTED, AND WHY THAT WAS RIGHT. "No receipt" alone is not
 * evidence of death. A receipt can be missing because the device is gone,
 * because the beacon is blocked, or because the phone has not been unlocked.
 * Retiring on that would silence a working device, and its owner would have no
 * way to find out why — strictly worse than the duplicate banner it fixes.
 *
 * THE SECOND SIGNAL that makes it safe: if a sibling IN THE SAME DEVICE GROUP
 * is confirming inside the same window, delivery to that device demonstrably
 * works, so a silent endpoint beside a talking one is dead rather than quiet.
 *
 * ── WHY THIS TEST WAS REWRITTEN (2026-09-07) ───────────────────────────────
 *
 * It used to be regexes over push-health.js: `confirmingByUser`, `newestByUser`,
 * the shape of the filter. Every one of them passed on 2026-09-07 while Dan
 * received the Estate Digest and the engine-break alert TWICE on one phone,
 * because the defect was not in that block at all. The query feeding it carried
 * `.lt('created_at', zombieCutoff)`, which silently did two jobs: it withheld
 * young rows from being branded zombies (right) and it also withheld them from
 * the confirming set (wrong). Both of Dan's CONFIRMING rows were younger than
 * the window, so the sweep concluded he had no working device and retired
 * nothing.
 *
 * A source grep cannot tell the difference between "the code is shaped like
 * this" and "the code does the right thing". These assertions run the real
 * decision function against the real rows instead.
 *
 * Run: node --test __tests__/zombie-endpoint-retirement.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { selectRetirable, deviceGroupKey } from '../src/lib/pushDeviceGroups.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'pages/api/cron/push-health.js'), 'utf8');

const NOW = Date.parse('2026-09-07T17:15:00Z');
const CUTOFF = NOW - 3 * 86400_000; // ZOMBIE_RECEIPT_DAYS
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X)';
const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)';
const DAN = '47965354-0e56-43ef-931c-ddaab82af765';

/** Dan's four active rows on 2026-09-07, verbatim from production. */
const DANS_ROWS = [
    {
        id: 'iphone-live',
        user_id: DAN,
        endpoint: 'https://web.push.apple.com/QBibSQ-c8IBWjFHyBd1tmm4iYaE5WaZEq',
        user_agent: IPHONE_UA,
        created_at: '2026-09-05T17:29:30Z',
        last_receipt_at: '2026-09-07T17:12:02Z',
    },
    {
        id: 'iphone-silent',
        user_id: DAN,
        endpoint: 'https://web.push.apple.com/QHpfhacCwFCyvLaeeJDKtgZESwdUP_-MS',
        user_agent: IPHONE_UA,
        created_at: '2026-08-26T12:14:48Z',
        last_receipt_at: null,
    },
    {
        id: 'mac-live',
        user_id: DAN,
        endpoint: 'https://fcm.googleapis.com/fcm/send/fM2D4Uk7uyc',
        user_agent: MAC_UA,
        created_at: '2026-09-07T03:55:22Z',
        last_receipt_at: '2026-09-07T17:12:01Z',
    },
    {
        id: 'mac-stale',
        user_id: DAN,
        endpoint: 'https://fcm.googleapis.com/fcm/send/dOfRzVg10No',
        user_agent: MAC_UA,
        created_at: '2026-09-01T01:32:54Z',
        last_receipt_at: '2026-09-01T02:11:03Z',
    },
];

/** The handler's own definitions, so the fixture is judged the same way. */
const matured = (rows) => rows.filter((s) => Date.parse(s.created_at) < CUTOFF);
const confirming = (s) => s.last_receipt_at && Date.parse(s.last_receipt_at) >= CUTOFF;
const zombiesOf = (rows) => matured(rows).filter((s) => !confirming(s));

test('THE REGRESSION: one phone with two device_ids loses the silent row', () => {
    const retirable = selectRetirable(DANS_ROWS, zombiesOf(DANS_ROWS), CUTOFF);
    const ids = retirable.map((r) => r.id).sort();
    assert.deepEqual(
        ids,
        ['iphone-silent', 'mac-stale'],
        'the duplicate that reached Dan twice must be retired, and only it'
    );
});

test('the confirming sibling counts even when it is younger than the grace window', () => {
    // The actual defect. Both of Dan's confirming rows were created inside the
    // three-day window; when the query excluded them, nothing was retirable.
    const proofs = DANS_ROWS.filter(confirming);
    assert.equal(proofs.length, 2);
    for (const p of proofs) {
        assert.ok(
            Date.parse(p.created_at) >= CUTOFF,
            `${p.id} must be younger than the grace window for this test to mean anything`
        );
    }
    assert.equal(selectRetirable(DANS_ROWS, zombiesOf(DANS_ROWS), CUTOFF).length, 2);
});

test('a device whose ONLY row is silent is never touched', () => {
    // The assertion that guarantees nobody is left unreachable by this code.
    const lonely = [
        {
            id: 'only-device',
            user_id: 'u2',
            endpoint: 'https://web.push.apple.com/x',
            user_agent: IPHONE_UA,
            created_at: '2026-08-01T00:00:00Z',
            last_receipt_at: null,
        },
    ];
    assert.deepEqual(selectRetirable(lonely, zombiesOf(lonely), CUTOFF), []);
});

test("another device delivering does not authorise silencing this one", () => {
    // The old rule was per-USER: a working Mac authorised retiring a genuinely
    // silent iPhone. Delivery to a laptop says nothing about a phone.
    const rows = [
        {
            id: 'mac-live',
            user_id: 'u3',
            endpoint: 'https://fcm.googleapis.com/fcm/send/a',
            user_agent: MAC_UA,
            created_at: '2026-08-01T00:00:00Z',
            last_receipt_at: '2026-09-07T17:00:00Z',
        },
        {
            id: 'iphone-quiet',
            user_id: 'u3',
            endpoint: 'https://web.push.apple.com/b',
            user_agent: IPHONE_UA,
            created_at: '2026-08-01T00:00:00Z',
            last_receipt_at: null,
        },
    ];
    assert.deepEqual(
        selectRetirable(rows, zombiesOf(rows), CUTOFF).map((r) => r.id),
        [],
        'the quiet iPhone is that device’s only row; its owner would go dark'
    );
});

test('the newest row in a group is never retired', () => {
    // A device enrolled moments ago has not had time to confirm anything, so it
    // looks exactly like a zombie and is not one.
    const rows = [
        {
            id: 'old-confirming',
            user_id: 'u4',
            endpoint: 'https://web.push.apple.com/a',
            user_agent: IPHONE_UA,
            created_at: '2026-08-01T00:00:00Z',
            last_receipt_at: '2026-09-07T17:00:00Z',
        },
        {
            id: 'newest-silent',
            user_id: 'u4',
            endpoint: 'https://web.push.apple.com/b',
            user_agent: IPHONE_UA,
            created_at: '2026-09-02T00:00:00Z',
            last_receipt_at: null,
        },
    ];
    assert.deepEqual(selectRetirable(rows, zombiesOf(rows), CUTOFF).map((r) => r.id), []);
});

/**
 * ── AN UNVERIFIED CALLER MAY NOT MUTE A DEVICE (2026-09-07) ────────────────
 *
 * `/api/push/rotate` is UNAUTHENTICATED by design - a service worker calls it
 * from `pushsubscriptionchange`, where no session exists - so proof of
 * possession of the old subscription's auth secret is the only thing between a
 * caller and somebody else's notifications.
 *
 * The same-device retire shipped as a bare `if (row.device_id)`, with no
 * `verified` check, reopening the hole the block thirty lines above it closes
 * and whose comment names it. Post a victim's `oldEndpoint` with your own
 * endpoint and no `oldKeys`: `verified` is false, the victim's `device_id` is
 * still copied onto the new row, and every live row for that device is
 * switched off. Strictly worse than the 2026-08-19 bug, which silenced one row.
 */
test('the same-device retire requires proof of possession', () => {
    const src = readFileSync(join(ROOT, 'pages/api/push/rotate.js'), 'utf8');

    const at = src.indexOf('superseded_same_device');
    assert.ok(at > -1, 'the same-device retire is gone');
    // Walk back to the `if (...)` that opens the block and require `verified`.
    const guard = src.lastIndexOf('if (', at);
    const condition = src.slice(guard, src.indexOf('{', guard));
    assert.match(
        condition,
        /verified\s*&&/,
        `the same-device retire is gated on "${condition.trim()}" - without \`verified\` this ` +
            'route is an unauthenticated mute button for any endpoint an attacker has learned'
    );

    // And the single-row retire above it keeps its own proof requirement.
    assert.match(src, /const supersedes = verified && oldEndpoint !== endpoint;/);
});

test('a row with no user agent is never grouped with anything', () => {
    // This code can take somebody's phone off notifications. Two different
    // devices that both happen to lack a user_agent must not become "one
    // device" and get one of them retired.
    const a = { id: 'a', user_id: 'u', endpoint: 'https://web.push.apple.com/a', user_agent: null };
    const b = { id: 'b', user_id: 'u', endpoint: 'https://web.push.apple.com/b', user_agent: '' };
    assert.notEqual(deviceGroupKey(a), deviceGroupKey(b));
    assert.notEqual(deviceGroupKey(a), deviceGroupKey({ ...a, id: 'c' }));

    // ...and such a row is therefore never retirable, even beside a confirming
    // sibling on the same host.
    const rows = [
        {
            id: 'confirming',
            user_id: 'u',
            endpoint: 'https://web.push.apple.com/live',
            user_agent: IPHONE_UA,
            created_at: '2026-08-01T00:00:00Z',
            last_receipt_at: '2026-09-07T17:00:00Z',
        },
        {
            id: 'no-ua',
            user_id: 'u',
            endpoint: 'https://web.push.apple.com/quiet',
            user_agent: null,
            created_at: '2026-08-01T00:00:00Z',
            last_receipt_at: null,
        },
    ];
    assert.deepEqual(selectRetirable(rows, zombiesOf(rows), CUTOFF).map((r) => r.id), []);
});

test('two genuinely different devices are never merged by the group key', () => {
    const iphone = { user_id: 'u', endpoint: 'https://web.push.apple.com/a', user_agent: IPHONE_UA };
    const mac = { user_id: 'u', endpoint: 'https://fcm.googleapis.com/fcm/send/a', user_agent: MAC_UA };
    assert.notEqual(deviceGroupKey(iphone), deviceGroupKey(mac));
    // ...and two rows of ONE device are, whatever their endpoints.
    const sameA = { user_id: 'u', endpoint: 'https://web.push.apple.com/aaa', user_agent: IPHONE_UA };
    const sameB = { user_id: 'u', endpoint: 'https://web.push.apple.com/bbb', user_agent: IPHONE_UA };
    assert.equal(deviceGroupKey(sameA), deviceGroupKey(sameB));
    // Different people are never in one group.
    assert.notEqual(deviceGroupKey(sameA), deviceGroupKey({ ...sameA, user_id: 'v' }));
});

test('the grace period no longer hides the evidence', () => {
    // The query must not filter on created_at: that is what withheld the
    // confirming siblings and made the whole sweep a no-op.
    const query = SRC.slice(SRC.indexOf("from('push_subscriptions')"), SRC.indexOf('if (subsErr)'));
    assert.ok(
        !/\.lt\('created_at'/.test(query),
        'the created_at grace filter is back in the query; it also hides confirming siblings'
    );
    assert.match(SRC, /const matured = all\.filter/, 'the grace period must still be applied');
});

test('the update is scoped to rows still active', () => {
    const at = SRC.indexOf('const retirable =');
    const block = SRC.slice(at, SRC.indexOf('// ---- CHECK', at));
    assert.match(block, /\.eq\('is_active', true\)/);
    assert.match(block, /is_active: false/);
    assert.match(block, /no_receipt_while_sibling_confirmed/);
});

test('a cleanup failure can never take down the health check', () => {
    const at = SRC.indexOf('const retirable =');
    const block = SRC.slice(at, SRC.indexOf('// ---- CHECK', at));
    assert.match(block, /catch \(e\)/);
    assert.match(block, /report\.zombieRetireError/);
    assert.ok(
        !/report\.errors\.push/.test(SRC),
        'push-health has no report.errors array; referencing one throws'
    );
});

test('the alert still fires — retirement did not replace it', () => {
    assert.match(SRC, /Notifications May Not Be Reaching This Device/);
    assert.match(SRC, /report\.zombies = zombies\.length/);
});

test('the retirement count is reported, so a runaway sweep is visible', () => {
    assert.match(SRC, /report\.zombiesRetired = 0/);
    assert.match(SRC, /report\.zombiesRetired = retirable\.length/);
});
