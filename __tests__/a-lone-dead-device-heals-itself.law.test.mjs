/**
 * A DEVICE THAT IS THE ONLY LIVE ROW IT HAS CAN STILL COME BACK.
 *
 * MEASURED 2026-09-15, from the live database:
 *
 *   push service   rows  newest receipt anywhere   newest accepted send
 *   Apple            12  2026-09-08 14:12          2026-09-15 13:00
 *   FCM/Chrome       47  2026-09-15 13:00          2026-09-15 13:00
 *
 * Every Apple endpoint stopped confirming on 2026-09-08 while every Chrome
 * endpoint kept confirming to the minute. Dan's iPhone: active since 09-03,
 * accepted sends through 09-15, receipts NONE. His iPad: last receipt 08-31,
 * accepted sends through 09-15. Twelve and fifteen days of silence, on the
 * devices he actually carries.
 *
 * THREE THINGS HAD TO BE TRUE AT ONCE, and each was reasonable alone:
 *
 *   1. Apple answers 2xx for a subscription whose device is gone, and never
 *      410s it, so nothing reaps the row. (Chrome 410s, which is why Chrome
 *      never showed this.)
 *   2. selectRetirable() refuses to retire a zombie without a confirming
 *      SIBLING on the same device - "Nothing here can silence a device that is
 *      the only live row it has." That protects a quiet device from a guess.
 *      It also means a lone dead one is never retired.
 *   3. The client asked the BROWSER whether push was on, never the server, so
 *      nothing re-registered it and the settings screen said "on" throughout.
 *
 * Together they make the silence permanent and invisible. Removing any one of
 * the three ends it, and this law holds all three open.
 *
 * THE DISTINCTION THAT MAKES RETIREMENT SAFE is suspicion versus proof, and
 * last_used_at carries it: push-dispatch advances that column ONLY inside
 * `if (result.ok)`, so it means the push service ACCEPTED a message. A row
 * whose sends have run a week past its last proof of life is not one we have
 * merely not heard from. A device nobody pushes to has a still last_used_at
 * and is never touched, which is the conservatism worth keeping.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectProvenDead, DEAD_AFTER_DAYS } from '../src/lib/pushDeviceGroups.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const health = read('pages/api/cron/push-health.js');
const client = read('src/lib/push-client.js');
const context = read('src/contexts/PushContext.jsx');
const subscribeRoute = read('pages/api/push/subscribe.js');
const dispatch = read('pages/api/cron/push-dispatch.js');

/**
 * The body of ONE exported function, bounded at the next export.
 *
 * Slicing to end-of-file looked equivalent and was not: a check for
 * `isOptedOut()` inside reconcileSubscription() matched that function's own
 * DEFINITION further down the file, so removing the guard from the body left
 * the assertion green. Decorative. Bound the slice.
 */
function functionBody(src, signature) {
    const start = src.indexOf(signature);
    assert.ok(start >= 0, `${signature} must exist`);
    const after = src.indexOf('\nexport ', start + signature.length);
    return src.slice(start, after > start ? after : undefined);
}

const iso = (s) => new Date(s).toISOString();
/** Dan's iPhone, exactly as the database held it. */
const IPHONE = {
    id: 'iphone', user_id: 'dan',
    created_at: iso('2026-09-03T21:25:00Z'),
    last_receipt_at: null,
    last_used_at: iso('2026-09-15T13:00:00Z'),
};
/** Dan's iPad: confirmed once, fifteen days ago. */
const IPAD = {
    id: 'ipad', user_id: 'dan',
    created_at: iso('2026-08-30T16:42:00Z'),
    last_receipt_at: iso('2026-08-31T14:54:00Z'),
    last_used_at: iso('2026-09-15T13:00:00Z'),
};

test('the two real devices are retired, with no sibling to vouch for them', () => {
    const dead = selectProvenDead([IPHONE, IPAD]).map((r) => r.id);
    assert.deepEqual(dead.sort(), ['ipad', 'iphone'],
        'both had accepted sends running days past any proof of life');
});

test('ONE proven-dead row, with no sibling at all, is still retired', () => {
    // The defect this law is named for, and the case the suite was missing.
    // selectRetirable spared a subscription that was the only live row it had,
    // so Dan's iPhone - the single Apple endpoint on the account once the iPad
    // went - was never retired and so never replaced. Asserted with a ONE
    // element array on purpose: the two-device case above passes whether or not
    // a lone row is spared, so it cannot see this bug. Restoring the original
    // `if (all.length <= 1) return []` must fail HERE and nowhere else.
    assert.deepEqual(selectProvenDead([IPHONE]).map((r) => r.id), ['iphone'],
        'a zombie with nothing to compare against is still a zombie');
    assert.deepEqual(selectProvenDead([IPAD]).map((r) => r.id), ['ipad'],
        'and so is the other one, alone');
});

test('a device nobody has pushed to is never touched', () => {
    // The conservatism the original guard was protecting. No send means no
    // evidence, however old the row is.
    const quiet = { id: 'q', created_at: iso('2026-01-01T00:00:00Z'), last_receipt_at: null, last_used_at: null };
    assert.deepEqual(selectProvenDead([quiet]), [],
        'absence of a receipt is only evidence once we have proof we sent');
});

test('nor is one that confirmed recently, nor one still inside the window', () => {
    const healthy = { id: 'h', created_at: iso('2026-09-07T03:55:00Z'),
        last_receipt_at: iso('2026-09-15T13:00:00Z'), last_used_at: iso('2026-09-15T13:00:00Z') };
    const young = { id: 'y', created_at: iso('2026-09-13T00:00:00Z'),
        last_receipt_at: null, last_used_at: iso('2026-09-15T00:00:00Z') };
    assert.deepEqual(selectProvenDead([healthy, young]), [],
        'two days of silence is suspicion; the window is what makes it proof');
});

test('the window is measured from the last proof of life, never from the clock', () => {
    // Retiring on age alone would switch off a device that is working fine and
    // simply enrolled a long time ago.
    const old = { id: 'o', created_at: iso('2025-01-01T00:00:00Z'),
        last_receipt_at: iso('2026-09-15T12:00:00Z'), last_used_at: iso('2026-09-15T13:00:00Z') };
    assert.deepEqual(selectProvenDead([old]), [], 'an old row that still confirms is healthy');
    assert.ok(!/\bnowMs\b|Date\.now\(\)/.test(
        functionBody(read('src/lib/pushDeviceGroups.js'), 'export function selectProvenDead')),
    'selectProvenDead must not consult the clock');
});

test('a malformed timestamp never costs somebody their subscription', () => {
    const junk = { id: 'j', created_at: 'not-a-date', last_receipt_at: null, last_used_at: 'also-bad' };
    assert.deepEqual(selectProvenDead([junk]), []);
});

test('the window is long enough to be proof rather than a guess', () => {
    assert.ok(DEAD_AFTER_DAYS >= 7,
        `${DEAD_AFTER_DAYS} days is short enough to catch a quiet weekend`);
});

test('last_used_at still means ACCEPTED, which is what makes it evidence', () => {
    // If this ever advances on attempt rather than success, the whole basis of
    // selectProvenDead is gone and it starts retiring working devices.
    assert.match(dispatch, /if \(result\.ok\) \{[\s\S]{0,400}?last_used_at: nowIso/,
        'last_used_at must be written only on an accepted send');
});

test('the sweep retires proven-dead rows and tells their owner on the bell', () => {
    assert.match(health, /selectProvenDead\(all\)/, 'the sweep must call it');
    assert.match(health, /no_receipt_after_sustained_sends/, 'and record why');
    const block = health.slice(health.indexOf('const provenDead'));
    assert.match(block.slice(0, 3000), /withPush: false/,
        'notifying by push about broken push would be a joke');
});

test('the client can ask the server whether its own endpoint is live', () => {
    assert.match(subscribeRoute, /'GET', 'POST', 'DELETE'/, 'GET must be allowed');
    assert.match(subscribeRoute, /active: Boolean\(row\?\.is_active\)/);
    assert.match(subscribeRoute, /reason: row\?\.is_active \? null : \(row\?\.last_failure_reason \|\| null\)/,
        'the reason is what stops the client resurrecting a dead endpoint');
});

test('a status read that fails is not reported as inactive', () => {
    // Otherwise a blip tears down every working subscription at once.
    assert.match(subscribeRoute, /status\(503\)/, 'unknown must be its own answer');
    assert.match(client, /if \(!res\?\.ok\) return \{ ok: true, action: 'unknown' \}/);
});

test('a retired-as-undeliverable endpoint is replaced, not re-posted', () => {
    assert.match(client, /RETIRED_AS_UNDELIVERABLE/);
    assert.match(client, /no_receipt_after_sustained_sends/);
    const fn = functionBody(client, 'export async function reconcileSubscription');
    assert.match(fn, /subscription\.unsubscribe\(\)[\s\S]{0,600}?pushManager\.subscribe/,
        're-posting the same endpoint just revives the row that does not work');
});

test('and one the server merely lost is re-posted as it is', () => {
    const fn = functionBody(client, 'export async function reconcileSubscription');
    assert.match(fn, /persistSubscription\(subscription, undefined\)[\s\S]{0,200}?action: 'reposted'/);
});

test('reconciliation runs on load, and never blocks the UI on it', () => {
    assert.match(context, /reconcileSubscription/, 'the context must call it');
    const effect = context.slice(context.indexOf('useEffect(() => {'));
    const initIdx = effect.indexOf('setIsInitialized(true)');
    const reconcileIdx = effect.indexOf('reconcileSubscription()');
    assert.ok(initIdx > 0 && reconcileIdx > initIdx,
        'the screen must be usable before any bookkeeping runs');
});

test('and it leaves an opted-out or unpermitted device alone', () => {
    const fn = functionBody(client, 'export async function reconcileSubscription');
    assert.match(fn, /isOptedOut\(\)/, 'someone who turned push off must stay off');
    assert.match(fn, /notificationPermission\(\) !== 'granted'/,
        'and a browser that never granted permission is not re-subscribed behind their back');
});
