import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  getPostflopStrategy,
  getPreflopPolicy,
  makeGTODecision,
} from '../src/content-engine/services/HorsePokerGTO.js';
import { SolverPolicyService } from '../src/services/SolverPolicyService.js';

const chartRow = {
  chart_id: 'horse-chart',
  game_type: 'Tournament',
  stack_depth: 10,
  hero_position: 'BTN',
  villain_action: 'fold_to_hero',
  created_at: '2026-09-06T12:00:00.000Z',
  hand_matrix: { AA: { push: 1, fold: 0 } },
};

test('horse preflop consumer returns the canonical audited chart envelope', async () => {
  const service = new SolverPolicyService({ chartRowReader: async () => [chartRow] });
  const policy = await getPreflopPolicy({
    gameType: 'Tournament', heroPosition: 'BTN', stackDepth: 10,
    villainAction: 'fold_to_hero',
  }, service);
  assert.equal(policy.kind, 'chart');
  assert.equal(policy.qualitySeal, 'CHART_AUDITED');
  assert.deepEqual(policy.rangeDistribution.AA, { all_in: 1, fold: 0 });
  assert.deepEqual(policy.rangeDistribution['72o'], { all_in: 0, fold: 1 });
});

test('live horse decision uses the chart only for a proved folded-to-hero push/fold node', async () => {
  let reads = 0;
  const service = new SolverPolicyService({
    chartRowReader: async () => {
      reads += 1;
      return [chartRow];
    },
  });
  const base = {
    holeCards: ['As', 'Ah'], board: [], street: 'Preflop', position: 'BTN',
    stackBB: 10, potSize: 3, toCall: 2, currentBet: 2, bb: 2,
    gameType: 'Tournament', topology: '6-Max', mode: 'ChipEV',
    legalActions: [{ type: 'fold' }, { type: 'call' }, { type: 'raise', maxAmount: 20 }],
    players: [
      { id: 'horse', position: 'BTN', stack: 20, invested: 0, folded: false, allIn: false },
      { id: 'small', position: 'SB', stack: 19, invested: 1, folded: false, allIn: false },
      { id: 'big', position: 'BB', stack: 18, invested: 2, folded: false, allIn: false },
    ],
  };
  const decision = await makeGTODecision('horse', base, service);
  assert.equal(decision.action, 'All-In');
  assert.equal(decision.reasoning.policyKind, 'chart');
  assert.equal(reads, 1);

  const limped = await makeGTODecision('horse', {
    ...base,
    players: [
      ...base.players,
      { id: 'limper', position: 'MP', stack: 18, invested: 2, folded: false, allIn: false },
    ],
  }, service);
  assert.equal(limped.action, null);
  assert.equal(reads, 1, 'unsupported limped node must not query an open-jam chart');
});

test('postflop consumer resolves and labels a canonical policy instead of returning a stub', async () => {
  const exact = JSON.parse(fs.readFileSync(
    'contracts/solver-policy/fixtures/exact-policy.v1.json', 'utf8',
  ));
  const base = new SolverPolicyService();
  let consumer = null;
  let resolveCalls = 0;
  const service = {
    createKey: (input) => base.createKey(input),
    resolve: async () => {
      resolveCalls += 1;
      return { answer: exact, record: null, chart: null };
    },
    consumerEnvelope: (answer, label) => {
      consumer = label;
      return base.consumerEnvelope(answer, label);
    },
  };
  const policy = await getPostflopStrategy({
    board: ['Jh', '7d', '2c'], holeCards: ['As', 'Ks'], street: 'flop',
    stackDepth: 100, gameType: 'Cash', topology: 'Heads-Up', mode: 'ChipEV',
    position: 'BB', numPlayers: 2, bb: 2,
    players: [
      { id: 'horse', position: 'BB', stack: 200, invested: 0, folded: false, allIn: false },
      { id: 'villain', position: 'BTN', stack: 200, invested: 0, folded: false, allIn: false },
    ],
    legalActions: [{ type: 'check', amount: 0 }, { type: 'bet', amount: 525 }],
  }, service);
  assert.equal(resolveCalls, 1);
  assert.equal(consumer, 'horse-poker-gto');
  assert.equal(policy.kind, 'exact');
});

test('horse cache warm-up requests real canonical chart nodes, not nonexistent legacy charts', () => {
  const source = fs.readFileSync('src/lib/poker-engine/brain/session-analytics.js', 'utf8');
  const warmup = source.slice(
    source.indexOf('async function warmGTOCache()'),
    source.indexOf('async function canRebuy'),
  );
  assert.match(warmup, /getPreflopPolicy\(target\)/);
  assert.match(warmup, /villainAction: 'fold_to_hero'/);
  assert.match(warmup, /villainAction: 'sb_push'/);
  assert.match(warmup, /\['Cash', 'Tournament'\]/);
  assert.doesNotMatch(warmup, /getPreflopRange\(|chartName\s*=|stackDepth:\s*100/);
  assert.match(warmup, /policy\?\.kind === 'chart'/);
});
