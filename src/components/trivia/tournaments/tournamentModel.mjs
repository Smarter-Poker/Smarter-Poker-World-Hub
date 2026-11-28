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
    { id: 'championship', label: 'Championship' },
    { id: 'challenges', label: 'Duels' },
    { id: 'club-nights', label: 'Club Nights' },
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

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function spectatorEntityKey(entity) {
    if (!entity || typeof entity !== 'object') return '';
    const raw = entity.entrantId ?? entity.userId ?? entity.playerId ?? entity.id ?? entity.displayName ?? '';
    return String(raw).trim();
}

function spectatorEntityIsHorse(entity) {
    if (!entity || typeof entity !== 'object') return false;
    return entity.participantKind === 'horse' || entity.isHorse === true;
}

function resolveSpectatorRoundLabel(matchup, totalRounds, semiRound, finalRound) {
    const round = Number(matchup?.roundNumber || 0);
    const rawSlot = matchup?.slot;
    const slot = rawSlot !== null && rawSlot !== undefined && rawSlot !== '' && Number.isFinite(Number(rawSlot))
        ? Number(rawSlot) + 1
        : 1;
    if (totalRounds >= 1 && round === finalRound) return 'Championship Final';
    if (totalRounds >= 2 && round === semiRound) return `Semifinal ${slot}`;
    return `Round ${round || 1} Match ${slot}`;
}

function formatSpectatorScoreLabel(seat, fallbackScore = null) {
    if (seat?.state === 'bye') return 'Bye';
    if (seat && seat.correct !== null && seat.correct !== undefined) {
        const correct = exactDiamonds(seat.correct);
        if (seat.answered !== null && seat.answered !== undefined) {
            return `${correct} Correct | ${exactDiamonds(seat.answered)} Answered`;
        }
        return `${correct} Correct`;
    }
    if (seat && seat.answered !== null && seat.answered !== undefined) {
        return `${exactDiamonds(seat.answered)} Answered`;
    }
    if (fallbackScore !== null && fallbackScore !== undefined && Number.isFinite(Number(fallbackScore))) {
        return `${exactDiamonds(fallbackScore)} Correct`;
    }
    return 'Pending';
}

function normalizeSpectatorContext(spectatorData) {
    if (!spectatorData || typeof spectatorData !== 'object') {
        return {
            matchups: [],
            champion: null,
            standings: [],
            totalRounds: 0,
            currentRound: 1,
            semiRound: 1,
            finalRound: 1,
            tournamentState: '',
        };
    }

    const rawMatchups = Array.isArray(spectatorData)
        ? spectatorData
        : Array.isArray(spectatorData.featuredMatchups)
            ? spectatorData.featuredMatchups
            : Array.isArray(spectatorData.matchups)
                ? spectatorData.matchups
                : Array.isArray(spectatorData.bracket?.items)
                    ? spectatorData.bracket.items
                    : [];

    const matchups = rawMatchups.filter(Boolean);
    const champion = spectatorData.champion || spectatorData.summary?.result?.champion || null;
    const standings = Array.isArray(spectatorData.standings)
        ? spectatorData.standings.filter(Boolean)
        : Array.isArray(spectatorData.summary?.standings)
            ? spectatorData.summary.standings.filter(Boolean)
            : [];

    const maxMatchupRound = matchups.reduce((acc, m) => Math.max(acc, Number(m?.roundNumber || 0)), 0);
    const totalRounds = Number(
        spectatorData.totalRounds
        || spectatorData.summary?.field?.rounds
        || spectatorData.tournament?.format?.rounds
        || maxMatchupRound
        || 0,
    );
    const currentRound = Number(
        spectatorData.currentRound
        || spectatorData.summary?.currentRound
        || spectatorData.tournament?.currentRound
        || maxMatchupRound
        || 1,
    );
    const semiRound = Number(spectatorData.semiRound || (totalRounds >= 2 ? totalRounds - 1 : 1));
    const finalRound = Number(spectatorData.finalRound || (totalRounds >= 1 ? totalRounds : currentRound));
    const tournamentState = String(spectatorData.tournament?.state || spectatorData.state || '').trim().toLowerCase();

    return {
        matchups,
        champion,
        standings,
        totalRounds,
        currentRound,
        semiRound,
        finalRound,
        tournamentState,
    };
}

function deriveSeatStatus(seat, matchup, championKey, finalRound, totalRounds, tournamentState) {
    const key = spectatorEntityKey(seat);
    if (championKey && key && key === championKey) return 'champion';

    const matchStatus = String(matchup?.status || 'pending').trim().toLowerCase();
    const matchRound = Number(matchup?.roundNumber || 0);
    if (matchStatus === 'resolved') {
        const winnerKey = String(matchup?.winnerEntrantId || '').trim();
        if (winnerKey && key && winnerKey === key) {
            if (tournamentState === 'settled' && totalRounds >= 1 && matchRound === finalRound) {
                return 'champion';
            }
            return 'advanced';
        }
        if (winnerKey) return 'eliminated';
        return 'pending';
    }
    if (matchStatus === 'live' || matchStatus === 'playing' || matchStatus === 'ready') {
        return 'live';
    }
    return 'pending';
}

/**
 * Extracts unique selectable players from public spectator matchups, champion,
 * and standings without exposing any unreleased answer data.
 */
export function extractSpectatorFollowTargets(spectatorData) {
    const ctx = normalizeSpectatorContext(spectatorData);
    const championKey = spectatorEntityKey(ctx.champion);
    const byId = new Map();

    // Sort matchups ascending by round so later rounds overwrite earlier ones.
    const orderedMatchups = [...ctx.matchups].sort((a, b) => {
        const rDiff = Number(a?.roundNumber || 0) - Number(b?.roundNumber || 0);
        if (rDiff !== 0) return rDiff;
        return Number(a?.slot ?? 0) - Number(b?.slot ?? 0);
    });

    for (const matchup of orderedMatchups) {
        const seats = Array.isArray(matchup.seats) ? matchup.seats : [];
        const roundLabel = resolveSpectatorRoundLabel(matchup, ctx.totalRounds, ctx.semiRound, ctx.finalRound);
        const rawSlot = matchup?.slot;
        const matchupSlot = rawSlot !== null && rawSlot !== undefined && rawSlot !== '' && Number.isFinite(Number(rawSlot))
            ? Number(rawSlot)
            : null;

        for (const seat of seats) {
            if (!seat) continue;
            const id = spectatorEntityKey(seat);
            if (!id) continue;
            const status = deriveSeatStatus(
                seat,
                matchup,
                championKey,
                ctx.finalRound,
                ctx.totalRounds,
                ctx.tournamentState,
            );
            byId.set(id, {
                id,
                name: participantLabel(seat),
                isHorse: spectatorEntityIsHorse(seat),
                roundLabel,
                status,
                matchupSlot,
            });
        }
    }

    if (ctx.champion && championKey) {
        const existing = byId.get(championKey);
        byId.set(championKey, {
            id: championKey,
            name: participantLabel(ctx.champion),
            isHorse: spectatorEntityIsHorse(ctx.champion),
            roundLabel: existing?.roundLabel || 'Championship Final',
            status: 'champion',
            matchupSlot: existing?.matchupSlot ?? null,
        });
    }

    for (const row of ctx.standings) {
        const id = spectatorEntityKey(row);
        if (!id || byId.has(id)) continue;
        const rawStatus = String(row.status || '').trim().toLowerCase();
        const status = rawStatus === 'champion'
            ? 'champion'
            : rawStatus === 'eliminated'
                ? 'eliminated'
                : rawStatus === 'advanced'
                    ? 'advanced'
                    : rawStatus === 'live' || rawStatus === 'playing'
                        ? 'live'
                        : 'pending';
        byId.set(id, {
            id,
            name: participantLabel(row),
            isHorse: spectatorEntityIsHorse(row),
            roundLabel: row.roundLabel || (row.roundNumber ? `Round ${row.roundNumber}` : 'Bracket'),
            status,
            matchupSlot: null,
        });
    }

    return Array.from(byId.values());
}

/**
 * Resolves live/settled public status for a followed spectator player.
 * Never throws on null, empty, or partial payloads.
 */
export function resolveFollowedPlayerStatus(spectatorData, followKey) {
    const key = String(followKey || '').trim();
    if (!key) return null;

    const ctx = normalizeSpectatorContext(spectatorData);
    const championKey = spectatorEntityKey(ctx.champion);

    const orderedMatchups = [...ctx.matchups].sort((a, b) => {
        const rDiff = Number(b?.roundNumber || 0) - Number(a?.roundNumber || 0);
        if (rDiff !== 0) return rDiff;
        return Number(a?.slot ?? 0) - Number(b?.slot ?? 0);
    });

    for (const matchup of orderedMatchups) {
        const seats = Array.isArray(matchup.seats) ? matchup.seats : [];
        const seatIndex = seats.findIndex((seat) => seat && spectatorEntityKey(seat) === key);
        if (seatIndex === -1) continue;

        const seat = seats[seatIndex];
        const opponent = seats[seatIndex === 0 ? 1 : 0] || null;
        const roundLabel = resolveSpectatorRoundLabel(matchup, ctx.totalRounds, ctx.semiRound, ctx.finalRound);
        const status = deriveSeatStatus(
            seat,
            matchup,
            championKey,
            ctx.finalRound,
            ctx.totalRounds,
            ctx.tournamentState,
        );
        const opponentName = opponent
            ? participantLabel(opponent)
            : matchup.isBye
                ? 'Bye'
                : null;
        const fallbackScore = status === 'champion' ? ctx.champion?.score ?? null : null;

        return {
            key,
            name: participantLabel(seat),
            isHorse: spectatorEntityIsHorse(seat),
            roundLabel,
            status,
            opponentName,
            scoreLabel: formatSpectatorScoreLabel(seat, fallbackScore),
        };
    }

    if (ctx.champion && championKey === key) {
        return {
            key,
            name: participantLabel(ctx.champion),
            isHorse: spectatorEntityIsHorse(ctx.champion),
            roundLabel: 'Championship Final',
            status: 'champion',
            opponentName: null,
            scoreLabel: formatSpectatorScoreLabel(null, ctx.champion.score ?? null),
        };
    }

    for (const row of ctx.standings) {
        if (spectatorEntityKey(row) !== key) continue;
        const rawStatus = String(row.status || '').trim().toLowerCase();
        const status = ['live', 'advanced', 'champion', 'eliminated', 'pending'].includes(rawStatus)
            ? rawStatus
            : 'pending';
        return {
            key,
            name: participantLabel(row),
            isHorse: spectatorEntityIsHorse(row),
            roundLabel: row.roundLabel || (row.roundNumber ? `Round ${row.roundNumber}` : 'Bracket'),
            status,
            opponentName: null,
            scoreLabel: formatSpectatorScoreLabel(row, row.score ?? null),
        };
    }

    return {
        key,
        name: 'Contender',
        isHorse: false,
        roundLabel: 'Bracket',
        status: 'pending',
        opponentName: null,
        scoreLabel: 'Pending',
    };
}

/**
 * Aggregates deterministic all-time club trivia standings from completed/settled
 * club nights sorted by wins DESC, podiums DESC, eventsPlayed DESC, bestScore DESC.
 */
export function aggregateClubAllTimeStandings(clubNights) {
    const list = Array.isArray(clubNights) ? clubNights.filter(Boolean) : [];
    const byPlayer = new Map();

    const recordEntry = (rawPlayerId, rawDisplayName, { isWin, isPodium, score }) => {
        const displayName = String(rawDisplayName || '').trim() || 'Club Player';
        const playerId = String(rawPlayerId || '').trim() || displayName.toLowerCase();
        if (!playerId) return;

        const numericScore = Number(score);
        const safeScore = Number.isFinite(numericScore) ? numericScore : 0;

        const current = byPlayer.get(playerId) || {
            playerId,
            displayName,
            wins: 0,
            podiums: 0,
            eventsPlayed: 0,
            bestScore: 0,
        };

        if (displayName && displayName !== 'Club Player') {
            current.displayName = displayName;
        }
        current.eventsPlayed += 1;
        if (isWin) current.wins += 1;
        if (isPodium) current.podiums += 1;
        if (safeScore > current.bestScore) current.bestScore = safeScore;

        byPlayer.set(playerId, current);
    };

    for (const night of list) {
        const status = String(night.status || '').trim().toLowerCase();
        if (status !== 'settled' && status !== 'completed') continue;

        const rows = Array.isArray(night.standings) && night.standings.length > 0
            ? night.standings
            : Array.isArray(night.results) && night.results.length > 0
                ? night.results
                : null;

        if (rows) {
            const seenInNight = new Set();
            rows.forEach((row, index) => {
                if (!row || typeof row !== 'object') return;
                const rawName = row.displayName ?? row.name ?? '';
                const rawId = row.playerId ?? row.userId ?? row.id ?? '';
                const key = String(rawId || rawName || '').trim().toLowerCase();
                if (!key || seenInNight.has(key)) return;
                seenInNight.add(key);

                const rank = Number.isFinite(Number(row.rank)) ? Number(row.rank) : index + 1;
                const isWin = row.isChampion === true || rank === 1;
                const isPodium = isWin || (rank >= 1 && rank <= 3);
                const score = row.score ?? row.correctCount ?? 0;

                recordEntry(rawId, rawName, { isWin, isPodium, score });
            });
            continue;
        }

        const champObj = night.champion && typeof night.champion === 'object' ? night.champion : null;
        const champName = String(
            champObj?.displayName
            ?? champObj?.name
            ?? night.championDisplayName
            ?? night.winnerDisplayName
            ?? night.winnerName
            ?? '',
        ).trim();
        const champId = String(
            champObj?.playerId
            ?? champObj?.userId
            ?? champObj?.id
            ?? night.championUserId
            ?? night.winnerUserId
            ?? night.winnerId
            ?? '',
        ).trim();

        if (champName || champId) {
            const score = champObj?.score ?? night.championScore ?? night.winnerScore ?? 0;
            recordEntry(champId, champName, { isWin: true, isPodium: true, score });
        }
    }

    return Array.from(byPlayer.values()).sort((a, b) => (
        (b.wins - a.wins)
        || (b.podiums - a.podiums)
        || (b.eventsPlayed - a.eventsPlayed)
        || (b.bestScore - a.bestScore)
        || a.displayName.localeCompare(b.displayName)
        || a.playerId.localeCompare(b.playerId)
    ));
}

/**
 * Builds a next-week (+7 days) freeroll draft from an existing club night.
 * Club Trivia Nights are strictly freeroll-only: entryFee is ALWAYS 0.
 */
export function buildNextWeekFreerollDraft(night) {
    const rawTitle = String(night?.title || '').trim();
    const title = (rawTitle.length >= 3 ? rawTitle : 'Weekly Club Trivia Night').slice(0, 80);

    const baseMs = asTime(night?.scheduledStartAt || night?.scheduled_start_at || night?.startsAt);
    const nextStartMs = baseMs !== null ? baseMs + SEVEN_DAYS_MS : Date.now() + SEVEN_DAYS_MS;

    const rawQuestions = Number(night?.questionCount ?? night?.question_count);
    const questionCount = Number.isInteger(rawQuestions) && rawQuestions > 0 ? rawQuestions : 10;

    return {
        title,
        scheduledStartIso: new Date(nextStartMs).toISOString(),
        entryFee: 0,
        questionCount,
    };
}

const TOURNAMENT_IMMINENT_START_WINDOW_MS = 180_000;

/**
 * Base poll interval for the Nightly Trivia Tournament console.
 * Transitions to 3s polling during the final 3 minutes before 8 PM CT start
 * (and while waiting for the PostgreSQL scheduler to flip registration -> live)
 * so registered players enter Round 1 immediately at lock.
 */
export function tournamentPollDelay({
    state = null,
    activeRun = false,
    startsAt = null,
    nowMs = Date.now(),
} = {}) {
    if (activeRun) return 3_000;
    const normalized = String(state || '').toLowerCase();
    if (['held', 'live', 'settling'].includes(normalized)) return 5_000;
    if (normalized === 'registration' && startsAt) {
        const startMs = asTime(startsAt);
        if (startMs !== null && Number.isFinite(nowMs) && (startMs - nowMs) <= TOURNAMENT_IMMINENT_START_WINDOW_MS) {
            return 3_000;
        }
    }
    return 45_000;
}

/**
 * Safety-net poll interval when Supabase Realtime is connected.
 * Because tournament start and round transitions are executed inside PostgreSQL
 * by the fenced scheduler worker, polling must stay brisk near start time and
 * while rounds are live instead of backing off to 135 seconds.
 */
export function tournamentConnectedPollDelay({
    state = null,
    activeRun = false,
    startsAt = null,
    nowMs = Date.now(),
} = {}) {
    const base = tournamentPollDelay({ state, activeRun, startsAt, nowMs });
    if (activeRun) return 4_000;
    const normalized = String(state || '').toLowerCase();
    if (normalized === 'registration' && base <= 3_000) return 4_000;
    if (['held', 'live', 'settling'].includes(normalized)) return 8_000;
    return Math.max(base * 2, 15_000);
}

/**
 * Formats the Smarter Horse count in the Event Ledger.
 * Before start time, horses ramp toward `horseTarget` while leaving open seats
 * for humans (`entered / target`). Once full-bracket fill admits horses past
 * `horseTarget` (or once registration closes), displays the exact entered count
 * so the UI never prints an overflow ratio like `256 / 97`.
 */
export function formatTournamentHorseCount(tournament) {
    const entered = Math.max(0, Number(tournament?.horsesEntered) || 0);
    const target = Math.max(0, Number(tournament?.horseTarget) || 0);
    const state = String(tournament?.state || '').toLowerCase();
    const isPreStart = state === 'registration' || state === 'scheduled' || state === 'upcoming';
    if (isPreStart && target > 0 && entered <= target) {
        return `${exactDiamonds(entered)} / ${exactDiamonds(target)}`;
    }
    return exactDiamonds(entered);
}
