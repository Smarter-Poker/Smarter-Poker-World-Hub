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
import {
  buildTrainingAttestationContinuationPrecommit,
  selectPublicAttestationContinuationAnswer,
  TRAINING_ATTESTATION_CONTINUATION_SELECTION_RULE,
  validateTrainingAttestationContinuationPrecommit,
} from '../src/lib/training/trainingAttestationContinuationContract.mjs';
import {
  createTrainingAttestationCohortCollector,
  logTrainingAttestationCohortStage,
  TRAINING_ATTESTATION_COHORT_LOG_PREFIX,
} from '../src/lib/training/trainingAttestationCohortDiagnostics.mjs';

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
  generatedQuestions = [],
  attestationEligibleQuestionId = null,
  authenticatedUserId = '11111111-1111-4111-8111-111111111111',
  campaignIneligibleQuestionIds = [],
}) {
  const captured = {
    buildAttempts: [],
    persistedRows: [],
    servedReceipts: [],
    deliveredQuestions: [],
    recoveryCalls: [],
    cohortCalls: [],
    cacheReads: 0,
    generateBatchCalls: [],
    continuationParentCalls: [],
    cohortDiagnostics: [],
    serverWarnings: [],
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
          limit() { captured.cacheReads += 1; return queryResult(cacheRows); },
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
        user: { id: authenticatedUserId },
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
      deterministicEngine: {
        setSupabaseClient() {},
        generateBatch: async (input) => {
          captured.generateBatchCalls.push(input);
          return structuredClone(generatedQuestions);
        },
        generateAttestationContinuationParentCandidates: async (input) => {
          captured.continuationParentCalls.push(input);
          return structuredClone(generatedQuestions).filter(
            (question) => input.acceptQuestion(question) === true,
          );
        },
        queryNextStreet: async () => null,
      },
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
    '../../../src/lib/apiErrorHandler': { reportApiError() {} },
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
      isTrainingQuestionCampaignEligible: (question) => (
        !campaignIneligibleQuestionIds.includes(question?.id)
      ),
      trainingQuestionCampaignEligibility: (question) => (
        campaignIneligibleQuestionIds.includes(question?.id)
          ? { eligible: false, reason: 'stubbed_ineligible' }
          : { eligible: true, reason: 'stubbed_eligible' }
      ),
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
      prepareTrainingAttemptDelivery: async (input) => {
        captured.delivery = input;
        const { questions } = input;
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
    '../../../src/lib/training/trainingAttestationContinuationContract.mjs': {
      validateTrainingAttestationContinuationPrecommit,
    },
    // Real server-only diagnostics; the harness captures the log line so a
    // test can prove the public body never varies while the stage does.
    '../../../src/lib/training/trainingAttestationCohortDiagnostics.mjs': {
      createTrainingAttestationCohortCollector,
      logTrainingAttestationCohortStage: (input) => logTrainingAttestationCohortStage(
        input,
        (prefix, json) => captured.cohortDiagnostics.push({ prefix, record: JSON.parse(json) }),
      ),
    },
    '../../../src/lib/training/trainingContinuationEligibility.mjs': {
      selectPublicAttestationContinuationAnswerForStrictParent: (question) => (
        question?.id === attestationEligibleQuestionId ? 'raise' : null
      ),
      selectTrainingAttestationContinuationCohort: async (input) => {
        captured.cohortCalls.push(input);
        const eligiblePair = input.questionPairs.find(
          (pair) => pair?.row?.question_data?.id === attestationEligibleQuestionId,
        );
        if (!eligiblePair) return null;
        return {
          questionPairs: [
            ...input.questionPairs.slice(0, input.targetHands - 1),
            eligiblePair,
          ],
          publicContract: input.precommit,
        };
      },
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

async function invoke(harness, { count = '20', query = {}, auditUserId = null } = {}) {
  const response = createApiResponse();
  const originalRandom = Math.random;
  const originalWarn = console.warn;
  console.warn = (...args) => { harness.captured.serverWarnings.push(args.map(String).join(' ')); };
  const previousAuditUserId = process.env.TRAINING_PHASE6_DELIVERY_EXPECTED_AUDIT_USER_ID;
  Math.random = () => 0.999999;
  if (auditUserId === null) {
    delete process.env.TRAINING_PHASE6_DELIVERY_EXPECTED_AUDIT_USER_ID;
  } else {
    process.env.TRAINING_PHASE6_DELIVERY_EXPECTED_AUDIT_USER_ID = auditUserId;
  }
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
    console.warn = originalWarn;
    if (previousAuditUserId === undefined) {
      delete process.env.TRAINING_PHASE6_DELIVERY_EXPECTED_AUDIT_USER_ID;
    } else {
      process.env.TRAINING_PHASE6_DELIVERY_EXPECTED_AUDIT_USER_ID = previousAuditUserId;
    }
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

function continuationAttestationQuery() {
  const precommit = buildTrainingAttestationContinuationPrecommit({
    selectionRule: TRAINING_ATTESTATION_CONTINUATION_SELECTION_RULE,
    sessionId: 'test-training-session',
    gameId: 'cash-001',
    level: 1,
    targetHands: 20,
  });
  return {
    precommit,
    query: {
      attestationContinuationRule: precommit.selectionRule,
      attestationContinuationPrecommit: precommit.commitment,
    },
  };
}

test('public continuation rule selects only visible three-quarter-pot aggression', () => {
  assert.equal(selectPublicAttestationContinuationAnswer({
    options: [{ id: 'check' }, { id: 'call' }, { id: 'fold' }],
  }), null);
  assert.equal(selectPublicAttestationContinuationAnswer({
    options: [{ id: 'check' }, { id: 'bet_75pct' }, { id: 'b412' }],
  }), 'bet_75pct');
  assert.equal(selectPublicAttestationContinuationAnswer({
    options: [
      { id: 'check', text: 'Check' },
      { id: 'grouped_small', text: 'Small Bet' },
      { id: 'grouped_medium', text: 'Medium Bet' },
      { id: 'grouped_overbet', text: 'Overbet' },
    ],
  }), 'grouped_medium');
  assert.equal(selectPublicAttestationContinuationAnswer({
    options: [{ id: 'grouped_small' }, { id: 'grouped_overbet' }],
  }), null);
  // The canonical tree never bets an exact 75%: b412 into 550 chips is
  // 74.909%, served as `bet_74_91pct` / "Bet 74.9% Pot". The public rule
  // shares the canonical +/-0.03 band and fails closed on two in-band sizes.
  assert.equal(selectPublicAttestationContinuationAnswer({
    options: [
      { id: 'check', text: 'Check' },
      { id: 'bet_33_09pct', text: 'Bet 33.1% Pot' },
      { id: 'bet_74_91pct', text: 'Bet 74.9% Pot' },
      { id: 'bet_125_09pct', text: 'Bet 125.1% Pot' },
    ],
  }), 'bet_74_91pct');
  assert.equal(selectPublicAttestationContinuationAnswer({
    options: [
      { id: 'check', text: 'Check' },
      { id: 'bet_73pct', text: 'Bet 73% Pot' },
      { id: 'bet_77pct', text: 'Bet 77% Pot' },
    ],
  }), null);
  assert.equal(selectPublicAttestationContinuationAnswer({
    options: [{ id: 'check', text: 'Check' }, { id: 'bet_71pct', text: 'Bet 71% Pot' }],
  }), null);
});

test('engine candidates refused by the campaign contract are tallied by reason in the server log', async () => {
  const generated = [200, 201, 202].map((index) => ({
    ...structuredClone(cacheRow(index).question_data),
    id: `engine-candidate-${index}`,
    source: 'local_solver_ranges',
    dataQuality: 'LEGACY_UNVERIFIED',
  }));
  const harness = createHarness({
    cacheRows: Array.from({ length: 10 }, (_, index) => cacheRow(index)),
    generatedQuestions: generated,
    campaignIneligibleQuestionIds: ['engine-candidate-200', 'engine-candidate-201'],
  });
  const response = await invoke(harness);
  assert.equal(response.statusCode, 422);
  assert.equal(response.body.code, 'TRAINING_ATTEMPT_QUESTION_SHORTFALL');
  assert.equal(harness.captured.generateBatchCalls.length, 1);
  assert.equal(
    typeof harness.captured.generateBatchCalls[0].admissibleForCaller,
    'function',
    'the route must hand the engine its campaign admissibility contract',
  );
  const tally = harness.captured.serverWarnings.find((line) => /engine candidates for cash-001 L1 were refused/.test(line));
  assert.ok(tally, JSON.stringify(harness.captured.serverWarnings));
  assert.match(tally, /^\[BatchPreload\] 2 of 3 engine candidates/);
  assert.match(tally, /"campaign_ineligible: stubbed_ineligible \(source=local_solver_ranges, classification=LEGACY_UNVERIFIED\)":2/);
  assert.doesNotMatch(tally, /engine-candidate-/, 'the tally carries reasons and counts, never question ids');
});

test('non-designated accounts receive 403 before the audit cohort reads or writes data', async () => {
  const auditUserId = '99999999-9999-4999-8999-999999999999';
  const { query } = continuationAttestationQuery();
  const harness = createHarness({
    authenticatedUserId: '11111111-1111-4111-8111-111111111111',
  });
  const response = await invoke(harness, { query, auditUserId });

  assert.equal(response.statusCode, 403);
  assert.equal(response.body.code, 'TRAINING_ATTESTATION_AUDIT_ACCOUNT_REQUIRED');
  assert.equal(harness.captured.cacheReads, 0);
  assert.equal(harness.captured.persistedRows.length, 0);
  assert.equal(harness.captured.deliveredQuestions.length, 0);
});

test('every pre-cohort attestation shortage uses the exact unavailable contract before writes', async () => {
  const auditUserId = '99999999-9999-4999-8999-999999999999';
  const { query } = continuationAttestationQuery();
  const generatedQuestion = {
    ...structuredClone(cacheRow(200).question_data),
    id: 'solver-catalog-parent',
  };
  const cases = [
    createHarness({
      authenticatedUserId: auditUserId,
      cacheRows: [],
      generatedQuestions: [],
    }),
    createHarness({
      authenticatedUserId: auditUserId,
      cacheRows: Array.from({ length: 19 }, (_, index) => cacheRow(index)),
      generatedQuestions: [],
    }),
    createHarness({
      authenticatedUserId: auditUserId,
      cacheRows: Array.from({ length: 20 }, (_, index) => cacheRow(index)),
      generatedQuestions: [generatedQuestion],
      attestationEligibleQuestionId: generatedQuestion.id,
      failedBuilds: 2,
    }),
  ];

  const expectedStages = [
    'no_candidate_questions',
    'configured_candidate_shortfall',
    'canonical_pair_shortfall',
  ];
  const bodies = [];
  for (const [index, harness] of cases.entries()) {
    const response = await invoke(harness, { query, auditUserId });
    assert.equal(response.statusCode, 422);
    assert.equal(response.body.code, 'TRAINING_ATTESTATION_CONTINUATION_COHORT_UNAVAILABLE');
    assert.equal(harness.captured.persistedRows.length, 0);
    assert.equal(harness.captured.servedReceipts.length, 0);
    assert.equal(harness.captured.deliveredQuestions.length, 0);
    bodies.push(response.body);
    // The public body is identical for every branch; only the server log
    // says which stage refused, and it carries counts rather than content.
    assert.equal(harness.captured.cohortDiagnostics.length, 1, JSON.stringify(harness.captured.cohortDiagnostics));
    const [{ prefix, record }] = harness.captured.cohortDiagnostics;
    assert.equal(prefix, TRAINING_ATTESTATION_COHORT_LOG_PREFIX);
    assert.equal(record.stage, expectedStages[index]);
    assert.equal(record.questionCount, 20);
    assert.doesNotMatch(JSON.stringify(record), /solver-catalog-parent|cache-question|"answers?"|"options?"/);
  }
  assert.equal(new Set(bodies.map((body) => JSON.stringify(body))).size, 1);
});

test('an unavailable attestation cohort returns the exact 422 before every write', async () => {
  const auditUserId = '99999999-9999-4999-8999-999999999999';
  const { query } = continuationAttestationQuery();
  const generatedQuestion = {
    ...structuredClone(cacheRow(200).question_data),
    id: 'solver-catalog-parent',
  };
  const harness = createHarness({
    authenticatedUserId: auditUserId,
    cacheRows: Array.from({ length: 100 }, (_, index) => cacheRow(index)),
    generatedQuestions: [generatedQuestion],
  });
  const response = await invoke(harness, { query, auditUserId });

  assert.equal(response.statusCode, 422);
  assert.equal(response.body.code, 'TRAINING_ATTESTATION_CONTINUATION_COHORT_UNAVAILABLE');
  assert.equal(harness.captured.generateBatchCalls.length, 0);
  assert.equal(harness.captured.continuationParentCalls.length, 1);
  assert.equal(harness.captured.continuationParentCalls[0].count, 25);
  assert.equal(typeof harness.captured.continuationParentCalls[0].acceptQuestion, 'function');
  assert.equal(harness.captured.cohortCalls.length, 1);
  assert.equal(harness.captured.cohortCalls[0].collector?.summary().candidates, 0,
    'the route hands the selector a rejection collector');
  assert.equal(harness.captured.persistedRows.length, 0);
  assert.equal(harness.captured.servedReceipts.length, 0);
  assert.equal(harness.captured.deliveredQuestions.length, 0);
  assert.deepEqual(
    harness.captured.cohortDiagnostics.map(({ record }) => record.stage),
    ['cohort_unavailable'],
  );
  assert.equal(harness.captured.cohortDiagnostics[0].record.canonicalPairs, 100);
});

test('a warm cache cannot starve a bounded solver-catalog parent from the sealed cohort', async () => {
  const auditUserId = '99999999-9999-4999-8999-999999999999';
  const { query, precommit } = continuationAttestationQuery();
  const generatedQuestion = {
    ...structuredClone(cacheRow(200).question_data),
    id: 'solver-catalog-parent',
  };
  const harness = createHarness({
    authenticatedUserId: auditUserId,
    cacheRows: Array.from({ length: 100 }, (_, index) => cacheRow(index)),
    generatedQuestions: [generatedQuestion],
    attestationEligibleQuestionId: generatedQuestion.id,
  });
  const response = await invoke(harness, { query, auditUserId });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.count, 20);
  assert.equal(harness.captured.generateBatchCalls.length, 0);
  assert.equal(harness.captured.continuationParentCalls.length, 1);
  assert.equal(harness.captured.continuationParentCalls[0].count, 25);
  assert.ok(
    response.body.questions.some((question) => question.id === generatedQuestion.id),
    'the read-only solver-catalog parent was not sealed into the cohort',
  );
  assert.deepEqual(response.body.attestationContinuationCohort, precommit);
  assert.deepEqual(
    Object.keys(response.body.attestationContinuationCohort).sort(),
    ['commitment', 'selectionRule', 'version'],
  );
  assert.equal(Object.hasOwn(response.body.attestationContinuationCohort, 'handOrdinal'), false);
  assert.equal(Object.hasOwn(response.body.attestationContinuationCohort, 'answerId'), false);
  assert.deepEqual(
    harness.captured.delivery.config.attestationContinuationCohort,
    precommit,
    'the precommit was not bound into the immutable attempt config hash input',
  );
  assert.equal(harness.captured.persistedRows.length, 20);
  assert.equal(harness.captured.servedReceipts.length, 20);
});
