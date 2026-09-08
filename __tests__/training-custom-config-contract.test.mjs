import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  CustomTrainingConfigError,
  customTrainingAttemptConfig,
  customTrainingQuestionMatchesConfig,
  normalizeCustomTrainingConfig,
} from '../src/lib/training/customTrainerConfigContract.mjs';
import { enforceTrainingQuestionContract } from '../src/lib/training/questionContract.mjs';
import { trainingAttemptConfigHash } from '../src/lib/training/trainingAttemptDelivery.mjs';

const base = {
  gameType: 'cash',
  position: 'BTN',
  villainPosition: 'BB',
  actionScenario: 'SRP',
  stackDepth: 100,
  street: 'flop',
  handClass: 'all',
  boardTexture: 'any',
  spotType: 'any',
  questionsCount: 25,
};

test('custom config normalization has one strict canonical vocabulary', () => {
  const normalized = normalizeCustomTrainingConfig({
    ...base,
    gameType: ' CASH ',
    position: 'btn',
    villainPosition: 'bb',
    actionScenario: 'srp',
    stackDepth: '100',
    street: 'FLOP',
    questionsCount: '25',
  });
  assert.deepEqual(
    {
      gameType: normalized.gameType,
      position: normalized.position,
      villainPosition: normalized.villainPosition,
      actionScenario: normalized.actionScenario,
      stackDepth: normalized.stackDepth,
      street: normalized.street,
      questionsCount: normalized.questionsCount,
    },
    {
      gameType: 'cash',
      position: 'BTN',
      villainPosition: 'BB',
      actionScenario: 'SRP',
      stackDepth: 100,
      street: 'flop',
      questionsCount: 25,
    },
  );
  assert.equal(normalizeCustomTrainingConfig({ gameType: 'cash', position: 'ANY' }).position, 'any');
  assert.equal(normalizeCustomTrainingConfig({ gameType: 'cash', villainPosition: 'Any' }).villainPosition, 'any');
  assert.equal(normalizeCustomTrainingConfig({ gameType: 'cash', actionScenario: 'ANY' }).actionScenario, 'any');
});

test('every unsupported or ambiguous custom filter fails closed', () => {
  for (const override of [
    { gameType: 'omaha' },
    { position: 'dealer' },
    { villainPosition: 'BTN' },
    { stackDepth: '40junk' },
    { stackDepth: 30 },
    { street: 'preflop' },
    { actionScenario: '5BP' },
    { handClass: 'premium' },
    { boardTexture: 'wet' },
    { spotType: 'float' },
    { questionsCount: 20 },
    { position: ['BTN', 'CO'] },
  ]) {
    assert.throws(
      () => normalizeCustomTrainingConfig({ ...base, ...override }),
      (error) => error instanceof CustomTrainingConfigError
        && error.code === 'TRAINING_CUSTOM_CONFIG_INVALID',
      JSON.stringify(override),
    );
  }
});

test('every question-population field changes the immutable attempt hash', () => {
  const hash = (config = base, shared = {}) => trainingAttemptConfigHash(
    customTrainingAttemptConfig(config, { gameMode: 'full', handSelection: 'all', ...shared }),
  );
  const original = hash();
  for (const [label, config, shared] of [
    ['game type', { ...base, gameType: 'mtt' }],
    ['hero position', { ...base, position: 'CO' }],
    ['villain position', { ...base, villainPosition: 'SB' }],
    ['action scenario', { ...base, actionScenario: '3BP' }],
    ['stack depth', { ...base, stackDepth: 200 }],
    ['street', { ...base, street: 'turn' }],
    ['hand class', { ...base, handClass: 'pocket_pairs' }],
    ['board texture', { ...base, boardTexture: 'monotone' }],
    ['spot type', { ...base, spotType: 'facing_bet' }],
    ['hand count', { ...base, questionsCount: 50 }],
    ['game mode', base, { gameMode: 'spot' }],
    ['hand selection', base, { handSelection: 'close' }],
  ]) {
    assert.notEqual(hash(config, shared), original, label);
  }
});

test('built questions must match exact solver-authored custom filters', () => {
  const question = {
    boardCards: ['As', '7d', '2c'],
    scenario: {
      gameType: 'hu_cash',
      stackDepth: 100,
      street: 'flop',
      heroPosition: 'BTN',
      villainPosition: 'BB',
      scenarioHash: 'hu_cash_BTN_BB_100bb_cb_As7d2c',
      nodeType: 'hero_bets_or_checks',
      context: { potType: 'SRP', actionLine: 'c-bet' },
      solverSelectionContext: {
        actionScenario: 'SRP',
        spotType: 'cbet',
        source: 'strategy_matrix_v2.training_context',
      },
    },
  };
  assert.equal(customTrainingQuestionMatchesConfig(question, { ...base, spotType: 'cbet' }), true);
  assert.equal(customTrainingQuestionMatchesConfig(question, { ...base, position: 'CO' }), false);
  assert.equal(customTrainingQuestionMatchesConfig(question, { ...base, villainPosition: 'SB' }), false);
  assert.equal(customTrainingQuestionMatchesConfig(question, { ...base, stackDepth: 200 }), false);
  assert.equal(customTrainingQuestionMatchesConfig(question, { ...base, street: 'turn' }), false);
  assert.equal(customTrainingQuestionMatchesConfig(question, { ...base, actionScenario: '3BP' }), false);
  assert.equal(customTrainingQuestionMatchesConfig(question, { ...base, spotType: 'probe' }), false);
  assert.equal(customTrainingQuestionMatchesConfig(question, { ...base, handClass: 'suited_aces' }), false);
  assert.equal(customTrainingQuestionMatchesConfig(question, { ...base, boardTexture: 'dry_rainbow' }), true);
  assert.equal(customTrainingQuestionMatchesConfig(question, { ...base, boardTexture: 'monotone' }), false);
  assert.equal(customTrainingQuestionMatchesConfig({
    ...question,
    scenario: {
      ...question.scenario,
      solverSelectionContext: undefined,
      scenarioHash: 'hu_cash_BTN_BB_100bb_cb_As7d2c',
      context: { potType: 'SRP', actionLine: 'c-bet' },
    },
  }, { ...base, spotType: 'cbet' }), false, 'hash/prose inference is not solver-exact evidence');
});

test('question normalization preserves structured solver selection context', () => {
  const contracted = enforceTrainingQuestionContract({
    id: 'structured-context',
    question: 'You hold As Ks on Qh 7d 2c. What is your best action?',
    correctAnswer: 'x',
    options: [
      { id: 'x', text: 'Check' },
      { id: 'b25', text: 'Bet 25%' },
      { id: 'b50', text: 'Bet 50%' },
      { id: 'b75', text: 'Bet 75%' },
    ],
    scenario: {
      street: 'flop',
      heroPosition: 'BTN',
      villainPosition: 'BB',
      nodeType: 'hero_bets_or_checks',
      action: 'BB checks to BTN',
      context: { potType: 'SRP', actionLine: 'c-bet', gameFormat: 'Cash' },
      solverSelectionContext: { actionScenario: 'SRP', spotType: 'cbet' },
    },
  });
  assert.deepEqual(contracted.scenario.context, {
    potType: 'SRP',
    actionLine: 'c-bet',
    gameFormat: 'Cash',
  });
  assert.deepEqual(contracted.scenario.solverSelectionContext, {
    actionScenario: 'SRP',
    spotType: 'cbet',
  });
});

test('custom API applies exact filters without solver-state relabeling or broad fallback', () => {
  const source = readFileSync(
    new URL('../pages/api/training/custom-train.js', import.meta.url),
    'utf8',
  );
  assert.match(source, /normalizeCustomTrainingConfig\(/);
  assert.match(source, /customTrainingQuestionMatchesConfig\(contractedQuestion, customConfig\)/);
  assert.match(source, /customTrainingAttemptConfig\(customConfig, deliveryContext\)/);
  assert.match(source, /applyDeterministicEnginePatches\(engine\)/);
  assert.match(source, /new SolverPolicyService\(\{ db: getSupabase\(\) \}\)/);
  assert.match(source, /readSolvedRows\(\{/);
  assert.doesNotMatch(source, /\.from\(['"]solved_spots_gold['"]\)/);
  assert.doesNotMatch(source, /%_\$\{safeVillainPosition\}_%/);
  assert.match(source, /usedDecisionKeys/);
  assert.match(source, /question\?\.solverProvenance\?\.verified === true/);
  assert.match(source, /TRAINING_CUSTOM_EXACT_MATCH_UNAVAILABLE/);
  assert.match(source, /TRAINING_CUSTOM_EXACT_MATCH_SHORTFALL/);
  assert.match(source, /recordServed: false/);
  assert.match(source, /recordTrainingQuestionsServedForAttempt\(getSupabase\(\)/);
  assert.ok(
    source.indexOf('recordTrainingQuestionsServedForAttempt(getSupabase()')
      < source.indexOf('return res.status(200).json({'),
    'the signed custom manifest must be audited before it is returned',
  );
  assert.doesNotMatch(source, /trying broader search/i);
  assert.doesNotMatch(source, /question\.scenario\.heroPosition\s*=/);
  assert.doesNotMatch(source, /question\.scenario\.(?:stackDepth|heroStack|villainStack)\s*=/);
});
