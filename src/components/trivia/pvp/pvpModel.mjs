const ACTIVE_PVP_STATES = new Set(['searching', 'dealing', 'playing', 'waiting', 'settling']);
const POLLED_PVP_STATES = new Set(['searching', 'dealing', 'playing', 'waiting', 'settling']);
const PVP_QUESTION_STATES = new Set(['unanswered', 'answered', 'timeout', 'locked']);
const PVP_CONSUMED_QUESTION_STATES = new Set(['answered', 'timeout']);

const isIntegerAtLeast = (value, minimum = 0) => Number.isInteger(value) && value >= minimum;

export function createPvpClientNonce() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Fail closed when the pre-commit quote is incomplete. The browser never
 * fills in missing economics because the active rules version owns them.
 */
export function isAuthoritativePvpQuote(value) {
    if (!value || value.success !== true || value.engine !== 'pvp-v2') return false;
    if (!Number.isFinite(Date.parse(value.serverNow))) return false;
    if (!isIntegerAtLeast(value.balance)) return false;
    if (typeof value.rulesVersion !== 'string'
        || !/^pvp\.standard@[1-9][0-9]*$/.test(value.rulesVersion)) return false;
    if (typeof value.joinsEnabled !== 'boolean'
        || typeof value.horseFallbackEnabled !== 'boolean') return false;
    if (!isIntegerAtLeast(value.questionCount, 1)) return false;
    if (value.humanFirst !== true || value.horseLabel !== 'Smarter Horse') return false;
    if (value.cancellation !== 'search_only_before_match' || value.tie !== 'stake_refund') return false;
    if (!isIntegerAtLeast(value.horseWaitSeconds?.min, 1)
        || !isIntegerAtLeast(value.horseWaitSeconds?.max, value.horseWaitSeconds.min)) return false;
    if (!Array.isArray(value.stakes) || value.stakes.length === 0) return false;
    const seen = new Set();
    for (const quote of value.stakes) {
        if (!isIntegerAtLeast(quote?.stake, 1)
            || !isIntegerAtLeast(quote?.pot, 0)
            || !isIntegerAtLeast(quote?.rake, 0)
            || !isIntegerAtLeast(quote?.possibleReturn, 0)
            || !Number.isInteger(quote?.netWin)
            || seen.has(quote.stake)) return false;
        seen.add(quote.stake);
    }
    return true;
}

export function defaultPvpStake(quote) {
    if (!isAuthoritativePvpQuote(quote)) return null;
    return (quote.stakes.find((entry) => entry.stake <= quote.balance) || quote.stakes[0]).stake;
}

/**
 * Owns quote-response ordering independently from match/status DTO ordering.
 * Multiple legitimate callers can request fresh entry terms at once (boot,
 * terminal-state recovery, or a stale-rules recovery). Only the newest quote
 * request may adopt success, failure, or loading completion.
 */
export function createPvpQuoteAuthority() {
    let sequence = 0;
    return Object.freeze({
        begin() {
            sequence += 1;
            return sequence;
        },
        isCurrent(requestSequence) {
            return Number.isInteger(requestSequence) && requestSequence === sequence;
        },
        invalidate() {
            sequence += 1;
        },
    });
}

export function pvpStakeKeyboardTarget(stakes, balance, currentStake, key) {
    const affordable = (Array.isArray(stakes) ? stakes : [])
        .filter((entry) => isIntegerAtLeast(entry?.stake, 1) && entry.stake <= balance);
    if (affordable.length === 0) return null;

    const currentIndex = affordable.findIndex((entry) => entry.stake === currentStake);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    let nextIndex = safeIndex;
    if (key === 'Home') nextIndex = 0;
    else if (key === 'End') nextIndex = affordable.length - 1;
    else if (key === 'ArrowRight' || key === 'ArrowDown') nextIndex = (safeIndex + 1) % affordable.length;
    else if (key === 'ArrowLeft' || key === 'ArrowUp') nextIndex = (safeIndex - 1 + affordable.length) % affordable.length;
    else return null;
    return affordable[nextIndex].stake;
}

/**
 * Owns the client-side ordering boundary for authoritative PvP DTOs. A write
 * begins a new generation and aborts any read it supersedes. Reads are also
 * sequenced against each other, so a transport that ignores abort still
 * cannot commit an older response. reset() is the account-remount boundary.
 */
export function createPvpDtoAuthority() {
    let generation = 0;
    let readSequence = 0;
    let activeActionGeneration = null;
    let activeRead = null;

    const abortActiveRead = () => {
        if (!activeRead) return;
        activeRead.detach();
        activeRead.controller.abort();
        activeRead = null;
    };

    const reset = () => {
        generation += 1;
        activeActionGeneration = null;
        abortActiveRead();
        return generation;
    };

    const beginAction = () => {
        generation += 1;
        activeActionGeneration = generation;
        abortActiveRead();
        return generation;
    };

    const isActionCurrent = (actionGeneration) => (
        Number.isInteger(actionGeneration)
        && generation === actionGeneration
        && activeActionGeneration === actionGeneration
    );

    const finishAction = (actionGeneration) => {
        if (!isActionCurrent(actionGeneration)) return false;
        activeActionGeneration = null;
        return true;
    };

    const beginRead = ({ actionGeneration = null, signal = null } = {}) => {
        if (actionGeneration == null) {
            if (activeActionGeneration != null) return null;
        } else if (!isActionCurrent(actionGeneration)) {
            return null;
        }

        abortActiveRead();
        readSequence += 1;
        const controller = new AbortController();
        const abortFromParent = () => controller.abort();
        if (signal?.aborted) controller.abort();
        else signal?.addEventListener?.('abort', abortFromParent, { once: true });

        const lease = {
            generation,
            sequence: readSequence,
            actionGeneration,
            controller,
            signal: controller.signal,
            detach: () => signal?.removeEventListener?.('abort', abortFromParent),
        };
        activeRead = lease;
        return lease;
    };

    const canAdoptRead = (lease) => (
        Boolean(lease)
        && activeRead === lease
        && !lease.signal.aborted
        && generation === lease.generation
        && readSequence === lease.sequence
        && (lease.actionGeneration == null
            ? activeActionGeneration == null
            : isActionCurrent(lease.actionGeneration))
    );

    const finishRead = (lease) => {
        if (!lease) return;
        lease.detach();
        if (activeRead === lease) activeRead = null;
    };

    return {
        reset,
        beginAction,
        isActionCurrent,
        finishAction,
        beginRead,
        canAdoptRead,
        finishRead,
    };
}

export function pvpServerAnchor(serverNow, receivedAt = Date.now()) {
    const serverNowMs = Date.parse(serverNow);
    if (!Number.isFinite(serverNowMs) || !Number.isFinite(receivedAt)) return null;
    return { serverNowMs, receivedAt };
}

export function estimatedPvpServerNow(anchor, clientNow = Date.now()) {
    if (!anchor || !Number.isFinite(anchor.serverNowMs) || !Number.isFinite(anchor.receivedAt)) return null;
    return anchor.serverNowMs + Math.max(0, clientNow - anchor.receivedAt);
}

export function pvpSecondsUntil(isoTime, anchor, clientNow = Date.now()) {
    const target = Date.parse(isoTime);
    const now = estimatedPvpServerNow(anchor, clientNow);
    if (!Number.isFinite(target) || !Number.isFinite(now)) return null;
    return Math.max(0, Math.ceil((target - now) / 1000));
}

export function formatPvpDuration(totalSeconds) {
    if (!Number.isFinite(totalSeconds)) return 'Awaiting Server Time';
    const safe = Math.max(0, Math.floor(totalSeconds));
    const minutes = Math.floor(safe / 60);
    const seconds = safe % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function pvpPollDelay(dto) {
    if (!dto || !POLLED_PVP_STATES.has(dto.state)) return null;
    const requested = Number(dto.pollAfterMs);
    if (Number.isFinite(requested)) return Math.max(500, Math.min(10_000, Math.floor(requested)));
    const heartbeatMs = Number(dto.heartbeatSeconds) * 1000;
    if (Number.isFinite(heartbeatMs) && heartbeatMs > 0) {
        return Math.max(500, Math.min(10_000, Math.floor(heartbeatMs)));
    }
    return 2_000;
}

export function isActivePvpState(state) {
    return ACTIVE_PVP_STATES.has(state);
}

function invalidPvpSessionProgress(error, questions = []) {
    return {
        valid: false,
        error,
        questions,
        completedCount: 0,
        currentIndex: -1,
        currentPosition: null,
        complete: false,
        blocked: false,
    };
}

/**
 * Resume from the question rows owned by the grading session, never from the
 * matchmaking summary's eventually consistent answered count. Position is the
 * stable ordering key and state determines which question may be shown next.
 */
export function derivePvpSessionProgress(value) {
    if (!Array.isArray(value) || value.length === 0) {
        return invalidPvpSessionProgress('session_questions_invalid');
    }

    const ordered = [];
    const positions = new Set();
    for (const raw of value) {
        if (!raw || typeof raw !== 'object') {
            return invalidPvpSessionProgress('session_questions_invalid');
        }
        const position = Number(raw.position);
        if (!isIntegerAtLeast(position, 1) || positions.has(position)) {
            return invalidPvpSessionProgress('session_question_position_invalid');
        }
        if (typeof raw.state !== 'string' || !PVP_QUESTION_STATES.has(raw.state)) {
            return invalidPvpSessionProgress('session_question_state_invalid');
        }
        const state = raw.state;
        if (state !== 'locked'
            && (typeof raw.id !== 'string' || !Array.isArray(raw.options) || raw.options.length < 2)) {
            return invalidPvpSessionProgress('session_questions_invalid');
        }
        positions.add(position);
        ordered.push({ ...raw, position, state });
    }

    ordered.sort((left, right) => left.position - right.position);
    if (ordered.some((question, index) => question.position !== index + 1)) {
        return invalidPvpSessionProgress('session_question_position_invalid', ordered);
    }

    const completedCount = ordered.reduce(
        (count, question) => count + (PVP_CONSUMED_QUESTION_STATES.has(question.state) ? 1 : 0),
        0,
    );
    const nextIndex = ordered.findIndex((question) => !PVP_CONSUMED_QUESTION_STATES.has(question.state));
    const complete = nextIndex === -1;
    const blocked = !complete && ordered[nextIndex].state !== 'unanswered';

    return {
        valid: true,
        error: null,
        questions: ordered,
        completedCount,
        currentIndex: blocked || complete ? -1 : nextIndex,
        currentPosition: complete ? null : ordered[nextIndex].position,
        complete,
        blocked,
    };
}

/**
 * Apply the answer the server says is stored. A repeated request can return a
 * different storedDisplayIndex than the option just tapped because the first
 * answer wins. Painting the attempted option would misrepresent durable state.
 */
export function applyPvpAnswerReceipt(questions, questionId, receipt) {
    const progress = derivePvpSessionProgress(questions);
    if (!progress.valid) return { ok: false, error: progress.error };

    const questionIndex = progress.questions.findIndex((question) => question.id === questionId);
    const question = progress.questions[questionIndex];
    const storedDisplayIndex = Number(receipt?.storedDisplayIndex);
    if (!question
        || receipt?.success !== true
        || receipt?.recorded !== true
        || typeof receipt?.fresh !== 'boolean'
        || receipt?.questionId !== questionId
        || !Number.isInteger(storedDisplayIndex)
        || storedDisplayIndex < 0
        || storedDisplayIndex >= question.options.length) {
        return { ok: false, error: 'session_answer_receipt_invalid' };
    }
    if (receipt.position != null && Number(receipt.position) !== question.position) {
        return { ok: false, error: 'session_answer_receipt_invalid' };
    }

    const updated = progress.questions.map((entry, index) => (
        index === questionIndex
            ? { ...entry, state: 'answered', storedDisplayIndex }
            : entry
    ));
    const next = derivePvpSessionProgress(updated);
    if (!next.valid) return { ok: false, error: next.error };

    return {
        ok: true,
        fresh: receipt.fresh,
        storedDisplayIndex,
        ...next,
    };
}

export function pvpErrorCopy(error) {
    const code = error?.payload?.error || error?.message || 'pvp_unavailable';
    switch (code) {
        case 'authentication_required':
            return 'Your Sign In Expired. Sign In Again Before Continuing.';
        case 'insufficient_diamonds':
            return 'Your Current Diamond Balance Cannot Cover This Stake.';
        case 'pvp_joins_paused':
            return 'New Head To Head Entries Are Paused. An Existing Match Can Still Be Resumed.';
        case 'rules_unavailable':
            return 'The Current Server Rules Could Not Be Verified. No Entry Was Created.';
        case 'legacy_ticket_present':
            return 'An Older Search Is Still Open. The Server Refused A Second Entry.';
        case 'ticket_not_found':
            return 'That Search Is No Longer Active. Restore Your Latest Server State.';
        case 'match_not_found':
        case 'not_your_match':
            return 'The Server Could Not Restore This Match For Your Account.';
        case 'session_expired':
        case 'answer_late':
            return 'The Match Deadline Has Passed. The Server Is Confirming The Result.';
        case 'contract_mismatch':
            return 'The Match Contract Changed Or Could Not Be Verified. Your Stored Match State Was Not Replaced.';
        case 'position_out_of_order':
        case 'question_not_open':
            return 'That Answer Position Is Already Closed. Restore The Latest Match Position.';
        case 'session_questions_invalid':
        case 'session_question_position_invalid':
        case 'session_question_state_invalid':
            return 'The Server Returned An Invalid Question Position. No Answer Was Changed.';
        case 'session_answer_receipt_invalid':
            return 'The Server Did Not Confirm Which Answer Was Stored. Restore The Latest Match Position.';
        case 'pvp_temporarily_unavailable':
            return 'Head To Head Is Temporarily Unavailable. No New Entry Was Created.';
        case 'invalid_pvp_quote':
            return 'The Server Did Not Return A Complete Entry Quote. Joining Is Disabled.';
        default:
            return 'The Live Match Service Could Not Confirm This Request. Your Last Confirmed Server State Is Still Shown.';
    }
}

export function pvpOutcomeLabel(result) {
    switch (result?.outcome) {
        case 'win': return 'Victory';
        case 'loss': return 'Defeat';
        case 'tie': return 'Tie';
        case 'refund': return 'Stake Refunded';
        case 'void': return 'Match Voided';
        default: return 'Result Recorded';
    }
}

export function pvpOutcomeInk(result) {
    switch (result?.outcome) {
        case 'win': return 'green';
        case 'loss': return 'red';
        case 'tie': case 'refund': case 'void': return 'gold';
        default: return 'silver';
    }
}
