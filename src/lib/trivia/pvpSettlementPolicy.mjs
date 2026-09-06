/**
 * Pure validation rules shared by PvP entry and settlement.
 *
 * Money only moves for a match whose identity, roster, session binding and
 * exact debit all agree. These helpers return stable error codes so API routes
 * can fail closed without exposing database details.
 */
export const PVP_ALLOWED_STAKES = Object.freeze([10, 25, 50, 100]);
export const PVP_QUESTION_COUNT = 20;
export const PVP_MATCH_JOIN_WINDOW_MS = 30 * 60 * 1000;
export const PVP_SETTLEABLE_STATUSES = Object.freeze(['active', 'settling', 'complete']);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isPvpUuid(value) {
    return typeof value === 'string' && UUID_RE.test(value);
}

export function validatePvpSessionCreationReceipt(receipt, requestedSessionId) {
    if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)
        || receipt.success !== true
        || typeof receipt.duplicate !== 'boolean'
        || !isPvpUuid(receipt.session_id)
        || (!receipt.duplicate && receipt.session_id !== requestedSessionId)) {
        return { ok: false, error: 'session_create_receipt_invalid' };
    }
    return {
        ok: true,
        duplicate: receipt.duplicate,
        sessionId: receipt.session_id,
    };
}

/**
 * Prove that a create/replay receipt resolves to the one durable binding for
 * this participant and side. The route calls this only after reloading both
 * the current match row and `(match_id, side)` link from the database.
 */
export function validatePvpDurableSessionLink({
    match,
    link,
    expectedMatchId,
    expectedUserId,
    expectedSide,
    expectedSessionId,
    expectedRoster,
    expectedStake,
    now = Date.now(),
}) {
    const nowMs = Number(now);
    const matchValidation = validatePvpMatch(match, { now: nowMs, requireActive: true });
    const matchCreatedAt = Date.parse(match?.created_at);
    if (!Number.isFinite(nowMs)
        || !matchValidation.ok
        || match?.id !== expectedMatchId
        || matchValidation.rosterIds.length !== PVP_QUESTION_COUNT
        || nowMs - matchCreatedAt > PVP_MATCH_JOIN_WINDOW_MS
        || !samePvpRoster(match.questions, expectedRoster)
        || match.stake_amount !== expectedStake) {
        return { ok: false, error: 'durable_match_mismatch' };
    }

    const participantForSide = expectedSide === 1 ? match.player1_id
        : expectedSide === 2 ? match.player2_id
            : null;
    if (!link
        || link.match_id !== expectedMatchId
        || link.side !== expectedSide
        || participantForSide !== expectedUserId
        || link.user_id !== expectedUserId
        || !isPvpUuid(expectedSessionId)
        || link.session_id !== expectedSessionId) {
        return { ok: false, error: 'durable_session_link_mismatch' };
    }

    return { ok: true, match, sessionId: link.session_id };
}

export function extractPvpRosterIds(raw, { allowLegacyObjects = false } = {}) {
    if (raw == null) return [];
    if (!Array.isArray(raw)) return null;

    const ids = raw.map((entry) => {
        if (typeof entry === 'string') return entry;
        if (allowLegacyObjects && entry && typeof entry.id === 'string') return entry.id;
        return null;
    });

    if (ids.some((id) => !isPvpUuid(id))) return null;
    if (new Set(ids).size !== ids.length) return null;
    if (ids.length > PVP_QUESTION_COUNT) return null;
    return ids;
}

export function samePvpRoster(left, right) {
    const a = extractPvpRosterIds(left);
    const b = extractPvpRosterIds(right);
    return Array.isArray(a)
        && Array.isArray(b)
        && a.length > 0
        && a.length === b.length
        && a.every((id, index) => id === b[index]);
}

/** A forced sweep has no legitimate pending state: every unsettled result is a failure. */
export function forcedPvpSettlementFailureCount(result) {
    const declared = Number.isInteger(result?.failed) && result.failed > 0
        ? result.failed
        : 0;
    if (result?.settled === true && !result?.error && !result?.rejected) {
        return declared;
    }
    return Math.max(1, declared);
}

export function isValidPvpStatsReceipt(receipt) {
    return !!receipt
        && typeof receipt === 'object'
        && !Array.isArray(receipt)
        && receipt.success === true
        && typeof receipt.deduped === 'boolean';
}

export function validatePvpMatch(match, { now = Date.now(), requireActive = false } = {}) {
    if (!match || typeof match !== 'object') return { ok: false, error: 'invalid_match' };
    if (!isPvpUuid(match.id)) return { ok: false, error: 'invalid_match_id' };
    if (!isPvpUuid(match.player1_id) || !isPvpUuid(match.player2_id)) {
        return { ok: false, error: 'invalid_match_players' };
    }
    if (match.player1_id === match.player2_id) {
        return { ok: false, error: 'invalid_match_players' };
    }
    if (!Number.isInteger(match.stake_amount) || !PVP_ALLOWED_STAKES.includes(match.stake_amount)) {
        return { ok: false, error: 'invalid_match_stake' };
    }
    if (requireActive ? match.status !== 'active' : !PVP_SETTLEABLE_STATUSES.includes(match.status)) {
        return { ok: false, error: 'match_not_settleable' };
    }

    const createdAt = Date.parse(match.created_at);
    if (!Number.isFinite(createdAt) || createdAt > now + 60_000) {
        return { ok: false, error: 'invalid_match_time' };
    }

    const rosterIds = extractPvpRosterIds(match.questions);
    if (rosterIds === null) return { ok: false, error: 'invalid_match_roster' };
    return { ok: true, rosterIds };
}

export function validatePvpSessionBinding({
    match,
    link,
    session,
    expectedUserId,
    expectedSide,
    stakeTransactions,
}) {
    if (!link || link.match_id !== match.id || link.side !== expectedSide) {
        return { ok: false, error: 'session_link_mismatch' };
    }
    if (link.user_id !== expectedUserId || !isPvpUuid(link.session_id)) {
        return { ok: false, error: 'session_link_mismatch' };
    }
    if (!session || session.id !== link.session_id || session.user_id !== expectedUserId) {
        return { ok: false, error: 'session_owner_mismatch' };
    }
    if (session.mode !== 'pvp') return { ok: false, error: 'session_mode_mismatch' };
    if (!['open', 'submitted', 'expired'].includes(session.status)) {
        return { ok: false, error: 'session_status_invalid' };
    }
    if (!samePvpRoster(match.questions, session.question_ids)) {
        return { ok: false, error: 'session_roster_mismatch' };
    }

    const matchCreated = Date.parse(match.created_at);
    const sessionCreated = Date.parse(session.created_at);
    if (!Number.isFinite(sessionCreated) || sessionCreated + 1_000 < matchCreated) {
        return { ok: false, error: 'session_time_mismatch' };
    }
    const expiresAt = Date.parse(session.expires_at);
    if (!Number.isFinite(expiresAt)) {
        return { ok: false, error: 'session_deadline_invalid' };
    }
    if (session.entry_cost !== match.stake_amount || session.entry_state !== 'charged') {
        return { ok: false, error: 'session_entry_mismatch' };
    }

    const transactions = Array.isArray(stakeTransactions) ? stakeTransactions : [];
    if (transactions.length !== 1) {
        return { ok: false, error: transactions.length > 1 ? 'stake_reused' : 'stake_not_found' };
    }
    const stake = transactions[0];
    const expectedReference = `pvp_stake_${match.id}_${expectedUserId}`;
    if (stake.user_id !== expectedUserId
        || stake.reference_id !== expectedReference
        || stake.amount !== -match.stake_amount
        || (stake.transaction_type || stake.type) !== 'pvp_stake') {
        return { ok: false, error: 'stake_mismatch' };
    }

    if (session.status === 'submitted') {
        const submittedAt = Date.parse(session.submitted_at);
        if (!Number.isFinite(submittedAt)
            || submittedAt > expiresAt) {
            return { ok: false, error: 'session_submitted_outside_window' };
        }
        if (!Number.isInteger(session.correct_count)
            || session.correct_count < 0
            || session.correct_count > session.question_ids.length) {
            return { ok: false, error: 'session_score_invalid' };
        }
    }

    return { ok: true };
}

/**
 * Validate the immutable credit plan returned by
 * decide_trivia_pvp_settlement_v1 after its atomic transaction completes. The
 * database is the decision and payment authority; this narrow schema and
 * conservation guard keeps a malformed response from becoming a false client
 * result.
 */
export function validatePvpSettlementDecision(match, decision) {
    if (!match || !decision || typeof decision !== 'object') {
        return { ok: false, error: 'settlement_decision_invalid' };
    }
    if (!isPvpUuid(match.id)
        || !isPvpUuid(match.player1_id)
        || !isPvpUuid(match.player2_id)
        || !Number.isInteger(match.stake_amount)
        || !PVP_ALLOWED_STAKES.includes(match.stake_amount)
        || !['win', 'tie', 'refund', 'void'].includes(decision.kind)
        || typeof decision.forfeit !== 'boolean'
        || decision.reference_family !== `pvp_settlement_${match.id}`) {
        return { ok: false, error: 'settlement_decision_invalid' };
    }
    if (!Array.isArray(decision.credits)) {
        return { ok: false, error: 'settlement_credits_invalid' };
    }

    const sides = Array.isArray(decision.sides) ? decision.sides : [];
    if (sides.length !== 2) return { ok: false, error: 'settlement_sides_invalid' };
    const sideByNumber = new Map();
    for (const side of sides) {
        if (!side || ![1, 2].includes(side.side) || sideByNumber.has(side.side)) {
            return { ok: false, error: 'settlement_sides_invalid' };
        }
        const expectedUserId = side.side === 1 ? match.player1_id : match.player2_id;
        if (side.user_id !== expectedUserId
            || typeof side.is_horse !== 'boolean'
            || typeof side.charged !== 'boolean'
            || typeof side.submitted !== 'boolean'
            || (side.session_id != null && !isPvpUuid(side.session_id))
            || (side.submitted && (!Number.isInteger(side.correct_count)
                || side.correct_count < 0
                || side.correct_count > PVP_QUESTION_COUNT))
            || (!side.submitted && side.correct_count != null)
            || (side.submitted && (!side.charged || !isPvpUuid(side.session_id)))) {
            return { ok: false, error: 'settlement_sides_invalid' };
        }
        sideByNumber.set(side.side, side);
    }

    const p1 = sideByNumber.get(1);
    const p2 = sideByNumber.get(2);
    const p1Score = p1.submitted ? p1.correct_count : null;
    const p2Score = p2.submitted ? p2.correct_count : null;
    if (decision.player1_score !== p1Score || decision.player2_score !== p2Score) {
        return { ok: false, error: 'settlement_scores_invalid' };
    }

    const winnerId = decision.winner_id ?? null;
    const submittedSides = sides.filter(side => side.submitted);
    const expectedCredits = [];
    const stake = match.stake_amount;
    const winnerPayout = (stake * 2) - Math.floor(stake * 2 * 0.1);
    const pushCredit = (side, amount, transactionType, referenceId) => {
        expectedCredits.push({
            user_id: side.user_id,
            amount,
            transaction_type: transactionType,
            reference_id: referenceId,
        });
    };

    if (decision.kind === 'win') {
        const winner = sides.find(side => side.user_id === winnerId);
        const loser = sides.find(side => side.user_id !== winnerId);
        if (!winner || !winner.submitted
            || (!decision.forfeit && submittedSides.length !== 2)
            || (!decision.forfeit && winner.correct_count <= loser?.correct_count)
            || (decision.forfeit && (submittedSides.length !== 1 || loser?.submitted))
            || !winner.charged
            || !loser?.charged) {
            return { ok: false, error: 'settlement_decision_invalid' };
        }
        pushCredit(winner, winnerPayout, 'pvp_win', `pvp_match_win_${match.id}`);
    } else {
        if (winnerId !== null || decision.forfeit) {
            return { ok: false, error: 'settlement_decision_invalid' };
        }
        if (decision.kind === 'tie') {
            if (submittedSides.length !== 2
                || p1Score !== p2Score
                || sides.some(side => !side.charged)) {
                return { ok: false, error: 'settlement_decision_invalid' };
            }
            for (const side of sides.filter(side => side.charged)) {
                pushCredit(side, stake, 'pvp_refund', `pvp_tie_refund_${match.id}_${side.user_id}`);
            }
        } else if (decision.kind === 'refund') {
            if (submittedSides.length > 1
                || (submittedSides.length === 1
                    && sides.some(side => !side.submitted && side.charged))) {
                return { ok: false, error: 'settlement_decision_invalid' };
            }
            const refundable = submittedSides.length === 1
                ? submittedSides.filter(side => side.charged)
                : sides.filter(side => side.charged);
            for (const side of refundable) {
                pushCredit(side, stake, 'pvp_refund', `pvp_refund_${match.id}_${side.user_id}`);
            }
            if (expectedCredits.length === 0) {
                return { ok: false, error: 'settlement_decision_invalid' };
            }
        } else if (sides.some(side => side.charged)) {
            return { ok: false, error: 'settlement_decision_invalid' };
        }
    }

    const credits = decision.credits;
    if (credits.length !== expectedCredits.length) {
        return { ok: false, error: 'settlement_credits_invalid' };
    }
    const expectedByReference = new Map(expectedCredits.map(credit => [credit.reference_id, credit]));
    const seenReferences = new Set();
    const normalizedCredits = [];
    for (const credit of credits) {
        const expected = credit && expectedByReference.get(credit.reference_id);
        if (!expected
            || seenReferences.has(credit.reference_id)
            || credit.user_id !== expected.user_id
            || credit.amount !== expected.amount
            || credit.transaction_type !== expected.transaction_type
            || typeof credit.description !== 'string'
            || credit.description.trim().length === 0) {
            return { ok: false, error: 'settlement_credits_invalid' };
        }
        seenReferences.add(credit.reference_id);
        normalizedCredits.push({
            userId: credit.user_id,
            amount: credit.amount,
            type: credit.transaction_type,
            description: credit.description,
            referenceId: credit.reference_id,
        });
    }

    return {
        ok: true,
        kind: decision.kind,
        forfeit: decision.forfeit,
        winnerId,
        p1Correct: p1Score,
        p2Correct: p2Score,
        sides,
        credits: normalizedCredits,
    };
}

/** Validate the terminal RPC envelope and its exact credit receipt totals. */
export function validatePvpSettlementEnvelope(match, atomic) {
    if (!atomic || atomic.match_id !== match?.id || atomic.success !== true) {
        return { ok: false, error: 'settlement_envelope_invalid' };
    }
    if (!['decided', 'replay'].includes(atomic.state)
        || !['complete', 'completed'].includes(atomic.match_status)
        || typeof atomic.replayed !== 'boolean'
        || (atomic.state === 'decided' && atomic.replayed)
        || (atomic.state === 'replay' && !atomic.replayed)) {
        return { ok: false, error: 'settlement_state_invalid' };
    }

    const decision = validatePvpSettlementDecision(match, atomic.decision);
    if (!decision.ok) return decision;

    const creditedAmount = decision.credits.reduce((sum, credit) => sum + credit.amount, 0);
    if (!Number.isInteger(atomic.credit_count)
        || !Number.isInteger(atomic.credited_amount)
        || atomic.credit_count !== decision.credits.length
        || atomic.credited_amount !== creditedAmount) {
        return { ok: false, error: 'settlement_receipt_invalid' };
    }

    return { ...decision, replayed: atomic.replayed, creditedAmount };
}
