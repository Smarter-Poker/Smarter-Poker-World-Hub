/**
 * LEAK REVIEW — spaced-repetition scheduling brain for leak drilling
 * ═══════════════════════════════════════════════════════════════════════════
 * PURE. DEPENDENCY-FREE. DETERMINISTIC.
 *
 *   • no React, no fetch, no storage, no `Date.now()` inside the maths —
 *     every function that needs "now" takes it as an explicit argument so the
 *     tests (and the server) can pin the clock.
 *   • no imports at all, so this file can be unit-tested by `node --test`
 *     without a bundler and reused from an API route later.
 *
 * WHY AN ADAPTED SM-2 AND NOT SM-2 ────────────────────────────────────────
 * A leak is not a flashcard:
 *
 *  1. A flashcard is "known" when you recall it. A leak is *re-detected from
 *     real play* — the Leak Finder re-runs over new hands and can tell you the
 *     leak is still bleeding even after a perfect drill. So drilling right once
 *     must NOT push the card weeks away: `MAX_INTERVAL_DAYS` caps every
 *     interval at ~3 weeks, because beyond that reality has moved on and
 *     detection has already re-scored the leak anyway.
 *  2. A leak has a *measurable price* (evLossBB × occurrenceCount). Two cards
 *     due on the same day are not equal: the expensive one goes first.
 *     Ordering therefore is overdue-first, then EV impact (see `dueQueue`).
 *  3. Drill sessions vary in length. A 2-spot session is weak evidence, so
 *     interval growth is weighted by session size (`sessionWeight`) — you
 *     cannot buy a 3-week interval with two lucky clicks.
 *  4. Failure is cheap to fix and expensive to ignore, so failure resets HARD
 *     (back to 1 day, reps zeroed) rather than SM-2's gentler decay.
 *
 * EVERY function here is hostile-input tolerant: a NaN interval, a null date,
 * a string where a number belongs, a record for a leak that has since vanished
 * — none of it throws, and nothing ever returns Infinity or NaN. Everything is
 * clamped. That is deliberate: this data round-trips through localStorage and
 * a Supabase JSON column, both of which can hand back garbage.
 */

// ═══════════════════════════════════════════════════════════════════════════
// SCHEMA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Bump this whenever the persisted record shape changes, and teach
 * `migrateRecord()` how to climb from the previous version.
 *
 *   v1 — the unversioned prototype shape (no `v` key) that used SM-2 field
 *        names: { interval, easiness, due | nextReview, repetitions }.
 *   v2 — current: explicit *Days / *At suffixes, strongStreak, retired,
 *        bounded history.
 */
export const SCHEMA_VERSION = 2;

// ── tuning constants (exported so the UI can explain itself honestly) ──────
export const MIN_EASE = 1.3;
export const MAX_EASE = 2.8;
export const DEFAULT_EASE = 2.3;

export const MIN_INTERVAL_DAYS = 1;
/** Hard ceiling: a leak is never scheduled beyond ~3 weeks out. See header. */
export const MAX_INTERVAL_DAYS = 21;
export const FIRST_INTERVAL_DAYS = 1;
export const SECOND_INTERVAL_DAYS = 3;

/** Consecutive *strong* sessions at the cap before a leak is provisionally retired. */
export const RETIRE_AFTER_STRONG = 4;

/** Never hand the UI a wall of work. Ten is a session, not a chore. */
export const MAX_QUEUE = 10;

/** Kept per record so a card carries its own evidence without unbounded growth. */
export const HISTORY_LIMIT = 12;

/** Score bands. Poker-tuned: 60% on a leak drill is "not fixed yet". */
export const BAND_STRONG = 0.85;
export const BAND_PASS = 0.6;
export const BAND_SHAKY = 0.4;

const DAY_MS = 86400000;
/** Beyond this the Date constructor produces Invalid Date. */
const MAX_TIME_MS = 8.64e15;

// ═══════════════════════════════════════════════════════════════════════════
// SMALL SAFE HELPERS — every one of these exists because a real record broke
// something. None of them throw.
// ═══════════════════════════════════════════════════════════════════════════

function num(value, fallback) {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function clamp(value, lo, hi) {
    const n = num(value, lo);
    if (n < lo) return lo;
    if (n > hi) return hi;
    return n;
}

function int(value, fallback, lo, hi) {
    const n = Math.trunc(num(value, fallback));
    return clamp(Number.isFinite(n) ? n : fallback, lo, hi);
}

/** Round to one decimal — keeps intervals stable across re-serialisation. */
function round1(value) {
    const n = num(value, 0);
    return Math.round(n * 10) / 10;
}

/** Accepts Date | epoch-ms | ISO string. Returns finite ms, or null. */
function toMs(value) {
    try {
        if (value === null || value === undefined) return null;
        if (value instanceof Date) {
            const t = value.getTime();
            return Number.isFinite(t) ? t : null;
        }
        if (typeof value === 'number') {
            return Number.isFinite(value) && Math.abs(value) <= MAX_TIME_MS ? value : null;
        }
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (!trimmed) return null;
            const t = Date.parse(trimmed);
            return Number.isFinite(t) ? t : null;
        }
        return null;
    } catch (e) {
        return null;
    }
}

/** ms -> ISO string, or null. Never throws on an out-of-range number. */
function toIso(ms) {
    try {
        if (!Number.isFinite(ms) || Math.abs(ms) > MAX_TIME_MS) return null;
        return new Date(ms).toISOString();
    } catch (e) {
        return null;
    }
}

/** UTC 'YYYY-MM-DD'. UTC keeps day arithmetic exact (no DST-sized days). */
function dayKey(ms) {
    const iso = toIso(ms);
    return iso ? iso.slice(0, 10) : null;
}

function str(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return '';
}

/** Stable string id for a leak, or '' when it has none we can key on. */
function leakKey(leak) {
    try {
        const raw = leak && (leak.id !== undefined && leak.id !== null) ? leak.id : null;
        if (raw === null) return '';
        if (typeof raw === 'string') return raw.trim();
        if (typeof raw === 'number') return Number.isFinite(raw) ? String(raw) : '';
        return '';
    } catch (e) {
        return '';
    }
}

function isPlainRecordish(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

// ═══════════════════════════════════════════════════════════════════════════
// LEAK -> DRILL
// The contract is set by QuickSpotDrill.jsx, which does
// `new URLSearchParams(customParams)` and hits
// GET /api/sandbox/custom-drill?street=&position=&limit=
//
//   street   — 'Any' | 'Preflop' | 'Flop' | 'Turn' | 'River'
//              (the route does `ilike 'value%'` on metadata->>street and skips
//              the filter entirely for 'Any', so case does not matter — but we
//              emit the same Title-case vocabulary CustomDrillBuilder uses.)
//   position — 'Any' | 'UTG' | 'MP' | 'CO' | 'BTN' | 'SB' | 'BB'
//              (matches sandbox.js POSITIONS / stored metadata->>hero_position;
//              'EP' and 'HJ' match nothing in the pool, so we never emit them.)
//   limit    — 1..20 (the route clamps to 20; QuickSpotDrill clamps again).
//
// Only these three keys are emitted. URLSearchParams stringifies undefined as
// the literal "undefined", which would filter the pool down to nothing — so no
// key is ever emitted with a non-string-safe value.
// ═══════════════════════════════════════════════════════════════════════════

export const DRILL_STREETS = ['Preflop', 'Flop', 'Turn', 'River'];
export const DRILL_POSITIONS = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];

const STREET_HINTS = [
    // Order matters: 'preflop' contains 'flop', so preflop is tested first.
    ['Preflop', /pre[\s_-]?flop|preflop|3[\s_-]?bet|three[\s_-]?bet|4[\s_-]?bet|four[\s_-]?bet|open[\s_-]?rais|limp|vpip|cold[\s_-]?call|steal|squeeze|blind[\s_-]?defen|rfi/i],
    ['River', /river/i],
    ['Turn', /turn|barrel|double[\s_-]?barrel/i],
    ['Flop', /flop|c[\s_-]?bet|cbet|continuation|check[\s_-]?rais|donk/i],
];

const POSITION_ALIASES = [
    ['UTG', /\bunder[\s_-]?the[\s_-]?gun\b/i],
    ['MP', /\bmiddle[\s_-]?position\b/i],
    ['CO', /\bcut[\s_-]?off\b|\bcutoff\b/i],
    ['BTN', /\bbutton\b|\bdealer\b/i],
    ['SB', /\bsmall[\s_-]?blind\b/i],
    ['BB', /\bbig[\s_-]?blind\b/i],
];

/**
 * Canonical street for a free-text hint ('flop', 'turn_barrel_too_rare',
 * 'MP vs C-Bet - Single Raised Pots'). Returns null when nothing matches —
 * callers must not invent a street.
 */
export function streetFromHint(hint) {
    const text = str(hint).trim();
    if (!text) return null;
    const lower = text.toLowerCase();
    for (const canonical of DRILL_STREETS) {
        if (lower === canonical.toLowerCase()) return canonical;
    }
    for (const [canonical, re] of STREET_HINTS) {
        try {
            if (re.test(text)) return canonical;
        } catch (e) {
            /* a regex cannot throw here, but never let one kill a drill */
        }
    }
    return null;
}

/**
 * Hero position from a situation class like 'MP vs C-Bet - Single Raised Pots'
 * or 'Cutoff vs Button - 3-Bet Pots'. The convention on this surface is
 * "HERO vs VILLAIN", so the EARLIEST match in the string wins.
 * Returns null (never a guess) when no known position is named. Positions that
 * exist in poker but not in the question pool's vocabulary (HJ, LJ, EP) are
 * deliberately unmapped — emitting them would filter the pool to zero rows.
 */
export function positionFromHint(hint) {
    const raw = str(hint);
    if (!raw.trim()) return null;

    // 'Losing 3.2 BB/100' names a UNIT, not the big blind seat. Strip rate
    // units before scanning or every EV sentence resolves to position BB.
    const text = raw.replace(/\bbb\s*\/\s*(?:100|hr|hour|h)\b/gi, ' ');

    let best = null;
    let bestIdx = Infinity;

    // Abbreviations, word-bounded so 'CO' does not match inside 'cold call'
    // and 'BB' does not match inside 'BB/100'.
    for (const pos of DRILL_POSITIONS) {
        const re = new RegExp(`(^|[^A-Za-z])${pos}([^A-Za-z]|$)`);
        const m = re.exec(text);
        if (m && m.index < bestIdx) {
            bestIdx = m.index;
            best = pos;
        }
    }

    for (const [pos, re] of POSITION_ALIASES) {
        const m = re.exec(text);
        if (m && m.index < bestIdx) {
            bestIdx = m.index;
            best = pos;
        }
    }

    return best;
}

/** evLossBB × occurrenceCount — the honest price of a leak, in big blinds. */
export function evImpact(leak) {
    if (!isPlainRecordish(leak)) return 0;
    const ev = Math.abs(clamp(num(leak.evLossBB, 0), -1000, 1000));
    const occ = clamp(num(leak.occurrenceCount, 0), 0, 1e6);
    const impact = ev * occ;
    return Number.isFinite(impact) ? round1(impact) : 0;
}

/**
 * How many spots to serve. A leak that has cost real money earns a longer set;
 * a marginal one gets a short check-up so the queue stays finishable.
 * Always inside the 1..20 the API and QuickSpotDrill both clamp to.
 */
export function drillLength(leak) {
    const impact = evImpact(leak);
    if (impact >= 20) return 20;
    if (impact >= 5) return 10;
    if (impact > 0) return 5;
    return 10; // unknown price -> the neutral default the rest of the app uses
}

/**
 * Build the `customParams` QuickSpotDrill expects from a leak.
 * Preference order for the street:
 *   1. leak.recommendedDrill  (an explicit coach instruction beats inference)
 *   2. leak.leakCategory      ('preflop' | 'flop' | 'turn' | 'river')
 *   3. leak.leakType          ('turn_barrel_too_rare', 'lack_of_river_bluffs')
 *   4. leak.situationClass    ('BB vs River Bet in Single Raised Pots')
 * Returns null when none of them names a street — a fabricated drill sends the
 * user to spots that have nothing to do with their leak, which is worse than
 * no button at all.
 */
export function leakToDrill(leak) {
    if (!isPlainRecordish(leak)) return null;

    let street = null;
    const sources = [leak.recommendedDrill, leak.leakCategory, leak.leakType, leak.situationClass];
    for (const source of sources) {
        street = streetFromHint(source);
        if (street) break;
    }
    if (!street) return null;

    const position = positionFromHint(leak.situationClass)
        || positionFromHint(leak.recommendedDrill)
        || 'Any';

    return {
        street,
        position,
        limit: clamp(drillLength(leak), 1, 20),
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// RECORDS
// ═══════════════════════════════════════════════════════════════════════════

function blankRecord(leakId, nowMs, leakType) {
    const at = toIso(nowMs);
    return {
        v: SCHEMA_VERSION,
        leakId: leakId || null,
        leakType: leakType || null,
        reps: 0,
        lapses: 0,
        ease: DEFAULT_EASE,
        intervalDays: 0,
        // A freshly detected leak is due NOW — the whole point of the feature
        // is that detection creates work today, not next week.
        dueAt: at,
        createdAt: at,
        lastReviewedAt: null,
        lastScore: null,
        strongStreak: 0,
        retired: false,
        history: [],
    };
}

function normaliseHistoryEntry(entry) {
    if (!isPlainRecordish(entry)) return null;
    const total = int(entry.total, 0, 0, 1000);
    return {
        at: toIso(toMs(entry.at)),
        correct: int(entry.correct, 0, 0, total),
        total,
        score: clamp(num(entry.score, 0), 0, 1),
        band: str(entry.band) || null,
        intervalDays: clamp(num(entry.intervalDays, 0), 0, MAX_INTERVAL_DAYS),
        evDelta: Number.isFinite(num(entry.evDelta, NaN)) ? round1(num(entry.evDelta, 0)) : null,
    };
}

/**
 * Coerce ANY persisted blob into a valid current-version record.
 * Returns null only for things that are not records at all (null, arrays,
 * strings, numbers) — everything else is repaired rather than rejected, so a
 * single corrupt field can never make a user's whole queue disappear.
 */
export function migrateRecord(raw) {
    try {
        if (!isPlainRecordish(raw)) return null;

        // v1 (unversioned prototype) used SM-2 field names. Read both spellings.
        const leakIdRaw = raw.leakId !== undefined ? raw.leakId
            : (raw.leak_id !== undefined ? raw.leak_id : raw.id);
        const leakId = str(leakIdRaw).trim() || null;

        const intervalRaw = raw.intervalDays !== undefined ? raw.intervalDays : raw.interval;
        const easeRaw = raw.ease !== undefined ? raw.ease
            : (raw.easiness !== undefined ? raw.easiness : raw.easeFactor);
        const dueRaw = raw.dueAt !== undefined ? raw.dueAt
            : (raw.due !== undefined ? raw.due
                : (raw.nextReview !== undefined ? raw.nextReview : raw.next_review_at));
        const repsRaw = raw.reps !== undefined ? raw.reps
            : (raw.repetitions !== undefined ? raw.repetitions : raw.successes);
        const lastRaw = raw.lastReviewedAt !== undefined ? raw.lastReviewedAt
            : (raw.lastReview !== undefined ? raw.lastReview : raw.reviewedAt);
        const retiredRaw = raw.retired !== undefined ? raw.retired : raw.mastered;

        const history = Array.isArray(raw.history)
            ? raw.history.map(normaliseHistoryEntry).filter(Boolean).slice(-HISTORY_LIMIT)
            : [];

        const lastScore = Number.isFinite(num(raw.lastScore, NaN))
            ? clamp(num(raw.lastScore, 0), 0, 1)
            : null;

        return {
            v: SCHEMA_VERSION,
            leakId,
            leakType: str(raw.leakType).trim() || null,
            reps: int(repsRaw, 0, 0, 10000),
            lapses: int(raw.lapses !== undefined ? raw.lapses : raw.failures, 0, 0, 10000),
            ease: clamp(num(easeRaw, DEFAULT_EASE), MIN_EASE, MAX_EASE),
            intervalDays: round1(clamp(num(intervalRaw, 0), 0, MAX_INTERVAL_DAYS)),
            dueAt: toIso(toMs(dueRaw)),
            createdAt: toIso(toMs(raw.createdAt)),
            lastReviewedAt: toIso(toMs(lastRaw)),
            lastScore,
            strongStreak: int(raw.strongStreak, 0, 0, 10000),
            retired: retiredRaw === true,
            history,
        };
    } catch (e) {
        // Hostile object (throwing getter, exotic proxy) — drop it rather than
        // taking the caller down with it.
        return null;
    }
}

/** Always returns a usable record; used internally where null is not an option. */
function ensureRecord(raw, nowMs) {
    const migrated = migrateRecord(raw);
    if (migrated) return migrated;
    return blankRecord(null, nowMs, null);
}

/**
 * A fresh review record for a newly detected leak.
 * `now` may be a Date, epoch-ms or ISO string. An unusable `now` degrades to
 * "due immediately" (dueAt null) rather than throwing.
 * Returns null when the leak has no id to key the record by.
 */
export function initialReview(leak, now) {
    if (!isPlainRecordish(leak)) return null;
    const id = leakKey(leak);
    if (!id) return null;
    const nowMs = toMs(now);
    const record = blankRecord(id, nowMs === null ? NaN : nowMs, str(leak.leakType).trim() || null);
    return record;
}

// ═══════════════════════════════════════════════════════════════════════════
// GRADING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Session size weighting. A 2-spot session is weak evidence about a leak that
 * showed up in 47 real hands, so it moves the interval less than a 10-spot one.
 * Range 0.4 .. 1.0.
 */
function sessionWeight(total) {
    return clamp(total / 10, 0.4, 1);
}

function bandFor(score) {
    if (score >= BAND_STRONG) return 'strong';
    if (score >= BAND_PASS) return 'pass';
    if (score >= BAND_SHAKY) return 'shaky';
    return 'fail';
}

const EASE_DELTA = {
    strong: 0.1,
    pass: 0,
    shaky: -0.15,
    fail: -0.25,
};

/**
 * @param {number} prevInterval  days, already clamped
 * @param {number} reps          successful reps BEFORE this session
 * @param {number} ease
 * @param {string} band
 * @param {number} weight        sessionWeight()
 */
function nextInterval(prevInterval, reps, ease, band, weight) {
    if (band === 'fail') {
        // HARD reset. Not SM-2's soft decay: a leak you just failed is bleeding
        // EV in real games tomorrow, so it comes back tomorrow.
        return FIRST_INTERVAL_DAYS;
    }
    if (band === 'shaky') {
        // Half the interval, floor at one day — partial credit is not progress.
        return Math.max(MIN_INTERVAL_DAYS, prevInterval / 2);
    }
    if (reps <= 0) return FIRST_INTERVAL_DAYS;
    if (reps === 1) return SECOND_INTERVAL_DAYS;

    // 'pass' grows on a damped ease — 60-84% means "not fixed, just not awful".
    const effectiveEase = band === 'strong' ? ease : 1 + (ease - 1) * 0.6;
    const growth = 1 + (effectiveEase - 1) * weight;
    return Math.max(prevInterval, MIN_INTERVAL_DAYS) * growth;
}

/**
 * Grade a drill session against a review record and return the NEXT record.
 * The input record is never mutated.
 *
 * @param {object} record  previous record (any schema version, or junk)
 * @param {object} outcome { correct, total, evDelta? }
 *        evDelta is the change in this leak's measured EV cost (bb) since the
 *        last review: NEGATIVE means the leak is costing less, i.e. real play
 *        agrees the drilling worked. It nudges ease within a tight bound — it
 *        is corroborating evidence, never the primary signal (a single session
 *        of hands is far too noisy to drive the schedule on its own).
 * @param {Date|number|string} now
 */
export function gradeReview(record, outcome, now) {
    const nowMs = toMs(now);
    const prev = ensureRecord(record, nowMs === null ? NaN : nowMs);

    const total = int(outcome && outcome.total, 0, 0, 1000);
    const correct = int(outcome && outcome.correct, 0, 0, total);

    // An abandoned or empty session is not evidence. Return the normalised
    // record untouched so a stray call can never wipe someone's schedule.
    if (total <= 0) return prev;

    const score = clamp(correct / total, 0, 1);
    const band = bandFor(score);
    const weight = sessionWeight(total);

    // ── ease ──────────────────────────────────────────────────────────────
    const evDeltaRaw = outcome ? num(outcome.evDelta, NaN) : NaN;
    const hasEvDelta = Number.isFinite(evDeltaRaw);
    const evNudge = hasEvDelta ? clamp(-clamp(evDeltaRaw, -100, 100) * 0.1, -0.15, 0.15) : 0;
    const ease = clamp(prev.ease + (EASE_DELTA[band] || 0) + evNudge, MIN_EASE, MAX_EASE);

    // ── reps / lapses / streak ────────────────────────────────────────────
    let reps = prev.reps;
    let lapses = prev.lapses;
    let strongStreak = prev.strongStreak;

    if (band === 'fail') {
        reps = 0;
        lapses = clamp(prev.lapses + 1, 0, 10000);
        strongStreak = 0;
    } else if (band === 'shaky') {
        // Hold position: no progress, no extra lapse.
        strongStreak = 0;
    } else {
        reps = clamp(prev.reps + 1, 0, 10000);
        strongStreak = band === 'strong' ? clamp(prev.strongStreak + 1, 0, 10000) : 0;
    }

    // ── interval ──────────────────────────────────────────────────────────
    const raw = nextInterval(prev.intervalDays, prev.reps, ease, band, weight);
    const intervalDays = round1(clamp(raw, MIN_INTERVAL_DAYS, MAX_INTERVAL_DAYS));

    const dueMs = nowMs === null ? null : nowMs + intervalDays * DAY_MS;

    // ── retirement ────────────────────────────────────────────────────────
    // Provisional only: RETIRE_AFTER_STRONG strong sessions in a row AND the
    // interval already at the cap. `dueQueue` un-retires a leak the moment
    // detection sees it again in real hands — reality outranks the scheduler.
    const retired = strongStreak >= RETIRE_AFTER_STRONG && intervalDays >= MAX_INTERVAL_DAYS;

    const entry = normaliseHistoryEntry({
        at: toIso(nowMs === null ? NaN : nowMs),
        correct,
        total,
        score,
        band,
        intervalDays,
        evDelta: hasEvDelta ? evDeltaRaw : null,
    });

    return {
        v: SCHEMA_VERSION,
        leakId: prev.leakId,
        leakType: prev.leakType,
        reps,
        lapses,
        // 3dp keeps ease stable across JSON round-trips without drifting.
        ease: Math.round(ease * 1000) / 1000,
        intervalDays,
        dueAt: toIso(dueMs === null ? NaN : dueMs),
        createdAt: prev.createdAt,
        lastReviewedAt: toIso(nowMs === null ? NaN : nowMs),
        lastScore: score,
        strongStreak,
        retired,
        history: entry ? [...prev.history, entry].slice(-HISTORY_LIMIT) : prev.history,
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// DUE / QUEUE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A retired card is not due. A card with an UNREADABLE due date IS due —
 * surfacing it lets the next grade repair it, whereas hiding it strands the
 * leak forever. An unreadable `now` returns false (we cannot honestly claim
 * anything is due without a clock).
 */
export function isDue(record, now) {
    const rec = migrateRecord(record);
    if (!rec || rec.retired) return false;
    const nowMs = toMs(now);
    if (nowMs === null) return false;
    const dueMs = toMs(rec.dueAt);
    if (dueMs === null) return true;
    return dueMs <= nowMs;
}

function toRecordArray(records) {
    if (Array.isArray(records)) return records;
    // Tolerate the { [leakId]: record } map shape a localStorage blob may hold.
    if (isPlainRecordish(records)) {
        try {
            return Object.keys(records).map(k => {
                const value = records[k];
                if (isPlainRecordish(value) && !value.leakId && !value.leak_id) {
                    return { ...value, leakId: k };
                }
                return value;
            });
        } catch (e) {
            return [];
        }
    }
    return [];
}

/** Leaks the user has already closed out are not review material. */
function isReviewableLeak(leak) {
    if (!isPlainRecordish(leak)) return false;
    if (!leakKey(leak)) return false;
    const status = str(leak.status).trim().toLowerCase();
    return status !== 'resolved';
}

/**
 * The ordered work queue.
 *
 * ORDERING (documented because it is a product decision, not a detail):
 *   1. OVERDUE FIRST, bucketed to whole days. Something you were meant to drill
 *      five days ago outranks today's work. Bucketing to whole days — rather
 *      than raw milliseconds — is what makes rule 2 matter: without it, an
 *      arbitrary one-second difference in due timestamps would decide every
 *      comparison and EV would never break a tie.
 *   2. Then EV IMPACT (evLossBB × occurrenceCount) descending, so the leak that
 *      is costing the user the most money is the one they see first.
 *   3. Then leak id ascending — purely so the output is deterministic.
 *
 * Also, deliberately:
 *   • a leak with NO record yet is included and treated as due today, so the
 *     day the Leak Finder detects something the user has work waiting;
 *   • a record whose leak has vanished (deleted, filtered out, never loaded) is
 *     silently dropped — we iterate leaks, not records;
 *   • a RETIRED card whose leak has been re-detected since the last review is
 *     revived (`revived: true`), because detection re-running over real hands
 *     is stronger evidence than the scheduler's optimism.
 *
 * @returns {Array<{leakId, leak, record, drill, isNew, revived, overdueDays, evImpact, dueAt}>}
 */
export function dueQueueAll(records, leaks, now) {
    const nowMs = toMs(now);
    if (nowMs === null) return [];
    if (!Array.isArray(leaks)) return [];

    const byId = new Map();
    for (const raw of toRecordArray(records)) {
        const rec = migrateRecord(raw);
        if (rec && rec.leakId) byId.set(rec.leakId, rec);
    }

    const rows = [];
    for (const leak of leaks) {
        if (!isReviewableLeak(leak)) continue;
        const id = leakKey(leak);
        const existing = byId.get(id) || null;

        const lastDetectedMs = toMs(leak.lastDetected);
        const lastReviewedMs = existing ? toMs(existing.lastReviewedAt) : null;
        const reDetected = lastDetectedMs !== null
            && (lastReviewedMs === null || lastDetectedMs > lastReviewedMs);

        let revived = false;
        if (existing && existing.retired) {
            if (!reDetected) continue;      // stays retired
            revived = true;                 // reality says otherwise
        }

        const record = existing || initialReview(leak, nowMs);
        if (!record) continue;

        if (existing && !revived && !isDue(existing, nowMs)) continue;

        const dueMs = toMs(record.dueAt);
        const overdueDays = dueMs === null ? 0 : Math.max(0, (nowMs - dueMs) / DAY_MS);

        rows.push({
            leakId: id,
            leak,
            record,
            drill: leakToDrill(leak),
            isNew: !existing,
            revived,
            overdueDays: round1(overdueDays),
            overdueBucket: Math.floor(overdueDays),
            evImpact: evImpact(leak),
            dueAt: record.dueAt,
        });
    }

    rows.sort((a, b) => {
        if (b.overdueBucket !== a.overdueBucket) return b.overdueBucket - a.overdueBucket;
        if (b.evImpact !== a.evImpact) return b.evImpact - a.evImpact;
        return a.leakId < b.leakId ? -1 : (a.leakId > b.leakId ? 1 : 0);
    });

    return rows;
}

/**
 * The same queue, capped at MAX_QUEUE — the shape every UI renders.
 *
 * Callers that need to say how much work exists in total (rather than how much
 * fits in one session) should read `dueQueueAll(...).length` instead of
 * inferring "10+" from a list that was sliced to exactly 10.
 */
export function dueQueue(records, leaks, now) {
    return dueQueueAll(records, leaks, now).slice(0, MAX_QUEUE);
}

// ═══════════════════════════════════════════════════════════════════════════
// STATS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Header numbers for the review UI.
 *
 *   dueCount    — non-retired records due at `now` (records only; brand-new
 *                 leaks with no record are counted by `dueQueue`, which is the
 *                 surface that knows about leaks).
 *   nextDueAt   — earliest strictly-FUTURE due date, so an empty queue can say
 *                 "next review Thursday". null when nothing is scheduled ahead.
 *   streak      — consecutive UTC days with at least one graded review, counted
 *                 back from today. Reviewing yesterday but not yet today keeps
 *                 the streak alive (it only breaks once a whole day is missed),
 *                 which is the behaviour every streak product uses.
 *   retiredCount — leaks that have gone quiet.
 */
export function reviewStats(records, now) {
    const nowMs = toMs(now);
    const list = toRecordArray(records).map(migrateRecord).filter(Boolean);

    let dueCount = 0;
    let retiredCount = 0;
    let activeCount = 0;
    let nextDueMs = null;
    const reviewDays = new Set();

    for (const rec of list) {
        if (rec.retired) {
            retiredCount++;
        } else {
            activeCount++;
            if (nowMs !== null) {
                if (isDue(rec, nowMs)) {
                    dueCount++;
                } else {
                    const dueMs = toMs(rec.dueAt);
                    if (dueMs !== null && dueMs > nowMs && (nextDueMs === null || dueMs < nextDueMs)) {
                        nextDueMs = dueMs;
                    }
                }
            }
        }
        const key = dayKey(toMs(rec.lastReviewedAt));
        if (key) reviewDays.add(key);
    }

    let streak = 0;
    if (nowMs !== null && reviewDays.size > 0) {
        let cursor = nowMs;
        if (!reviewDays.has(dayKey(cursor))) cursor -= DAY_MS; // yesterday grace
        // Bounded loop: a decade of streak is already absurd, and this can
        // never spin on a corrupt date because the Set is finite.
        while (streak < 3650 && reviewDays.has(dayKey(cursor))) {
            streak++;
            cursor -= DAY_MS;
        }
    }

    return {
        dueCount,
        nextDueAt: toIso(nextDueMs === null ? NaN : nextDueMs),
        streak,
        retiredCount,
        activeCount,
        totalCount: list.length,
    };
}
