import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deriveReceiptRng,
  prepareTrainingQuestionForDelivery,
  TrainingGradingReceiptError,
  verifyTrainingGradingReceipt,
} from '../src/lib/training/gradingReceipt.mjs';
import { resolveRngTarget } from '../src/lib/training/rngDecisionContract.mjs';

const SECRET = 'phase-six-test-secret-that-is-long-enough-123456';
const NOW = Date.UTC(2026, 8, 6, 12, 0, 0);
const question = {
  id: 'q-receipt-1',
  question: 'What Is The Best Action?',
  options: [
    { id: 'x', text: 'Check' },
    { id: 'b33', text: 'Bet 33%' },
    { id: 'b75', text: 'Bet 75%' },
    { id: 'allin', text: 'All-In' },
  ],
  correctAnswer: 'x',
  gtoFrequencies: { x: 65, b33: 25, b75: 9, allin: 1 },
  scenario: {
    pot: 10,
    street: 'flop',
    nextStreetContinuationAction: 'b75',
    nextStreetContinuation: { actionId: 'b75', nodeBeforeRunout: 'r:0:c:b750:c' },
  },
};

function issue(overrides = {}) {
  return prepareTrainingQuestionForDelivery({
    canonicalQuestion: question,
    userId: 'user-1',
    gameId: 'cash-001',
    sessionId: 'session-1',
    attemptId: '11111111-1111-4111-8111-111111111111',
    snapshotKey: 'a'.repeat(64),
    sessionKind: 'campaign',
    sessionTargetHands: 20,
    handOrdinal: 1,
    decisionOrdinal: 1,
    level: 3,
    difficultyMode: 'expert',
    nowMs: NOW,
    secret: SECRET,
    receiptId: 'receipt-1',
    rngRolls: { low: 97, high: 4 },
    ...overrides,
  });
}

test('receipt binds user, game, question, difficulty, digest, and server RNG rolls', () => {
  const served = issue();
  assert.equal(Object.hasOwn(served, 'correctAnswer'), false);
  assert.equal(Object.hasOwn(served, 'gtoFrequencies'), false);
  assert.equal(Object.hasOwn(served, 'explanation'), false);
  assert.equal(Object.hasOwn(served.scenario, 'nextStreetContinuationAction'), false);
  assert.equal(Object.hasOwn(served.scenario, 'nextStreetContinuation'), false);
  assert.equal(served._gradingContext.solverEvidenceAvailable, false);
  assert.equal(Object.hasOwn(served._gradingContext, 'rngGuidance'), false);
  const verified = verifyTrainingGradingReceipt(served._gradingContext.receipt, {
    userId: 'user-1',
    gameId: 'cash-001',
    questionId: 'q-receipt-1',
    canonicalQuestion: question,
    nowMs: NOW + 1000,
    secret: SECRET,
  });
  assert.equal(verified.payload.jti, 'receipt-1');
  assert.equal(verified.payload.sessionId, 'session-1');
  assert.equal(verified.payload.attemptId, '11111111-1111-4111-8111-111111111111');
  assert.equal(verified.payload.snapshotKey, 'a'.repeat(64));
  assert.equal(verified.payload.sessionTargetHands, 20);
  assert.equal(verified.payload.handOrdinal, 1);
  assert.equal(verified.payload.decisionOrdinal, 1);
  assert.equal(verified.payload.countsTowardCompletion, true);
  assert.equal(verified.payload.practiceOnly, false);
  assert.equal(verified.payload.difficultyMode, 'exact');
  assert.deepEqual(verified.payload.rngRolls, { low: 97, high: 4 });
  assert.equal(verified.servedQuestion._gradingContext, undefined);
});

test('receipt signing fails closed without a dedicated secret and never reuses the Supabase service key', () => {
  const originalReceiptSecret = process.env.TRAINING_GRADING_RECEIPT_SECRET;
  const originalServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    delete process.env.TRAINING_GRADING_RECEIPT_SECRET;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key-that-is-deliberately-long-enough';
    assert.throws(
      () => issue({ secret: undefined }),
      (error) => error instanceof TrainingGradingReceiptError
        && error.code === 'TRAINING_GRADING_RECEIPT_NOT_CONFIGURED'
        && error.status === 503,
    );
  } finally {
    if (originalReceiptSecret === undefined) delete process.env.TRAINING_GRADING_RECEIPT_SECRET;
    else process.env.TRAINING_GRADING_RECEIPT_SECRET = originalReceiptSecret;
    if (originalServiceKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceKey;
  }
});

test('tampering, wrong identity, wrong game, wrong question, and expiry all fail closed', () => {
  const served = issue();
  const receipt = served._gradingContext.receipt;
  const expectCode = (fn, code) => assert.throws(fn, (error) => (
    error instanceof TrainingGradingReceiptError && error.code === code
  ));
  expectCode(
    () => verifyTrainingGradingReceipt(`${receipt.slice(0, -1)}x`, {
      userId: 'user-1', gameId: 'cash-001', questionId: 'q-receipt-1', canonicalQuestion: question, nowMs: NOW, secret: SECRET,
    }),
    'TRAINING_GRADING_RECEIPT_SIGNATURE_INVALID',
  );
  expectCode(
    () => verifyTrainingGradingReceipt(receipt, {
      userId: 'user-2', gameId: 'cash-001', questionId: 'q-receipt-1', canonicalQuestion: question, nowMs: NOW, secret: SECRET,
    }),
    'TRAINING_GRADING_RECEIPT_USER_MISMATCH',
  );
  expectCode(
    () => verifyTrainingGradingReceipt(receipt, {
      userId: 'user-1', gameId: 'adv-011', questionId: 'q-receipt-1', canonicalQuestion: question, nowMs: NOW, secret: SECRET,
    }),
    'TRAINING_GRADING_RECEIPT_GAME_MISMATCH',
  );
  expectCode(
    () => verifyTrainingGradingReceipt(receipt, {
      userId: 'user-1', gameId: 'cash-001', questionId: 'other', canonicalQuestion: question, nowMs: NOW, secret: SECRET,
    }),
    'TRAINING_GRADING_RECEIPT_QUESTION_MISMATCH',
  );
  expectCode(
    () => verifyTrainingGradingReceipt(receipt, {
      userId: 'user-1', gameId: 'cash-001', questionId: 'q-receipt-1', sessionId: 'session-2', canonicalQuestion: question, nowMs: NOW, secret: SECRET,
    }),
    'TRAINING_GRADING_RECEIPT_SESSION_MISMATCH',
  );
  expectCode(
    () => verifyTrainingGradingReceipt(receipt, {
      userId: 'user-1', gameId: 'cash-001', questionId: 'q-receipt-1', attemptId: 'other-attempt', canonicalQuestion: question, nowMs: NOW, secret: SECRET,
    }),
    'TRAINING_GRADING_RECEIPT_ATTEMPT_MISMATCH',
  );
  expectCode(
    () => verifyTrainingGradingReceipt(receipt, {
      userId: 'user-1', gameId: 'cash-001', questionId: 'q-receipt-1', snapshotKey: 'b'.repeat(64), canonicalQuestion: question, nowMs: NOW, secret: SECRET,
    }),
    'TRAINING_GRADING_RECEIPT_SNAPSHOT_MISMATCH',
  );
  expectCode(
    () => verifyTrainingGradingReceipt(receipt, {
      userId: 'user-1', gameId: 'cash-001', questionId: 'q-receipt-1', canonicalQuestion: question, nowMs: NOW + (13 * 60 * 60 * 1000), secret: SECRET,
    }),
    'TRAINING_GRADING_RECEIPT_EXPIRED',
  );
});

test('canonical question mutation invalidates an otherwise valid receipt', () => {
  const served = issue();
  assert.throws(
    () => verifyTrainingGradingReceipt(served._gradingContext.receipt, {
      userId: 'user-1',
      gameId: 'cash-001',
      questionId: 'q-receipt-1',
      canonicalQuestion: { ...question, correctAnswer: 'b33' },
      nowMs: NOW,
      secret: SECRET,
    }),
    (error) => error.code === 'TRAINING_GRADING_RECEIPT_QUESTION_CHANGED',
  );
});

test('RNG mode must use the exact server-issued roll and resolves the rare action', () => {
  const served = issue();
  const { payload } = verifyTrainingGradingReceipt(served._gradingContext.receipt, {
    userId: 'user-1', gameId: 'cash-001', questionId: 'q-receipt-1', canonicalQuestion: question, nowMs: NOW, secret: SECRET,
  });
  const target = resolveRngTarget(question.options, question.gtoFrequencies, 97, 'low');
  assert.equal(target.id, 'b75');
  assert.deepEqual(
    deriveReceiptRng(payload, { mode: 'low', roll: 97, targetActionId: target.id }),
    { mode: 'low', roll: 97 },
  );
  assert.throws(
    () => deriveReceiptRng(payload, { mode: 'low', roll: 96, targetActionId: target.id }),
    (error) => error.code === 'TRAINING_GRADING_RECEIPT_RNG_MISMATCH',
  );
  assert.throws(
    () => deriveReceiptRng(payload, { mode: 'high', roll: 97, targetActionId: target.id }),
    (error) => error.code === 'TRAINING_GRADING_RECEIPT_RNG_MISMATCH',
  );
});

test('blind delivery recursively removes grading hints and exposes only signed RNG rolls', () => {
  const exactQuestion = {
    ...question,
    source: 'local_solver_ranges',
    explanation: 'Check is highest frequency.',
    structuredExplanation: { correctAction: 'x' },
    scenario: {
      ...question.scenario,
      gtoData: { correctAnswer: 'x', actionEVs: { x: 1, b33: 0 } },
      answer: 'x',
      solution: { recommendedAction: 'x' },
      coach_payload: {
        is_optimal: true,
        verdict: 'Best',
        rationale: 'The answer is Check.',
        hint: 'Prefer the passive option.',
        score: 100,
      },
    },
    options: question.options.map((option, index) => ({
      ...option,
      frequency: question.gtoFrequencies[option.id],
      isCorrect: index === 0,
      recommendation: index === 0 ? 'Use This' : 'Avoid This',
      _hiddenGrade: index === 0 ? 'best' : 'wrong',
    })),
  };
  const served = issue({ canonicalQuestion: exactQuestion });
  const serialized = JSON.stringify(served).toLowerCase();
  for (const forbidden of [
    'correctanswer', 'explanation', 'gtofrequencies', 'actionevs', 'iscorrect', 'frequency',
    'answer', 'solution', 'recommendedaction', 'is_optimal', 'verdict', 'rationale',
    'hint', 'score', 'recommendation', '_hiddengrade',
  ]) {
    assert.equal(serialized.includes(`"${forbidden}"`), false, forbidden);
  }
  assert.equal(served.options.length, 4);
  assert.equal(served._gradingContext.solverEvidenceAvailable, true);
  assert.deepEqual(served._gradingContext.rngRolls, { low: 97, high: 4 });
  assert.equal('rngGuidance' in served._gradingContext, false);
  assert.equal(serialized.includes('targetaction'), false);
});
