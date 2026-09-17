/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  A ROTATED SUBSCRIPTION IS STILL THE SAME PHONE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Dan, 2026-08-30, from an iPhone: "I'M GETTING DOUBLE NOTIFICATIONS FOR THE
 * SAME OPEN SEAT."
 *
 * `push_subscriptions.device_id` is the only stable identifier for a physical
 * device. The endpoint is not: the browser mints a fresh one on a
 * service-worker reinstall, a storage purge, a PWA re-add, or a
 * failed-then-retried subscribe. Two things depend on device_id, and BOTH are
 * scoped to it being non-null:
 *
 *   - `push_subscriptions_one_active_per_device_uidx`
 *     ON (user_id, device_id) WHERE is_active AND device_id IS NOT NULL
 *   - the same-device retire in /api/push/subscribe, `.eq('device_id', id)`
 *
 * So a row with device_id = NULL is exempt from the constraint that keeps one
 * device to one live subscription, and invisible to the sweep that enforces
 * it. push-dispatch then fans out to every active row and the phone shows the
 * same banner once per row.
 *
 * /api/push/rotate was creating exactly those rows. It carefully preserved
 * `device_label` -- with a comment explaining why losing it hurt -- and
 * dropped `device_id` one line away, without ever selecting it. Its whole
 * purpose is to keep a device reachable across an endpoint change, and it
 * fires on precisely the events listed above, so it re-created the duplicate
 * every time the platform healed itself.
 *
 * Measured on production before the fix: one account, 22 rows, 4 active for
 * 2 physical devices, every row device_id = NULL.
 *
 * Source successor: protected execution only; revised assertions remain UNRUN.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROTATE = readFileSync(join(ROOT, 'pages/api/push/rotate.js'), 'utf8');
const ROTATION_ADAPTER = readFileSync(join(ROOT, 'src/lib/push/subscription-rotation.mjs'), 'utf8');
const SUBSCRIBE = readFileSync(join(ROOT, 'pages/api/push/subscribe.js'), 'utf8');
const HEALTH = readFileSync(join(ROOT, 'pages/api/cron/push-health.js'), 'utf8');
const CONFIRMED_LEGACY_REPAIR = readFileSync(
  join(ROOT, 'supabase/migrations/20260831151000_consolidate_confirmed_legacy_push_endpoint.sql'),
  'utf8'
);

/** Source with comments stripped, so a test never passes on its own prose. */
function code(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

test('rotation carries recorded device and exact revision to its one atomic authority', () => {
  const src = code(ROTATION_ADAPTER);
  const select = src.match(/\.select\(\s*'([^']*)'\s*\)/);
  assert.ok(select); assert.match(select[1], /\bdevice_id\b/); assert.match(select[1], /rotation_revision::text/);
  assert.match(src, /device_id: source\.device_id/);
  assert.match(src, /rpc\('fn_rotate_push_subscription'/);
  assert.doesNotMatch(src, /\.(update|upsert)\(/);
});

test('rotation authenticates and delegates; compensation is forbidden', () => {
  const src = code(ROTATE);
  assert.match(src, /getUser: getServerUserWithFallback/);
  assert.match(src, /createPushRotationHandler/);
  assert.doesNotMatch(src, /\.(update|upsert)\(/);
});

test('enrollment keeps its existing atomic ownership authority', () => {
  const src = code(SUBSCRIBE);
  assert.match(src, /await changePushSubscription/);
  assert.doesNotMatch(src, /\.(update|upsert)\(/);
});

test('the device_id contract is still validated, not trusted', () => {
  // A client-supplied id is only useful if it matches what the index and the
  // retire expect. subscribe.js validates the shape and drops anything else to
  // null -- which is the safe failure, but also means a client sending a
  // malformed id silently gets the old duplicate behaviour back.
  assert.match(
    code(SUBSCRIBE),
    /\^\[A-Za-z0-9-\]\{8,64\}\$/,
    'subscribe.js must keep validating the deviceId shape before storing it.'
  );
});

test('push-health alarms when one device holds two live subscriptions', () => {
  // The bug was invisible for a day because nothing asked this question. Each
  // row looked healthy on its own; only the person holding the phone saw the
  // duplicate.
  const src = code(HEALTH);
  assert.match(
    src,
    /more than one live subscription/,
    'push-health must report devices holding more than one live subscription.'
  );
  assert.match(
    src,
    /activeWithoutDeviceId/,
    'push-health must report how many active rows still have no device_id -- ' +
      'those are the rows the partial unique index cannot see.'
  );
});

test('push-health only REPORTS duplicates, it does not silently retire them', () => {
  // The zombie check retires what it finds, because a dead endpoint is
  // unambiguous. A duplicate is not: with the client and rotate fixes in
  // place, a new one means a NEW bug, and healing it quietly would hide
  // exactly the failure this file exists to surface.
  const src = code(HEALTH);
  const start = src.indexOf('more than one live subscription');
  assert.ok(start > -1, 'expected the duplicate-device check');
  // Look at the whole check block, from its query to the reporting line.
  const blockStart = src.lastIndexOf('const { data: liveRows', 0 + start);
  assert.ok(blockStart > -1, 'expected the duplicate-device query');
  const block = src.slice(blockStart, start);
  assert.ok(
    !/is_active:\s*false/.test(block),
    'the duplicate-device check must not deactivate rows. Report it; let a ' +
      'human or a targeted migration decide which row is the real device.'
  );
});

test('confirmed legacy endpoint pairs are consolidated without guessing at unconfirmed devices', () => {
  assert.match(CONFIRMED_LEGACY_REPAIR, /count\(\*\) = 2/);
  assert.match(CONFIRMED_LEGACY_REPAIR, /count\(\*\) FILTER \(WHERE device_id IS NULL\) = 1/);
  assert.match(CONFIRMED_LEGACY_REPAIR, /legacy_receipt_at IS NULL/);
  assert.match(CONFIRMED_LEGACY_REPAIR, /identified_receipt_at >= v_group\.legacy_receipt_at/);
  assert.match(CONFIRMED_LEGACY_REPAIR, /abs\(extract\(epoch FROM/);
  assert.match(CONFIRMED_LEGACY_REPAIR, /superseded_by_confirmed_legacy_endpoint/);
  assert.match(CONFIRMED_LEGACY_REPAIR, /SET device_id = v_group\.stable_device_id/);
  assert.doesNotMatch(CONFIRMED_LEGACY_REPAIR, /DELETE FROM public\.push_subscriptions/);
});
