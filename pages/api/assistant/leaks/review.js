/**
 * GET  /api/assistant/leaks/review
 *   Returns the caller's spaced-repetition review records.
 *   Optional query: ?leakId=<id>  ?due=1 (only rows due now)  ?limit=<n>
 *
 * POST /api/assistant/leaks/review
 *   Records a drill outcome and persists the next review schedule.
 *   Body: { leakId, outcome: { correct, total, evDelta? } }
 *
 * The next state is computed SERVER-SIDE (src/lib/sandbox/leakReview) so a
 * client cannot post an arbitrary due date and hand itself an easy schedule.
 *
 * DEGRADATION CONTRACT — `leak_review_state` does not exist on first deploy:
 *   GET  -> 200 { success: true, records: [], persisted: false }
 *   POST -> 200 { success: true, persisted: false, state: <computed> }
 * A missing table must never 500 and must never block a drill from completing.
 */

import { getServerUserWithFallback } from '../../../../src/lib/serverAuth';
import { createClient } from '../../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../../src/lib/sentryWrap';
import * as leakReviewModule from '../../../../src/lib/sandbox/leakReview';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

const TABLE = 'leak_review_state';
const MAX_RECORDS = 200;
const DAY_MS = 86400000;

// Persisted shape version. Bumped by the scheduler module when its maths change;
// the local default is only a floor for rows written before it existed.
const FALLBACK_SCHEMA_VERSION = 1;

/**
 * Numeric constant from the shared scheduler module, with a literal floor for
 * the case where the module is unavailable or has renamed the export. Looked up
 * rather than destructured so a rename degrades instead of throwing.
 */
function moduleNumber(name, fallback) {
    try {
        const mod = leakReviewModule || {};
        const raw = mod[name] ?? (mod.default && mod.default[name]);
        const n = Number(raw);
        return Number.isFinite(n) ? n : fallback;
    } catch (e) {
        return fallback;
    }
}

// Ease / interval guard rails. The scheduler owns the curve; these only stop an
// out-of-range value (NaN, Infinity, a decade-long interval) reaching the DB.
// They are READ FROM THE SCHEDULER so there is exactly one set of bounds: a
// second, wider set here would let the fallback write an ease the client-side
// migrateRecord then silently re-clamps, and the stored value and the value the
// UI schedules from would disagree.
const EASE_MIN = moduleNumber('MIN_EASE', 1.3);
const EASE_MAX = moduleNumber('MAX_EASE', 2.8);
const EASE_DEFAULT = moduleNumber('DEFAULT_EASE', 2.3);
const HISTORY_MAX = Math.max(1, Math.floor(moduleNumber('HISTORY_LIMIT', 12)));
const INTERVAL_MAX_DAYS = 365;
const MAX_DRILL_QUESTIONS = 500;

// Leak ids come from two tables (uuid) plus demo/synthetic ids ("demo-1").
// Anything outside this shape is rejected before it reaches a query.
const LEAK_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_:.-]{0,63}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── schema-drift detection ───────────────────────────────────────────────────

/**
 * True when the failure means "this table/column was never migrated" rather
 * than "the write was rejected". 42P01 = undefined_table, 42703 =
 * undefined_column, PGRST20x = PostgREST could not find it in its schema cache.
 */
function isMissingSchema(error) {
    if (!error) return false;
    const code = error.code || '';
    if (code === '42P01' || code === '42703' || code === 'PGRST205' || code === 'PGRST204' || code === 'PGRST202') return true;
    const msg = String(error.message || '').toLowerCase();
    return msg.includes('does not exist') || msg.includes('schema cache');
}

// ─── scheduler binding ────────────────────────────────────────────────────────

/**
 * Resolve the scheduler from the shared module. The name is looked up rather
 * than destructured so a rename on that side degrades to the local fallback
 * instead of white-screening the endpoint with an undefined call.
 */
function resolveScheduler() {
    const mod = leakReviewModule || {};
    const candidates = [
        'computeNextReview', 'computeNextState', 'nextReviewState',
        'reviewNext', 'scheduleNext', 'gradeReview',
    ];
    for (const name of candidates) {
        if (typeof mod[name] === 'function') return mod[name];
    }
    if (mod.default && typeof mod.default === 'function') return mod.default;
    if (mod.default && typeof mod.default === 'object') {
        for (const name of candidates) {
            if (typeof mod.default[name] === 'function') return mod.default[name];
        }
    }
    return null;
}

function resolveSchemaVersion() {
    const mod = leakReviewModule || {};
    const raw = mod.LEAK_REVIEW_SCHEMA_VERSION ?? mod.SCHEMA_VERSION ?? (mod.default && mod.default.SCHEMA_VERSION);
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : FALLBACK_SCHEMA_VERSION;
}

/**
 * Last-resort SM-2-flavoured scheduler. Only runs if the shared module is
 * unavailable or exports nothing callable — the endpoint still has to answer.
 */
function fallbackComputeNextReview(prev, outcome, now) {
    const total = Math.max(1, Number(outcome?.total) || 1);
    const correct = Math.max(0, Math.min(total, Number(outcome?.correct) || 0));
    const accuracy = correct / total;
    const passed = accuracy >= 0.8;

    const prevEase = Number(prev?.ease);
    const prevInterval = Number(prev?.intervalDays);
    const prevReps = Number(prev?.reps);
    const prevLapses = Number(prev?.lapses);

    let ease = Number.isFinite(prevEase) ? prevEase : EASE_DEFAULT;
    let reps = Number.isFinite(prevReps) && prevReps > 0 ? Math.floor(prevReps) : 0;
    let lapses = Number.isFinite(prevLapses) && prevLapses > 0 ? Math.floor(prevLapses) : 0;
    let intervalDays;

    if (passed) {
        ease += accuracy >= 0.95 ? 0.1 : 0.02;
        reps += 1;
        if (reps <= 1) intervalDays = 1;
        else if (reps === 2) intervalDays = 3;
        else intervalDays = Math.round((Number.isFinite(prevInterval) && prevInterval > 0 ? prevInterval : 3) * ease);
    } else {
        ease -= accuracy >= 0.5 ? 0.15 : 0.3;
        lapses += 1;
        reps = 0;
        intervalDays = 1;
    }

    return { ease, intervalDays, reps, lapses, dueAt: new Date(now.getTime() + intervalDays * DAY_MS).toISOString() };
}

/**
 * Clamp whatever the scheduler returned into something the column types accept.
 * A NaN ease or a bogus dueAt is repaired here, never written.
 */
function normalizeState(candidate, prev, now) {
    const src = candidate && typeof candidate === 'object' ? candidate : {};

    const easeRaw = Number(src.ease ?? prev?.ease ?? EASE_DEFAULT);
    const ease = Number.isFinite(easeRaw)
        ? Math.round(Math.min(EASE_MAX, Math.max(EASE_MIN, easeRaw)) * 100) / 100
        : EASE_DEFAULT;

    const intervalRaw = Number(src.intervalDays ?? src.interval_days ?? 1);
    const intervalDays = Number.isFinite(intervalRaw)
        ? Math.min(INTERVAL_MAX_DAYS, Math.max(0, Math.round(intervalRaw)))
        : 1;

    const repsRaw = Number(src.reps ?? prev?.reps ?? 0);
    const reps = Number.isFinite(repsRaw) ? Math.min(100000, Math.max(0, Math.floor(repsRaw))) : 0;

    const lapsesRaw = Number(src.lapses ?? prev?.lapses ?? 0);
    const lapses = Number.isFinite(lapsesRaw) ? Math.min(100000, Math.max(0, Math.floor(lapsesRaw))) : 0;

    // ── mastery fields ────────────────────────────────────────────────────
    // These MUST survive the round-trip. Dropping them here is what made
    // retirement unreachable: strong_streak came back 0 every time, so a leak
    // the user had genuinely mastered was re-queued on every cap-length cycle.
    const streakRaw = Number(src.strongStreak ?? src.strong_streak ?? prev?.strongStreak ?? 0);
    const strongStreak = Number.isFinite(streakRaw) ? Math.min(100000, Math.max(0, Math.floor(streakRaw))) : 0;

    const retiredRaw = src.retired ?? src.is_retired ?? prev?.retired;
    const retired = retiredRaw === true;

    const scoreRaw = Number(src.lastScore ?? src.last_score);
    const lastScore = Number.isFinite(scoreRaw)
        ? Math.round(Math.min(1, Math.max(0, scoreRaw)) * 1000) / 1000
        : null;

    const historySrc = Array.isArray(src.history)
        ? src.history
        : (Array.isArray(prev?.history) ? prev.history : []);
    const history = historySrc
        .filter((h) => h && typeof h === 'object' && !Array.isArray(h))
        .slice(-HISTORY_MAX);

    let dueAt = null;
    const dueRaw = src.dueAt ?? src.due_at ?? null;
    if (dueRaw) {
        const parsed = new Date(dueRaw);
        if (!Number.isNaN(parsed.getTime())) {
            // Never accept a due date further out than the interval cap allows,
            // and never one in the past — both would be a free skip.
            const maxDue = now.getTime() + (INTERVAL_MAX_DAYS + 1) * DAY_MS;
            dueAt = new Date(Math.min(Math.max(parsed.getTime(), now.getTime()), maxDue)).toISOString();
        }
    }
    if (!dueAt) dueAt = new Date(now.getTime() + intervalDays * DAY_MS).toISOString();

    return {
        ease, intervalDays, reps, lapses, dueAt,
        strongStreak, retired, lastScore, history,
        schemaVersion: resolveSchemaVersion(),
    };
}

// ─── row <-> client shape ─────────────────────────────────────────────────────

function mapRow(row, nowMs) {
    if (!row || typeof row !== 'object') return null;
    const dueAt = row.due_at || null;
    const dueMs = dueAt ? new Date(dueAt).getTime() : NaN;

    const mapped = {
        leakId: row.leak_id,
        ease: row.ease === null || row.ease === undefined ? EASE_DEFAULT : Number(row.ease),
        intervalDays: Number(row.interval_days) || 0,
        dueAt,
        due: Number.isNaN(dueMs) ? true : dueMs <= nowMs,
        reps: Number(row.reps) || 0,
        lapses: Number(row.lapses) || 0,
        lastOutcome: row.last_outcome || null,
        schemaVersion: Number(row.schema_version) || FALLBACK_SCHEMA_VERSION,
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || null,
    };

    // ── mastery state ──────────────────────────────────────────────────────
    // Read back so the scheduler can actually accumulate a streak and retire a
    // leak instead of restarting from zero on every round-trip.
    //
    // Each key is emitted only when the COLUMN exists (PostgREST omits columns
    // the table does not have, so `undefined` means "not migrated yet"). An
    // absent key lets the client keep its own locally held value; a present key
    // — even 0 or false — is the account's answer and overrides it.
    if (row.strong_streak !== undefined) {
        mapped.strongStreak = Math.max(0, Math.floor(Number(row.strong_streak) || 0));
    }
    if (row.retired !== undefined) {
        mapped.retired = row.retired === true;
    }
    if (row.last_score !== undefined) {
        // Nullable: null means "no score recorded", never 0 (which would be a lie).
        const scoreRaw = Number(row.last_score);
        mapped.lastScore = row.last_score === null || !Number.isFinite(scoreRaw)
            ? null
            : Math.min(1, Math.max(0, scoreRaw));
    }
    if (row.history !== undefined) {
        mapped.history = Array.isArray(row.history) ? row.history.slice(-HISTORY_MAX) : [];
    }

    return mapped;
}

// ─── validation ───────────────────────────────────────────────────────────────

function readLeakId(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed || !LEAK_ID_RE.test(trimmed)) return null;
    return trimmed;
}

/**
 * Returns { ok, outcome } — outcome is the sanitised, storable version.
 *
 * `evLossBB` is the leak's CURRENT measured EV cost (from detection), sent by
 * the client so THIS endpoint can diff it against the measurement stored at
 * the previous review. A client-supplied `evDelta` is deliberately ignored:
 * the delta is computed server-side in handlePost, because a chosen delta is
 * a chosen ease nudge, and the whole point of computing schedules here is
 * that the client cannot hand itself an easier one.
 */
function readOutcome(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false };

    const totalNum = Number(raw.total);
    if (!Number.isFinite(totalNum) || totalNum < 1) return { ok: false };
    const total = Math.min(MAX_DRILL_QUESTIONS, Math.floor(totalNum));

    const correctNum = Number(raw.correct);
    if (!Number.isFinite(correctNum) || correctNum < 0) return { ok: false };
    const correct = Math.min(total, Math.floor(correctNum));

    const outcome = { correct, total, accuracy: Math.round((correct / total) * 1000) / 1000 };

    if (raw.evLossBB !== undefined && raw.evLossBB !== null) {
        const ev = Number(raw.evLossBB);
        // A measured per-spot EV cost is non-negative and small; the clamp is
        // a sanity ceiling, not a real bound anyone should hit.
        if (Number.isFinite(ev) && ev >= 0) outcome.evLossBB = Math.round(Math.min(1000, ev) * 100) / 100;
    }
    outcome.at = new Date().toISOString();
    return { ok: true, outcome };
}

// ─── ownership ────────────────────────────────────────────────────────────────

/**
 * Confirms the leak belongs to the caller before anything is written.
 * Returns { owned, checked } — checked:false means ownership is UNKNOWABLE
 * (neither leak table is deployed, or a query failed unexpectedly), so we
 * decline to persist rather than trusting the id — but we also decline to tell
 * the user their leak does not exist.
 *
 * A transient query error must NOT read as evidence of non-ownership: doing so
 * turned a momentary DB blip on user_leaks into a hard 404 for a real, owned
 * leak and threw the session away. An unexpected error therefore lands on the
 * ephemeral path (200, schedule kept client-side, retried later) instead.
 */
async function verifyLeakOwnership(supabase, userId, leakId) {
    const sources = [
        { table: 'user_leaks', idCol: 'id' },
        { table: 'user_training_leaks', idCol: 'id' },
    ];
    let anyTableExists = false;
    let hadError = false;

    for (const source of sources) {
        try {
            const { data, error } = await supabase
                .from(source.table)
                .select('id')
                .eq(source.idCol, leakId)
                .eq('user_id', userId)
                .maybeSingle();

            if (error) {
                if (isMissingSchema(error)) continue;      // table absent — try the next source
                if (error.code === '22P02') { anyTableExists = true; continue; } // id not a uuid here
                // Anything else (timeout, connection reset, permission blip) is
                // a failure to ANSWER the question, not a "no".
                console.warn(`[leaks/review] ${source.table} ownership check failed:`, error.message);
                hadError = true;
                continue;
            }
            anyTableExists = true;
            if (data) return { owned: true, checked: true };
        } catch (err) {
            console.warn(`[leaks/review] ${source.table} ownership check threw:`, err?.message || err);
            hadError = true;
        }
    }

    if (hadError) return { owned: false, checked: false };
    return { owned: false, checked: anyTableExists };
}

// ─── handler ──────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
    try {
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
            if (!applyRateLimit(req, res, LIMITS.write)) return;
        }
        if (req.method === 'GET') {
            if (!applyRateLimit(req, res, LIMITS.read || { max: 60, windowMs: 60000 })) return;
        }

        // userId comes from the Authorization header ONLY. A body/query userId
        // is never consulted (known IDOR class on this surface).
        let userId = null;
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
            if (authErr || !authUser) {
                return res.status(401).json({ success: false, error: 'Invalid or expired token' });
            }
            userId = authUser.id;
        }

        if (req.method === 'GET') return handleGet(req, res, userId);
        if (req.method === 'POST') return handlePost(req, res, userId);

        return res.status(405).json({ success: false, error: 'Method not allowed' });
    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn('[API Error]', err);
        if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

// ─── GET ──────────────────────────────────────────────────────────────────────

async function handleGet(req, res, userId) {
    // Signed-out callers get the same empty, non-persisting shape a missing
    // table produces — the review surface renders instead of erroring.
    if (!userId) {
        return res.status(200).json({ success: true, records: [], persisted: false, authenticated: false });
    }

    const nowMs = Date.now();
    const { leakId: rawLeakId, due, limit } = req.query || {};

    const limitNum = parseInt(limit, 10);
    const take = Math.min(MAX_RECORDS, Math.max(1, Number.isFinite(limitNum) ? limitNum : MAX_RECORDS));

    try {
        let query = getSupabase()
            .from(TABLE)
            .select('*')
            .eq('user_id', userId)
            .order('due_at', { ascending: true })
            .limit(take);

        if (rawLeakId !== undefined) {
            const leakId = readLeakId(Array.isArray(rawLeakId) ? rawLeakId[0] : rawLeakId);
            // A malformed id cannot name a real row — answer empty rather than
            // 400ing a read that is harmless either way.
            if (!leakId) return res.status(200).json({ success: true, records: [], persisted: true });
            query = query.eq('leak_id', leakId);
        }

        if (due === '1' || due === 'true') {
            query = query.lte('due_at', new Date(nowMs).toISOString());
        }

        const { data, error } = await query;

        if (error) {
            if (isMissingSchema(error)) {
                console.warn(`[leaks/review] ${TABLE} not deployed — serving empty review state`);
                return res.status(200).json({ success: true, records: [], persisted: false, tableMissing: true });
            }
            console.warn('[leaks/review] GET failed:', error.message);
            // Read failures degrade too: an empty list keeps the drill usable.
            return res.status(200).json({ success: true, records: [], persisted: false, partial: true });
        }

        const records = (data || []).map((row) => mapRow(row, nowMs)).filter(Boolean);
        return res.status(200).json({
            success: true,
            records,
            persisted: true,
            dueCount: records.filter((r) => r.due).length,
        });
    } catch (err) {
        console.warn('[leaks/review] GET threw:', err?.message || err);
        return res.status(200).json({ success: true, records: [], persisted: false });
    }
}

// ─── POST ─────────────────────────────────────────────────────────────────────

async function handlePost(req, res, userId) {
    if (!userId) {
        return res.status(401).json({ success: false, error: 'Authentication required or invalid token' });
    }

    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const leakId = readLeakId(body.leakId);
    if (!leakId) {
        return res.status(400).json({ success: false, error: 'leakId required' });
    }

    const { ok, outcome } = readOutcome(body.outcome);
    if (!ok) {
        return res.status(400).json({ success: false, error: 'outcome { correct, total } required' });
    }

    const supabase = getSupabase();
    const now = new Date();

    // 1. Existing state (best effort — no row, or no table, both mean "new").
    let prev = null;
    let tableAvailable = true;
    try {
        const { data, error } = await supabase
            .from(TABLE)
            .select('*')
            .eq('user_id', userId)
            .eq('leak_id', leakId)
            .maybeSingle();

        if (error) {
            if (isMissingSchema(error)) tableAvailable = false;
            else console.warn('[leaks/review] prior state read failed:', error.message);
        } else if (data) {
            prev = mapRow(data, now.getTime());
        }
    } catch (err) {
        console.warn('[leaks/review] prior state read threw:', err?.message || err);
    }

    // 1.5 evDelta — computed HERE, from two detection measurements: the EV
    // cost the client reports now vs the one stored at the previous review.
    // Negative means the leak is measurably costing less in real hands since
    // last time — corroboration that the drilling is working. When detection
    // has not re-run between reviews the two measurements are equal, the
    // delta is 0 and the ease nudge is a no-op, which is exactly right.
    // No baseline (first review, or older rows without evLossBB) -> no delta,
    // never a fabricated one.
    if (Number.isFinite(outcome.evLossBB)) {
        const prevEv = Number(prev?.lastOutcome?.evLossBB);
        if (Number.isFinite(prevEv)) {
            outcome.evDelta = Math.round((outcome.evLossBB - prevEv) * 100) / 100;
        }
    }

    // 2. Next state — computed here, never accepted from the client.
    const scheduler = resolveScheduler();
    let computed = null;
    if (scheduler) {
        try {
            // The clock is passed DIRECTLY (Date | epoch-ms | ISO string), never
            // wrapped in an options object: gradeReview() parses its third
            // argument as a date, and `{ now }` parses as null — which silently
            // nulled dueAt / lastReviewedAt / history[].at and left the due date
            // to normalizeState's fallback instead of the scheduler.
            computed = scheduler(prev, outcome, now);
        } catch (err) {
            console.warn('[leaks/review] scheduler threw, using fallback:', err?.message || err);
        }
    }
    if (!computed || typeof computed !== 'object') {
        computed = fallbackComputeNextReview(prev, outcome, now);
    }
    const state = normalizeState(computed, prev, now);
    // Echoed back so the client can cache the schedule locally even when the
    // write is a no-op.
    const responseState = { ...state, leakId, lastOutcome: outcome };

    if (!tableAvailable) {
        console.warn(`[leaks/review] ${TABLE} not deployed — returning computed state unpersisted`);
        return res.status(200).json({ success: true, persisted: false, tableMissing: true, state: responseState });
    }

    // 3. Ownership. Unknown or foreign leaks are computed but never written.
    const { owned, checked } = await verifyLeakOwnership(supabase, userId, leakId);
    if (!owned) {
        if (checked && UUID_RE.test(leakId)) {
            // A real-looking id that is not this user's — refuse outright. Same
            // answer as "no such leak" so the response cannot confirm the id.
            return res.status(404).json({ success: false, error: 'Leak not found' });
        }
        // Demo/synthetic ids, or leak tables absent: the drill still completes,
        // the schedule just lives client-side.
        return res.status(200).json({
            success: true,
            persisted: false,
            ephemeral: true,
            reason: checked ? 'leak_not_persisted' : 'ownership_unverified',
            state: responseState,
        });
    }

    // 4. Persist. user_id is forced from the JWT.
    // Split in two: the columns every deployed version of the table has, and
    // the mastery columns added by 20260805000000. If the migration has not run
    // yet the second write 42703s, so we retry with the base row rather than
    // losing the whole schedule — degrade to doing less, never to a 500.
    const baseRow = {
        user_id: userId,
        leak_id: leakId,
        ease: state.ease,
        interval_days: state.intervalDays,
        due_at: state.dueAt,
        reps: state.reps,
        lapses: state.lapses,
        last_outcome: outcome,
        schema_version: state.schemaVersion,
        updated_at: now.toISOString(),
    };
    const row = {
        ...baseRow,
        strong_streak: state.strongStreak,
        retired: state.retired,
        last_score: state.lastScore,
        history: state.history,
    };

    /** upsert with a select -> update-or-insert fallback for a missing unique index. */
    async function writeRow(candidate) {
        let { data, error } = await supabase
            .from(TABLE)
            .upsert(candidate, { onConflict: 'user_id,leak_id' })
            .select()
            .maybeSingle();

        if (error && !isMissingSchema(error)) {
            // Unique index absent (42P10 / no matching ON CONFLICT target):
            // fall back to select -> update-or-insert, still scoped to this user.
            const { data: existing, error: findErr } = await supabase
                .from(TABLE)
                .select('id')
                .eq('user_id', userId)
                .eq('leak_id', leakId)
                .maybeSingle();

            if (!findErr) {
                if (existing && existing.id) {
                    ({ data, error } = await supabase
                        .from(TABLE)
                        .update(candidate)
                        .eq('id', existing.id)
                        .eq('user_id', userId)
                        .select()
                        .maybeSingle());
                } else {
                    ({ data, error } = await supabase
                        .from(TABLE)
                        .insert({ ...candidate, created_at: now.toISOString() })
                        .select()
                        .maybeSingle());
                }
            }
        }
        return { data, error };
    }

    let masteryColumns = true;

    try {
        let { data, error } = await writeRow(row);

        if (error && isMissingSchema(error)) {
            // Could be the whole table, or just the mastery columns. Try the
            // base shape once: if that succeeds the table is there and only the
            // new columns are missing.
            const retry = await writeRow(baseRow);
            if (!retry.error) {
                console.warn(`[leaks/review] ${TABLE} missing mastery columns — persisted base schedule only`);
                masteryColumns = false;
                data = retry.data;
                error = null;
            }
        }

        if (error) {
            if (isMissingSchema(error)) {
                console.warn(`[leaks/review] ${TABLE} not deployed — returning computed state unpersisted`);
                return res.status(200).json({ success: true, persisted: false, tableMissing: true, state: responseState });
            }
            console.warn('[leaks/review] persist failed:', error.message);
            // The drill is already over; a write failure must not undo it.
            return res.status(200).json({ success: true, persisted: false, state: responseState });
        }

        // When the mastery columns are absent, mapRow simply omits them and the
        // client keeps its own copy — better than echoing a zeroed streak the
        // client would then adopt as truth.
        const record = mapRow(data, now.getTime());
        return res.status(200).json({
            success: true,
            persisted: true,
            partialColumns: !masteryColumns || undefined,
            state: record || responseState,
            record: record || responseState,
        });
    } catch (err) {
        console.warn('[leaks/review] persist threw:', err?.message || err);
        return res.status(200).json({ success: true, persisted: false, state: responseState });
    }
}
