import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  filterCachedRowsForGame,
  hydrateMissingPIOScenarioContract,
} from '../src/lib/training/cacheContract.mjs';
import { buildTrainingCacheRow } from '../src/lib/training/cacheTruthPersistence.mjs';
import { isCustomTrainerConfig } from '../src/lib/training/trainerConfigMode.mjs';
import { buildQuestionConfusion } from '../src/lib/training/questionAnalytics.mjs';
import { isVerifiedSolverQuestion } from '../src/lib/training/solverDecisionEvidence.js';
import { handNotationToRepresentativeCards } from '../src/lib/training/representativeCards.mjs';
import { isRetryable } from '../src/lib/supabaseRetry.js';
import { SolverPolicyService } from '../src/services/SolverPolicyService.js';
import {
  isTrainingPersistenceUnavailable,
  runTrainingPersistenceQuery,
  trainingPersistenceUnavailableBody,
} from '../src/lib/training/trainingPersistence.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nodeRequire = createRequire(import.meta.url);

function createApiResponse() {
  return {
    statusCode: 200,
    headersSent: false,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
      return this;
    },
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

function loadTrainingDeliveryHandler(relativePath, { recoveredDelivery = null } = {}) {
  const babel = nodeRequire('@babel/core');
  const transformModulesCommonJs = nodeRequire('@babel/plugin-transform-modules-commonjs');
  const source = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
  const compiled = babel.transformSync(source, {
    babelrc: false,
    configFile: false,
    filename: relativePath,
    plugins: [transformModulesCommonJs],
    sourceType: 'module',
  }).code;

  const captured = { recoveryInputs: [], sourceTables: [] };
  const neverSettlingClient = {
    from(table) {
      captured.sourceTables.push(table);
      const query = {
        select() { return query; },
        eq() { return query; },
        in() { return query; },
        limit() { return query; },
        maybeSingle() { return query; },
        update() { return query; },
        upsert() { return query; },
        // Deliberately ignore the AbortSignal. A hard delivery deadline must
        // still settle the route even if the transport never acknowledges it.
        abortSignal() { return new Promise(() => {}); },
      };
      return query;
    },
  };
  const gameConfig = {
    gameType: 'cash',
    players: 6,
    format: '6-Max Cash',
    stackDepth: '100bb',
    engine: 'PIO',
  };
  const dependencies = {
    'node:crypto': { randomUUID: () => '33333333-3333-4333-8333-333333333333' },
    '../../../src/lib/serverAuth': {
      getServerUserWithFallback: async () => ({
        user: { id: '11111111-1111-4111-8111-111111111111' },
        error: null,
      }),
    },
    '../../../src/lib/supabaseServerClient': { createClient: () => neverSettlingClient },
    '../../../src/config/trainingConfig': {
      __esModule: true,
      default: { passThresholds: { 1: 85 } },
    },
    '../../../src/config/gameConfigs': {
      getGameConfig: () => gameConfig,
      getStackDepthNumber: () => 100,
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
    '../../../src/config/GameScenarioMap': { getGameScenarioConfig: () => ({}) },
    '../../../src/engines/DeterministicGTOEngine': {
      deterministicEngine: { setSupabaseClient() {}, generateBatch: async () => [] },
    },
    '../../../src/engines/deterministicEnginePatches': {
      applyDeterministicEnginePatches: (engine) => engine,
    },
    '../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: { read: {} } },
    '../../../src/utils/trainingApiUtils': {
      sanitizeParam: (value) => String(value || ''),
      withTiming() {},
      reconcileAnswerKey() {},
    },
    '../../../src/lib/apiErrorHandler': { reportApiError() {} },
    '../../../src/lib/training/cacheContract.mjs': {
      filterCachedRowsForGame: (rows) => rows,
      hydrateMissingPIOScenarioContract: (question) => question,
    },
    '../../../src/lib/training/declaredStreet': { streetOfCachedRow: () => null },
    '../../../src/lib/training/questionContract.mjs': {
      enforceTrainingQuestionContract: (question) => question,
      isTrainingQuestionValid: () => true,
    },
    '../../../src/lib/training/solverDecisionEvidence': {
      enforceSolverClaimHonesty: (question) => question,
      isVerifiedSolverQuestion: () => false,
      normalizeAuditedChartQuestion: (question) => question,
    },
    '../../../src/lib/training/representativeCards.mjs': {
      handNotationToRepresentativeCards: () => null,
    },
    '../../../src/lib/training/gradingReceipt.mjs': {
      createTrainingSessionId: () => 'test-training-session',
      prepareTrainingQuestionForDelivery: ({ canonicalQuestion }) => canonicalQuestion,
    },
    '../../../src/lib/training/cacheTruthPersistence.mjs': {
      buildTrainingCacheRow: ({ question, questionId }) => ({
        question_id: questionId || question?.id,
        question_data: question,
      }),
      cacheQuestionFromRow: (row) => row?.question_data || null,
      cacheRowIsServingEligible: () => true,
      recordTrainingQuestionsServed: async () => ({ questionCount: 1 }),
      withPersistedCacheReceipt: (question) => question,
    },
    '../../../src/lib/training/sessionAttemptContract.mjs': {
      trainingMasteryMinimum: () => 20,
    },
    '../../../src/lib/training/trainingAttemptDelivery.mjs': {
      isTrainingAttemptContractError: () => false,
      isTrainingQuestionCampaignEligible: () => true,
      recordTrainingQuestionsServedForAttempt: async () => ({ questionCount: 1 }),
      recoverTrainingAttemptHand: async (input) => {
        captured.recoveryInputs.push(input);
        return recoveredDelivery;
      },
      prepareTrainingAttemptDelivery: async () => {
        throw new Error('attempt delivery should not run after a failed canonical read');
      },
    },
    '../../../src/lib/training/questionSelectionContract.mjs': {
      filterTrainingQuestionsForAttempt: (questions) => questions,
      normalizeTrainingGameMode: () => 'full',
      normalizeTrainingHandSelection: () => 'all',
      trainingQuestionMatchesSelection: () => true,
    },
    '../../../src/lib/training/questionOrderContract.mjs': {
      shuffleBalancedQuestionOrder: (questions) => questions,
    },
    '../../../src/lib/training/trainingContinuationEligibility.mjs': {
      selectPublicAttestationContinuationAnswerForStrictParent: () => {
        throw new Error('ordinary delivery must not inspect an attestation continuation parent');
      },
      selectTrainingAttestationContinuationCohort: async () => {
        throw new Error('ordinary delivery must not build an attestation continuation cohort');
      },
    },
    '../../../src/lib/training/trainingAttestationContinuationContract.mjs': {
      validateTrainingAttestationContinuationPrecommit: () => {
        throw new Error('ordinary delivery must not validate an attestation continuation precommit');
      },
    },
    '../../../src/lib/training/trainingAttestationCohortDiagnostics.mjs': {
      createTrainingAttestationCohortCollector: () => {
        throw new Error('ordinary delivery must not collect attestation cohort diagnostics');
      },
      logTrainingAttestationCohortStage: () => {
        throw new Error('ordinary delivery must not log an attestation cohort stage');
      },
    },
    '../../../src/lib/training/trainingPersistence.mjs': {
      isTrainingPersistenceUnavailable,
      runTrainingPersistenceQuery: (queryFactory, options = {}) => runTrainingPersistenceQuery(
        queryFactory,
        { ...options, timeoutMs: 5, maxRetries: 0, baseDelay: 0 },
      ),
      trainingPersistenceUnavailableBody,
    },
    '../../../src/data/TRAINING_LIBRARY': {
      __esModule: true,
      default: [{ id: 'cash-001' }],
    },
  };
  const routeModule = { exports: {} };
  const evaluate = new Function('require', 'module', 'exports', compiled);
  evaluate((specifier) => {
    assert.ok(dependencies[specifier], `unexpected ${relativePath} dependency: ${specifier}`);
    return dependencies[specifier];
  }, routeModule, routeModule.exports);
  return { handler: routeModule.exports.default, captured };
}

async function assertNeverSettlingDeliveryReadFailsClosed(relativePath) {
  const { handler, captured } = loadTrainingDeliveryHandler(relativePath);
  const response = createApiResponse();
  const request = {
    method: 'GET',
    headers: { authorization: 'Bearer test-token' },
    query: {
      gameId: 'cash-001',
      level: '1',
      count: '1',
      sessionId: '33333333-3333-4333-8333-333333333333',
    },
  };
  const timeoutMarker = Symbol('route did not settle');
  const outcome = await Promise.race([
    handler(request, response).then(() => response),
    new Promise((resolve) => setTimeout(() => resolve(timeoutMarker), 250)),
  ]);
  assert.notEqual(outcome, timeoutMarker, `${relativePath} hung on a never-settling delivery read`);
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.body, trainingPersistenceUnavailableBody());
  assert.equal(captured.recoveryInputs.length, 1);
  assert.ok(captured.sourceTables.length > 0, 'mutable-source read must follow a manifest recovery miss');
}

test('session preferences do not replace catalog drills with custom cash spots', () => {
  assert.equal(isCustomTrainerConfig({
    difficulty: 'standard',
    timer: 'relaxed',
    mode: 'trainer',
    scope: 'all',
    tables: '1',
    feedbackRule: 'every',
    handSelection: 'all',
  }), false);

  assert.equal(isCustomTrainerConfig({
    gameType: 'mtt',
    stackDepth: 20,
    position: 'BTN',
  }), true);
});

test('chart games reject postflop cache pollution', () => {
  const rows = [
    {
      id: 'wrong',
      engine_type: 'PIO',
      question_data: {
        type: 'PIO',
        scenario: { street: 'flop' },
        boardCards: ['2d', '3c', '7d'],
        options: [{ id: 'x', text: 'Check' }, { id: 'b', text: 'Bet' }],
      },
    },
    {
      id: 'right',
      engine_type: 'CHART',
      question_data: {
        type: 'CHART',
        scenario: { street: 'preflop' },
        boardCards: [],
        options: [{ id: 'push', text: 'Push All-In' }, { id: 'fold', text: 'Fold' }],
      },
    },
  ];

  assert.deepEqual(
    filterCachedRowsForGame(rows, { sourceOfTruth: 'ICMIZER' }).map((row) => row.id),
    ['right']
  );
});

test('psychology games reject poker-solver cache rows', () => {
  const rows = [
    { id: 'pio', engine_type: 'PIO', question_data: { scenario: { street: 'river' } } },
    {
      id: 'mental',
      engine_type: 'SCENARIO',
      question_data: { scenario: { isPsychology: true } },
    },
  ];
  assert.deepEqual(
    filterCachedRowsForGame(rows, { sourceOfTruth: 'SCENARIO' }).map((row) => row.id),
    ['mental']
  );
});

test('PIO games reject a cached solver row from the wrong family or stack', () => {
  const rows = [
    { id: 'wrong-family', engine_type: 'PIO', question_data: { scenario: { street: 'flop', gameType: 'hu_cash', stackDepth: 100 } } },
    { id: 'wrong-stack', engine_type: 'PIO', question_data: { scenario: { street: 'flop', gameType: 'postflop_complete', stackDepth: 40 } } },
    { id: 'right', engine_type: 'PIO', question_data: { source: 'POSTFLOP_ENGINE', scenario: { street: 'flop', gameType: 'postflop_complete', stackDepth: 100 } } },
  ];
  assert.deepEqual(
    filterCachedRowsForGame(rows, {
      sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100,
    }).map((row) => row.id),
    ['right'],
  );
});

test('generated questions inherit the missing server-side PIO family and stack contract', () => {
  const question = {
    source: 'POSTFLOP_ENGINE',
    scenario: { street: 'flop', pot: 20.5 },
  };
  const gameConfig = {
    sourceOfTruth: 'PioSOLVER',
    pioGameType: 'hu_cash',
    pioStackDepth: 100,
  };
  assert.equal(hydrateMissingPIOScenarioContract(question, gameConfig), question);
  assert.deepEqual(question.scenario, {
    street: 'flop', pot: 20.5, gameType: 'hu_cash', stackDepth: 100,
  });
  assert.deepEqual(
    filterCachedRowsForGame([{ engine_type: 'PIO', question_data: question }], gameConfig),
    [{ engine_type: 'PIO', question_data: question }],
  );

  const authored = { scenario: { gameType: 'wrong_family', stackDepth: 40 } };
  hydrateMissingPIOScenarioContract(authored, gameConfig);
  assert.deepEqual(authored.scenario, { gameType: 'wrong_family', stackDepth: 40 });
});

test('postflop generation rejects missing pot geometry instead of inventing a six-BB pot', () => {
  const engine = fs.readFileSync('src/engines/DeterministicGTOEngine.js', 'utf8');
  assert.match(engine, /const postflopPot = Number\(scenario\.potSize\)/);
  assert.match(engine, /!Number\.isFinite\(postflopPot\) \|\| postflopPot <= 0/);
  assert.match(engine, /pot: postflopPot/);
  assert.doesNotMatch(engine, /pot: scenario\.potSize \|\| 6/);
});

test('unsealed warehouse cache rows cannot bypass live matrix and EV validation', () => {
  const rows = [
    { id: 'missing-source', engine_type: 'PIO', question_data: { scenario: { street: 'flop', gameType: 'hu_cash', stackDepth: 100 } } },
    { id: 'legacy-label', engine_type: 'PIO', question_data: { source: 'DETERMINISTIC_SOLVER', gtoFrequencies: { x: 70, b50: 30 }, scenario: { street: 'flop', gameType: 'hu_cash', stackDepth: 100 } } },
  ];
  assert.deepEqual(
    filterCachedRowsForGame(rows, {
      sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 100,
    }),
    [],
  );
});

test('answers are graded only from the checksum-bound canonical policy', () => {
  const record = fs.readFileSync('pages/api/training/record-question.js', 'utf8');
  const reseeder = fs.readFileSync('scripts/reseed-deterministic-cache.js', 'utf8');
  assert.match(record, /canonicalCacheRow = await getCanonicalQuestion\(receiptPayload\.questionId\)/);
  assert.match(record, /cacheRowIsServingEligible\(cacheRow\)/);
  assert.match(record, /bodyChecksum === snapshotChecksum/);
  assert.match(record, /stablePolicyJson\(canonicalQuestion\?\.solverPolicy\) === stablePolicyJson\(cacheRow\?\.canonical_policy\)/);
  assert.match(record, /answerContract = gradeTrainingAnswer\(\{/);
  assert.match(record, /is_correct:\s*(?:Boolean\()?canonicalGrade\.isCorrect\)?/);
  assert.doesNotMatch(record, /is_correct:[^\n]*\?[^\n]*isCorrect/);
  assert.match(record, /solver_verified: verified/);
  assert.match(record, /getImmutableQuestionSnapshot/);
  assert.match(record, /verifyTrainingGradingReceipt/);
  assert.match(record, /TRAINING_QUESTION_REFRESH_REQUIRED/);
  assert.match(record, /const persistedEVLoss = verified && canonicalGrade\.evLossMeasured[\s\S]*:\s*0;/);
  assert.doesNotMatch(record, /req\.body\.(?:isCorrect|evLoss|correctAnswer|question)/);
  assert.match(reseeder, /Pio cache question construction is permanently retired/);
  assert.match(reseeder, /throw new Error\('Legacy cache mutation is permanently retired\.'\)/);
});

test('only a fully contracted sanitized legacy envelope is grade-eligible', () => {
  const config = {
    sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 100,
  };
  const base = {
    engine_type: 'PIO',
    question_data: {
      source: 'LEGACY_STRATEGY_ARCHIVE',
      dataQuality: 'LEGACY_UNVERIFIED',
      scenario: { street: 'flop', gameType: 'hu_cash', stackDepth: 100 },
      solverProvenance: { verified: false, source: 'solved_spots_gold_legacy' },
      evidenceDisclosure: 'Legacy strategy archive; writer provenance is unavailable.',
      questionContract: { version: 1, valid: true },
    },
  };
  assert.deepEqual(filterCachedRowsForGame([base], config), []);
  assert.equal(filterCachedRowsForGame(
    [base], config, { allowSanitizedLegacyArchive: true },
  ).length, 1);
  const incomplete = structuredClone(base);
  delete incomplete.question_data.evidenceDisclosure;
  assert.deepEqual(filterCachedRowsForGame(
    [incomplete], config, { allowSanitizedLegacyArchive: true },
  ), []);
});

test('recording accepts the exact canonical archive written for a local preflop range', () => {
  const config = {
    sourceOfTruth: 'PioSOLVER',
    pioGameType: 'hu_cash',
    pioStackDepth: 100,
    pioStreet: 'preflop',
  };
  const row = {
    engine_type: 'PIO',
    question_data: {
      source: 'LEGACY_STRATEGY_ARCHIVE',
      legacySource: 'local_solver_ranges',
      dataQuality: 'LEGACY_UNVERIFIED',
      scenario: { street: 'preflop', gameType: 'hu_cash', stackDepth: 100 },
      solverProvenance: { verified: false, source: 'local_solver_ranges' },
      evidenceDisclosure: 'Legacy strategy archive; writer provenance is unavailable.',
      questionContract: { version: 1, valid: true },
    },
  };
  assert.deepEqual(filterCachedRowsForGame([row], config), []);
  assert.equal(filterCachedRowsForGame(
    [row], config, { allowSanitizedLegacyArchive: true },
  ).length, 1);
});

test('declared preflop PIO games accept only the audited local-range cache', () => {
  const rows = [
    { id: 'wrong', engine_type: 'PIO', question_data: { source: 'DETERMINISTIC_SOLVER', scenario: { street: 'flop', gameType: 'hu_cash', stackDepth: 100 } } },
    { id: 'right', engine_type: 'PIO', question_data: { source: 'local_solver_ranges', scenario: { street: 'preflop', stackDepth: 100 } } },
  ];
  assert.deepEqual(
    filterCachedRowsForGame(rows, {
      sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 100, pioStreet: 'preflop',
    }).map((row) => row.id),
    ['right'],
  );
});

test('both cache readers select engine_type and apply the exact cache contract', () => {
  const single = fs.readFileSync(path.join(ROOT, 'pages/api/training/get-question.js'), 'utf8');
  const batch = fs.readFileSync(path.join(ROOT, 'pages/api/training/batch-preload.js'), 'utf8');
  assert.match(single, /select\('[^']*question_data[^']*question_id[^']*engine_type[^']*canonical_policy[^']*policy_checksum[^']*'\)/);
  assert.match(single, /\.in\('quality_status', \['active', 'active_fallback'\]\)/);
  assert.match(single, /filterCachedRowsForGame/);
  assert.match(batch, /select\('[^']*question_data[^']*engine_type[^']*canonical_policy[^']*policy_checksum[^']*'\)/);
  assert.match(batch, /\.in\('quality_status', \['active', 'active_fallback'\]\)/);
  assert.match(batch, /filterCachedRowsForGame/);
  assert.doesNotMatch(single, /\.not\('question_id', 'in'/);
  assert.match(single, /filter\(\(row\) => cacheRowIsServingEligible\(row\) && !seenQuestionIds\.includes\(row\.question_id\)\)/);
});

test('single-question canonicalization preserves mastery levels eleven and twelve', () => {
  const source = fs.readFileSync('pages/api/training/get-question.js', 'utf8');
  const migration = fs.readFileSync('supabase/migrations/20260901130000_training_levels_one_through_twelve.sql', 'utf8');
  assert.match(source, /Math\.min\(12, Math\.max\(1, parseInt\(rawLevel, 10\) \|\| 1\)\)/);
  assert.doesNotMatch(source, /level: Math\.min\(10,/);
  assert.match(migration, /valid_level CHECK \(level BETWEEN 1 AND 12\)/);
  assert.match(migration, /current_level BETWEEN 1 AND 12/);
  assert.match(migration, /highest_level_completed BETWEEN 0 AND 12/);
  assert.match(migration, /arena_sessions_level_check[\s\S]*level BETWEEN 1 AND 12/);
});

test('both question endpoints persist the exact post-contract envelope used for grading', () => {
  const single = fs.readFileSync('pages/api/training/get-question.js', 'utf8');
  const batch = fs.readFileSync('pages/api/training/batch-preload.js', 'utf8');

  const rawQuestion = {
    id: 'canonical-build-behavior',
    type: 'SCENARIO',
    source: 'CURATED_SCENARIO',
    question: 'Which action best preserves the plan?',
    scenario: { isConceptQuestion: true },
    options: [
      { id: 'fold', text: 'Fold' },
      { id: 'call', text: 'Call' },
      { id: 'raise', text: 'Raise' },
      { id: 'all_in', text: 'All-In' },
    ],
    correctAnswer: 'raise',
  };
  assert.throws(
    () => buildTrainingCacheRow({
      question: rawQuestion,
      gameId: 'cash-001',
      questionKind: 'SCENARIO',
      gameType: 'cash',
      level: 1,
    }),
    /invalid canonical policy|requires an available canonical policy/,
  );

  const policyService = new SolverPolicyService();
  const canonicalQuestion = policyService.attachToQuestion(
    structuredClone(rawQuestion),
    'get-question',
  );
  const canonicalRow = buildTrainingCacheRow({
    question: canonicalQuestion,
    gameId: 'cash-001',
    questionKind: 'SCENARIO',
    gameType: 'cash',
    level: 1,
  });
  assert.equal(canonicalRow.question_id, rawQuestion.id);
  assert.equal(canonicalRow.question_data.correctAnswer, rawQuestion.correctAnswer);
  assert.deepEqual(canonicalRow.question_data.solverPolicy, canonicalQuestion.solverPolicy);
  assert.equal(canonicalRow.source_classification, 'CURATED');

  assert.match(single, /question = normalizeCampaignQuestionWithoutFabrication\(question\)/);
  assert.match(single, /applyDeterministicEnginePatches\(deterministicEngine\)/);
  assert.match(batch, /applyDeterministicEnginePatches\(deterministicEngine\)/);
  assert.match(single, /buildTrainingCacheRow\(\{/);
  assert.match(single, /\.upsert\(canonicalPayload/);
  assert.match(single, /defaultToNull: false/);
  assert.match(single, /withPersistedCacheReceipt\(canonicalPayload\.question_data, persisted\.data\)/);
  assert.match(single, /recordTrainingQuestionsServed/);
  assert.match(single, /Refusing to serve an uncanonicalized question/);
  assert.match(single, /status\(503\)\.json\(trainingPersistenceUnavailableBody\(\)\)/);
  assert.match(batch, /for \(const question of configuredCandidates\)/);
  assert.match(batch, /canonicalPairs\.length >= questionCount/);
  assert.match(batch, /canonicalPairs\.push\(\{ question, row \}\)/);
  assert.match(batch, /const canonicalRows = selectedCanonicalPairs\.map\(\(\{ row \}\) => row\)/);
  assert.match(batch, /selectedCanonicalPairs\.length !== questionCount/);
  assert.match(batch, /TRAINING_ATTEMPT_QUESTION_SHORTFALL/);
  assert.match(batch, /buildTrainingCacheRow\(\{/);
  assert.match(batch, /\.upsert\(canonicalRows, \{[\s\S]*defaultToNull: false/);
  assert.match(batch, /withPersistedCacheReceipt/);
  assert.match(batch, /servedBatch = selectedCanonicalPairs\.map/);
  assert.match(batch, /recordTrainingQuestionsServed/);
  assert.match(batch, /Refusing to serve uncanonicalized questions/);
  assert.match(batch, /status\(503\)\.json\(trainingPersistenceUnavailableBody\(\)\)/);
  assert.doesNotMatch(batch, /\.upsert\(canonicalRows, \{[^}]*ignoreDuplicates: true/);
  const recorder = fs.readFileSync('pages/api/training/record-question.js', 'utf8');
  assert.match(single, /prepareTrainingAttemptDelivery/);
  assert.match(batch, /prepareTrainingAttemptDelivery/);
  assert.match(recorder, /getImmutableQuestionSnapshot/);
  assert.match(recorder, /verifyTrainingGradingReceiptEnvelope/);
  assert.match(recorder, /verifyTrainingGradingReceipt/);
  assert.doesNotMatch(recorder, /req\.body\.(?:question|correctAnswer)/);
  assert.doesNotMatch(batch, /hydrateMissingPIOScenarioContract\(qData, declaredCfg\)/);
  assert.match(batch, /isTrainingQuestionCampaignEligible\(canonical\)/);
  const hook = fs.readFileSync('src/hooks/useGTOTrainer.js', 'utf8');
  assert.match(hook, /TRAINING_QUESTION_REFRESH_REQUIRED/);
  assert.match(hook, /pendingAnswerPersistenceRef\.current/);
  assert.match(hook, /refreshRequiredQuestionIdsRef\.current\.delete/);
  assert.match(hook, /await fetchSingleQuestion\(selectedLevel, questionNumber, \{ throwOnError: true \}\)/);
  assert.match(hook, /await persistPendingAnswer\(pendingPersistence\)/);
  assert.match(hook, /const entry = \{[\s\S]*submission,[\s\S]*finalized: false,[\s\S]*onPersisted: finalizePersistedAnswer/);
  assert.match(hook, /retryAnswerPersistence[\s\S]*persistPendingAnswer\(entry, \{ retry: true \}\)/);
  assert.match(hook, /submissionId: submission\.submissionId/);
  assert.match(hook, /if \(nextQuestionInFlightRef\.current\) return;[\s\S]*const transitionToken = \{ lease: transitionLease \};[\s\S]*nextQuestionInFlightRef\.current = transitionToken/);
  assert.match(hook, /finally \{[\s\S]*nextQuestionInFlightRef\.current === transitionToken[\s\S]*nextQuestionInFlightRef\.current = null/);
  assert.match(hook, /if \(persistenceResult\?\.ok !== true\)[\s\S]*setAnswerSaveError/);
  assert.match(hook, /setAnswerSaveError\([\s\S]*return;[\s\S]*pendingAnswerPersistenceRef\.current = null/);
  assert.doesNotMatch(hook, /pendingAnswerPersistenceRef\.current = null;\s*const .*await/);
});

test('Training persistence retries an invalid HTTP2 session with a fresh bounded query', async () => {
  let calls = 0;
  const result = await runTrainingPersistenceQuery(
    () => ({
      async abortSignal(signal) {
        assert.ok(signal instanceof AbortSignal);
        calls += 1;
        if (calls === 1) {
          return {
            data: null,
            error: { code: 'ERR_HTTP2_INVALID_SESSION', message: 'The session has been destroyed' },
          };
        }
        return { data: [{ id: 'canonical' }], error: null };
      },
    }),
    { label: 'Test:HTTP2', baseDelay: 0, timeoutMs: 100 },
  );

  assert.equal(calls, 2);
  assert.deepEqual(result.data, [{ id: 'canonical' }]);
  assert.equal(isRetryable({ cause: { code: 'ERR_HTTP2_INVALID_SESSION' } }), true);
});

test('Training persistence fails closed with one stable retryable API contract', async () => {
  await assert.rejects(
    runTrainingPersistenceQuery(
      () => ({
        async abortSignal() {
          return { data: null, error: { code: '23514', message: 'contract rejected' } };
        },
      }),
      { label: 'Test:Failure', maxRetries: 0, timeoutMs: 100 },
    ),
    (error) => isTrainingPersistenceUnavailable(error) && error.code === '23514',
  );
  assert.deepEqual(trainingPersistenceUnavailableBody(), {
    success: false,
    error: 'Training data is temporarily unavailable. Please retry this hand.',
    code: 'TRAINING_PERSISTENCE_UNAVAILABLE',
    retryable: true,
  });

  const record = fs.readFileSync('pages/api/training/record-question.js', 'utf8');
  assert.match(record, /runTrainingPersistenceQuery/);
  assert.match(record, /isTrainingPersistenceUnavailable/);
  assert.match(record, /status\(503\)\.json\(trainingPersistenceUnavailableBody\(\)\)/);
  assert.doesNotMatch(record, /withRetry/);
});

test('Training persistence aborts a stalled PostgREST attempt at its deadline', async () => {
  let abortObserved = false;
  await assert.rejects(
    runTrainingPersistenceQuery(
      () => ({
        abortSignal(signal) {
          return new Promise((resolve, reject) => {
            signal.addEventListener('abort', () => {
              abortObserved = true;
              const error = new Error('request deadline elapsed');
              error.name = 'AbortError';
              reject(error);
            }, { once: true });
          });
        },
      }),
      { label: 'Test:Deadline', maxRetries: 0, timeoutMs: 5 },
    ),
    (error) => isTrainingPersistenceUnavailable(error) && error.cause?.name === 'AbortError',
  );
  assert.equal(abortObserved, true);
});

test('get-question fails closed when its delivery reads never settle', async () => {
  await assertNeverSettlingDeliveryReadFailsClosed('pages/api/training/get-question.js');
});

test('batch-preload fails closed when its delivery reads never settle', async () => {
  await assertNeverSettlingDeliveryReadFailsClosed('pages/api/training/batch-preload.js');
});

test('both delivery routes return an immutable recovery winner before touching mutable sources', async () => {
  for (const relativePath of [
    'pages/api/training/get-question.js',
    'pages/api/training/batch-preload.js',
  ]) {
    const recoveredQuestion = {
      id: `winner-${relativePath.includes('batch') ? 'batch' : 'single'}`,
      policyChecksum: 'a'.repeat(64),
      _gradingContext: { handOrdinal: 7 },
    };
    const { handler, captured } = loadTrainingDeliveryHandler(relativePath, {
      recoveredDelivery: {
        attemptId: 'attempt-1',
        sessionKind: 'campaign',
        targetHands: 20,
        questions: [recoveredQuestion],
      },
    });
    const response = createApiResponse();
    await handler({
      method: 'GET',
      headers: { authorization: 'Bearer test-token' },
      query: {
        gameId: 'cash-001',
        level: '1',
        count: '1',
        sessionId: 'session-1',
        handOrdinal: '7',
        handOrdinalStart: '7',
      },
    }, response);

    assert.equal(response.statusCode, 200, relativePath);
    assert.equal(captured.recoveryInputs.length, 1, relativePath);
    assert.equal(captured.recoveryInputs[0].handOrdinal, 7, relativePath);
    assert.deepEqual(captured.sourceTables, [], `${relativePath} read mutable source data before recovery`);
    const served = relativePath.includes('batch')
      ? response.body.questions[0]
      : response.body.question;
    assert.equal(served.id, recoveredQuestion.id, relativePath);
  }
});

test('an explicit street target filters warm cache rows before generation', () => {
  const batch = fs.readFileSync(path.join(ROOT, 'pages/api/training/batch-preload.js'), 'utf8');
  assert.match(batch, /import \{ streetOfCachedRow \} from '[^']+declaredStreet'/);
  assert.match(batch, /targetStreet\s*\? authorityEligibleRows\.filter\(\(row\) => streetOfCachedRow\(row\) === targetStreet\)/);
});

test('warehouse source labels and legacy provenance objects never certify solver evidence', () => {
  const legacy = {
    source: 'DETERMINISTIC_SOLVER',
    gtoFrequencies: { x: 40, b50: 60 },
  };
  assert.equal(isVerifiedSolverQuestion(legacy), false);
  assert.equal(isVerifiedSolverQuestion({
    ...legacy,
    dataQuality: 'SOLVER_EXACT',
    solverProvenance: { verified: true },
  }), false);
  assert.equal(isVerifiedSolverQuestion({
    ...legacy,
    dataQuality: 'SOLVER_EXACT',
    solverProvenance: {
      verified: true,
      scenarioHash: 'hu_cash_BTN_100bb_AsKd2c',
      solverVersion: 'PioSOLVER-edge',
      solverBinaryChecksum: 'd'.repeat(64),
      machineId: 'M1',
      pipelineCommit: 'a'.repeat(40),
      manifestVersion: '4',
      manifestChecksum: 'b'.repeat(64),
      sourceArtifactChecksum: 'c'.repeat(64),
      qualityStatus: 'validated',
      auditedAt: '2026-08-31T17:00:00Z',
    },
  }), false);
});

test('both question endpoints reject solver-card fabrication and share subject routing', () => {
  const single = fs.readFileSync(path.join(ROOT, 'pages/api/training/get-question.js'), 'utf8');
  const batch = fs.readFileSync(path.join(ROOT, 'pages/api/training/batch-preload.js'), 'utf8');
  assert.match(single, /getGameScenarioConfig/);
  assert.match(single, /generated = await deterministicEngine\.generateBatch/);
  for (const source of [single, batch]) {
    assert.match(source, /normalizeCampaignQuestionWithoutFabrication/);
    assert.match(source, /isTrainingQuestionCampaignEligible/);
    assert.doesNotMatch(source, /_getDeterministicCards|hashSeed|handNotationToRepresentativeCards/);
    assert.doesNotMatch(source, /scenario\.heroPosition\s*=|scenario\.villainPosition\s*=/);
    assert.doesNotMatch(source, /scenario\.pot\s*=|scenario\.heroStack\s*=|scenario\.villainStack\s*=/);
  }
});

test('multi-street progression follows only the exact exported continuation', async () => {
  const { MultiStreetHand } = await import('../src/engines/MultiStreetHandManager.js');
  const exactQuestion = {
    heroHand: 'AKs', heroCards: ['As', 'Ks'],
    solverPolicy: {
      actions: [{
        id: 'b412', sourceCode: 'b412', family: 'bet', legal: true,
        size: { unit: 'pot_fraction', bigBlinds: 4.12, exact: true },
      }],
    },
    scenario: {
      board: 'Qh 7d 2c', street: 'flop', pot: 5.5, stackDepth: 100,
      heroPosition: 'BTN', villainPosition: 'BB',
      solverActionUnits: 'chips', nextStreetContinuationAction: 'b412',
    },
  };
  const hand = new MultiStreetHand(exactQuestion);
  hand.recordAction('b412', 'best', 0);
  assert.equal(hand.currentStreet, 'flop');
  assert.equal(hand.pot, 13.74);

  const offTree = new MultiStreetHand(exactQuestion);
  offTree.recordAction('c', 'correct', 0);
  assert.equal(offTree.currentStreet, 'done');

  const authored = new MultiStreetHand({
    ...exactQuestion,
    scenario: { ...exactQuestion.scenario, nextStreetContinuationAction: null },
  });
  authored.recordAction('b75', 'best', 0);
  assert.equal(authored.currentStreet, 'done');

  const trainer = fs.readFileSync('src/hooks/useGTOTrainer.js', 'utf8');
  assert.match(trainer, /feedback\?\.continuation\?\.actionId/);
  assert.match(trainer, /fullHandMode[\s\S]{0,120}revealedContinuationAction[\s\S]{0,120}revealedStreet === 'flop'/);
  assert.match(trainer, /multiStreetHandRef\.current = new MultiStreetHand\(currentQuestion\)/);
  assert.match(trainer, /hand\.applyServerContinuation\(data\)/);
  assert.match(trainer, /multiStreetHandRef\.current !== hand/);
  assert.match(trainer, /multiStreetHandRef\.current\?\.isComplete[\s\S]*completedHandSummary = finishedHand\.getHandSummary\(\)/);
  assert.match(trainer, /await saveProgress[\s\S]*if \(completedHandSummary\) setHandSummary\(completedHandSummary\)[\s\S]*setIsMultiStreetActive\(false\)/);
  assert.ok(
    trainer.indexOf('await saveProgress(attemptId, transitionLease)')
      < trainer.indexOf('setIsMultiStreetActive(false)', trainer.indexOf('const nextQuestion = useCallback')),
    'completion retries must retain the active multi-street hand until settlement succeeds',
  );
});

test('curated fallback honors the exact game stack and excludes cached identities', async () => {
  const { generateCuratedPokerConceptBatch } = await import('../src/lib/training/curatedPokerConcepts.js');
  const first = generateCuratedPokerConceptBatch({
    gameId: 'spins-001', level: 1, count: 4,
    gameConfig: { pioGameType: 'spin_3max_chipev', pioStackDepth: 20 },
    spotTypes: ['rfi'], stackDepths: [20],
  });
  const second = generateCuratedPokerConceptBatch({
    gameId: 'spins-001', level: 1, count: 4,
    gameConfig: { pioGameType: 'spin_3max_chipev', pioStackDepth: 20 },
    spotTypes: ['rfi'], stackDepths: [20], seenIds: first.map((question) => question.id),
  });
  assert.equal(first.length, 4);
  assert.equal(second.length, 4);
  assert.deepEqual(new Set([...first, ...second].map((question) => question.id)).size, 8);
  assert.deepEqual([...first, ...second].every((question) => question.scenario.stackDepth === 20), true);
  const turnOnly = generateCuratedPokerConceptBatch({
    gameId: 'mtt-021', level: 1, count: 8,
    gameConfig: { pioGameType: 'mtt_postflop', pioStackDepth: 100 },
    spotTypes: ['cbet', 'turn_barrel', 'river_bluff'], targetStreet: 'turn',
  });
  assert.equal(turnOnly.length, 8);
  assert.equal(turnOnly.every((question) => question.scenario.street === 'turn'), true);
  assert.equal(turnOnly.every((question) => question.boardCards.length === 4), true);

  const engine = fs.readFileSync('src/engines/DeterministicGTOEngine.js', 'utf8');
  const batch = fs.readFileSync('pages/api/training/batch-preload.js', 'utf8');
  assert.match(engine, /stackDepths: Number\.isFinite\(Number\(gameConfig\?\.pioStackDepth\)\)/);
  assert.match(engine, /seenIds,/);
  assert.match(engine, /positions: targetPositions,[\s\S]{0,80}targetStreet,/);
  assert.match(batch, /const generationSeenIds = Array\.from\(new Set/);
  assert.match(batch, /seenIds: generationSeenIds/);
});

test('next-street client sends only the signed parent while the API derives exact state', () => {
  const trainer = fs.readFileSync('src/hooks/useGTOTrainer.js', 'utf8');
  const api = fs.readFileSync('pages/api/training/next-street.js', 'utf8');
  const continuationAuthority = fs.readFileSync(
    'src/lib/training/trainingContinuationEligibility.mjs',
    'utf8',
  );
  assert.match(trainer, /body: JSON\.stringify\(\{ gradingReceipt: activeContext\.receipt \}\)/);
  const requestStart = trainer.indexOf("trainingFetch('/api/training/next-street'");
  const requestEnd = trainer.indexOf('\n      });', requestStart);
  assert.ok(requestStart >= 0 && requestEnd > requestStart, 'next-street request boundary is present');
  const requestSource = trainer.slice(requestStart, requestEnd);
  assert.doesNotMatch(requestSource, /heroCards|boardCards|heroPosition|villainPosition|\bpot\b|stackDepth/);
  assert.match(api, /verifyTrainingGradingReceiptEnvelope/);
  assert.match(api, /verifyTrainingGradingReceipt/);
  assert.match(api, /from\('training_question_snapshots'\)/);
  assert.match(api, /from\('training_answers'\)[\s\S]*receiptPayload\.jti/);
  assert.match(api, /resolveStrictTrainingContinuation\(\{/);
  assert.match(
    continuationAuthority,
    /new Set\(normalizedCards\)\.size === normalizedCards\.length/,
  );
  assert.match(continuationAuthority, /TRAINING_CONTINUATION_STATE_INVALID/);
  assert.doesNotMatch(api, /req\.(?:body|query)\?\.(?:heroCards|boardCards|heroPosition|villainPosition|pot|stackDepth)/);
});

test('chart hand classes render a matching legal representative combo', () => {
  assert.deepEqual(handNotationToRepresentativeCards('AKs'), ['As', 'Ks']);
  assert.deepEqual(handNotationToRepresentativeCards('AKo'), ['As', 'Kh']);
  assert.deepEqual(handNotationToRepresentativeCards('QQ'), ['Qs', 'Qh']);
  assert.deepEqual(
    handNotationToRepresentativeCards('AKs', ['As', 'Kh']),
    ['Ad', 'Kd'],
  );
  assert.equal(handNotationToRepresentativeCards('AhAh'), null);
  assert.equal(handNotationToRepresentativeCards('not-a-hand'), null);
});

test('audited push-fold charts are canonical preflop decisions with no board', async () => {
  const batchEndpoint = fs.readFileSync(
    path.join(ROOT, 'pages/api/training/batch-preload.js'),
    'utf8',
  );
  const { normalizeAuditedChartQuestion } = await import('../src/lib/training/solverDecisionEvidence.js');
  const question = {
    type: 'CHART',
    scenario: { street: 'flop', board: 'Qs 7d 2c' },
    boardCards: ['Qs', '7d', '2c'],
    options: [
      { id: 'push', text: 'Push', frequency: 35 },
      { id: 'fold', text: 'Fold', frequency: 65 },
    ],
  };
  normalizeAuditedChartQuestion(question);
  assert.equal(question.scenario.street, 'preflop');
  assert.equal(question.street, 'preflop');
  assert.deepEqual(question.scenario.boardCards, []);
  assert.deepEqual(question.boardCards, []);
  assert.match(batchEndpoint, /if \(String\(question\.type \|\| ''\)\.toUpperCase\(\) === 'CHART'\)/);
  assert.doesNotMatch(batchEndpoint, /q\.engine_type[\s\S]{0,120}normalizeAuditedChartQuestion\(question\)/);
});

test('runtime uses canonical auth and fails closed on progress API errors', () => {
  const levelSelector = fs.readFileSync(
    path.join(ROOT, 'src/components/training/LevelSelector.tsx'),
    'utf8'
  );
  const trainer = fs.readFileSync(path.join(ROOT, 'src/hooks/useGTOTrainer.js'), 'utf8');

  assert.match(levelSelector, /authToken = getSessionToken\(\)/);
  assert.doesNotMatch(levelSelector, /sb-kuklfnapbkmacvwxktbh-auth-token/);
  assert.match(trainer, /import \{ authedFetch, getAuthUser \} from '\.\.\/lib\/authUtils'/);
  assert.match(trainer, /createBoundedTrainingFetch\(authedFetch\)/);
  assert.doesNotMatch(trainer, /\bfetch\(/);
  assert.doesNotMatch(trainer, /await\s+authedFetch\s*\(/);
  assert.match(trainer, /trainingFetch\(`\/api\/training\/batch-preload\?\$\{params\}`\)/);
  assert.match(trainer, /if \(!response\.ok \|\| payload\?\.success !== true\)/);
  assert.match(trainer, /isCustomTrainerConfig\(trainerConfig\)/);
  assert.match(trainer, /level: selectedLevel/);
});

test('training hub keeps its signed-out primary action live and uses canonical login routing', () => {
  const hub = fs.readFileSync(path.join(ROOT, 'pages/hub/training.js'), 'utf8');

  assert.match(hub, /pathname: '\/auth\/login'/);
  assert.match(hub, /query: \{ redirect: '\/hub\/training' \}/);
  assert.doesNotMatch(hub, /pathname: '\/login'|query: \{ next: '\/hub\/training' \}/);
  assert.match(hub, /startDrill\(jarvisPick \|\| TRAINING_LIBRARY\[0\]\)/);
  assert.doesNotMatch(hub, /disabled=\{!jarvisPick\}/);
  assert.match(hub, /Build Better Decisions, One Hand At A Time\./);
  assert.match(hub, /label: 'Cash Games'/);
  assert.match(hub, /label: 'Mental Game'/);
});

test('per-question confusion analytics identify repeated wrong choices', () => {
  const result = buildQuestionConfusion([
    { game_id: 'mtt-001', question_id: 'q1', answer_id: 'fold', is_correct: false, ev_loss: 1.2, ev_loss_measured: true, solver_verified: true, evidence_metadata: { optimalAction: 'push' }, answered_at: '2026-08-29T10:00:00Z' },
    { game_id: 'mtt-001', question_id: 'q1', answer_id: 'fold', is_correct: false, ev_loss: 0.8, ev_loss_measured: true, solver_verified: true, evidence_metadata: { optimalAction: 'push' }, answered_at: '2026-08-29T11:00:00Z' },
    { game_id: 'mtt-001', question_id: 'q1', answer_id: 'push', is_correct: true, ev_loss: 0, ev_loss_measured: true, solver_verified: true, evidence_metadata: { optimalAction: 'push' }, answered_at: '2026-08-29T12:00:00Z' },
    { game_id: 'mtt-001', question_id: 'q2', answer_id: 'call', is_correct: false, ev_loss: 500, ev_loss_measured: false, solver_verified: true, answered_at: '2026-08-29T12:10:00Z' },
  ]);
  assert.equal(result[0].attempts, 3);
  assert.equal(result[0].wrong, 2);
  assert.equal(result[0].confusionRate, 67);
  assert.deepEqual(result[0].mostCommonWrongAnswer, { answerId: 'fold', count: 2 });
  assert.equal(result[0].optimalAction, 'push');
  assert.equal(result[0].totalEvLoss, 2);
  assert.equal(result[0].avgEvLoss, 0.667);
  assert.equal(result[0].measuredEvDecisions, 3);
  const unmeasured = result.find((row) => row.questionId === 'q2');
  assert.equal(unmeasured.totalEvLoss, null);
  assert.equal(unmeasured.avgEvLoss, null);
  assert.equal(unmeasured.measuredEvDecisions, 0);
});

test('both poker and psychology feedback expose canonical question reporting', () => {
  const router = fs.readFileSync(path.join(ROOT, 'src/components/training/GameUIRouter.jsx'), 'utf8');
  const table = fs.readFileSync(
    path.join(ROOT, 'src/components/training/games/UniversalDynamicTable.jsx'),
    'utf8'
  );
  const psychology = fs.readFileSync(
    path.join(ROOT, 'src/components/training/games/PsychologyTiltControlUI.jsx'),
    'utf8'
  );
  const questionCard = fs.readFileSync(
    path.join(ROOT, 'src/components/training/GTOQuestionCard.jsx'),
    'utf8'
  );
  const reportApi = fs.readFileSync(
    path.join(ROOT, 'pages/api/training/report-question.js'),
    'utf8'
  );

  assert.match(router, /<PsychologyTiltControlUI[\s\S]*gameId=\{gameId\}/);
  assert.match(psychology, /<GTOQuestionCard[\s\S]*gameId=\{gameId\}/);
  assert.match(table, /<TrainingQuestionReport[\s\S]*gameId=\{gameId\}/);
  assert.match(questionCard, /<TrainingQuestionReport gameId=\{gameId\} question=\{question\}/);
  assert.match(reportApi, /canonicalQuestionExists/);
  assert.match(reportApi, /user_id,game_id,question_id,reason/);
});

test('every poker game reaches the shared Club Arena table surface', () => {
  const arena = fs.readFileSync(path.join(ROOT, 'src/components/training/GodModeArena.jsx'), 'utf8');
  const router = fs.readFileSync(path.join(ROOT, 'src/components/training/GameUIRouter.jsx'), 'utf8');
  const table = fs.readFileSync(
    path.join(ROOT, 'src/components/training/games/UniversalDynamicTable.jsx'),
    'utf8'
  );

  assert.doesNotMatch(arena, /gameId === 'adv-011'|gameId === 'quiz-gauntlet'/);
  assert.match(router, /<UniversalDynamicTable[\s\S]*gameId=\{gameId\}/);
  assert.match(table, /data-training-ui="club-arena-table"/);
});

test('runtime matrix workers claim a game before yielding to page creation', () => {
  const audit = fs.readFileSync(
    path.join(ROOT, 'scripts/training-runtime-surface-audit.mjs'),
    'utf8'
  );
  const claimIndex = audit.indexOf('const game = queue.shift()');
  const pageIndex = audit.indexOf('const page = await context.newPage()', claimIndex);

  assert.ok(claimIndex >= 0, 'runtime matrix must claim a queued game');
  assert.ok(pageIndex > claimIndex, 'game ownership must be claimed before an awaited page creation');
  assert.doesNotMatch(audit, /auditGame\(page, queue\.shift\(\)/);
});

test('runtime matrix waits for rendered viewport images before classifying failures', () => {
  const audit = fs.readFileSync(
    path.join(ROOT, 'scripts/training-runtime-surface-audit.mjs'),
    'utf8'
  );

  assert.match(audit, /async function waitForVisibleImages\(page/);
  assert.match(audit, /box\.bottom > 0[\s\S]*box\.top < innerHeight/);
  assert.match(audit, /await waitForVisibleImages\(page\)/);
  assert.match(
    audit,
    /visibleInViewport\(image\)[\s\S]*!image\.closest\('\.approved-global-header'\)[\s\S]*\(!image\.complete \|\| image\.naturalWidth === 0\)/
  );
  assert.match(audit, /if \(state\.brokenVisibleImages\.length\)[\s\S]*page\.reload\(/);
  assert.match(audit, /imageRecoveryChecks:/);
});

test('runtime matrix uses deployment-bound, fail-closed checkpoint recovery', () => {
  const audit = fs.readFileSync(
    path.join(ROOT, 'scripts/training-runtime-surface-audit.mjs'),
    'utf8'
  );
  const health = fs.readFileSync(path.join(ROOT, 'pages/api/health/index.js'), 'utf8');
  const parityAudit = fs.readFileSync(
    path.join(ROOT, 'scripts/training-phase6-parity-audit.mjs'),
    'utf8'
  );

  assert.match(audit, /TRAINING_AUDIT_CHECKPOINT/);
  assert.match(audit, /assertSupportedNodeVersion\(\)/);
  assert.match(audit, /await readDeploymentIdentity\(\)/);
  assert.match(health, /const commitSha = process\.env\.VERCEL_GIT_COMMIT_SHA \|\| process\.env\.BUILD_COMMIT_SHA \|\| 'local'/);
  assert.match(health, /version: commitSha,\s*commitSha,/);
  assert.doesNotMatch(health, /commitSha\.substring\(/);
  assert.match(audit, /const commitSha = String\(health\?\.commitSha \|\| ''\)\.trim\(\)/);
  assert.match(audit, /assert\.equal\(\s*commitSha,\s*EXPECTED_BUILD,/);
  assert.match(audit, /auditImplementationSha256/);
  assert.match(audit, /catalogSha256/);
  assert.match(audit, /acquireCheckpointLock/);
  assert.match(audit, /validateSuccessfulBatch/);
  assert.match(audit, /validateCompleteSuccessfulRun/);
  assert.match(audit, /if \(checkpoint\.batchResults\[batchKey\]\) continue/);
  assert.match(audit, /removeCheckpointAfterSuccessfulRun\(CHECKPOINT_PATH, success\)/);
  assert.match(parityAudit, /waitForResponse\([\s\S]*\/api\/training\/record-question/);
  assert.match(parityAudit, /assert\.equal\(response\.status\(\), 200/);
  assert.match(parityAudit, /assert\.equal\(body\?\.success, true/);
  assert.match(parityAudit, /typeof body\?\.evidence\?\.classification, 'string'/);
  assert.match(parityAudit, /typeof body\?\.evidence\?\.isCorrect, 'boolean'/);
  assert.match(parityAudit, /classificationCorrectness\(body\.evidence\.classification\), visibleCorrect/);
  assert.match(parityAudit, /persistedEV\.evLossMeasured === true/);
  assert.match(parityAudit, /EV NOT MEASURED/);
  assert.match(audit, /fixture unexpectedly claimed measured EV/);
  assert.match(audit, /rendered an unmeasured compatibility zero as exact EV/);
  assert.match(parityAudit, /await assertDeploymentUnchanged\(\)/);
  assert.match(parityAudit, /full Phase 6 parity certification requires 18 case checks/);
  assert.match(audit, /assert\.equal\(catalogGames\.length, 107/);
  assert.match(audit, /runtime audit catalog contains duplicate game ids/);
  assert.match(audit, /full runtime certification requires 642 surface checks/);
  assert.match(audit, /function attachPageDiagnostics\(page\)/);
  assert.match(audit, /appendDiagnosticFailures\([\s\S]*diagnosticsSince\(diagnostics, lifecycleDiagnosticCursor\)/);
  assert.match(audit, /transientPreloadFailures/);
  assert.match(audit, /recordQuestionRequests\.length,[\s\S]*QUESTIONS_PER_SESSION \* 2/);
  assert.match(audit, /scanlineElements/);
  assert.match(audit, /const expectedSurfaceChecks = \[\.\.\.expectedBatches\.values\(\)\]\.reduce/);
  assert.match(audit, /assert\.equal\(\s*results\.length,\s*expectedSurfaceChecks,\s*'runtime audit result ledger is incomplete'/);
  assert.match(audit, /expectedSurfaceChecks,/);
  assert.match(audit, /surfaceChecks: results\.length/);
  assert.match(audit, /\/\/ Retain every individual game\/viewport\/surface assertion[\s\S]*\n\s*results,\s*\n\s*failures,/);
});

test('mobile arena launch remains tappable on the footerless safe-area edge', () => {
  const trainingCss = fs.readFileSync(path.join(ROOT, 'src/styles/worlds/training.css'), 'utf8');
  const notificationPrompt = fs.readFileSync(
    path.join(ROOT, 'src/components/notifications/FirstRunNotificationPrompt.jsx'),
    'utf8'
  );

  assert.match(
    trainingCss,
    /sp-arena-lobby__launch[\s\S]*bottom:\s*calc\(10px \+ env\(safe-area-inset-bottom, 0px\)\)/
  );
  assert.match(notificationPrompt, /'\/hub\/training\/arena'/);
  assert.match(notificationPrompt, /'\/hub\/club-arena'/);
});

test('campaign level maps fail open when remote enrichment stalls', () => {
  const levelSelector = fs.readFileSync(
    path.join(ROOT, 'src/components/training/LevelSelector.tsx'),
    'utf8'
  );

  assert.match(levelSelector, /const LEVEL_DATA_TIMEOUT_MS = 8_000/);
  assert.match(levelSelector, /Promise\.race\(\[request\(controller\.signal\), deadline\]\)/);
  assert.match(levelSelector, /fetch\(`\/api\/games\/\$\{gameId\}`,[\s\S]*?\{ signal \}/);
  assert.match(levelSelector, /authedFetch\(`\/api\/training\/progress\?userId=\$\{userId\}&gameId=\$\{gameId\}`,[\s\S]*?\{ signal \}/);
  assert.match(levelSelector, /getGameById\(gameId\)/);
  assert.match(levelSelector, /Progress fetch failed; no mastery will be inferred/);
  assert.match(levelSelector, /progressAvailable = false/);
  assert.match(levelSelector, /setProgressUnavailable\(/);
  assert.match(levelSelector, /finally \{\s*setLoading\(false\)/);
});

test('campaign resume consumes game and progress bodies before aborting deadlines', () => {
  const selector = fs.readFileSync(path.join(ROOT, 'src/components/training/LevelSelector.tsx'), 'utf8');
  assert.match(selector, /withLevelDataDeadline\(async \(signal\) => \{[\s\S]*return gameRes\.json\(\);/);
  assert.match(
    selector,
    /withLevelDataDeadline\(async \(signal\) => \{[\s\S]*payload = await progressRes\.json\(\);[\s\S]*return payload;/
  );
  assert.match(selector, /if \(!progressRes\.ok \|\| payload\?\.success === false\)/);
  assert.doesNotMatch(selector, /const progressRes = await withLevelDataDeadline[\s\S]{0,180}progressRes\.json/);
});

test('batch preload retries transient upstream failures before single-question fallback', () => {
  const trainer = fs.readFileSync(path.join(ROOT, 'src/hooks/useGTOTrainer.js'), 'utf8');
  assert.match(trainer, /for \(let attempt = 0; attempt < 3; attempt \+= 1\)/);
  assert.match(trainer, /response\.status === 429 \|\| response\.status >= 500/);
  assert.match(trainer, /if \(response\.ok \|\| !retryable \|\| attempt === 2\) break/);
  assert.match(trainer, /return fetchSingleQuestion\(effectiveLevel, questionNumber\)/);
});

test('offline packs cache real questions and are consumed by the arena', () => {
  const preloader = fs.readFileSync(path.join(ROOT, 'pages/hub/training/gto-preloader.js'), 'utf8');
  const trainer = fs.readFileSync(path.join(ROOT, 'src/hooks/useGTOTrainer.js'), 'utf8');
  const cache = fs.readFileSync(path.join(ROOT, 'src/lib/training/offlineQuestionCache.js'), 'utf8');

  assert.match(preloader, /const levelSessionId = `\$\{packSessionId\}-level-\$\{level\}`/);
  assert.match(preloader, /sessionId: levelSessionId/);
  assert.match(preloader, /difficulty: 'standard'/);
  assert.match(preloader, /assertSignedPackPayload\(payload, levelSessionId\)/);
  assert.match(preloader, /setOfflineQuestions\([\s\S]*tree\.gameId,[\s\S]*level,[\s\S]*payload\.questions,[\s\S]*userId,[\s\S]*OFFLINE_PACK_DELIVERY_CONTRACT/);
  assert.doesNotMatch(preloader, /Float32Array|binaryStub/);
  assert.match(trainer, /getOfflineQuestions\([\s\S]*gameId,[\s\S]*effectiveLevel,[\s\S]*userId,[\s\S]*offlineCacheContract/);
  assert.match(trainer, /setOfflineQuestions\([\s\S]*gameId,[\s\S]*effectiveLevel,[\s\S]*data\.questions,[\s\S]*userId,[\s\S]*offlineCacheContract/);
  assert.match(trainer, /consumeOfflineQuestion\([\s\S]*gameId,[\s\S]*selectedLevel,[\s\S]*entry\.submission\.questionId,[\s\S]*userId,[\s\S]*offlineCacheContract,[\s\S]*\)/);
  assert.match(cache, /getOfflineQuestionCacheTtl/);
  assert.match(cache, /questions\.every\(hasCompleteOfflineGradingContext\)/);
  assert.match(cache, /questions\.length === targetHands/);
  assert.match(cache, /await deleteOfflineQuestions\(gameId, level, userId, deliveryContract\)/);
  assert.match(cache, /OFFLINE_QUESTION_CACHE_VERSION = 3/);
  assert.match(cache, /String\(cached\.deliveryContract \|\| ''\) !== contract/);
  assert.match(cache, /RECEIPT_EXPIRY_SAFETY_MS/);
  assert.match(cache, /String\(cached\.userId \|\| ''\) !== String\(userId\)/);
});

test('reports and custom solve do not manufacture successful activity', () => {
  const reports = fs.readFileSync(path.join(ROOT, 'pages/hub/training/gto-reports.js'), 'utf8');
  const sharedReports = fs.readFileSync(path.join(ROOT, 'pages/hub/training/reports.js'), 'utf8');
  const customSolve = fs.readFileSync(path.join(ROOT, 'pages/hub/training/custom-solve.js'), 'utf8');
  const solverApi = fs.readFileSync(path.join(ROOT, 'pages/api/training/solver-api.js'), 'utf8');
  const routeAudit = fs.readFileSync(path.join(ROOT, 'scripts/training-route-wiring-audit.js'), 'utf8');

  assert.match(reports, /export \{ default \} from '\.\/reports'/);
  assert.match(routeAudit, /defaultExportPattern[\s\S]*default\(\?:\\s\+as\\s\+default\)\?/);
  assert.match(sharedReports, /No Verified Training Data Yet/);
  assert.match(sharedReports, /No Sample Or Estimated Player Statistics Are Displayed/);
  assert.doesNotMatch(sharedReports, /Demo data for illustration|Sample data is being displayed|label:\s*['"]GTO Proximity/);
  assert.match(customSolve, /data\?\.source === 'training_solver_artifact_catalog'/);
  assert.match(customSolve, /data\?\.matchQuality === 'exact_root_node'/);
  assert.match(customSolve, /data\?\.solution\?\.isEstimate === false/);
  assert.match(customSolve, /authorityLabel: 'Audited Solver Result'/);
  assert.doesNotMatch(customSolve, /Modeled Baseline/);
  assert.doesNotMatch(customSolve, /gameId: 'custom-solve'|accuracy: 100/);
  assert.match(solverApi, /training_solver_spot_candidates_v1/);
  assert.match(solverApi, /p_scenario_hash: request\.scenarioHash/);
  assert.match(solverApi, /p_street: request\.street/);
  assert.match(solverApi, /p_position: request\.heroPosition/);
  assert.match(solverApi, /customSolverRowMatchesRequest\(row, request\)/);
  assert.doesNotMatch(solverApi, /\.from\(['"]solved_spots_gold['"]\)/);
  assert.match(solverApi, /source: 'training_solver_artifact_catalog'/);
  assert.match(solverApi, /matchQuality: 'exact_root_node'/);
  assert.match(solverApi, /isEstimate: false/);
  assert.match(solverApi, /res\.status\(422\)\.json\(\{[\s\S]*code: 'SOLVER_NODE_CONTEXT_REQUIRED'/);
  assert.match(solverApi, /res\.status\(404\)\.json\(\{[\s\S]*code: 'AUDITED_SOLVER_ARTIFACT_NOT_FOUND'/);
  assert.doesNotMatch(
    solverApi,
    /modeled_baseline|generateBaselineStrategy|\.from\('solver_queue'\)|status: 'queued'|queued for precise solving/i,
  );
});

test('paused Phase 11 challenges expose no fabricated live progress while Daily Challenge uses canonical results', () => {
  const challenges = fs.readFileSync(path.join(ROOT, 'pages/api/training/challenges.js'), 'utf8');
  const dailyApi = fs.readFileSync(path.join(ROOT, 'pages/api/training/hand-of-the-day.js'), 'utf8');
  const dailyPage = fs.readFileSync(path.join(ROOT, 'pages/hub/training/daily-challenge.js'), 'utf8');

  assert.match(challenges, /availability:\s*'paused_pending_verified_settlement'/);
  assert.match(challenges, /rewardAvailable:\s*false/);
  assert.match(challenges, /progress:\s*0/);
  assert.match(challenges, /completed:\s*false/);
  assert.match(challenges, /claimed:\s*false/);
  assert.doesNotMatch(challenges, /from\('training_sessions'\)/);
  assert.doesNotMatch(challenges, /from\('jarvis_training_sessions'\)/);
  assert.match(dailyApi, /selected_action/);
  assert.match(dailyApi, /completedDays/);
  assert.match(dailyPage, /data\.completion\.selectedAction/);
  assert.match(dailyPage, /await authedFetch\('\/api\/training\/record-question'/);
  assert.match(dailyPage, /await authedFetch\('\/api\/training\/save-progress'/);
  assert.doesNotMatch(dailyPage, /method:\s*'POST'[\s\S]{0,240}\/api\/training\/hand-of-the-day/);
});

test('secondary analytics and community rooms never invent player results', () => {
  const positionMastery = fs.readFileSync(
    path.join(ROOT, 'pages/hub/training/position-mastery.js'),
    'utf8'
  );
  const studyGroup = fs.readFileSync(
    path.join(ROOT, 'pages/hub/training/study-group.js'),
    'utf8'
  );

  assert.match(positionMastery, /No Position-Tagged Decisions Have Been Recorded Yet/);
  assert.doesNotMatch(positionMastery, /Distribute overall accuracy|realistic position variance/);
  assert.match(studyGroup, /Open Hand History Upload/);
  assert.doesNotMatch(studyGroup, /loadDemoHand|local-demo|Solver says: CALL is \+1\.2 EV/);
});

test('non-graded tools cannot manufacture perfect training sessions', () => {
  const nonGradedRoutes = [
    'focus-timer',
    'gto-news',
    'hand-comparison',
    'qre-explorer',
    'rake-solutions',
    'risk-analyzer',
    'session-warmup',
  ];

  for (const route of nonGradedRoutes) {
    const source = fs.readFileSync(path.join(ROOT, `pages/hub/training/${route}.js`), 'utf8');
    assert.doesNotMatch(source, /api\/training\/save-session|training:session-complete/, `${route} writes false graded activity`);
  }

  const sessionApi = fs.readFileSync(path.join(ROOT, 'pages/api/training/save-session.js'), 'utf8');
  assert.match(sessionApi, /ALLOWED_BODY_KEYS = new Set\(\['attemptId'\]\)/);
  assert.match(sessionApi, /fn_save_training_session_v2/);
  assert.doesNotMatch(sessionApi, /req\.body\.(?:questionsAnswered|questionsCorrect|accuracy|gtowScore|diamondsEarned)/);

  const isolatedPracticeWriters = [
    'multi-table',
    'hand-history-upload',
    'scenario-demo',
    'range-builder',
    'short-deck-trainer',
  ];
  for (const route of isolatedPracticeWriters) {
    const source = fs.readFileSync(path.join(ROOT, `pages/hub/training/${route}.js`), 'utf8');
    assert.doesNotMatch(source, /api\/training\/save-session/, `${route} bypasses attempt authority`);
    assert.match(source, /savePracticeSession/, `${route} does not explicitly isolate its client-reported result`);
  }

  const ungradedOrCanonicalizedRoutes = [
    'multiway-preflop',
    'famous-finals',
    'quiz-gauntlet',
  ];
  for (const route of ungradedOrCanonicalizedRoutes) {
    const source = fs.readFileSync(path.join(ROOT, `pages/hub/training/${route}.js`), 'utf8');
    assert.doesNotMatch(source, /savePracticeSession|api\/training\/save-session/, `${route} must not write client-reported results`);
  }
  const multiwayReference = fs.readFileSync(
    path.join(ROOT, 'pages/hub/training/multiway-preflop.js'),
    'utf8',
  );
  assert.match(multiwayReference, /data-training-authority="authored-reference-ungraded"/);
  const finalsArchive = fs.readFileSync(
    path.join(ROOT, 'pages/hub/training/famous-finals.js'),
    'utf8',
  );
  assert.match(finalsArchive, /data-training-authority="archive-ungraded"/);
  const quizGauntlet = fs.readFileSync(
    path.join(ROOT, 'pages/hub/training/quiz-gauntlet.js'),
    'utf8',
  );
  assert.match(quizGauntlet, /destination:\s*'\/hub\/training\/arena\/quiz-gauntlet\?level=1/);

  const spotStudy = fs.readFileSync(
    path.join(ROOT, 'pages/hub/training/spot-trainer.js'),
    'utf8',
  );
  assert.doesNotMatch(spotStudy, /savePracticeSession|api\/training\/save-session/);
  assert.match(spotStudy, /Answer-Revealed Solver Study Utility/);

  const practice = fs.readFileSync(path.join(ROOT, 'src/lib/training/practiceSession.js'), 'utf8');
  assert.match(practice, /client_reported_unverified/);
  assert.match(practice, /practiceOnly:\s*true/);
  assert.match(practice, /affectsAuthoritativeProgress:\s*false/);
  assert.match(practice, /eligibleForRewards:\s*false/);
  assert.match(practice, /api\/training\/tool-records/);
  assert.doesNotMatch(practice, /api\/training\/(?:save-session|save-progress)/);
});

test('the retired XP compatibility stub is absent from the active arena contract', () => {
  const trainer = fs.readFileSync(path.join(ROOT, 'src/hooks/useGTOTrainer.js'), 'utf8');
  const arena = fs.readFileSync(path.join(ROOT, 'src/components/training/GodModeArena.jsx'), 'utf8');
  const table = fs.readFileSync(
    path.join(ROOT, 'src/components/training/games/UniversalDynamicTable.jsx'),
    'utf8'
  );

  for (const source of [trainer, arena, table]) assert.doesNotMatch(source, /\btotalXP\b/);
});

test('training components do not export fabricated solver-result fixtures', () => {
  const feedback = fs.readFileSync(
    path.join(ROOT, 'src/components/training/FeedbackCard.tsx'),
    'utf8'
  );

  assert.doesNotMatch(feedback, /generateDemoSolverResult|DEMO DATA GENERATOR/);
});

test('journal, playbook, and tournament planner use isolated durable tool records', () => {
  const api = fs.readFileSync(path.join(ROOT, 'pages/api/training/tool-records.js'), 'utf8');
  const migration = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20260829121500_training_tool_records.sql'), 'utf8');
  const journal = fs.readFileSync(path.join(ROOT, 'pages/hub/training/mental-journal.js'), 'utf8');
  const playbook = fs.readFileSync(path.join(ROOT, 'pages/hub/training/my-playbook.js'), 'utf8');
  const planner = fs.readFileSync(path.join(ROOT, 'pages/hub/training/tournament-prep.js'), 'utf8');

  assert.match(migration, /create table if not exists public\.training_tool_records/i);
  assert.match(migration, /unique \(user_id, tool_id, record_key\)/i);
  assert.match(api, /\.eq\('user_id', user\.id\)/);
  assert.match(api, /onConflict: 'user_id,tool_id,record_key'/);
  assert.match(api, /\.maybeSingle\(\)/);
  assert.match(api, /if \(!saved\) throw new Error/);
  for (const source of [journal, playbook, planner]) {
    assert.match(source, /api\/training\/tool-records/);
    assert.doesNotMatch(source, /api\/training\/save-session|training:session-complete/);
  }
});

test('training writes fail closed without unsafe single-row coercion', () => {
  const messagesApi = fs.readFileSync(
    path.join(ROOT, 'pages/api/training/study-groups/[groupId]/messages.js'),
    'utf8'
  );
  const toolRecordsApi = fs.readFileSync(
    path.join(ROOT, 'pages/api/training/tool-records.js'),
    'utf8'
  );

  for (const source of [messagesApi, toolRecordsApi]) {
    assert.doesNotMatch(source, /\.single\(\)/);
    assert.match(source, /\.maybeSingle\(\)/);
  }
  assert.match(messagesApi, /error \|\| !message/);
});

test('retired heuristic trainers route to the matching authored Club Arena games', () => {
  const routes = {
    'bounty-trainer': 'mtt-005',
    'icm-final-table': 'mtt-004',
    'pot-geometry': 'adv-011',
    'range-advisor': 'adv-004',
    'player-profiles': 'adv-015',
    'three-way-postflop': 'cash-016',
    'frequency-locking': 'adv-005',
    'bluff-catcher': 'cash-005',
    'spr-trainer': 'adv-011',
    'preflop-advisor': 'cash-001',
    'villain-range': 'adv-008',
    'mixed-strategy-lab': 'mixed-strategy-lab',
    'ev-trainer': 'adv-006',
  };

  for (const [route, gameId] of Object.entries(routes)) {
    const source = fs.readFileSync(path.join(ROOT, `pages/hub/training/${route}.js`), 'utf8');
    assert.match(source, new RegExp(`arena/${gameId.replace('-', '\\-')}\\?level=1`));
    assert.doesNotMatch(source, /Math\.random|save-session|session-complete/);
  }
});

test('legacy simulated reports and play surfaces route to verified data or Club Arena', () => {
  const routes = {
    'range-explorer': '/hub/training/preflop-charts',
    'gto-scorecard': '/hub/training/gto-reports',
    'performance-heatmap': '/hub/training/gto-reports',
    'play-mode': '/hub/training/arena/cash-001?level=1',
  };

  for (const [route, href] of Object.entries(routes)) {
    const source = fs.readFileSync(path.join(ROOT, `pages/hub/training/${route}.js`), 'utf8');
    assert.ok(source.includes(`href="${href}"`), `${route} must route to ${href}`);
    assert.doesNotMatch(source, /Math\.random|simulate position|heuristic GTO|GTO_BASELINES/);
  }

  const godMode = fs.readFileSync(path.join(ROOT, 'src/components/training/GodModeArena.jsx'), 'utf8');
  assert.doesNotMatch(
    godMode,
    /CustomSpotDrillBuilder|GTOReportsDashboard|AggregatedFlopReport|PopupHUDOverlay|ActionFilterAnalyzer|EVComparisonTool|MassDataAnalysis|MarkTheSpot|StrategyNodeInspector|EVTreeVisualizer|EVLossTracker|FrequencyTrainer|GTODeviationHeatmap|GhostReplayEngine|HandNoteTagger|HandReplayViewer|LifetimeStatsCard|MixedStrategyTrainer|PositionMasteryTracker|PositionStatsPanel|SessionReplayTimeline|SessionCoachingEngine|FrequencyExploiter|SolverSimplify|SmartPracticeBanner|SimplifiedSolutions/,
  );

  const reviewBranches = [...godMode.matchAll(/reviewTab === '([^']+)'/g)].map(
    ([, branch]) => branch,
  );
  assert.deepEqual(reviewBranches, [
    'overview',
    'mistakes',
    'positions',
    'concepts',
    'hands',
    'solver',
    'analysis',
  ]);

  const verifiedSources = [
    ...new Set([...godMode.matchAll(/source="([^"]+)"/g)].map(([, source]) => source)),
  ].sort();
  assert.deepEqual(verifiedSources, [
    'Audited PioSOLVER V2 Corpus',
    'Authenticated Hand History',
    'Sealed Non-Practice Attempts',
    'Sealed Training Attempts',
    'Training Corpus And Solver APIs',
  ]);
});

test('authenticated Training E2E waits for its setup dependency before reading saved state', () => {
  const source = fs.readFileSync(path.join(ROOT, 'e2e/03-training-gto.spec.ts'), 'utf8');
  assert.match(source, /function loadSavedSmarterPokerStorage\(\)/);
  const loaderStart = source.indexOf('function loadSavedSmarterPokerStorage()');
  const savedStateRead = source.indexOf("readFileSync(resolve(process.cwd(), 'playwright/.auth/user.json')");
  assert.ok(loaderStart >= 0 && savedStateRead > loaderStart);
  assert.doesNotMatch(
    source.slice(0, loaderStart),
    /readFileSync\(/,
    'saved authentication state must not be read during Playwright test discovery',
  );
  assert.match(
    source,
    /test\('Club Arena gameplay grades[\s\S]*loadSavedSmarterPokerStorage\(\)/,
  );
});
