import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TrainingAnswerContractError,
  gradeTrainingAnswer,
} from '../src/lib/training/answerGradingContract.mjs';
import { applyDifficultyToQuestion } from '../src/lib/training/difficultyQuestionContract.mjs';
import { buildRngRanges, resolveRngTarget } from '../src/lib/training/rngDecisionContract.mjs';
import { validateTrainingQuestion } from '../src/lib/training/questionContract.mjs';

const sealed = {
  verified: true,
  scenarioHash: 'scenario-hash',
  solverVersion: '1.0',
  solverBinaryChecksum: 'a'.repeat(64),
  machineId: 'M1',
  pipelineCommit: 'b'.repeat(40),
  manifestVersion: 'training-v1',
  manifestChecksum: 'c'.repeat(64),
  sourceArtifactChecksum: 'd'.repeat(64),
  qualityStatus: 'validated',
  auditedAt: '2026-09-06T00:00:00.000Z',
};

function checkedToHeroQuestion() {
  return {
    id: 'q-check-bet',
    question: 'The Big Blind checks to you on the flop. What is your best action?',
    correctAnswer: 'b75',
    source: 'PIO',
    dataQuality: 'SOLVER_EXACT',
    solverProvenance: sealed,
    scenario: {
      street: 'flop', heroPosition: 'BTN', villainPosition: 'BB',
      nodeType: 'checked_to_hero', pot: 10,
    },
    options: [
      { id: 'x', text: 'Check' },
      { id: 'b33', text: 'Bet 33% Pot' },
      { id: 'b75', text: 'Bet 75% Pot' },
      { id: 'b125', text: 'Bet 125% Pot' },
    ],
    gtoFrequencies: { x: 10, b33: 20, b75: 60, b125: 10 },
  };
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
  const question = checkedToHeroQuestion();
  question.correctAnswer = 'b125';
  question.options.push({ id: 'b95', text: 'Bet 95% Pot' });
  question.gtoFrequencies = { x: 1, b33: 2, b75: 40, b95: 50, b125: 7 };
  const transformed = applyDifficultyToQuestion(question, 'standard');
  assert.equal(transformed.options.length, 4);
  assert.ok(transformed.options.some((option) => option.id === 'grouped_overbet'));
  assert.ok(transformed.options.some((option) => option.id === 'grouped_large'));
  assert.ok(transformed.options.some((option) => option.id === 'grouped_medium'));
  assert.ok(!transformed.options.some((option) => option.id === 'x'));
  assert.equal(validateTrainingQuestion(transformed).valid, true);
});

test('Sparse same-band solver actions fall back to the original solved choices', () => {
  const question = checkedToHeroQuestion();
  question.options = [
    { id: 'x', text: 'Check' },
    { id: 'b25', text: 'Bet 25% Pot' },
    { id: 'b33', text: 'Bet 33% Pot' },
    { id: 'b40', text: 'Bet 40% Pot' },
  ];
  question.correctAnswer = 'b33';
  question.gtoFrequencies = { x: 15, b25: 20, b33: 55, b40: 10 };
  const transformed = applyDifficultyToQuestion(question, 'standard');
  assert.equal(transformed._difficultyFallback, 'exact-solver-actions');
  assert.deepEqual(transformed.options.map((option) => option.id), ['x', 'b25', 'b33', 'b40']);
  assert.ok(transformed.options.every((option) => option.contractDistractor !== true));
  assert.equal(validateTrainingQuestion(transformed).valid, true);
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
  const canonicalQuestion = checkedToHeroQuestion();
  canonicalQuestion.gtoFrequencies = { x: 95, b33: 4, b75: 1, b125: 0 };
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
