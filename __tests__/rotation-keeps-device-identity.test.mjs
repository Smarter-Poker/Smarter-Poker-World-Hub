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
 * Run: node --test __tests__/rotation-keeps-device-identity.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROTATE = readFileSync(join(ROOT, 'pages/api/push/rotate.js'), 'utf8');
const SUBSCRIBE = readFileSync(join(ROOT, 'pages/api/push/subscribe.js'), 'utf8');

/** Source with comments stripped, so a test never passes on its own prose. */
function code(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

test('rotate SELECTS device_id -- it cannot carry what it never read', () => {
  const select = code(ROTATE).match(/\.select\(\s*'([^']*)'\s*\)/);
  assert.ok(select, 'expected a .select() on the push_subscriptions lookup');
  assert.match(
    select[1],
    /\bdevice_id\b/,
    'rotate.js must select device_id. Without it `existing.device_id` is ' +
      'undefined and the identity is dropped silently, with no error anywhere.'
  );
});

test('rotate CARRIES device_id onto the replacement row', () => {
  assert.match(
    code(ROTATE),
    /row\.device_id\s*=\s*existing\.device_id/,
    'The rotated row must inherit the old row device_id, or it is exempt from ' +
      'push_subscriptions_one_active_per_device_uidx forever and the phone ' +
      'receives every notification twice.'
  );
});

test('the retire runs BEFORE the upsert, or the unique index rejects it', () => {
  // Ordering is not stylistic here. Once the new row carries device_id,
  // inserting it while the old row is still is_active means two live rows for
  // one (user_id, device_id) -- which the partial unique index refuses. The
  // old code upserted first and retired second, which was correct ONLY while
  // device_id was being dropped.
  const src = code(ROTATE);
  const retire = src.indexOf("last_failure_reason: 'rotated'");
  const upsert = src.indexOf("onConflict: 'user_id,endpoint'");
  assert.ok(retire > -1, 'expected the rotated-row retire');
  assert.ok(upsert > -1, 'expected the upsert');
  assert.ok(
    retire < upsert,
    'The retire of the superseded row must come BEFORE the upsert of the ' +
      'replacement. Reversed, the upsert violates ' +
      'push_subscriptions_one_active_per_device_uidx and the rotation fails ' +
      'outright -- taking the self-heal path down with it.'
  );
});

test('a failed upsert puts the retired row back', () => {
  // The retire now happens first, so an upsert failure would otherwise leave
  // the device with NO live subscription -- a silent unsubscribe, which is the
  // exact failure this route exists to prevent.
  const src = code(ROTATE);
  const upsertErr = src.indexOf('if (upsertErr)');
  assert.ok(upsertErr > -1, 'expected upsert error handling');
  const tail = src.slice(upsertErr, upsertErr + 700);
  assert.match(
    tail,
    /is_active:\s*true/,
    'On upsert failure the previously retired row must be reactivated. ' +
      'Retiring first without a rollback trades a duplicate banner for a dead ' +
      'device, which is a worse bug than the one being fixed.'
  );
});

test('subscribe.js still retires same-device rows before ITS upsert', () => {
  // The invariant this whole fix rests on. If this ordering is ever reversed
  // in subscribe.js, enrolment starts failing on the unique index for every
  // device that re-subscribes.
  const src = code(SUBSCRIBE);
  const retire = src.indexOf("'superseded_same_device'");
  const upsert = src.indexOf("onConflict: 'user_id,endpoint'");
  assert.ok(retire > -1 && upsert > -1, 'expected the same-device retire and the upsert');
  assert.ok(retire < upsert, 'subscribe.js must retire the same-device rows before upserting');
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
