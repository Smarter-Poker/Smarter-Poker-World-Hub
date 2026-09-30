/**
 * Trivia Phase 3 server helpers: release flags, request-shape guards and DTO
 * sanitization for the session routes (engine `trivia-engine/3`).
 * ===========================================================================
 * The database owns eligibility, rosters, permutations and grading
 * (supabase/migrations/*_trivia_p3_*.sql). These helpers only decide which path
 * a route takes and make sure nothing key-bearing or client-graded crosses the
 * API boundary in either direction.
 */

/** Only the exact lowercase string `true` enables a control (Phase 1 convention). */
const enabled = (value) => value === 'true';

/** Solo session routes use engine v3 (DB roster snapshot + DB grading). Default off. */
export function isSoloEngineV3Enabled(env = process.env) {
    return enabled(env?.TRIVIA_P3_SOLO_ENGINE_V3);
}

/** Free modes may use the relaxed legacy pool when the eligible pool cannot fill a roster. Default off. */
export function isFreeLegacyFallbackEnabled(env = process.env) {
    return enabled(env?.TRIVIA_FREE_LEGACY_FALLBACK_ENABLED);
}

/** v3 selector runs beside legacy selection and records a comparison row. Default ON (no player effect). */
export function isShadowSelectorEnabled(env = process.env) {
    return env?.TRIVIA_P3_SHADOW_SELECTOR !== 'false';
}

export const FREE_MODES = Object.freeze(new Set(['daily', 'history', 'rules', 'pro']));

/** Eligible serving pool (service-role view). Legacy selection reads ONLY this for paid play. */
export const ELIGIBLE_SERVING_SOURCE = 'trivia_eligible_questions_serving_v1';
/** Relaxed pool reachable only by free modes behind TRIVIA_FREE_LEGACY_FALLBACK_ENABLED. */
export const FREE_FALLBACK_SOURCE = 'trivia_free_fallback_questions_v1';

/** Client-supplied timing is never accepted: the server clock is the only clock. */
export const CLIENT_TIMING_FIELDS = Object.freeze([
    'answeredAt', 'answered_at', 'clientTime', 'client_time', 'clientTimestamp', 'elapsedMs', 'elapsed_ms',
    'timeMs', 'time_ms', 'timeRemaining', 'time_remaining', 'timeSpent', 'time_spent', 'responseTimeMs',
    'response_time_ms', 'startedAt', 'started_at', 'duration', 'durationMs',
]);

/** Shapes from the retired self-graded protocol: the server grades, the client never does. */
export const SELF_GRADED_FIELDS = Object.freeze([
    'score', 'correct', 'correctCount', 'correct_count', 'diamonds', 'diamondsAwarded', 'diamonds_awarded',
    'isCorrect', 'is_correct', 'wasCorrect', 'was_correct', 'results', 'grade', 'points', 'total',
    'totalQuestions', 'total_questions', 'perQuestion',
]);

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Names of forbidden fields present at the top level or inside answers[] items. */
export function findForbiddenFields(body, fields) {
    const found = new Set();
    if (!isObject(body)) return [];
    for (const f of fields) if (Object.prototype.hasOwnProperty.call(body, f)) found.add(f);
    if (Array.isArray(body.answers)) {
        for (const a of body.answers) {
            if (!isObject(a)) continue;
            for (const f of fields) if (Object.prototype.hasOwnProperty.call(a, f)) found.add(`answers[].${f}`);
        }
    }
    return [...found];
}

/** Keys that must never reach a browser, at any depth, in a question/session DTO. */
export const KEY_BEARING_FIELDS = Object.freeze(new Set([
    'correct_index', 'correctIndex', 'original_index', 'originalIndex', 'revision_id', 'revisionId',
    'content_hash', 'contentHash', 'engine_metadata', 'explanation', 'answer', 'answerKey', 'answer_key',
]));

/** Deep copy without key-bearing fields (defense in depth over the database DTO). */
export function stripKeyBearing(value) {
    if (Array.isArray(value)) return value.map(stripKeyBearing);
    if (!isObject(value)) return value;
    const out = {};
    for (const [k, v] of Object.entries(value)) {
        if (KEY_BEARING_FIELDS.has(k)) continue;
        out[k] = stripKeyBearing(v);
    }
    return out;
}

/** Map the database v3 DTO onto the solo client contract used by useServerGradedRun. */
export function toSoloStartResponse(dto) {
    const safe = stripKeyBearing(dto || {});
    const questions = (Array.isArray(safe.questions) ? safe.questions : [])
        .filter(q => isObject(q) && typeof q.id === 'string')
        .map(q => ({
            id: q.id,
            question: q.question,
            options: Array.isArray(q.options) ? q.options : [],
            category: q.category ?? null,
            difficulty: q.difficulty ?? null,
        }));
    return {
        success: true,
        sessionId: safe.sessionId,
        mode: safe.mode,
        engine: safe.engine,
        resumed: safe.resumed === true,
        questionCount: questions.length,
        questions,
        entryCost: Number(safe.entryCost) || 0,
        entryState: safe.entryState || 'free',
        newBalance: safe.newBalance == null ? null : Number(safe.newBalance),
        expiresAt: safe.expiresAt || null,
        contract: safe.contract || null,
        contractSignature: safe.contractSignature || null,
    };
}

/** Database error code -> HTTP status for the v3 session routes. */
export function v3ErrorStatus(code) {
    switch (code) {
        case 'session_not_found': return 404;
        case 'not_your_session': return 403;
        case 'insufficient_diamonds': return 402;
        case 'session_expired': return 410;
        case 'insufficient_eligible_pool': return 503;
        case 'invalid_mode': case 'invalid_arguments': case 'invalid_display_index':
        case 'question_not_in_session': case 'invalid_scope': return 400;
        case 'session_closed': case 'session_id_conflict': case 'question_not_open': case 'answer_late':
        case 'position_out_of_order': case 'grade_changed': case 'seat_has_open_session':
        case 'contract_mismatch': case 'survival_continuation_used': case 'survival_complete':
        case 'survival_level_not_passed': case 'invalid_survival_continuation': return 409;
        default: return 500;
    }
}
