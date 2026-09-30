import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getPsychologyBankSize,
  getPsychologyGameIds,
  getPsychologyQuestions,
} from '../src/data/psychologyQuestionBank.js';

const DEDICATED_SCENARIO_GAMES = [
  ...Array.from({ length: 20 }, (_, index) => `psy-${String(index + 1).padStart(3, '0')}`),
  'cash-020',
];

test('every dedicated SCENARIO bank delivers 30 unique, valid Level-12 questions without padding', () => {
  assert.deepEqual([...getPsychologyGameIds()].sort(), [...DEDICATED_SCENARIO_GAMES].sort());

  for (const gameId of DEDICATED_SCENARIO_GAMES) {
    const bankSize = getPsychologyBankSize(gameId);
    assert.ok(bankSize >= 30, `${gameId}: only ${bankSize} authored questions`);

    const questions = getPsychologyQuestions(gameId, 12, 30, []);
    assert.equal(questions.length, 30, `${gameId}: Level 12 shortfall`);
    assert.equal(new Set(questions.map(({ id }) => id)).size, 30, `${gameId}: duplicate ids`);
    assert.equal(new Set(questions.map(({ question }) => question)).size, 30, `${gameId}: duplicate prompts`);

    for (const question of questions) {
      assert.equal(question.gameId, gameId, `${gameId}/${question.id}: wrong game`);
      assert.equal(question.level, 12, `${gameId}/${question.id}: wrong level`);
      assert.equal(question.source, 'PSYCHOLOGY_BANK', `${gameId}/${question.id}: wrong source`);
      assert.equal(question.scenario?.isPsychology, true, `${gameId}/${question.id}: not psychology`);
      assert.ok(String(question.scenario?.description || '').trim(), `${gameId}/${question.id}: no scenario`);
      assert.ok(String(question.explanation || '').trim(), `${gameId}/${question.id}: no explanation`);
      assert.ok(Number.isInteger(question.difficulty) && question.difficulty >= 1 && question.difficulty <= 5,
        `${gameId}/${question.id}: invalid difficulty`);
      assert.equal(question.options?.length, 4, `${gameId}/${question.id}: not four options`);
      assert.equal(new Set(question.options.map(({ id }) => id)).size, 4, `${gameId}/${question.id}: duplicate option ids`);
      assert.equal(new Set(question.options.map(({ text }) => text.trim())).size, 4,
        `${gameId}/${question.id}: duplicate option text`);
      assert.ok(question.options.some(({ id }) => id === question.correctAnswer),
        `${gameId}/${question.id}: correct answer is not an option`);
    }

    // The selector must stop at the authored corpus boundary. It may never
    // repeat an entry merely to satisfy a larger requested count.
    const overRequested = getPsychologyQuestions(gameId, 12, bankSize + 1, []);
    assert.equal(overRequested.length, bankSize, `${gameId}: padded beyond authored bank`);
    assert.equal(new Set(overRequested.map(({ id }) => id)).size, bankSize, `${gameId}: padded duplicate ids`);
  }
});

test('the three repaired banks do not teach a correct-option position pattern', () => {
  for (const gameId of ['psy-018', 'psy-019', 'psy-020']) {
    const correctPositions = new Set(
      getPsychologyQuestions(gameId, 12, 30, []).map(({ correctAnswer }) => correctAnswer),
    );
    assert.deepEqual([...correctPositions].sort(), ['a', 'b', 'c', 'd'], gameId);
  }
});

test('the repaired banks do not reveal the answer through uniquely long correct choices', () => {
  const maxCorrectToLongestDistractorRatio = 1.35;
  for (const gameId of ['psy-018', 'psy-019', 'psy-020']) {
    for (const question of getPsychologyQuestions(gameId, 12, 30, [])) {
      const correctLength = question.options
        .find(({ id }) => id === question.correctAnswer).text.trim().length;
      const longestDistractor = Math.max(...question.options
        .filter(({ id }) => id !== question.correctAnswer)
        .map(({ text }) => text.trim().length));
      assert.ok(
        correctLength <= longestDistractor * maxCorrectToLongestDistractorRatio,
        `${gameId}/${question.id}: correct=${correctLength}, longest distractor=${longestDistractor}`,
      );
    }
  }
});
