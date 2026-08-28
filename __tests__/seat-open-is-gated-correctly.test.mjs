/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE GATE MUST BE ABLE TO NAME THE THING IT IS GATING
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 2026-08-28. The Club Arena engine has always written
 * `type: 'waitlist_seat_open'`. The gate's canonical key has always been
 * `seat_open`. Nothing joined them, and over the fourteen days before this
 * file existed that gap covered 2,341 of 2,462 push_outbox rows -- ninety-five
 * per cent of every notification the platform has ever tried to send.
 *
 * It produced no error and no alarm, because an unrecognised event is ALLOWED.
 * The damage was in what a null key silently forfeits:
 *
 *   - `seat_open` sits in URGENT_TYPES so that a seat about to be forfeited
 *     pierces quiet hours and the daily cap. Unrecognised events are never
 *     urgent, so the one class of notification that must survive a quiet-hours
 *     window was precisely the class being dropped by it.
 *
 *   - The "Seat Available" toggle writes push_type_prefs.seat_open. The gate
 *     was asking about `null`, so switching it off changed nothing.
 *
 * Both were dormant only because nobody had a push subscription to set those
 * preferences against. Enrolment shipped the day before this, so both were
 * about to start biting.
 *
 * These tests are behavioural, against the real gate, because the regression
 * is not "somebody edits this line" -- it is "somebody adds a producer with a
 * new event string and never tells the gate", which only an end-to-end
 * assertion catches.
 *
 * Run: node --test __tests__/seat-open-is-gated-correctly.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
    eventToTypeKey,
    isUrgentType,
    isWithinQuietHours,
    pushTypeAllowed,
    URGENT_TYPES,
} from '../src/lib/push/push-prefs.js';
import { gateDecision } from '../src/lib/push/push-gate.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The exact string the Club Arena engine writes. Do not "tidy" this. */
const ENGINE_EVENT = 'waitlist_seat_open';

/* ═══════════════════════════════════════════════════════════════════════
   THE ALIAS
   ═══════════════════════════════════════════════════════════════════════ */

test('the engine event resolves to the canonical seat key', () => {
    assert.equal(eventToTypeKey(ENGINE_EVENT), 'seat_open');
});

test('a seat offer is urgent, so it survives quiet hours and the cap', () => {
    assert.ok(URGENT_TYPES.has('seat_open'), 'seat_open must stay in URGENT_TYPES');
    assert.equal(isUrgentType(eventToTypeKey(ENGINE_EVENT)), true);
});

test('quiet hours cannot swallow a seat offer', () => {
    // 03:00 in the user's timezone, inside a 22->07 window.
    const prefs = {
        quiet_hours_start: 22,
        quiet_hours_end: 7,
        quiet_hours_tz: 'UTC',
        push_enabled: true,
    };
    const at3am = new Date('2026-08-28T03:00:00Z');

    assert.equal(isWithinQuietHours(prefs, at3am), true, 'the window itself must still work');

    const seat = gateDecision({ prefs, legacy: null }, ENGINE_EVENT, { now: at3am });
    assert.equal(seat.allowed, true, `a seat offer was suppressed: ${seat.reason}`);

    // ...while something genuinely deferrable is still held back, or the
    // urgency carve-out would be meaningless.
    const like = gateDecision({ prefs, legacy: null }, 'like', { now: at3am });
    assert.equal(like.allowed, false);
    assert.equal(like.reason, 'quiet_hours');
});

test('the daily cap cannot swallow a seat offer', () => {
    const prefs = { daily_push_cap: 5, push_enabled: true };
    const seat = gateDecision({ prefs, legacy: null }, ENGINE_EVENT, { sentToday: 99 });
    assert.equal(seat.allowed, true, `a seat offer was capped: ${seat.reason}`);

    const like = gateDecision({ prefs, legacy: null }, 'like', { sentToday: 99 });
    assert.equal(like.allowed, false);
    assert.match(like.reason, /^daily_cap_reached/);
});

test('turning Seat Available off actually turns seat offers off', () => {
    // The consent half. Urgency must not become a way to ignore a direct no.
    const prefs = { push_enabled: true, push_type_prefs: { seat_open: false } };
    assert.equal(pushTypeAllowed(prefs.push_type_prefs, eventToTypeKey(ENGINE_EVENT)), false);

    const d = gateDecision({ prefs, legacy: null }, ENGINE_EVENT, {});
    assert.equal(d.allowed, false);
    assert.equal(d.reason, 'type_disabled:seat_open');
});

test('mute all and push off still stop a seat offer', () => {
    // Urgent means "pierces the scheduling rules", never "ignores the switch".
    const muted = gateDecision({ prefs: { mute_all: true }, legacy: null }, ENGINE_EVENT, {});
    assert.equal(muted.allowed, false);
    assert.equal(muted.reason, 'mute_all');

    const off = gateDecision({ prefs: { push_enabled: false }, legacy: null }, ENGINE_EVENT, {});
    assert.equal(off.allowed, false);
    assert.equal(off.reason, 'push_disabled');
});

/* ═══════════════════════════════════════════════════════════════════════
   QUIET HOURS WITHOUT A TIMEZONE
   ═══════════════════════════════════════════════════════════════════════ */

test('a quiet-hours window with no timezone is not enforced', () => {
    // It used to default to UTC, which is the one timezone we know is not the
    // user's. A player in Los Angeles setting 22->07 was judged eight hours
    // ahead: silence all afternoon, pushes at 3am. Exactly backwards.
    const noTz = { quiet_hours_start: 22, quiet_hours_end: 7, quiet_hours_tz: null };
    const at3amUtc = new Date('2026-08-28T03:00:00Z');
    assert.equal(isWithinQuietHours(noTz, at3amUtc), false);

    // With a real timezone it still applies, both ways round.
    const la = { ...noTz, quiet_hours_tz: 'America/Los_Angeles' };
    // 03:00 UTC is 20:00 the previous day in LA -- outside a 22->07 window.
    assert.equal(isWithinQuietHours(la, at3amUtc), false);
    // 07:00 UTC is 00:00 in LA -- inside it.
    assert.equal(isWithinQuietHours(la, new Date('2026-08-28T07:00:00Z')), true);
});

test('an unparseable timezone never blocks a notification', () => {
    const bad = { quiet_hours_start: 0, quiet_hours_end: 23, quiet_hours_tz: 'Mars/Olympus_Mons' };
    assert.equal(isWithinQuietHours(bad, new Date('2026-08-28T12:00:00Z')), false);
});

/* ═══════════════════════════════════════════════════════════════════════
   THE SURROUNDING WIRING
   ═══════════════════════════════════════════════════════════════════════ */

test('a digested run of seat offers says what they are', () => {
    // DIGEST_LABEL is keyed on the RAW event, which is what carrier.event
    // holds. Without an entry the commonest notification on the platform read
    // "3 new notifications", which buries the one thing worth waking up for.
    const dispatch = readFileSync(join(ROOT, 'pages/api/cron/push-dispatch.js'), 'utf8');
    assert.match(dispatch, new RegExp(`${ENGINE_EVENT}:\\s*'seats open'`));
});

test('an unknown push type is refused, not silently discarded', () => {
    // The bulk PATCH form used to `continue` past an unknown key and still
    // answer 200 {ok:true} -- a preference the user believes they hold and
    // does not.
    const api = readFileSync(join(ROOT, 'pages/api/notifications/push-types.js'), 'utf8');
    assert.match(api, /unknownKeys/, 'the route must name what it rejected');
    assert.doesNotMatch(
        api,
        /if \(!PUSH_TYPE_KEYS\.has\(k\)\) continue;/,
        'the silent skip is back'
    );
});

test('the engine still writes the event this file is built around', () => {
    // The single assumption everything above rests on. Club Arena is a
    // separate repo and a separate runtime, so nothing else here would notice
    // if that string were renamed -- it would just quietly stop being gated
    // again. Skipped rather than failed when the sibling checkout is absent,
    // because CI clones only this repo.
    const enginePath = join(
        ROOT,
        '..',
        'club-arena',
        'server/src/services/supabase/seats.ts'
    );
    let engine;
    try {
        engine = readFileSync(enginePath, 'utf8');
    } catch {
        return; // sibling repo not checked out -- nothing to assert against
    }
    assert.match(
        engine,
        new RegExp(`['"]${ENGINE_EVENT}['"]`),
        'the engine no longer writes waitlist_seat_open -- update EVENT_ALIASES'
    );
});
