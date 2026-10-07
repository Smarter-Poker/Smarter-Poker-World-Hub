import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { loadSurface } from './social-poker-card-harness.mjs';
import { validateTriviaAwardResponse } from '../src/lib/trivia/awardResponsePolicy.mjs';
import { getTodayCST } from '../src/lib/trivia/getTodayCST.js';
import {
    expectedSoloTransactionReceipts,
    verifySoloTransactionReceipts,
} from '../src/lib/trivia/settlementReceiptPolicy.mjs';

const ROUTE = 'pages/api/trivia/session-submit.js';
const SOURCE = readFileSync(new URL('../pages/api/trivia/session-submit.js', import.meta.url), 'utf8');
const SESSION = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const SCORE = '33333333-3333-4333-8333-333333333333';
const ORIGINAL_REQUEST = '44444444-4444-4444-8444-444444444444';
const RETRY_REQUEST = '55555555-5555-4555-8555-555555555555';
const QUESTION = '66666666-6666-4666-8666-666666666666';

function response() {
    return {
        statusCode: 200,
        body: null,
        headers: {},
        headersSent: false,
        setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; this.headersSent = true; return this; },
    };
}

function submittedSession(settlementResult) {
    return {
        id: SESSION,
        user_id: USER,
        mode: 'cash',
        question_ids: [QUESTION],
        permutations: { [QUESTION]: [0, 1] },
        status: 'submitted',
        created_at: '2026-10-04T23:58:00.000Z',
        submitted_at: '2026-10-05T00:01:00.000Z',
        expires_at: '2026-10-05T00:04:00.000Z',
        answers: { [QUESTION]: { d: 0, n: 0, at: '2026-10-05T00:00:00.000Z' } },
        settlement_result: settlementResult,
        settlement_request_id: ORIGINAL_REQUEST,
        score: 100,
        correct_count: 1,
        diamonds_awarded: 0,
        engine_version: null,
        contract_signature: null,
        entry_cost: 0,
        entry_state: 'vip',
    };
}

function loadReplayRoute(session) {
    const calls = { tables: [], rpc: [], updates: [] };
    const client = {
        from(table) {
            calls.tables.push(table);
            if (table !== 'trivia_sessions') {
                throw new Error(`unexpected mutable replay read: ${table}`);
            }
            const query = {
                select() { return this; },
                eq() { return this; },
                maybeSingle: async () => ({ data: session, error: null }),
                update(value) { calls.updates.push(value); return this; },
            };
            return query;
        },
        async rpc(name, args) {
            calls.rpc.push({ name, args });
            throw new Error(`unexpected replay RPC: ${name}`);
        },
    };
    const { module, exposed } = loadSurface(ROUTE, {
        expose: ['projectStoredLegacySettlement'],
        mocks: {
            '../../../src/lib/serverAuth': {
                getServerUserWithFallback: async () => ({ user: { id: USER }, error: null }),
            },
            '../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: { write: {} } },
            '../../../src/lib/apiErrorHandler': { reportApiError: () => {} },
            './tournament-lifecycle': {
                serviceClient: () => client,
                deterministicOptionOrder: count => Array.from({ length: count }, (_, index) => index),
                optionOrderSeed: () => 'seed',
            },
            '../../../src/lib/trivia/diamondCap': {
                getDailyDiamondsEarned: async () => 0,
                clampToCap: (_earned, award) => award,
            },
            '../../../src/lib/trivia/getTodayCST': { getTodayCST, getTodayStartCST: () => '' },
            '../../../src/lib/trivia/triviaEngine': {
                calculateDiamonds: () => 0,
                DAILY_DIAMOND_CAPS: { cash: 40 },
                getModeConfig: () => ({ timeLimit: 180 }),
            },
            '../../../src/lib/trivia/arcadeStakes': {
                computeStakePot: () => ({ pot: 0, answered: 0 }),
                ARCADE_MAX_RUN_PAYOUT: 0,
                CASH_OUT_MIN_ANSWERED: 3,
            },
            '../../../src/lib/trivia/pvpReleaseControl.mjs': {
                isTriviaPvpReleased: () => true,
                rejectUnavailableTriviaPvp: () => { throw new Error('not pvp'); },
            },
            '../../../src/lib/trivia/tournamentReleaseControl.mjs': {
                areTriviaTournamentsReleased: () => true,
                rejectUnavailableTriviaTournament: () => { throw new Error('not a tournament'); },
            },
            '../../../src/lib/trivia/awardResponsePolicy.mjs': { validateTriviaAwardResponse },
            '../../../src/lib/trivia/phase3Engine.mjs': {
                CLIENT_TIMING_FIELDS: [],
                SELF_GRADED_FIELDS: [],
                findForbiddenFields: () => [],
                v3ErrorStatus: () => 409,
            },
            '../../../src/lib/trivia/settlementReceiptPolicy.mjs': {
                expectedSoloTransactionReceipts,
                verifySoloTransactionReceipts,
            },
        },
    });
    return { handler: module.default, exposed, calls };
}

async function replay(handler) {
    const res = response();
    await handler({
        method: 'POST',
        body: { sessionId: SESSION, answers: [], requestId: RETRY_REQUEST },
        headers: {},
    }, res);
    return res;
}

test('a submitted legacy session replays its sealed response before any mutable grading read', async () => {
    const immutableReview = [{
        questionId: QUESTION,
        wasCorrect: true,
        correctDisplayIndex: 0,
        outcome: 'correct',
        voided: false,
    }];
    const snapshot = {
        success: true,
        sessionId: SESSION,
        mode: 'cash',
        correct: 1,
        total: 1,
        servedTotal: 1,
        voided: 0,
        score: 100,
        scoreId: SCORE,
        diamondsAwarded: 0,
        dailyBonusAwarded: 0,
        newBalance: 90,
        replayed: false,
        deadlinePassed: false,
        perQuestion: immutableReview,
        receipt: { requestId: ORIGINAL_REQUEST },
    };
    const session = submittedSession({
        success: true,
        session_id: SESSION,
        score: 100,
        correct_count: 1,
        diamonds_awarded: 0,
        score_id: SCORE,
        daily_bonus_awarded: 0,
        new_balance: 90,
        replayed: false,
        api_response_v1: snapshot,
    });
    const { handler, calls } = loadReplayRoute(session);
    const res = await replay(handler);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.perQuestion, immutableReview);
    assert.equal(res.body.replayed, true);
    assert.equal(res.body.receipt.requestId, ORIGINAL_REQUEST);
    assert.notEqual(res.body.receipt.requestId, RETRY_REQUEST, 'a retry cannot replace durable request identity');
    assert.deepEqual(calls.rpc, []);
    assert.deepEqual(calls.updates, []);
    assert.deepEqual([...new Set(calls.tables)], ['trivia_sessions']);
});

test('a historical settlement without a review returns only immutable fields it actually stored', async () => {
    const session = submittedSession({
        success: true,
        session_id: SESSION,
        score: 100,
        correct_count: 1,
        diamonds_awarded: 0,
        score_id: SCORE,
        daily_bonus_awarded: 0,
        new_balance: 90,
        replayed: false,
    });
    const { handler, calls } = loadReplayRoute(session);
    const res = await replay(handler);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.correct, 1);
    assert.equal(res.body.score, 100);
    assert.equal(res.body.replayed, true);
    assert.equal(res.body.receipt.requestId, ORIGINAL_REQUEST);
    assert.equal(Object.hasOwn(res.body, 'total'), false);
    assert.equal(Object.hasOwn(res.body, 'perQuestion'), false);
    assert.deepEqual(calls.rpc, []);
    assert.deepEqual(calls.updates, []);
    assert.deepEqual([...new Set(calls.tables)], ['trivia_sessions']);
});

test('a malformed stored request identity fails closed instead of echoing caller identity', async () => {
    const session = submittedSession({
        success: true,
        session_id: SESSION,
        score: 100,
        correct_count: 1,
        diamonds_awarded: 0,
        score_id: SCORE,
        daily_bonus_awarded: 0,
        new_balance: 90,
        replayed: false,
    });
    session.settlement_request_id = 'not-a-request-uuid';
    const { handler, calls } = loadReplayRoute(session);
    const res = await replay(handler);

    assert.equal(res.statusCode, 502);
    assert.deepEqual(res.body, { success: false, error: 'settlement_receipt_unavailable' });
    assert.deepEqual(calls.rpc, []);
    assert.deepEqual(calls.updates, []);
});

test('a first legacy settlement is atomically sealed by the award RPC and can be projected exactly', () => {
    const baseAward = {
        success: true,
        session_id: SESSION,
        score: 100,
        correct_count: 1,
        diamonds_awarded: 0,
        score_id: SCORE,
        daily_bonus_awarded: 0,
        new_balance: 90,
        replayed: false,
    };
    const atomicSnapshot = {
        success: true,
        sessionId: SESSION,
        mode: 'cash',
        correct: 1,
        total: 1,
        servedTotal: 1,
        voided: 0,
        score: 100,
        scoreId: SCORE,
        diamondsAwarded: 0,
        dailyBonusAwarded: 0,
        newBalance: 90,
        replayed: false,
        deadlinePassed: false,
        perQuestion: [{
            questionId: QUESTION,
            wasCorrect: true,
            correctDisplayIndex: 0,
            outcome: 'correct',
            voided: false,
        }],
    };
    const stored = { ...baseAward, api_response_v1: atomicSnapshot };
    const session = submittedSession(stored);
    const { exposed } = loadReplayRoute(session);
    const projected = exposed.projectStoredLegacySettlement(session);
    assert.equal(projected.ok, true);
    assert.equal(projected.response.replayed, true);
    assert.deepEqual(projected.response.perQuestion, atomicSnapshot.perQuestion);
    assert.match(SOURCE, /\.rpc\('award_trivia_run_v4'/);
    assert.match(SOURCE, /p_settlement_snapshot: \{ deadlinePassed, perQuestion \}/);
    assert.match(SOURCE, /canonicalJson\(award\?\.api_response_v1\) !== canonicalJson\(response\)/);
    assert.doesNotMatch(SOURCE, /\.update\(\{ settlement_result:/);
});

test('the submitted replay branch precedes both live question projections in source', () => {
    const replayBranch = SOURCE.indexOf('if (replaying)');
    const questionRead = SOURCE.indexOf(".from('trivia_question_revisions')", replayBranch);
    const eligibilityRead = SOURCE.indexOf(".from('trivia_question_eligibility_v1')", replayBranch);
    assert.ok(replayBranch >= 0 && replayBranch < questionRead && replayBranch < eligibilityRead);
    assert.match(SOURCE, /chicagoDate: getTodayCST\(createdAt\)/);
    assert.doesNotMatch(SOURCE, /chicagoDate: getTodayCST\(submittedAt\)/);
});
