/**
 * Trivia PvP v2 (Phase 5) transport policy.
 *
 * The database owns every PvP rule: the queue ticket, the stable 20-45 second
 * Smarter Horse deadline, human-first matching, escrow, sessions and
 * settlement all live in the trivia_pvp_*_v2 service RPCs. This module only
 * validates transport shapes and re-sanitizes the database DTO through an
 * allowlist, so a column added later can never reach a browser by accident.
 * It never computes a winner, an amount or a deadline.
 */
export const PVP_V2_STAKES = Object.freeze([10, 25, 50, 100]);
export const PVP_HORSE_WAIT_MIN_SECONDS = 20;
export const PVP_HORSE_WAIT_MAX_SECONDS = 45;
/** A status poll this close to the stored horse deadline waits for it server-side. */
export const PVP_DEADLINE_ALIGN_MAX_MS = 6000;
export const PVP_STATES = Object.freeze([
    'idle', 'searching', 'dealing', 'playing', 'waiting', 'settling', 'result', 'search_ended',
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TICKET_REQUIRED_STATES = new Set(['searching', 'search_ended']);
const MATCH_REQUIRED_STATES = new Set(['dealing', 'playing', 'waiting', 'settling', 'result']);

export function isUuid(value) {
    return typeof value === 'string' && UUID_RE.test(value);
}

export function parseJoinBody(body) {
    const stake = Number(body?.stake);
    if (!Number.isInteger(stake) || !PVP_V2_STAKES.includes(stake)) {
        return { ok: false, error: 'invalid_stake' };
    }
    if (!isUuid(body?.clientNonce)) {
        return { ok: false, error: 'invalid_client_nonce' };
    }
    if (typeof body?.rulesVersion !== 'string'
        || !/^pvp\.standard@[1-9][0-9]*$/.test(body.rulesVersion)) {
        return { ok: false, error: 'invalid_rules_version' };
    }
    return {
        ok: true,
        stake,
        clientNonce: body.clientNonce.toLowerCase(),
        rulesVersion: body.rulesVersion,
    };
}

/** Optional ticket id: absent -> null, malformed -> undefined (reject). */
export function parseTicketId(value) {
    if (value === undefined || value === null || value === '') return null;
    return isUuid(value) ? value.toLowerCase() : undefined;
}

export function parsePvpHistoryQuery(value = {}) {
    const rawLimit = value?.limit === undefined || value?.limit === '' ? 10 : value.limit;
    const rawOffset = value?.offset === undefined || value?.offset === '' ? 0 : value.offset;
    if (Array.isArray(rawLimit) || Array.isArray(rawOffset)) {
        return { ok: false, error: 'invalid_pagination' };
    }
    const limit = Number(rawLimit);
    const offset = Number(rawOffset);
    if (!Number.isInteger(limit) || limit < 1 || limit > 20
        || !Number.isInteger(offset) || offset < 0 || offset > 500) {
        return { ok: false, error: 'invalid_pagination' };
    }
    return { ok: true, limit, offset };
}

const str = (v) => (typeof v === 'string' && v.length <= 200 ? v : null);
const int = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Math.trunc(Number(v)) : null);
const bool = (v) => v === true;
const uuid = (v) => (isUuid(v) ? v : null);

function sanitizeTicket(t) {
    if (!t || typeof t !== 'object') return null;
    return {
        id: uuid(t.id),
        status: str(t.status),
        stake: int(t.stake),
        rulesVersion: str(t.rules_version_id),
        joinedAt: str(t.joined_at),
        horseWaitSeconds: int(t.horse_wait_seconds),
        horseEligibleAt: str(t.horse_eligible_at),
        secondsUntilHorseEligible: int(t.seconds_until_horse_eligible),
        horseFallbackEnabled: bool(t.horse_fallback_enabled),
        leaseExpiresAt: str(t.lease_expires_at),
        presence: str(t.presence),
        searchExpiresAt: str(t.search_expires_at),
        endedAt: str(t.ended_at),
        endReason: str(t.end_reason),
        matchKind: str(t.match_kind),
    };
}

function sanitizeMatch(m) {
    if (!m || typeof m !== 'object') return null;
    const o = m.opponent && typeof m.opponent === 'object' ? m.opponent : {};
    const isHorse = o.is_horse === true || o.kind === 'horse';
    return {
        id: uuid(m.id),
        kind: str(m.kind),
        status: str(m.status),
        stake: int(m.stake),
        rulesVersion: str(m.rules_version_id),
        questionCount: int(m.question_count),
        createdAt: str(m.created_at),
        activatedAt: str(m.activated_at),
        deadlineAt: str(m.deadline_at),
        mySide: int(m.my_side),
        mySessionId: uuid(m.my_session_id),
        me: { answered: int(m.me?.answered) ?? 0, finished: bool(m.me?.finished) },
        opponent: {
            kind: isHorse ? 'horse' : 'human',
            isHorse,
            // Every Smarter Horse is disclosed, whatever the database sent.
            label: isHorse ? 'Smarter Horse' : 'Player',
            displayName: str(o.display_name) || (isHorse ? 'Smarter Horse' : 'Player'),
            avatarUrl: str(o.avatar_url),
            answered: int(o.answered) ?? 0,
            finished: bool(o.finished),
        },
    };
}

function sanitizeResult(r) {
    if (!r || typeof r !== 'object') return null;
    return {
        outcome: str(r.outcome),
        decision: str(r.decision),
        forfeit: bool(r.forfeit),
        myCorrect: int(r.my_correct),
        opponentCorrect: int(r.opponent_correct),
        stake: int(r.stake),
        pot: int(r.pot),
        rake: int(r.rake),
        rakeOnWin: int(r.rake_on_win),
        payout: int(r.payout),
        net: int(r.net),
        receipts: (Array.isArray(r.receipts) ? r.receipts : []).slice(0, 4).map((x) => ({
            reference: str(x?.reference),
            kind: str(x?.kind),
            amount: int(x?.amount),
        })),
        stakeReference: str(r.stake_reference),
        settlementReference: str(r.settlement_reference),
        settledAt: str(r.settled_at),
    };
}

function sanitizeHistoryItem(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const opponent = value.opponent && typeof value.opponent === 'object' ? value.opponent : {};
    const isHorse = opponent.is_horse === true || opponent.kind === 'horse';
    return {
        settledAt: str(value.settled_at),
        rulesVersion: str(value.rules_version_id),
        opponent: {
            kind: isHorse ? 'horse' : 'human',
            isHorse,
            label: isHorse ? 'Smarter Horse' : 'Player',
            displayName: isHorse ? 'Smarter Horse' : (str(opponent.display_name) || 'Player'),
        },
        outcome: str(value.outcome),
        decision: str(value.decision),
        forfeit: bool(value.forfeit),
        myCorrect: int(value.my_correct),
        opponentCorrect: int(value.opponent_correct),
        stake: int(value.stake),
        pot: int(value.pot),
        rake: int(value.rake),
        payout: int(value.payout),
        net: int(value.net),
        receipts: (Array.isArray(value.receipts) ? value.receipts : []).slice(0, 4).map((receipt) => ({
            reference: str(receipt?.reference),
            kind: str(receipt?.kind),
            amount: int(receipt?.amount),
        })),
        stakeReference: str(value.stake_reference),
        settlementReference: str(value.settlement_reference),
    };
}

/** Allowlist projection of the database DTO; anything unknown is dropped. */
export function toPvpDto(raw) {
    const d = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    if (!PVP_STATES.includes(d.state)) {
        throw new Error('invalid_pvp_state');
    }
    const state = d.state;
    const ticket = sanitizeTicket(d.ticket);
    const match = sanitizeMatch(d.match);
    const result = sanitizeResult(d.result);
    if (TICKET_REQUIRED_STATES.has(state) && !ticket?.id) {
        throw new Error('invalid_pvp_dto');
    }
    if (MATCH_REQUIRED_STATES.has(state) && !match?.id) {
        throw new Error('invalid_pvp_dto');
    }
    if (state === 'result' && (
        !Array.isArray(d.result?.receipts)
        || !result?.outcome
        || !result.decision
        || !result.stakeReference
        || !result.settlementReference
        || !result.settledAt
    )) {
        throw new Error('invalid_pvp_dto');
    }
    const out = {
        success: true,
        engine: 'pvp-v2',
        serverNow: str(d.server_now),
        state,
        pollAfterMs: int(d.poll_after_ms),
        heartbeatSeconds: int(d.heartbeat_seconds),
        ticket,
        match,
        result,
    };
    if (typeof d.join === 'string') out.join = str(d.join);
    if (d.stake_mismatch === true) out.stakeMismatch = true;
    if (typeof d.cancel === 'string') out.cancel = str(d.cancel);
    return out;
}

/** Allowlist projection for the pre-commit rules and balance quote. */
export function toPvpQuoteDto(raw, { horsesAllowed = false } = {}) {
    const d = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    return {
        success: true,
        engine: 'pvp-v2',
        serverNow: str(d.serverNow),
        balance: int(d.balance) ?? 0,
        rulesVersion: str(d.rulesVersion),
        joinsEnabled: d.joinsEnabled === true,
        // The database owns the operational capability; the server-only
        // release flag is the final gate. Neither one can imply the other.
        horseFallbackEnabled: d.horseFallbackEnabled === true && horsesAllowed === true,
        stakes: (Array.isArray(d.stakes) ? d.stakes : []).slice(0, PVP_V2_STAKES.length).map((quote) => ({
            stake: int(quote?.stake),
            pot: int(quote?.pot),
            rake: int(quote?.rake),
            possibleReturn: int(quote?.possibleReturn),
            netWin: int(quote?.netWin),
        })).filter((quote) => PVP_V2_STAKES.includes(quote.stake)),
        questionCount: int(d.questionCount),
        humanFirst: d.humanFirst === true,
        horseWaitSeconds: {
            min: int(d.horseWaitSeconds?.min),
            max: int(d.horseWaitSeconds?.max),
        },
        horseLabel: 'Smarter Horse',
        cancellation: d.cancellation === 'search_only_before_match' ? d.cancellation : null,
        tie: d.tie === 'stake_refund' ? d.tie : null,
    };
}

/** Viewer-scoped, bounded settled history. Unknown and identity-bearing keys are dropped. */
export function toPvpHistoryDto(raw) {
    const d = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    return {
        success: true,
        engine: 'pvp-v2',
        serverNow: str(d.server_now),
        total: int(d.total) ?? 0,
        offset: int(d.offset) ?? 0,
        limit: int(d.limit) ?? 10,
        items: (Array.isArray(d.items) ? d.items : [])
            .slice(0, 20)
            .map(sanitizeHistoryItem)
            .filter(Boolean),
    };
}

/** HTTP status for a database refusal code. */
export function pvpErrorStatus(code) {
    switch (code) {
        case 'invalid_request': case 'invalid_stake': case 'invalid_client_nonce': case 'invalid_ticket_id':
        case 'invalid_rules_version': case 'invalid_pagination':
            return 400;
        case 'insufficient_diamonds': return 402;
        case 'not_your_match': return 403;
        case 'ticket_not_found': case 'match_not_found': case 'profile_not_found': return 404;
        case 'legacy_ticket_present': case 'rules_quote_stale': case 'match_quarantined': case 'match_not_due':
        case 'match_not_settleable': case 'ticket_not_eligible_for_horse': case 'tickets_not_claimable':
            return 409;
        case 'pvp_joins_paused': case 'pvp_configuration_unavailable': case 'rules_unavailable': case 'horse_capacity':
        case 'horse_contention': case 'no_eligible_horse': case 'treasury_unavailable':
        case 'match_create_failed': case 'settlement_failed': case 'gross_pool_mismatch':
            return 503;
        default: return 500;
    }
}

/**
 * Milliseconds a status poll should wait server-side so the Smarter Horse
 * claim happens at the stored deadline rather than at the next client poll.
 * Only for a live searching ticket with horse fallback enabled.
 */
export function deadlineAlignDelayMs(dto, maxMs = PVP_DEADLINE_ALIGN_MAX_MS) {
    const t = dto?.ticket;
    if (dto?.state !== 'searching' || !t || t.presence !== 'live' || t.horseFallbackEnabled !== true) return 0;
    const now = Date.parse(dto.serverNow);
    const eligible = Date.parse(t.horseEligibleAt);
    if (!Number.isFinite(now) || !Number.isFinite(eligible)) return 0;
    const wait = eligible - now;
    return wait > 0 && wait <= maxMs ? wait + 25 : 0;
}
