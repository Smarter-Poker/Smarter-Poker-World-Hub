export const TOURNAMENT_API_ACTIONS = Object.freeze([
    'schedule',
    'summary',
    'enter',
    'field',
    'bracket',
    'match',
    'my-run',
    'play',
    'results',
    'receipt',
    'history',
]);

export const TOURNAMENT_TABS = Object.freeze([
    { id: 'run', label: 'My Run' },
    { id: 'bracket', label: 'Bracket' },
    { id: 'field', label: 'Field' },
    { id: 'results', label: 'Results' },
    { id: 'receipt', label: 'Receipt' },
    { id: 'history', label: 'History' },
]);

const ACTIVE_STATES = new Set(['held', 'live', 'settling']);

/**
 * Keeps each independently rendered tournament lane latest-response-wins.
 * Aborting fetches is still useful for transport cleanup, but it is not an
 * authority boundary: a transport can resolve after abort or two callers can
 * legitimately overlap.  Only the newest lease for a lane may commit state.
 */
export function createTournamentRequestAuthority() {
    const generations = new Map();

    return Object.freeze({
        begin(lane) {
            const key = String(lane || '').trim();
            if (!key) throw new Error('tournament_request_lane_required');
            const generation = (generations.get(key) || 0) + 1;
            generations.set(key, generation);
            return Object.freeze({ lane: key, generation });
        },
        isCurrent(lease) {
            return Boolean(
                lease
                && typeof lease.lane === 'string'
                && Number.isInteger(lease.generation)
                && generations.get(lease.lane) === lease.generation,
            );
        },
        invalidate(lanes) {
            const keys = Array.isArray(lanes) ? lanes : [lanes];
            for (const lane of keys) {
                const key = String(lane || '').trim();
                if (key) generations.set(key, (generations.get(key) || 0) + 1);
            }
        },
        invalidateAll() {
            for (const key of generations.keys()) {
                generations.set(key, (generations.get(key) || 0) + 1);
            }
        },
    });
}

export function createTournamentActionLease(authority, tournamentId) {
    if (!authority || typeof authority.begin !== 'function' || !tournamentId) {
        throw new Error('tournament_action_context_required');
    }
    return Object.freeze({
        tournamentId,
        requestLease: authority.begin('action'),
    });
}

export function isTournamentActionCurrent(authority, actionLease, currentTournamentId) {
    return Boolean(
        authority
        && actionLease?.tournamentId
        && actionLease.tournamentId === currentTournamentId
        && authority.isCurrent(actionLease.requestLease),
    );
}

export function pendingAfterTournamentContextSupersession(pending) {
    return pending === 'history-receipt' ? '' : pending;
}

const ERROR_COPY = Object.freeze({
    authentication_required: 'Sign In To Open Your Tournament Run.',
    insufficient_diamonds: 'Your Wallet Does Not Have Enough Diamonds For This Entry.',
    vip_required: 'This Tournament Requires An Eligible VIP Account.',
    tournament_not_found: 'That Tournament Is No Longer Available.',
    matchup_not_found: 'That Matchup Is No Longer Available.',
    not_entered: 'You Have Not Entered This Tournament.',
    no_session: 'No Open Round Session Was Found.',
    no_live_seat: 'Your Next Tournament Seat Is Not Open Yet.',
    registration_closed: 'Registration Has Closed For This Tournament.',
    registration_not_open: 'Registration Is Not Open Yet.',
    tournament_full: 'The Human Field Is Full.',
    round_not_open: 'Your Round Is Not Open Yet.',
    round_deadline_passed: 'The Server Round Deadline Has Passed.',
    position_out_of_order: 'The Previous Question Must Close Before The Next One Opens.',
    question_not_open: 'That Question Is Not Open Yet.',
    answer_late: 'The Server Shot Clock Closed Before That Answer Arrived.',
    session_closed: 'This Round Session Is Closed.',
    session_expired: 'This Round Session Has Expired.',
    tournaments_temporarily_unavailable: 'Nightly Tournaments Are Not Available Yet.',
    rate_limited: 'Too Many Requests Reached The Tournament Desk. Try Again Shortly.',
    offline: 'Your Device Is Offline. Reconnect To Resume From The Server.',
    internal_error: 'The Tournament Desk Could Not Complete That Request.',
});

function asTime(value) {
    const parsed = Date.parse(value || '');
    return Number.isFinite(parsed) ? parsed : null;
}

export function exactDiamonds(value) {
    const amount = Number(value);
    return Number.isFinite(amount) ? Math.trunc(amount).toLocaleString('en-US') : '0';
}

export function participantLabel(participant, fallback = 'Player') {
    if (!participant) return fallback;
    const name = String(participant.displayName || '').trim();
    if (participant.participantKind === 'horse') {
        return name && name !== 'Smarter Horse' ? `${name} (Smarter Horse)` : 'Smarter Horse';
    }
    return name || fallback;
}

export function tournamentErrorMessage(code) {
    const key = String(code || 'internal_error').trim();
    return ERROR_COPY[key] || ERROR_COPY.internal_error;
}

const RETRYABLE_ENTRY_ERRORS = new Set([
    'internal_error',
    'rate_limited',
    'offline',
    'ledger_refused',
    'tournaments_temporarily_unavailable',
]);

export function tournamentEntryDialogAction(code) {
    if (code === 'insufficient_diamonds') return 'diamonds';
    return RETRYABLE_ENTRY_ERRORS.has(code) ? 'retry' : 'close';
}

export function serverNowMs(serverTime, receivedAtMs, clientNowMs = Date.now()) {
    const server = asTime(serverTime);
    if (server === null || !Number.isFinite(receivedAtMs)) return clientNowMs;
    return server + Math.max(0, clientNowMs - receivedAtMs);
}

export function secondsUntil(target, nowMs) {
    const targetMs = asTime(target);
    if (targetMs === null || !Number.isFinite(nowMs)) return null;
    return Math.max(0, Math.ceil((targetMs - nowMs) / 1000));
}

export function formatCountdown(seconds) {
    if (!Number.isFinite(seconds)) return 'Awaiting Server Time';
    const whole = Math.max(0, Math.trunc(seconds));
    const days = Math.floor(whole / 86400);
    const hours = Math.floor((whole % 86400) / 3600);
    const minutes = Math.floor((whole % 3600) / 60);
    const secs = whole % 60;
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
    return `${minutes}m ${String(secs).padStart(2, '0')}s`;
}

export function chooseTournamentInstance(instances, requestedId = null) {
    const list = Array.isArray(instances) ? instances.filter(Boolean) : [];
    if (requestedId) {
        const requested = list.find(item => item.tournamentId === requestedId);
        if (requested) return requested;
    }
    return list.find(item => item.viewer?.entered && ACTIVE_STATES.has(item.state))
        || list.find(item => item.viewer?.entered && item.state !== 'settled' && item.state !== 'cancelled')
        || list.find(item => ACTIVE_STATES.has(item.state))
        || list.find(item => item.state === 'registration')
        || list.find(item => item.state === 'scheduled')
        || list[0]
        || null;
}

export function tournamentViewState({ tournament, myRun, receipt, session, nowMs }) {
    if (!tournament) return 'no-event';
    if (tournament.state === 'cancelled') {
        if (receipt?.refund || myRun?.entrant?.entryState === 'refunded') return 'refunded';
        return tournament.viewer?.entered || myRun?.entered ? 'refund' : 'cancelled';
    }
    if (myRun?.entrant?.status === 'champion') return receipt?.payout ? 'paid' : 'champion';
    if (myRun?.entrant?.status === 'eliminated') return 'eliminated';
    if (session?.status === 'open') return 'playing';
    if (myRun?.current?.phase === 'playing') return 'play';
    if (myRun?.current?.phase === 'countdown') return 'countdown';
    if (myRun?.current?.phase === 'waiting_for_opponent') return 'waiting';
    if (myRun?.current?.phase === 'deciding') return 'settling';
    if (myRun?.current?.phase === 'waiting_for_round') {
        const last = Array.isArray(myRun.history) ? myRun.history[myRun.history.length - 1] : null;
        return last?.result === 'won' || last?.result === 'bye' ? 'advance' : 'waiting';
    }
    if (tournament.state === 'settling') return 'settling';
    if (tournament.state === 'settled') return receipt?.payout ? 'paid' : 'settled';
    if (myRun?.entered || tournament.viewer?.entered) return 'entered';
    if (Number(tournament.humanSeatsRemaining) <= 0) return 'full';
    if (tournament.state === 'held') return 'countdown';
    if (tournament.state === 'live') return 'closed';
    if (tournament.state === 'registration') {
        const closesAt = asTime(tournament.registrationClosesAt);
        return closesAt !== null && Number.isFinite(nowMs) && nowMs >= closesAt ? 'closed' : 'open';
    }
    if (tournament.state === 'scheduled') {
        const opensAt = asTime(tournament.registrationOpensAt);
        return opensAt !== null && Number.isFinite(nowMs) && nowMs >= opensAt ? 'open' : 'not-open';
    }
    return tournament.state || 'scheduled';
}

export function firstOpenQuestion(session) {
    return (session?.questions || []).find(question => (
        question?.state === 'unanswered'
        && question?.id
        && typeof question?.question === 'string'
        && Array.isArray(question?.options)
    )) || null;
}

export function nextLockedPosition(session) {
    const question = (session?.questions || []).find(item => item?.state === 'locked');
    return Number.isInteger(question?.position) ? question.position : null;
}

export function mergeOpenedQuestion(session, question) {
    if (!session || !question) return session;
    return {
        ...session,
        questions: (session.questions || []).map(item => (
            item?.position === question.position ? { ...item, ...question } : item
        )),
    };
}

export function sessionProgress(session) {
    const questions = Array.isArray(session?.questions) ? session.questions : [];
    const complete = questions.filter(question => ['answered', 'timeout'].includes(question?.state)).length;
    return { complete, total: Number(session?.questionCount) || questions.length };
}

export function currentPathMatchupIds(myRun) {
    const ids = new Set();
    for (const row of myRun?.history || []) {
        if (row?.matchupId) ids.add(row.matchupId);
    }
    if (myRun?.current?.matchupId) ids.add(myRun.current.matchupId);
    return ids;
}

export function registrationAction(tournament, myRun, nowMs) {
    const state = tournamentViewState({ tournament, myRun, nowMs });
    if (['entered', 'play', 'playing', 'waiting', 'advance', 'countdown', 'settling', 'champion', 'eliminated', 'paid', 'refunded'].includes(state)) {
        return null;
    }
    if (state === 'open') return { kind: 'enter', label: `Enter For ${exactDiamonds(tournament.entryFee)} Diamonds` };
    if (state === 'full') return { kind: 'none', label: 'Human Field Full' };
    if (state === 'not-open') return { kind: 'none', label: 'Registration Not Open' };
    return { kind: 'none', label: 'Registration Closed' };
}
