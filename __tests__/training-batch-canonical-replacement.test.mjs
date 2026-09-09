import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  filterTrainingQuestionsForAttempt,
  normalizeTrainingGameMode,
  normalizeTrainingHandSelection,
  trainingQuestionMatchesSelection,
} from '../src/lib/training/questionSelectionContract.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nodeRequire = createRequire(import.meta.url);
const POLICY_CHECKSUM = 'e'.repeat(64);

function createApiResponse() {
  return {
    statusCode: 200,
    headersSent: false,
    body: null,
    setHeader() { return this; },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      this.headersSent = true;
      return this;
    },
  };
}

function queryResult(data) {
  return Promise.resolve({ data, error: null });
}

function cacheRow(index, frequencies = { fold: 55, call: 45 }) {
  return {
    id: `cache-row-${index + 1}`,
    question_id: `question-${index + 1}`,
    generated_at: '2026-09-07T00:00:00.000Z',
    question_data: {
      id: `source-question-${index + 1}`,
      question: `Canonical candidate ${index + 1}: what is your best action?`,
      correctAnswer: 'fold',
      options: [
        { id: 'fold', text: 'Fold' },
        { id: 'call', text: 'Call' },
        { id: 'raise', text: 'Raise' },
        { id: 'all_in', text: 'All-In' },
      ],
      gtoFrequencies: frequencies,
    },
  };
}

function createHarness({
  failedBuilds = 0,
  cacheRows = Array.from({ length: 21 }, (_, index) => cacheRow(index)),
  manifestWinner = null,
  seenQuestionIds = [],
  recoveredDelivery = null,
}) {
  const captured = {
    buildAttempts: [],
    persistedRows: [],
    servedReceipts: [],
    deliveredQuestions: [],
    recoveryCalls: [],
  };

  const db = {
    from(table) {
      if (table === 'user_seen_questions') {
        const query = {
          select() { return query; },
          eq() { return query; },
          limit() {
            return queryResult(seenQuestionIds.map((questionId) => ({ question_id: questionId })));
          },
        };
        return query;
      }
      if (table === 'training_question_cache') {
        let mode = 'read';
        const query = {
          select() {
            if (mode === 'write') {
              return queryResult(captured.persistedRows.map((row) => ({
                question_id: row.question_id,
                question_data: row.question_data,
                canonical_policy: row.question_data?.solverPolicy || {},
                source_classification: 'SOLVER_EXACT',
                quality_status: 'active',
                policy_version: 'test-policy-v1',
                policy_checksum: POLICY_CHECKSUM,
              })));
            }
            return query;
          },
          eq() { return query; },
          in() { return query; },
          limit() { return queryResult(cacheRows); },
          upsert(rows) {
            mode = 'write';
            captured.persistedRows = rows;
            return query;
          },
        };
        return query;
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };

  const source = fs.readFileSync(
    path.join(ROOT, 'pages/api/training/batch-preload.js'),
    'utf8',
  );
  const babel = nodeRequire('@babel/core');
  const transformModulesCommonJs = nodeRequire('@babel/plugin-transform-modules-commonjs');
  const compiled = babel.transformSync(source, {
    babelrc: false,
    configFile: false,
    filename: 'pages/api/training/batch-preload.js',
    plugins: [transformModulesCommonJs],
    sourceType: 'module',
  }).code;

  const dependencies = {
    'node:crypto': { randomUUID: () => '33333333-3333-4333-8333-333333333333' },
    '../../../src/lib/serverAuth': {
      getServerUserWithFallback: async () => ({
        user: { id: '11111111-1111-4111-8111-111111111111' },
        error: null,
      }),
    },
    '../../../src/lib/supabaseServerClient': { createClient: () => db },
    '../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: { read: {} } },
    '../../../src/utils/trainingApiUtils': {
      sanitizeParam: (value) => String(value || ''),
      withTiming() {},
      reconcileAnswerKey() {},
    },
    '../../../src/engines/DeterministicGTOEngine': {
      deterministicEngine: { setSupabaseClient() {}, generateBatch: async () => [] },
    },
    '../../../src/engines/deterministicEnginePatches': {
      applyDeterministicEnginePatches: (engine) => engine,
    },
    '../../../src/services/PIOQueryService': {
      pioQueryService: {
        getGameConfig: () => ({
          sourceOfTruth: 'PioSOLVER',
          pioGameType: 'hu_cash',
          pioStackDepth: 100,
        }),
      },
    },
    '../../../src/config/gameConfigs': {
      getGameConfig: () => ({ engine: 'PIO', gameType: 'cash' }),
    },
    '../../../src/config/GameScenarioMap': { getGameScenarioConfig: () => ({}) },
    '../../../src/lib/training/cacheContract.mjs': {
      filterCachedRowsForGame: (rows) => rows,
    },
    '../../../src/lib/training/declaredStreet': { streetOfCachedRow: () => null },
    '../../../src/lib/training/questionContract.mjs': {
      enforceTrainingQuestionContract: (question) => question,
      isTrainingQuestionValid: () => true,
    },
    '../../../src/lib/training/solverDecisionEvidence': {
      enforceSolverClaimHonesty: (question) => question,
      normalizeAuditedChartQuestion: (question) => question,
    },
    '../../../src/lib/sentryWrap': { reportApiError() {} },
    '../../../src/lib/training/trainingPersistence.mjs': {
      runTrainingPersistenceQuery: async (factory) => factory(),
      trainingPersistenceUnavailableBody: () => ({
        success: false,
        error: 'Training persistence is temporarily unavailable.',
        code: 'TRAINING_PERSISTENCE_UNAVAILABLE',
      }),
    },
    '../../../src/lib/training/gradingReceipt.mjs': {
      createTrainingSessionId: () => 'test-training-session',
    },
    '../../../src/lib/training/sessionAttemptContract.mjs': {
      trainingMasteryMinimum: () => 20,
    },
    '../../../src/lib/training/trainingAttemptDelivery.mjs': {
      isTrainingAttemptContractError: () => false,
      isTrainingQuestionCampaignEligible: () => true,
      recoverTrainingAttemptHand: async (args) => {
        captured.recoveryCalls.push(args);
        return recoveredDelivery;
      },
      recordTrainingQuestionsServedForAttempt: async (_client, { delivery }) => {
        captured.servedReceipts = delivery.questions.map((question) => ({
          questionId: question.id,
          policyChecksum: question.policyChecksum,
        }));
        return { questionCount: delivery.questions.length };
      },
      prepareTrainingAttemptDelivery: async ({ questions }) => {
        const deliveredQuestions = manifestWinner
          ? [{ ...questions[0], ...manifestWinner }]
          : questions;
        captured.deliveredQuestions = deliveredQuestions;
        return {
          attemptId: 'attempt-1',
          sessionKind: 'campaign',
          targetHands: 20,
          questions: deliveredQuestions,
        };
      },
    },
    '../../../src/lib/training/questionSelectionContract.mjs': {
      filterTrainingQuestionsForAttempt,
      normalizeTrainingGameMode,
      normalizeTrainingHandSelection,
      trainingQuestionMatchesSelection,
    },
    '../../../src/lib/training/questionOrderContract.mjs': {
      shuffleBalancedQuestionOrder: (questions) => questions,
    },
    '../../../src/lib/training/cacheTruthPersistence.mjs': {
      cacheQuestionFromRow: (row) => structuredClone(row.question_data),
      cacheRowIsServingEligible: () => true,
      buildTrainingCacheRow: ({ question, questionId }) => {
        captured.buildAttempts.push(questionId);
        if (captured.buildAttempts.length <= failedBuilds) {
          throw new Error(`malformed canonical candidate ${questionId}`);
        }
        return {
          question_id: questionId,
          question_data: question,
        };
      },
      withPersistedCacheReceipt: (question, row) => {
        if (!question || !row || row.question_id !== question.id) {
          throw new Error('missing canonical receipt');
        }
        return { ...question, policyChecksum: row.policy_checksum };
      },
      recordTrainingQuestionsServed: async (_client, { receipts }) => {
        captured.servedReceipts = receipts;
        return { questionCount: receipts.length };
      },
    },
  };

  const routeModule = { exports: {} };
  const evaluate = new Function('require', 'module', 'exports', compiled);
  evaluate((specifier) => {
    assert.ok(dependencies[specifier], `Unexpected batch-preload dependency: ${specifier}`);
    return dependencies[specifier];
  }, routeModule, routeModule.exports);

  return { handler: routeModule.exports.default, captured };
}

async function invoke(harness, { count = '20', query = {} } = {}) {
  const response = createApiResponse();
  const originalRandom = Math.random;
  Math.random = () => 0.999999;
  try {
    await harness.handler({
      method: 'GET',
      headers: { authorization: 'Bearer test-token' },
      query: {
        gameId: 'cash-001',
        level: '1',
        count,
        handSelection: 'close',
        ...query,
      },
    }, response);
  } finally {
    Math.random = originalRandom;
  }
  return response;
}

test('a failed canonical row build is replaced by a later valid surplus candidate', async () => {
  const harness = createHarness({ failedBuilds: 1 });
  const response = await invoke(harness);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.count, 20);
  assert.equal(harness.captured.buildAttempts.length, 21);
  assert.equal(harness.captured.persistedRows.length, 20);
  assert.equal(harness.captured.servedReceipts.length, 20);
  assert.equal(harness.captured.deliveredQuestions.length, 20);
  assert.equal(new Set(harness.captured.deliveredQuestions.map((question) => question.id)).size, 20);
});

test('insufficient buildable candidates return an honest 422 before persistence or delivery', async () => {
  const harness = createHarness({ failedBuilds: 2 });
  const response = await invoke(harness);

  assert.equal(response.statusCode, 422);
  assert.deepEqual(response.body, {
    success: false,
    error: 'Only 19 of 20 questions satisfy this immutable drill configuration.',
    code: 'TRAINING_ATTEMPT_QUESTION_SHORTFALL',
  });
  assert.equal(harness.captured.buildAttempts.length, 21);
  assert.equal(harness.captured.persistedRows.length, 0);
  assert.equal(harness.captured.servedReceipts.length, 0);
  assert.equal(harness.captured.deliveredQuestions.length, 0);
});

test('single-hand recovery filters the complete bounded pool before slicing candidates', async () => {
  const cacheRows = [
    ...Array.from({ length: 4 }, (_, index) => cacheRow(index, { fold: 100, call: 0 })),
    cacheRow(4, { fold: 55, call: 45 }),
  ];
  const harness = createHarness({ cacheRows });
  const response = await invoke(harness, { count: '1' });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.count, 1);
  assert.equal(response.body.questions[0].id, 'question-5');
  assert.deepEqual(harness.captured.buildAttempts, ['question-5']);
});

test('first-load single-hand preload does not create an orphan recovery attempt', async () => {
  const harness = createHarness({ cacheRows: [cacheRow(0)] });
  const response = await invoke(harness, { count: '1' });

  assert.equal(response.statusCode, 200);
  assert.equal(harness.captured.recoveryCalls.length, 0);
  assert.equal(response.body.sessionId, 'test-training-session');
});

test('single-hand recovery revalidates its persisted manifest against the requested drill selection', async () => {
  const recoveredQuestion = {
    id: 'persisted-flop-question',
    policyChecksum: POLICY_CHECKSUM,
    _gradingContext: {
      attemptId: 'attempt-1',
      handOrdinal: 7,
      decisionOrdinal: 1,
    },
  };
  const harness = createHarness({
    recoveredDelivery: {
      attemptId: 'attempt-1',
      sessionKind: 'campaign',
      targetHands: 20,
      questions: [recoveredQuestion],
    },
  });
  const response = await invoke(harness, {
    count: '1',
    query: {
      sessionId: 'selection-bound-session',
      handOrdinalStart: '7',
      gameMode: 'street',
      handSelection: 'close',
      targetStreet: 'flop',
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.questions[0].id, 'persisted-flop-question');
  assert.equal(harness.captured.recoveryCalls.length, 1);
  assert.deepEqual(harness.captured.recoveryCalls[0].questionSelection, {
    gameMode: 'street',
    handSelection: 'close',
    targetStreet: 'flop',
  });
  assert.deepEqual(
    harness.captured.recoveryCalls[0].questionSelection,
    harness.captured.recoveryCalls[0].config,
  );
  assert.equal(harness.captured.buildAttempts.length, 0, 'manifest recovery must precede cache selection');
});

test('selection precedes freshness fallback so a seen valid candidate beats fresh nonmatches', async () => {
  const cacheRows = [
    ...Array.from({ length: 4 }, (_, index) => cacheRow(index, { fold: 100, call: 0 })),
    cacheRow(4, { fold: 55, call: 45 }),
  ];
  const harness = createHarness({
    cacheRows,
    seenQuestionIds: ['question-5'],
  });
  const response = await invoke(harness, { count: '1' });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.count, 1);
  assert.equal(response.body.questions[0].id, 'question-5');
  assert.deepEqual(harness.captured.buildAttempts, ['question-5']);
});

test('served audit records the immutable manifest winner, not the pre-manifest candidate', async () => {
  const winnerChecksum = 'f'.repeat(64);
  const harness = createHarness({
    cacheRows: [cacheRow(0)],
    manifestWinner: { id: 'manifest-winner', policyChecksum: winnerChecksum },
  });
  const response = await invoke(harness, { count: '1' });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.questions[0].id, 'manifest-winner');
  assert.deepEqual(harness.captured.servedReceipts, [{
    questionId: 'manifest-winner',
    policyChecksum: winnerChecksum,
  }]);
});
