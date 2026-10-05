/**
 * PHASE 7 COMPETITIVE TRIVIA BROWSER CERTIFICATE
 *
 * Drives two already-built local World Hub servers. BASE_OFF must have the
 * competitive release flags disabled. BASE_FLAGS must have PvP, PvP horses,
 * and tournaments enabled. This script never starts a server and refuses any
 * non-loopback base URL.
 *
 * Every auth, Supabase, analytics, and /api request is answered or refused in
 * the browser context. No request can mutate a local or production service.
 * Evidence must be written to the external archive volume:
 *
 *   BASE_OFF=http://127.0.0.1:3100 \
 *   BASE_FLAGS=http://127.0.0.1:3101 \
 *   OUT=/Volumes/SmarterArchives/agent-evidence/trivia-phase7-browser \
 *     node scripts/trivia-ui/phase7-competitive-certificate.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute, join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const BASE_OFF = process.env.BASE_OFF || process.env.BASE;
const BASE_FLAGS = process.env.BASE_FLAGS || process.env.BASE_ON;
const OUT_INPUT = process.env.OUT;
const CHANNEL = process.env.PW_CHANNEL || 'chrome';
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const ARCHIVE_PREFIXES = [
    '/Volumes/SmarterArchives/agent-evidence/',
    '/mnt/SmarterArchives/agent-evidence/',
];

function localBase(value, name) {
    if (!value) throw new Error(`${name} is required`);
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || !LOCAL_HOSTS.has(url.hostname)) {
        throw new Error(`${name} must be a loopback URL, received ${url.origin}`);
    }
    return url.origin;
}

function evidencePath(value) {
    if (!value || !isAbsolute(value)) {
        throw new Error('OUT must be an absolute external evidence path');
    }
    const path = resolve(value);
    if (!ARCHIVE_PREFIXES.some((prefix) => path.startsWith(prefix))) {
        throw new Error('OUT must be inside SmarterArchives/agent-evidence');
    }
    return path;
}

const OFF = localBase(BASE_OFF, 'BASE_OFF');
const ON = localBase(BASE_FLAGS, 'BASE_FLAGS');
if (OFF === ON) throw new Error('BASE_OFF and BASE_FLAGS must be distinct local servers');
const OUT = evidencePath(OUT_INPUT);
const SHOTS = join(OUT, 'screenshots');

const VIEWPORTS = Object.freeze([
    { name: 'mobile-375', width: 375, height: 812 },
    { name: 'mobile-390', width: 390, height: 844 },
    { name: 'desktop-1440', width: 1440, height: 900 },
]);
const ROUTES = Object.freeze([
    '/hub/trivia',
    '/hub/trivia/pvp',
    '/hub/trivia/tournaments',
]);

const IDS = Object.freeze({
    user: '0a1b2c3d-4e5f-4a6b-9c7d-8e9fa0b1c2d3',
    pvpTicket: '11111111-1111-4111-8111-111111111111',
    pvpMatch: '22222222-2222-4222-8222-222222222222',
    pvpSession: '33333333-3333-4333-8333-333333333333',
    tournament: '7f0c1d2e-3a4b-4c5d-8e6f-112233445566',
    historicalTournament: '8f0c1d2e-3a4b-4c5d-8e6f-112233445577',
    entrant: '44444444-4444-4444-8444-444444444444',
    matchup: '55555555-5555-4555-8555-555555555555',
    matchupTwo: '66666666-6666-4666-8666-666666666666',
    tournamentSession: '77777777-7777-4777-8777-777777777777',
    question: '88888888-8888-4888-8888-888888888888',
});

const CONTRACT_ASSUMPTIONS = Object.freeze({
    auth: 'A Supabase-compatible session is stored under smarter-poker-auth. Auth, VIP, profile, realtime, analytics, and every /api request are intercepted inside Playwright.',
    pvp: 'Phase 5 DTOs use success=true, engine=pvp-v2, serverNow, state, sanitized ticket/match/result objects, plus a server quote bound to pvp.standard@1. Phase 7 adds bounded viewer-scoped settled history with disclosed opponents and receipt references, but no match, session, question, or answer-key identifiers. Session questions contain id, position, state, question, and display-order options without answer keys.',
    horses: 'PvP horse capability requires both the page prop from the server release flag and quote.horseFallbackEnabled. Every horse opponent is disclosed as Smarter Horse.',
    tournament: 'Phase 6 nightly DTOs use action-specific success envelopes for schedule, summary, my-run, match, bracket, field, results, receipt, history, and play. The fixture declares 140 horses and one human while returning bounded pages.',
    money: 'Fixture entry, payout, journal, settlement, and PvP stake references are inert strings. The browser never calls a real wallet or settlement route.',
    release: 'BASE_OFF redirects private competitive routes to /hub/trivia. BASE_FLAGS exposes the routes only for this local certificate; production flags and schedules are not changed.',
});

const iso = (base, deltaMs = 0) => new Date(base + deltaMs).toISOString();

function chicagoDate(value) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(value);
    const get = (type) => parts.find((part) => part.type === type)?.value || '';
    return `${get('year')}-${get('month')}-${get('day')}`;
}

function numberedUuid(number) {
    return `90000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
}

function makeFixtures(spec) {
    const now = Date.now();
    const signedIn = spec.signedIn === true;
    const user = {
        id: IDS.user,
        aud: 'authenticated',
        role: 'authenticated',
        email: 'phase7.fixture@example.invalid',
        user_metadata: { username: 'Fixture Player', poker_alias: 'Fixture Player' },
    };
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const expiresAt = Math.floor(now / 1000) + 7200;
    const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, role: user.role, aud: user.aud, exp: expiresAt })}.fixture`;
    const session = {
        access_token: token,
        token_type: 'bearer',
        expires_in: 7200,
        expires_at: expiresAt,
        refresh_token: 'phase7-fixture-refresh',
        user,
    };

    const horseOpponent = {
        kind: 'horse', isHorse: true, label: 'Smarter Horse', displayName: 'Smarter Horse',
        avatarUrl: null, answered: 20, finished: true,
    };
    const humanOpponent = {
        kind: 'human', isHorse: false, label: 'Player', displayName: 'Avery River',
        avatarUrl: null, answered: 20, finished: true,
    };
    const pvpMode = spec.pvpMode || 'human-result';
    const pvpSearching = pvpMode === 'horse-searching';
    const pvpPlaying = pvpMode === 'human-playing';
    const pvpHorse = pvpMode === 'horse-result';
    const pvpResult = pvpMode.endsWith('-result');
    const settledPvpResult = {
        outcome: 'win',
        decision: 'The Server Recorded The Final Match Decision.',
        forfeit: false,
        myCorrect: 17,
        opponentCorrect: 14,
        stake: 25,
        pot: 50,
        rake: 5,
        rakeOnWin: 5,
        payout: 45,
        net: 20,
        receipts: [{ reference: 'fixture-pvp-credit-001', kind: 'pvp_win', amount: 45 }],
        stakeReference: 'fixture-pvp-stake-001',
        settlementReference: 'fixture-pvp-settlement-001',
        settledAt: iso(now, -5_000),
    };
    const pvp = {
        success: true,
        engine: 'pvp-v2',
        serverNow: iso(now),
        state: pvpSearching ? 'searching' : pvpPlaying ? 'playing' : pvpResult ? 'result' : 'idle',
        pollAfterMs: 10_000,
        heartbeatSeconds: 10,
        ticket: pvpSearching ? {
            id: IDS.pvpTicket,
            status: 'waiting',
            stake: 25,
            rulesVersion: 'pvp.standard@1',
            joinedAt: iso(now, -15_000),
            horseWaitSeconds: 35,
            horseEligibleAt: iso(now, 20_000),
            secondsUntilHorseEligible: 20,
            horseFallbackEnabled: true,
            leaseExpiresAt: iso(now, 45_000),
            presence: 'live',
            searchExpiresAt: iso(now, 180_000),
            endedAt: null,
            endReason: null,
            matchKind: null,
        } : null,
        match: pvpSearching ? null : {
            id: IDS.pvpMatch,
            kind: pvpHorse ? 'horse' : 'human',
            status: pvpResult ? 'settled' : 'active',
            stake: 25,
            rulesVersion: 'pvp.standard@1',
            questionCount: 20,
            createdAt: iso(now, -300_000),
            activatedAt: iso(now, -240_000),
            deadlineAt: iso(now, 900_000),
            mySide: 0,
            mySessionId: IDS.pvpSession,
            me: { answered: pvpPlaying ? 0 : 20, finished: pvpResult },
            opponent: pvpHorse ? horseOpponent : { ...humanOpponent, answered: pvpPlaying ? 4 : 20, finished: pvpResult },
        },
        result: pvpResult ? {
            ...settledPvpResult,
            decision: pvpHorse ? 'The Server Recorded A Win Against The Disclosed Smarter Horse.' : 'The Server Recorded The Final Human Match Decision.',
        } : null,
    };
    const pvpHistory = {
        success: true,
        engine: 'pvp-v2',
        serverNow: iso(now),
        total: 2,
        offset: 0,
        limit: 5,
        items: [
            {
                ...settledPvpResult,
                opponent: {
                    kind: 'human', isHorse: false, label: 'Player', displayName: humanOpponent.displayName,
                },
            },
            {
                ...settledPvpResult,
                decision: 'The Server Recorded A Win Against The Disclosed Smarter Horse.',
                opponent: {
                    kind: 'horse', isHorse: true, label: 'Smarter Horse', displayName: 'Smarter Horse',
                },
                receipts: [{ reference: 'fixture-pvp-history-credit-horse-001', kind: 'pvp_win', amount: 45 }],
                stakeReference: 'fixture-pvp-history-stake-horse-001',
                settlementReference: 'fixture-pvp-history-settlement-horse-001',
                settledAt: iso(now, -86_405_000),
            },
        ],
    };
    const quote = {
        success: true,
        engine: 'pvp-v2',
        serverNow: iso(now),
        balance: 500,
        rulesVersion: 'pvp.standard@1',
        joinsEnabled: true,
        horseFallbackEnabled: true,
        stakes: [10, 25, 50, 100].map((stake) => ({
            stake,
            pot: stake * 2,
            rake: Math.ceil(stake * 0.2),
            possibleReturn: (stake * 2) - Math.ceil(stake * 0.2),
            netWin: stake - Math.ceil(stake * 0.2),
        })),
        questionCount: 20,
        humanFirst: true,
        horseWaitSeconds: { min: 20, max: 45 },
        horseLabel: 'Smarter Horse',
        cancellation: 'search_only_before_match',
        tie: 'stake_refund',
    };
    const pvpQuestions = Array.from({ length: 20 }, (_, index) => ({
        id: index === 0 ? IDS.question : numberedUuid(800 + index),
        position: index + 1,
        state: index === 0 ? 'unanswered' : 'locked',
        ...(index === 0 ? {
            question: 'Which Position Acts First Before The Flop?',
            options: ['Under The Gun', 'The Button', 'The Big Blind', 'The Small Blind'],
            category: 'positions',
            difficulty: 'standard',
            openedAt: iso(now, -2_000),
            deadlineAt: iso(now, 300_000),
        } : {}),
    }));
    const pvpSession = {
        success: true,
        sessionId: IDS.pvpSession,
        questions: pvpQuestions,
        entryCost: 0,
        entryState: 'escrowed',
        resumed: true,
        expiresAt: iso(now, 900_000),
        contract: { mode: 'pvp', rulesVersion: 'pvp.standard@1' },
        contractSignature: 'phase7-fixture-contract-signature',
    };

    const tournamentMode = spec.tournamentMode || 'browse';
    const entered = tournamentMode !== 'browse';
    const playing = tournamentMode === 'question';
    const startsAt = entered ? iso(now, -600_000) : iso(now, 7_200_000);
    const tournament = {
        tournamentId: IDS.tournament,
        name: 'Smarter Poker 8 PM Nightly',
        scheduleKind: 'nightly',
        officialTimezone: 'America/Chicago',
        localDate: chicagoDate(new Date(startsAt)),
        localStartTime: '20:00',
        startsAt,
        plannedEndAt: iso(now, 7_200_000),
        registrationOpensAt: iso(now, -3_600_000),
        registrationClosesAt: entered ? iso(now, -900_000) : iso(now, 7_100_000),
        state: entered ? 'live' : 'registration',
        rulesVersionId: 'nightly.standard@1',
        rulesProvisional: false,
        currency: 'diamonds',
        entryFee: 25,
        rakePerEntry: 2,
        bracketCapacity: 256,
        horseTarget: 140,
        horsesEntered: 140,
        humansEntered: 1,
        humanSeatsRemaining: 115,
        estimatedPrizePool: 3_243,
        terminalReason: null,
        format: {
            questionsPerRound: 10,
            shotClockSeconds: 20,
            roundWindowSeconds: 600,
            transitionSeconds: [20, 45],
            tieBreak: 'correct_time_completion_seed',
            horsesDisclosed: true,
        },
        viewer: entered ? {
            entered: true,
            entrantId: IDS.entrant,
            entryReference: 'fixture-nightly-entry-001',
            entryState: 'held',
        } : { entered: false, entrantId: null, entryReference: null, entryState: null },
    };
    const mine = {
        seatNo: 1,
        entrantId: IDS.entrant,
        displayName: 'Fixture Player',
        participantKind: 'human',
        seed: 1,
        state: 'active',
        answered: 0,
        correct: null,
        answerTimeMs: null,
    };
    const horse = {
        seatNo: 2,
        entrantId: numberedUuid(1),
        displayName: 'Clover',
        participantKind: 'horse',
        seed: 128,
        state: 'active',
        answered: 0,
        correct: null,
        answerTimeMs: null,
    };
    const matchup = {
        matchupId: IDS.matchup,
        roundNumber: 1,
        slot: 1,
        status: 'ready',
        isBye: false,
        winnerEntrantId: null,
        decidedReason: null,
        decidedAt: null,
        seats: [mine, horse],
    };
    const summary = {
        success: true,
        serverTime: iso(now),
        currentRound: 1,
        tournament,
        field: {
            entrants: 141,
            humans: 1,
            horses: 140,
            bracketSize: 256,
            rounds: 8,
            byes: 115,
            grossEntryTotal: 3_525,
            seedCommitment: 'fixture-seed-commitment',
            seedReveal: null,
        },
        rounds: [{ roundNumber: 1, status: 'live', opensAt: iso(now, -300_000), deadlineAt: iso(now, 900_000), closedAt: null, matchups: 128, resolved: 0 }],
        result: { grossPool: 3_525, rake: 282, prizePool: 3_243, humanPrizeTotal: 0, horsePrizeTotal: 0, settledAt: null, champion: null },
    };
    const myRun = {
        success: true,
        entered: true,
        serverTime: iso(now),
        entrant: {
            entrantId: IDS.entrant,
            displayName: 'Fixture Player',
            participantKind: 'human',
            seed: 1,
            status: 'active',
            entryState: 'held',
            eliminatedRound: null,
            finalRank: null,
            rank: null,
            placementTier: null,
            payout: 0,
        },
        current: {
            roundNumber: 1,
            matchupId: IDS.matchup,
            opensAt: iso(now, -300_000),
            deadlineAt: iso(now, 900_000),
            phase: playing ? 'playing' : 'waiting_for_opponent',
            seat: mine,
            opponent: horse,
        },
        history: [{ roundNumber: 0, matchupId: IDS.matchupTwo, result: 'bye', decidedReason: 'bye', mine, opponent: null }],
    };
    const schedule = {
        success: true,
        serverTime: iso(now),
        officialTimezone: 'America/Chicago',
        instances: [tournament],
    };
    const bracket = {
        success: true,
        roundNumber: 1,
        bracketSize: 256,
        roundCount: 8,
        total: 128,
        offset: 0,
        limit: 64,
        items: [
            matchup,
            {
                ...matchup,
                matchupId: IDS.matchupTwo,
                slot: 2,
                seats: [
                    { ...horse, entrantId: numberedUuid(2), displayName: 'Vector', seed: 2 },
                    { ...horse, entrantId: numberedUuid(3), displayName: 'Nova', seed: 127 },
                ],
            },
        ],
    };
    const fieldItems = [
        { entrantId: IDS.entrant, displayName: 'Fixture Player', participantKind: 'human', seed: 1, status: 'active', entryState: 'held', payout: 0 },
        ...Array.from({ length: 49 }, (_, index) => ({
            entrantId: numberedUuid(index + 1),
            displayName: `Horse ${String(index + 1).padStart(3, '0')}`,
            participantKind: 'horse',
            seed: index + 2,
            status: 'active',
            entryState: 'held',
            payout: 0,
        })),
    ];
    const receipt = {
        success: true,
        tournamentId: IDS.tournament,
        entry: { reference: 'fixture-nightly-entry-001', amount: 25, fundingSource: 'wallet', at: iso(now, -3_600_000), journalId: 'fixture-journal-001' },
        refund: null,
        payout: { reference: 'fixture-nightly-payout-001', amount: 125, rank: 8 },
        settlement: { state: 'complete', settlementId: 'fixture-settlement-001', idempotencyKey: 'fixture-nightly-idempotency-001' },
    };
    const tournamentQuestion = {
        position: 1,
        state: 'unanswered',
        id: IDS.question,
        question: 'Which Position Acts First Before The Flop?',
        options: ['Under The Gun', 'The Button', 'The Big Blind', 'The Small Blind'],
        category: 'positions',
        difficulty: 'standard',
        openedAt: iso(now, -2_000),
        deadlineAt: iso(now, 300_000),
    };
    const tournamentSession = {
        success: true,
        sessionId: IDS.tournamentSession,
        mode: 'tournament',
        engine: 'v3',
        status: 'open',
        resumed: true,
        expiresAt: iso(now, 900_000),
        questionCount: 10,
        entryCost: 25,
        entryState: 'held',
        questions: [
            tournamentQuestion,
            ...Array.from({ length: 9 }, (_, index) => ({ position: index + 2, state: 'locked' })),
        ],
    };

    return {
        now, signedIn, user, session, quote, pvp, pvpHistory, pvpSession,
        tournament, schedule, summary, myRun, matchup, bracket,
        field: { success: true, total: 141, offset: 0, limit: 50, items: fieldItems },
        results: {
            success: true, settled: true, total: 141, offset: 0, limit: 50,
            items: [
                { rank: 1, placementTier: 'champion', displayName: 'Clover', participantKind: 'horse', score: 72, payout: 1_000, eliminatedRound: null, matchesWon: 8 },
                { rank: 8, placementTier: 'paid', displayName: 'Fixture Player', participantKind: 'human', score: 61, payout: 125, eliminatedRound: 5, matchesWon: 4 },
            ],
        },
        receipt,
        history: {
            success: true,
            total: 1,
            items: [{ tournamentId: IDS.historicalTournament, name: 'Previous 8 PM Nightly', localDate: chicagoDate(new Date(now - 86_400_000)), state: 'settled', rank: 8, placementTier: 'paid', payout: 125, entryState: 'settled', eliminatedRound: 5, entrants: 141 }],
        },
        tournamentSession,
        tournamentQuestion,
    };
}

function json(route, body, status = 200) {
    return route.fulfill({
        status,
        contentType: 'application/json; charset=utf-8',
        headers: { 'Cache-Control': 'private, no-store, max-age=0' },
        body: JSON.stringify(body),
    });
}

function requestBody(request) {
    try { return request.postDataJSON() || {}; } catch (_error) { return {}; }
}

async function fulfillApi(route, fixtures, log) {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    log.api.push({ method, path: `${url.pathname}${url.search}` });
    if (method === 'OPTIONS') return route.fulfill({ status: 204, body: '' });

    if (url.pathname === '/api/auth/ensure-profile') {
        return json(route, { created: false, isBrandNew: false, profile: { id: IDS.user, username: 'Fixture Player' } });
    }
    if (url.pathname === '/api/vip/check-status') return json(route, { isVip: false });
    if (url.pathname === '/api/user/get-header-stats') {
        return json(route, { success: true, diamonds: 500, isVip: false, unreadNotifications: 0 });
    }

    const pvpMatch = /^\/api\/trivia\/pvp\/(quote|resume|status|heartbeat|join|cancel|history)$/.exec(url.pathname);
    if (pvpMatch) {
        if (pvpMatch[1] === 'quote') return json(route, fixtures.quote);
        if (pvpMatch[1] === 'history') return json(route, fixtures.pvpHistory);
        return json(route, fixtures.pvp);
    }
    if (url.pathname === '/api/trivia/session-start') return json(route, fixtures.pvpSession);
    if (url.pathname === '/api/trivia/session-answer') {
        const body = requestBody(request);
        return json(route, { success: true, questionId: body.questionId, recorded: true, fresh: true, storedDisplayIndex: body.displayIndex, outcome: 'recorded' });
    }
    if (url.pathname === '/api/trivia/session-submit') {
        return json(route, { success: true, submitted: true, correct: 17, total: 20 });
    }

    const nightly = /^\/api\/trivia\/nightly\/(schedule|summary|enter|field|bracket|match|my-run|play|results|receipt|history)$/.exec(url.pathname);
    if (nightly) {
        const action = nightly[1];
        if (action === 'schedule') return json(route, fixtures.schedule);
        if (action === 'summary') return json(route, fixtures.summary);
        if (action === 'enter') return json(route, { success: true, duplicate: false, entrant_id: IDS.entrant, entry_reference: 'fixture-nightly-entry-001', entry_fee: 25, journal_id: 'fixture-journal-001' });
        if (action === 'field') return json(route, fixtures.field);
        if (action === 'bracket') return json(route, fixtures.bracket);
        if (action === 'match') return json(route, { success: true, matchup: fixtures.matchup });
        if (action === 'my-run') return json(route, fixtures.myRun);
        if (action === 'results') return json(route, fixtures.results);
        if (action === 'receipt') return json(route, fixtures.receipt);
        if (action === 'history') return json(route, fixtures.history);
        if (action === 'play') {
            const body = requestBody(request);
            if (body.action === 'answer') {
                return json(route, { success: true, recorded: true, duplicate: false, sequence: 1, storedDisplayIndex: body.displayIndex, outcome: 'recorded', seat_finished: false });
            }
            if (body.action === 'finish') return json(route, { success: true, seat_finished: true, matchup_resolved: false });
            if (body.action === 'question') return json(route, { success: true, question: fixtures.tournamentQuestion });
            return json(route, { success: true, session: fixtures.tournamentSession });
        }
    }

    // Unknown application APIs are contained too. They cannot hit a local
    // handler that might proxy a production service or create a record.
    return json(route, { success: true });
}

async function createContext(browser, viewport, spec, fixtures, log) {
    const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
        reducedMotion: 'reduce',
        serviceWorkers: 'block',
    });
    if (typeof context.routeWebSocket === 'function') {
        await context.routeWebSocket('**', (socket) => socket.close());
    }
    if (fixtures.signedIn) {
        await context.addInitScript(({ session, user }) => {
            localStorage.setItem('smarter-poker-auth', JSON.stringify(session));
            localStorage.setItem('sp-cached-header-user', JSON.stringify({ id: user.id, username: 'Fixture Player', _ts: Date.now() }));
        }, { session: fixtures.session, user: fixtures.user });
    } else {
        await context.addInitScript(() => {
            localStorage.removeItem('smarter-poker-auth');
            localStorage.removeItem('sp-cached-header-user');
        });
    }

    await context.route('**/*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const local = LOCAL_HOSTS.has(url.hostname);
        if (local && url.pathname.startsWith('/api/')) return fulfillApi(route, fixtures, log);
        if (local) {
            if (!['GET', 'HEAD'].includes(request.method())) {
                log.blocked.push({ method: request.method(), url: url.href, reason: 'non-api-local-write' });
                return route.abort('blockedbyclient');
            }
            return route.continue();
        }

        if (/\/auth\/v1\//.test(url.pathname)) {
            log.auth.push({ method: request.method(), path: url.pathname });
            if (!fixtures.signedIn) return json(route, { message: 'signed out' }, 401);
            if (/\/user$/.test(url.pathname)) return json(route, fixtures.user);
            return json(route, fixtures.session);
        }
        if (/\/rest\/v1\//.test(url.pathname)) {
            log.supabase.push({ method: request.method(), path: url.pathname });
            if (request.method() !== 'GET' && request.method() !== 'HEAD') {
                return json(route, { message: 'fixture write refused' }, 409);
            }
            if (/\/profiles$/.test(url.pathname)) {
                return json(route, { id: IDS.user, username: 'Fixture Player', diamonds: 500, is_vip: false, avatar_url: null });
            }
            if (/\/daily_trivia_plays$/.test(url.pathname)) return json(route, []);
            if (/\/trivia_streaks$/.test(url.pathname)) return json(route, { current_streak: 7 });
            if (/\/rpc\//.test(url.pathname)) return json(route, null);
            return json(route, request.headers().accept?.includes('object+json') ? null : []);
        }

        log.blocked.push({ method: request.method(), url: url.origin + url.pathname, reason: 'external-network' });
        return route.abort('blockedbyclient');
    });
    return context;
}

async function settle(page) {
    await page.waitForLoadState('load', { timeout: 30_000 }).catch(() => {});
    await page.evaluate(() => document.fonts?.ready).catch(() => {});
    await page.waitForTimeout(700);
}

async function waitForText(page, text, timeout = 15_000) {
    await page.waitForFunction(
        (expected) => document.body?.innerText?.includes(expected),
        text,
        { timeout },
    );
}

async function decodeArt(page) {
    const art = page.locator('main [data-art]');
    const count = await art.count();
    if (count > 0) await art.first().scrollIntoViewIfNeeded().catch(() => {});
    await page.evaluate(async () => {
        const images = [...document.querySelectorAll('main [data-art] img')];
        await Promise.all(images.map((image) => {
            if (image.complete) return Promise.resolve();
            return new Promise((done) => {
                image.addEventListener('load', done, { once: true });
                image.addEventListener('error', done, { once: true });
                setTimeout(done, 5_000);
            });
        }));
    });
}

async function measure(page) {
    return page.evaluate(() => {
        const root = document.querySelector('main');
        const visible = (element) => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return rect.width > 0 && rect.height > 0 && style.display !== 'none'
                && style.visibility !== 'hidden' && !element.closest('[aria-hidden="true"]');
        };
        const label = (element) => (
            element.getAttribute('aria-label')
            || element.textContent
            || element.getAttribute('placeholder')
            || element.tagName
        ).trim().replace(/\s+/g, ' ').slice(0, 60);
        const controls = root ? [...root.querySelectorAll('button, a[href], input, select, textarea, summary, [role="button"], [role="tab"]')].filter(visible) : [];
        const tooSmall = controls.filter((element) => {
            const rect = element.getBoundingClientRect();
            return rect.width < 43.5 || rect.height < 43.5;
        }).map((element) => {
            const rect = element.getBoundingClientRect();
            return `${label(element)} ${Math.round(rect.width)}x${Math.round(rect.height)}`;
        });
        const brokenImages = root ? [...root.querySelectorAll('img')].filter((image) => (
            visible(image) && image.currentSrc && image.complete && image.naturalWidth === 0
        )).map((image) => image.currentSrc) : [];
        const arts = root ? [...root.querySelectorAll('[data-art]')].filter(visible).map((element) => {
            const image = element.querySelector('img');
            const rect = element.getBoundingClientRect();
            return {
                key: element.dataset.art,
                state: element.dataset.artState,
                width: Math.round(rect.width),
                height: Math.round(rect.height),
                decoded: Boolean(image?.complete && image.naturalWidth > 0),
                source: image?.currentSrc?.split('/').pop() || null,
            };
        }) : [];
        return {
            path: location.pathname,
            viewport: { width: innerWidth, height: innerHeight },
            scrollWidth: document.documentElement.scrollWidth,
            documentOverflow: document.documentElement.scrollWidth > innerWidth + 1,
            h1: root ? root.querySelectorAll('h1').length : 0,
            controls: controls.length,
            tooSmall,
            brokenImages,
            arts,
        };
    });
}

async function axeSerious(page) {
    await page.addScriptTag({ content: AXE });
    return page.evaluate(async () => {
        const root = document.querySelector('main');
        if (!root) return [{ id: 'missing-main', impact: 'critical', nodes: ['document'] }];
        const result = await window.axe.run(root, {
            resultTypes: ['violations'],
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
        });
        return result.violations
            .filter((violation) => ['serious', 'critical'].includes(violation.impact))
            .map((violation) => ({
                id: violation.id,
                impact: violation.impact,
                nodes: violation.nodes.map((node) => String(node.target?.[0] || '')).slice(0, 8),
            }));
    });
}

async function composition(page, surface, viewport) {
    return page.evaluate(({ surface: selected, mobile }) => {
        const visible = (element) => {
            if (!element) return false;
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
        };
        const before = (art, copy) => {
            if (!visible(art) || !visible(copy)) return false;
            const relation = art.compareDocumentPosition(copy);
            return Boolean(relation & Node.DOCUMENT_POSITION_FOLLOWING)
                && art.getBoundingClientRect().top <= copy.getBoundingClientRect().top + 1;
        };
        const tracks = (element) => getComputedStyle(element).gridTemplateColumns
            .split(/\s+/).filter(Boolean).length;

        if (selected === 'lobby') {
            const region = document.querySelector('[data-competitive-lobby-state]');
            const consoles = region ? [...region.querySelectorAll('[data-master-art]')] : [];
            if (mobile) {
                const pairs = consoles.map((consoleElement) => ({
                    art: consoleElement.querySelector('[data-art]'),
                    copy: consoleElement.querySelector('[class*="featureCopy"]'),
                }));
                return {
                    ok: region?.dataset.mobileLayout === 'stacked'
                        && pairs.length === 2 && pairs.every((pair) => before(pair.art, pair.copy)),
                    marker: region?.dataset.mobileLayout || null,
                    pairCount: pairs.length,
                };
            }
            const layout = region?.firstElementChild;
            return {
                ok: region?.dataset.desktopLayout === 'seven-five-competitive'
                    && getComputedStyle(layout).display === 'grid' && tracks(layout) >= 2,
                marker: region?.dataset.desktopLayout || null,
                tracks: layout ? tracks(layout) : 0,
            };
        }
        if (selected === 'pvp') {
            const layout = document.querySelector('.trivia-pvp-layout');
            if (mobile) {
                return { ok: before(layout?.querySelector('[data-art]'), layout?.querySelector('.trivia-pvp-main')) };
            }
            return { ok: visible(layout) && getComputedStyle(layout).display === 'grid' && tracks(layout) >= 12, tracks: layout ? tracks(layout) : 0 };
        }
        const grid = document.querySelector('.tt-console-grid');
        if (mobile) {
            const consoleElement = grid?.closest('[data-master-art]');
            return { ok: before(consoleElement?.querySelector('[data-art]'), grid) };
        }
        return {
            ok: visible(grid) && grid.dataset.activeTab && getComputedStyle(grid).display === 'grid' && tracks(grid) >= 3,
            marker: grid?.dataset.activeTab || null,
            tracks: grid ? tracks(grid) : 0,
        };
    }, { surface, mobile: viewport.width < 900 });
}

function slug(value) {
    return value.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
}

async function screenshot(page, name) {
    const path = join(SHOTS, `${slug(name)}.png`);
    await page.screenshot({ path, fullPage: false });
    return path;
}

function record(row, failures, code, pass, detail = null) {
    const assertion = { code, pass: Boolean(pass), ...(detail == null ? {} : { detail }) };
    row.assertions.push(assertion);
    if (!assertion.pass) failures.push({ scenario: row.scenario, viewport: row.viewport, code, detail });
}

async function tournamentDesk(page, row, failures) {
    record(row, failures, 'tournament-horse-total', (await page.locator('body').innerText()).includes('140 / 140'));
    record(row, failures, 'tournament-my-run', await page.getByText('My Run', { exact: true }).count() > 0);
    await screenshot(page, `${row.scenario}-${row.viewport}-my-run`);

    const views = [
        ['Bracket', '.tt-bracket', 'Your Path:'],
        ['Field', '.tt-field', 'Fixture Player'],
        ['Results', '.tt-results', 'Official Results'],
        ['Receipt', '.tt-receipt', 'fixture-nightly-entry-001'],
        ['History', '.tt-history', 'Previous 8 PM Nightly'],
    ];
    for (const [name, selector, text] of views) {
        const viewButton = page.getByRole('button', { name, exact: true });
        await viewButton.click();
        record(row, failures, `tournament-${name.toLowerCase()}-selected`,
            await viewButton.getAttribute('aria-pressed') === 'true', 'aria-pressed=true');
        const view = page.locator(selector);
        await view.waitFor({ state: 'visible', timeout: 10_000 });
        const expected = view.getByText(text, { exact: false }).first();
        await expected.waitFor({ state: 'attached', timeout: 10_000 });
        await expected.evaluate(element => element.scrollIntoView({ block: 'center', inline: 'nearest' }));
        await page.waitForTimeout(50);
        const viewText = await view.textContent() || '';
        record(row, failures, `tournament-${name.toLowerCase()}`,
            viewText.includes(text) && await expected.isVisible(), text);
        if (name === 'Bracket' || name === 'Field') {
            const disclosedHorse = name === 'Bracket'
                ? view.locator('.tt-bracket-seat').filter({ hasText: 'Smarter Horse' }).first()
                : view.locator('.tt-field-list li').filter({ hasText: 'Smarter Horse' }).first();
            await disclosedHorse.waitFor({ state: 'attached', timeout: 10_000 });
            await disclosedHorse.evaluate(element => element.scrollIntoView({ block: 'center', inline: 'nearest' }));
            await page.waitForTimeout(50);
            record(row, failures, `tournament-${name.toLowerCase()}-horse-disclosure`,
                await disclosedHorse.isVisible());
        }
        await screenshot(page, `${row.scenario}-${row.viewport}-${name}`);
    }
}

async function pvpHistoryDesk(page, fixtures, log, row, failures) {
    const history = page.locator('.trivia-pvp-history');
    await history.scrollIntoViewIfNeeded();
    await history.getByText('Match History', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
    record(row, failures, 'pvp-history-heading', true);

    const horseSummary = history.locator('summary').filter({ hasText: 'Vs Smarter Horse' }).first();
    await horseSummary.waitFor({ state: 'visible', timeout: 10_000 });
    record(row, failures, 'pvp-history-horse-disclosure', await horseSummary.innerText().then((text) => text.includes('Vs Smarter Horse')));
    await horseSummary.click();
    const historyText = await history.innerText();
    record(row, failures, 'pvp-history-transaction-reference', historyText.includes('fixture-pvp-history-settlement-horse-001'));
    record(row, failures, 'pvp-history-endpoint-called', log.api.some((entry) => entry.path.startsWith('/api/trivia/pvp/history')),
        log.api.filter((entry) => entry.path.startsWith('/api/trivia/pvp/history')));

    const serialized = JSON.stringify(fixtures.pvpHistory);
    const forbidden = [
        'matchId', 'match_id', 'sessionId', 'session_id', 'questionId', 'question_id',
        'answerKey', 'answer_key', 'correctAnswer', 'correct_answer',
        IDS.pvpMatch, IDS.pvpSession, IDS.question,
    ].filter((token) => serialized.includes(token));
    record(row, failures, 'pvp-history-no-raw-ids-or-answer-keys', forbidden.length === 0, forbidden);
    await screenshot(page, `${row.scenario}-${row.viewport}-history`);
}

async function offlineLobby(context, page, row, failures) {
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await page.locator('[data-competitive-lobby-state="stale"]').waitFor({ timeout: 5_000 });
    const staleText = await page.locator('body').innerText();
    record(row, failures, 'offline-stale-state', staleText.includes('Showing Last Known Competitive Briefing'));
    record(row, failures, 'offline-stale-action', staleText.includes('Verify And Resume'));
    await screenshot(page, `${row.scenario}-${row.viewport}-stale`);
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.locator('[data-competitive-lobby-state="resume"]').waitFor({ timeout: 10_000 });
    record(row, failures, 'offline-recovery', true);
}

async function runScenario(browser, spec, failures) {
    const fixtures = makeFixtures(spec);
    const log = { api: [], auth: [], supabase: [], blocked: [] };
    const row = {
        scenario: spec.name,
        route: spec.route,
        base: spec.base === OFF ? 'flags-off' : 'flags-on',
        viewport: spec.viewport.name,
        signedIn: fixtures.signedIn,
        pvpMode: spec.pvpMode || null,
        tournamentMode: spec.tournamentMode || null,
        assertions: [],
    };
    const context = await createContext(browser, spec.viewport, spec, fixtures, log);
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(String(error?.message || error).slice(0, 300)));

    try {
        const response = await page.goto(spec.base + spec.route, { waitUntil: 'domcontentloaded', timeout: 45_000 });
        row.httpStatus = response?.status() || null;
        await settle(page);
        await waitForText(page, spec.readyText);
        if (spec.scrollToCompetitive) {
            await page.locator('[data-competitive-lobby-state]').scrollIntoViewIfNeeded();
        }
        await decodeArt(page);

        if (spec.exercise === 'tournament-desk') await tournamentDesk(page, row, failures);
        if (spec.exercise === 'pvp-history') await pvpHistoryDesk(page, fixtures, log, row, failures);
        if (spec.exercise === 'offline-lobby') await offlineLobby(context, page, row, failures);

        row.finalPath = new URL(page.url()).pathname;
        row.measure = await measure(page);
        row.axe = await axeSerious(page);
        row.composition = spec.composition
            ? await composition(page, spec.composition, spec.viewport)
            : null;
        row.pageErrors = pageErrors;
        row.network = log;
        row.screenshot = await screenshot(page, `${spec.name}-${spec.viewport.name}`);

        record(row, failures, 'expected-path', row.finalPath === spec.expectedPath, { expected: spec.expectedPath, actual: row.finalPath });
        record(row, failures, 'one-h1', row.measure.h1 === 1, row.measure.h1);
        record(row, failures, 'no-document-overflow', !row.measure.documentOverflow, { scrollWidth: row.measure.scrollWidth, viewport: row.measure.viewport.width });
        record(row, failures, 'no-broken-images', row.measure.brokenImages.length === 0, row.measure.brokenImages);
        record(row, failures, 'no-small-trivia-controls', row.measure.tooSmall.length === 0, row.measure.tooSmall.slice(0, 12));
        record(row, failures, 'no-serious-critical-a11y', row.axe.length === 0, row.axe);
        record(row, failures, 'no-page-errors', pageErrors.length === 0, pageErrors);
        record(row, failures, 'no-uncontained-writes', log.blocked.every((entry) => ['GET', 'HEAD'].includes(entry.method)), log.blocked);
        if (spec.requireArt) {
            record(row, failures, 'rendered-art-present', row.measure.arts.length >= spec.requireArt, row.measure.arts);
            record(row, failures, 'rendered-art-decoded', row.measure.arts.length >= spec.requireArt && row.measure.arts.every((art) => art.decoded && art.state === 'ready'), row.measure.arts);
        }
        if (spec.composition) record(row, failures, 'responsive-composition', row.composition?.ok === true, row.composition);
        if (spec.noCompetitiveApi) {
            record(row, failures, 'flags-off-no-competitive-api', !log.api.some((entry) => entry.path.startsWith('/api/trivia/pvp/') || entry.path.startsWith('/api/trivia/nightly/')), log.api);
        }
        for (const expected of spec.contains || []) {
            record(row, failures, `copy-${slug(expected)}`, (await page.locator('body').innerText()).includes(expected), expected);
        }
    } catch (error) {
        row.error = String(error?.stack || error);
        record(row, failures, 'scenario-completed', false, String(error?.message || error));
        await screenshot(page, `${spec.name}-${spec.viewport.name}-failure`).catch(() => {});
    } finally {
        await context.close();
    }
    return row;
}

function scenarios() {
    const list = [];
    for (const viewport of VIEWPORTS) {
        list.push({
            name: 'enabled-lobby-human-resume', base: ON, route: '/hub/trivia', expectedPath: '/hub/trivia',
            viewport, signedIn: true, pvpMode: 'human-result', tournamentMode: 'waiting',
            readyText: 'Competitive Match Ready To Resume', scrollToCompetitive: true,
            requireArt: 2, composition: 'lobby', contains: ['Smarter Horses', '140'],
            ...(viewport.width === 390 ? { exercise: 'offline-lobby' } : {}),
        });
        list.push({
            name: 'enabled-pvp-human-result', base: ON, route: '/hub/trivia/pvp', expectedPath: '/hub/trivia/pvp',
            viewport, signedIn: true, pvpMode: 'human-result', tournamentMode: 'waiting',
            readyText: 'Server-Graded Final', requireArt: 1, composition: 'pvp', exercise: 'pvp-history',
            contains: [
                'Victory', 'Avery River Score', 'Transaction Record', 'fixture-pvp-settlement-001',
                'Match History', 'Vs Smarter Horse', 'fixture-pvp-history-settlement-horse-001',
            ],
        });
        list.push({
            name: 'enabled-tournament-browse', base: ON, route: '/hub/trivia/tournaments', expectedPath: '/hub/trivia/tournaments',
            viewport, signedIn: false, pvpMode: 'human-result', tournamentMode: 'browse',
            readyText: 'Event Ledger', requireArt: 1, composition: 'tournament',
            contains: ['Smarter Horses', '140 / 140', 'Sign In To Enter'],
        });
    }

    for (const route of ROUTES) {
        list.push({
            name: `flags-off-${route.split('/').pop() || 'lobby'}`, base: OFF, route,
            expectedPath: '/hub/trivia', viewport: VIEWPORTS[1], signedIn: false,
            pvpMode: 'human-result', tournamentMode: 'browse', readyText: 'Competitive Rooms In Maintenance',
            scrollToCompetitive: true, noCompetitiveApi: true,
            ...(route === '/hub/trivia' ? { requireArt: 2, composition: 'lobby' } : {}),
            contains: ['1 V 1 In Maintenance', 'Tournament In Maintenance'],
        });
    }

    list.push({
        name: 'enabled-lobby-signed-out', base: ON, route: '/hub/trivia', expectedPath: '/hub/trivia',
        viewport: VIEWPORTS[1], signedIn: false, pvpMode: 'human-result', tournamentMode: 'browse',
        readyText: 'Sign In To Check Match Recovery', scrollToCompetitive: true,
        requireArt: 2, composition: 'lobby', contains: ['Sign In For Match Recovery'],
    });
    list.push({
        name: 'enabled-pvp-signed-out', base: ON, route: '/hub/trivia/pvp', expectedPath: '/hub/trivia/pvp',
        viewport: VIEWPORTS[1], signedIn: false, pvpMode: 'human-result', tournamentMode: 'browse',
        readyText: 'Sign In Required', requireArt: 1, composition: 'pvp',
        contains: ['Sign In To Restore An Existing Match Or Request A Server-Quoted Diamond Stake.'],
    });

    for (const viewport of [VIEWPORTS[1], VIEWPORTS[2]]) {
        list.push({
            name: 'enabled-pvp-human-resume', base: ON, route: '/hub/trivia/pvp', expectedPath: '/hub/trivia/pvp',
            viewport, signedIn: true, pvpMode: 'human-playing', tournamentMode: 'waiting',
            readyText: 'Which Position Acts First Before The Flop?', requireArt: 1,
            contains: ['Question 1 Of 20', 'Versus Avery River', 'Correct Answers Stay Sealed Until Settlement.'],
        });
        list.push({
            name: 'enabled-pvp-horse-fallback', base: ON, route: '/hub/trivia/pvp', expectedPath: '/hub/trivia/pvp',
            viewport, signedIn: true, pvpMode: 'horse-searching', tournamentMode: 'waiting',
            readyText: 'Until Smarter Horse Becomes Eligible', requireArt: 1,
            contains: ['Human Tables Searched First', 'No Stake Is Taken Until The Server Commits A Match.'],
        });
        list.push({
            name: 'enabled-pvp-horse-result', base: ON, route: '/hub/trivia/pvp', expectedPath: '/hub/trivia/pvp',
            viewport, signedIn: true, pvpMode: 'horse-result', tournamentMode: 'waiting',
            readyText: 'Smarter Horse Score', requireArt: 1,
            contains: ['Victory', 'The Server Recorded A Win Against The Disclosed Smarter Horse.', 'fixture-pvp-credit-001'],
        });
        list.push({
            name: 'enabled-tournament-desk', base: ON, route: '/hub/trivia/tournaments', expectedPath: '/hub/trivia/tournaments',
            viewport, signedIn: true, pvpMode: 'human-result', tournamentMode: 'waiting',
            readyText: 'My Run', exercise: 'tournament-desk',
            contains: ['Previous 8 PM Nightly'],
        });
        list.push({
            name: 'enabled-tournament-current-question', base: ON, route: '/hub/trivia/tournaments', expectedPath: '/hub/trivia/tournaments',
            viewport, signedIn: true, pvpMode: 'human-result', tournamentMode: 'question',
            readyText: 'Which Position Acts First Before The Flop?',
            contains: ['Question 1 Of 10', 'The Server Records The First Answer. Verdicts Stay Hidden Until The Round Closes.'],
        });
    }
    return list;
}

async function main() {
    mkdirSync(SHOTS, { recursive: true });
    writeFileSync(join(OUT, 'fixture-contract.json'), `${JSON.stringify(CONTRACT_ASSUMPTIONS, null, 2)}\n`);
    const failures = [];
    const rows = [];
    const browser = await chromium.launch({ channel: CHANNEL, headless: true });
    try {
        for (const spec of scenarios()) {
            const row = await runScenario(browser, spec, failures);
            rows.push(row);
            console.log(`${row.assertions.every((item) => item.pass) ? 'PASS' : 'FAIL'} ${row.scenario} ${row.viewport} ${row.finalPath || row.error || ''}`);
        }
    } finally {
        await browser.close();
    }

    const enabledCoverage = new Set(rows
        .filter((row) => row.scenario.startsWith('enabled-') && ['enabled-lobby-human-resume', 'enabled-pvp-human-result', 'enabled-tournament-browse'].includes(row.scenario))
        .map((row) => `${row.route}:${row.viewport}`));
    for (const route of ROUTES) {
        for (const viewport of VIEWPORTS) {
            const key = `${route}:${viewport.name}`;
            if (!enabledCoverage.has(key)) failures.push({ scenario: 'coverage', viewport: viewport.name, code: 'missing-route-viewport', detail: route });
        }
    }

    const report = {
        generatedAt: new Date().toISOString(),
        bases: { flagsOff: OFF, flagsOn: ON },
        output: OUT,
        contractAssumptions: CONTRACT_ASSUMPTIONS,
        scenarios: rows.length,
        failures,
        rows,
    };
    writeFileSync(join(OUT, 'phase7-competitive-certificate.json'), `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(join(OUT, 'summary.json'), `${JSON.stringify({
        generatedAt: report.generatedAt,
        scenarios: rows.length,
        assertions: rows.reduce((total, row) => total + row.assertions.length, 0),
        failures: failures.length,
        passed: failures.length === 0,
    }, null, 2)}\n`);
    if (failures.length > 0) {
        console.error(`PHASE 7 CERTIFICATE FAILED: ${failures.length} assertion(s)`);
        process.exitCode = 1;
        return;
    }
    console.log(`PHASE 7 CERTIFICATE PASSED: ${rows.length} scenarios`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
