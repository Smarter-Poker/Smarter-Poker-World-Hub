import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const nodeRequire = createRequire(import.meta.url);
const CACHE_REPLAY_MIGRATION_SOURCE = read(
  'supabase/migrations/20260907200000_training_cache_event_idempotent_replay.sql',
);
const CACHE_REPLAY_VERIFIER_SOURCE = read('scripts/verify-training-cache-replay-postgres.mjs');
const DECISION_AUTHORITY_MIGRATION_SOURCE = read(
  'supabase/migrations/20260907203000_training_attempt_decision_delivery_authority.sql',
);

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

function loadRecordQuestionHandler({
  canonicalQuestion,
  receiptPayload,
  insertGate = Promise.resolve(),
  onInsert = () => {},
  existingAnswer = null,
  currentCacheRow = null,
  onPersistenceRead = () => {},
  gradeTrainingAnswer = null,
  onGrade = () => {},
  answerAuthorized = true,
  answerAuthorizationSequence = null,
  legacyPromotionAuthorized = false,
  onLegacyPromotion = () => {},
  onEnvelopeVerify = () => {},
  onReceiptVerify = () => {},
  receiptExpired = false,
  deriveReceiptRng = (_payload, submittedRng) => submittedRng || null,
  existingAnswerSequence = null,
  insertError = null,
}) {
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
  const cacheRow = currentCacheRow || {
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
  let authorizationCalls = 0;
  let idempotencyReads = 0;
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
      gradeTrainingAnswer: (input) => {
        onGrade(input);
        if (gradeTrainingAnswer) return gradeTrainingAnswer(input);
        const { selectedAnswer } = input;
        return {
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
        };
      },
    },
    '../../../src/lib/training/gradingReceipt.mjs': {
      deriveReceiptRng,
      TrainingGradingReceiptError,
      verifyTrainingGradingReceiptEnvelope: (_receipt, options) => {
        onEnvelopeVerify(options);
        return { payload: receiptPayload, expired: receiptExpired };
      },
      verifyTrainingGradingReceipt: (_receipt, options) => {
        onReceiptVerify(options);
        return {
          payload: receiptPayload,
          servedQuestion: canonicalQuestion,
          expired: receiptExpired,
        };
      },
    },
    '../../../src/lib/training/difficultyQuestionContract.mjs': {
      normalizeTrainingDifficultyMode: (mode) => mode,
    },
    '../../../src/lib/training/trainingPersistence.mjs': {
      isTrainingPersistenceUnavailable: () => false,
      trainingPersistenceUnavailableBody: () => ({ success: false }),
      runTrainingPersistenceQuery: async (_queryFactory, { label } = {}) => {
        onPersistenceRead(label);
        if (label === 'RecordQuestion:snapshot-read') return { data: snapshot };
        if (label === 'RecordQuestion:canonical-policy-read') return { data: cacheRow };
        if (label === 'RecordQuestion:idempotency-read') {
          const data = Array.isArray(existingAnswerSequence)
            ? existingAnswerSequence[Math.min(idempotencyReads, existingAnswerSequence.length - 1)]
            : existingAnswer;
          idempotencyReads += 1;
          return { data };
        }
        if (label === 'RecordQuestion:insert') {
          onInsert();
          await insertGate;
          if (insertError) throw insertError;
        }
        return { data: null };
      },
    },
    '../../../src/lib/training/cacheTruthPersistence.mjs': {
      cacheRowIsServingEligible: () => true,
    },
    '../../../src/lib/training/trainingAttemptDelivery.mjs': {
      authorizeTrainingAttemptDecisionAnswer: async () => {
        const answer = Array.isArray(answerAuthorizationSequence)
          ? answerAuthorizationSequence[Math.min(authorizationCalls, answerAuthorizationSequence.length - 1)]
          : answerAuthorized;
        authorizationCalls += 1;
        return answer;
      },
      promoteLegacySignedTrainingAttemptDecision: async (supabase, input) => {
        onLegacyPromotion({ supabase, input });
        return legacyPromotionAuthorized;
      },
      trainingQuestionSnapshotMatchesIdentity: () => true,
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
  const responseAt = api.indexOf('buildRecordedAnswerResponse({', insertAt);

  assert.ok(insertAt > 0);
  assert.ok(responseAt > insertAt);
  assert.match(api, /getImmutableQuestionSnapshot\(receiptPayload\.snapshotKey\)/);
  assert.match(api, /verifyTrainingGradingReceipt\(/);
  assert.ok(
    api.indexOf('verifyTrainingGradingReceipt(')
      < api.indexOf('promoteLegacySignedTrainingAttemptDecision('),
    'legacy delivery authority may be promoted only after the full receipt HMAC is verified',
  );
  assert.match(api, /gradeTrainingAnswer\(\{/);
  assert.match(api, /correctAnswer: servedQuestion\.correctAnswer/);
  assert.match(api, /explanation: servedQuestion\.explanation/);
  assert.match(api, /continuation: revealedContinuationAction/);
  assert.match(api, /continuation: revealedContinuationAction/);
  assert.ok(responseAt > insertAt, 'new-answer feedback must be sent only after durable persistence');
  assert.match(api, /const persistedClassification = canonicalGrade\.classification/);
  assert.match(api, /hero_position: String\(canonicalScenario\.heroPosition/);
  assert.match(api, /villain_position: String\(canonicalScenario\.villainPosition/);
  assert.match(api, /street: String\(canonicalScenario\.street/);
  assert.match(api, /spot_type: String\(canonicalSpotType\)/);
  assert.doesNotMatch(api, /const \{[\s\S]{0,240}heroPosition[\s\S]{0,240}\} = req\.body/);
});

test('at exp+1 an exact durable replay survives cache refresh, but no fresh expired grade can run', async () => {
  const endpointNowSeconds = 1_788_739_201;
  const policyChecksum = 'e'.repeat(64);
  const receiptPayload = {
    sub: '11111111-1111-4111-8111-111111111111',
    gameId: 'cash-001',
    questionId: 'lost-response-question-1',
    level: 1,
    sessionId: 'lost-response-session-1',
    attemptId: '22222222-2222-4222-8222-222222222222',
    snapshotKey: 'lost-response-snapshot-1',
    jti: '33333333-3333-4333-8333-333333333333',
    handOrdinal: 7,
    decisionOrdinal: 1,
    countsTowardCompletion: true,
    practiceOnly: false,
    difficultyMode: 'standard',
    exp: endpointNowSeconds - 1,
  };
  const canonicalQuestion = {
    id: receiptPayload.questionId,
    question: 'Choose the exact action.',
    options: [
      { id: 'check', text: 'Check' },
      { id: 'bet_75pct', text: 'Bet 75% Pot' },
    ],
    correctAnswer: 'bet_75pct',
    explanation: 'The persisted snapshot remains the feedback authority.',
    policyChecksum,
    scenario: { street: 'flop', heroPosition: 'BTN', villainPosition: 'BB' },
    solverPolicy: { actions: [{ id: 'check' }, { id: 'bet_75pct' }] },
  };
  const existingAnswer = {
    game_id: receiptPayload.gameId,
    question_id: receiptPayload.questionId,
    answer_id: 'check',
    attempt_id: receiptPayload.attemptId,
    hand_ordinal: receiptPayload.handOrdinal,
    decision_ordinal: receiptPayload.decisionOrdinal,
    snapshot_key: receiptPayload.snapshotKey,
    is_correct: false,
    classification: 'wrong',
    ev_loss: 0,
    solver_verified: true,
    selected_frequency: 40,
    optimal_frequency: 60,
    ev_loss_measured: false,
    evidence_metadata: {
      gradeMode: 'canonical_policy',
      difficultyMode: 'standard',
      rng: null,
      canonicalSolverClassification: 'best',
      optimalAction: 'bet_75pct',
    },
  };
  const persistenceReads = [];
  const envelopeVerifications = [];
  const receiptVerifications = [];
  let gradeCalls = 0;
  const handler = loadRecordQuestionHandler({
    canonicalQuestion,
    receiptPayload,
    existingAnswer,
    currentCacheRow: {
      question_id: canonicalQuestion.id,
      canonical_policy: { actions: [{ id: 'fold' }] },
      quality_status: 'active',
      policy_checksum: 'f'.repeat(64),
    },
    onPersistenceRead: (label) => persistenceReads.push(label),
    onEnvelopeVerify: (options) => envelopeVerifications.push(options),
    onReceiptVerify: (options) => receiptVerifications.push(options),
    receiptExpired: receiptPayload.exp < endpointNowSeconds,
    onGrade: () => { gradeCalls += 1; },
    gradeTrainingAnswer: () => {
      throw new Error('an exact durable replay must not be regraded');
    },
  });
  const baseRequest = {
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

  const replay = createApiResponse();
  await handler(structuredClone(baseRequest), replay);
  assert.equal(replay.statusCode, 200);
  assert.equal(replay.body.idempotentReplay, true);
  assert.equal(replay.body.evidence.classification, 'wrong');
  assert.equal(replay.body.evidence.isCorrect, false);
  assert.equal(replay.body.evidence.selectedFrequency, 40);
  assert.equal(replay.body.evidence.optimalFrequency, 60);
  assert.equal(replay.body.evidence.optimalAction, 'bet_75pct');
  assert.equal(replay.body.evidence.solverVerified, true);
  assert.equal(replay.body.feedback.explanation, canonicalQuestion.explanation);
  assert.equal(persistenceReads.includes('RecordQuestion:canonical-policy-read'), false);
  assert.equal(persistenceReads.includes('RecordQuestion:insert'), false);
  assert.equal(gradeCalls, 0);
  assert.equal(envelopeVerifications[0].allowExpired, true);
  assert.equal(receiptVerifications[0].allowExpired, true);

  const conflict = createApiResponse();
  await handler({
    ...structuredClone(baseRequest),
    body: { ...baseRequest.body, selectedAnswer: 'bet_75pct' },
  }, conflict);
  assert.equal(conflict.statusCode, 409);
  assert.equal(conflict.body.code, 'TRAINING_GRADING_RECEIPT_REPLAY_CONFLICT');
  assert.equal(gradeCalls, 0);

  const freshExpiredHandler = loadRecordQuestionHandler({
    canonicalQuestion,
    receiptPayload,
    existingAnswer: null,
    receiptExpired: receiptPayload.exp < endpointNowSeconds,
    onGrade: () => { gradeCalls += 1; },
  });
  const freshExpired = createApiResponse();
  await freshExpiredHandler(structuredClone(baseRequest), freshExpired);
  assert.equal(freshExpired.statusCode, 409);
  assert.equal(freshExpired.body.code, 'TRAINING_GRADING_RECEIPT_EXPIRED');
  assert.equal(gradeCalls, 0, 'an expired receipt without an exact durable row must never be graded');
});

test('idempotent replay binds the exact signed RNG selection before and after a 23505 race', async () => {
  const policyChecksum = 'd'.repeat(64);
  const receiptPayload = {
    sub: '11111111-1111-4111-8111-111111111111',
    gameId: 'cash-001',
    questionId: 'rng-replay-question-1',
    level: 1,
    sessionId: 'rng-replay-session-1',
    attemptId: '22222222-2222-4222-8222-222222222222',
    snapshotKey: 'c'.repeat(64),
    jti: '33333333-3333-4333-8333-333333333333',
    handOrdinal: 3,
    decisionOrdinal: 1,
    countsTowardCompletion: true,
    practiceOnly: false,
    difficultyMode: 'standard',
    rngRolls: { low: 17, high: 83 },
  };
  const canonicalQuestion = {
    id: receiptPayload.questionId,
    question: 'Follow the signed randomizer selection.',
    options: [
      { id: 'check', text: 'Check' },
      { id: 'bet_75pct', text: 'Bet 75% Pot' },
    ],
    correctAnswer: 'bet_75pct',
    explanation: 'The randomizer direction is part of the immutable grading input.',
    policyChecksum,
    scenario: { street: 'flop', heroPosition: 'BTN', villainPosition: 'BB' },
    solverPolicy: { actions: [{ id: 'check' }, { id: 'bet_75pct' }] },
  };
  const existingAnswer = {
    game_id: receiptPayload.gameId,
    question_id: receiptPayload.questionId,
    answer_id: 'check',
    attempt_id: receiptPayload.attemptId,
    hand_ordinal: receiptPayload.handOrdinal,
    decision_ordinal: receiptPayload.decisionOrdinal,
    snapshot_key: receiptPayload.snapshotKey,
    is_correct: true,
    classification: 'rng-hit',
    ev_loss: 0,
    solver_verified: true,
    selected_frequency: 40,
    optimal_frequency: 60,
    ev_loss_measured: false,
    evidence_metadata: {
      rng: {
        mode: 'low',
        roll: 17,
        targetActionId: 'check',
        targetActionText: 'Check',
      },
    },
  };
  const deriveSignedRng = (payload, submittedRng) => submittedRng
    ? { mode: submittedRng.mode, roll: payload.rngRolls[submittedRng.mode] }
    : null;
  const baseRequest = {
    method: 'POST',
    headers: { authorization: 'Bearer test-token' },
    body: {
      gameId: receiptPayload.gameId,
      questionId: receiptPayload.questionId,
      selectedAnswer: 'check',
      gradingReceipt: 'signed-receipt',
      policyChecksum,
      rng: { mode: 'low', roll: 17 },
    },
  };

  const earlyHandler = loadRecordQuestionHandler({
    canonicalQuestion,
    receiptPayload,
    existingAnswer,
    deriveReceiptRng: deriveSignedRng,
  });
  const exactReplay = createApiResponse();
  await earlyHandler(structuredClone(baseRequest), exactReplay);
  assert.equal(exactReplay.statusCode, 200);
  assert.equal(exactReplay.body.idempotentReplay, true);
  assert.equal(exactReplay.body.evidence.rng.mode, 'low');
  assert.equal(exactReplay.body.evidence.rng.roll, 17);

  for (const rng of [null, { mode: 'high', roll: 83 }]) {
    const conflict = createApiResponse();
    await earlyHandler({
      ...structuredClone(baseRequest),
      body: { ...baseRequest.body, rng },
    }, conflict);
    assert.equal(conflict.statusCode, 409);
    assert.equal(conflict.body.code, 'TRAINING_GRADING_RECEIPT_REPLAY_CONFLICT');
  }

  const uniqueRace = Object.assign(new Error('duplicate submission'), {
    cause: { code: '23505' },
  });
  const raceHandler = loadRecordQuestionHandler({
    canonicalQuestion,
    receiptPayload,
    existingAnswerSequence: [null, existingAnswer],
    deriveReceiptRng: deriveSignedRng,
    insertError: uniqueRace,
  });
  const raceConflict = createApiResponse();
  await raceHandler({
    ...structuredClone(baseRequest),
    body: { ...baseRequest.body, rng: { mode: 'high', roll: 83 } },
  }, raceConflict);
  assert.equal(raceConflict.statusCode, 409);
  assert.equal(raceConflict.body.code, 'TRAINING_GRADING_RECEIPT_REPLAY_CONFLICT');
});

test('database receipt replay is immutable, cache-independent, service-only, and permanently verified', () => {
  assert.match(
    CACHE_REPLAY_MIGRATION_SOURCE,
    /SELECT \* INTO v_existing[\s\S]*FROM public\.training_question_events[\s\S]*IF FOUND THEN/,
  );
  assert.ok(
    CACHE_REPLAY_MIGRATION_SOURCE.indexOf('SELECT * INTO v_existing')
      < CACHE_REPLAY_MIGRATION_SOURCE.indexOf('SELECT * INTO v_cache'),
    'an immutable replay must be resolved before mutable cache authority is consulted',
  );
  assert.match(
    CACHE_REPLAY_MIGRATION_SOURCE,
    /v_existing\.question_id <> p_question_id[\s\S]*v_existing\.user_id IS DISTINCT FROM p_user_id[\s\S]*v_existing\.is_correct IS DISTINCT FROM p_is_correct[\s\S]*v_existing\.policy_checksum <> lower\(p_expected_policy_checksum\)/,
  );
  assert.match(CACHE_REPLAY_MIGRATION_SOURCE, /training_cache_event_binding_mismatch/);
  assert.match(CACHE_REPLAY_MIGRATION_SOURCE, /FOR UPDATE/);
  assert.match(
    CACHE_REPLAY_MIGRATION_SOURCE,
    /REVOKE ALL ON FUNCTION public\.fn_training_cache_record_event[\s\S]*FROM PUBLIC, anon, authenticated[\s\S]*GRANT EXECUTE[\s\S]*TO service_role/,
  );
  assert.match(
    CACHE_REPLAY_VERIFIER_SOURCE,
    /20260907200000_training_cache_event_idempotent_replay\.sql/,
  );
  assert.equal(
    [...CACHE_REPLAY_VERIFIER_SOURCE.matchAll(/'-f', MIGRATION/g)].length,
    2,
    'the disposable PG17 verifier must prove migration idempotency',
  );
  assert.match(
    CACHE_REPLAY_VERIFIER_SOURCE,
    /DELETE FROM public\.training_question_cache[\s\S]*cache-independent immutable replay failed/,
  );
  assert.match(
    CACHE_REPLAY_VERIFIER_SOURCE,
    /changed question replay was accepted[\s\S]*changed user replay was accepted[\s\S]*changed checksum replay was accepted[\s\S]*changed verdict replay was accepted/,
  );
  assert.match(DECISION_AUTHORITY_MIGRATION_SOURCE, /CREATE TABLE IF NOT EXISTS public\.training_attempt_decision_slots/);
  assert.match(DECISION_AUTHORITY_MIGRATION_SOURCE, /fn_training_attempt_record_served_batch_v1/);
  assert.match(DECISION_AUTHORITY_MIGRATION_SOURCE, /fn_training_authorize_attempt_decision_v1/);
  assert.match(DECISION_AUTHORITY_MIGRATION_SOURCE, /fn_training_promote_legacy_signed_decision_v1/);
  assert.doesNotMatch(DECISION_AUTHORITY_MIGRATION_SOURCE, /CREATE OR REPLACE FUNCTION public\.fn_validate_training_answer_v2/);
  assert.match(DECISION_AUTHORITY_MIGRATION_SOURCE, /training_delivery_authority_attestations/);
  assert.match(DECISION_AUTHORITY_MIGRATION_SOURCE, /immutableSnapshotRecovery/);
  assert.match(
    DECISION_AUTHORITY_MIGRATION_SOURCE,
    /legacySignedReceiptRecovery/,
  );
  assert.match(DECISION_AUTHORITY_MIGRATION_SOURCE, /legacy_accept_until/);
  assert.match(DECISION_AUTHORITY_MIGRATION_SOURCE, /interval '24 hours'/);
  assert.match(
    DECISION_AUTHORITY_MIGRATION_SOURCE,
    /\^\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-4\[0-9a-f\]\{3\}-\[89ab\]\[0-9a-f\]\{3\}-\[0-9a-f\]\{12\}\$/,
  );
  assert.match(
    DECISION_AUTHORITY_MIGRATION_SOURCE,
    /metadata ->> 'requestKey'[\s\S]*\(:\[01\]\)\?\$[\s\S]*extensions\.digest\(e\.question_id, 'sha256'\)/,
  );
  assert.match(DECISION_AUTHORITY_MIGRATION_SOURCE, /migratedFromEventKey/);
  assert.match(DECISION_AUTHORITY_MIGRATION_SOURCE, /legacyReplayParentSubmissionId/);
  assert.match(DECISION_AUTHORITY_MIGRATION_SOURCE, /TRAINING_ATTEMPT_DECISION_ALREADY_ANSWERED/);
  assert.doesNotMatch(
    DECISION_AUTHORITY_MIGRATION_SOURCE,
    /metadata ->> 'requestKey' = 'training-attempt:' \|\| hands\.attempt_id::text/,
  );
  assert.match(CACHE_REPLAY_VERIFIER_SOURCE, /migration fabricated an attempt binding/);
  assert.match(CACHE_REPLAY_VERIFIER_SOURCE, /legacyRandomKeyRequiresSignedPromotion/);
  assert.match(CACHE_REPLAY_VERIFIER_SOURCE, /legacyContinuationReconstructed/);
  assert.match(CACHE_REPLAY_VERIFIER_SOURCE, /legacyHelperChunkZeroSupported/);
  assert.match(CACHE_REPLAY_VERIFIER_SOURCE, /legacyHelperChunkOneSupported/);
  assert.match(CACHE_REPLAY_VERIFIER_SOURCE, /legacyReceiptRequiresRfc4122V4/);
  assert.match(CACHE_REPLAY_VERIFIER_SOURCE, /legacyHandTimeRecoveryProved/);
  assert.match(CACHE_REPLAY_VERIFIER_SOURCE, /legacyReplayParentProofRequired/);
  assert.match(CACHE_REPLAY_VERIFIER_SOURCE, /schemaFirstPredecessorWritePreserved/);
  assert.match(CACHE_REPLAY_VERIFIER_SOURCE, /twoProtectedPrExpandContractStaging/);
  assert.match(CACHE_REPLAY_VERIFIER_SOURCE, /legacyPromotionCannotAttestDualWrite/);
  assert.match(CACHE_REPLAY_VERIFIER_SOURCE, /nullOwnerPoisoningBlocked/);
  assert.match(CACHE_REPLAY_VERIFIER_SOURCE, /recoveredOldPolicyFirstAnswer/);
  assert.match(CACHE_REPLAY_VERIFIER_SOURCE, /neverServedSnapshotAuthorizationDenied/);
  assert.match(CACHE_REPLAY_VERIFIER_SOURCE, /continuationWinnerIdempotent/);
});

test('a recovered old-policy first answer uses its served attempt slot and a never-served snapshot fails closed', async () => {
  const policyChecksum = '7'.repeat(64);
  const receiptPayload = {
    sub: '11111111-1111-4111-8111-111111111111',
    gameId: 'cash-001',
    questionId: 'recovered-old-policy',
    level: 2,
    sessionId: 'recovered-session',
    attemptId: '22222222-2222-4222-8222-222222222222',
    snapshotKey: '8'.repeat(64),
    jti: '33333333-3333-4333-8333-333333333333',
    handOrdinal: 1,
    decisionOrdinal: 1,
    countsTowardCompletion: true,
    practiceOnly: false,
    difficultyMode: 'exact',
    iat: 1_788_739_200,
    exp: 1_788_782_400,
  };
  const canonicalQuestion = {
    id: receiptPayload.questionId,
    options: [{ id: 'check', text: 'Check' }, { id: 'bet_75pct', text: 'Bet' }],
    correctAnswer: 'bet_75pct',
    policyChecksum,
    sourceClassification: 'SOLVER_EXACT',
    solverPolicy: { policyVersion: 'old-v1', actions: [{ id: 'check' }, { id: 'bet_75pct' }] },
    scenario: { street: 'flop', heroPosition: 'BTN', villainPosition: 'BB' },
  };
  const request = {
    method: 'POST',
    headers: { authorization: 'Bearer token' },
    body: {
      gameId: receiptPayload.gameId,
      questionId: receiptPayload.questionId,
      selectedAnswer: 'bet_75pct',
      gradingReceipt: 'signed',
      policyChecksum,
    },
  };
  let inserts = 0;
  const legacyPromotions = [];
  const recoveredHandler = loadRecordQuestionHandler({
    canonicalQuestion,
    receiptPayload,
    currentCacheRow: {
      question_id: canonicalQuestion.id,
      canonical_policy: { policyVersion: 'new-v2', actions: [{ id: 'fold' }] },
      source_classification: 'SOLVER_EXACT',
      quality_status: 'active',
      policy_version: 'new-v2',
      policy_checksum: '9'.repeat(64),
    },
    answerAuthorizationSequence: [false, true],
    legacyPromotionAuthorized: true,
    onLegacyPromotion: (promotion) => legacyPromotions.push(promotion),
    onInsert: () => { inserts += 1; },
  });
  const recovered = createApiResponse();
  await recoveredHandler(structuredClone(request), recovered);
  assert.equal(recovered.statusCode, 200);
  assert.equal(inserts, 1);
  assert.equal(legacyPromotions.length, 1);
  assert.equal(legacyPromotions[0].input.receiptId, receiptPayload.jti);
  assert.equal(legacyPromotions[0].input.receiptIssuedAt, receiptPayload.iat);
  assert.equal(legacyPromotions[0].input.receiptExpiresAt, receiptPayload.exp);

  const neverServedHandler = loadRecordQuestionHandler({
    canonicalQuestion,
    receiptPayload: { ...receiptPayload, jti: '44444444-4444-4444-8444-444444444444' },
    answerAuthorized: false,
    onInsert: () => { inserts += 1; },
  });
  const neverServed = createApiResponse();
  await neverServedHandler(structuredClone(request), neverServed);
  assert.equal(neverServed.statusCode, 409);
  assert.equal(neverServed.body.code, 'TRAINING_QUESTION_NOT_SERVED_FOR_ATTEMPT');
  assert.equal(inserts, 1);
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
