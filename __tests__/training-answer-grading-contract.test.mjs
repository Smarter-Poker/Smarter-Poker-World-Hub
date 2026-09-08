import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TrainingAnswerContractError,
  gradeTrainingAnswer,
} from '../src/lib/training/answerGradingContract.mjs';
import { DIFFICULTY, simplifyActions } from '../src/engines/DifficultyEngine.js';
import { applyDifficultyToQuestion } from '../src/lib/training/difficultyQuestionContract.mjs';
import { buildRngRanges, resolveRngTarget } from '../src/lib/training/rngDecisionContract.mjs';
import { validateTrainingQuestion } from '../src/lib/training/questionContract.mjs';
import { sealCanonicalTrainingQuestion } from '../tests/helpers/canonicalTrainingPolicyFixture.mjs';

function checkedToHeroQuestion({
  correctAnswer = 'b75',
  options = [
    { id: 'x', text: 'Check' },
    { id: 'b33', text: 'Bet 33% Pot' },
    { id: 'b75', text: 'Bet 75% Pot' },
    { id: 'b125', text: 'Bet 125% Pot' },
  ],
  frequencies = { x: 10, b33: 20, b75: 60, b125: 10 },
} = {}) {
  return sealCanonicalTrainingQuestion({
    id: 'q-check-bet',
    question: 'The Big Blind checks to you on the flop. What is your best action?',
    correctAnswer,
    source: 'PIO',
    heroCards: ['As', 'Kd'],
    boardCards: ['Qs', 'Jh', '2c'],
    scenario: {
      street: 'flop', heroPosition: 'BTN', villainPosition: 'BB',
      nodeType: 'checked_to_hero', pot: 10, stackDepth: 100,
    },
    options,
    gtoFrequencies: frequencies,
  }, { sourceArtifactSystem: 'solved_spots_gold_v2' });
}

test('Beginner and Grouped serve four legal non-overlapping choices; Exact is unchanged', () => {
  for (const mode of ['beginner', 'standard']) {
    const transformed = applyDifficultyToQuestion(checkedToHeroQuestion(), mode);
    assert.equal(transformed.options.length, 4);
    assert.equal(validateTrainingQuestion(transformed).valid, true);
    assert.equal(transformed.correctAnswer, 'grouped_medium');
    assert.deepEqual(
      transformed.options.map((option) => option.id),
      ['x', 'grouped_small', 'grouped_medium', 'grouped_overbet'],
    );
  }
  const exact = applyDifficultyToQuestion(checkedToHeroQuestion(), 'expert');
  assert.equal(exact.correctAnswer, 'b75');
  assert.deepEqual(exact.options.map((option) => option.id), ['x', 'b33', 'b75', 'b125']);
});

test('Grouped choices over four preserve the answer and rank alternatives by aggregate frequency', () => {
  const question = checkedToHeroQuestion({
    correctAnswer: 'b125',
    options: [
      { id: 'x', text: 'Check' },
      { id: 'b33', text: 'Bet 33% Pot' },
      { id: 'b75', text: 'Bet 75% Pot' },
      { id: 'b95', text: 'Bet 95% Pot' },
      { id: 'b125', text: 'Bet 125% Pot' },
    ],
    frequencies: { x: 1, b33: 2, b75: 7, b95: 40, b125: 50 },
  });
  const transformed = applyDifficultyToQuestion(question, 'standard');
  assert.equal(transformed.options.length, 4);
  assert.ok(transformed.options.some((option) => option.id === 'grouped_overbet'));
  assert.ok(transformed.options.some((option) => option.id === 'grouped_large'));
  assert.ok(transformed.options.some((option) => option.id === 'grouped_medium'));
  assert.ok(!transformed.options.some((option) => option.id === 'x'));
  assert.equal(validateTrainingQuestion(transformed).valid, true);
});

test('Sparse same-band solver actions fall back to the original solved choices', () => {
  const question = checkedToHeroQuestion({
    correctAnswer: 'b33',
    options: [
      { id: 'x', text: 'Check' },
      { id: 'b25', text: 'Bet 25% Pot' },
      { id: 'b33', text: 'Bet 33% Pot' },
      { id: 'b40', text: 'Bet 40% Pot' },
    ],
    frequencies: { x: 15, b25: 20, b33: 55, b40: 10 },
  });
  const transformed = applyDifficultyToQuestion(question, 'standard');
  assert.equal(transformed._difficultyFallback, 'exact-solver-actions');
  assert.deepEqual(transformed.options.map((option) => option.id), ['x', 'b25', 'b33', 'b40']);
  assert.ok(transformed.options.every((option) => option.contractDistractor !== true));
  assert.equal(validateTrainingQuestion(transformed).valid, true);
});

test('Grouped presentation follows sealed policy sizes when option ids and labels disagree', () => {
  const question = checkedToHeroQuestion({
    correctAnswer: 'b33',
    options: [
      { id: 'x', text: 'Check' },
      // The fixture seals the displayed percentages into the authoritative
      // policy. These deliberately misleading ids reproduce the browser/SQL
      // drift: the old browser parser trusted b33/b75/b125 instead.
      { id: 'b33', text: 'Bet 150% Pot' },
      { id: 'b75', text: 'Bet 33% Pot' },
      { id: 'b125', text: 'Bet 75% Pot' },
    ],
    frequencies: { x: 10, b33: 60, b75: 20, b125: 10 },
  });

  assert.deepEqual(
    question.solverPolicy.actions.map(({ id, family, size }) => [id, family, size.potFraction]),
    [
      ['x', 'check', null],
      ['b33', 'bet', 1.5],
      ['b75', 'bet', 0.33],
      ['b125', 'bet', 0.75],
    ],
  );

  const transformed = applyDifficultyToQuestion(question, 'standard');
  assert.equal(transformed.correctAnswer, 'grouped_overbet');
  assert.deepEqual(
    transformed.options.map((option) => option.id),
    ['x', 'grouped_small', 'grouped_medium', 'grouped_overbet'],
  );
  assert.deepEqual(transformed._difficultyMembers, {
    x: ['x'],
    grouped_small: ['b75'],
    grouped_medium: ['b125'],
    grouped_overbet: ['b33'],
  });
});

test('Policy all_in remains an individual action when its option id resembles a sized bet', () => {
  const question = checkedToHeroQuestion({
    correctAnswer: 'b250',
    options: [
      { id: 'x', text: 'Check' },
      { id: 'b250', text: 'Shove All-In' },
      { id: 'mystery_small', text: 'Bet 33% Pot' },
      { id: 'mystery_medium', text: 'Bet 75% Pot' },
    ],
    frequencies: { x: 10, b250: 60, mystery_small: 20, mystery_medium: 10 },
  });

  const transformed = applyDifficultyToQuestion(question, 'standard');
  assert.equal(transformed.correctAnswer, 'b250');
  assert.deepEqual(
    transformed.options.map((option) => option.id),
    ['x', 'b250', 'grouped_small', 'grouped_medium'],
  );
  assert.deepEqual(transformed._difficultyMembers.b250, ['b250']);
});

test('Explicit authoritative unsized aggression never falls back to parsing its id or copy', () => {
  const transformed = simplifyActions([
    { id: 'b33', text: 'Bet 33% Pot', action: 'bet', sizingPercent: null },
    { id: 'legacy_bet', text: 'Bet 75% Pot', action: 'bet' },
  ], DIFFICULTY.GROUPED, 10);

  assert.deepEqual(transformed.map((option) => option.id), ['b33', 'grouped_medium']);
  assert.deepEqual(transformed[1].mappedFrom.map((option) => option.id), ['legacy_bet']);
});

test('Randomizer ranges cover every integer exactly once in low and high modes', () => {
  const options = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const frequencies = { a: 95, b: 4, c: 1 };
  for (const mode of ['low', 'high']) {
    const ranges = buildRngRanges(options, frequencies, mode);
    const targets = Array.from({ length: 100 }, (_, index) => (
      resolveRngTarget(options, frequencies, index + 1, mode)?.id
    ));
    assert.equal(ranges.length, 3);
    assert.equal(targets.filter(Boolean).length, 100);
    assert.deepEqual(
      Object.fromEntries(['a', 'b', 'c'].map((id) => [id, targets.filter((value) => value === id).length])),
      frequencies,
    );
  }
});

test('Server authority grades strict RNG adherence and retains canonical solver grade', () => {
  const canonicalQuestion = checkedToHeroQuestion({
    correctAnswer: 'x',
    frequencies: { x: 95, b33: 4, b75: 1, b125: 0 },
  });
  const grouped = applyDifficultyToQuestion(canonicalQuestion, 'standard');
  const rareTarget = resolveRngTarget(grouped.options, grouped.gtoFrequencies, 100, 'low');
  assert.equal(rareTarget.id, 'grouped_medium');

  const followed = gradeTrainingAnswer({
    canonicalQuestion,
    selectedAnswer: rareTarget.id,
    difficultyMode: 'standard',
    rng: { roll: 100, mode: 'low' },
  });
  assert.equal(followed.gradeMode, 'rng-adherence');
  assert.equal(followed.grade.isCorrect, true);
  assert.equal(followed.grade.policyVersion, canonicalQuestion.solverPolicy.policyVersion);
  assert.equal(
    followed.grade.sourceChecksum,
    canonicalQuestion.solverPolicy.sourceArtifact.sourceArtifactChecksum,
  );

  const ignored = gradeTrainingAnswer({
    canonicalQuestion,
    selectedAnswer: 'x',
    difficultyMode: 'standard',
    rng: { roll: 100, mode: 'low' },
  });
  assert.equal(ignored.grade.isCorrect, false);
  assert.equal(ignored.grade.classification, 'wrong');
  assert.equal(ignored.canonicalSolverGrade.classification, 'best');
});

test('Forged grouped ids fail closed and browser RNG targets cannot affect grading', () => {
  assert.throws(
    () => gradeTrainingAnswer({
      canonicalQuestion: checkedToHeroQuestion(),
      selectedAnswer: 'grouped_fake',
      difficultyMode: 'standard',
    }),
    (error) => error instanceof TrainingAnswerContractError
      && error.code === 'TRAINING_ANSWER_NOT_CANONICAL',
  );
  const forgedTarget = gradeTrainingAnswer({
    canonicalQuestion: checkedToHeroQuestion(),
    selectedAnswer: 'x',
    difficultyMode: 'standard',
    rng: { roll: 1, mode: 'low', targetActionId: 'grouped_medium' },
  });
  assert.equal(forgedTarget.grade.isCorrect, true);
  assert.equal(forgedTarget.rng.targetActionId, 'x');
});
