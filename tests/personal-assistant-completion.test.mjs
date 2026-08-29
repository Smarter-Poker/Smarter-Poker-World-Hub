import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  canonicalBoard,
  chooseTrainingCacheMatch,
  isCanonicalTrainingQuestion,
  mapTrainingQuestionToAnalysis,
} from '../src/lib/sandbox/trainingCacheSolver.mjs';

const canonicalQuestion = {
  source: 'DETERMINISTIC_SOLVER',
  heroHand: 'T9s',
  scenario: {
    heroHand: 'T9s',
    heroPosition: 'BTN',
    street: 'flop',
    board: 'Qc 5h 3s',
    stackDepth: 100,
  },
  options: [
    { id: 'b16', text: 'Bet 16%' },
    { id: 'c', text: 'Check' },
  ],
  gtoFrequencies: { c: 100, b16: 0 },
  evData: {
    heroHandEV: 0.43,
    optimalEV: 0.43,
    actionEVs: { c: 0.43, b16: 0.1 },
  },
  explanation: 'The canonical training solver checks this hand.',
};

test('canonical board parsing accepts strings and card arrays', () => {
  assert.equal(canonicalBoard('Qc 5h 3s'), '3s5hqc');
  assert.equal(canonicalBoard(['3s', 'Qc', '5h']), '3s5hqc');
});

test('only verified non-simulated training questions are solver evidence', () => {
  assert.equal(isCanonicalTrainingQuestion(canonicalQuestion), true);
  assert.equal(isCanonicalTrainingQuestion({ ...canonicalQuestion, source: 'GROK' }), false);
  assert.equal(isCanonicalTrainingQuestion({ ...canonicalQuestion, dataQuality: 'SIMULATED' }), false);
});

test('exact hand and board wins deterministically over a flop-only match', () => {
  const rows = [
    {
      question_id: 'later-flop-match',
      question_data: {
        ...canonicalQuestion,
        scenario: { ...canonicalQuestion.scenario, board: 'Qc 5h 3s 2d' },
      },
    },
    { question_id: 'exact-match', question_data: canonicalQuestion },
  ];
  const match = chooseTrainingCacheMatch(rows, {
    heroNotation: 'T9s',
    heroPosition: 'BTN',
    heroStack: 100,
    street: 'flop',
    boardCards: ['Qc', '5h', '3s'],
  });
  assert.equal(match.row.question_id, 'exact-match');
  assert.equal(match.matchTier, 1);
});

test('a different hero hand can never be used as solver evidence', () => {
  const match = chooseTrainingCacheMatch([
    { question_id: 'wrong-hand', question_data: { ...canonicalQuestion, heroHand: 'AKo', scenario: { ...canonicalQuestion.scenario, heroHand: 'AKo' } } },
  ], {
    heroNotation: 'T9s',
    heroPosition: 'BTN',
    street: 'flop',
    boardCards: ['Qc', '5h', '3s'],
  });
  assert.equal(match, null);
});

test('an open-action training node cannot grade a hand that is facing a bet', () => {
  const context = {
    heroNotation: 'T9s', heroPosition: 'BTN', street: 'flop',
    boardCards: ['Qc', '5h', '3s'], facingBet: true,
  };
  assert.equal(chooseTrainingCacheMatch([
    { question_id: 'open-node', question_data: canonicalQuestion },
  ], context), null);

  const facingQuestion = {
    ...canonicalQuestion,
    options: [{ id: 'f', text: 'Fold' }, { id: 'c', text: 'Call' }],
    gtoFrequencies: { f: 20, c: 80 },
    scenario: { ...canonicalQuestion.scenario, nodeType: 'hero_faces_bet' },
  };
  assert.equal(chooseTrainingCacheMatch([
    { question_id: 'facing-node', question_data: facingQuestion },
  ], context)?.row?.question_id, 'facing-node');
});

test('training frequencies and solver EV map to the Sandbox contract', () => {
  const result = mapTrainingQuestionToAnalysis(canonicalQuestion);
  assert.equal(result.optimalAction.id, 'c');
  assert.equal(result.optimalAction.label, 'Check');
  assert.equal(result.optimalAction.frequency, 100);
  assert.equal(result.actions.find(action => action.id === 'b16').ev, 0.1);
  assert.equal(result.ev.hero, 0.43);
  assert.equal(result.explanation, canonicalQuestion.explanation);
});

test('fractional frequency payloads normalize to percentages', () => {
  const result = mapTrainingQuestionToAnalysis({
    ...canonicalQuestion,
    gtoFrequencies: { c: 0.7, b16: 0.3 },
  });
  assert.equal(result.actions.find(action => action.id === 'c').frequency, 70);
  assert.equal(result.actions.find(action => action.id === 'b16').frequency, 30);
  assert.equal(result.isMixed, true);
});

test('wiring guards cover cached persistence, canonical source priority, and live stats', () => {
  const analyze = fs.readFileSync(new URL('../pages/api/assistant/sandbox/analyze.js', import.meta.url), 'utf8');
  const stats = fs.readFileSync(new URL('../pages/api/assistant/stats.js', import.meta.url), 'utf8');
  const hub = fs.readFileSync(new URL('../pages/hub/personal-assistant/index.js', import.meta.url), 'utf8');
  const hooks = fs.readFileSync(new URL('../src/hooks/useAssistant.js', import.meta.url), 'utf8');

  assert.ok(analyze.indexOf(".from('training_question_cache')") < analyze.indexOf(".from('solved_spots_gold')"));
  assert.match(analyze, /if \(cached[\s\S]+persistSandboxAnalysis\([\s\S]+cached\.data/);
  assert.doesNotMatch(stats, /sandbox_sessions!inner/);
  assert.doesNotMatch(hooks, /sandbox_results\s*\(/);
  assert.match(hooks, /resultsBySession/);
  assert.match(stats, /dataSources:[\s\S]+live_count/);
  assert.match(hub, /payload\?\.hand \|\| payload\?\.question/);
  assert.match(hub, /raw\.heroCards\.slice\(0, 2\)\.join\(''\)/);
});
