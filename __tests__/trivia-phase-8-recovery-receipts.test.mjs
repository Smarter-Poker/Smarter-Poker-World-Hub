import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadSurface } from './social-poker-card-harness.mjs';

import {
    clearSoloRunRecovery,
    createSoloRunRecovery,
    readSoloRunRecovery,
    soloRunRecoveryKey,
    writeSoloRunRecovery,
} from '../src/lib/trivia/soloRunRecovery.mjs';
import {
    createAccountOperationScope,
    isStaleAccountOperation,
    staleAccountOperationError,
} from '../src/lib/trivia/accountOperationScope.mjs';
import {
    sanitizeSolverAnalysis,
    sanitizeStrategyContext,
} from '../src/lib/trivia/strategyContextPolicy.mjs';
import {
    expectedSoloTransactionReceipts,
    verifySoloTransactionReceipts,
} from '../src/lib/trivia/settlementReceiptPolicy.mjs';
import {
    canRenderStrategyVisualCard,
    isStrategyVisualCardCategory,
    isStrategyVisualCardMode,
} from '../src/lib/trivia/strategyVisualCardPolicy.mjs';
import {
    isTerminalEndlessHighScoreProjection,
} from '../src/lib/trivia/highScoreProjectionPolicy.mjs';
import {
    isAuthoritativeRetirementCode,
    triviaRunErrorCode,
} from '../src/lib/trivia/runRecoveryPolicy.mjs';

const SESSION = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const REQUEST = '33333333-3333-4333-8333-333333333333';
const VERIFIED_EV = {
    contract: 'trivia-solver-ev/1',
    value: 1.25,
    unit: 'bb',
    source: 'solved_spots_gold.strategy_matrix_v2.hand_evs_bb',
    aggregation: 'live_combo_class_mean',
    provenance: {
        authority: 'training_solver_provenance_authority',
        catalog: 'training_solver_artifact_catalog',
        artifact_id: '11111111-1111-4111-8111-111111111111',
        scenario_hash: 'cash_turn_btn_bb',
        solver: 'PioSOLVER',
        solver_version: 'PioSOLVER-pro 3.8.0',
        solver_binary_checksum: 'a'.repeat(64),
        pipeline_commit: 'b'.repeat(40),
        manifest_version: 'solver-manifest-v1',
        manifest_checksum: 'c'.repeat(64),
        source_artifact_checksum: 'd'.repeat(64),
        source_combo_order_sha256: 'e'.repeat(64),
        training_game_contracts_sha256: 'f'.repeat(64),
        audited_at: '2026-10-05T17:00:00.000Z',
    },
};

function memoryStorage() {
    const values = new Map();
    return {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
        removeItem: key => values.delete(key),
    };
}

function jsonResponse(status, body) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
    };
}

function loadRecoveryHook({ accountId = USER, mode = 'daily', storage = memoryStorage(), fetchImpl } = {}) {
    const calls = [];
    const activeRun = { acquired: 0, released: 0, active: 0 };
    const fetch = async (url, init = {}) => {
        calls.push({ url, body: JSON.parse(init.body || '{}') });
        return fetchImpl
            ? fetchImpl(url, init, calls.length)
            : jsonResponse(200, {
                success: true,
                sessionId: SESSION,
                questions: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', options: ['A', 'B'] }],
                entryCost: 10,
                entryState: 'charged',
            });
    };
    const { module } = loadSurface('src/hooks/useServerGradedRun.js', {
        mocks: {
            '../lib/trivia/soloRunRecovery.mjs': {
                clearSoloRunRecovery,
                createSoloRunRecovery,
                readSoloRunRecovery,
                writeSoloRunRecovery,
            },
            '../lib/trivia/accountOperationScope.mjs': {
                createAccountOperationScope,
                isStaleAccountOperation,
                staleAccountOperationError,
            },
            '../lib/trivia/activeRunSignal.mjs': {
                acquireActiveTriviaRun: () => {
                    activeRun.acquired += 1;
                    activeRun.active += 1;
                    let released = false;
                    return () => {
                        if (released) return;
                        released = true;
                        activeRun.released += 1;
                        activeRun.active -= 1;
                    };
                },
            },
            '../lib/trivia/highScoreProjectionPolicy.mjs': {
                isTerminalEndlessHighScoreProjection,
            },
            '../lib/trivia/runRecoveryPolicy.mjs': {
                isAuthoritativeRetirementCode,
                triviaRunErrorCode,
            },
        },
        globals: { window: { localStorage: storage }, fetch },
    });
    return {
        activeRun,
        calls,
        hook: module.default(mode, accountId == null ? {} : { accountId }),
        storage,
    };
}

function loadSessionAnswer({ rpcResult, engineVersion = 'trivia-engine/3' } = {}) {
    const calls = { from: [], rpc: [] };
    const session = {
        id: SESSION,
        user_id: USER,
        mode: 'gto',
        status: 'open',
        question_ids: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
        permutations: {},
        created_at: '2026-10-05T18:00:00Z',
        engine_version: engineVersion,
    };
    const client = {
        from(table) {
            calls.from.push(table);
            if (table !== 'trivia_sessions') throw new Error(`unexpected table read: ${table}`);
            return {
                select: () => ({
                    eq: () => ({ maybeSingle: async () => ({ data: session, error: null }) }),
                }),
            };
        },
        async rpc(name, args) {
            calls.rpc.push({ name, args });
            return { data: rpcResult, error: null };
        },
    };
    const { module } = loadSurface('pages/api/trivia/session-answer.js', {
        mocks: {
            '../../../src/lib/serverAuth': {
                getServerUserWithFallback: async () => ({ user: { id: USER }, error: null }),
            },
            '../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: {} },
            '../../../src/lib/apiErrorHandler': { reportApiError: () => {} },
            './tournament-lifecycle': {
                serviceClient: () => client,
                deterministicOptionOrder: () => [0, 1],
                optionOrderSeed: () => 'seed',
            },
            '../../../src/lib/trivia/pvpReleaseControl.mjs': {
                isTriviaPvpReleased: () => true,
                rejectUnavailableTriviaPvp: () => { throw new Error('unexpected pvp refusal'); },
            },
            '../../../src/lib/trivia/tournamentReleaseControl.mjs': {
                areTriviaTournamentsReleased: () => true,
                rejectUnavailableTriviaTournament: () => { throw new Error('unexpected tournament refusal'); },
            },
            '../../../src/lib/trivia/awardResponsePolicy.mjs': {
                validateTriviaSessionAnswerReceipt: () => ({ ok: true, storedDisplayIndex: 0, fresh: true }),
            },
            '../../../src/lib/trivia/phase3Engine.mjs': {
                CLIENT_TIMING_FIELDS: [],
                SELF_GRADED_FIELDS: [],
                findForbiddenFields: () => [],
                v3ErrorStatus: code => code === 'question_not_in_session' ? 400 : 500,
            },
            '../../../src/lib/trivia/strategyContextPolicy.mjs': { sanitizeSolverAnalysis: () => null },
        },
    });
    return { calls, handler: module.default };
}

function apiResponse() {
    return {
        headers: {},
        headersSent: false,
        statusCode: 200,
        body: null,
        setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; this.headersSent = true; return this; },
    };
}

function loadGtoRenderReview(reviewResult) {
    const calls = [];
    const client = {
        async rpc(name, args) {
            calls.push({ name, args });
            return { data: reviewResult, error: null };
        },
    };
    const { module } = loadSurface('pages/api/trivia/render-gto-panel.js', {
        mocks: {
            '../../../src/lib/serverAuth': {
                getServerUserWithFallback: async () => ({ user: { id: USER }, error: null }),
            },
            '../../../src/lib/supabaseServerClient': { createClient: () => client },
            '../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: { write: {} } },
            '../../../src/lib/apiErrorHandler': { reportApiError: () => {} },
            '../../../src/lib/trivia/gtoRenderSingleflight.mjs': {
                renderGtoPanelSingleflight: async () => { throw new Error('paid render must not run'); },
            },
            '../../../src/lib/trivia/strategyContextPolicy.mjs': { sanitizeSolverAnalysis: () => null },
            '../../../src/lib/trivia/phase3Engine.mjs': {
                v3ErrorStatus: error => error === 'answer_not_bound' ? 409 : 500,
            },
            '../../../src/lib/trivia/strategyVisualCardPolicy.mjs': {
                canRenderStrategyVisualCard,
                isStrategyVisualCardCategory,
                isStrategyVisualCardMode,
            },
        },
    });
    return { calls, handler: module.default };
}

function answerRequest(body) {
    return { method: 'POST', body, headers: {} };
}

test('solo recovery is scoped, expiring, and retains the exact settlement identity', () => {
    const storage = memoryStorage();
    const now = Date.parse('2026-10-05T18:00:00Z');
    const record = createSoloRunRecovery({
        mode: 'gto', accountId: USER, sessionId: SESSION, phase: 'settling',
        settlementRequestId: REQUEST, createdAt: now, expiresAt: '2026-10-05T23:00:00Z',
    });
    assert.ok(record);
    assert.ok(writeSoloRunRecovery(storage, record));
    assert.deepEqual(readSoloRunRecovery(storage, 'gto', USER, now), record);
    assert.equal(readSoloRunRecovery(storage, 'cash', USER, now), null);
    assert.equal(readSoloRunRecovery(storage, 'gto', USER, now + 25 * 60 * 60 * 1000), null);
    assert.match(soloRunRecoveryKey('gto', USER), /gto$/);
});

test('charged solo entry and settlement fail closed when durable custody is unavailable', async () => {
    const withoutAccount = loadRecoveryHook({ accountId: null });
    await assert.rejects(withoutAccount.hook.start({ count: 10 }), error => {
        assert.equal(error.code, 'recovery_custody_unavailable');
        return true;
    });
    assert.equal(withoutAccount.calls.length, 0, 'missing account custody blocks before session-start can charge');

    let writable = true;
    const values = new Map();
    const storage = {
        getItem: key => values.get(key) ?? null,
        setItem(key, value) {
            if (!writable) throw new Error('storage unavailable');
            values.set(key, value);
        },
        removeItem: key => values.delete(key),
    };
    const run = loadRecoveryHook({ storage });
    await run.hook.start({ count: 10 });
    assert.equal(run.calls.length, 1);
    writable = false;
    await assert.rejects(run.hook.submit([]), error => {
        assert.equal(error.code, 'recovery_custody_unavailable');
        return true;
    });
    assert.equal(run.calls.length, 1, 'lost custody blocks before session-submit can settle');
});

test('settlement recovery retires only on an authoritative terminal result or UI acknowledgement', async () => {
    const terminal = loadRecoveryHook({
        fetchImpl: (url) => url.endsWith('/session-start')
            ? jsonResponse(200, { success: true, sessionId: SESSION, questions: [], entryCost: 10, entryState: 'charged' })
            : jsonResponse(409, { success: false, error: 'session_closed' }),
    });
    await terminal.hook.start({ count: 10 });
    assert.ok(readSoloRunRecovery(terminal.storage, 'daily', USER));
    await assert.rejects(terminal.hook.submit([]), error => error.message === 'session_closed');
    assert.equal(readSoloRunRecovery(terminal.storage, 'daily', USER), null);

    const settled = loadRecoveryHook({
        fetchImpl: (url) => url.endsWith('/session-start')
            ? jsonResponse(200, { success: true, sessionId: SESSION, questions: [], entryCost: 10, entryState: 'charged' })
            : jsonResponse(200, { success: true, sessionId: SESSION, diamondsAwarded: 4, receipt: { verified: true } }),
    });
    await settled.hook.start({ count: 10 });
    const receipt = await settled.hook.submit([]);
    assert.equal(receipt.diamondsAwarded, 4);
    assert.equal(readSoloRunRecovery(settled.storage, 'daily', USER)?.phase, 'settling', 'success remains recoverable until rendered');
    assert.equal(settled.hook.acknowledgeSettlement(), true);
    assert.equal(readSoloRunRecovery(settled.storage, 'daily', USER), null);
});

test('settlement replay acquires the live-run lease before submit and releases it on the terminal receipt', async () => {
    const storage = memoryStorage();
    const recovery = createSoloRunRecovery({
        mode: 'daily',
        accountId: USER,
        sessionId: SESSION,
        phase: 'settling',
        settlementRequestId: REQUEST,
        createdAt: Date.now(),
    });
    assert.ok(writeSoloRunRecovery(storage, recovery));
    const run = loadRecoveryHook({
        storage,
        fetchImpl: (url) => {
            assert.match(url, /\/session-submit$/);
            assert.equal(run.activeRun.active, 1, 'the settlement request leaves only while the run lease is held');
            return jsonResponse(200, {
                success: true,
                sessionId: SESSION,
                correct: 8,
                diamondsAwarded: 4,
                receipt: { verified: true },
            });
        },
    });

    const resumed = await run.hook.resume();
    assert.equal(resumed.resumedSettlement, true);
    assert.equal(run.activeRun.acquired, 1);
    assert.equal(run.activeRun.released, 1);
    assert.equal(run.activeRun.active, 0);
    assert.deepEqual(run.calls.map(call => call.url), ['/api/trivia/session-submit']);
});

test('a pending Endless projection keeps custody and the reload-blocking lease through exact retry', async () => {
    let submits = 0;
    const run = loadRecoveryHook({
        mode: 'endless',
        fetchImpl: url => {
            if (url.endsWith('/session-start')) {
                return jsonResponse(200, {
                    success: true,
                    sessionId: SESSION,
                    questions: [],
                    entryCost: 0,
                    entryState: 'free',
                });
            }
            submits += 1;
            return jsonResponse(200, {
                success: true,
                sessionId: SESSION,
                correct: 8,
                diamondsAwarded: 4,
                highScoreProjection: submits === 1
                    ? { status: 'pending', reason: 'projection_unavailable', highScore: null, improved: false }
                    : {
                        status: 'persisted',
                        highScore: 8,
                        verifiedCorrect: 8,
                        improved: true,
                        replayed: true,
                        projectionId: '14141414-1414-4141-8141-141414141414',
                    },
                receipt: { verified: true },
            });
        },
    });
    await run.hook.start({ count: 10 });
    const pending = await run.hook.submit([]);
    assert.equal(pending.highScoreProjection.status, 'pending');
    assert.equal(run.activeRun.active, 1, 'pending projection remains protected from service-worker reload');
    assert.equal(readSoloRunRecovery(run.storage, 'endless', USER)?.phase, 'settling');
    assert.equal(run.hook.acknowledgeSettlement(), false, 'pending projection cannot be falsely acknowledged');

    const replayed = await run.hook.resume();
    assert.equal(replayed.settlement.highScoreProjection.status, 'persisted');
    assert.equal(run.activeRun.active, 0, 'terminal projection releases the live-run lease');
    assert.equal(run.hook.acknowledgeSettlement(), true);
    assert.equal(readSoloRunRecovery(run.storage, 'endless', USER), null);
});

test('challenge settlement custody rejects missing Survival authority and mismatched Endless projection truth', async () => {
    const survivalStorage = memoryStorage();
    assert.ok(writeSoloRunRecovery(survivalStorage, createSoloRunRecovery({
        mode: 'survival',
        accountId: USER,
        sessionId: SESSION,
        phase: 'settling',
        settlementRequestId: REQUEST,
        survivalLevel: 6,
        createdAt: Date.now(),
    })));
    const survival = loadRecoveryHook({
        mode: 'survival',
        storage: survivalStorage,
        fetchImpl: () => jsonResponse(200, {
            success: true,
            sessionId: SESSION,
            correct: 15,
            diamondsAwarded: 4,
            receipt: { verified: true },
        }),
    });
    await assert.rejects(survival.hook.resume(), error => {
        assert.equal(error.code, 'invalid_survival_settlement_authority');
        return true;
    });
    assert.equal(
        readSoloRunRecovery(survivalStorage, 'survival', USER)?.survivalLevel,
        6,
        'the local hint stays recoverable but is never promoted to settlement authority',
    );

    const endless = loadRecoveryHook({
        mode: 'endless',
        fetchImpl: url => url.endsWith('/session-start')
            ? jsonResponse(200, {
                success: true,
                sessionId: SESSION,
                questions: [],
                entryCost: 0,
                entryState: 'free',
            })
            : jsonResponse(200, {
                success: true,
                sessionId: SESSION,
                correct: 5,
                diamondsAwarded: 4,
                highScoreProjection: {
                    status: 'persisted',
                    highScore: 50,
                    verifiedCorrect: 50,
                    improved: true,
                    replayed: false,
                    projectionId: '14141414-1414-4141-8141-141414141414',
                },
                receipt: { verified: true },
            }),
    });
    await endless.hook.start({ count: 10 });
    await assert.rejects(endless.hook.submit([]), error => {
        assert.equal(error.code, 'invalid_endless_settlement_authority');
        return true;
    });
    assert.equal(endless.activeRun.active, 1, 'invalid authority cannot retire the live-run lease');
    assert.equal(readSoloRunRecovery(endless.storage, 'endless', USER)?.phase, 'settling');
    assert.equal(endless.hook.acknowledgeSettlement(), false);
});

test('hook lifecycle cleanup invalidates every in-flight operation before releasing its lease', () => {
    const source = readFileSync('src/hooks/useServerGradedRun.js', 'utf8');
    assert.match(source, /const invalidateLifecycle = \(\) => \{\s*operationScopeRef\.current\.transition\(null\);\s*clearActiveRun\(\);\s*\}/);
    assert.match(source, /operationScopeRef\.current\.transition\(operationIdentity\);[\s\S]*?return invalidateLifecycle/);
    assert.match(source, /const json = await postJson[\s\S]*?requireCurrentOperation\(operationScope\);[\s\S]*?markRunActive\(\)/);

    const lifecycle = createAccountOperationScope('endless\0account-a');
    const pendingStart = lifecycle.capture();
    lifecycle.transition(null);
    assert.equal(lifecycle.isCurrent(pendingStart), false,
        'a response resolving after cleanup cannot become current or acquire a lease');
});

test('a solo UI reset cannot discard custody for a possibly charged session', async () => {
    const run = loadRecoveryHook();
    await run.hook.start({ count: 10 });
    assert.equal(run.activeRun.active, 1);
    const before = readSoloRunRecovery(run.storage, 'daily', USER);
    assert.equal(before?.sessionId, SESSION);

    run.hook.reset();

    assert.equal(run.activeRun.active, 0, 'reset releases the in-memory live-run lease');
    assert.deepEqual(readSoloRunRecovery(run.storage, 'daily', USER), before);
});

test('an Endless timeout survives a lost response and clears only after the exact receipt is replayed', async () => {
    const questionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const storage = memoryStorage();
    const failed = loadRecoveryHook({
        mode: 'endless',
        storage,
        fetchImpl: url => url.endsWith('/session-start')
            ? jsonResponse(200, {
                success: true,
                sessionId: SESSION,
                questions: [{ id: questionId, options: ['A', 'B'] }],
                entryCost: 0,
                entryState: 'free',
            })
            : jsonResponse(503, { success: false, error: 'temporarily_unavailable' }),
    });
    await failed.hook.start({ count: 10 });
    await assert.rejects(
        failed.hook.answer({ questionId, displayIndex: -1 }),
        error => error.message === 'temporarily_unavailable',
    );
    assert.equal(
        readSoloRunRecovery(storage, 'endless', USER)?.pendingTimeoutQuestionId,
        questionId,
        'the expired question is durable before the request leaves and survives an unknown outcome',
    );

    const replay = loadRecoveryHook({
        mode: 'endless',
        storage,
        fetchImpl: url => url.endsWith('/session-start')
            ? jsonResponse(200, {
                success: true,
                sessionId: SESSION,
                questions: [{ id: questionId, options: ['A', 'B'] }],
                entryCost: 0,
                entryState: 'free',
                resumed: true,
            })
            : jsonResponse(200, {
                success: true,
                storedDisplayIndex: -1,
                wasCorrect: false,
                fresh: false,
                nonPaidMissCount: 1,
                runMissLimitReached: false,
            }),
    });
    const resumed = await replay.hook.resume({ count: 10 });
    assert.equal(resumed.pendingTimeoutQuestionId, questionId);
    await replay.hook.answer({ questionId, displayIndex: -1 });
    assert.equal(
        readSoloRunRecovery(storage, 'endless', USER)?.pendingTimeoutQuestionId,
        null,
        'only the authoritative answer receipt retires the timeout custody',
    );
});

test('invalid answers use one atomic RPC and durable void retries never reveal an answer key', async () => {
    const questionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const invalid = loadSessionAnswer({
        rpcResult: { success: true, recorded: true, duplicate: false, correctDisplayIndex: 1, explanation: 'must not escape' },
    });
    const invalidRes = apiResponse();
    await invalid.handler(answerRequest({
        sessionId: SESSION,
        questionId,
        displayIndex: 3,
        invalidQuestion: true,
        clientNonce: REQUEST,
    }), invalidRes);
    assert.equal(invalidRes.statusCode, 200);
    assert.deepEqual(invalid.calls.rpc, [{
        name: 'trivia_record_invalid_question_v1',
        args: {
            p_session_id: SESSION,
            p_user_id: USER,
            p_question_id: questionId,
            p_client_nonce: REQUEST,
        },
    }]);
    assert.deepEqual(invalid.calls.from, ['trivia_sessions'], 'the API does not split eligibility read from the locked write');
    assert.deepEqual(invalidRes.body, {
        success: true,
        sessionId: SESSION,
        questionId,
        recorded: true,
        fresh: true,
        storedDisplayIndex: -1,
        outcome: 'voided',
        voided: true,
    });

    const duplicate = loadSessionAnswer({
        rpcResult: {
            success: true,
            recorded: true,
            duplicate: true,
            storedDisplayIndex: -1,
            outcome: 'voided',
            voided: true,
            wasCorrect: true,
            correctDisplayIndex: 2,
            explanation: 'must not escape',
        },
    });
    const duplicateRes = apiResponse();
    await duplicate.handler(answerRequest({ sessionId: SESSION, questionId, displayIndex: 0 }), duplicateRes);
    assert.equal(duplicateRes.statusCode, 200);
    assert.equal(duplicate.calls.rpc[0].name, 'trivia_solo_answer_v1');
    assert.deepEqual(duplicate.calls.from, ['trivia_sessions'], 'durable void returns before any key or solver lookup');
    assert.deepEqual(duplicateRes.body, {
        success: true,
        sessionId: SESSION,
        questionId,
        recorded: true,
        fresh: false,
        storedDisplayIndex: -1,
        outcome: 'voided',
        voided: true,
    });

    const legacy = loadSessionAnswer({
        engineVersion: null,
        rpcResult: {
            success: true,
            recorded: true,
            duplicate: true,
            fresh: false,
            storedDisplayIndex: -1,
            outcome: 'voided',
            voided: true,
            stored: { d: -1, n: 0, v: true, vr: 'audit' },
        },
    });
    const legacyRes = apiResponse();
    await legacy.handler(answerRequest({
        sessionId: SESSION,
        questionId,
        displayIndex: 0,
        clientNonce: REQUEST,
    }), legacyRes);
    assert.equal(legacyRes.statusCode, 200);
    assert.deepEqual(legacy.calls.rpc[0], {
        name: 'trivia_solo_answer_v1',
        args: {
            p_session_id: SESSION,
            p_user_id: USER,
            p_question_id: questionId,
            p_display_index: 0,
            p_client_nonce: REQUEST,
        },
    });
    assert.deepEqual(legacy.calls.from, ['trivia_sessions'], 'legacy durable void also returns before the key lookup');
    assert.deepEqual(legacyRes.body, {
        success: true,
        sessionId: SESSION,
        questionId,
        recorded: true,
        fresh: false,
        storedDisplayIndex: -1,
        outcome: 'voided',
        voided: true,
    });
});

test('the atomic invalid-question refusal stays retryable without recording a normal skip', async () => {
    const questionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const route = loadSessionAnswer({ rpcResult: { success: false, error: 'question_still_valid' } });
    const response = apiResponse();
    await route.handler(answerRequest({ sessionId: SESSION, questionId, invalidQuestion: true }), response);
    assert.equal(response.statusCode, 409);
    assert.deepEqual(response.body, { success: false, error: 'question_still_valid', retryable: true });
    assert.deepEqual(route.calls.rpc.map(call => call.name), ['trivia_record_invalid_question_v1']);
});

test('GTO renders are answer-gated by the immutable bound-revision review RPC', async () => {
    const questionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const locked = loadGtoRenderReview({ success: false, error: 'answer_not_bound' });
    const lockedRes = apiResponse();
    await locked.handler({
        method: 'POST',
        headers: { authorization: 'Bearer test-token' },
        body: { question_id: questionId, session_id: SESSION },
    }, lockedRes);
    assert.equal(lockedRes.statusCode, 409);
    assert.deepEqual(lockedRes.body, { success: false, error: 'answer_not_bound' });
    assert.deepEqual(locked.calls, [{
        name: 'trivia_session_question_review_v1',
        args: { p_session_id: SESSION, p_user_id: USER, p_question_id: questionId },
    }]);

    const wrongMode = loadGtoRenderReview({ success: true, mode: 'daily' });
    const wrongModeRes = apiResponse();
    await wrongMode.handler({
        method: 'POST',
        headers: { authorization: 'Bearer test-token' },
        body: { question_id: questionId, session_id: SESSION },
    }, wrongModeRes);
    assert.equal(wrongModeRes.statusCode, 400);
    assert.deepEqual(wrongModeRes.body, { success: false, error: 'unsupported_session_mode' });

    const voided = loadGtoRenderReview({ success: true, mode: 'gto', outcome: 'voided', voided: true });
    const voidedRes = apiResponse();
    await voided.handler({
        method: 'POST',
        headers: { authorization: 'Bearer test-token' },
        body: { question_id: questionId, session_id: SESSION },
    }, voidedRes);
    assert.equal(voidedRes.statusCode, 422);
    assert.deepEqual(voidedRes.body, { success: false, error: 'solver_analysis_unavailable' });
    assert.deepEqual(voided.calls, [{
        name: 'trivia_session_question_review_v1',
        args: { p_session_id: SESSION, p_user_id: USER, p_question_id: questionId },
    }]);
});

test('strategy projections expose table facts and real solver numbers without answer-bearing metadata', () => {
    const raw = {
        scenario: { heroPosition: 'btn', villainPosition: 'bb', stackDepthBb: 45, street: 'turn', board: 'Ah 7d 2c' },
        correct_index: 2,
        explanation: 'secret',
        answer_schema: 'secret',
        gtoFrequencies: { raise: 75, call: 25, exploit: 99 },
        evData: { ...VERIFIED_EV, answer: 'raise' },
    };
    assert.deepEqual(sanitizeStrategyContext(raw), {
        heroPosition: 'BTN', villainPosition: 'BB', stackDepthBb: 45,
        street: 'turn', board: ['AH', '7D', '2C'],
    });
    const analysis = sanitizeSolverAnalysis(raw);
    assert.deepEqual(analysis.frequencies, { RAISE: 75, CALL: 25 });
    assert.equal(analysis.ev.value, 1.25);
    assert.equal(analysis.ev.unit, 'bb');
    assert.equal(analysis.ev.source, VERIFIED_EV.source);
    assert.equal(analysis.ev.provenance.authority, 'training_solver_provenance_authority');
    assert.equal(analysis.source, VERIFIED_EV.source);
    assert.doesNotMatch(JSON.stringify(sanitizeStrategyContext(raw)), /secret|correct_index|explanation/);
    assert.doesNotMatch(JSON.stringify(sanitizeSolverAnalysis(raw)), /secret|answer_schema|exploit/i);

    assert.deepEqual(sanitizeSolverAnalysis({
        gtoFrequencies: { b525: 0.6, c: 0.3, f: 0.1, 'bad<script>': 1 },
    }), {
        frequencies: { B525: 60, C: 30, F: 10 },
        ev: null,
        source: 'server_metadata',
    });
    assert.deepEqual(sanitizeSolverAnalysis({
        gtoFrequencies: { raise: 99, call: 1 },
    })?.frequencies, { RAISE: 99, CALL: 1 });
    assert.equal(sanitizeSolverAnalysis({
        gtoFrequencies: { raise: 0.5, call: 50 },
    }), null);
    assert.equal(sanitizeSolverAnalysis({ evData: { value: 1.25, unit: 'bb' } }), null);
});

test('settlement receipts require every expected deterministic wallet row and exact amount', () => {
    const expected = expectedSoloTransactionReceipts({
        sessionId: SESSION, userId: USER, mode: 'daily', entryCost: 0, entryState: 'free',
        diamondsAwarded: 15, dailyBonusAwarded: 10, chicagoDate: '2026-10-05',
    });
    assert.deepEqual(expected.map(item => item.referenceId), [
        `trivia_session_${SESSION}`,
        `trivia_daily_bonus_${USER}_2026-10-05`,
    ]);
    const rows = expected.map((item, index) => ({
        id: index === 0 ? '44444444-4444-4444-8444-444444444444' : '55555555-5555-4555-8555-555555555555',
        reference_id: item.referenceId,
        amount: item.amount,
        type: item.role === 'reward' ? 'trivia_run' : 'trivia_daily_bonus',
        balance_after: 100 + index,
        created_at: '2026-10-05T18:00:00Z',
    }));
    assert.equal(verifySoloTransactionReceipts(expected, rows).ok, true);
    assert.deepEqual(verifySoloTransactionReceipts(expected, rows.slice(0, 1)), {
        ok: false, error: 'transaction_receipt_missing', receipts: [],
    });
});

test('routes wire account-bound resume, settlement replay, answer reconstruction and durable receipts', () => {
    const hook = readFileSync(new URL('../src/hooks/useServerGradedRun.js', import.meta.url), 'utf8');
    const answer = readFileSync(new URL('../pages/api/trivia/session-answer.js', import.meta.url), 'utf8');
    const start = readFileSync(new URL('../pages/api/trivia/session-start.js', import.meta.url), 'utf8');
    const submit = readFileSync(new URL('../pages/api/trivia/session-submit.js', import.meta.url), 'utf8');
    const gtoPanel = readFileSync(new URL('../pages/api/trivia/render-gto-panel.js', import.meta.url), 'utf8');
    const migration = readFileSync(new URL('../supabase/migrations/20261005182000_trivia_p8_solo_integrity.sql', import.meta.url), 'utf8');
    assert.match(hook, /recovery\.phase !== 'settling'/);
    assert.match(hook, /sessionRef\.current = recovery\.sessionId/);
    assert.match(hook, /const settlement = await submit\(\[\], \{ recovering: true \}\)/);
    assert.match(hook, /An auth or mode boundary invalidates every in-memory capability/);
    assert.match(start, /answerState: state/);
    assert.match(start, /sanitizeStrategyContext/);
    assert.match(start, /trivia_session_answers/);
    assert.match(answer, /invalidQuestion === true/);
    assert.match(answer, /trivia_record_invalid_question_v1/);
    assert.match(answer, /trivia_solo_answer_v1/);
    assert.match(answer, /question_still_valid/);
    assert.match(answer, /answer_already_recorded/);
    assert.match(answer, /const durableVoid = v3\.voided === true/);
    assert.match(answer, /recorded\?\.stored\?\.v === true/);
    assert.doesNotMatch(answer.slice(answer.indexOf('if (durableVoid)'), answer.indexOf('// Verdicts exist only')), /correctDisplayIndex|explanation|solverMetadata/);
    assert.match(answer, /body\.solverMetadata = analysis/);
    assert.equal(isAuthoritativeRetirementCode('session_closed'), true,
        'the shared recovery policy, not a duplicated hook literal, owns terminal retirement');
    assert.match(hook, /recovery_custody_unavailable/);
    assert.match(hook, /if \(mode !== 'pvp' && !accountId\) throw recoveryCustodyError\(\)/);
    assert.match(hook, /const verified = written[\s\S]*readSoloRunRecovery/);
    assert.match(submit, /readSoloSettlementReceipt/);
    assert.match(submit, /\.from\('diamond_transactions'\)/);
    assert.match(submit, /receipt: evidence\.receipt/);
    assert.match(submit, /const voidedIds = new Set/);
    assert.match(submit, /outcome: 'voided'/);
    assert.match(submit, /stored roster is malformed/);
    assert.match(submit, /keyById\.size !== rosterIds\.length/);
    assert.match(submit, /eligibilityById\.size !== rosterIds\.length/);
    assert.match(submit, /\.rpc\('award_trivia_run_v5'/);
    assert.match(migration, /p_completion_answered/);
    assert.match(migration, /p_completion_total/);
    assert.match(migration, /count\(\*\) FILTER \(WHERE a\.outcome IS NOT NULL[\s\S]*INTO v_completion_answered/);
    assert.doesNotMatch(migration, /\(g ->> 'answered'\)::int \+ \(g ->> 'voided'\)::int/);
    assert.match(migration, /trivia_session_settle_solo_v4/);
    assert.doesNotMatch(migration, /coalesce\(p\.is_horse, false\) IS FALSE/);
    assert.match(gtoPanel, /sanitizeSolverAnalysis/);
    assert.match(gtoPanel, /solver_analysis_unavailable/);
    assert.match(gtoPanel, /trivia_session_question_review_v1/);
    assert.match(gtoPanel, /revisionId: review\.revisionId/);
    assert.doesNotMatch(gtoPanel, /\.from\('trivia_questions'\)/);
    assert.match(gtoPanel, /VERIFIED SERVER METADATA/);
    assert.doesNotMatch(gtoPanel, /DIFFICULTY_CONFIDENCE|\+1\.25BB|Mixed strategy for range balance|magenta\/purple/);
});
