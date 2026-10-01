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
    return { ok: true, stake, clientNonce: body.clientNonce.toLowerCase() };
}

/** Optional ticket id: absent -> null, malformed -> undefined (reject). */
export function parseTicketId(value) {
    if (value === undefined || value === null || value === '') return null;
    return isUuid(value) ? value.toLowerCase() : undefined;
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

/** Allowlist projection of the database DTO; anything unknown is dropped. */
export function toPvpDto(raw) {
    const d = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const state = PVP_STATES.includes(d.state) ? d.state : 'idle';
    const out = {
        success: true,
        engine: 'pvp-v2',
        serverNow: str(d.server_now),
        state,
        pollAfterMs: int(d.poll_after_ms),
        heartbeatSeconds: int(d.heartbeat_seconds),
        ticket: sanitizeTicket(d.ticket),
        match: sanitizeMatch(d.match),
        result: sanitizeResult(d.result),
    };
    if (typeof d.join === 'string') out.join = str(d.join);
    if (d.stake_mismatch === true) out.stakeMismatch = true;
    if (typeof d.cancel === 'string') out.cancel = str(d.cancel);
    return out;
}

/** HTTP status for a database refusal code. */
export function pvpErrorStatus(code) {
    switch (code) {
        case 'invalid_request': case 'invalid_stake': case 'invalid_client_nonce': case 'invalid_ticket_id':
            return 400;
        case 'insufficient_diamonds': return 402;
        case 'not_your_match': return 403;
        case 'ticket_not_found': case 'match_not_found': return 404;
        case 'legacy_ticket_present': return 409;
        case 'pvp_joins_paused': case 'rules_unavailable': return 503;
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
