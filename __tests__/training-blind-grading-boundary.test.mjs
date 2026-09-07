import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const nodeRequire = createRequire(import.meta.url);

function createApiResponse() {
  return {
    statusCode: 200,
    headersSent: false,
    body: null,
    setHeader() {
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

function loadRecordQuestionHandler({ canonicalQuestion, receiptPayload, insertGate, onInsert }) {
  const babel = nodeRequire('@babel/core');
  const transformModulesCommonJs = nodeRequire('@babel/plugin-transform-modules-commonjs');
  const compiled = babel.transformSync(read('pages/api/training/record-question.js'), {
    babelrc: false,
    configFile: false,
    filename: 'pages/api/training/record-question.js',
    plugins: [transformModulesCommonJs],
    sourceType: 'module',
  }).code;

  class TrainingAnswerContractError extends Error {}
  class TrainingGradingReceiptError extends Error {}
  const cacheRow = {
    question_id: canonicalQuestion.id,
    question_data: canonicalQuestion,
    game_id: receiptPayload.gameId,
    canonical_policy: canonicalQuestion.solverPolicy,
    source_classification: 'SOLVER_DERIVED_RESPONSE',
    quality_status: 'active',
    policy_version: 1,
    policy_checksum: canonicalQuestion.policyChecksum,
  };
  const snapshot = {
    snapshot_key: receiptPayload.snapshotKey,
    source_question_id: canonicalQuestion.id,
    game_id: receiptPayload.gameId,
    level: receiptPayload.level,
    content_digest: 'test-digest',
    question_data: canonicalQuestion,
  };
  const dependencies = {
    '../../../src/lib/serverAuth': {
      getServerUserWithFallback: async () => ({
        user: { id: receiptPayload.sub },
        error: null,
      }),
    },
    '../../../src/lib/supabaseServerClient': { createClient: () => ({}) },
    '../../../src/lib/apiRateLimit': {
      applyRateLimit: () => true,
      LIMITS: { write: {} },
    },
    '../../../src/utils/trainingApiUtils': { withTiming: () => {} },
    '../../../src/lib/sentryWrap': { reportApiError: () => {} },
    '../../../src/lib/training/answerGradingContract.mjs': {
      TrainingAnswerContractError,
      gradeTrainingAnswer: ({ selectedAnswer }) => ({
        grade: {
          isCorrect: selectedAnswer === 'bet_75pct',
          classification: selectedAnswer === 'bet_75pct' ? 'best' : 'mistake',
          solverVerified: true,
          solverSource: 'PioSOLVER',
          selectedFrequency: selectedAnswer === 'bet_75pct' ? 0.6 : 0.4,
          optimalFrequency: 0.6,
          evLossMeasured: false,
          evLoss: 0,
        },
        canonicalSolverGrade: {
          classification: 'best',
          isCorrect: selectedAnswer === 'bet_75pct',
          optimalAction: 'bet_75pct',
        },
        gradeMode: 'canonical_policy',
        difficultyMode: receiptPayload.difficultyMode,
        difficultyMembers: ['check', 'bet_75pct'],
        rng: null,
      }),
    },
    '../../../src/lib/training/gradingReceipt.mjs': {
      deriveReceiptRng: () => null,
      TrainingGradingReceiptError,
      verifyTrainingGradingReceiptEnvelope: () => ({ payload: receiptPayload }),
      verifyTrainingGradingReceipt: () => ({
        payload: receiptPayload,
        servedQuestion: canonicalQuestion,
      }),
    },
    '../../../src/lib/training/difficultyQuestionContract.mjs': {
      normalizeTrainingDifficultyMode: (mode) => mode,
    },
    '../../../src/lib/training/trainingPersistence.mjs': {
      isTrainingPersistenceUnavailable: () => false,
      trainingPersistenceUnavailableBody: () => ({ success: false }),
      runTrainingPersistenceQuery: async (_queryFactory, { label } = {}) => {
        if (label === 'RecordQuestion:snapshot-read') return { data: snapshot };
        if (label === 'RecordQuestion:canonical-policy-read') return { data: cacheRow };
        if (label === 'RecordQuestion:insert') {
          onInsert();
          await insertGate;
        }
        return { data: null };
      },
    },
    '../../../src/lib/training/cacheTruthPersistence.mjs': {
      cacheRowIsServingEligible: () => true,
    },
    '../../../src/lib/training/solverPolicyContract.js': {
      stablePolicyJson: (policy) => JSON.stringify(policy),
    },
  };
  const routeModule = { exports: {} };
  const evaluate = new Function('require', 'module', 'exports', compiled);
  evaluate((specifier) => {
    assert.ok(dependencies[specifier], `unexpected record-question dependency: ${specifier}`);
    return dependencies[specifier];
  }, routeModule, routeModule.exports);
  return routeModule.exports.default;
}

test('the browser cannot grade a blind Training question locally', () => {
  const hook = read('src/hooks/useGTOTrainer.js');
  const start = hook.indexOf('const submitAnswer = useCallback');
  const end = hook.indexOf('const advanceToNextStreet = useCallback', start);
  const submit = hook.slice(start, end);

  assert.doesNotMatch(hook, /import .*gradeTrainingAnswer/);
  assert.doesNotMatch(submit, /gradeTrainingAnswer\(/);
  assert.doesNotMatch(submit, /classifyMove\(/);
  assert.doesNotMatch(submit, /selectedOptionId === .*correctAnswer/);
  assert.match(submit, /const serverEvidence = recorded\?\.evidence/);
  assert.match(submit, /const feedback = recorded\?\.feedback/);
  assert.match(submit, /const isCorrect = serverEvidence\.isCorrect === true/);
  assert.match(submit, /feedback\?\.continuation\?\.actionId/);
  assert.match(submit, /multiStreetHandRef\.current = new MultiStreetHand\(currentQuestion\)/);
  assert.match(submit, /onPersisted: finalizePersistedAnswer/);
  assert.match(submit, /await persistPendingAnswer\(entry\)/);
  assert.match(hook, /function containsPreAnswerGradingData/);
  assert.match(hook, /'rngguidance'/);
  assert.match(hook, /'targetactionid'/);
  assert.match(hook, /'solverpolicy'/);
  assert.match(hook, /canonical policy receipt/);
  assert.match(hook, /Training delivery exposed private grading data/);
});

test('the answer request submits identity and choice, never a client verdict', () => {
  const hook = read('src/hooks/useGTOTrainer.js');
  const start = hook.indexOf('const recordAnswer = useCallback');
  const end = hook.indexOf('const persistPendingAnswer = useCallback', start);
  const recorder = hook.slice(start, end);
  const bodyStart = recorder.indexOf('body: JSON.stringify({');
  const bodyEnd = recorder.indexOf('}),', bodyStart);
  const body = recorder.slice(bodyStart, bodyEnd);

  assert.match(body, /gradingReceipt: submission\.gradingReceipt/);
  assert.match(body, /policyChecksum: submission\.policyChecksum/);
  assert.match(body, /selectedAnswer/);
  assert.doesNotMatch(body, /isCorrect|classification|evLoss|correctAnswer/);
  assert.match(recorder, /payload\?\.evidence/);
  assert.match(recorder, /payload\?\.feedback/);
});

test('record-question reveals coaching data only after canonical grading persistence', () => {
  const api = read('pages/api/training/record-question.js');
  const insertAt = api.indexOf("from('training_answers').insert(evidenceRow)");
  const responseAt = api.indexOf('feedback: {', insertAt);

  assert.ok(insertAt > 0);
  assert.ok(responseAt > insertAt);
  assert.match(api, /getImmutableQuestionSnapshot\(receiptPayload\.snapshotKey\)/);
  assert.match(api, /verifyTrainingGradingReceipt\(/);
  assert.match(api, /gradeTrainingAnswer\(\{/);
  assert.match(api, /correctAnswer: servedQuestion\.correctAnswer/);
  assert.match(api, /explanation: servedQuestion\.explanation/);
  assert.match(api, /continuation: revealedContinuationAction/);
  assert.ok(
    api.indexOf('continuation: revealedContinuationAction') > insertAt,
    'continuation eligibility must be revealed only after durable answer persistence',
  );
  assert.match(api, /const persistedClassification = canonicalGrade\.classification/);
  assert.match(api, /hero_position: String\(canonicalScenario\.heroPosition/);
  assert.match(api, /villain_position: String\(canonicalScenario\.villainPosition/);
  assert.match(api, /street: String\(canonicalScenario\.street/);
  assert.match(api, /spot_type: String\(canonicalSpotType\)/);
  assert.doesNotMatch(api, /const \{[\s\S]{0,240}heroPosition[\s\S]{0,240}\} = req\.body/);
});

test('record-question reveals the semantic continuation id and raw source token only after persistence', async () => {
  const policyChecksum = 'e'.repeat(64);
  const receiptPayload = {
    sub: '11111111-1111-4111-8111-111111111111',
    gameId: 'cash-001',
    questionId: 'continuation-parent-1',
    level: 1,
    sessionId: 'session-1',
    attemptId: '22222222-2222-4222-8222-222222222222',
    snapshotKey: 'snapshot-1',
    jti: '33333333-3333-4333-8333-333333333333',
    handOrdinal: 1,
    decisionOrdinal: 1,
    countsTowardCompletion: true,
    practiceOnly: false,
    difficultyMode: 'standard',
  };
  const canonicalQuestion = {
    id: receiptPayload.questionId,
    question: 'Choose the exact continuation action.',
    options: [
      { id: 'check', text: 'Check' },
      { id: 'bet_75pct', text: 'Bet 75% Pot' },
    ],
    correctAnswer: 'bet_75pct',
    explanation: 'The checksummed source action maps to the semantic 75% pot option.',
    policyChecksum,
    scenario: {
      street: 'flop',
      pot: 5.5,
      heroPosition: 'BTN',
      villainPosition: 'BB',
      nextStreetContinuationAction: 'b412',
    },
    solverPolicy: {
      actions: [
        { id: 'check', sourceCode: 'c', family: 'check', legal: true },
        { id: 'bet_75pct', sourceCode: 'b412', family: 'bet', legal: true },
      ],
    },
  };

  let resolveInsert;
  let markInsertStarted;
  const insertGate = new Promise((resolve) => { resolveInsert = resolve; });
  const insertStarted = new Promise((resolve) => { markInsertStarted = resolve; });
  const handler = loadRecordQuestionHandler({
    canonicalQuestion,
    receiptPayload,
    insertGate,
    onInsert: markInsertStarted,
  });
  const response = createApiResponse();
  const request = {
    method: 'POST',
    headers: { authorization: 'Bearer test-token' },
    body: {
      gameId: receiptPayload.gameId,
      questionId: receiptPayload.questionId,
      selectedAnswer: 'check',
      gradingReceipt: 'signed-receipt',
      policyChecksum,
    },
  };

  const pendingResponse = handler(request, response);
  await insertStarted;
  assert.equal(response.body, null, 'continuation metadata escaped before the answer write settled');

  resolveInsert();
  await pendingResponse;
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.feedback.continuation, {
    actionId: 'bet_75pct',
    sourceAction: 'b412',
  });
  assert.notEqual(
    response.body.feedback.continuation.actionId,
    response.body.feedback.continuation.sourceAction,
    'the browser-facing answer identity must remain semantic, not the warehouse action token',
  );
});

test('the felt never invents a pre-answer mix or fallback answer key', () => {
  const table = read('src/components/training/games/UniversalDynamicTable.jsx');

  assert.match(table, /const correctAnswer = question\?\.correctAnswer \|\| question\?\.correct \|\| null/);
  assert.doesNotMatch(table, /const correctAnswer = .*\|\| 'a'/);
  assert.doesNotMatch(table, /return simulateGTOFrequencies\(/);
  assert.match(table, /question\?_gradingContext|question\?\._gradingContext/);
  assert.doesNotMatch(table, /rngGuidance|rngTargetActionId/);
  assert.match(table, /\? \{ rngRoll, rngMode: rngHighLow \}/);
  assert.match(table, /question\?\._gradingContext\?\.difficultyMode \|\| question\?\._difficultyApplied/);
  assert.match(table, /gradingPending: true/);
});
