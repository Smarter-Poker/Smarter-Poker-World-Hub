/**
 * Pure, browser-safe projection for the Phase 7 competitive lobby briefing.
 *
 * The two server routes already return sanitized DTOs. This second allowlist is
 * intentionally narrower: the lobby only receives the schedule telemetry and
 * resumable PvP facts it can actually display. Identifiers, question data,
 * answer keys, settlement internals, and future server fields are dropped.
 */

export const COMPETITIVE_LOBBY_ENDPOINTS = Object.freeze({
    schedule: '/api/trivia/nightly/schedule?days=2',
    pvpResume: '/api/trivia/pvp/resume',
});

const TOURNAMENT_STATES = Object.freeze([
    'scheduled', 'registration', 'held', 'live', 'settling', 'settled', 'cancelled',
]);

const PVP_STATES = Object.freeze([
    'idle', 'searching', 'dealing', 'playing', 'waiting', 'settling', 'result', 'search_ended',
]);

const RESUMABLE_PVP_STATES = new Set([
    'searching', 'dealing', 'playing', 'waiting', 'settling', 'result',
]);

const safeString = (value, max = 160) => (
    typeof value === 'string' && value.length > 0 && value.length <= max ? value : null
);

const safeDate = (value) => {
    const text = safeString(value, 64);
    return text && Number.isFinite(Date.parse(text)) ? text : null;
};

const safeInteger = (value, { min = 0, max = 1_000_000 } = {}) => {
    if (value === undefined || value === null || value === '') return null;
    const number = Number(value);
    return Number.isInteger(number) && number >= min && number <= max ? number : null;
};

function sanitizeTournamentInstance(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const startsAt = safeDate(raw.startsAt);
    if (!startsAt) return null;

    if (!TOURNAMENT_STATES.includes(raw.state)) return null;
    const state = raw.state;
    const officialTimezone = 'America/Chicago';
    const viewer = raw.viewer && typeof raw.viewer === 'object' && !Array.isArray(raw.viewer)
        ? {
            entered: raw.viewer.entered === true,
            entryState: safeString(raw.viewer.entryState, 40),
        }
        : null;

    return {
        name: safeString(raw.name, 100) || 'Nightly Trivia Tournament',
        officialTimezone,
        localDate: safeString(raw.localDate, 24),
        localStartTime: safeString(raw.localStartTime, 12) || '20:00',
        startsAt,
        registrationOpensAt: safeDate(raw.registrationOpensAt),
        registrationClosesAt: safeDate(raw.registrationClosesAt),
        state,
        entryFee: safeInteger(raw.entryFee),
        rakePerEntry: safeInteger(raw.rakePerEntry),
        bracketCapacity: safeInteger(raw.bracketCapacity),
        horseTarget: safeInteger(raw.horseTarget),
        horsesEntered: safeInteger(raw.horsesEntered),
        humansEntered: safeInteger(raw.humansEntered),
        humanSeatsRemaining: safeInteger(raw.humanSeatsRemaining),
        estimatedPrizePool: safeInteger(raw.estimatedPrizePool),
        viewer,
    };
}

export function sanitizeNightlySchedule(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.success !== true) return null;
    const serverTime = safeDate(raw.serverTime);
    if (!serverTime || !Array.isArray(raw.instances)) return null;
    return {
        serverTime,
        instances: raw.instances.map(sanitizeTournamentInstance).filter(Boolean),
    };
}

export function sanitizePvpResume(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.success !== true) return null;
    if (!PVP_STATES.includes(raw.state)) return null;
    const state = raw.state;
    const ticketRaw = raw.ticket && typeof raw.ticket === 'object' && !Array.isArray(raw.ticket)
        ? raw.ticket
        : null;
    const matchRaw = raw.match && typeof raw.match === 'object' && !Array.isArray(raw.match)
        ? raw.match
        : null;
    const opponentRaw = matchRaw?.opponent && typeof matchRaw.opponent === 'object'
        ? matchRaw.opponent
        : null;
    const isHorse = opponentRaw?.isHorse === true || opponentRaw?.kind === 'horse';
    const resultRaw = raw.result && typeof raw.result === 'object' && !Array.isArray(raw.result)
        ? raw.result
        : null;

    const ticket = ticketRaw ? {
        status: safeString(ticketRaw.status, 40),
        stake: safeInteger(ticketRaw.stake),
        horseEligibleAt: safeDate(ticketRaw.horseEligibleAt),
        secondsUntilHorseEligible: safeInteger(ticketRaw.secondsUntilHorseEligible, { max: 3600 }),
        horseFallbackEnabled: ticketRaw.horseFallbackEnabled === true,
        presence: safeString(ticketRaw.presence, 40),
        matchKind: safeString(ticketRaw.matchKind, 40),
    } : null;

    const match = matchRaw ? {
        kind: safeString(matchRaw.kind, 40),
        status: safeString(matchRaw.status, 40),
        stake: safeInteger(matchRaw.stake),
        opponent: opponentRaw ? {
            kind: isHorse ? 'horse' : 'human',
            label: isHorse ? 'Smarter Horse' : 'Player',
            displayName: isHorse
                ? 'Smarter Horse'
                : (safeString(opponentRaw.displayName, 80) || 'Player'),
        } : null,
    } : null;

    const result = resultRaw ? {
        outcome: safeString(resultRaw.outcome, 40),
        decision: safeString(resultRaw.decision, 80),
        stake: safeInteger(resultRaw.stake),
        payout: safeInteger(resultRaw.payout),
        net: safeInteger(resultRaw.net, { min: -1_000_000 }),
    } : null;

    return {
        serverTime: safeDate(raw.serverNow),
        state,
        ticket,
        match,
        result,
        resumeAvailable: RESUMABLE_PVP_STATES.has(state) && Boolean(ticket || match || result),
    };
}

/**
 * One finite request plan. Feature-off surfaces never touch their private API,
 * and signed-out visitors may read the public schedule but never call the
 * authenticated PvP resume route.
 */
export function planCompetitiveLobbyRequests({
    tournamentsEnabled = false,
    pvpEnabled = false,
    authState = 'loading',
} = {}) {
    return {
        schedule: tournamentsEnabled ? COMPETITIVE_LOBBY_ENDPOINTS.schedule : null,
        pvpResume: pvpEnabled && authState === 'authenticated'
            ? COMPETITIVE_LOBBY_ENDPOINTS.pvpResume
            : null,
    };
}

export function selectFeaturedTournament(schedule) {
    const instances = Array.isArray(schedule?.instances) ? schedule.instances : [];
    if (instances.length === 0) return null;
    const serverNow = Date.parse(schedule?.serverTime);
    const now = Number.isFinite(serverNow) ? serverNow : Date.now();
    const ranked = [...instances].sort((a, b) => {
        const rank = (event) => {
            const start = Date.parse(event.startsAt);
            if (event.state === 'live') return [0, -start];
            if (event.state === 'settling') return [1, -start];
            if (Number.isFinite(start) && start >= now
                && ['scheduled', 'registration', 'held'].includes(event.state)) return [2, start];
            if (['settled', 'cancelled'].includes(event.state)) return [3, -start];
            return [4, -start];
        };
        const [aBand, aTime] = rank(a);
        const [bBand, bTime] = rank(b);
        return aBand - bBand || aTime - bTime;
    });
    return ranked[0] || null;
}

/** A route headline tied to the selected event, never just the browser date. */
export function getTournamentHeadline(tournament, nowValue = Date.now()) {
    if (!tournament) return 'Tonight At 8 PM';
    const stateLabels = {
        live: 'Nightly Live Now',
        settling: 'Nightly Settling',
        settled: 'Nightly Complete',
        cancelled: 'Nightly Cancelled',
    };
    if (stateLabels[tournament.state]) return stateLabels[tournament.state];

    const startsAt = Date.parse(tournament.startsAt);
    const now = typeof nowValue === 'number' ? nowValue : Date.parse(nowValue);
    if (!Number.isFinite(startsAt) || !Number.isFinite(now)) return 'Next Nightly At 8 PM';
    const dateKey = (value) => new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(value);
    return dateKey(startsAt) === dateKey(now) ? 'Tonight At 8 PM' : 'Next Nightly At 8 PM';
}

export function getRegistrationLabel(tournament, nowValue = Date.now()) {
    if (!tournament) return 'No Event Posted';
    const entered = tournament.viewer?.entered === true;
    if (tournament.state === 'live') return entered ? 'Registered / Live' : 'Field Locked / Live';
    if (tournament.state === 'settling') return 'Results Settling';
    if (tournament.state === 'settled') return 'Event Complete';
    if (tournament.state === 'cancelled') return 'Event Cancelled';
    if (tournament.state === 'held') return entered ? 'Registered / Field Locked' : 'Field Locked';
    if (entered) return 'Registered';

    const now = typeof nowValue === 'number' ? nowValue : Date.parse(nowValue);
    const opensAt = Date.parse(tournament.registrationOpensAt);
    const closesAt = Date.parse(tournament.registrationClosesAt);
    if (Number.isFinite(now) && Number.isFinite(opensAt) && now < opensAt) {
        return 'Registration Opens Soon';
    }
    if (Number.isFinite(now) && Number.isFinite(closesAt) && now >= closesAt) {
        return 'Registration Closed';
    }
    return tournament.state === 'registration' ? 'Registration Open' : 'Registration Pending';
}

export function getCountdown(startsAt, nowValue = Date.now()) {
    const start = Date.parse(startsAt);
    const now = typeof nowValue === 'number' ? nowValue : Date.parse(nowValue);
    if (!Number.isFinite(start) || !Number.isFinite(now)) {
        return { display: '--:--:--', ariaLabel: 'Start time unavailable', complete: false };
    }
    const remaining = Math.max(0, start - now);
    if (remaining === 0) return { display: 'Live Now', ariaLabel: 'Live now', complete: true };

    const totalSeconds = Math.floor(remaining / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const two = (value) => String(value).padStart(2, '0');
    const display = days > 0
        ? `${days}D ${two(hours)}:${two(minutes)}:${two(seconds)}`
        : `${two(hours)}:${two(minutes)}:${two(seconds)}`;
    const ariaLabel = [
        days ? `${days} ${days === 1 ? 'day' : 'days'}` : null,
        `${hours} ${hours === 1 ? 'hour' : 'hours'}`,
        `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`,
        `${seconds} ${seconds === 1 ? 'second' : 'seconds'}`,
    ].filter(Boolean).join(', ');
    return { display, ariaLabel, complete: false };
}

/** Event-aware clock copy prevents a completed or cancelled event reading as live. */
export function getTournamentClock(tournament, nowValue = Date.now()) {
    if (!tournament) return getCountdown(null, nowValue);
    const terminalClocks = {
        live: { display: 'Live Now', ariaLabel: 'Tournament live now', complete: true },
        settling: { display: 'Settling', ariaLabel: 'Tournament results settling', complete: true },
        settled: { display: 'Complete', ariaLabel: 'Tournament complete', complete: true },
        cancelled: { display: 'Cancelled', ariaLabel: 'Tournament cancelled', complete: true },
    };
    if (terminalClocks[tournament.state]) return terminalClocks[tournament.state];
    const start = Date.parse(tournament.startsAt);
    const now = typeof nowValue === 'number' ? nowValue : Date.parse(nowValue);
    if (Number.isFinite(start) && Number.isFinite(now) && start <= now) {
        return tournament.state === 'held'
            ? { display: 'Start Pending', ariaLabel: 'Field locked, awaiting tournament start', complete: true }
            : { display: 'Awaiting Start', ariaLabel: 'Tournament awaiting authoritative start', complete: true };
    }
    return getCountdown(tournament.startsAt, nowValue);
}

const hasData = (resource) => Boolean(resource?.data);
const isBusy = (resource) => ['loading', 'refreshing'].includes(resource?.status);
const isBad = (resource) => ['error', 'offline'].includes(resource?.status);

/** A single truthful state for assistive copy and deterministic regression tests. */
export function deriveCompetitiveLobbyState({
    authState = 'loading',
    tournamentsEnabled = false,
    pvpEnabled = false,
    connectionState = 'online',
    scheduleResource = { status: 'disabled', data: null },
    pvpResource = { status: 'disabled', data: null },
} = {}) {
    if (!tournamentsEnabled && !pvpEnabled) {
        return { key: 'feature-off', label: 'Competitive Rooms In Maintenance' };
    }
    if (connectionState === 'refreshing') {
        return { key: 'refreshing', label: 'Refreshing Competitive Briefing' };
    }
    if (connectionState === 'offline') {
        return hasData(scheduleResource) || hasData(pvpResource)
            ? { key: 'stale', label: 'Showing Last Known Competitive Briefing' }
            : { key: 'offline', label: 'Competitive Briefing Offline' };
    }
    if (authState === 'loading' && pvpEnabled) {
        return { key: 'auth-loading', label: 'Checking Player Access' };
    }
    if (isBusy(scheduleResource) || isBusy(pvpResource)) {
        return hasData(scheduleResource) || hasData(pvpResource)
            ? { key: 'stale', label: 'Refreshing Competitive Briefing' }
            : { key: 'loading', label: 'Loading Competitive Briefing' };
    }
    if (scheduleResource?.status === 'stale' || pvpResource?.status === 'stale') {
        return { key: 'stale', label: 'Showing Last Known Competitive Briefing' };
    }

    const enabledErrors = [
        tournamentsEnabled ? scheduleResource : null,
        pvpEnabled && authState === 'authenticated' ? pvpResource : null,
    ].filter(Boolean);
    const errors = enabledErrors.filter(isBad).length;
    if (errors === enabledErrors.length && errors > 0) {
        return { key: 'error', label: 'Competitive Briefing Unavailable' };
    }
    if (errors > 0) {
        return { key: 'partial', label: 'Part Of The Competitive Briefing Is Unavailable' };
    }
    if (pvpEnabled && (authState === 'signed-out' || pvpResource?.status === 'signed-out')) {
        return { key: 'signed-out', label: 'Sign In To Check Match Recovery' };
    }
    if (pvpResource?.data?.resumeAvailable === true) {
        return { key: 'resume', label: 'Competitive Match Ready To Resume' };
    }
    if (tournamentsEnabled && !selectFeaturedTournament(scheduleResource?.data)) {
        return { key: 'empty', label: 'No Nightly Event Is Posted Yet' };
    }
    return { key: 'ready', label: 'Competitive Briefing Current' };
}
