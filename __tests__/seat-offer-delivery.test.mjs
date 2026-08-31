/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  A SEAT OFFER: ONE BANNER, AND IT DOES NOT OUTLIVE THE SEAT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 2026-08-30, from Dan's report of 2026-08-29: "the seat open push
 * notification should only occur if you are on a list waiting for a seat, not
 * randomly." He was on that list — the row was four minutes old — so the
 * targeting was right. What made it read as random was the delivery.
 *
 * THREE MECHANISMS, all in this file:
 *
 * 1. THE TAG. `fn_mirror_notification_to_push_outbox` tagged each row
 *    `<type>:<notification id>`, so every offer at the same table was a
 *    different tag and landed BESIDE the last one instead of replacing it. The
 *    operating system uses the tag to decide, so identical text under different
 *    tags is guaranteed to pile up — that is the mechanism behind the two
 *    identical banners in Dan's screenshot (there, two writers with two tags).
 *    Seat events now group by `data->>'table_id'`: one live banner per table.
 *
 * 2. THE TTL. `sendWebPush` defaults to 24 hours, which is right for almost
 *    everything and exactly wrong for an offer that dies in three minutes. A
 *    phone that reconnected twenty minutes later got "Tap To Claim It" for a
 *    seat long since given away, and tapping landed on a full table. Nothing
 *    downstream can un-send a push; the TTL is the only lever.
 *
 * 3. THE DEAD BANNER. The TTL stops late DELIVERY. It does nothing about a
 *    banner already on screen when the offer lapsed. The service worker sweeps
 *    those — at the two moments it is provably alive, never on a timer it
 *    cannot keep.
 *
 * Run: node --test __tests__/seat-offer-delivery.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { eventToTypeKey } from '../src/lib/push/push-prefs.js';
import { resolveNotificationRoute } from '../src/lib/notificationRoute.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const DISPATCH = read('pages/api/cron/push-dispatch.js');
const WEBPUSH = read('src/lib/push/web-push.js');
const SW = read('public/push/sw.js');
const SUBSCRIBE = read('pages/api/push/subscribe.js');
const CLIENT = read('src/lib/push-client.js');
const DISPATCHER = read('scripts/openclaw-cron-dispatcher.py');
const SWEEP_ROUTE = read('pages/api/cron/waitlist-sweep.js');

// ── 1. ONE BANNER PER TABLE ────────────────────────────────────────────────

test('the mirror trigger groups seat events by table, not by notification id', () => {
    const sql = read('supabase/migrations/20260830030000_seat_offers_collapse_by_table.sql');
    assert.match(sql, /'seat_offer:' \|\| COALESCE\(/);
    assert.match(sql, /NEW\.data ->> 'table_id'/);
    // The expiry notice must share the offer's tag — that is what makes it
    // REPLACE the stale banner rather than stack a second one beside it.
    assert.match(sql, /'waitlist_seat_open', 'waitlist_offer_expired'/);
    // And the fallback still ends at the row id, so a seat offer carrying no
    // table_id keeps its own tag instead of colliding with every other
    // table-less offer under one key.
    assert.match(sql, /NEW\.id::text\s*\n\s*\);/);
});

test('the rewrite kept every guard the trigger already had', () => {
    // Each was added after a real incident. A CREATE OR REPLACE that drops one
    // is the most dangerous edit in this file, and it fails nothing at runtime.
    const sql = read('supabase/migrations/20260830030000_seat_offers_collapse_by_table.sql');
    for (const guard of ['_push', 'c_max_pending', 'c_max_age']) {
        assert.ok(
            sql.includes(guard),
            `the trigger rewrite dropped the ${guard} guard`
        );
    }
});

// ── 2. THE PUSH EXPIRES WITH THE OFFER ─────────────────────────────────────

test('a seat offer is sent with a TTL near its own three-minute life', () => {
    assert.match(DISPATCH, /const EVENT_TTL_SECONDS = \{/);
    assert.match(DISPATCH, /waitlist_seat_open: 3 \* 60 \+ 30/);
    // And it is actually PASSED to the sender. A constant nobody forwards is
    // the quiet version of this bug.
    assert.match(DISPATCH, /sendWebPush\(sub, payload, typeof ttl === 'number' \? \{ ttl \} : undefined\)/);
});

test('web-push honours a caller ttl rather than always defaulting to a day', () => {
    assert.match(WEBPUSH, /TTL: typeof opts\.ttl === 'number' \? opts\.ttl : 86400/);
});

test('an expiry notice replaces the offer without a second buzz', () => {
    assert.match(DISPATCH, /const QUIET_EVENTS = new Set\(\['waitlist_offer_expired'\]\)/);
    assert.match(DISPATCH, /payload\.renotify = false/);
    // Forwarded only as an explicit false — never as `true`, which without a
    // tag makes Chrome's showNotification throw and display nothing at all.
    assert.match(WEBPUSH, /renotify: payload\.renotify === false \? false : undefined/);
    assert.match(SW, /renotify: data\.renotify === false \? false : data\.tag \? true : undefined/);
});

// ── 3. THE DEAD BANNER IS CLOSED ───────────────────────────────────────────

test('the offer carries an expiry the service worker can read back', () => {
    assert.match(DISPATCH, /payload\.data\.expiresAt = Date\.parse\(row\.created_at \|\| Date\.now\(\)\) \+ ttl \* 1000/);
    assert.match(SW, /expiresAt: typeof data\.expiresAt === 'number' \? data\.expiresAt : null/);
});

test('the sweep runs at both moments the worker is provably alive, never on a timer', () => {
    assert.match(SW, /function sweepExpiredNotifications\(\)/);
    assert.match(SW, /self\.registration\s*\n?\s*\.getNotifications\(\)/);
    /* A setTimeout across a three-minute window is a promise the runtime has no
       obligation to keep, and it fails exactly when it matters.

       Comments stripped first: the sweep's own docstring explains WHY there is
       no timer by naming the shape it rejects, and prose describing a mistake
       must not read as an instance of it. */
    const swCode = SW.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(
        !/setTimeout\([^)]*close/.test(swCode),
        'the sweep must not depend on a timer surviving service-worker eviction'
    );
    // Push arrival, and notification click.
    assert.match(SW, /sweepExpiredNotifications\(\)\s*\n\s*\.then\(\(\) => self\.registration\.showNotification/);
    assert.match(SW, /event\.waitUntil\(sweepExpiredNotifications\(\)\)/);
});

test('sweeping can never stop the notification it is attached to', () => {
    // A thrown getNotifications() here would mean the push that triggered the
    // sweep is never shown — strictly worse than the stale banner it cleans up.
    const at = SW.indexOf('function sweepExpiredNotifications()');
    const body = SW.slice(at, SW.indexOf('self.addEventListener', at));
    assert.match(body, /\.catch\(/);
    assert.match(body, /try \{[\s\S]*n\.close\(\)/);
});

// ── 4. THE LAPSE IS ANNOUNCED, AND ROUTED SOMEWHERE USEFUL ─────────────────

test('a lapsed offer routes to the waitlist, never to the table it lost', () => {
    // The seat is gone — that is what the notification says. Sending the tap to
    // the table lands the player on a full felt with nothing to do, which reads
    // as the app being broken rather than as "you missed it".
    const url = resolveNotificationRoute({
        type: 'waitlist_offer_expired',
        data: { table_id: '11111111-2222-3333-4444-555555555555' },
    });
    assert.ok(url && url.endsWith('/waitlist'), `expected a waitlist route, got ${url}`);

    // The live offer still goes to the table.
    const live = resolveNotificationRoute({
        type: 'waitlist_seat_open',
        data: { table_id: '11111111-2222-3333-4444-555555555555' },
    });
    assert.ok(
        live && live.includes('/table/11111111-2222-3333-4444-555555555555'),
        `expected a table route, got ${live}`
    );
});

test('the lapse notice answers to the same consent toggle as the offer', () => {
    // Somebody who switched "Seat Available" off does not want to hear about
    // seats, and being told about one they did not get is still hearing about
    // seats. It also must not fall through as null, which the gate reads as
    // "unknown, allow it".
    assert.equal(eventToTypeKey('waitlist_offer_expired'), 'seat_open');
    assert.equal(eventToTypeKey('waitlist_seat_open'), 'seat_open');
});

// ── 5. THE SWEEP REACHES A TABLE NOTHING IS HAPPENING AT ───────────────────

test('the recurring sweep exists, is Open Claw scheduled, and fails loudly', () => {
    assert.match(SWEEP_ROUTE, /rpc\('fn_sweep_stale_waitlists'\)/);
    // No arguments: the TTLs are defaults on the function signature, so this
    // route cannot drift from the offer path by passing a different number.
    assert.ok(
        !/fn_sweep_stale_waitlists',\s*\{/.test(SWEEP_ROUTE),
        'the sweep route must not pass its own TTLs'
    );
    // A sweep that errors and returns 200 is indistinguishable from a sweep
    // with nothing to do, and the point of it is to correct something nobody
    // is watching.
    assert.match(SWEEP_ROUTE, /status\(500\)/);
    assert.match(SWEEP_ROUTE, /validateCronAuth/);

    // CLAUDE.md section 11: Open Claw, never vercel.json. The sweep advances
    // the queue behind a 60-second exclusive hold, so it must run every minute.
    assert.match(DISPATCHER, /'\/api\/cron\/waitlist-sweep',\s*dict\(minute='\*'\)\)/);
    const vercel = JSON.parse(read('vercel.json'));
    const crons = vercel.crons || [];
    assert.ok(
        !crons.some((c) => String(c.path || '').includes('waitlist-sweep')),
        'the waitlist sweep must not be scheduled from vercel.json'
    );
});

// ── 6. ONE LIVE ENDPOINT PER DEVICE ────────────────────────────────────────

test('a re-subscribe retires the endpoint it supersedes on the same device', () => {
    // `replacesEndpoint` only works while the client still REMEMBERS what it is
    // replacing, which it does not after a service-worker reinstall or cleared
    // site data. Measured 2026-08-29: eleven active rows on one account, nine
    // redundant, one seat offer delivered to the same iPhone twice.
    assert.match(CLIENT, /const DEVICE_ID_KEY = 'smarter-poker-push-device-id'/);
    assert.match(CLIENT, /deviceId: deviceId\(\) \|\| undefined/);
    // Storage throws in private windows. A missing device id costs a duplicate
    // banner; a thrown one would cost the whole subscription.
    const at = CLIENT.indexOf('function deviceId()');
    const body = CLIENT.slice(at, CLIENT.indexOf('function deviceLabel()', at));
    assert.match(body, /catch \{\s*\n\s*return null;/);

    assert.match(SUBSCRIBE, /\.eq\('device_id', deviceId\)/);
    assert.match(SUBSCRIBE, /superseded_same_device/);
    assert.match(SUBSCRIBE, /device_id: deviceId,/);
});

test('the same-device retire runs BEFORE the upsert', () => {
    // The partial unique index would otherwise reject the insert of a second
    // live row for the same device, and the caller would see a confusing 500.
    const retire = SUBSCRIBE.indexOf("superseded_same_device");
    const upsert = SUBSCRIBE.indexOf("onConflict: 'user_id,endpoint'");
    assert.ok(retire > -1 && upsert > -1, 'the subscribe path moved');
    assert.ok(retire < upsert, 'the same-device retire must precede the upsert');
});

test('an unusable device id is ignored, never rejected', () => {
    // A bad value must not cost somebody their subscription; without one they
    // simply keep the pre-2026-08-30 behaviour.
    assert.match(SUBSCRIBE, /\/\^\[A-Za-z0-9-\]\{8,64\}\$\/\.test\(rawDeviceId\) \? rawDeviceId : null/);
});
