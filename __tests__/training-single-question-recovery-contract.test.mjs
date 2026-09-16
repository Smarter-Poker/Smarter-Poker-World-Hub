import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const nodeRequire = createRequire(import.meta.url);
const POLICY_CHECKSUM = 'a'.repeat(64);

function responseHarness() {
  return {
    statusCode: 200,
    headersSent: false,
    body: null,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; this.headersSent = true; return this; },
  };
}

function result(data) {
  return Promise.resolve({ data, error: null });
}

function loadHandler(captured, {
  recoveredDelivery = null,
  recoverySequence = null,
  emptyCache = false,
  includeSecondTurn = false,
  failFirstCanonicalBuild = false,
} = {}) {
  const turnQuestion = {
    id: 'turn-question-7',
    type: 'PIO',
    question: 'What is the best Turn action?',
    options: [
      { id: 'fold', text: 'Fold' },
      { id: 'call', text: 'Call' },
      { id: 'bet_50pct', text: 'Bet 50% Pot' },
      { id: 'all_in', text: 'All-In' },
    ],
    correctAnswer: 'call',
    policyChecksum: POLICY_CHECKSUM,
    scenario: { street: 'turn' },
    solverPolicy: { actions: [{ id: 'fold' }, { id: 'call' }] },
  };
  const flopQuestion = { ...structuredClone(turnQuestion), id: 'flop-question', scenario: { street: 'flop' } };
  const secondTurnQuestion = {
    ...structuredClone(turnQuestion),
    id: 'turn-question-8',
    question: 'What is the best Turn response?',
  };
  const availableQuestions = includeSecondTurn
    ? [flopQuestion, turnQuestion, secondTurnQuestion]
    : [flopQuestion, turnQuestion];
  const cacheRows = (emptyCache ? [] : availableQuestions).map((question) => ({
    id: `row-${question.id}`,
    question_id: question.id,
    question_data: question,
    generated_at: '2026-09-07T00:00:00.000Z',
  }));
  const db = {
    from(table) {
      if (table === 'user_seen_questions') {
        const query = {
          select() { return query; },
          eq() { return query; },
          limit() { return result([]); },
        };
        return query;
      }
      if (table === 'training_question_cache') {
        captured.cacheReads += 1;
        let write = false;
        let written = null;
        const query = {
          select() { return write ? query : query; },
          eq() { return query; },
          in() { return query; },
          limit() { return result(cacheRows); },
          upsert(row) { write = true; written = row; return query; },
          maybeSingle() {
            return result({
              question_id: written.question_id,
              question_data: written.question_data,
              canonical_policy: written.question_data.solverPolicy,
              source_classification: 'SOLVER_EXACT',
              quality_status: 'active',
              policy_version: 'test-v1',
              policy_checksum: POLICY_CHECKSUM,
            });
          },
        };
        return query;
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };

  const dependencies = {
    'node:crypto': { randomUUID: () => '44444444-4444-4444-8444-444444444444' },
    '../../../src/lib/serverAuth': {
      getServerUserWithFallback: async () => ({ user: { id: 'user-1' }, error: null }),
    },
    '../../../src/lib/supabaseServerClient': { createClient: () => db },
    '../../../src/config/trainingConfig': { __esModule: true, default: { passThresholds: { 1: 85 } } },
    '../../../src/config/gameConfigs': {
      getGameConfig: () => ({ gameType: 'cash', engine: 'PIO' }),
    },
    '../../../src/services/PIOQueryService': {
      pioQueryService: { getGameConfig: () => ({ sourceOfTruth: 'PioSOLVER' }) },
    },
    '../../../src/config/GameScenarioMap': { getGameScenarioConfig: () => ({}) },
    '../../../src/engines/DeterministicGTOEngine': {
      deterministicEngine: { setSupabaseClient() {}, generateBatch: async () => [] },
    },
    '../../../src/engines/deterministicEnginePatches': { applyDeterministicEnginePatches() {} },
    '../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: { read: {} } },
    '../../../src/utils/trainingApiUtils': {
      sanitizeParam: (value) => String(value || ''),
      withTiming() {},
      reconcileAnswerKey() {},
    },
    '../../../src/lib/apiErrorHandler': { reportApiError() {} },
    '../../../src/lib/training/cacheContract.mjs': { filterCachedRowsForGame: (rows) => rows },
    '../../../src/lib/training/questionContract.mjs': {
      enforceTrainingQuestionContract: (question) => question,
      isTrainingQuestionValid: () => true,
    },
    '../../../src/lib/training/solverDecisionEvidence': {
      enforceSolverClaimHonesty: (question) => question,
      normalizeAuditedChartQuestion: (question) => question,
    },
    '../../../src/lib/training/trainingPersistence.mjs': {
      isTrainingPersistenceUnavailable: () => false,
      runTrainingPersistenceQuery: async (factory) => factory(),
      trainingPersistenceUnavailableBody: () => ({ success: false }),
    },
    '../../../src/lib/training/gradingReceipt.mjs': { createTrainingSessionId: () => 'generated-session' },
    '../../../src/lib/training/sessionAttemptContract.mjs': { trainingMasteryMinimum: () => 20 },
    '../../../src/lib/training/trainingAttemptDelivery.mjs': {
      isTrainingAttemptContractError: (error) => String(error?.code || '').startsWith('TRAINING_'),
      isTrainingQuestionCampaignEligible: () => true,
      recordTrainingQuestionsServedForAttempt: async (_client, { delivery }) => {
        captured.servedReceipts = delivery.questions.map((question) => ({
          questionId: question.id,
          policyChecksum: question.policyChecksum,
        }));
        return { questionCount: captured.servedReceipts.length };
      },
      recoverTrainingAttemptHand: async (input) => {
        captured.recovery = input;
        captured.recoveries = [...(captured.recoveries || []), input];
        if (Array.isArray(recoverySequence) && recoverySequence.length > 0) {
          const next = recoverySequence.shift();
          if (next instanceof Error) throw next;
          return next;
        }
        return recoveredDelivery;
      },
      prepareTrainingAttemptDelivery: async (input) => {
        captured.delivery = input;
        return {
          attemptId: 'attempt-1',
          sessionKind: 'campaign',
          targetHands: 20,
          questions: [{ ...input.questions[0], _gradingContext: { handOrdinal: input.handOrdinalStart } }],
        };
      },
    },
    '../../../src/lib/training/questionSelectionContract.mjs': {
      normalizeTrainingGameMode: (value) => ['full', 'spot', 'street'].includes(value) ? value : 'full',
      normalizeTrainingHandSelection: (value) => ['all', 'no-trivial', 'close'].includes(value) ? value : 'all',
      trainingQuestionMatchesSelection: (question, selection) => {
        captured.selections.push(selection);
        return selection.gameMode !== 'street'
          || question.scenario.street === selection.targetStreet;
      },
    },
    '../../../src/lib/training/cacheTruthPersistence.mjs': {
      cacheQuestionFromRow: (row) => structuredClone(row.question_data),
      cacheRowIsServingEligible: () => true,
      buildTrainingCacheRow: ({ question, questionId }) => {
        captured.canonicalBuilds = [...(captured.canonicalBuilds || []), questionId];
        if (failFirstCanonicalBuild && captured.canonicalBuilds.length === 1) {
          throw new Error('candidate policy cannot be canonicalized');
        }
        return {
          question_id: questionId,
          question_data: question,
        };
      },
      withPersistedCacheReceipt: (question) => ({ ...question, policyChecksum: POLICY_CHECKSUM }),
      recordTrainingQuestionsServed: async (_client, { receipts }) => {
        captured.servedReceipts = receipts;
        return { questionCount: receipts.length };
      },
    },
    '../../../src/data/TRAINING_LIBRARY': {
      __esModule: true,
      default: [{ id: 'cash-001' }],
    },
  };

  const source = fs.readFileSync(path.join(ROOT, 'pages/api/training/get-question.js'), 'utf8');
  const babel = nodeRequire('@babel/core');
  const compiled = babel.transformSync(source, {
    babelrc: false,
    configFile: false,
    filename: 'pages/api/training/get-question.js',
    plugins: [nodeRequire('@babel/plugin-transform-modules-commonjs')],
    sourceType: 'module',
  }).code;
  const routeModule = { exports: {} };
  new Function('require', 'module', 'exports', compiled)((specifier) => {
    assert.ok(dependencies[specifier], `Unexpected get-question dependency: ${specifier}`);
    return dependencies[specifier];
  }, routeModule, routeModule.exports);
  return routeModule.exports.default;
}

test('single-question recovery preserves later ordinal and immutable drill selection', async () => {
  const captured = { delivery: null, recovery: null, selections: [], cacheReads: 0, servedReceipts: [] };
  const handler = loadHandler(captured);
  const response = responseHarness();
  await handler({
    method: 'GET',
    headers: { authorization: 'Bearer test-token' },
    query: {
      gameId: 'cash-001',
      level: '1',
      difficulty: 'exact',
      sessionId: 'existing-session-1',
      handOrdinal: '7',
      gameMode: 'street',
      handSelection: 'close',
      targetStreet: 'turn',
    },
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.question.id, 'turn-question-7');
  assert.equal(response.body.question._gradingContext.handOrdinal, 7);
  assert.equal(captured.delivery.clientSessionId, 'existing-session-1');
  assert.equal(captured.delivery.handOrdinalStart, 7);
  assert.equal(captured.delivery.difficultyMode, 'exact');
  assert.deepEqual(captured.delivery.config, {
    gameMode: 'street',
    handSelection: 'close',
    targetStreet: 'turn',
  });
  assert.ok(captured.selections.length >= 2);
});

test('single-question recovery serves the manifest winner before an empty mutable cache is read', async () => {
  const manifestQuestion = {
    id: 'manifest-winner-7',
    policyChecksum: 'b'.repeat(64),
    scenario: { street: 'turn' },
    _gradingContext: { handOrdinal: 7 },
  };
  const captured = { delivery: null, recovery: null, selections: [], cacheReads: 0, servedReceipts: [] };
  const handler = loadHandler(captured, {
    emptyCache: true,
    recoveredDelivery: {
      attemptId: 'attempt-1',
      sessionKind: 'campaign',
      targetHands: 20,
      questions: [manifestQuestion],
    },
  });
  const response = responseHarness();
  await handler({
    method: 'GET',
    headers: { authorization: 'Bearer test-token' },
    query: {
      gameId: 'cash-001',
      level: '1',
      difficulty: 'exact',
      sessionId: 'existing-session-1',
      handOrdinal: '7',
      gameMode: 'street',
      handSelection: 'close',
      targetStreet: 'turn',
    },
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.question.id, 'manifest-winner-7');
  assert.equal(captured.cacheReads, 0);
  assert.equal(captured.delivery, null);
  assert.equal(captured.recovery.handOrdinal, 7);
  assert.deepEqual(captured.recovery.config, {
    gameMode: 'street',
    handSelection: 'close',
    targetStreet: 'turn',
  });
  assert.deepEqual(captured.servedReceipts, [{
    questionId: 'manifest-winner-7',
    policyChecksum: 'b'.repeat(64),
  }]);
});

test('first-load single-question delivery does not create an orphan recovery attempt', async () => {
  const captured = { delivery: null, recovery: null, selections: [], cacheReads: 0, servedReceipts: [] };
  const handler = loadHandler(captured);
  const response = responseHarness();
  await handler({
    method: 'GET',
    headers: { authorization: 'Bearer test-token' },
    query: {
      gameId: 'cash-001',
      level: '1',
      difficulty: 'exact',
      handOrdinal: '1',
    },
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(captured.recovery, null);
  assert.equal(captured.delivery.clientSessionId, 'generated-session');
});

test('single-question delivery skips an uncanonicalizable cache candidate instead of returning 500', async () => {
  const captured = {
    delivery: null,
    recovery: null,
    selections: [],
    cacheReads: 0,
    servedReceipts: [],
    canonicalBuilds: [],
  };
  const handler = loadHandler(captured, {
    includeSecondTurn: true,
    failFirstCanonicalBuild: true,
  });
  const response = responseHarness();
  await handler({
    method: 'GET',
    headers: { authorization: 'Bearer test-token' },
    query: {
      gameId: 'cash-001',
      level: '1',
      difficulty: 'exact',
      sessionId: 'existing-session-1',
      handOrdinal: '7',
      gameMode: 'street',
      handSelection: 'all',
      targetStreet: 'turn',
    },
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(captured.canonicalBuilds.length, 2);
  assert.ok(['turn-question-7', 'turn-question-8'].includes(response.body.question.id));
  assert.notEqual(response.body.question.id, captured.canonicalBuilds[0]);
});

test('default single-question delivery resumes the predecessor engine-only attempt config for the bounded overlap', async () => {
  const nonceConflict = Object.assign(new Error('The client nonce is already bound to another attempt configuration.'), {
    name: 'TrainingAttemptDeliveryError',
    code: 'TRAINING_ATTEMPT_NONCE_CONFLICT',
    status: 409,
  });
  const captured = {
    delivery: null,
    recovery: null,
    recoveries: [],
    selections: [],
    cacheReads: 0,
    servedReceipts: [],
  };
  const handler = loadHandler(captured, { recoverySequence: [nonceConflict, null] });
  const response = responseHarness();

  await handler({
    method: 'GET',
    headers: { authorization: 'Bearer test-token' },
    query: {
      gameId: 'cash-001',
      level: '1',
      difficulty: 'exact',
      sessionId: 'predecessor-session-1',
      handOrdinal: '7',
    },
  }, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(captured.recoveries.map((recovery) => recovery.config), [
    { gameMode: 'full', handSelection: 'all', targetStreet: null },
    { engineType: 'PIO' },
  ]);
  assert.deepEqual(captured.recoveries[1].questionSelection, {
    gameMode: 'full',
    handSelection: 'all',
    targetStreet: null,
  });
  assert.deepEqual(captured.delivery.config, { engineType: 'PIO' });
});

test('constrained single-question delivery never adopts an engine-only predecessor config', async () => {
  const nonceConflict = Object.assign(new Error('The client nonce is already bound to another attempt configuration.'), {
    name: 'TrainingAttemptDeliveryError',
    code: 'TRAINING_ATTEMPT_NONCE_CONFLICT',
    status: 409,
  });
  const captured = {
    delivery: null,
    recovery: null,
    recoveries: [],
    selections: [],
    cacheReads: 0,
    servedReceipts: [],
  };
  const handler = loadHandler(captured, { recoverySequence: [nonceConflict] });
  const response = responseHarness();

  await handler({
    method: 'GET',
    headers: { authorization: 'Bearer test-token' },
    query: {
      gameId: 'cash-001',
      level: '1',
      difficulty: 'exact',
      sessionId: 'predecessor-session-2',
      handOrdinal: '7',
      gameMode: 'street',
      handSelection: 'close',
      targetStreet: 'turn',
    },
  }, response);

  assert.equal(response.statusCode, 409);
  assert.equal(response.body.code, 'TRAINING_ATTEMPT_NONCE_CONFLICT');
  assert.equal(captured.recoveries.length, 1);
  assert.equal(captured.delivery, null);
  assert.equal(captured.cacheReads, 0);
});

test('client fallback uses the bounded signed endpoint without mutating the returned DTO', () => {
  const hook = fs.readFileSync(path.join(ROOT, 'src/hooks/useGTOTrainer.js'), 'utf8');
  const start = hook.indexOf('const fetchSingleQuestion = useCallback');
  const end = hook.indexOf('const reissueSignedQuestions = useCallback', start);
  const fallback = hook.slice(start, end);
  assert.match(fallback, /handOrdinal:/);
  assert.doesNotMatch(fallback, /handOrdinalStart:/);
  assert.match(fallback, /gameMode:/);
  assert.match(fallback, /handSelection:/);
  assert.match(fallback, /\/api\/training\/get-question/);
  assert.match(fallback, /await trainingFetch/);
  assert.match(fallback, /assertSignedTrainingDelivery/);
  assert.match(fallback, /activateNewTrainingQuestion\(selected\[0\]\)/);
  assert.doesNotMatch(fallback, /applyDifficultyToQuestion/);
});
