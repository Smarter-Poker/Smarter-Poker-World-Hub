import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
    areTriviaPvpHorsesReleased,
    isTriviaPvpReleased,
    rejectUnavailableTriviaPvp,
    triviaPvpPageReleaseResult,
} from '../src/lib/trivia/pvpReleaseControl.mjs';
import {
    extractPvpRosterIds,
    forcedPvpSettlementFailureCount,
    isValidPvpStatsReceipt,
    samePvpRoster,
    validatePvpMatch,
    validatePvpSettlementEnvelope,
    validatePvpSettlementDecision,
    validatePvpDurableSessionLink,
    validatePvpSessionBinding,
    validatePvpSessionCreationReceipt,
} from '../src/lib/trivia/pvpSettlementPolicy.mjs';
import {
    validateTriviaAwardResponse,
    validateTriviaSessionAnswerReceipt,
    validateTriviaSessionCreationReceipt,
    validateTriviaSessionDeadline,
    validateTriviaSessionRoster,
} from '../src/lib/trivia/awardResponsePolicy.mjs';

const ROOT = process.cwd();
const read = (file) => readFileSync(join(ROOT, file), 'utf8');
const settlementRoute = read('pages/api/trivia/pvp-settle-match.js');
const sessionStartRoute = read('pages/api/trivia/session-start.js');
const sessionSubmitRoute = read('pages/api/trivia/session-submit.js');
const sessionAnswerRoute = read('pages/api/trivia/session-answer.js');
const settlementCron = read('pages/api/cron/pvp-settle.js');
const pvpPage = read('pages/hub/trivia/pvp.js');
const migration = read('supabase/migrations/20260906120000_trivia_pvp_containment.sql');
const openClawDispatcher = read('scripts/openclaw-cron-dispatcher.py');
const vercelCronPaths = new Set((JSON.parse(read('vercel.json')).crons || []).map(cron => cron.path));
const cronHealthRegistry = read('pages/api/admin/cron-health.js');
const productionSmoke = read('scripts/trivia/phase1-production-smoke.cjs');
const migrationRehearsal = read('scripts/trivia/phase1-migration-rehearsal.cjs');
const productionVerifier = read('scripts/verify-tournament-system.js');
const productionDatabaseVerifier = read('scripts/trivia/phase1-production-db-verify.cjs');
const guard = read('__tests__/_test-guards-exist.test.mjs');
const pkg = JSON.parse(read('package.json'));

const IDS = Object.freeze({
    match: '11111111-1111-4111-8111-111111111111',
    p1: '22222222-2222-4222-8222-222222222222',
    p2: '33333333-3333-4333-8333-333333333333',
    session: '44444444-4444-4444-8444-444444444444',
});
const roster = Array.from({ length: 20 }, (_, index) => {
    const tail = String(index + 1).padStart(12, '0');
    return `aaaaaaaa-aaaa-4aaa-8aaa-${tail}`;
});
const NOW = Date.parse('2026-09-06T12:05:00.000Z');

function validMatch(overrides = {}) {
    return {
        id: IDS.match,
        player1_id: IDS.p1,
        player2_id: IDS.p2,
        stake_amount: 25,
        questions: roster,
        status: 'active',
        created_at: '2026-09-06T12:00:00.000Z',
        ...overrides,
    };
}

function validBinding(overrides = {}) {
    const match = validMatch();
    const link = {
        match_id: match.id,
        side: 1,
        user_id: IDS.p1,
        session_id: IDS.session,
    };
    const session = {
        id: IDS.session,
        user_id: IDS.p1,
        mode: 'pvp',
        status: 'submitted',
        question_ids: roster,
        correct_count: 14,
        entry_cost: 25,
        entry_state: 'charged',
        created_at: '2026-09-06T12:01:00.000Z',
        submitted_at: '2026-09-06T12:15:00.000Z',
        expires_at: '2026-09-06T12:30:00.000Z',
    };
    const stakeTransactions = [{
        id: '55555555-5555-4555-8555-555555555555',
        user_id: IDS.p1,
        amount: -25,
        transaction_type: 'pvp_stake',
        type: 'pvp_stake',
        reference_id: `pvp_stake_${IDS.match}_${IDS.p1}`,
    }];
    return {
        match,
        link,
        session,
        expectedUserId: IDS.p1,
        expectedSide: 1,
        stakeTransactions,
        ...overrides,
    };
}

function validSettlementDecision(overrides = {}) {
    return {
        kind: 'win',
        forfeit: false,
        winner_id: IDS.p1,
        player1_score: 14,
        player2_score: 12,
        reference_family: `pvp_settlement_${IDS.match}`,
        sides: [
            {
                side: 1,
                user_id: IDS.p1,
                session_id: IDS.session,
                is_horse: false,
                charged: true,
                submitted: true,
                correct_count: 14,
            },
            {
                side: 2,
                user_id: IDS.p2,
                session_id: '66666666-6666-4666-8666-666666666666',
                is_horse: false,
                charged: true,
                submitted: true,
                correct_count: 12,
            },
        ],
        credits: [{
            user_id: IDS.p1,
            amount: 45,
            transaction_type: 'pvp_win',
            description: 'PvP match won',
            reference_id: `pvp_match_win_${IDS.match}`,
        }],
        ...overrides,
    };
}

test('PvP release control is exact and defaults off', () => {
    assert.equal(isTriviaPvpReleased(), false);
    assert.equal(isTriviaPvpReleased({}), false);
    assert.equal(isTriviaPvpReleased({ TRIVIA_PVP_ENABLED: 'false' }), false);
    assert.equal(isTriviaPvpReleased({ TRIVIA_PVP_ENABLED: 'TRUE' }), false);
    assert.equal(isTriviaPvpReleased({ TRIVIA_PVP_ENABLED: '1' }), false);
    assert.equal(isTriviaPvpReleased({ TRIVIA_PVP_ENABLED: true }), false);
    assert.equal(isTriviaPvpReleased({ NEXT_PUBLIC_TRIVIA_PVP_ENABLED: 'true' }), false);
    assert.equal(isTriviaPvpReleased({ TRIVIA_PVP_ENABLED: 'true' }), true);
    assert.equal(areTriviaPvpHorsesReleased({ TRIVIA_PVP_HORSES_ENABLED: 'true' }), false);
    assert.equal(areTriviaPvpHorsesReleased({
        TRIVIA_PVP_ENABLED: 'true',
        TRIVIA_PVP_HORSES_ENABLED: 'TRUE',
    }), false);
    assert.equal(areTriviaPvpHorsesReleased({
        TRIVIA_PVP_ENABLED: 'true',
        TRIVIA_PVP_HORSES_ENABLED: 'true',
    }), true);
});

test('disabled APIs are non-cacheable and direct navigation redirects', () => {
    const headers = new Map();
    let statusCode = null;
    let payload = null;
    const res = {
        setHeader(name, value) { headers.set(name, value); },
        status(value) { statusCode = value; return this; },
        json(value) { payload = value; return value; },
    };
    rejectUnavailableTriviaPvp(res);
    assert.equal(statusCode, 503);
    assert.equal(payload.error, 'pvp_temporarily_unavailable');
    assert.match(headers.get('Cache-Control'), /no-store/);
    assert.equal(headers.get('Retry-After'), '300');
    assert.deepEqual(triviaPvpPageReleaseResult({}), {
        redirect: { destination: '/hub/trivia', permanent: false },
    });
    assert.deepEqual(triviaPvpPageReleaseResult({ TRIVIA_PVP_ENABLED: 'true' }), {
        props: { pvpHorsesEnabled: false },
    });
    assert.deepEqual(triviaPvpPageReleaseResult({
        TRIVIA_PVP_ENABLED: 'true',
        TRIVIA_PVP_HORSES_ENABLED: 'true',
    }), { props: { pvpHorsesEnabled: true } });
});

test('match validation rejects abandoned, malformed, self-play and arbitrary stakes', () => {
    const now = Date.parse('2026-09-06T12:05:00.000Z');
    assert.equal(validatePvpMatch(validMatch(), { now }).ok, true);
    assert.equal(validatePvpMatch(validMatch({ status: 'abandoned' }), { now }).error, 'match_not_settleable');
    assert.equal(validatePvpMatch(validMatch({ player2_id: IDS.p1 }), { now }).error, 'invalid_match_players');
    assert.equal(validatePvpMatch(validMatch({ stake_amount: 999 }), { now }).error, 'invalid_match_stake');
    assert.equal(validatePvpMatch(validMatch({ created_at: 'not-a-date' }), { now }).error, 'invalid_match_time');
    assert.equal(validatePvpMatch(validMatch({ questions: [...roster.slice(0, 19), roster[0]] }), { now }).error, 'invalid_match_roster');
});

test('rosters are ordered, UUID-only, duplicate-free and capped', () => {
    assert.deepEqual(extractPvpRosterIds(roster), roster);
    assert.equal(samePvpRoster(roster, [...roster]), true);
    assert.equal(samePvpRoster(roster, [...roster].reverse()), false);
    assert.equal(extractPvpRosterIds([...roster, IDS.session]), null);
    assert.equal(extractPvpRosterIds([...roster.slice(0, 19), roster[0]]), null);
    assert.equal(extractPvpRosterIds([{ id: roster[0] }]), null);
});

test('forced settlement sweeps never report an unsettled business outcome as healthy', () => {
    assert.equal(forcedPvpSettlementFailureCount({ settled: true, failed: 0 }), 0);
    assert.equal(forcedPvpSettlementFailureCount({ settled: false, pendingReason: 'decision_failed' }), 1);
    assert.equal(forcedPvpSettlementFailureCount({ settled: false, failed: 2 }), 2);
    assert.equal(forcedPvpSettlementFailureCount(null), 1);
    assert.match(settlementCron, /settlementFailures \+= forcedFailures/);
    assert.match(settlementCron, /success: settlementFailures === 0/);
    assert.match(settlementCron, /status\(settlementFailures > 0 \? 503 : 200\)/);
    assert.match(settlementCron, /action: 'error',[\s\S]{0,80}failed: 1/);
});

test('stats projection requires a complete idempotent database receipt', () => {
    assert.equal(isValidPvpStatsReceipt({ success: true, deduped: false }), true);
    assert.equal(isValidPvpStatsReceipt({ success: true, deduped: true }), true);
    assert.equal(isValidPvpStatsReceipt(null), false);
    assert.equal(isValidPvpStatsReceipt({}), false);
    assert.equal(isValidPvpStatsReceipt({ success: true }), false);
    assert.equal(isValidPvpStatsReceipt({ success: false, deduped: false }), false);
    assert.match(settlementRoute, /!isValidPvpStatsReceipt\(data\)/);
});

test('settlement binding requires exact match, owner, roster, escrow and one debit', () => {
    assert.deepEqual(validatePvpSessionBinding(validBinding()), { ok: true });

    const wrongMatch = validBinding();
    wrongMatch.link = { ...wrongMatch.link, match_id: IDS.session };
    assert.equal(validatePvpSessionBinding(wrongMatch).error, 'session_link_mismatch');

    const reused = validBinding();
    reused.stakeTransactions = [...reused.stakeTransactions, { ...reused.stakeTransactions[0] }];
    assert.equal(validatePvpSessionBinding(reused).error, 'stake_reused');

    const wrongRoster = validBinding();
    wrongRoster.session = { ...wrongRoster.session, question_ids: [...roster].reverse() };
    assert.equal(validatePvpSessionBinding(wrongRoster).error, 'session_roster_mismatch');

    const wrongStake = validBinding();
    wrongStake.stakeTransactions = [{ ...wrongStake.stakeTransactions[0], amount: -10 }];
    assert.equal(validatePvpSessionBinding(wrongStake).error, 'stake_mismatch');

    const late = validBinding();
    late.session = { ...late.session, submitted_at: '2026-09-06T12:31:00.000Z' };
    assert.equal(validatePvpSessionBinding(late).error, 'session_submitted_outside_window');

    const missingDeadline = validBinding();
    missingDeadline.session = { ...missingDeadline.session, expires_at: null };
    assert.equal(validatePvpSessionBinding(missingDeadline).error, 'session_deadline_invalid');

    const malformedDeadline = validBinding();
    malformedDeadline.session = { ...malformedDeadline.session, expires_at: 'not-a-timestamp' };
    assert.equal(validatePvpSessionBinding(malformedDeadline).error, 'session_deadline_invalid');
});

test('PvP session creation requires a strict atomic database receipt', () => {
    assert.deepEqual(validatePvpSessionCreationReceipt({
        success: true,
        duplicate: false,
        session_id: IDS.session,
    }, IDS.session), { ok: true, duplicate: false, sessionId: IDS.session });
    assert.equal(validatePvpSessionCreationReceipt(null, IDS.session).error, 'session_create_receipt_invalid');
    assert.equal(validatePvpSessionCreationReceipt({}, IDS.session).error, 'session_create_receipt_invalid');
    assert.equal(validatePvpSessionCreationReceipt({
        success: 'yes', duplicate: false, session_id: IDS.session,
    }, IDS.session).error, 'session_create_receipt_invalid');
    assert.equal(validatePvpSessionCreationReceipt({
        success: true, duplicate: false, session_id: IDS.p1,
    }, IDS.session).error, 'session_create_receipt_invalid');
    assert.equal(validatePvpSessionCreationReceipt({
        success: true, duplicate: true, session_id: IDS.p1,
    }, IDS.session).ok, true);
    assert.match(sessionStartRoute, /validatePvpSessionCreationReceipt\(created, sessionId\)/);
    assert.match(sessionStartRoute, /rows\.length !== PVP_QUESTION_COUNT/);
});

test('PvP create and replay reload and prove the exact durable match/side binding', () => {
    const match = validMatch();
    const link = {
        match_id: match.id,
        side: 1,
        user_id: IDS.p1,
        session_id: IDS.session,
    };
    const expected = {
        match,
        link,
        expectedMatchId: IDS.match,
        expectedUserId: IDS.p1,
        expectedSide: 1,
        expectedSessionId: IDS.session,
        expectedRoster: roster,
        expectedStake: 25,
        now: NOW,
    };
    assert.equal(validatePvpDurableSessionLink(expected).ok, true);
    assert.equal(validatePvpDurableSessionLink({
        ...expected,
        expectedSessionId: IDS.p2,
    }).error, 'durable_session_link_mismatch');
    assert.equal(validatePvpDurableSessionLink({
        ...expected,
        expectedSide: 2,
    }).error, 'durable_session_link_mismatch');
    assert.equal(validatePvpDurableSessionLink({
        ...expected,
        match: { ...match, player1_id: IDS.p2, player2_id: IDS.p1 },
    }).error, 'durable_session_link_mismatch');
    assert.equal(validatePvpDurableSessionLink({
        ...expected,
        match: { ...match, questions: [...roster].reverse() },
    }).error, 'durable_match_mismatch');
    assert.equal(validatePvpDurableSessionLink({
        ...expected,
        match: { ...match, created_at: '2026-09-06T11:34:59.000Z' },
    }).error, 'durable_match_mismatch');
    assert.equal(validatePvpDurableSessionLink({
        ...expected,
        now: Number.NaN,
    }).error, 'durable_match_mismatch');

    const receiptCheck = sessionStartRoute.indexOf('validatePvpSessionCreationReceipt(created, sessionId)');
    const reload = sessionStartRoute.indexOf('reloadPvpDurableBinding(sb, match.id, side)', receiptCheck);
    const bindingCheck = sessionStartRoute.indexOf('validatePvpDurableSessionLink({', reload);
    const serve = sessionStartRoute.indexOf('return servePvpSession(', bindingCheck);
    assert.ok(receiptCheck >= 0 && reload > receiptCheck && bindingCheck > reload && serve > bindingCheck,
        'create/replay must reload both durable rows, validate the exact link, then serve it');
    assert.match(sessionStartRoute, /expectedSessionId: creationReceipt\.sessionId/);
    assert.match(sessionStartRoute, /expectedRoster: rosterIds/);
});

test('answer verdicts require a strict durable first-answer receipt', () => {
    const context = {
        requestedDisplayIndex: 2,
        optionCount: 4,
        questionCount: 20,
        sessionCreatedAt: '2026-09-06T12:00:00.000Z',
        now: NOW,
    };
    const fresh = {
        success: true,
        fresh: true,
        stored: { d: 2, n: 0, at: '2026-09-06T12:04:00.000Z' },
    };
    assert.deepEqual(validateTriviaSessionAnswerReceipt(fresh, context), {
        ok: true,
        fresh: true,
        storedDisplayIndex: 2,
        answerOrdinal: 0,
        recordedAt: '2026-09-06T12:04:00.000Z',
    });

    // A retry can submit a different tap, but first-answer-wins must return
    // the already-bound durable answer and explicitly mark it as a replay.
    const replay = {
        success: true,
        fresh: false,
        stored: { d: 1, n: 0, at: '2026-09-06T12:03:00.000Z' },
    };
    assert.equal(validateTriviaSessionAnswerReceipt(replay, context).ok, true);
    assert.equal(validateTriviaSessionAnswerReceipt({
        ...fresh,
        stored: { ...fresh.stored, d: 1 },
    }, context).error, 'session_answer_receipt_invalid');

    for (const malformed of [
        null,
        {},
        { ...fresh, success: 'yes' },
        { ...fresh, fresh: 'true' },
        { ...fresh, stored: null },
        { ...fresh, stored: { ...fresh.stored, d: '2' } },
        { ...fresh, stored: { ...fresh.stored, d: 4 } },
        { ...fresh, stored: { ...fresh.stored, n: -1 } },
        { ...fresh, stored: { ...fresh.stored, n: 20 } },
        { ...fresh, stored: { ...fresh.stored, at: 'not-a-date' } },
        { ...fresh, stored: { ...fresh.stored, at: '2026-09-06T12:07:00.000Z' } },
    ]) {
        assert.equal(
            validateTriviaSessionAnswerReceipt(malformed, context).error,
            'session_answer_receipt_invalid',
        );
    }

    const receiptValidation = sessionAnswerRoute.indexOf('validateTriviaSessionAnswerReceipt(recorded');
    const answerReveal = sessionAnswerRoute.indexOf('const correctDisplayIndex');
    assert.ok(receiptValidation >= 0 && answerReveal > receiptValidation,
        'the durable receipt must validate before the correct display index is computed');
    assert.match(sessionAnswerRoute, /status\(502\).*invalid_answer_persistence_receipt/);
    assert.match(sessionAnswerRoute, /fresh: answerReceipt\.fresh/);
    assert.doesNotMatch(sessionAnswerRoute, /fresh: recorded\.fresh !== false/);
});

test('session deadlines and resumable rosters fail closed on expiry, drift and partial data', () => {
    assert.equal(validateTriviaSessionDeadline('2026-09-06T12:35:00.000Z', {
        mode: 'pvp', now: NOW, createdAt: '2026-09-06T12:05:00.000Z',
    }).ok, true);
    assert.equal(validateTriviaSessionDeadline('2026-09-06T12:05:00.000Z', {
        mode: 'daily', now: NOW,
    }).error, 'session_expired');
    assert.equal(validateTriviaSessionDeadline('2026-09-06T12:10:01.000Z', {
        mode: 'arcade', now: NOW,
    }).error, 'session_deadline_invalid');
    assert.equal(validateTriviaSessionDeadline('2026-09-06T12:07:00.000Z', {
        mode: 'time-attack', now: NOW,
    }).error, 'session_deadline_invalid');
    assert.equal(validateTriviaSessionDeadline('2026-09-06T18:06:01.000Z', {
        mode: 'daily', now: NOW,
    }).error, 'session_deadline_invalid');
    assert.equal(validateTriviaSessionDeadline('2026-09-06T12:35:00.000Z', {
        mode: 'pvp', now: NOW, createdAt: 'not-a-date',
    }).error, 'session_deadline_invalid');

    assert.equal(validateTriviaSessionRoster(roster, 20).ok, true);
    assert.equal(validateTriviaSessionRoster(roster.slice(0, 19), 20).error, 'session_roster_invalid');
    assert.equal(validateTriviaSessionRoster([...roster.slice(0, 19), roster[0]], 20).error, 'session_roster_invalid');
    assert.equal(validateTriviaSessionRoster([...roster.slice(0, 19), 'not-a-uuid'], 20).error, 'session_roster_invalid');
    assert.match(sessionStartRoute, /validateTriviaSessionRoster\(session\.question_ids, expectedCount\)/);
    assert.match(sessionStartRoute, /rows\.length !== expectedCount/);
    assert.match(sessionStartRoute, /validateTriviaSessionDeadline\(session\.expires_at/);
});

test('atomic settlement decisions cannot smuggle an overpay or phantom recipient', () => {
    assert.equal(validatePvpSettlementDecision(validMatch(), validSettlementDecision()).ok, true);

    const overpay = validSettlementDecision({
        credits: [{ ...validSettlementDecision().credits[0], amount: 46 }],
    });
    assert.equal(validatePvpSettlementDecision(validMatch(), overpay).error, 'settlement_credits_invalid');

    const wrongRecipient = validSettlementDecision({
        credits: [{ ...validSettlementDecision().credits[0], user_id: IDS.p2 }],
    });
    assert.equal(validatePvpSettlementDecision(validMatch(), wrongRecipient).error, 'settlement_credits_invalid');

    const wrongWinner = validSettlementDecision({
        winner_id: IDS.p2,
        credits: [{
            ...validSettlementDecision().credits[0],
            user_id: IDS.p2,
        }],
    });
    assert.equal(validatePvpSettlementDecision(validMatch(), wrongWinner).error, 'settlement_decision_invalid');

    const submittedWithoutSession = validSettlementDecision({
        sides: validSettlementDecision().sides.map(side => side.side === 1
            ? { ...side, session_id: null }
            : side),
    });
    assert.equal(
        validatePvpSettlementDecision(validMatch(), submittedWithoutSession).error,
        'settlement_sides_invalid',
    );

    const unchargedP2 = {
        ...validSettlementDecision(),
        kind: 'refund',
        winner_id: null,
        player2_score: null,
        sides: validSettlementDecision().sides.map(side => side.side === 2
            ? { ...side, session_id: null, charged: false, submitted: false, correct_count: null }
            : side),
        credits: [{
            user_id: IDS.p1,
            amount: 25,
            transaction_type: 'pvp_refund',
            description: 'PvP match not completed',
            reference_id: `pvp_refund_${IDS.match}_${IDS.p1}`,
        }],
    };
    assert.equal(validatePvpSettlementDecision(validMatch(), unchargedP2).ok, true);
    assert.equal(unchargedP2.credits.some(credit => credit.user_id === IDS.p2), false);

    const unchargedTieSide = {
        ...validSettlementDecision(),
        kind: 'tie',
        winner_id: null,
        player2_score: 14,
        sides: validSettlementDecision().sides.map(side => side.side === 2
            ? { ...side, charged: false, correct_count: 14 }
            : side),
        credits: [{
            user_id: IDS.p1,
            amount: 25,
            transaction_type: 'pvp_refund',
            description: 'PvP tie',
            reference_id: `pvp_tie_refund_${IDS.match}_${IDS.p1}`,
        }],
    };
    assert.equal(
        validatePvpSettlementDecision(validMatch(), unchargedTieSide).error,
        'settlement_sides_invalid',
    );

    const voidWithEscrow = {
        ...validSettlementDecision(),
        kind: 'void',
        forfeit: false,
        winner_id: null,
        player1_score: null,
        player2_score: null,
        sides: validSettlementDecision().sides.map(side => ({
            ...side,
            submitted: false,
            correct_count: null,
        })),
        credits: [],
    };
    assert.equal(
        validatePvpSettlementDecision(validMatch(), voidWithEscrow).error,
        'settlement_decision_invalid',
    );

    const missingCreditPlan = {
        ...voidWithEscrow,
        sides: voidWithEscrow.sides.map(side => ({ ...side, charged: false })),
        credits: undefined,
    };
    assert.equal(
        validatePvpSettlementDecision(validMatch(), missingCreditPlan).error,
        'settlement_credits_invalid',
    );
});

test('atomic settlement envelope reconciles state, replay and exact credit receipts', () => {
    const decision = validSettlementDecision();
    const decided = {
        success: true,
        state: 'decided',
        replayed: false,
        match_id: IDS.match,
        match_status: 'complete',
        credit_count: 1,
        credited_amount: 45,
        decision,
    };
    assert.equal(validatePvpSettlementEnvelope(validMatch(), decided).ok, true);
    assert.equal(validatePvpSettlementEnvelope(validMatch(), {
        ...decided,
        state: 'replay',
        replayed: true,
    }).ok, true);
    assert.equal(validatePvpSettlementEnvelope(validMatch(), {
        ...decided,
        credited_amount: 44,
    }).error, 'settlement_receipt_invalid');
    assert.equal(validatePvpSettlementEnvelope(validMatch(), {
        ...decided,
        credit_count: 0,
    }).error, 'settlement_receipt_invalid');
    assert.equal(validatePvpSettlementEnvelope(validMatch(), {
        ...decided,
        state: 'replay',
        replayed: false,
    }).error, 'settlement_state_invalid');
});

test('atomic settlement validator accepts each conserved database outcome shape', () => {
    const tie = {
        ...validSettlementDecision(),
        kind: 'tie',
        winner_id: null,
        player2_score: 14,
        sides: validSettlementDecision().sides.map(side => ({ ...side, correct_count: 14 })),
        credits: [IDS.p1, IDS.p2].map(userId => ({
            user_id: userId,
            amount: 25,
            transaction_type: 'pvp_refund',
            description: 'PvP tie - 25 diamonds returned',
            reference_id: `pvp_tie_refund_${IDS.match}_${userId}`,
        })),
    };
    assert.equal(validatePvpSettlementDecision(validMatch(), tie).ok, true);

    const forfeit = {
        ...validSettlementDecision(),
        forfeit: true,
        player2_score: null,
        sides: validSettlementDecision().sides.map(side => side.side === 2
            ? { ...side, submitted: false, correct_count: null }
            : side),
    };
    assert.equal(validatePvpSettlementDecision(validMatch(), forfeit).ok, true);

    const voidDecision = {
        ...validSettlementDecision(),
        kind: 'void',
        winner_id: null,
        player1_score: null,
        player2_score: null,
        sides: validSettlementDecision().sides.map(side => ({
            ...side,
            session_id: null,
            charged: false,
            submitted: false,
            correct_count: null,
        })),
        credits: [],
    };
    assert.equal(validatePvpSettlementDecision(validMatch(), voidDecision).ok, true);

    const horseWin = {
        ...validSettlementDecision(),
        forfeit: false,
        winner_id: IDS.p2,
        player1_score: 10,
        player2_score: 12,
        sides: [
            {
                ...validSettlementDecision().sides[0],
                correct_count: 10,
            },
            {
                ...validSettlementDecision().sides[1],
                is_horse: true,
                correct_count: 12,
            },
        ],
        credits: [{
            user_id: IDS.p2,
            amount: 45,
            transaction_type: 'pvp_win',
            description: 'PvP match won',
            reference_id: `pvp_match_win_${IDS.match}`,
        }],
    };
    assert.equal(validatePvpSettlementDecision(validMatch(), horseWin).ok, true);

    const unfundedHorse = {
        ...horseWin,
        sides: horseWin.sides.map(side => side.side === 2
            ? { ...side, session_id: null, charged: false }
            : side),
        credits: [],
    };
    assert.equal(
        validatePvpSettlementDecision(validMatch(), unfundedHorse).error,
        'settlement_sides_invalid',
    );

    const strandedOpponentStake = {
        ...validSettlementDecision(),
        kind: 'refund',
        winner_id: null,
        player2_score: null,
        sides: validSettlementDecision().sides.map(side => side.side === 2
            ? { ...side, submitted: false, correct_count: null }
            : side),
        credits: [{
            user_id: IDS.p1,
            amount: 25,
            transaction_type: 'pvp_refund',
            description: 'PvP match not completed',
            reference_id: `pvp_refund_${IDS.match}_${IDS.p1}`,
        }],
    };
    assert.equal(
        validatePvpSettlementDecision(validMatch(), strandedOpponentStake).error,
        'settlement_decision_invalid',
        'a charged absent opponent makes a single-submitter outcome a forfeit, never a one-sided refund',
    );
});

test('session awards require a complete authoritative database receipt', () => {
    const expected = {
        sessionId: IDS.session,
        score: 1400,
        correct: 14,
        maxDiamonds: 25,
    };
    const receipt = {
        success: true,
        session_id: IDS.session,
        score: 1400,
        correct_count: 14,
        diamonds_awarded: 20,
        score_id: IDS.match,
        daily_bonus_awarded: 0,
        new_balance: 120,
        replayed: false,
    };

    assert.equal(validateTriviaAwardResponse(receipt, expected).ok, true);
    assert.equal(validateTriviaAwardResponse(null, expected).error, 'award_receipt_missing');
    assert.equal(validateTriviaAwardResponse({}, expected).error, 'award_not_committed');
    assert.equal(
        validateTriviaAwardResponse({ ...receipt, diamonds_awarded: '20' }, expected).error,
        'award_totals_invalid',
    );
    assert.equal(
        validateTriviaAwardResponse({ ...receipt, diamonds_awarded: 26 }, expected).error,
        'award_totals_invalid',
    );
    assert.equal(
        validateTriviaAwardResponse({ ...receipt, session_id: IDS.p1 }, expected).error,
        'award_session_mismatch',
    );
    assert.equal(
        validateTriviaAwardResponse({ ...receipt, score_id: null }, expected).error,
        'award_score_receipt_invalid',
    );
    const capEdgeReplay = {
        ...receipt,
        diamonds_awarded: 5,
        replayed: true,
    };
    assert.equal(validateTriviaAwardResponse(capEdgeReplay, {
        sessionId: IDS.session,
        score: 1400,
        correct: 14,
        diamonds: 5,
        requireReplay: true,
    }).ok, true, 'a committed replay is checked against stored settlement, not a recomputed cap');
    assert.equal(validateTriviaAwardResponse({ ...capEdgeReplay, diamonds_awarded: 6 }, {
        sessionId: IDS.session,
        score: 1400,
        correct: 14,
        diamonds: 5,
        requireReplay: true,
    }).error, 'award_totals_invalid');
    assert.match(sessionSubmitRoute, /validateTriviaAwardResponse\(award/);
    assert.match(sessionSubmitRoute, /diamonds: session\.diamonds_awarded, requireReplay: true/);
    assert.match(sessionSubmitRoute, /status\(502\).*invalid_award_receipt/);
    assert.doesNotMatch(sessionSubmitRoute, /award\?\.correct_count[\s\S]{0,120}: correct/);
    assert.doesNotMatch(sessionSubmitRoute, /award\?\.diamonds_awarded[\s\S]{0,120}: diamonds/);
});

test('solo session creation fails closed on RPC schema drift and resumes races', () => {
    const valid = {
        success: true,
        duplicate: false,
        entry_cost: 10,
        entry_state: 'charged',
        new_balance: 90,
        expires_at: '2026-09-06T18:00:00.000Z',
        survival_level: null,
    };
    const context = { mode: 'daily', now: Date.parse('2026-09-06T12:00:00.000Z') };
    assert.equal(validateTriviaSessionCreationReceipt(valid, context).ok, true);
    assert.equal(validateTriviaSessionCreationReceipt(null, context).error, 'session_create_receipt_invalid');
    assert.equal(validateTriviaSessionCreationReceipt({}, context).error, 'session_create_receipt_invalid');
    assert.equal(validateTriviaSessionCreationReceipt({
        ...valid, success: 'yes',
    }, context).error, 'session_create_receipt_invalid');
    assert.equal(validateTriviaSessionCreationReceipt({
        ...valid, entry_cost: '10',
    }, context).error, 'session_create_receipt_invalid');
    assert.equal(validateTriviaSessionCreationReceipt({
        ...valid, expires_at: null,
    }, context).error, 'session_deadline_invalid');
    assert.equal(validateTriviaSessionCreationReceipt({
        ...valid, expires_at: '2026-09-06T11:59:59.000Z',
    }, context).error, 'session_expired');
    assert.equal(validateTriviaSessionCreationReceipt({
        ...valid, expires_at: '2026-09-06T18:01:01.000Z',
    }, context).error, 'session_deadline_invalid');
    assert.match(sessionStartRoute, /validateTriviaSessionCreationReceipt\(created, \{ mode \}\)/);
    const duplicateStart = sessionStartRoute.indexOf('if (created.duplicate)');
    const duplicateResume = sessionStartRoute.indexOf('serveExistingSoloSession', duplicateStart);
    assert.ok(duplicateStart >= 0 && duplicateResume > duplicateStart,
        'a duplicate solo create must reload and resume the durable session');
});

test('ambiguous PvP session-start failures do not falsely promise that no stake moved', () => {
    const start = pvpPage.indexOf('async function beginMatchSession');
    const end = pvpPage.indexOf('async function gradeAnswer', start);
    assert.ok(start >= 0 && end > start);
    const beginMatchSession = pvpPage.slice(start, end);
    assert.doesNotMatch(beginMatchSession, /Nothing was charged|nothing was charged/);
    assert.match(beginMatchSession, /Your stake may be pending; retry to resume the same match/);
});

test('entry, public settlement and direct page all use the server-only gate', () => {
    assert.match(sessionStartRoute, /if \(!isTriviaPvpReleased\(process\.env\)\)[\s\S]{0,160}rejectUnavailableTriviaPvp\(res\)/);
    assert.match(sessionAnswerRoute, /mode === 'pvp' && !isTriviaPvpReleased\(process\.env\)[\s\S]{0,140}rejectUnavailableTriviaPvp\(res\)/);
    assert.match(sessionSubmitRoute, /mode === 'pvp' && !isTriviaPvpReleased\(process\.env\)[\s\S]{0,140}rejectUnavailableTriviaPvp\(res\)/);
    assert.match(settlementRoute, /if \(!isTriviaPvpReleased\(process\.env\)\)[\s\S]{0,160}rejectUnavailableTriviaPvp\(res\)/);
    assert.match(pvpPage, /export function getServerSideProps\(\)[\s\S]{0,160}triviaPvpPageReleaseResult\(process\.env\)/);
    assert.match(pvpPage, /if \(pvpHorsesEnabled\) \{[\s\S]{0,180}handleHorseMatch\(stake\)/);
    assert.match(pvpPage, /async function handleHorseMatch\(stake\) \{[\s\S]{0,80}!pvpHorsesEnabled/);
    assert.doesNotMatch(settlementCron, /isTriviaPvpReleased|rejectUnavailableTriviaPvp/,
        'the authenticated sweep must still drain/refund funded matches while entry is off');
    assert.match(settlementCron, /Cache-Control', 'private, no-store, max-age=0'/,
        'private recovery receipts must never be cached');
    assert.match(settlementCron, /settlePvpMatch\(sb, match, \{ force: true \}\)/);
});

test('settlement delegates decision, credits and close to one locked atomic RPC', () => {
    assert.match(sessionStartRoute, /from\('trivia_pvp_session_links'\)/);
    assert.doesNotMatch(settlementRoute, /match\[SESSION_LINK_COLUMNS/);
    assert.doesNotMatch(sessionStartRoute, /SESSION_LINK_COLUMNS|challenger_id|opponent_id/);
    assert.match(settlementRoute, /rpc\('decide_trivia_pvp_settlement_v1'/);
    assert.match(settlementRoute, /p_match_id: match\.id[\s\S]{0,100}p_force: force/);
    assert.match(settlementRoute, /atomic\.match_id !== match\.id/);
    assert.doesNotMatch(settlementRoute, /from\('trivia_pvp_session_links'\)|from\('trivia_sessions'\)/,
        'session reads outside the match-locking RPC recreate the settlement race');
    assert.doesNotMatch(settlementRoute, /rpc\('add_diamonds_to_balance'|moveDiamonds\(|from\('trivia_pvp_matches'\)\s*\.update/,
        'application settlement must not split wallet credits or terminal state from the DB transaction');
    assert.match(settlementRoute, /validatePvpSettlementEnvelope\(match, atomic\)/);
    assert.match(settlementRoute, /stats_record_failed/);
    assert.match(settlementCron, /status\.in\.\(active,settling\)[\s\S]{0,100}stats_recorded_at\.is\.null/);
    assert.match(migration, /INSERT INTO public\.trivia_pvp_settlement_decisions[\s\S]*FOR v_credit IN[\s\S]*public\.add_diamonds_to_balance[\s\S]*SET status = 'complete'/);
    assert.match(migration, /RAISE EXCEPTION 'atomic PvP credit rejected/);
    assert.match(settlementRoute, /if \(result\.rejected\)/);
    assert.match(settlementRoute, /result\.credits[\s\S]{0,180}credit\.userId === userId/,
        'completed responses must derive caller winnings from the persisted credit plan');
});

test('session submission delegates deadline enforcement to the locked award transaction', () => {
    const awardCall = sessionSubmitRoute.indexOf("sb.rpc('award_trivia_run_v2'");
    assert.ok(awardCall >= 0);
    assert.doesNotMatch(sessionSubmitRoute, /\.update\(\{ status: 'expired' \}\)/,
        'an app-side check/write pair can race the award transaction');
    assert.match(sessionSubmitRoute, /award\.error === 'session_expired' \? 410/);
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.award_trivia_run\(/);
    assert.match(migration, /v_now timestamptz;/);
    assert.match(migration, /v_now := clock_timestamp\(\);/);
    assert.match(migration, /submitted_at = v_now/);
    assert.match(migration, /expires_at >= v_now/);
    assert.match(migration, /'error', 'session_expired'/);
});

test('migration closes browser writes and creates a unique durable binding', () => {
    assert.match(migration, /REVOKE ALL ON TABLE public\.trivia_pvp_queue FROM PUBLIC, anon, authenticated/);
    assert.match(migration, /REVOKE ALL ON TABLE public\.trivia_pvp_matches FROM PUBLIC, anon, authenticated/);
    assert.doesNotMatch(migration, /GRANT (?:INSERT|UPDATE|DELETE|SELECT, INSERT)[^;]* TO authenticated/);
    assert.match(migration, /CREATE POLICY trivia_pvp_queue_select_own[\s\S]*auth\.uid\(\)\) = user_id/);
    assert.match(migration, /CREATE TABLE (?:IF NOT EXISTS )?public\.trivia_pvp_session_links/);
    assert.match(migration, /PRIMARY KEY \(match_id, side\)/);
    assert.match(migration, /UNIQUE \(match_id, user_id\)/);
    assert.match(migration, /UNIQUE \(session_id\)/);
    assert.match(migration, /DROP TRIGGER IF EXISTS trg_trivia_pvp_match_sync/);
    assert.doesNotMatch(migration, /NEW\.player1_id\s*:=|NEW\.player2_id\s*:=/);
    assert.match(migration, /NEW\.challenger_score := COALESCE/);
    assert.match(migration, /CREATE TABLE (?:IF NOT EXISTS )?public\.trivia_pvp_active_seats/);
    assert.match(migration, /UNIQUE \(user_id\)/);
    assert.doesNotMatch(
        migration,
        /RAISE EXCEPTION '(?:horse_session_forbidden|horse_stake_present|horse_session_link_present)'/,
        'horse identity must never remove the ordinary funded-session contract',
    );
    assert.doesNotMatch(migration, /AND NOT COALESCE\(\(side\.value ->> 'is_horse'\)/,
        'horses must receive the same session, settlement, payout and stats contract');
    assert.match(migration, /v_m\.questions IS DISTINCT FROM to_jsonb\(p_question_ids\)/);
    assert.match(migration, /'pvp_stake_' \|\| p_match_id::text \|\| '_' \|\| p_user_id::text/);
    assert.match(migration, /entry_cost, entry_state, created_at, expires_at[\s\S]{0,260}clock_timestamp\(\)/,
        'session creation must not inherit transaction-start time in a long-running worker transaction');
    assert.match(migration, /match_id, side, user_id, session_id, created_at[\s\S]{0,180}clock_timestamp\(\)/,
        'durable links must record wall-clock creation rather than transaction-start time');
    assert.match(migration, /REVOKE EXECUTE ON FUNCTION public\.create_trivia_pvp_session_v2/);
    assert.match(
        migration,
        /has_table_privilege\('authenticated', 'public\.trivia_pvp_queue', '(?:UPDATE|INSERT,UPDATE,DELETE)'\)/,
    );
});

test('the containment suite is wired into build and the blocking PR guard', () => {
    assert.match(pkg.scripts['test:trivia-pvp-containment'], /trivia-pvp-containment\.test\.mjs/);
    assert.match(pkg.scripts.prebuild, /trivia-pvp-containment\.test\.mjs/);
    assert.match(guard, /import '\.\/trivia-pvp-containment\.test\.mjs'/);
    assert.match(pkg.scripts['verify:trivia-phase-1-migration'], /phase1-migration-rehearsal\.cjs/);
    assert.match(pkg.scripts['verify:trivia-phase-1-production'], /verify-tournament-system\.js/);
    assert.match(pkg.scripts['smoke:trivia-phase-1-production'], /phase1-production-smoke\.cjs/);
    assert.match(productionSmoke, /competitive database or diamond aggregates changed/);
    assert.match(productionSmoke, /EXPECTED_WORLD_HUB_SHA/);
    assert.match(productionSmoke, /payload\?\.version.*=== expectedWorldHubSha/s);
    assert.match(productionSmoke, /signInWithPassword/);
    assert.match(productionSmoke, /temporaryFixtureRemoved: true/);
    assert.match(productionSmoke, /expectAuthorizedPvpRecovery\(cronHeaders\)/);
    assert.match(productionSmoke, /expected an empty contained queue/);
    assert.match(productionSmoke, /\.range\(offset, offset \+ 999\)/);
    assert.match(productionSmoke, /\['upcoming', 'registration', 'active'\]/);
    assert.match(productionSmoke, /databaseProjectRef: PROJECT_REF/);
});

test('destructive migration rehearsal defaults to clone or staging and refuses production', () => {
    assert.match(migrationRehearsal, /TRIVIA_PHASE1_REHEARSAL_TARGET=clone\|staging\|local/);
    assert.match(migrationRehearsal, /TRIVIA_PHASE1_ALLOW_PRODUCTION_REHEARSAL=true/);
    assert.match(migrationRehearsal, /productionTarget && !productionBreakGlass/);
    assert.match(migrationRehearsal, /Refusing rollback rehearsal against the live project/);
});

test('production verifier counts containment tables using columns the migration creates', () => {
    const configuredColumns = [...productionVerifier.matchAll(
        /^\s{4}(trivia_pvp_(?:session_links|active_seats|settlement_decisions)|competitive_quarantine): '([^']+)',$/gm,
    )].map(([, table, column]) => ({ table, column }));

    assert.deepEqual(configuredColumns, [
        { table: 'trivia_pvp_session_links', column: 'match_id' },
        { table: 'trivia_pvp_active_seats', column: 'match_id' },
        { table: 'trivia_pvp_settlement_decisions', column: 'match_id' },
        { table: 'competitive_quarantine', column: 'entity_type' },
    ]);

    for (const { table, column } of configuredColumns) {
        const tableStart = migration.indexOf(`CREATE TABLE public.${table} (`);
        assert.ok(tableStart >= 0, `${table} must be created by the Phase 1 migration`);
        const tableEnd = migration.indexOf('\n);', tableStart);
        assert.ok(tableEnd > tableStart, `${table} definition must be complete`);
        const tableDefinition = migration.slice(tableStart, tableEnd);
        assert.match(tableDefinition, new RegExp(`\\b${column}\\b`));
    }
});

test('production verifier proves catalog containment and rollback-only browser abuse', () => {
    assert.match(productionVerifier, /await verifyPhase1ProductionDatabase\(check\)/);
    assert.match(productionDatabaseVerifier, /has_table_privilege/);
    assert.match(productionDatabaseVerifier, /has_function_privilege/);
    assert.match(productionDatabaseVerifier, /FROM pg_policies/);
    assert.match(productionDatabaseVerifier, /permissive, cmd, roles::text AS roles, qual, with_check/);
    assert.match(productionDatabaseVerifier, /information_schema\.role_column_grants/);
    assert.match(productionDatabaseVerifier, /FROM pg_trigger/);
    assert.match(productionDatabaseVerifier, /trigger\.tgtype::integer/);
    assert.match(productionDatabaseVerifier, /convalidated/);
    assert.match(productionDatabaseVerifier, /indisvalid AND index\.indisready/);
    assert.match(productionDatabaseVerifier, /reason_code = 'legacy_abandoned_human_horse_refund_incident'/);
    assert.match(productionDatabaseVerifier, /reason_code = 'legacy_8_horse_184_pool_unsettled'/);
    assert.match(productionDatabaseVerifier, /q\.expected_pvp === 4 && q\.actual_pvp === 4/);
    assert.match(productionDatabaseVerifier, /q\.expected_tournament === 1 && q\.actual_tournament === 1/);
    assert.match(productionDatabaseVerifier, /tournament_prize: \{ count: 16, net: 4600, missing: 0 \}/);
    assert.match(productionDatabaseVerifier, /create_trivia_session_v2\(uuid,uuid,text,uuid\[\],jsonb,uuid\)/);
    assert.match(productionDatabaseVerifier, /enter_trivia_tournament_v2\(uuid,uuid\)/);
    assert.match(productionDatabaseVerifier, /for \(const role of \['authenticated', 'anon'\]\)/);
    assert.match(productionDatabaseVerifier, /await setProbeRole\(client, role/);
    assert.match(productionDatabaseVerifier, /error\.code === '42501'/);
    assert.match(productionDatabaseVerifier, /await client\.query\('ROLLBACK'\)/);
    assert.match(productionDatabaseVerifier, /missing_reference_count === 0/);
    assert.match(productionDatabaseVerifier, /duplicate_group_count === 0/);
    assert.match(productionDatabaseVerifier, /REST endpoint does not match SUPABASE_PROJECT_REF/);
});

test('legacy PvP cleanup has no active scheduler or worker routing', () => {
    assert.equal(vercelCronPaths.has('/api/cron/trivia-pvp-cleanup'), false);
    assert.equal(vercelCronPaths.has('/api/cron/pvp-settle'), false,
        'the retained recovery sweep is manual-only while public PvP is contained');
    assert.doesNotMatch(
        openClawDispatcher,
        /^\s*\('\/api\/cron\/trivia-pvp-cleanup'\s*,/m,
    );
    assert.doesNotMatch(
        openClawDispatcher,
        /^\s*'\/api\/cron\/trivia-pvp-cleanup'\s*:/m,
    );
    assert.doesNotMatch(cronHealthRegistry, /name: 'pvp-settle'/);
});
