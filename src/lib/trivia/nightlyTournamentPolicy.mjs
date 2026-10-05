/**
 * Pure request/response policy for the Phase 6 nightly tournament API
 * (/api/trivia/nightly/[action]). No I/O here: the route factory in
 * nightlyTournamentApiHandler.js does auth, rate limiting and the one
 * service-role RPC per request. The database owns every decision.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const NIGHTLY_ACTIONS = Object.freeze({
    schedule: { methods: ['GET'], auth: 'optional', limit: 'read' },
    summary: { methods: ['GET'], auth: 'optional', limit: 'read' },
    enter: { methods: ['POST'], auth: 'required', limit: 'write' },
    field: { methods: ['GET'], auth: 'optional', limit: 'read' },
    bracket: { methods: ['GET'], auth: 'optional', limit: 'read' },
    match: { methods: ['GET'], auth: 'optional', limit: 'read' },
    'my-run': { methods: ['GET'], auth: 'required', limit: 'read' },
    play: { methods: ['POST'], auth: 'required', limit: 'write' },
    results: { methods: ['GET'], auth: 'optional', limit: 'read' },
    receipt: { methods: ['GET'], auth: 'required', limit: 'read' },
    history: { methods: ['GET'], auth: 'required', limit: 'read' },
});

export const PLAY_ACTIONS = Object.freeze(['open', 'question', 'answer', 'finish', 'view']);

/** Keys that must never reach a browser (answer keys, horse plans, secrets). */
export const FORBIDDEN_DTO_KEYS = Object.freeze([
    'correct_index', 'correctIndex', 'chosen_original_index', 'planned_correct', 'horse_plan_key',
    'permutations', 'revision_id', 'revisionId', 'seed_secret', 'secret',
]);

const ERROR_STATUS = Object.freeze({
    invalid_request: 400, invalid_tournament_id: 400, invalid_client_nonce: 400, invalid_action: 400,
    invalid_bracket_capacity: 400, invalid_horse_target: 400, reason_and_operator_required: 400,
    start_must_be_in_future: 400,
    invalid_display_index: 400, question_not_in_session: 400, legacy_submission_shape: 400,
    client_timing_not_accepted: 400, invalid_matchup_id: 400, invalid_position: 400,
    authentication_required: 401, not_your_session: 401,
    insufficient_diamonds: 402,
    vip_required: 403, horses_enter_through_population: 403,
    tournament_not_found: 404, matchup_not_found: 404, not_entered: 404, no_session: 404, no_live_seat: 404,
    profile_not_found: 404,
    registration_closed: 409, registration_not_open: 409, tournament_full: 409, horse_target_reached: 409,
    round_not_open: 409,
    round_deadline_passed: 409, no_open_session: 409, seat_has_open_session: 409,
    position_out_of_order: 409, question_not_open: 409, answer_late: 409, session_closed: 409,
    session_expired: 409,
    tournament_entry_retired: 410,
    ledger_refused: 503, not_engine_v3: 503, not_shot_clock: 503,
    tournaments_temporarily_unavailable: 503,
});

export function normalizeNightlyError(code) {
    if (code === 'insufficient_funds') return 'insufficient_diamonds';
    return typeof code === 'string' && /^[a-z_]{3,64}$/.test(code) ? code : 'internal_error';
}

export function nightlyErrorStatus(code) {
    return ERROR_STATUS[code] || 500;
}

function uuidOrNull(value) {
    return typeof value === 'string' && UUID_RE.test(value) ? value.toLowerCase() : null;
}

function intIn(value, min, max, fallback) {
    if (value === undefined || value === null || value === '') return fallback;
    const n = Number(value);
    if (!Number.isInteger(n) || n < min || n > max) return undefined;
    return n;
}

/**
 * Builds the single RPC call for an action. `userId` comes from the verified
 * session only (never from the request body). Returns {ok, rpc, args} or
 * {ok:false, error}.
 */
export function buildNightlyRpc(action, input = {}, userId = null) {
    const spec = NIGHTLY_ACTIONS[action];
    if (!spec) return { ok: false, error: 'invalid_action' };
    const tournamentId = uuidOrNull(input.tournamentId ?? input.tournament_id);
    const needsTournament = !['schedule', 'history'].includes(action);
    if (needsTournament && !tournamentId) return { ok: false, error: 'invalid_tournament_id' };
    const offset = intIn(input.offset, 0, 100000, 0);
    if (offset === undefined) return { ok: false, error: 'invalid_request' };

    switch (action) {
        case 'schedule': {
            const days = intIn(input.days, 1, 14, 8);
            if (days === undefined) return { ok: false, error: 'invalid_request' };
            return { ok: true, rpc: 'trivia_tournament_schedule_v1', args: { p_user_id: userId, p_days: days } };
        }
        case 'summary':
            return { ok: true, rpc: 'trivia_tournament_summary_v1', args: { p_tournament_id: tournamentId, p_user_id: userId } };
        case 'enter': {
            const nonce = input.clientNonce ?? input.client_nonce ?? null;
            if (nonce !== null && (typeof nonce !== 'string' || nonce.length < 8 || nonce.length > 128)) {
                return { ok: false, error: 'invalid_client_nonce' };
            }
            return { ok: true, rpc: 'trivia_tournament_enter', args: { p_tournament_id: tournamentId, p_user_id: userId, p_client_nonce: nonce } };
        }
        case 'field': {
            const limit = intIn(input.limit, 1, 200, 50);
            const q = typeof input.q === 'string' ? input.q.trim().slice(0, 60) : null;
            const kind = ['human', 'horse'].includes(input.kind) ? input.kind : null;
            if (limit === undefined) return { ok: false, error: 'invalid_request' };
            return { ok: true, rpc: 'trivia_tournament_field_v2', args: { p_tournament_id: tournamentId, p_user_id: userId, p_offset: offset, p_limit: limit, p_search: q || null, p_kind: kind } };
        }
        case 'bracket': {
            const round = intIn(input.round, 1, 9, 1);
            const limit = intIn(input.limit, 1, 256, 64);
            if (round === undefined || limit === undefined) return { ok: false, error: 'invalid_request' };
            return { ok: true, rpc: 'trivia_tournament_bracket_v2', args: { p_tournament_id: tournamentId, p_user_id: userId, p_round: round, p_offset: offset, p_limit: limit } };
        }
        case 'match': {
            const matchupId = uuidOrNull(input.matchupId ?? input.matchup_id);
            if (!matchupId) return { ok: false, error: 'invalid_matchup_id' };
            return { ok: true, rpc: 'trivia_tournament_match_v2', args: { p_tournament_id: tournamentId, p_matchup_id: matchupId, p_user_id: userId } };
        }
        case 'my-run':
            return { ok: true, rpc: 'trivia_tournament_my_run_v1', args: { p_tournament_id: tournamentId, p_user_id: userId } };
        case 'results': {
            const limit = intIn(input.limit, 1, 200, 50);
            const kind = ['human', 'horse'].includes(input.kind) ? input.kind : null;
            if (limit === undefined) return { ok: false, error: 'invalid_request' };
            return { ok: true, rpc: 'trivia_tournament_results_v2', args: { p_tournament_id: tournamentId, p_user_id: userId, p_offset: offset, p_limit: limit, p_kind: kind } };
        }
        case 'receipt':
            return { ok: true, rpc: 'trivia_tournament_receipt_v1', args: { p_tournament_id: tournamentId, p_user_id: userId } };
        case 'history': {
            const limit = intIn(input.limit, 1, 100, 20);
            if (limit === undefined) return { ok: false, error: 'invalid_request' };
            return { ok: true, rpc: 'trivia_tournament_history_v1', args: { p_user_id: userId, p_offset: offset, p_limit: limit } };
        }
        case 'play': {
            const play = input.action;
            if (!PLAY_ACTIONS.includes(play)) return { ok: false, error: 'invalid_action' };
            // Client timing and self-graded fields are never accepted.
            for (const k of ['correct', 'score', 'answeredAt', 'answered_at', 'elapsedMs', 'elapsed_ms', 'correctIndex']) {
                if (Object.prototype.hasOwnProperty.call(input, k)) return { ok: false, error: 'client_timing_not_accepted' };
            }
            const base = { p_tournament_id: tournamentId, p_user_id: userId };
            if (play === 'open') return { ok: true, rpc: 'trivia_tournament_play_open', args: base };
            if (play === 'view') return { ok: true, rpc: 'trivia_tournament_play_view', args: base };
            if (play === 'finish') return { ok: true, rpc: 'trivia_tournament_play_finish', args: base };
            if (play === 'question') {
                const position = intIn(input.position, 1, 20, undefined);
                if (position === undefined) return { ok: false, error: 'invalid_position' };
                return { ok: true, rpc: 'trivia_tournament_play_question', args: { ...base, p_position: position } };
            }
            const questionId = uuidOrNull(input.questionId ?? input.question_id);
            const displayIndex = intIn(input.displayIndex ?? input.display_index, -1, 7, undefined);
            const nonce = input.clientNonce ?? input.client_nonce ?? null;
            if (!questionId) return { ok: false, error: 'question_not_in_session' };
            if (displayIndex === undefined) return { ok: false, error: 'invalid_display_index' };
            if (nonce !== null && !uuidOrNull(nonce)) return { ok: false, error: 'invalid_client_nonce' };
            return {
                ok: true,
                rpc: 'trivia_tournament_play_answer',
                args: { ...base, p_question_id: questionId, p_display_index: displayIndex, p_client_nonce: nonce ? nonce.toLowerCase() : null },
            };
        }
        default:
            return { ok: false, error: 'invalid_action' };
    }
}

/** Deep scan for keys that must never be forwarded. Returns the offending paths. */
export function findForbiddenKeys(value, path = '$', out = []) {
    if (Array.isArray(value)) {
        value.forEach((item, i) => findForbiddenKeys(item, `${path}[${i}]`, out));
    } else if (value && typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) {
            if (FORBIDDEN_DTO_KEYS.includes(k)) out.push(`${path}.${k}`);
            findForbiddenKeys(v, `${path}.${k}`, out);
        }
    }
    return out;
}

const own = (value, key) => value && typeof value === 'object'
    && !Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, key);

function pick(value, keys) {
    const out = {};
    for (const key of keys) if (own(value, key)) out[key] = value[key];
    return out;
}

function list(value, projector) {
    return (Array.isArray(value) ? value : []).map(projector);
}

function projectFormat(value) {
    return pick(value, ['questionsPerRound', 'shotClockSeconds', 'roundWindowSeconds',
        'transitionSeconds', 'tieBreak', 'horsesDisclosed']);
}

function projectViewer(value) {
    return value == null ? null : pick(value, ['entered', 'entrantId', 'entryReference', 'entryState']);
}

function projectTournament(value) {
    const out = pick(value, ['tournamentId', 'name', 'scheduleKind', 'officialTimezone', 'localDate',
        'localStartTime', 'startsAt', 'plannedEndAt', 'registrationOpensAt', 'registrationClosesAt',
        'state', 'rulesVersionId', 'rulesProvisional', 'currency', 'entryFee', 'rakePerEntry',
        'bracketCapacity', 'horseTarget', 'horsesEntered', 'humansEntered', 'humanSeatsRemaining',
        'estimatedPrizePool', 'terminalReason']);
    if (own(value, 'format')) out.format = projectFormat(value.format);
    if (own(value, 'viewer')) out.viewer = projectViewer(value.viewer);
    return out;
}

function projectSeat(value) {
    return pick(value, ['seatNo', 'entrantId', 'displayName', 'participantKind', 'seed', 'state',
        'answered', 'correct', 'answerTimeMs']);
}

function projectMatchup(value) {
    const out = pick(value, ['matchupId', 'roundNumber', 'slot', 'status', 'isBye',
        'winnerEntrantId', 'decidedReason', 'decidedAt']);
    if (own(value, 'seats')) out.seats = list(value.seats, projectSeat);
    return out;
}

function projectEntrant(value) {
    return pick(value, ['entrantId', 'displayName', 'participantKind', 'seed', 'status',
        'entryState', 'eliminatedRound', 'finalRank', 'rank', 'placementTier', 'payout']);
}

function projectQuestion(value) {
    return pick(value, ['position', 'state', 'id', 'question', 'options', 'category', 'difficulty',
        'openedAt', 'deadlineAt']);
}

function projectSession(value) {
    const out = pick(value, ['success', 'sessionId', 'mode', 'engine', 'status', 'resumed', 'expiresAt',
        'questionCount', 'entryCost', 'entryState']);
    if (own(value, 'questions')) out.questions = list(value.questions, projectQuestion);
    return out;
}

function projectRoundHistory(value) {
    const out = pick(value, ['roundNumber', 'matchupId', 'result', 'decidedReason']);
    if (own(value, 'mine')) out.mine = value.mine == null ? null : projectSeat(value.mine);
    if (own(value, 'opponent')) out.opponent = value.opponent == null ? null : projectSeat(value.opponent);
    return out;
}

function projectCurrentRun(value) {
    const out = pick(value, ['roundNumber', 'matchupId', 'opensAt', 'deadlineAt', 'phase']);
    if (own(value, 'seat')) out.seat = value.seat == null ? null : projectSeat(value.seat);
    if (own(value, 'opponent')) out.opponent = value.opponent == null ? null : projectSeat(value.opponent);
    return out;
}

function projectReceiptLeg(value, keys) {
    return value == null ? null : pick(value, keys);
}

function projectPlay(value) {
    const out = pick(value, ['success', 'round', 'matchup_id', 'deadline_at', 'seat_finished',
        'matchup_resolved', 'sessionId', 'position', 'recorded', 'duplicate', 'sequence',
        'storedDisplayIndex', 'outcome', 'wasCorrect', 'correctDisplayIndex', 'explanation',
        'total', 'voided', 'graded_total', 'answered', 'correct', 'score', 'answer_time_ms_total',
        'status', 'expiresAt', 'questionCount', 'entryCost', 'entryState']);
    if (own(value, 'session')) out.session = projectSession(value.session);
    if (own(value, 'question')) out.question = value.question == null ? null : projectQuestion(value.question);
    if (own(value, 'questions')) out.questions = list(value.questions, projectQuestion);
    if (own(value, 'per_question')) {
        out.per_question = list(value.per_question, (item) => pick(item,
            ['position', 'question_id', 'outcome', 'correct', 'display_index', 'answered_at', 'elapsed_ms']));
    }
    if (own(value, 'sequence')) {
        if (Array.isArray(value.sequence)) {
            out.sequence = list(value.sequence, (item) => pick(item, ['questionIndex', 'result']));
        } else if (Number.isInteger(value.sequence)) {
            out.sequence = value.sequence;
        } else {
            delete out.sequence;
        }
    }
    return out;
}

/**
 * Action-specific allowlist projection. The SQL contract is answer-free today;
 * this projector makes that property durable when a database function gains a
 * new column tomorrow. Unknown keys are dropped even when they are nested.
 */
export function projectNightlyDto(action, value) {
    const d = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    switch (action) {
        case 'schedule': {
            const out = pick(d, ['success', 'serverTime', 'officialTimezone']);
            out.instances = list(d.instances, projectTournament);
            return out;
        }
        case 'summary': {
            const out = pick(d, ['success', 'serverTime', 'currentRound']);
            if (own(d, 'tournament')) out.tournament = projectTournament(d.tournament);
            if (own(d, 'field')) out.field = pick(d.field,
                ['entrants', 'humans', 'horses', 'bracketSize', 'rounds', 'byes', 'grossEntryTotal',
                    'seedCommitment', 'seedReveal']);
            if (own(d, 'rounds')) out.rounds = list(d.rounds, (item) => pick(item,
                ['roundNumber', 'status', 'opensAt', 'deadlineAt', 'closedAt', 'matchups', 'resolved']));
            if (own(d, 'result')) {
                out.result = pick(d.result, ['grossPool', 'rake', 'prizePool', 'humanPrizeTotal',
                    'horsePrizeTotal', 'settledAt']);
                if (own(d.result, 'champion')) out.result.champion = d.result.champion == null
                    ? null : pick(d.result.champion, ['displayName', 'participantKind', 'rank', 'score', 'payout']);
            }
            return out;
        }
        case 'enter':
            return pick(d, ['success', 'duplicate', 'entrant_id', 'entry_reference', 'entry_fee', 'journal_id']);
        case 'field': {
            const out = pick(d, ['success', 'total', 'offset', 'limit']);
            out.items = list(d.items, projectEntrant);
            return out;
        }
        case 'bracket': {
            const out = pick(d, ['success', 'roundNumber', 'bracketSize', 'roundCount', 'total', 'offset', 'limit']);
            out.items = list(d.items, projectMatchup);
            return out;
        }
        case 'match': {
            const out = pick(d, ['success']);
            if (own(d, 'matchup')) out.matchup = projectMatchup(d.matchup);
            return out;
        }
        case 'my-run': {
            const out = pick(d, ['success', 'entered', 'serverTime']);
            if (own(d, 'entrant')) out.entrant = d.entrant == null ? null : projectEntrant(d.entrant);
            if (own(d, 'current')) out.current = d.current == null ? null : projectCurrentRun(d.current);
            out.history = list(d.history, projectRoundHistory);
            return out;
        }
        case 'play':
            return projectPlay(d);
        case 'results': {
            const out = pick(d, ['success', 'settled', 'total', 'offset', 'limit']);
            out.items = list(d.items, (item) => pick(item, ['rank', 'placementTier', 'displayName',
                'participantKind', 'score', 'payout', 'eliminatedRound', 'matchesWon']));
            return out;
        }
        case 'receipt': {
            const out = pick(d, ['success', 'tournamentId']);
            if (own(d, 'entry')) out.entry = projectReceiptLeg(d.entry,
                ['reference', 'amount', 'fundingSource', 'at', 'journalId']);
            if (own(d, 'refund')) out.refund = projectReceiptLeg(d.refund, ['reference', 'amount', 'at']);
            if (own(d, 'payout')) out.payout = projectReceiptLeg(d.payout, ['reference', 'amount', 'rank']);
            if (own(d, 'settlement')) out.settlement = projectReceiptLeg(d.settlement,
                ['state', 'settlementId', 'idempotencyKey']);
            return out;
        }
        case 'history': {
            const out = pick(d, ['success', 'total']);
            out.items = list(d.items, (item) => pick(item, ['tournamentId', 'name', 'localDate', 'state',
                'rank', 'placementTier', 'payout', 'entryState', 'eliminatedRound', 'entrants']));
            return out;
        }
        default:
            return {};
    }
}
