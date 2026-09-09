import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeTrainingAttemptReceiptFields,
  resolveTrainingSessionTarget,
  trainingMasteryMinimum,
  TrainingSessionAttemptContractError,
} from '../src/lib/training/sessionAttemptContract.mjs';

test('campaign attempts use the authoritative 20/25/30 mastery counts', () => {
  for (let level = 1; level <= 10; level += 1) {
    assert.equal(trainingMasteryMinimum(level), 20);
    assert.equal(resolveTrainingSessionTarget({ level, requestedHands: 1 }), 20);
  }
  assert.equal(trainingMasteryMinimum(11), 25);
  assert.equal(trainingMasteryMinimum(12), 30);
});

test('custom, Daily Challenge, and replay attempts accept only their explicit product contracts', () => {
  for (const count of [10, 25, 50, 100]) {
    assert.equal(resolveTrainingSessionTarget({ sessionKind: 'custom', requestedHands: count }), count);
  }
  assert.throws(
    () => resolveTrainingSessionTarget({ sessionKind: 'custom', requestedHands: 20 }),
    (error) => error instanceof TrainingSessionAttemptContractError
      && error.code === 'TRAINING_CUSTOM_HAND_COUNT_INVALID',
  );
  assert.equal(resolveTrainingSessionTarget({ sessionKind: 'replay', requestedHands: 7 }), 7);
  assert.throws(() => resolveTrainingSessionTarget({ sessionKind: 'replay', requestedHands: 0 }));
  assert.equal(resolveTrainingSessionTarget({ sessionKind: 'daily', requestedHands: 1 }), 1);
  assert.throws(
    () => resolveTrainingSessionTarget({ sessionKind: 'daily', requestedHands: 2 }),
    (error) => error instanceof TrainingSessionAttemptContractError
      && error.code === 'TRAINING_DAILY_HAND_COUNT_INVALID',
  );
});

test('only decision one counts as a completed hand and all ordinals are bounded', () => {
  assert.deepEqual(
    normalizeTrainingAttemptReceiptFields({
      level: 1,
      sessionKind: 'campaign',
      sessionTargetHands: 20,
      handOrdinal: 20,
      decisionOrdinal: 1,
      countsTowardCompletion: true,
    }),
    {
      sessionKind: 'campaign',
      sessionTargetHands: 20,
      handOrdinal: 20,
      decisionOrdinal: 1,
      countsTowardCompletion: true,
      practiceOnly: false,
    },
  );
  assert.deepEqual(
    normalizeTrainingAttemptReceiptFields({
      level: 1,
      sessionKind: 'campaign',
      sessionTargetHands: 20,
      handOrdinal: 4,
      decisionOrdinal: 2,
      countsTowardCompletion: false,
    }).countsTowardCompletion,
    false,
  );
  assert.throws(() => normalizeTrainingAttemptReceiptFields({
    level: 1,
    sessionKind: 'campaign',
    sessionTargetHands: 20,
    handOrdinal: 21,
  }));
  assert.throws(() => normalizeTrainingAttemptReceiptFields({
    level: 1,
    sessionKind: 'campaign',
    sessionTargetHands: 20,
    handOrdinal: 1,
    decisionOrdinal: 2,
    countsTowardCompletion: true,
  }));
});

test('replay receipts are always practice-only and cannot masquerade as progression', () => {
  const replay = normalizeTrainingAttemptReceiptFields({
    level: 7,
    sessionKind: 'replay',
    sessionTargetHands: 3,
    handOrdinal: 1,
    practiceOnly: true,
  });
  assert.equal(replay.practiceOnly, true);
  assert.throws(() => normalizeTrainingAttemptReceiptFields({
    level: 7,
    sessionKind: 'replay',
    sessionTargetHands: 3,
    handOrdinal: 1,
    practiceOnly: false,
  }));
});

test('Daily Challenge receipts are one-hand, reward-eligible attempts', () => {
  assert.deepEqual(
    normalizeTrainingAttemptReceiptFields({
      level: 1,
      sessionKind: 'daily',
      sessionTargetHands: 1,
      handOrdinal: 1,
      decisionOrdinal: 1,
      countsTowardCompletion: true,
      practiceOnly: false,
    }),
    {
      sessionKind: 'daily',
      sessionTargetHands: 1,
      handOrdinal: 1,
      decisionOrdinal: 1,
      countsTowardCompletion: true,
      practiceOnly: false,
    },
  );
});
