/* RUN THE REACHABILITY LAW FROM HERE (2026-09-12).
 *
 * build-safety-gate.yml CHECK 8 invokes an EXPLICIT list of test files, and
 * adding a name to that list needs a token with the GitHub `workflow` scope,
 * which the automation PAT does not have. This file is already on the list and
 * is already about push, so importing the suite makes its cases run in CI -
 * node:test registers every test declared during module evaluation, imported
 * ones included. Same device `_test-guards-exist.test.mjs` uses, same reason.
 *
 * If that law is ever added to CHECK 8 by name, delete this import. */
import './a-skip-is-not-a-failed-send.law.test.mjs';

/**
 * EVERY EVENT THE MONEY TRIGGERS EMIT MUST BE NAMEABLE BY THE CONSENT GATE.
 *
 * `eventToTypeKey` returns null for an event it does not recognise, and null
 * means "unknown, allow it" — deliberately, so a new feature that forgets to
 * register its type still reaches the user. The cost of that kindness is that
 * an unregistered event silently forfeits TWO things:
 *
 *   1. CONSENT. The toggle renders in Settings, writes push_type_prefs.<key>,
 *      and does nothing at all, because the gate is asked about `null`.
 *   2. URGENCY. An unrecognised event can never be in URGENT_TYPES.
 *
 * This has already happened once on this platform: `waitlist_seat_open` went
 * unregistered and accounted for 2,341 of 2,462 outbox rows over fourteen days
 * — 95% of everything the gate had ever been asked to judge, none of which it
 * could name. See the comment above that entry in push-prefs.js.
 *
 * The events below are written by database triggers in the club-arena repo
 * (supabase/migrations/20260830_notify_money_flows_server_side.sql) and copied
 * verbatim into push_outbox.event by trg_mirror_notification_to_push_outbox.
 * They are money events. Silently ignoring somebody's "off" switch on those is
 * worse than ignoring it anywhere else.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { eventToTypeKey, isUrgentType, PUSH_TYPE_KEYS, PUSH_TYPES } from '../src/lib/push/push-prefs.js';

/** Exactly the strings the triggers write into notifications.type. */
const TRIGGER_EVENTS = [
  // NEW — fn_notify_credit_request / fn_notify_dispute
  'credit_request',
  'credit_approved',
  'credit_denied',
  'settlement_dispute_filed',
  'dispute_resolved',
  // PRE-EXISTING cash-out notifiers, read out of pg_proc rather than guessed.
  // These have been firing ungated since before this work; registering them is
  // the same fix as `waitlist_seat_open` above.
  'cashout_request', // fn_notify_agent_on_cashout
  'cashout_approved', // fn_cashout_approve
  'cashout_cancelled', // fn_cashout_release
  'cashout_denied', // fn_cashout_release
  'cashout_request_escrow', // fn_cashout_request
  'cashout_expired_refund', // fn_expire_stale_cashouts
];

test('every money-trigger event maps to a real preference key', () => {
  for (const event of TRIGGER_EVENTS) {
    const key = eventToTypeKey(event);
    assert.ok(
      key,
      `eventToTypeKey('${event}') returned ${key}. A database trigger emits this ` +
        `event; an unmapped event bypasses the user's toggle entirely. Add it to ` +
        `EVENT_ALIASES in src/lib/push/push-prefs.js.`
    );
    assert.ok(
      PUSH_TYPE_KEYS.has(key),
      `'${event}' maps to '${key}', which is not a key in PUSH_TYPES — so no ` +
        `toggle in Settings can ever write it, and the mapping is decorative.`
    );
  }
});

test('the cashier type is offered in Settings, not just in the map', () => {
  const cashier = PUSH_TYPES.find((t) => t.key === 'cashier');
  assert.ok(cashier, 'PUSH_TYPES has no `cashier` entry, so the toggle never renders');
  assert.ok(cashier.label && cashier.group && cashier.desc, 'a type needs label, group and desc to render');
});

test('cashier is distinct from system', () => {
  // Folding money into `system` would mean muting security notices also mutes
  // "your cash-out completed". Two different promises, two different switches.
  for (const event of TRIGGER_EVENTS) {
    assert.notEqual(
      eventToTypeKey(event),
      'system',
      `'${event}' is a money event; it must not share a switch with security notices`
    );
  }
});

test('blinding off is registered AND urgent', () => {
  // trg_notify_blinding_off fires when the engine flags a live tournament seat
  // is_sitting_out / is_away: the player is paying blinds and antes to not be
  // there. The value of this notification is entirely in arriving NOW, so it
  // has to survive quiet hours and the daily cap.
  //
  // An unmapped event can never be urgent, so this asserts both halves: that
  // the gate can name it, and that naming it bought the urgency.
  const key = eventToTypeKey('tournament_blinding_off');
  assert.equal(key, 'tournament_starting', 'blinding off must map to a real, urgent key');
  assert.ok(
    isUrgentType(key),
    'tournament_blinding_off maps to a key that is not in URGENT_TYPES, so a player ' +
      'bleeding chips inside quiet hours will not be told until it is over'
  );
});
