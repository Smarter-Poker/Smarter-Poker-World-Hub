import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';

import {
  deriveReceiptRng,
  prepareTrainingQuestionForDelivery,
  TrainingGradingReceiptError,
  verifyTrainingGradingReceipt,
} from '../src/lib/training/gradingReceipt.mjs';
import { resolveRngTarget } from '../src/lib/training/rngDecisionContract.mjs';
import {
  isDedicatedTrainingGradingReceiptSecret,
  TRAINING_GRADING_RECEIPT_EXAMPLE_SENTINEL,
} from '../src/lib/training/gradingReceiptSecret.mjs';

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

test('a recovered stable decision receipt cannot reroll its server RNG', () => {
  const first = issue({ rngRolls: undefined, nowMs: NOW });
  const recovered = issue({ rngRolls: undefined, nowMs: NOW + 60_000 });

  assert.deepEqual(
    recovered._gradingContext.rngRolls,
    first._gradingContext.rngRolls,
    'the same attempt/hand/decision and immutable question must retain its RNG rolls',
  );
  assert.notEqual(
    recovered._gradingContext.receipt,
    first._gradingContext.receipt,
    'recovery may refresh receipt timestamps without changing the sealed decision RNG',
  );
  assert.ok(first._gradingContext.rngRolls.low >= 1 && first._gradingContext.rngRolls.low <= 100);
  assert.ok(first._gradingContext.rngRolls.high >= 1 && first._gradingContext.rngRolls.high <= 100);
});

test('explicit server RNG rolls must be whole numbers', () => {
  assert.throws(
    () => issue({ rngRolls: { low: 1.5, high: 100 } }),
    (error) => error instanceof TrainingGradingReceiptError
      && error.code === 'TRAINING_GRADING_RECEIPT_RNG_INVALID',
  );
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
    process.env.TRAINING_GRADING_RECEIPT_SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY;
    assert.throws(
      () => issue({ secret: undefined }),
      (error) => error instanceof TrainingGradingReceiptError
        && error.code === 'TRAINING_GRADING_RECEIPT_SECRET_NOT_DEDICATED'
        && error.status === 503,
    );
    assert.throws(
      () => issue({ secret: TRAINING_GRADING_RECEIPT_EXAMPLE_SENTINEL }),
      (error) => error instanceof TrainingGradingReceiptError
        && error.code === 'TRAINING_GRADING_RECEIPT_SECRET_NOT_DEDICATED'
        && error.status === 503,
    );
    assert.equal(
      isDedicatedTrainingGradingReceiptSecret(
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
      ),
      false,
    );
    assert.equal(
      isDedicatedTrainingGradingReceiptSecret(
        TRAINING_GRADING_RECEIPT_EXAMPLE_SENTINEL,
        'different-service-role-key-that-is-long-enough',
      ),
      false,
    );
    for (const weakSecret of [
      ' '.repeat(32),
      'x'.repeat(32),
      'changeme'.repeat(4),
      'replace-me-secret'.padEnd(32, '-'),
      ` ${'aB7/'.repeat(8)}`,
    ]) {
      assert.equal(
        isDedicatedTrainingGradingReceiptSecret(weakSecret, 'different-service-role'),
        false,
        `obviously weak receipt secret was accepted: ${JSON.stringify(weakSecret)}`,
      );
      assert.throws(
        () => issue({ secret: weakSecret }),
        (error) => error instanceof TrainingGradingReceiptError
          && error.code === 'TRAINING_GRADING_RECEIPT_SECRET_NOT_DEDICATED'
          && error.status === 503,
      );
    }
    assert.equal(
      isDedicatedTrainingGradingReceiptSecret(
        '0123456789abcdef'.repeat(4),
        'different-service-role',
      ),
      true,
      'high-entropy-shaped hexadecimal material must remain supported',
    );
    assert.equal(
      isDedicatedTrainingGradingReceiptSecret(
        'QWxwaGE5L0JldGE3K0dhbW1hMkRlbHRhOE5vdEFQbGFjZWhvbGRlcg==',
        'different-service-role',
      ),
      true,
      'high-entropy-shaped base64 material must remain supported',
    );
    assert.equal(isDedicatedTrainingGradingReceiptSecret(SECRET, 'different-service-role'), true);
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
      userId: 'user-1', gameId: 'cash-001', questionId: 'q-receipt-1', canonicalQuestion: question, nowMs: NOW + (12 * 60 * 60 * 1000) + 1000, secret: SECRET,
    }),
    'TRAINING_GRADING_RECEIPT_EXPIRED',
  );
  const expiredReplayEnvelope = verifyTrainingGradingReceipt(receipt, {
    userId: 'user-1',
    gameId: 'cash-001',
    questionId: 'q-receipt-1',
    canonicalQuestion: question,
    nowMs: NOW + (12 * 60 * 60 * 1000) + 1000,
    secret: SECRET,
    allowExpired: true,
  });
  assert.equal(expiredReplayEnvelope.payload.questionId, 'q-receipt-1');

  const [encodedPayload] = receipt.split('.');
  const overlongPayload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  overlongPayload.exp = overlongPayload.iat + (24 * 60 * 60) + 1;
  const overlongEncoded = Buffer.from(JSON.stringify(overlongPayload), 'utf8').toString('base64url');
  const overlongSignature = createHmac('sha256', SECRET)
    .update(overlongEncoded)
    .digest('base64url');
  expectCode(
    () => verifyTrainingGradingReceipt(`${overlongEncoded}.${overlongSignature}`, {
      userId: 'user-1', gameId: 'cash-001', questionId: 'q-receipt-1', canonicalQuestion: question, nowMs: NOW, secret: SECRET,
    }),
    'TRAINING_GRADING_RECEIPT_TIME_INVALID',
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
    sourceClassification: 'SOLVER_EXACT',
    policyChecksum: 'a'.repeat(64),
    solverPolicy: {
      distribution: { x: 65, b33: 25, b75: 9, allin: 1 },
      chipEv: { measuredByAction: true, byAction: { x: 1, b33: 0.8, b75: 0.2, allin: -1 } },
      tournamentUtilityEv: { measuredByAction: false },
      rangeDistribution: { AA: { x: 1 } },
    },
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
  assert.equal(Object.hasOwn(served, 'solverPolicy'), false);
  assert.equal(served.policyChecksum, 'a'.repeat(64));
  assert.equal(served.sourceClassification, 'SOLVER_EXACT');
  // A claimed classification and a policy-shaped object are not solver
  // evidence. This intentionally malformed envelope is present only to prove
  // the recursive blind-delivery sanitizer, so it must remain unverified.
  assert.equal(served._gradingContext.solverEvidenceAvailable, false);
  assert.deepEqual(served._gradingContext.rngRolls, { low: 97, high: 4 });
  assert.equal('rngGuidance' in served._gradingContext, false);
  assert.equal(serialized.includes('targetaction'), false);
});
