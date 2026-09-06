const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isNonNegativeInteger = value => Number.isInteger(value) && value >= 0;
const ENTRY_STATES = new Set(['free', 'vip', 'charged', 'continuation', 'ticket']);
const CLOCK_SKEW_MS = 60 * 1000;
const DEFAULT_SESSION_LIFETIME_MS = 6 * 60 * 60 * 1000;
const SESSION_LIFETIME_MS = Object.freeze({
    arcade: 3 * 60 * 1000,
    pvp: 30 * 60 * 1000,
    'time-attack': 30 * 1000,
});

export function getTriviaSessionMaxLifetimeMs(mode) {
    return SESSION_LIFETIME_MS[mode] || DEFAULT_SESSION_LIFETIME_MS;
}

/**
 * A deadline is part of the server's authority boundary. A parseable date on
 * its own is not enough: an already-expired receipt must never open a game,
 * and a corrupt far-future date must not silently turn a 30-second/3-minute
 * run into an effectively permanent session.
 */
export function validateTriviaSessionDeadline(expiresAt, {
    mode,
    now = Date.now(),
    createdAt = null,
} = {}) {
    const expiresMs = typeof expiresAt === 'string' ? Date.parse(expiresAt) : NaN;
    const nowMs = Number(now);
    const maxLifetimeMs = getTriviaSessionMaxLifetimeMs(mode);
    if (!Number.isFinite(nowMs) || !Number.isFinite(expiresMs)) {
        return { ok: false, error: 'session_deadline_invalid' };
    }
    if (expiresMs <= nowMs) {
        return { ok: false, error: 'session_expired' };
    }
    if (expiresMs > nowMs + maxLifetimeMs + CLOCK_SKEW_MS) {
        return { ok: false, error: 'session_deadline_invalid' };
    }

    if (createdAt != null) {
        const createdMs = typeof createdAt === 'string' ? Date.parse(createdAt) : NaN;
        if (!Number.isFinite(createdMs)
            || createdMs > nowMs + CLOCK_SKEW_MS
            || expiresMs <= createdMs
            || expiresMs > createdMs + maxLifetimeMs + CLOCK_SKEW_MS) {
            return { ok: false, error: 'session_deadline_invalid' };
        }
    }

    return { ok: true, expiresMs };
}

/** Exact, ordered, unique question identity for a resumable session. */
export function validateTriviaSessionRoster(questionIds, expectedCount) {
    if (!Number.isInteger(expectedCount) || expectedCount <= 0
        || !Array.isArray(questionIds)
        || questionIds.length !== expectedCount
        || questionIds.some(id => typeof id !== 'string' || !UUID_RE.test(id))
        || new Set(questionIds).size !== expectedCount) {
        return { ok: false, error: 'session_roster_invalid' };
    }
    return { ok: true, questionIds: [...questionIds] };
}

/**
 * Validate record_trivia_session_answer's durable first-answer receipt before
 * any verdict, correct option, or explanation is allowed into an HTTP
 * response. Fresh writes must echo the submitted display index exactly;
 * replays may return a different index because the first stored answer wins.
 */
export function validateTriviaSessionAnswerReceipt(receipt, {
    requestedDisplayIndex,
    optionCount,
    questionCount,
    sessionCreatedAt,
    now = Date.now(),
} = {}) {
    const stored = receipt?.stored;
    const recordedAt = typeof stored?.at === 'string' ? Date.parse(stored.at) : NaN;
    const createdAt = typeof sessionCreatedAt === 'string' ? Date.parse(sessionCreatedAt) : NaN;
    const nowMs = Number(now);
    if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)
        || receipt.success !== true
        || typeof receipt.fresh !== 'boolean'
        || !stored || typeof stored !== 'object' || Array.isArray(stored)
        || !Number.isInteger(requestedDisplayIndex) || requestedDisplayIndex < -1
        || !Number.isInteger(optionCount) || optionCount < 2
        || !Number.isInteger(questionCount) || questionCount <= 0
        || !Number.isInteger(stored.d) || stored.d < -1 || stored.d >= optionCount
        || !Number.isInteger(stored.n) || stored.n < 0 || stored.n >= questionCount
        || !Number.isFinite(recordedAt)
        || !Number.isFinite(createdAt)
        || !Number.isFinite(nowMs)
        || recordedAt + CLOCK_SKEW_MS < createdAt
        || recordedAt > nowMs + CLOCK_SKEW_MS
        || (receipt.fresh && stored.d !== requestedDisplayIndex)) {
        return { ok: false, error: 'session_answer_receipt_invalid' };
    }

    return {
        ok: true,
        fresh: receipt.fresh,
        storedDisplayIndex: stored.d,
        answerOrdinal: stored.n,
        recordedAt: stored.at,
    };
}

export function validateTriviaSessionCreationReceipt(receipt, { mode, now = Date.now() } = {}) {
    if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)
        || receipt.success !== true
        || typeof receipt.duplicate !== 'boolean'
        || !isNonNegativeInteger(receipt.entry_cost)
        || !ENTRY_STATES.has(receipt.entry_state)
        || (receipt.new_balance !== undefined
            && receipt.new_balance !== null
            && !Number.isFinite(receipt.new_balance))
        || (receipt.survival_level !== undefined
            && receipt.survival_level !== null
            && (!Number.isInteger(receipt.survival_level) || receipt.survival_level < 1))) {
        return { ok: false, error: 'session_create_receipt_invalid' };
    }
    const deadline = validateTriviaSessionDeadline(receipt.expires_at, { mode, now });
    if (!deadline.ok) return deadline;
    return { ok: true, receipt };
}

/**
 * Validate the committed result returned by award_trivia_run_v2.
 *
 * The browser must only see a success response backed by an authoritative,
 * self-consistent database receipt. A null or schema-drifted payload is not a
 * reason to substitute locally computed rewards after the RPC call.
 */
export function validateTriviaAwardResponse(award, expected) {
    if (!award || typeof award !== 'object' || Array.isArray(award)) {
        return { ok: false, error: 'award_receipt_missing' };
    }
    if (award.success !== true) {
        return { ok: false, error: 'award_not_committed' };
    }
    if (award.session_id !== expected.sessionId) {
        return { ok: false, error: 'award_session_mismatch' };
    }
    const hasCommittedDiamondExpectation = isNonNegativeInteger(expected.diamonds);
    if (!isNonNegativeInteger(award.score)
        || !isNonNegativeInteger(award.correct_count)
        || !isNonNegativeInteger(award.diamonds_awarded)
        || award.score !== expected.score
        || award.correct_count !== expected.correct
        || (hasCommittedDiamondExpectation
            ? award.diamonds_awarded !== expected.diamonds
            : award.diamonds_awarded > expected.maxDiamonds)) {
        return { ok: false, error: 'award_totals_invalid' };
    }
    if (typeof award.score_id !== 'string' || !UUID_RE.test(award.score_id)) {
        return { ok: false, error: 'award_score_receipt_invalid' };
    }
    if (award.daily_bonus_awarded !== undefined
        && !isNonNegativeInteger(award.daily_bonus_awarded)) {
        return { ok: false, error: 'award_bonus_invalid' };
    }
    if (award.new_balance !== undefined
        && award.new_balance !== null
        && !Number.isFinite(award.new_balance)) {
        return { ok: false, error: 'award_balance_invalid' };
    }
    if (award.replayed !== undefined && typeof award.replayed !== 'boolean') {
        return { ok: false, error: 'award_replay_invalid' };
    }
    if (expected.requireReplay === true && award.replayed !== true) {
        return { ok: false, error: 'award_replay_invalid' };
    }

    return {
        ok: true,
        receipt: {
            score: award.score,
            correct: award.correct_count,
            diamondsAwarded: award.diamonds_awarded,
            scoreId: award.score_id,
            dailyBonusAwarded: award.daily_bonus_awarded ?? 0,
            newBalance: award.new_balance ?? null,
            replayed: award.replayed === true,
        },
    };
}
