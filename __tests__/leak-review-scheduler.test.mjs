/**
 * LEAK REVIEW SCHEDULER — UNIT TESTS
 * ─────────────────────────────────────────────────────────────────────────
 * `src/lib/sandbox/leakReview.js` is the scheduling brain behind drilling a
 * user's own detected leaks on a spaced-repetition cadence. It is pure and
 * deterministic ON PURPOSE — no Date.now(), no fetch, no React — precisely so
 * it can be pinned here.
 *
 * What these tests defend, and why each one exists:
 *   • leakToDrill() must emit EXACTLY the { street, position, limit } contract
 *     QuickSpotDrill feeds to `new URLSearchParams()` and /api/sandbox/
 *     custom-drill reads. An undefined value there stringifies to the literal
 *     "undefined" and filters the question pool down to zero rows — a drill
 *     that opens empty.
 *   • Intervals must GROW on strong sessions, RESET HARD on failure, and never
 *     exceed the ~3 week cap (leak detection re-runs; scheduling past that is
 *     a lie).
 *   • Ease must stay inside its bounds no matter how many times it is nudged.
 *   • The due queue must put overdue work first and break ties by EV impact,
 *     because the user's most expensive leak is the one worth their time.
 *   • Malformed / hostile records (NaN interval, null dates, strings where
 *     numbers belong, throwing getters, a leak that has vanished) must never
 *     throw and never produce NaN/Infinity — this data round-trips through
 *     localStorage and a JSON column.
 *
 * Run: node --test __tests__/leak-review-scheduler.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    SCHEMA_VERSION,
    MIN_EASE,
    MAX_EASE,
    DEFAULT_EASE,
    MAX_INTERVAL_DAYS,
    MIN_INTERVAL_DAYS,
    FIRST_INTERVAL_DAYS,
    SECOND_INTERVAL_DAYS,
    MAX_QUEUE,
    RETIRE_AFTER_STRONG,
    leakToDrill,
    initialReview,
    gradeReview,
    isDue,
    dueQueue,
    dueQueueAll,
    reviewStats,
    migrateRecord,
    evImpact,
    streetFromHint,
    positionFromHint,
    drillLength,
} from '../src/lib/sandbox/leakReview.js';

const DAY = 86400000;
const T0 = Date.parse('2026-08-04T12:00:00.000Z');
const at = (days) => new Date(T0 + days * DAY).toISOString();

/** The real formatLeak() shape from src/hooks/useAssistant.js. */
function makeLeak(over = {}) {
    return {
        id: 'leak-1',
        title: 'Overfolding To Cbets',
        status: 'persistent',
        confidence: 'high',
        situationClass: 'MP vs C-Bet - Single Raised Pots',
        evLossBB: 0.14,
        occurrenceCount: 47,
        leakType: 'overfolding_to_cbets',
        leakCategory: 'flop',
        recommendedDrill: null,
        suggestedFix: null,
        lastDetected: at(-1),
        ...over,
    };
}

/** Every value must survive JSON + URLSearchParams without becoming garbage. */
function assertFinite(obj, label) {
    for (const [k, v] of Object.entries(obj || {})) {
        if (typeof v === 'number') {
            assert.ok(Number.isFinite(v), `${label}.${k} must be finite, got ${v}`);
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// leakToDrill — the QuickSpotDrill / custom-drill contract
// ═══════════════════════════════════════════════════════════════════════════

test('leakToDrill emits exactly { street, position, limit } and nothing else', () => {
    const drill = leakToDrill(makeLeak());
    assert.deepEqual(Object.keys(drill).sort(), ['limit', 'position', 'street']);
    assert.equal(drill.street, 'Flop');
    assert.equal(drill.position, 'MP');
    assert.ok(drill.limit >= 1 && drill.limit <= 20, 'limit must be inside the API clamp');

    // URLSearchParams is exactly what QuickSpotDrill does with these params.
    const qs = new URLSearchParams(drill).toString();
    assert.ok(!qs.includes('undefined'), `query must not contain "undefined": ${qs}`);
    assert.ok(!qs.includes('null'), `query must not contain "null": ${qs}`);
    assert.match(qs, /street=Flop/);
});

test('leakToDrill prefers recommendedDrill over the derived category', () => {
    const drill = leakToDrill(makeLeak({ recommendedDrill: 'river', leakCategory: 'flop' }));
    assert.equal(drill.street, 'River');
});

test('leakToDrill derives the street from leakType when category is missing', () => {
    assert.equal(leakToDrill(makeLeak({
        leakCategory: null, recommendedDrill: null, leakType: 'turn_barrel_too_rare',
    })).street, 'Turn');

    assert.equal(leakToDrill(makeLeak({
        leakCategory: null, recommendedDrill: null, leakType: 'lack_of_river_bluffs',
    })).street, 'River');

    // 'preflop' contains 'flop' — the ordering in STREET_HINTS must handle it.
    assert.equal(leakToDrill(makeLeak({
        leakCategory: null, recommendedDrill: null, leakType: 'three_bet_too_tight',
        situationClass: 'Cutoff vs Button - 3-Bet Pots',
    })).street, 'Preflop');
});

test('leakToDrill takes the HERO position (first named) from situationClass', () => {
    assert.equal(leakToDrill(makeLeak({ situationClass: 'Cutoff vs Button - 3-Bet Pots' })).position, 'CO');
    assert.equal(leakToDrill(makeLeak({ situationClass: 'BB vs River Bet in Single Raised Pots' })).position, 'BB');
    // Positions outside the question pool's vocabulary must NOT be invented.
    assert.equal(leakToDrill(makeLeak({ situationClass: 'HJ vs LJ squeeze' })).position, 'Any');
    assert.equal(leakToDrill(makeLeak({ situationClass: null })).position, 'Any');
});

test('positionFromHint does not match position codes inside other words', () => {
    assert.equal(positionFromHint('cold calling too wide'), null); // must not see 'CO'
    assert.equal(positionFromHint('losing 3.2 BB/100'), null);      // must not see 'BB'
    assert.equal(positionFromHint('UTG opens too wide'), 'UTG');
    // Slash-separated seats are still real positions — only rate units are stripped.
    assert.equal(positionFromHint('BTN/CO vs BB'), 'BTN');
});

test('leakToDrill returns null rather than fabricating a drill', () => {
    assert.equal(leakToDrill(null), null);
    assert.equal(leakToDrill(undefined), null);
    assert.equal(leakToDrill('leak'), null);
    assert.equal(leakToDrill({ id: 'x' }), null);
    assert.equal(leakToDrill(makeLeak({
        leakCategory: null, recommendedDrill: null, leakType: 'tilt_after_losses',
        situationClass: 'general discipline',
    })), null);
    assert.equal(streetFromHint(''), null);
    assert.equal(streetFromHint(undefined), null);
});

test('drill length scales with EV impact and always stays inside 1..20', () => {
    assert.equal(drillLength(makeLeak({ evLossBB: 0.5, occurrenceCount: 200 })), 20);  // 100 bb
    assert.equal(drillLength(makeLeak({ evLossBB: 0.14, occurrenceCount: 47 })), 10);  // 6.58 bb
    assert.equal(drillLength(makeLeak({ evLossBB: 0.05, occurrenceCount: 20 })), 5);   // 1.0 bb
    assert.equal(drillLength(makeLeak({ evLossBB: null, occurrenceCount: null })), 10); // unknown
    // Hostile numbers must not escape the clamp.
    const wild = leakToDrill(makeLeak({ evLossBB: Infinity, occurrenceCount: '99999999999' }));
    assert.ok(wild.limit >= 1 && wild.limit <= 20 && Number.isInteger(wild.limit));
});

test('evImpact is finite for hostile inputs', () => {
    assert.equal(evImpact(null), 0);
    assert.equal(evImpact({}), 0);
    assert.ok(Number.isFinite(evImpact({ evLossBB: NaN, occurrenceCount: 'abc' })));
    assert.ok(Number.isFinite(evImpact({ evLossBB: Infinity, occurrenceCount: Infinity })));
    assert.ok(Number.isFinite(evImpact({ evLossBB: -0.3, occurrenceCount: 10 })));
    // EV loss is a magnitude — a negative sign in the column must not flip the
    // queue ordering upside down.
    assert.equal(evImpact({ evLossBB: -0.3, occurrenceCount: 10 }), 3);
});

// ═══════════════════════════════════════════════════════════════════════════
// initialReview
// ═══════════════════════════════════════════════════════════════════════════

test('initialReview creates a versioned record that is due immediately', () => {
    const rec = initialReview(makeLeak(), T0);
    assert.equal(rec.v, SCHEMA_VERSION);
    assert.equal(rec.leakId, 'leak-1');
    assert.equal(rec.reps, 0);
    assert.equal(rec.lapses, 0);
    assert.equal(rec.ease, DEFAULT_EASE);
    assert.equal(rec.intervalDays, 0);
    assert.equal(rec.retired, false);
    assert.deepEqual(rec.history, []);
    assert.equal(rec.dueAt, new Date(T0).toISOString());
    assert.ok(isDue(rec, T0), 'a newly detected leak is work for today');
    assertFinite(rec, 'initialReview');
});

test('initialReview refuses leaks it cannot key, and survives a broken clock', () => {
    assert.equal(initialReview(null, T0), null);
    assert.equal(initialReview({}, T0), null);
    assert.equal(initialReview({ id: '' }, T0), null);
    assert.equal(initialReview({ id: {} }, T0), null);

    const rec = initialReview(makeLeak(), 'not-a-date');
    assert.equal(rec.dueAt, null);
    assert.ok(isDue(rec, T0), 'an unreadable due date surfaces rather than stranding the leak');
});

// ═══════════════════════════════════════════════════════════════════════════
// gradeReview — growth, reset, cap, ease bounds
// ═══════════════════════════════════════════════════════════════════════════

const perfect = { correct: 10, total: 10 };
const failed = { correct: 2, total: 10 };

test('intervals grow monotonically on strong sessions and hit the ladder', () => {
    let rec = initialReview(makeLeak(), T0);
    const seen = [];
    for (let i = 0; i < 8; i++) {
        const before = rec.intervalDays;
        rec = gradeReview(rec, perfect, T0 + i * DAY);
        seen.push(rec.intervalDays);
        assert.ok(rec.intervalDays >= before, `interval must not shrink on a strong session (step ${i})`);
        assertFinite(rec, `grade-${i}`);
    }
    assert.equal(seen[0], FIRST_INTERVAL_DAYS, 'first success -> 1 day');
    assert.equal(seen[1], SECOND_INTERVAL_DAYS, 'second success -> 3 days');
    assert.ok(seen[2] > SECOND_INTERVAL_DAYS, 'third success grows past the ladder');
    assert.equal(rec.reps, 8);
    assert.equal(rec.lapses, 0);
});

test('the interval is CAPPED at MAX_INTERVAL_DAYS forever', () => {
    let rec = initialReview(makeLeak(), T0);
    for (let i = 0; i < 40; i++) {
        rec = gradeReview(rec, perfect, T0 + i * DAY);
        assert.ok(
            rec.intervalDays <= MAX_INTERVAL_DAYS,
            `interval ${rec.intervalDays} exceeded the ${MAX_INTERVAL_DAYS}-day cap at step ${i}`,
        );
    }
    assert.equal(rec.intervalDays, MAX_INTERVAL_DAYS);
    // dueAt must be exactly the capped distance out — no runaway dates.
    const dueMs = Date.parse(rec.dueAt);
    const nowMs = T0 + 39 * DAY;
    assert.equal(Math.round((dueMs - nowMs) / DAY), MAX_INTERVAL_DAYS);
});

test('a failed session resets HARD — 1 day, reps zeroed, lapse counted', () => {
    let rec = initialReview(makeLeak(), T0);
    for (let i = 0; i < 6; i++) rec = gradeReview(rec, perfect, T0 + i * DAY);
    assert.ok(rec.intervalDays > 5, 'precondition: the interval had grown');

    const after = gradeReview(rec, failed, T0 + 6 * DAY);
    assert.equal(after.intervalDays, FIRST_INTERVAL_DAYS);
    assert.equal(after.reps, 0);
    assert.equal(after.lapses, rec.lapses + 1);
    assert.equal(after.strongStreak, 0);
    assert.ok(after.ease < rec.ease, 'a failure must cost ease');
    assert.equal(after.dueAt, new Date(T0 + 6 * DAY + DAY).toISOString());
});

test('a shaky session halves the interval instead of resetting or growing', () => {
    let rec = initialReview(makeLeak(), T0);
    for (let i = 0; i < 5; i++) rec = gradeReview(rec, perfect, T0 + i * DAY);
    const before = rec.intervalDays;
    const after = gradeReview(rec, { correct: 5, total: 10 }, T0 + 5 * DAY);
    assert.ok(after.intervalDays < before, 'shaky must shrink');
    assert.ok(after.intervalDays >= MIN_INTERVAL_DAYS, 'never below the floor');
    assert.equal(after.reps, rec.reps, 'shaky holds position — no progress credited');
    assert.equal(after.lapses, rec.lapses, 'shaky is not a lapse');
});

test('ease stays inside [MIN_EASE, MAX_EASE] under sustained success and failure', () => {
    let up = initialReview(makeLeak(), T0);
    for (let i = 0; i < 60; i++) {
        up = gradeReview(up, { ...perfect, evDelta: -50 }, T0 + i * DAY);
        assert.ok(up.ease >= MIN_EASE && up.ease <= MAX_EASE, `ease escaped: ${up.ease}`);
    }
    assert.equal(up.ease, MAX_EASE);

    let down = initialReview(makeLeak(), T0);
    for (let i = 0; i < 60; i++) {
        down = gradeReview(down, { correct: 0, total: 10, evDelta: 50 }, T0 + i * DAY);
        assert.ok(down.ease >= MIN_EASE && down.ease <= MAX_EASE, `ease escaped: ${down.ease}`);
    }
    assert.equal(down.ease, MIN_EASE);
});

test('evDelta only nudges ease — it can never drive the schedule on its own', () => {
    const base = initialReview(makeLeak(), T0);
    const plain = gradeReview(base, { correct: 9, total: 10 }, T0);
    const improving = gradeReview(base, { correct: 9, total: 10, evDelta: -0.5 }, T0);
    const worsening = gradeReview(base, { correct: 9, total: 10, evDelta: 0.5 }, T0);

    assert.ok(improving.ease > plain.ease, 'a leak costing less should ease up');
    assert.ok(worsening.ease < plain.ease, 'a leak costing more should ease down');
    assert.ok(Math.abs(improving.ease - plain.ease) <= 0.15 + 1e-9, 'the nudge is bounded');
    assert.equal(improving.intervalDays, plain.intervalDays, 'evDelta must not move the ladder itself');

    // Hostile evDelta values must be ignored, not propagated.
    for (const bad of [NaN, Infinity, -Infinity, 'lots', null, {}]) {
        const out = gradeReview(base, { correct: 9, total: 10, evDelta: bad }, T0);
        assert.ok(Number.isFinite(out.ease), `ease went non-finite for evDelta=${String(bad)}`);
        assert.ok(Number.isFinite(out.intervalDays));
    }
});

test('short sessions move the schedule less than long ones', () => {
    let long = initialReview(makeLeak(), T0);
    let short = initialReview(makeLeak(), T0);
    for (let i = 0; i < 4; i++) {
        long = gradeReview(long, { correct: 10, total: 10 }, T0 + i * DAY);
        short = gradeReview(short, { correct: 2, total: 2 }, T0 + i * DAY);
    }
    assert.ok(
        short.intervalDays < long.intervalDays,
        'two lucky clicks must not buy the same interval as a full session',
    );
});

test('an empty or abandoned session is not evidence and changes nothing', () => {
    const rec = gradeReview(initialReview(makeLeak(), T0), perfect, T0);
    for (const outcome of [{ correct: 0, total: 0 }, {}, null, undefined, { correct: 5 }]) {
        const after = gradeReview(rec, outcome, T0 + DAY);
        assert.deepEqual(after, rec, `outcome ${JSON.stringify(outcome)} must be a no-op`);
    }
});

test('correct is clamped to total — a hostile 99/10 cannot be gamed', () => {
    const rec = gradeReview(initialReview(makeLeak(), T0), { correct: 99, total: 10 }, T0);
    assert.equal(rec.lastScore, 1);
    assert.ok(Number.isFinite(rec.intervalDays) && rec.intervalDays <= MAX_INTERVAL_DAYS);

    const neg = gradeReview(initialReview(makeLeak(), T0), { correct: -5, total: 10 }, T0);
    assert.equal(neg.lastScore, 0);
    assert.equal(neg.intervalDays, FIRST_INTERVAL_DAYS);
});

test('history is bounded and gradeReview never mutates its input', () => {
    let rec = initialReview(makeLeak(), T0);
    const snapshot = JSON.parse(JSON.stringify(rec));
    for (let i = 0; i < 40; i++) rec = gradeReview(rec, perfect, T0 + i * DAY);
    assert.ok(rec.history.length <= 12, `history grew unbounded: ${rec.history.length}`);
    assert.deepEqual(JSON.parse(JSON.stringify(initialReview(makeLeak(), T0))), snapshot);
});

test('a leak retires only after sustained strong sessions at the cap', () => {
    let rec = initialReview(makeLeak(), T0);
    for (let i = 0; i < 3; i++) rec = gradeReview(rec, perfect, T0 + i * DAY);
    assert.equal(rec.retired, false, 'three good sessions is not a fixed leak');

    for (let i = 3; i < 30; i++) rec = gradeReview(rec, perfect, T0 + i * DAY);
    assert.equal(rec.retired, true);
    assert.equal(isDue(rec, T0 + 400 * DAY), false, 'a retired leak is not due');
});

// ═══════════════════════════════════════════════════════════════════════════
// isDue
// ═══════════════════════════════════════════════════════════════════════════

test('isDue compares against the supplied clock only', () => {
    const rec = gradeReview(initialReview(makeLeak(), T0), perfect, T0); // due T0+1d
    assert.equal(isDue(rec, T0), false);
    assert.equal(isDue(rec, T0 + DAY - 1), false);
    assert.equal(isDue(rec, T0 + DAY), true);
    assert.equal(isDue(rec, T0 + 10 * DAY), true);
    // A clock we cannot read cannot claim anything is due.
    assert.equal(isDue(rec, 'whenever'), false);
    assert.equal(isDue(rec, null), false);
});

test('isDue never throws on junk records', () => {
    for (const junk of [null, undefined, 'record', 42, [], { dueAt: 'soon' }, { dueAt: NaN }]) {
        assert.doesNotThrow(() => isDue(junk, T0), `threw on ${JSON.stringify(junk)}`);
    }
    assert.equal(isDue(null, T0), false);
    assert.equal(isDue({ leakId: 'x', dueAt: 'soon' }, T0), true, 'unreadable date surfaces');
});

// ═══════════════════════════════════════════════════════════════════════════
// dueQueue — ordering, capping, hostility
// ═══════════════════════════════════════════════════════════════════════════

test('dueQueue puts overdue work before today, and orders ties by EV impact', () => {
    const cheapOverdue = makeLeak({ id: 'cheap-overdue', evLossBB: 0.02, occurrenceCount: 5 });
    const richToday = makeLeak({ id: 'rich-today', evLossBB: 0.9, occurrenceCount: 300 });
    const midToday = makeLeak({ id: 'mid-today', evLossBB: 0.2, occurrenceCount: 50 });

    const records = [
        { ...initialReview(cheapOverdue, T0), dueAt: at(-6), lastReviewedAt: at(-7), intervalDays: 1 },
        { ...initialReview(richToday, T0), dueAt: at(0), lastReviewedAt: at(-1), intervalDays: 1 },
        { ...initialReview(midToday, T0), dueAt: at(0), lastReviewedAt: at(-1), intervalDays: 1 },
    ];

    const q = dueQueue(records, [richToday, midToday, cheapOverdue], T0);
    assert.deepEqual(q.map(r => r.leakId), ['cheap-overdue', 'rich-today', 'mid-today']);
    assert.ok(q[0].overdueDays >= 6);
    assert.ok(q[1].evImpact > q[2].evImpact, 'inside the same overdue bucket, money decides');
});

test('a millisecond of due-date difference does not outweigh EV impact', () => {
    // Without whole-day bucketing, an arbitrary timestamp jitter would decide
    // every comparison and the EV rule would be dead code.
    const rich = makeLeak({ id: 'rich', evLossBB: 1, occurrenceCount: 100 });
    const poor = makeLeak({ id: 'poor', evLossBB: 0.01, occurrenceCount: 1 });
    const records = [
        { ...initialReview(rich, T0), dueAt: new Date(T0 - 1000).toISOString(), lastReviewedAt: at(-1) },
        { ...initialReview(poor, T0), dueAt: new Date(T0 - 90000).toISOString(), lastReviewedAt: at(-1) },
    ];
    const q = dueQueue(records, [poor, rich], T0);
    assert.deepEqual(q.map(r => r.leakId), ['rich', 'poor']);
});

test('dueQueue includes never-reviewed leaks and excludes not-yet-due ones', () => {
    const fresh = makeLeak({ id: 'fresh' });
    const scheduled = makeLeak({ id: 'scheduled' });
    const records = [{ ...initialReview(scheduled, T0), dueAt: at(5), lastReviewedAt: at(0) }];

    const q = dueQueue(records, [fresh, scheduled], T0);
    assert.deepEqual(q.map(r => r.leakId), ['fresh']);
    assert.equal(q[0].isNew, true);
    assert.ok(q[0].record, 'a new leak still comes with a usable record');
    assert.deepEqual(Object.keys(q[0].drill).sort(), ['limit', 'position', 'street']);
});

test('dueQueue drops resolved leaks and records whose leak has vanished', () => {
    const gone = makeLeak({ id: 'ghost' });
    const resolved = makeLeak({ id: 'resolved-leak', status: 'resolved' });
    const live = makeLeak({ id: 'live' });

    const records = [
        initialReview(gone, T0),
        initialReview(resolved, T0),
        initialReview(live, T0),
    ];
    // `gone` is not in the leaks list any more — its record must not resurrect it.
    const q = dueQueue(records, [resolved, live], T0);
    assert.deepEqual(q.map(r => r.leakId), ['live']);
});

test('a retired leak revives only when detection sees it again', () => {
    const leak = makeLeak({ id: 'retired-leak', lastDetected: at(-10) });
    let rec = initialReview(leak, T0 - 40 * DAY);
    for (let i = 0; i < 30; i++) rec = gradeReview(rec, perfect, T0 - (30 - i) * DAY);
    assert.equal(rec.retired, true);

    assert.deepEqual(dueQueue([rec], [leak], T0), [], 'quiet leak stays quiet');

    const reDetected = { ...leak, lastDetected: at(0) };
    const q = dueQueue([rec], [reDetected], T0);
    assert.equal(q.length, 1);
    assert.equal(q[0].revived, true, 'real hands outrank the scheduler');
});

test('dueQueue caps its length and stays deterministic', () => {
    const leaks = [];
    const records = [];
    for (let i = 0; i < 40; i++) {
        const leak = makeLeak({ id: `leak-${String(i).padStart(2, '0')}`, occurrenceCount: i });
        leaks.push(leak);
        records.push({ ...initialReview(leak, T0), dueAt: at(-i) });
    }
    const a = dueQueue(records, leaks, T0);
    const b = dueQueue(records, leaks, T0);
    assert.equal(a.length, MAX_QUEUE);
    assert.deepEqual(a.map(r => r.leakId), b.map(r => r.leakId));
});

test('dueQueue survives hostile inputs without throwing or NaN', () => {
    const leak = makeLeak();
    const hostile = [
        null, undefined, 'record', 7, [],
        { leakId: 'leak-1', intervalDays: NaN, ease: 'high', dueAt: null, history: 'nope' },
        { leakId: 'leak-1', dueAt: 'yesterday', reps: -5, lapses: Infinity },
    ];
    assert.doesNotThrow(() => dueQueue(hostile, [leak], T0));
    const q = dueQueue(hostile, [leak], T0);
    for (const row of q) {
        assert.ok(Number.isFinite(row.overdueDays), 'overdueDays must be finite');
        assert.ok(Number.isFinite(row.evImpact), 'evImpact must be finite');
        assertFinite(row.record, 'queue record');
    }

    assert.deepEqual(dueQueue(null, null, T0), []);
    assert.deepEqual(dueQueue([], [leak], 'not-a-clock'), []);
    assert.deepEqual(dueQueue([], [null, 'leak', {}, { id: '' }], T0), []);
});

test('dueQueue accepts the { [leakId]: record } map shape too', () => {
    const leak = makeLeak({ id: 'mapped' });
    const map = { mapped: { dueAt: at(-2), intervalDays: 1, ease: 2.3 } };
    const q = dueQueue(map, [leak], T0);
    assert.equal(q.length, 1);
    assert.equal(q[0].isNew, false, 'the map key must be honoured as the leakId');
});

// ═══════════════════════════════════════════════════════════════════════════
// reviewStats
// ═══════════════════════════════════════════════════════════════════════════

test('reviewStats reports due count, next due date and retired count', () => {
    const records = [
        { ...initialReview(makeLeak({ id: 'a' }), T0), dueAt: at(-1), lastReviewedAt: at(-2) },
        { ...initialReview(makeLeak({ id: 'b' }), T0), dueAt: at(3), lastReviewedAt: at(0) },
        { ...initialReview(makeLeak({ id: 'c' }), T0), dueAt: at(9), lastReviewedAt: at(0) },
        { ...initialReview(makeLeak({ id: 'd' }), T0), dueAt: at(1), retired: true, lastReviewedAt: at(0) },
    ];
    const stats = reviewStats(records, T0);
    assert.equal(stats.dueCount, 1);
    assert.equal(stats.retiredCount, 1);
    assert.equal(stats.activeCount, 3);
    assert.equal(stats.nextDueAt, at(3), 'the earliest FUTURE due date');
});

test('reviewStats counts a consecutive-day streak with a one-day grace', () => {
    const mk = (id, dayOffset) => ({
        ...initialReview(makeLeak({ id }), T0), lastReviewedAt: at(dayOffset), dueAt: at(5),
    });

    assert.equal(reviewStats([mk('a', 0), mk('b', -1), mk('c', -2)], T0).streak, 3);
    // Reviewed yesterday but not yet today — the streak is still alive.
    assert.equal(reviewStats([mk('a', -1), mk('b', -2)], T0).streak, 2);
    // A whole missed day breaks it.
    assert.equal(reviewStats([mk('a', -2), mk('b', -3)], T0).streak, 0);
    assert.equal(reviewStats([], T0).streak, 0);
});

test('reviewStats never throws and always returns finite counts', () => {
    for (const junk of [null, undefined, 'records', 5, [null, 'x', {}], { a: null }]) {
        assert.doesNotThrow(() => reviewStats(junk, T0));
        const s = reviewStats(junk, T0);
        assert.ok(Number.isFinite(s.dueCount) && Number.isFinite(s.streak) && Number.isFinite(s.retiredCount));
    }
    const noClock = reviewStats([initialReview(makeLeak(), T0)], 'nope');
    assert.equal(noClock.dueCount, 0);
    assert.equal(noClock.nextDueAt, null);
    assert.equal(noClock.streak, 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// migrateRecord — persisted blobs from older shapes
// ═══════════════════════════════════════════════════════════════════════════

test('migrateRecord upgrades the v1 (unversioned) SM-2 shape', () => {
    const v1 = {
        leak_id: 'leak-7',
        interval: 6,
        easiness: 2.5,
        nextReview: at(2),
        repetitions: 3,
        failures: 1,
        lastReview: at(-4),
        mastered: false,
    };
    const rec = migrateRecord(v1);
    assert.equal(rec.v, SCHEMA_VERSION);
    assert.equal(rec.leakId, 'leak-7');
    assert.equal(rec.intervalDays, 6);
    assert.equal(rec.ease, 2.5);
    assert.equal(rec.dueAt, at(2));
    assert.equal(rec.reps, 3);
    assert.equal(rec.lapses, 1);
    assert.equal(rec.lastReviewedAt, at(-4));
    assert.equal(rec.retired, false);
    assert.deepEqual(rec.history, []);
    // And it must be immediately usable by the rest of the module.
    assert.equal(isDue(rec, T0), false);
    assert.equal(isDue(rec, T0 + 3 * DAY), true);
    assert.doesNotThrow(() => gradeReview(v1, perfect, T0));
});

test('migrateRecord is idempotent on a current record', () => {
    const rec = gradeReview(initialReview(makeLeak(), T0), perfect, T0);
    assert.deepEqual(migrateRecord(rec), rec);
    assert.deepEqual(migrateRecord(migrateRecord(rec)), rec);
    // A JSON round-trip (localStorage / a jsonb column) must change nothing.
    assert.deepEqual(migrateRecord(JSON.parse(JSON.stringify(rec))), rec);
});

test('migrateRecord repairs garbage instead of dropping the whole card', () => {
    const rec = migrateRecord({
        leakId: 'leak-9',
        intervalDays: NaN,
        ease: 'very easy',
        dueAt: 'tomorrow-ish',
        reps: '4',
        lapses: -3,
        strongStreak: Infinity,
        history: 'not an array',
        lastScore: 42,
    });
    assert.equal(rec.leakId, 'leak-9');
    assert.equal(rec.intervalDays, 0);
    assert.equal(rec.ease, DEFAULT_EASE);
    assert.equal(rec.dueAt, null);
    assert.equal(rec.reps, 4, 'numeric strings are coerced, not discarded');
    assert.equal(rec.lapses, 0);
    assert.ok(Number.isFinite(rec.strongStreak));
    assert.deepEqual(rec.history, []);
    assert.ok(rec.lastScore >= 0 && rec.lastScore <= 1);
    assertFinite(rec, 'repaired');
});

test('migrateRecord rejects non-records and never throws on hostile ones', () => {
    for (const junk of [null, undefined, 'x', 5, [], [1, 2], true]) {
        assert.equal(migrateRecord(junk), null, `expected null for ${JSON.stringify(junk)}`);
    }
    const booby = {};
    Object.defineProperty(booby, 'leakId', { get() { throw new Error('boom'); }, enumerable: true });
    assert.doesNotThrow(() => migrateRecord(booby));
    assert.equal(migrateRecord(booby), null);
});

test('grading a migrated v1 record produces a clean current record', () => {
    const v1 = { leak_id: 'leak-7', interval: 6, easiness: 2.5, nextReview: at(2), repetitions: 3 };
    const graded = gradeReview(v1, perfect, T0);
    assert.equal(graded.v, SCHEMA_VERSION);
    assert.equal(graded.leakId, 'leak-7');
    assert.ok(graded.intervalDays > 6 && graded.intervalDays <= MAX_INTERVAL_DAYS);
    assertFinite(graded, 'graded-v1');
});

// ═══════════════════════════════════════════════════════════════════════════
// DETERMINISM — the whole reason this module has no Date.now() in it
// ═══════════════════════════════════════════════════════════════════════════

test('same inputs produce byte-identical outputs', () => {
    const leak = makeLeak();
    assert.deepEqual(leakToDrill(leak), leakToDrill(leak));
    assert.deepEqual(initialReview(leak, T0), initialReview(leak, T0));

    const base = initialReview(leak, T0);
    const a = gradeReview(base, { correct: 7, total: 10, evDelta: -0.2 }, T0);
    const b = gradeReview(base, { correct: 7, total: 10, evDelta: -0.2 }, T0);
    assert.deepEqual(a, b);
    assert.equal(JSON.stringify(a), JSON.stringify(b));

    // A whole 10-step run replays identically.
    const run = (steps) => {
        let rec = initialReview(leak, T0);
        const out = [];
        for (let i = 0; i < steps; i++) {
            rec = gradeReview(rec, i % 3 === 0 ? failed : perfect, T0 + i * DAY);
            out.push({ i: rec.intervalDays, e: rec.ease, r: rec.reps, d: rec.dueAt });
        }
        return out;
    };
    assert.deepEqual(run(10), run(10));

    const records = [base];
    assert.deepEqual(dueQueue(records, [leak], T0), dueQueue(records, [leak], T0));
    assert.deepEqual(reviewStats(records, T0), reviewStats(records, T0));
});

test('no exported function reads the wall clock', () => {
    // If any of these called Date.now(), results would differ across a clock
    // change. Freeze Date.now to a wrong value and prove nothing moves.
    const realNow = Date.now;
    const leak = makeLeak();
    const snapshot = () => ({
        drill: leakToDrill(leak),
        init: initialReview(leak, T0),
        graded: gradeReview(initialReview(leak, T0), perfect, T0),
        due: isDue(initialReview(leak, T0), T0 + DAY),
        queue: dueQueue([initialReview(leak, T0)], [leak], T0),
        stats: reviewStats([initialReview(leak, T0)], T0),
    });
    try {
        const before = snapshot();
        Date.now = () => 0;
        assert.deepEqual(snapshot(), before);
        Date.now = () => 4102444800000; // 2100-01-01
        assert.deepEqual(snapshot(), before);
    } finally {
        Date.now = realNow;
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// THE API ROUND-TRIP
// ─────────────────────────────────────────────────────────────────────────
// Everything above tests the module against ITSELF. That is exactly why two
// real bugs stayed invisible: the module's own signature was always honoured
// in the tests, and the persisted row was never modelled at all.
//
//   1. pages/api/assistant/leaks/review.js called scheduler(prev, outcome,
//      { now }). gradeReview()'s third argument is a Date | epoch-ms | ISO
//      string, so `{ now }` parsed to null and dueAt / lastReviewedAt /
//      history[].at all came back null — the stored due date was silently
//      produced by the route's own fallback, not by the scheduler.
//   2. strongStreak / retired / lastScore / history had no columns, so they
//      were zeroed on every round-trip: RETIRE_AFTER_STRONG was unreachable
//      and reviewStats().retiredCount was permanently 0 for signed-in users.
//
// These tests model the round-trip (scheduler -> normalizeState -> row ->
// mapRow -> client) so neither can come back silently.
// ═══════════════════════════════════════════════════════════════════════════

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readRepoFile = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const ROUTE_SRC = readRepoFile('pages/api/assistant/leaks/review.js');
const MIGRATION_SRC = readRepoFile('supabase/migrations/20260805000000_leak_review_state.sql');

// ── the clock contract ─────────────────────────────────────────────────────

test('the scheduler produces a real dueAt when handed the clock the route has', () => {
    // `now` in the route is a plain `new Date()`. That is a supported shape.
    const now = new Date(T0);
    const prev = initialReview(makeLeak(), T0 - 3 * DAY);
    const next = gradeReview(prev, { correct: 9, total: 10 }, now);

    assert.notEqual(next.dueAt, null, 'dueAt must be set by the scheduler, not left to a fallback');
    assert.notEqual(next.lastReviewedAt, null, 'lastReviewedAt must be set');
    assert.ok(next.history.length > 0, 'a graded session must be recorded');
    assert.notEqual(next.history[next.history.length - 1].at, null, 'history entries must be dated');
    assert.equal(Date.parse(next.dueAt) > T0, true, 'dueAt must be in the future');

    // epoch-ms and ISO are the other two shapes the route may legitimately pass.
    assert.notEqual(gradeReview(prev, { correct: 9, total: 10 }, T0).dueAt, null);
    assert.notEqual(gradeReview(prev, { correct: 9, total: 10 }, new Date(T0).toISOString()).dueAt, null);
});

test('wrapping the clock in an options object nulls the whole schedule', () => {
    // This is the exact failure mode. Kept as a test so the shape stays a
    // deliberate contract rather than something a caller can rediscover.
    const prev = initialReview(makeLeak(), T0 - 3 * DAY);
    const wrong = gradeReview(prev, { correct: 9, total: 10 }, { now: new Date(T0) });
    assert.equal(wrong.dueAt, null);
    assert.equal(wrong.lastReviewedAt, null);
});

test('the review route passes the clock to the scheduler directly', () => {
    assert.match(
        ROUTE_SRC,
        /scheduler\(\s*prev\s*,\s*outcome\s*,\s*now\s*\)/,
        'review.js must call scheduler(prev, outcome, now)',
    );
    assert.doesNotMatch(
        ROUTE_SRC,
        /scheduler\([^)]*\{\s*now\s*[,}]/,
        'review.js must not wrap the clock in an options object',
    );
});

// ── the persisted row ──────────────────────────────────────────────────────

/**
 * One full trip through the API exactly as pages/api/assistant/leaks/review.js
 * performs it: gradeReview -> normalizeState clamping -> the `row` written to
 * Postgres -> mapRow() as the client receives it.
 *
 * `dropMastery` reproduces the OLD behaviour (no strong_streak / retired /
 * last_score / history columns) so the regression is provable, not asserted.
 */
function serverRoundTrip(prev, outcome, nowMs, { dropMastery = false } = {}) {
    const now = new Date(nowMs);
    const computed = gradeReview(prev, outcome, now);          // bare clock

    // normalizeState()
    const state = {
        ease: Math.round(Math.min(MAX_EASE, Math.max(MIN_EASE, computed.ease)) * 100) / 100,
        intervalDays: Math.min(365, Math.max(0, Math.round(computed.intervalDays))),
        reps: computed.reps,
        lapses: computed.lapses,
        dueAt: computed.dueAt,
        strongStreak: computed.strongStreak,
        retired: computed.retired === true,
        lastScore: computed.lastScore,
        history: computed.history,
    };

    // the row (integer / numeric / jsonb columns)
    const row = {
        leak_id: (prev && prev.leakId) || 'leak-1',
        ease: state.ease,
        interval_days: state.intervalDays,
        due_at: state.dueAt,
        reps: state.reps,
        lapses: state.lapses,
        updated_at: now.toISOString(),
    };
    if (!dropMastery) {
        row.strong_streak = state.strongStreak;
        row.retired = state.retired;
        row.last_score = state.lastScore;
        row.history = state.history;
    }

    // mapRow() — mastery keys are emitted only when the column exists
    const mapped = {
        leakId: row.leak_id,
        ease: Number(row.ease),
        intervalDays: Number(row.interval_days) || 0,
        dueAt: row.due_at,
        reps: Number(row.reps) || 0,
        lapses: Number(row.lapses) || 0,
        updatedAt: row.updated_at,
    };
    if (row.strong_streak !== undefined) mapped.strongStreak = Math.max(0, Math.floor(Number(row.strong_streak) || 0));
    if (row.retired !== undefined) mapped.retired = row.retired === true;
    if (row.last_score !== undefined) mapped.lastScore = row.last_score;
    if (row.history !== undefined) mapped.history = row.history;

    // the client re-reads it through migrateRecord (leaks.js / QuickSpotDrill)
    return migrateRecord({ ...mapped, lastReviewedAt: mapped.updatedAt });
}

test('a full server round-trip preserves strongStreak, retired, lastScore and history', () => {
    let rec = initialReview(makeLeak(), T0);
    rec = serverRoundTrip(rec, { correct: 10, total: 10 }, T0);

    assert.equal(rec.strongStreak, 1, 'a strong session must leave a streak behind');
    assert.equal(rec.lastScore, 1, 'lastScore must survive the row');
    assert.equal(rec.history.length, 1, 'history must survive the row');
    assert.notEqual(rec.dueAt, null);
    assert.notEqual(rec.lastReviewedAt, null);
});

test('consecutive strong sessions actually retire a leak through the API', () => {
    let rec = initialReview(makeLeak(), T0);
    let day = 0;

    // Enough cap-length cycles that the streak requirement is the binding one.
    for (let i = 0; i < RETIRE_AFTER_STRONG + 4 && !rec.retired; i++) {
        day += Math.max(1, Math.round(rec.intervalDays) || 1);
        rec = serverRoundTrip(rec, { correct: 10, total: 10 }, T0 + day * DAY);
    }

    assert.equal(rec.retired, true, 'RETIRE_AFTER_STRONG must be reachable through the API');
    assert.ok(rec.strongStreak >= RETIRE_AFTER_STRONG);
    assert.equal(rec.intervalDays, MAX_INTERVAL_DAYS);

    const stats = reviewStats([rec], T0 + (day + 1) * DAY);
    assert.equal(stats.retiredCount, 1, 'reviewStats must see the retirement');
    assert.equal(stats.activeCount, 0);

    // A retired leak drops out of the queue until detection revives it.
    const stale = makeLeak({ lastDetected: at(-1) });
    assert.equal(dueQueue([rec], [stale], T0 + (day + 30) * DAY).length, 0);
    const reDetected = makeLeak({ lastDetected: at(day + 20) });
    const revived = dueQueue([rec], [reDetected], T0 + (day + 30) * DAY);
    assert.equal(revived.length, 1);
    assert.equal(revived[0].revived, true);
});

test('dropping the mastery columns makes retirement unreachable (the regression)', () => {
    let rec = initialReview(makeLeak(), T0);
    let day = 0;
    for (let i = 0; i < 12; i++) {
        day += Math.max(1, Math.round(rec.intervalDays) || 1);
        rec = serverRoundTrip(rec, { correct: 10, total: 10 }, T0 + day * DAY, { dropMastery: true });
        assert.equal(rec.strongStreak, 0, 'without the column the streak resets every time');
        assert.equal(rec.retired, false);
    }
    assert.equal(reviewStats([rec], T0 + (day + 1) * DAY).retiredCount, 0);
});

test('the migration ships the columns the round-trip needs', () => {
    for (const col of ['strong_streak', 'retired', 'last_score', 'history']) {
        assert.match(
            MIGRATION_SRC,
            new RegExp(`ADD COLUMN IF NOT EXISTS\\s+${col}\\b`),
            `${col} must be added idempotently for existing tables`,
        );
        assert.ok(
            new RegExp(`^\\s+${col}\\s`, 'm').test(MIGRATION_SRC),
            `${col} must be in the CREATE TABLE body`,
        );
    }
});

test('the route reads and writes the mastery columns', () => {
    for (const col of ['strong_streak', 'retired', 'last_score', 'history']) {
        assert.ok(ROUTE_SRC.includes(`row.${col}`), `mapRow must read row.${col}`);
        assert.match(
            ROUTE_SRC,
            new RegExp(`${col}:\\s*state\\.`),
            `the persisted row must include ${col}`,
        );
    }
});

// ── one set of ease bounds ─────────────────────────────────────────────────

test('the route takes its ease bounds from the scheduler, not its own literals', () => {
    for (const name of ['MIN_EASE', 'MAX_EASE', 'DEFAULT_EASE']) {
        assert.match(
            ROUTE_SRC,
            new RegExp(`moduleNumber\\(\\s*'${name}'`),
            `${name} must come from src/lib/sandbox/leakReview`,
        );
    }
    // The old wider bound is what let the fallback write an ease the client
    // then silently re-clamped.
    assert.doesNotMatch(ROUTE_SRC, /const EASE_MAX = 3\.2/);
    assert.doesNotMatch(ROUTE_SRC, /const EASE_MIN = [\d.]+;/);
});

// ── queue totals ───────────────────────────────────────────────────────────

test('dueQueueAll reports the true total while dueQueue caps the session', () => {
    const leaks = [];
    for (let i = 0; i < MAX_QUEUE + 5; i++) {
        leaks.push(makeLeak({
            id: `leak-${String(i).padStart(3, '0')}`,
            evLossBB: 0.1 + i / 100,
            lastDetected: at(-1),
        }));
    }
    const all = dueQueueAll([], leaks, T0);
    assert.equal(all.length, MAX_QUEUE + 5, 'the full queue must not be sliced');
    assert.equal(dueQueue([], leaks, T0).length, MAX_QUEUE);

    // Exactly MAX_QUEUE due must read as exactly MAX_QUEUE, never "10+".
    const exact = leaks.slice(0, MAX_QUEUE);
    assert.equal(dueQueueAll([], exact, T0).length, MAX_QUEUE);

    // Same ordering — the cap is a slice, not a different sort.
    assert.deepEqual(
        dueQueue([], leaks, T0).map(r => r.leakId),
        all.slice(0, MAX_QUEUE).map(r => r.leakId),
    );
});
