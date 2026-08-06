/**
 * QUICK-SPOT DRILL — rapid-fire GTO quiz
 * ═══════════════════════════════════════════════════════════════════════════
 * 15-second scenarios drawn from the training_questions pool.
 *
 * Rebuilt for mobile (PA_DESIGN_SPEC v1):
 *   • bottom sheet, single column of 48px answers in the thumb zone
 *   • wall-clock deadline that PAUSES when the tab/app is backgrounded
 *   • unanswerable rows (correct answer missing from the options) are repaired
 *     or dropped instead of guaranteeing a wrong answer in the coach table
 *   • drill rows persist evDelta:null — quiz noise is not real EV loss
 *   • distinct loading / error+retry / empty states, and a miss recap + level
 *     ladder on the finished screen
 *
 * SPACED REPETITION (optional) ─────────────────────────────────────────────
 * When mounted with `reviewLeakId`, the run is a scheduled review of ONE leak:
 * the final score is posted to /api/assistant/leaks/review, and the resulting
 * next-review interval is shown on the finished screen so the loop is visible.
 * Without that prop this component behaves EXACTLY as it always has — no extra
 * request, no extra UI.
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Zap, Check, X, Flame, RotateCcw, AlertTriangle, CalendarDays } from 'lucide-react';
import { getAccessToken } from '../../lib/authUtils';
import { gradeReview, migrateRecord, SCHEMA_VERSION as REVIEW_SCHEMA_VERSION } from '../../lib/sandbox/leakReview';
import { T, F, S, R, btn, pill, numeric } from './paTokens';
import {
    BottomSheet, PAStyles, Skeleton, EmptyState, ErrorState,
    safeStorage, usePrefersReducedMotion,
} from './paKit';

const DEFAULT_OPTIONS = ['Fold', 'Call', 'Raise', 'Check'];
const DISTRACTORS = ['Fold', 'Check', 'Call', 'Bet', 'Raise', 'All-In'];
const DURATION = 15;
const LEVEL_KEY = 'sandbox-drill-level';

// ═══════════════════════════════════════════════════════════════════════════
// LOCAL REVIEW SCHEDULE (fallback store)
// ═══════════════════════════════════════════════════════════════════════════
// The `leak_review_state` table may not be migrated yet, and the user may be
// offline or signed out. In every one of those cases the API answers
// persisted:false (or does not answer at all) and the schedule is kept here so
// the feature still works. leaks.js reads this same key and merges it with the
// server records, SERVER WINNING on conflict.
//
// The key is versioned with the record schema: a schema bump starts a clean
// store instead of feeding stale shapes to the scheduler.
const REVIEW_STORE_KEY = `pa-leak-review-v${REVIEW_SCHEMA_VERSION}`;
const REVIEW_STORE_LIMIT = 200;

function parseTime(value) {
    if (typeof value !== 'string' || !value.trim()) return 0;
    const t = Date.parse(value);
    return Number.isFinite(t) ? t : 0;
}

/** Always returns a plain object map { [leakId]: record }; never throws. */
function readReviewStore() {
    try {
        const raw = safeStorage.get(REVIEW_STORE_KEY, null);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        const records = (parsed.records && typeof parsed.records === 'object' && !Array.isArray(parsed.records))
            ? parsed.records
            : parsed;
        return (records && typeof records === 'object' && !Array.isArray(records)) ? records : {};
    } catch (e) {
        console.warn('[QuickSpotDrill] review store unreadable:', e?.message || e);
        return {};
    }
}

/**
 * Copy of `obj` with undefined/null values removed, so spreading it over a
 * local record cannot blank a field the source simply did not mention.
 * (`{ ...a, ...{ x: undefined } }` sets x to undefined — silently losing a.x.)
 */
function definedOnly(obj) {
    const out = {};
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
    try {
        for (const key of Object.keys(obj)) {
            const value = obj[key];
            if (value !== undefined && value !== null) out[key] = value;
        }
    } catch (e) {
        return out;
    }
    return out;
}

function readReviewRecord(leakId) {
    if (!leakId) return null;
    const store = readReviewStore();
    const raw = store[String(leakId)];
    return raw ? migrateRecord(raw) : null;
}

/** Best effort — a blocked/full localStorage must never break a finished drill. */
function writeReviewRecord(leakId, record) {
    if (!leakId || !record || typeof record !== 'object') return false;
    try {
        const store = readReviewStore();
        store[String(leakId)] = record;
        const keys = Object.keys(store);
        if (keys.length > REVIEW_STORE_LIMIT) {
            // Evict the least recently reviewed rows first.
            keys.sort((a, b) => parseTime(store[a]?.lastReviewedAt) - parseTime(store[b]?.lastReviewedAt));
            for (const k of keys.slice(0, keys.length - REVIEW_STORE_LIMIT)) delete store[k];
        }
        return safeStorage.set(REVIEW_STORE_KEY, JSON.stringify({ v: REVIEW_SCHEMA_VERSION, records: store }));
    } catch (e) {
        console.warn('[QuickSpotDrill] review store write failed:', e?.message || e);
        return false;
    }
}

/** "Next review in 3 days" — the whole point of the loop, in one line. */
function intervalLabel(days) {
    const n = Number(days);
    if (!Number.isFinite(n) || n <= 0) return 'Next review: today';
    const rounded = Math.max(1, Math.round(n));
    return `Next review in ${rounded} day${rounded === 1 ? '' : 's'}`;
}

/** Promotion / demotion thresholds, surfaced to the user as a ladder. */
function promotionTarget(level) {
    if (level === 1) return 60;
    if (level === 2) return 65;
    return 70;
}

function pctTone(pct) {
    if (pct >= 70) return T.success;
    if (pct >= 50) return T.warn;
    return T.danger;
}

function shuffle(list) {
    const arr = [...list];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

/**
 * Normalises a row from either shape the drill APIs can return:
 *  - the mapped pool shape { scenario_text, hero_hand, hero_position, options, ... }
 *  - a raw training_questions row { context, question_type, metadata, correct_answer }
 */
function mapDrillRow(row) {
    if (!row) return null;
    const meta = (row.metadata && typeof row.metadata === 'object') ? row.metadata : {};
    const rawOptions = Array.isArray(row.options) && row.options.length
        ? row.options
        : (Array.isArray(meta.options) && meta.options.length ? meta.options : DEFAULT_OPTIONS);

    return {
        id: row.id ?? null,
        scenario_text: row.scenario_text || row.context || row.question || meta.scenario_text || 'What is the GTO play here?',
        hero_hand: row.hero_hand || meta.hero_hand || null,
        hero_position: row.hero_position || meta.hero_position || null,
        street: (row.street || meta.street || 'preflop'),
        options: rawOptions.map(o => String(o).trim()).filter(Boolean),
        correct_answer: row.correct_answer ?? meta.correct_answer ?? null,
        gto_explanation: row.gto_explanation || meta.gto_explanation || meta.explanation || row.explanation || null,
    };
}

/**
 * A question whose correct answer is not among its options is unanswerable —
 * the user is guaranteed to be marked wrong and that row poisons accuracy
 * stats, the leaderboard and the leak detector. Repair it by splicing the
 * answer in (padding to four plausible choices) rather than shipping it broken.
 */
function ensureAnswerable(q) {
    if (!q || q.correct_answer == null || String(q.correct_answer).trim() === '') return null;
    const correct = String(q.correct_answer).trim();
    const options = (q.options || []).map(o => String(o).trim()).filter(Boolean);
    const match = options.find(o => o.toLowerCase() === correct.toLowerCase());

    if (match) return { ...q, options, correct_answer: match };

    const repaired = [correct, ...options.filter(o => o.toLowerCase() !== correct.toLowerCase())];
    for (const d of DISTRACTORS) {
        if (repaired.length >= 4) break;
        if (!repaired.some(o => o.toLowerCase() === d.toLowerCase())) repaired.push(d);
    }
    return { ...q, options: shuffle(repaired.slice(0, 4)), correct_answer: correct };
}

export default function QuickSpotDrill({ onClose, customParams, reviewLeakId = null, reviewEvLossBB = null }) {
    const reduce = usePrefersReducedMotion();

    const [questions, setQuestions] = useState([]);
    const [currentIdx, setCurrentIdx] = useState(0);
    const [answer, setAnswer] = useState(null);
    const [revealed, setRevealed] = useState(false);
    const [score, setScore] = useState({ correct: 0, total: 0 });
    const [misses, setMisses] = useState([]);
    const [streak, setStreak] = useState(0);
    const [timer, setTimer] = useState(DURATION);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [finished, setFinished] = useState(false);
    const [confirmQuit, setConfirmQuit] = useState(false);
    const [announcement, setAnnouncement] = useState('');
    const [level, setLevel] = useState(1);
    const [levelChange, setLevelChange] = useState(null); // 'up' | 'down' | null
    const [ignoreFilters, setIgnoreFilters] = useState(false);
    // null when this is not a review run. Otherwise:
    // { status: 'saving' | 'done' | 'skipped' | 'error', intervalDays, persisted }
    const [review, setReview] = useState(null);

    const deadlineRef = useRef(DURATION * 1000);
    const remainingRef = useRef(DURATION);
    const pausedRef = useRef(false);
    const currentIdxRef = useRef(0);
    const questionsRef = useRef([]);
    const abortRef = useRef(null);
    const lastOutcomeRef = useRef(null);

    useEffect(() => { currentIdxRef.current = currentIdx; }, [currentIdx]);
    useEffect(() => { questionsRef.current = questions; }, [questions]);
    useEffect(() => () => { try { abortRef.current?.abort(); } catch (e) { /* noop */ } }, []);

    const activeParams = ignoreFilters ? null : customParams;

    // ── load ──────────────────────────────────────────────────────────────
    const load = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const savedLevel = parseInt(safeStorage.get(LEVEL_KEY, '1'), 10);
            const startLevel = Number.isFinite(savedLevel) && savedLevel > 0 ? savedLevel : 1;
            setLevel(startLevel);

            let fetchUrl = '/api/training/hand-of-the-day';
            if (activeParams) {
                const query = new URLSearchParams(activeParams).toString();
                fetchUrl = `/api/sandbox/custom-drill?${query}`;
            } else if (startLevel > 1) {
                fetchUrl = `/api/training/hand-of-the-day?level=${startLevel}`;
            }

            try { abortRef.current?.abort(); } catch (e) { /* noop */ }
            const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
            abortRef.current = ctrl;

            const res = await fetch(fetchUrl, ctrl ? { signal: ctrl.signal } : undefined);
            const json = await res.json().catch(() => null);
            if (!res.ok || json?.success === false) throw new Error(`Drill request failed (${res.status})`);

            // custom-drill responds under `pool`; the raw training route uses
            // `questions`. Accept either, plus the single-question shape.
            const rawPool = (Array.isArray(json?.pool) && json.pool.length)
                ? json.pool
                : (Array.isArray(json?.questions) && json.questions.length
                    ? json.questions
                    : (json?.question ? [json.question] : []));

            const mapped = rawPool.map(mapDrillRow).map(ensureAnswerable).filter(Boolean);
            const cap = Math.max(1, Math.min(Number(activeParams?.limit) || 10, 20));
            setQuestions(shuffle(mapped).slice(0, cap));
            setCurrentIdx(0);
            setAnswer(null);
            setRevealed(false);
            setFinished(false);
            setScore({ correct: 0, total: 0 });
            setMisses([]);
            setStreak(0);
            setReview(null);
            lastOutcomeRef.current = null;
        } catch (e) {
            if (e?.name === 'AbortError') return;
            console.warn('[QuickSpotDrill] Load error:', e?.message || e);
            setLoadError('Could not load drills. Check your connection and try again.');
            setQuestions([]);
        } finally {
            setLoading(false);
        }
    }, [activeParams]);

    useEffect(() => { load(); }, [load]);

    // ── persistence ───────────────────────────────────────────────────────
    const persistResult = useCallback(async (q, pick, isCorrect) => {
        const payload = {
            hand: q?.hero_hand || 'drill',
            position: q?.hero_position || null,
            street: (q?.street || 'preflop'),
            userPick: pick || 'timeout',
            gtoAction: q?.correct_answer || null,
            isCorrect: !!isCorrect,
            // Quiz answers carry no solver EV. Sending a fabricated -0.1 made
            // "Lost EV" in the analytics surfaces a lie.
            evDelta: null,
            source: 'quick-drill',
        };
        try {
            const token = getAccessToken();
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers.Authorization = `Bearer ${token}`;
            await fetch('/api/sandbox/coach-result', {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
            });
        } catch (e) {
            console.warn('[QuickSpotDrill] Save error:', e?.message || e);
        } finally {
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('sandbox-coach-result-saved', {
                    detail: { isCorrect: !!isCorrect, evDelta: null, source: 'quick-drill' },
                }));
            }
        }
    }, []);

    // ── spaced-repetition outcome (review runs only) ──────────────────────
    /**
     * Posts { leakId, outcome } and shows the resulting interval.
     *
     * The schedule is computed SERVER-SIDE and echoed back even when it could
     * not be stored (table not migrated, demo leak, signed out) — in that case
     * `persisted:false` comes back and we keep the record locally instead.
     * If the request fails outright we grade locally so the drill still ends
     * with a real, honest next-review date rather than a dead end.
     */
    const submitReview = useCallback(async (correct, total) => {
        if (!reviewLeakId || !(total > 0)) return;
        lastOutcomeRef.current = { correct, total };
        setReview({ status: 'saving', intervalDays: null, persisted: false });

        let serverState = null;
        let persisted = false;
        let reached = false;

        try {
            const token = getAccessToken();
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers.Authorization = `Bearer ${token}`;
            // The leak's current measured EV cost (from detection, via the
            // Leak Finder) rides along when known. The SERVER diffs it against
            // the measurement stored at the previous review to produce
            // evDelta — the client never computes or sends a delta itself.
            const evLossBB = Number(reviewEvLossBB);
            const outcome = { correct, total };
            if (Number.isFinite(evLossBB) && evLossBB >= 0) outcome.evLossBB = evLossBB;
            const res = await fetch('/api/assistant/leaks/review', {
                method: 'POST',
                headers,
                body: JSON.stringify({ leakId: reviewLeakId, outcome }),
            });
            const ct = res.headers.get('content-type') || '';
            if (ct.includes('application/json')) {
                const json = await res.json().catch(() => null);
                if (res.ok && json && json.success) {
                    reached = true;
                    serverState = json.state || json.record || null;
                    persisted = json.persisted === true;
                }
            }
        } catch (e) {
            console.warn('[QuickSpotDrill] review post failed:', e?.message || e);
        }

        // Build the record to keep locally.
        //
        // MERGE, never replace. Grade locally first — that advances reps,
        // strongStreak and history off the record this device already holds —
        // then let the server override every field it actually states. The
        // server omits the mastery columns when they are not migrated yet, and
        // a blind overwrite would zero strongStreak / retired / history on every
        // round-trip: RETIRE_AFTER_STRONG would be unreachable and a mastered
        // leak would be re-queued every cycle, forever.
        let record = null;
        try {
            record = gradeReview(readReviewRecord(reviewLeakId), { correct, total }, new Date());
            if (serverState) {
                const merged = migrateRecord({
                    ...(record || {}),
                    ...definedOnly(serverState),
                    leakId: reviewLeakId,
                    lastReviewedAt: serverState.updatedAt || new Date().toISOString(),
                });
                if (merged) record = merged;
            }
            if (record) record = { ...record, leakId: String(reviewLeakId) };
        } catch (e) {
            console.warn('[QuickSpotDrill] review grading failed:', e?.message || e);
            record = null;
        }

        if (!record) {
            setReview({ status: 'error', intervalDays: null, persisted: false });
            return;
        }

        // Always mirrored locally: leaks.js reads server-first, so a stale copy
        // is harmless, and it is the ONLY copy when persisted:false. The write
        // can still be refused (private mode, quota) — we say so rather than
        // claiming a save that did not happen.
        const stored = writeReviewRecord(reviewLeakId, record);

        setReview({
            status: 'done',
            intervalDays: record.intervalDays,
            persisted: persisted && reached,
            stored,
        });

        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('pa-leak-review-updated', {
                detail: { leakId: String(reviewLeakId), intervalDays: record.intervalDays, persisted },
            }));
        }
    }, [reviewLeakId, reviewEvLossBB]);

    const retryReview = useCallback(() => {
        const last = lastOutcomeRef.current;
        if (!last) return;
        submitReview(last.correct, last.total);
    }, [submitReview]);

    const recordMiss = useCallback((q, pick) => {
        setMisses(prev => [...prev, {
            hand: q?.hero_hand || null,
            position: q?.hero_position || null,
            scenario: q?.scenario_text || '',
            pick: pick || 'No answer',
            correct: q?.correct_answer || '—',
            explanation: q?.gto_explanation || null,
        }]);
    }, []);

    const handleTimeout = useCallback(() => {
        const q = questionsRef.current[currentIdxRef.current];
        setRevealed(true);
        setStreak(0);
        setScore(prev => ({ ...prev, total: prev.total + 1 }));
        recordMiss(q, 'Ran out of time');
        setAnnouncement(`Time up. The solver prefers ${q?.correct_answer || 'another line'}.`);
        try { navigator.vibrate?.(30); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
        persistResult(q, 'timeout', false);
    }, [persistResult, recordMiss]);

    // ── countdown (wall-clock, pauses while hidden) ───────────────────────
    useEffect(() => {
        if (loading || revealed || finished || confirmQuit || questions.length === 0) return undefined;
        deadlineRef.current = Date.now() + DURATION * 1000;
        remainingRef.current = DURATION;
        pausedRef.current = false;
        setTimer(DURATION);

        const id = setInterval(() => {
            if (pausedRef.current) return;
            const left = Math.ceil((deadlineRef.current - Date.now()) / 1000);
            remainingRef.current = Math.max(0, left);
            setTimer(Math.max(0, left));
            if (left <= 0) {
                clearInterval(id);
                handleTimeout();
            }
        }, 250);

        return () => clearInterval(id);
    }, [currentIdx, loading, revealed, finished, confirmQuit, questions.length, handleTimeout]);

    // Backgrounding a phone for ten seconds must not auto-fail the question.
    useEffect(() => {
        if (typeof document === 'undefined') return undefined;
        const onVisibility = () => {
            if (document.visibilityState === 'hidden') {
                pausedRef.current = true;
            } else {
                pausedRef.current = false;
                deadlineRef.current = Date.now() + remainingRef.current * 1000;
            }
        };
        document.addEventListener('visibilitychange', onVisibility);
        return () => document.removeEventListener('visibilitychange', onVisibility);
    }, []);

    // ── interaction ───────────────────────────────────────────────────────
    const q = questions[currentIdx];
    const accuracy = score.total > 0 ? Math.round(100 * score.correct / score.total) : 0;
    const answeredSoFar = score.total;

    const handlePick = useCallback((option) => {
        if (revealed) return;
        const question = questions[currentIdx];
        const isCorrect = String(option).toLowerCase() === String(question?.correct_answer || '').toLowerCase();

        pausedRef.current = true;
        setAnswer(option);
        setRevealed(true);
        setScore(prev => ({
            correct: prev.correct + (isCorrect ? 1 : 0),
            total: prev.total + 1,
        }));
        setStreak(prev => (isCorrect ? prev + 1 : 0));
        if (!isCorrect) recordMiss(question, option);
        setAnnouncement(isCorrect
            ? `Correct — the solver prefers ${question?.correct_answer}.`
            : `Incorrect. You picked ${option}; the solver prefers ${question?.correct_answer}.`);

        try { navigator.vibrate?.(isCorrect ? 10 : 30); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
        persistResult(question, option, isCorrect);
    }, [questions, currentIdx, revealed, persistResult, recordMiss]);

    const celebrate = useCallback(async () => {
        if (reduce) return;
        try {
            const mod = await import('canvas-confetti');
            const confetti = mod?.default || mod;
            confetti?.({ particleCount: 80, spread: 70, origin: { y: 0.6 }, disableForReducedMotion: true });
        } catch (e) {
            console.warn('[QuickSpotDrill] confetti unavailable:', e?.message || e);
        }
    }, [reduce]);

    const handleNext = useCallback(() => {
        if (currentIdx + 1 < questions.length) {
            setCurrentIdx(prev => prev + 1);
            setAnswer(null);
            setRevealed(false);
            setAnnouncement('');
            return;
        }

        setFinished(true);
        const finalTotal = score.total;
        const finalCorrect = score.correct;
        const finalAccuracy = finalTotal > 0 ? (finalCorrect / finalTotal) * 100 : 0;

        let newLevel = level;
        if (level === 1 && finalAccuracy >= 60) newLevel = 2;
        else if (level === 2 && finalAccuracy >= 65) newLevel = 3;
        else if (level > 1 && finalAccuracy < 40) newLevel = Math.max(1, level - 1);

        if (newLevel !== level) {
            setLevel(newLevel);
            setLevelChange(newLevel > level ? 'up' : 'down');
            // Safari private mode throws on setItem — never inside a click path.
            safeStorage.set(LEVEL_KEY, newLevel);
            if (newLevel > level) {
                try { navigator.vibrate?.([20, 20, 20]); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
                celebrate();
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('sandbox-drill-level-up', { detail: { level: newLevel } }));
                }
            }
        }

        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('sandbox-drill-complete', {
                detail: { correct: finalCorrect, total: finalTotal, newLevel, oldLevel: level, misses: misses.length },
            }));
        }

        // Review runs only. If the user dropped the leak filters mid-run the
        // spots no longer belong to that leak, so the result is NOT allowed to
        // move its schedule — we say so instead of quietly recording it.
        if (reviewLeakId) {
            if (ignoreFilters) {
                setReview({ status: 'skipped', intervalDays: null, persisted: false });
            } else if (finalTotal > 0) {
                submitReview(finalCorrect, finalTotal);
            }
        }
    }, [currentIdx, questions.length, score, level, misses.length, celebrate, reviewLeakId, ignoreFilters, submitReview]);

    // Backdrop / Esc / ✕ must not silently bin a drill in progress.
    const inProgress = !loading && !finished && questions.length > 0 && !loadError;
    const requestClose = useCallback(() => {
        if (inProgress && answeredSoFar > 0) {
            pausedRef.current = true;
            setConfirmQuit(true);
            return;
        }
        onClose?.();
    }, [inProgress, answeredSoFar, onClose]);

    const target = promotionTarget(level);
    const ladderPct = Math.min(100, Math.round((accuracy / Math.max(1, target)) * 100));

    const optionRows = useMemo(() => (q?.options?.length ? q.options : DEFAULT_OPTIONS), [q]);

    // ── render helpers ────────────────────────────────────────────────────
    const headerRight = (streak > 0 && !finished && !loading) ? (
        <span style={{ ...pill('warn'), ...numeric }} aria-label={`${streak} in a row`}>
            <Flame size={12} strokeWidth={2.5} /> {streak}
        </span>
    ) : null;

    let subtitle = 'Loading spots…';
    if (loadError) subtitle = 'Could not load';
    else if (finished) subtitle = `Level ${level}`;
    else if (questions.length > 0) subtitle = `Spot ${currentIdx + 1} of ${questions.length} · Level ${level}`;
    else if (!loading) subtitle = 'No spots available';

    return (
        <BottomSheet
            open
            onClose={requestClose}
            title="Quick drill"
            titleIcon={<Zap size={18} strokeWidth={2} color={T.accent} />}
            subtitle={subtitle}
            headerRight={headerRight}
            ariaLabel="Quick spot drill"
            dismissOnBackdrop={!inProgress || answeredSoFar === 0}
            closeLabel="Close drill"
            footer={!loading && !confirmQuit && questions.length > 0 && !finished && revealed ? (
                <button type="button" className="pa-btn" onClick={handleNext} style={{ ...btn('primary', { block: true }) }}>
                    {currentIdx + 1 >= questions.length ? 'See results' : 'Next spot'}
                </button>
            ) : null}
        >
            <PAStyles />
            <span className="pa-vh" role="status" aria-live="polite">{announcement}</span>

            {/* ── quit confirmation ─────────────────────────────────────── */}
            {confirmQuit ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: S.md }}>
                    <h4 style={{ fontSize: F.h3, fontWeight: 800, color: T.text, margin: 0 }}>Quit this drill?</h4>
                    <p style={{ fontSize: F.bodySm, color: T.textMuted, margin: 0, lineHeight: 1.45 }}>
                        You have answered {answeredSoFar} of {questions.length} spots. Answered spots are already saved,
                        but the rest of this run will be discarded.
                    </p>
                    <div style={{ display: 'flex', gap: S.sm, flexWrap: 'wrap' }}>
                        <button
                            type="button"
                            className="pa-btn"
                            onClick={() => {
                                setConfirmQuit(false);
                                pausedRef.current = false;
                                deadlineRef.current = Date.now() + remainingRef.current * 1000;
                            }}
                            style={{ ...btn('primary'), flex: '1 1 140px' }}
                        >
                            Keep drilling
                        </button>
                        <button type="button" className="pa-btn" onClick={onClose} style={{ ...btn('danger'), flex: '1 1 120px' }}>
                            Quit drill
                        </button>
                    </div>
                </div>
            ) : loading ? (
                /* ── loading skeleton mirrors the real layout ─────────── */
                <div style={{ display: 'flex', flexDirection: 'column', gap: S.md }} aria-hidden="true">
                    <Skeleton h={6} w="100%" />
                    <Skeleton h={44} w="90%" />
                    <Skeleton h={48} />
                    <Skeleton h={48} />
                    <Skeleton h={48} />
                    <Skeleton h={48} />
                </div>
            ) : loadError ? (
                <ErrorState
                    title="Could not load drills"
                    body={loadError}
                    onRetry={load}
                />
            ) : questions.length === 0 ? (
                <EmptyState
                    icon={<AlertTriangle size={22} strokeWidth={2} />}
                    title="No spots match yet"
                    body={activeParams
                        ? 'Nothing in the question pool fits these filters. Try the unfiltered pool instead.'
                        : 'The drill pool is empty right now. Check back after the next content drop.'}
                    action={(
                        <div style={{ display: 'flex', gap: S.sm, flexWrap: 'wrap', justifyContent: 'center' }}>
                            {activeParams && (
                                <button
                                    type="button"
                                    className="pa-btn"
                                    onClick={() => setIgnoreFilters(true)}
                                    style={btn('primary')}
                                >
                                    Try without filters
                                </button>
                            )}
                            <button type="button" className="pa-btn" onClick={load} style={btn('secondary')}>
                                <RotateCcw size={18} strokeWidth={2} /> Retry
                            </button>
                        </div>
                    )}
                />
            ) : finished ? (
                /* ── finished screen ──────────────────────────────────── */
                <div style={{ display: 'flex', flexDirection: 'column', gap: S.lg }}>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 34, fontWeight: 800, color: pctTone(accuracy), ...numeric }}>{accuracy}%</div>
                        <div style={{ fontSize: F.bodySm, color: T.textMuted, marginTop: S.xs }}>
                            {score.correct} of {score.total} correct
                        </div>
                    </div>

                    {/* ── review schedule (review runs only) ───────────── */}
                    {reviewLeakId && review && (
                        <div
                            role="status"
                            aria-live="polite"
                            style={{
                                display: 'flex', flexDirection: 'column', gap: S.xs,
                                background: review.status === 'done' ? T.accentSoft : T.surface2,
                                border: `1px solid ${review.status === 'done' ? 'rgba(69,153,255,0.45)' : T.border}`,
                                borderRadius: R.sm, padding: S.md,
                            }}
                        >
                            {review.status === 'saving' && (
                                <>
                                    <span style={{ fontSize: F.bodySm, fontWeight: 700, color: T.textMuted }}>
                                        Scheduling your next review…
                                    </span>
                                    <Skeleton h={14} w="60%" />
                                </>
                            )}

                            {review.status === 'done' && (
                                <>
                                    <span style={{
                                        display: 'inline-flex', alignItems: 'center', gap: S.sm,
                                        fontSize: F.bodySm, fontWeight: 800, color: T.accent,
                                    }}>
                                        <CalendarDays size={16} strokeWidth={2} aria-hidden="true" />
                                        {intervalLabel(review.intervalDays)}
                                    </span>
                                    <span style={{ fontSize: F.caption, color: T.textMuted, lineHeight: 1.45 }}>
                                        {review.persisted
                                            ? 'Saved to your review schedule.'
                                            : review.stored
                                                ? 'Saved on this device for now — it will move to your account once your review schedule is available.'
                                                : 'This browser is blocking storage, so the date above could not be saved. The leak stays in your queue.'}
                                    </span>
                                </>
                            )}

                            {review.status === 'skipped' && (
                                <span style={{ fontSize: F.caption, color: T.textMuted, lineHeight: 1.45 }}>
                                    Filters were off for this run, so it has not changed this leak&apos;s review schedule.
                                </span>
                            )}

                            {review.status === 'error' && (
                                <>
                                    <span style={{ fontSize: F.bodySm, fontWeight: 700, color: T.warn }}>
                                        Could not update your review schedule
                                    </span>
                                    <span style={{ fontSize: F.caption, color: T.textMuted, lineHeight: 1.45 }}>
                                        Your answers were still saved. Try again, or carry on — the leak stays in your queue.
                                    </span>
                                    <button
                                        type="button"
                                        className="pa-btn"
                                        onClick={retryReview}
                                        style={{ ...btn('secondary'), marginTop: S.xs, alignSelf: 'flex-start' }}
                                    >
                                        <RotateCcw size={18} strokeWidth={2} aria-hidden="true" /> Retry
                                    </button>
                                </>
                            )}
                        </div>
                    )}

                    {levelChange === 'up' && (
                        <div style={{
                            background: T.successSoft, border: '1px solid rgba(34,197,94,0.4)', borderRadius: R.sm,
                            padding: S.md, fontSize: F.bodySm, fontWeight: 700, color: T.success, textAlign: 'center',
                        }}>
                            Level {level} unlocked
                        </div>
                    )}
                    {levelChange === 'down' && (
                        <div style={{
                            background: T.warnSoft, border: '1px solid rgba(251,191,36,0.4)', borderRadius: R.sm,
                            padding: S.md, fontSize: F.bodySm, fontWeight: 700, color: T.warn, textAlign: 'center',
                        }}>
                            Dropped to level {level} — easier spots next run.
                        </div>
                    )}

                    {/* Level ladder */}
                    <div>
                        <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            fontSize: F.label, fontWeight: 700, color: T.textMuted, marginBottom: S.xs,
                        }}>
                            <span>Level {level}</span>
                            <span style={numeric}>{target}% to promote</span>
                        </div>
                        <div style={{ height: 8, borderRadius: R.pill, background: T.surface2, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${ladderPct}%`, background: pctTone(accuracy) }} />
                        </div>
                    </div>

                    {misses.length > 0 && (
                        <div>
                            <h4 style={{ fontSize: F.label, fontWeight: 700, color: T.textDim, textTransform: 'uppercase', letterSpacing: 0.6, margin: `0 0 ${S.sm}px` }}>
                                Review your {misses.length} miss{misses.length === 1 ? '' : 'es'}
                            </h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: S.sm }}>
                                {misses.map((m, i) => (
                                    <div
                                        key={`miss-${i}`}
                                        style={{
                                            background: T.surface2, border: `1px solid ${T.border}`,
                                            borderRadius: R.sm, padding: S.md,
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: S.sm, flexWrap: 'wrap', marginBottom: S.xs }}>
                                            {m.hand && <span style={{ fontSize: F.bodySm, fontWeight: 800, color: T.text, ...numeric }}>{m.hand}</span>}
                                            {m.position && <span style={pill('accent')}>{m.position}</span>}
                                        </div>
                                        <div style={{ fontSize: F.caption, color: T.textMuted, lineHeight: 1.45 }}>
                                            You picked <strong style={{ color: T.danger }}>{m.pick}</strong> · solver plays{' '}
                                            <strong style={{ color: T.success }}>{m.correct}</strong>
                                        </div>
                                        {m.explanation && (
                                            <p style={{ fontSize: F.caption, color: T.textDim, margin: `${S.xs}px 0 0`, lineHeight: 1.45 }}>
                                                {m.explanation}
                                            </p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: S.sm, flexWrap: 'wrap' }}>
                        <button type="button" className="pa-btn" onClick={load} style={{ ...btn('secondary'), flex: '1 1 140px' }}>
                            <RotateCcw size={18} strokeWidth={2} /> Drill again
                        </button>
                        <button type="button" className="pa-btn" onClick={onClose} style={{ ...btn('primary'), flex: '1 1 120px' }}>
                            Done
                        </button>
                    </div>
                </div>
            ) : (
                /* ── question ─────────────────────────────────────────── */
                <div style={{ display: 'flex', flexDirection: 'column', gap: S.md }}>
                    <div>
                        <div style={{ height: 6, borderRadius: R.pill, background: T.surface2, overflow: 'hidden' }}>
                            <div
                                style={{
                                    height: '100%', borderRadius: R.pill,
                                    background: timer <= 5 ? T.danger : T.accent,
                                    width: `${(timer / DURATION) * 100}%`,
                                    transition: reduce ? 'none' : 'width 0.25s linear, background 0.3s',
                                }}
                            />
                        </div>
                        <div
                            role="timer"
                            aria-label={`${timer} seconds remaining`}
                            style={{
                                textAlign: 'right', fontSize: F.caption, marginTop: S.xs, ...numeric,
                                color: timer <= 5 ? T.danger : T.textDim,
                            }}
                        >
                            {timer}s
                        </div>
                    </div>

                    <p style={{ fontSize: F.bodySm, color: T.text, lineHeight: 1.45, margin: 0 }}>
                        {q?.scenario_text}
                    </p>

                    {(q?.hero_hand || q?.hero_position) && (
                        <div style={{ display: 'flex', gap: S.sm, alignItems: 'center', flexWrap: 'wrap' }}>
                            {q?.hero_hand && (
                                <span style={{ fontSize: F.h3, fontWeight: 800, color: T.warn, ...numeric }}>{q.hero_hand}</span>
                            )}
                            {q?.hero_position && <span style={pill('accent')}>{q.hero_position}</span>}
                            {q?.street && <span style={pill('neutral')}>{String(q.street).replace(/_/g, ' ')}</span>}
                        </div>
                    )}

                    {/* Single column of thumb-zone answers */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: S.sm }}>
                        {optionRows.map(opt => {
                            const isCorrectOpt = String(opt).toLowerCase() === String(q?.correct_answer || '').toLowerCase();
                            const isUserPick = opt === answer;
                            let background = T.surface2;
                            let borderColor = T.borderHi;
                            let colour = T.text;

                            if (revealed) {
                                if (isCorrectOpt) { background = T.successSoft; borderColor = 'rgba(34,197,94,0.5)'; colour = T.success; }
                                else if (isUserPick) { background = T.dangerSoft; borderColor = 'rgba(239,68,68,0.5)'; colour = T.danger; }
                                else { colour = T.textDim; }
                            }

                            return (
                                <button
                                    key={opt}
                                    type="button"
                                    className="pa-btn"
                                    onClick={() => handlePick(opt)}
                                    disabled={revealed}
                                    style={{
                                        ...btn('secondary', { block: true }),
                                        minHeight: 48, fontSize: F.body, justifyContent: 'space-between',
                                        background, borderColor, color: colour,
                                        ...(revealed ? { cursor: 'default', opacity: 1, pointerEvents: 'none' } : null),
                                    }}
                                >
                                    <span>{opt}</span>
                                    {revealed && isCorrectOpt && <Check size={18} strokeWidth={2.5} />}
                                    {revealed && isUserPick && !isCorrectOpt && <X size={18} strokeWidth={2.5} />}
                                </button>
                            );
                        })}
                    </div>

                    {revealed && q?.gto_explanation && (
                        <p style={{
                            fontSize: F.caption, color: T.textMuted, lineHeight: 1.45, margin: 0,
                            background: T.surface2, border: `1px solid ${T.border}`,
                            borderRadius: R.sm, padding: S.md,
                        }}>
                            {q.gto_explanation}
                        </p>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'center', gap: S.lg, fontSize: F.caption, color: T.textMuted, ...numeric }}>
                        <span style={{ color: T.success }}>{score.correct} correct</span>
                        <span style={{ color: T.danger }}>{score.total - score.correct} missed</span>
                        <span style={{ color: pctTone(accuracy) }}>{accuracy}%</span>
                    </div>
                </div>
            )}
        </BottomSheet>
    );
}
