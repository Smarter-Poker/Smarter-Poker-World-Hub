import assert from 'node:assert/strict';
import test from 'node:test';

import {
  filterTrainingQuestionsForAttempt,
  normalizeTrainingGameMode,
  normalizeTrainingHandSelection,
  trainingQuestionMatchesSelection,
} from '../src/lib/training/questionSelectionContract.mjs';

const question = (id, street, frequencies) => ({
  id,
  scenario: { street },
  gtoFrequencies: frequencies,
});

test('selection modes normalize to explicit safe values', () => {
  assert.equal(normalizeTrainingGameMode('STREET'), 'street');
  assert.equal(normalizeTrainingGameMode('invented'), 'full');
  assert.equal(normalizeTrainingHandSelection('NO-TRIVIAL'), 'no-trivial');
  assert.equal(normalizeTrainingHandSelection('invented'), 'all');
});

test('street drills reject every row from a different street before signing', () => {
  const questions = [
    question('flop', 'flop', { check: 60, bet: 40 }),
    question('turn', 'turn', { check: 55, bet: 45 }),
  ];
  assert.deepEqual(
    filterTrainingQuestionsForAttempt(questions, { gameMode: 'street', targetStreet: 'turn' })
      .map(({ id }) => id),
    ['turn'],
  );
  assert.equal(trainingQuestionMatchesSelection(questions[0], {
    gameMode: 'street',
    targetStreet: null,
  }), false);
});

test('hand selection is evaluated on the canonical frequency distribution', () => {
  const questions = [
    question('trivial', 'flop', { fold: 96, call: 4 }),
    question('close', 'flop', { check: 52, bet: 48 }),
    question('wide', 'flop', { check: 80, bet: 20 }),
    question('unverified', 'flop', null),
  ];
  assert.deepEqual(
    filterTrainingQuestionsForAttempt(questions, { handSelection: 'no-trivial' }).map(({ id }) => id),
    ['close', 'wide', 'unverified'],
  );
  assert.deepEqual(
    filterTrainingQuestionsForAttempt(questions, { handSelection: 'close' }).map(({ id }) => id),
    ['close'],
  );
});
