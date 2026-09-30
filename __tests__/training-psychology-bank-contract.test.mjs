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

const AUDITED_COMPOUND_ANSWERS = {
  'psych_psy-001_6': 'Desperation tilt; restore standard ranges immediately or quit',
  'psych_psy-003_4': 'Recency bias; recalibrate with actual frequencies',
  'psych_psy-004_0': 'Cash-value thinking; refocus on big blinds and decision quality',
  'psych_psy-005_7': 'Fatigue is eroding standards; use written ranges or end the session',
  'psych_psy-006_0': 'Put the phone away and block distracting sites',
  'psych_psy-006_4': 'A 10-15 minute warm-up with review, visualization, and settling',
  'psych_psy-008_1': 'Earned confidence rests on skill; false confidence rests on recent results',
  'psych_psy-008_2': 'Keep acting on strong reads; demand better evidence for thin ones',
  'psych_psy-009_1': 'Fear of embarrassment; judge the bluff by decision quality, not outcome',
  'psych_psy-009_6': 'He cedes range EV and rehearses the belief that he cannot compete',
  'psych_psy-010_2': 'Fixed mindset defends identity; growth mindset uses the leak to improve',
  'psych_psy-010_6': 'It shields mistakes from review, so real leaks remain uncorrected',
  'psych_psy-010_7': 'Keep seeking outside feedback because winning does not reveal blind spots',
  'psych_psy-011_2': 'Plan sleep, meals, water, movement, breaks, and late-stage caffeine',
  'psych_psy-012_1': 'Instinct is trained pattern recognition; impulse is emotion bypassing analysis',
  'psych_psy-012_7': 'Pre-built ranges, rehearsed rules, and study of similar spots',
  'psych_psy-013_4': 'A staged signal; discount it and trust hard-to-fake betting patterns',
  'psych_psy-013_7': 'Use baseline strategy and population data; resist stereotypes and one-hand reads',
  'psych_psy-014_3': 'A bounded experiment with fixed buy-ins, stop-loss, and preplanned retreat',
  'psych_psy-014_6': 'Top-heavy payouts mean long droughts; deep rolls fund and steady them',
  'psych_psy-015_2': 'Hot-hand fallacy; obeying it loosens standards and creates worse decisions',
  'psych_psy-015_5': 'Bank the score, keep proven stakes and routines, and move up only on evidence',
  'psych_psy-017_6': 'Expose blind spots, test reasoning aloud, and provide accountability',
};

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

test('every dedicated bank balances deterministic correct slots and remaps grading frequencies', () => {
  for (const gameId of DEDICATED_SCENARIO_GAMES) {
    const questions = getPsychologyQuestions(gameId, 12, 30, []);
    const counts = Object.fromEntries(['a', 'b', 'c', 'd'].map((id) => [id, 0]));
    for (const question of questions) {
      counts[question.correctAnswer] += 1;
      assert.deepEqual(Object.keys(question.gtoFrequencies).sort(), ['a', 'b', 'c', 'd']);
      assert.equal(question.gtoFrequencies[question.correctAnswer], 100, `${gameId}/${question.id}`);
      assert.equal(Object.values(question.gtoFrequencies).filter((value) => value === 0).length, 3,
        `${gameId}/${question.id}`);
    }
    assert.deepEqual(Object.keys(counts).filter((id) => counts[id] > 0).sort(), ['a', 'b', 'c', 'd'], gameId);
    assert.ok(Math.max(...Object.values(counts)) - Math.min(...Object.values(counts)) <= 1,
      `${gameId}: ${JSON.stringify(counts)}`);
  }
});

test('the canonical mapping for psych_psy-001_0 remains pinned', () => {
  const question = getPsychologyQuestions('psy-001', 12, 30, [])
    .find(({ id }) => id === 'psych_psy-001_0');

  assert.deepEqual({
    id: question.id,
    options: question.options,
    correctAnswer: question.correctAnswer,
    gtoFrequencies: question.gtoFrequencies,
  }, {
    id: 'psych_psy-001_0',
    options: [
      { id: 'a', text: 'Tighten up to only premium hands until the feeling passes on its own' },
      { id: 'b', text: 'Take a deep breath, name the emotion' },
      { id: 'c', text: 'Play the next few hands faster to get past the bad memory quickly' },
      { id: 'd', text: 'Immediately move up a stake where players respect your raises more' },
    ],
    correctAnswer: 'b',
    gtoFrequencies: { a: 0, b: 100, c: 0, d: 0 },
  });
});

test('no dedicated bank reveals the answer through an extreme length outlier', () => {
  const maxCorrectToLongestDistractorRatio = 1.35;
  const minCorrectToMedianDistractorRatio = 0.45;
  for (const gameId of DEDICATED_SCENARIO_GAMES) {
    for (const question of getPsychologyQuestions(gameId, 12, 30, [])) {
      const correctLength = question.options
        .find(({ id }) => id === question.correctAnswer).text.trim().length;
      const longestDistractor = Math.max(...question.options
        .filter(({ id }) => id !== question.correctAnswer)
        .map(({ text }) => text.trim().length));
      const sortedDistractorLengths = question.options
        .filter(({ id }) => id !== question.correctAnswer)
        .map(({ text }) => text.trim().length)
        .sort((left, right) => left - right);
      const medianDistractor = sortedDistractorLengths[1];
      assert.ok(
        correctLength <= longestDistractor * maxCorrectToLongestDistractorRatio,
        `${gameId}/${question.id}: correct=${correctLength}, longest=${longestDistractor}`,
      );
      assert.ok(
        correctLength >= medianDistractor * minCorrectToMedianDistractorRatio,
        `${gameId}/${question.id}: correct=${correctLength}, median=${medianDistractor}`,
      );
    }
  }
});
test('audited compound answers preserve the complete action or contrast', () => {
  const allQuestions = new Map(DEDICATED_SCENARIO_GAMES.flatMap((gameId) =>
    getPsychologyQuestions(gameId, 12, 30, []).map((question) => [question.id, question])));

  for (const [questionId, expectedAnswer] of Object.entries(AUDITED_COMPOUND_ANSWERS)) {
    const question = allQuestions.get(questionId);
    assert.ok(question, `${questionId}: missing audited question`);
    assert.equal(
      question.options.find(({ id }) => id === question.correctAnswer)?.text,
      expectedAnswer,
      `${questionId}: audited compound answer was shortened or changed`,
    );
  }
});

test('WH questions use direct answers rather than yes-or-no fragments', () => {
  for (const gameId of DEDICATED_SCENARIO_GAMES) {
    for (const question of getPsychologyQuestions(gameId, 12, 30, [])) {
      if (!/^(what|which|how|why|when|where)\b/i.test(question.question.trim())) continue;
      const correctText = question.options
        .find(({ id }) => id === question.correctAnswer)?.text.trim() || '';
      assert.doesNotMatch(correctText, /^(yes|no)\b[,;:]?/i, `${gameId}/${question.id}`);
    }
  }
});

test('option text, ids and grading stay stable across level, repetition and seen-id filtering', () => {
  const mapping = (questions) => questions
    .map(({ id, options, correctAnswer, gtoFrequencies }) => ({
      id,
      options,
      correctAnswer,
      gtoFrequencies,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  for (const gameId of DEDICATED_SCENARIO_GAMES) {
    const baseline = getPsychologyQuestions(gameId, 12, 30, []);
    const seenIds = baseline.slice(0, 11).map(({ id }) => id);
    assert.deepEqual(mapping(getPsychologyQuestions(gameId, 12, 30, [])), mapping(baseline),
      `${gameId}: repeat drift`);
    assert.deepEqual(mapping(getPsychologyQuestions(gameId, 1, 30, [])), mapping(baseline),
      `${gameId}: level drift`);
    assert.deepEqual(mapping(getPsychologyQuestions(gameId, 12, 30, seenIds)), mapping(baseline),
      `${gameId}: seen-id drift`);
  }
});
