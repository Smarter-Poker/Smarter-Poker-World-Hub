import assert from 'node:assert/strict';
import test from 'node:test';

import { loadSurface } from './social-poker-card-harness.mjs';

const ROUTE = 'pages/api/trivia/session-start.js';
const SESSION = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';

const uuid = index => `${String(index).padStart(8, '0')}-0000-4000-8000-${String(index).padStart(12, '0')}`;

function routeSurface() {
    return loadSurface(ROUTE, {
        expose: ['enrichV3StartResponse', 'serveExistingSoloSession'],
        mocks: {
            '../../../src/lib/serverAuth': { getServerUserWithFallback: async () => ({ user: { id: USER } }) },
            '../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: {} },
            '../../../src/lib/apiErrorHandler': { reportApiError: () => {} },
            './tournament-lifecycle': {
                serviceClient: () => null,
                deterministicOptionOrder: count => Array.from({ length: count }, (_, index) => index),
                optionOrderSeed: () => 'seed',
            },
            '../../../src/lib/triviaQuestionLoader': {},
            '../../../src/lib/trivia/triviaEngine': { getCategoriesForMode: () => [], ALL_CATEGORIES: [] },
            '../../../src/lib/trivia/getTodayCST': { getTodayCST: () => '2026-10-05' },
            '../../../src/lib/trivia/pvpSettlementPolicy.mjs': {
                PVP_MATCH_JOIN_WINDOW_MS: 1,
                PVP_QUESTION_COUNT: 20,
                extractPvpRosterIds: () => [],
                samePvpRoster: () => true,
                validatePvpDurableSessionLink: () => ({ ok: true }),
                validatePvpMatch: () => ({ ok: true }),
                validatePvpSessionCreationReceipt: () => ({ ok: true }),
            },
            '../../../src/lib/trivia/pvpReleaseControl.mjs': {
                isTriviaPvpReleased: () => true,
                rejectUnavailableTriviaPvp: () => {},
            },
            '../../../src/lib/trivia/tournamentReleaseControl.mjs': {
                areTriviaTournamentsReleased: () => true,
                rejectUnavailableTriviaTournament: () => {},
            },
            '../../../src/lib/trivia/awardResponsePolicy.mjs': {
                validateTriviaSessionCreationReceipt: () => ({ ok: true }),
                validateTriviaSessionDeadline: () => ({ ok: true }),
                validateTriviaSessionRoster: questionIds => ({ ok: true, questionIds }),
            },
            '../../../src/lib/trivia/phase3Engine.mjs': {
                ELIGIBLE_SERVING_SOURCE: '',
                FREE_FALLBACK_SOURCE: '',
                FREE_MODES: new Set(),
                isFreeLegacyFallbackEnabled: () => false,
                isShadowSelectorEnabled: () => false,
                isSoloEngineV3Enabled: () => true,
                toSoloStartResponse: value => value,
                v3ErrorStatus: () => 500,
            },
            '../../../src/lib/trivia/strategyContextPolicy.mjs': {
                sanitizeSolverAnalysis: metadata => metadata?.projectedEv
                    ? { frequencies: { RAISE: 100 }, ev: metadata.projectedEv, source: 'bound-review' }
                    : null,
                sanitizeStrategyContext: metadata => metadata?.safeScenario || null,
            },
        },
    }).exposed;
}

function queryClient({ tableRows, reviews, contextProjection = [] }) {
    const calls = { selects: [], reviews: [], contexts: [] };
    return {
        calls,
        from(table) {
            const query = {
                select(columns) {
                    calls.selects.push({ table, columns });
                    return this;
                },
                eq() { return this; },
                in() { return this; },
                maybeSingle: async () => ({ data: tableRows[table], error: null }),
                then(resolve) {
                    return Promise.resolve({ data: tableRows[table], error: null }).then(resolve);
                },
            };
            return query;
        },
        async rpc(name, args) {
            if (name === 'trivia_session_context_projection_v1') {
                calls.contexts.push(args);
                return { data: { success: true, questions: contextProjection }, error: null };
            }
            assert.equal(name, 'trivia_session_question_review_v1');
            calls.reviews.push(args);
            return { data: reviews[args.p_question_id], error: null };
        },
    };
}

function response() {
    return {
        statusCode: 200,
        body: null,
        headers: {},
        setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
    };
}

test('v3 resume gets answered reveal only from the bound review and keeps voids keyless', async () => {
    const { enrichV3StartResponse } = routeSurface();
    const answeredId = uuid(1);
    const unansweredId = uuid(2);
    const voidedId = uuid(3);
    const authorityVoidedId = uuid(4);
    const answeredRevision = uuid(101);
    const unansweredRevision = uuid(102);
    const voidedRevision = uuid(103);
    const authorityVoidedRevision = uuid(104);
    const questions = [answeredId, unansweredId, voidedId, authorityVoidedId].map((id, position) => ({
        id,
        position: position + 1,
        question: `Question ${position + 1}`,
        options: ['second', 'first'],
        state: position === 1 ? 'unanswered' : 'answered',
    }));
    const client = queryClient({
        tableRows: {
            trivia_sessions: { permutations: {
                [answeredId]: [1, 0], [unansweredId]: [1, 0], [voidedId]: [1, 0],
                [authorityVoidedId]: [1, 0],
            } },
            trivia_session_answers: [
                { question_id: answeredId, revision_id: answeredRevision, display_index: 1, outcome: 'correct', server_voided_at: null },
                { question_id: unansweredId, revision_id: unansweredRevision, display_index: null, outcome: null, server_voided_at: null },
                { question_id: voidedId, revision_id: voidedRevision, display_index: -1, outcome: 'voided', server_voided_at: '2026-10-05T18:00:00Z' },
                { question_id: authorityVoidedId, revision_id: authorityVoidedRevision, display_index: 0, outcome: 'wrong', server_voided_at: null },
            ],
        },
        contextProjection: [
            { questionId: answeredId, engineMetadata: { safeScenario: { street: 'turn' } } },
            { questionId: unansweredId, engineMetadata: { safeScenario: { street: 'flop' } } },
            { questionId: voidedId, engineMetadata: null },
            { questionId: authorityVoidedId, engineMetadata: null },
        ],
        reviews: {
            [answeredId]: {
                success: true,
                questionId: answeredId,
                revisionId: answeredRevision,
                correctIndex: 0,
                explanation: 'Bound explanation',
                engineMetadata: {
                    safeScenario: { street: 'turn' },
                    projectedEv: { value: 1.25, unit: 'bb' },
                },
            },
            [authorityVoidedId]: {
                success: true,
                mode: 'gto',
                questionId: authorityVoidedId,
                position: 4,
                outcome: 'voided',
                voided: true,
            },
        },
    });

    const body = await enrichV3StartResponse(client, 'gto', SESSION, USER, { success: true, questions });

    assert.deepEqual(client.calls.selects, [
        { table: 'trivia_sessions', columns: 'permutations' },
        { table: 'trivia_session_answers', columns: 'question_id, revision_id, display_index, is_correct, outcome, server_voided_at' },
    ]);
    assert.deepEqual(client.calls.reviews, [answeredId, authorityVoidedId].map(p_question_id => ({
        p_session_id: SESSION,
        p_user_id: USER,
        p_question_id,
    })));
    assert.deepEqual(client.calls.contexts, [{ p_session_id: SESSION, p_user_id: USER }]);
    assert.deepEqual(body.questions[0].context, { street: 'turn' });
    assert.deepEqual(body.questions[0].answerState, {
        storedDisplayIndex: 1,
        wasCorrect: true,
        correctDisplayIndex: 1,
        outcome: 'correct',
        explanation: 'Bound explanation',
        solverMetadata: {
            gtoFrequencies: { RAISE: 100 },
            evData: { value: 1.25, unit: 'bb' },
            source: 'bound-review',
        },
    });
    assert.deepEqual(body.questions[1].context, { street: 'flop' }, 'unanswered context comes only from the bound batch projection');
    assert.deepEqual(body.questions[2].answerState, {
        storedDisplayIndex: -1,
        wasCorrect: false,
        outcome: 'voided',
        voided: true,
    });
    assert.deepEqual(body.questions[3].answerState, {
        storedDisplayIndex: -1,
        wasCorrect: false,
        outcome: 'voided',
        voided: true,
    });
});

test('v3 resume cannot fall back to a raw revision after solver authority retires', async () => {
    const { enrichV3StartResponse } = routeSurface();
    const questionId = uuid(4);
    const revisionId = uuid(104);
    const client = queryClient({
        tableRows: {
            trivia_sessions: { permutations: { [questionId]: [0, 1] } },
            trivia_session_answers: [{
                question_id: questionId,
                revision_id: revisionId,
                display_index: 0,
                outcome: 'correct',
                server_voided_at: null,
            }],
        },
        contextProjection: [{ questionId, engineMetadata: null }],
        reviews: {
            [questionId]: {
                success: true,
                questionId,
                revisionId,
                correctIndex: 0,
                explanation: 'Still immutable',
                engineMetadata: null,
            },
        },
    });

    const body = await enrichV3StartResponse(client, 'gto', SESSION, USER, {
        success: true,
        questions: [{ id: questionId, options: ['A', 'B'], state: 'answered' }],
    });

    assert.equal(body.questions[0].answerState.solverMetadata, null);
    assert.equal(Object.hasOwn(body.questions[0], 'context'), false);
    assert.equal(client.calls.selects.some(call => call.table === 'trivia_question_revisions'), false);
});

test('legacy resume uses keyless stored voids plus bound context and answered review projections', async () => {
    const { serveExistingSoloSession } = routeSurface();
    const questionIds = Array.from({ length: 20 }, (_, index) => uuid(index + 10));
    const revisionIds = Array.from({ length: 20 }, (_, index) => uuid(index + 110));
    const revisionMap = Object.fromEntries(questionIds.map((id, index) => [id, revisionIds[index]]));
    const permutations = Object.fromEntries(questionIds.map(id => [id, [1, 0]]));
    const rows = questionIds.map((id, index) => ({
        id: revisionIds[index],
        question_id: id,
        question: `Question ${index + 1}`,
        options: ['first', 'second'],
        category: 'cash',
        difficulty: 'hard',
        engine_metadata: { projectedEv: { value: 99, unit: 'bb' }, safeScenario: { leak: true } },
    }));
    const client = queryClient({
        tableRows: { trivia_question_revisions: rows },
        contextProjection: questionIds.map((questionId, index) => ({
            questionId,
            engineMetadata: index === 2 ? { safeScenario: { street: 'flop' } } : null,
        })),
        reviews: {
            [questionIds[1]]: {
                success: true,
                questionId: questionIds[1],
                revisionId: revisionIds[1],
                correctIndex: 0,
                explanation: 'Bound legacy explanation',
                engineMetadata: { safeScenario: { street: 'river' } },
            },
            [questionIds[2]]: {
                success: true,
                mode: 'gto',
                questionId: questionIds[2],
                position: 3,
                outcome: 'voided',
                voided: true,
            },
        },
    });
    const session = {
        id: SESSION,
        user_id: USER,
        mode: 'gto',
        status: 'open',
        question_ids: questionIds,
        question_revision_ids: revisionMap,
        permutations,
        answers: {
            [questionIds[0]]: { v: true, d: -1 },
            [questionIds[1]]: { d: 1 },
            [questionIds[2]]: { d: 0 },
        },
        created_at: '2026-10-05T18:00:00Z',
        expires_at: '2026-10-05T23:00:00Z',
    };
    const res = response();

    await serveExistingSoloSession(res, client, USER, session);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(client.calls.selects, [{
        table: 'trivia_question_revisions',
        columns: 'id, question_id, question, options, category, difficulty',
    }]);
    assert.deepEqual(client.calls.reviews, [questionIds[1], questionIds[2]].map(p_question_id => ({
        p_session_id: SESSION,
        p_user_id: USER,
        p_question_id,
    })));
    assert.deepEqual(client.calls.contexts, [{ p_session_id: SESSION, p_user_id: USER }]);
    assert.deepEqual(res.body.questions[0].answerState, {
        storedDisplayIndex: -1,
        wasCorrect: false,
        outcome: 'voided',
        voided: true,
    });
    assert.deepEqual(res.body.questions[1].answerState, {
        storedDisplayIndex: 1,
        wasCorrect: true,
        correctDisplayIndex: 1,
        outcome: 'correct',
        explanation: 'Bound legacy explanation',
        solverMetadata: null,
    });
    assert.equal(res.body.questions.some(question => JSON.stringify(question).includes('99')), false);
    assert.deepEqual(res.body.questions[2].context, { street: 'flop' });
    assert.deepEqual(res.body.questions[2].answerState, {
        storedDisplayIndex: -1,
        wasCorrect: false,
        outcome: 'voided',
        voided: true,
    });
});
