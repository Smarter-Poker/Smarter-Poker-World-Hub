import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AUDITOR_PATH = join(ROOT, 'scripts/training-runtime-surface-audit.mjs');

function loadRuntimeFixtureAuthority() {
  const source = readFileSync(AUDITOR_PATH, 'utf8');
  const start = source.indexOf('const RUNTIME_FORBIDDEN_REQUEST_KEYS');
  const end = source.indexOf('\nasync function installRuntimeMocks', start);
  assert.ok(start >= 0 && end > start, 'runtime fixture authority source block is missing');
  const context = vm.createContext({
    assert,
    randomUUID,
    sha256: (value) => createHash('sha256').update(String(value)).digest('hex'),
  });
  vm.runInContext(
    `${source.slice(start, end)}\n;globalThis.runtimeFixtureTestApi = { createRuntimeFixtureAuthority };`,
    context,
    { filename: AUDITOR_PATH },
  );
  return context.runtimeFixtureTestApi.createRuntimeFixtureAuthority();
}

function startCampaign(authority, overrides = {}) {
  const result = authority.ensureAttempt({
    sessionId: 'runtime-authority-test-session',
    gameId: 'cash-001',
    level: 1,
    sessionKind: 'campaign',
    requestedHands: 20,
    difficultyMode: 'standard',
    config: { gameMode: 'full', handSelection: 'all', targetStreet: null },
    ...overrides,
  });
  assert.equal(result.error, undefined);
  return result.attempt;
}

function gradingPayload(question, selectedAnswer = 'raise') {
  const context = question._gradingContext;
  return {
    userId: 'runtime-authority-test-user',
    gameId: 'cash-001',
    questionId: question.id,
    submissionId: context.submissionId,
    sessionId: context.sessionId,
    attemptId: context.attemptId,
    snapshotKey: context.snapshotKey,
    sessionKind: context.sessionKind,
    sessionTargetHands: context.sessionTargetHands,
    handOrdinal: context.handOrdinal,
    decisionOrdinal: context.decisionOrdinal,
    countsTowardCompletion: context.countsTowardCompletion,
    practiceOnly: context.practiceOnly,
    gradingReceipt: context.receipt,
    selectedAnswer,
    gradingMode: context.difficultyMode,
    rng: null,
  };
}

test('runtime route fixtures are explicit and the generic Training boundary fails closed', () => {
  const source = readFileSync(AUDITOR_PATH, 'utf8');
  const genericBoundary = source.indexOf("context.route('**/api/training/**'");
  assert.ok(genericBoundary >= 0, 'generic Training boundary is missing');
  for (const route of [
    'batch-preload?**',
    'get-question?**',
    'custom-train?**',
    'progress**',
    'smart-practice?**',
    'reissue-questions',
    'next-street',
    'save-progress',
    'record-question',
    'save-session',
  ]) {
    const explicitRoute = source.indexOf(`context.route('**/api/training/${route}'`);
    assert.ok(explicitRoute > genericBoundary, `${route} is not an explicit higher-priority fixture`);
  }
  assert.match(source, /status: 501,[\s\S]{0,180}Unmocked Training endpoint/);
  assert.doesNotMatch(source, /Number\(payload\.questionsAnswered\)/);
  assert.doesNotMatch(source, /Boolean\(payload\.isCorrect\)/);
});

test('runtime delivery is blind, signed, bounded, and stable for one attempt nonce', () => {
  const authority = loadRuntimeFixtureAuthority();
  const attempt = startCampaign(authority);
  const delivery = authority.delivery(attempt, 1, 20);

  assert.equal(delivery.attemptId, attempt.id);
  assert.equal(delivery.targetHands, 20);
  assert.equal(delivery.questions.length, 20);
  assert.equal(new Set(delivery.questions.map((question) => (
    question._gradingContext.submissionId
  ))).size, 20);
  for (const [index, question] of delivery.questions.entries()) {
    assert.equal(Object.hasOwn(question, 'correctAnswer'), false);
    assert.equal(Object.hasOwn(question, 'explanation'), false);
    assert.equal(question._gradingContext.attemptId, attempt.id);
    assert.equal(question._gradingContext.handOrdinal, index + 1);
    assert.equal(question._gradingContext.sessionTargetHands, 20);
  }
  assert.throws(() => authority.delivery(attempt, 20, 2), /exceeds the signed attempt/);

  const resumed = startCampaign(authority);
  assert.equal(resumed.id, attempt.id);
  const conflict = authority.ensureAttempt({
    sessionId: attempt.sessionId,
    gameId: attempt.gameId,
    level: attempt.level,
    sessionKind: attempt.sessionKind,
    requestedHands: 20,
    difficultyMode: 'simple',
    config: { gameMode: 'full', handSelection: 'all', targetStreet: null },
  });
  assert.equal(conflict.error.status, 409);
  assert.equal(conflict.error.body.code, 'TRAINING_ATTEMPT_NONCE_CONFLICT');
});

test('runtime grading derives the verdict and rejects client-owned or mismatched truth', () => {
  const authority = loadRuntimeFixtureAuthority();
  const attempt = startCampaign(authority);
  const question = authority.delivery(attempt, 1, 1).questions[0];
  const payload = gradingPayload(question);

  const accepted = authority.grade(payload);
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.evidence.isCorrect, true);
  assert.equal(accepted.body.feedback.correctAnswer, 'raise');
  assert.equal(Object.hasOwn(payload, 'isCorrect'), false);

  assert.throws(
    () => authority.grade({ ...payload, isCorrect: false }),
    /forbidden server-owned Training field isCorrect/,
  );
  assert.throws(
    () => authority.grade({ ...payload, mysteryGrade: 'best' }),
    /unknown Training grading field mysteryGrade/,
  );
  const mismatched = authority.grade({
    ...payload,
    submissionId: randomUUID(),
    sessionTargetHands: 19,
  });
  assert.equal(mismatched.status, 409);
  assert.match(mismatched.body.error, /identity mismatch/i);

  const replay = authority.grade(payload);
  assert.equal(replay.status, 200);
  assert.equal(replay.body.idempotentReplay, true);
  const replayConflict = authority.grade({ ...payload, selectedAnswer: 'fold' });
  assert.equal(replayConflict.status, 409);
  assert.equal(replayConflict.body.code, 'TRAINING_GRADING_RECEIPT_REPLAY_CONFLICT');
});

test('runtime completion and analytics are derived only from persisted first decisions', () => {
  const authority = loadRuntimeFixtureAuthority();
  const attempt = startCampaign(authority);
  const delivery = authority.delivery(attempt, 1, 20);

  assert.equal(authority.complete(attempt.id).status, 409);
  assert.equal(authority.saveAnalytics(attempt.id).status, 409);
  for (const [index, question] of delivery.questions.entries()) {
    const grade = authority.grade(gradingPayload(question, index === 0 ? 'fold' : 'raise'));
    assert.equal(grade.status, 200);
  }

  const completed = authority.complete(attempt.id);
  assert.equal(completed.status, 200);
  assert.equal(completed.body.answered, 20);
  assert.equal(completed.body.correct, 19);
  assert.equal(completed.body.accuracy, 95);
  assert.equal(completed.body.passed, true);
  assert.equal(completed.body.diamondsEarned, 12);
  assert.equal(authority.complete(attempt.id).body.newCompletion, false);

  const analytics = authority.saveAnalytics(attempt.id);
  assert.equal(analytics.status, 200);
  assert.equal(analytics.body.newSession, true);
  assert.equal(analytics.body.session.hands_played, 20);
  assert.equal(analytics.body.session.hand_history.filter(({ isCorrect }) => isCorrect).length, 19);
  assert.equal(authority.saveAnalytics(attempt.id).body.newSession, false);

  const terminalReplay = authority.ensureAttempt({
    sessionId: attempt.sessionId,
    gameId: attempt.gameId,
    level: attempt.level,
    sessionKind: attempt.sessionKind,
    requestedHands: 20,
    difficultyMode: attempt.difficultyMode,
    config: { gameMode: 'full', handSelection: 'all', targetStreet: null },
  });
  assert.equal(terminalReplay.error.status, 409);
  assert.equal(terminalReplay.error.body.code, 'TRAINING_ATTEMPT_NOT_OPEN');
});

test('runtime continuation requires the preceding signed decision', () => {
  const authority = loadRuntimeFixtureAuthority();
  const attempt = startCampaign(authority);
  const first = authority.ensureQuestion(attempt, 1, 1).publicQuestion;
  const second = authority.ensureQuestion(attempt, 1, 2, {
    street: 'flop',
    boardCards: ['2c', '3d', '4h'],
  }).publicQuestion;

  const sequenceGap = authority.grade(gradingPayload(second));
  assert.equal(sequenceGap.status, 409);
  assert.equal(sequenceGap.body.code, 'TRAINING_ATTEMPT_DECISION_SEQUENCE_GAP');
  assert.equal(authority.grade(gradingPayload(first)).status, 200);
  assert.equal(authority.grade(gradingPayload(second)).status, 200);
  assert.equal(authority.complete(attempt.id).status, 409);
});

test('runtime continuation stays blind until persistence and binds the exact saved action', () => {
  const authority = loadRuntimeFixtureAuthority();
  const attempt = startCampaign(authority);
  const template = authority.ensureQuestion(attempt, 1, 1).canonical;

  const wrongLine = authority.ensureQuestion(attempt, 2, 1, {
    canonical: {
      ...template,
      id: `${template.id}-wrong-line`,
      scenario: {
        ...template.scenario,
        street: 'flop',
        boardCards: ['2c', '3d', '4h'],
        nextStreetContinuationAction: 'raise',
        nextStreetContinuation: { childScenarioHash: 'private-child-hash' },
      },
    },
  });
  assert.equal(Object.hasOwn(wrongLine.publicQuestion.scenario, 'nextStreetContinuationAction'), false);
  assert.equal(Object.hasOwn(wrongLine.publicQuestion.scenario, 'nextStreetContinuation'), false);
  assert.equal(authority.resolveContinuation(wrongLine.publicQuestion._gradingContext.receipt).error.body.code,
    'TRAINING_CONTINUATION_PRECEDING_ANSWER_REQUIRED');
  const wrongGrade = authority.grade(gradingPayload(wrongLine.publicQuestion, 'fold'));
  assert.equal(wrongGrade.body.feedback.continuation?.actionId, 'raise');
  assert.equal(authority.resolveContinuation(wrongLine.publicQuestion._gradingContext.receipt).error.body.code,
    'TRAINING_CONTINUATION_OFF_TREE_ACTION');

  const exactLine = authority.ensureQuestion(attempt, 3, 1, {
    canonical: {
      ...template,
      id: `${template.id}-exact-line`,
      scenario: {
        ...template.scenario,
        street: 'flop',
        boardCards: ['2c', '3d', '4h'],
        nextStreetContinuationAction: 'raise',
      },
    },
  });
  assert.equal(authority.grade(gradingPayload(exactLine.publicQuestion, 'raise')).status, 200);
  const allowed = authority.resolveContinuation(exactLine.publicQuestion._gradingContext.receipt);
  assert.equal(allowed.error, undefined);
  assert.equal(allowed.actionId, 'raise');
  assert.equal(allowed.parent.handOrdinal, 3);
});
