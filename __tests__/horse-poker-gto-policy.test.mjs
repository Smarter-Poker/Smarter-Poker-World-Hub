import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  analyzeBlockers,
  analyzeBoardTexture,
  calculatePotGeometry,
  getCacheStats,
  getPostflopStrategy,
  getPreflopPolicy,
  getStackDepthStrategy,
  makeGTODecision,
} from '../src/lib/poker-engine/brain/HorsePokerGTO.js';
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

test('brain barrel wires the production live observer before exporting the router', () => {
  const indexSource = fs.readFileSync('src/lib/poker-engine/brain/index.js', 'utf8');
  const routerSource = fs.readFileSync('src/lib/poker-engine/brain/router.js', 'utf8');
  const holdemSource = fs.readFileSync('src/lib/poker-engine/brain/holdem-brain.js', 'utf8');
  const injection = indexSource.indexOf(
    'router.setRouterLiveReadFn(liveObserver.getLiveRead);',
  );
  const exportsStart = indexSource.indexOf('module.exports = {');

  assert.ok(injection >= 0, 'the brain barrel must inject liveObserver.getLiveRead');
  assert.ok(exportsStart > injection, 'observer injection must happen before barrel exports');
  assert.doesNotMatch(routerSource, /not yet extracted|safe fallback/i);
  assert.doesNotMatch(holdemSource, /not yet extracted|\bstub\b/i);
});

test('HorsePokerGTO blocker and pot-geometry helpers handle postflop and lowercase streets accurately', () => {
  // Preflop empty board guard must not push cards into blocksOverpairs
  const preflopBlockers = analyzeBlockers(['As', 'Kh'], []);
  assert.equal(preflopBlockers.blocksNutFlush, false);
  assert.equal(preflopBlockers.blocksNutStraight, false);
  assert.deepEqual(preflopBlockers.blocksOverpairs, []);

  // Nut flush + nut straight + top set blocker detection on connected two-tone board
  const postflopBlockers = analyzeBlockers(['As', 'Qc'], ['Js', 'Ts', '9d']);
  assert.equal(postflopBlockers.blocksNutFlush, true, 'As blocks nut spade flush on two-spade flop');
  assert.equal(postflopBlockers.blocksNutStraight, true, 'Qc/As blocks top of J-T-9 straight window');
  assert.ok(postflopBlockers.bluffValue >= 25);

  // Top set vs lower set blocker distinction
  const topSetBlocker = analyzeBlockers(['Kh', '4d'], ['Ks', '7c', '2d']);
  assert.equal(topSetBlocker.blocksTopSet, true);
  const bottomSetBlocker = analyzeBlockers(['2h', '4d'], ['Ks', '7c', '2d']);
  assert.equal(bottomSetBlocker.blocksTopSet, false);
  assert.equal(bottomSetBlocker.blocksSets, true);

  // Case-insensitive street handling in calculatePotGeometry
  const flopGeoLower = calculatePotGeometry(10, 90, 'flop');
  const flopGeoUpper = calculatePotGeometry(10, 90, 'Flop');
  assert.equal(flopGeoLower.streetsLeft, 3);
  assert.equal(flopGeoLower.geometricSize, flopGeoUpper.geometricSize);

  const turnGeoLower = calculatePotGeometry(20, 60, 'turn');
  assert.equal(turnGeoLower.streetsLeft, 2);

  const tex = analyzeBoardTexture(['Qs', 'Js', '2d']);
  assert.equal(tex.flushPossibility, 'backdoor');
  assert.equal(getStackDepthStrategy(8).mode, 'push_fold');
  const cacheStats = getCacheStats();
  assert.equal(typeof cacheStats.size, 'number');
  assert.equal(cacheStats.max, 200);
});

test('Training StrategyExplainer, FeedbackCard, Replay, and UDT integrate HorsePokerGTO skills', () => {
  const explainer = fs.readFileSync('src/engines/StrategyExplainer.js', 'utf8');
  const feedbackCard = fs.readFileSync('src/components/training/FeedbackCard.tsx', 'utf8');
  const replay = fs.readFileSync('src/components/training/SolverComparisonReplay.jsx', 'utf8');
  const udt = fs.readFileSync('src/components/training/games/UniversalDynamicTable.jsx', 'utf8');

  assert.match(explainer, /from '\.\.\/lib\/poker-engine\/brain\/HorsePokerGTO\.js'/);
  assert.match(explainer, /analyzeBlockers\(holeCards, board\)/);
  assert.match(explainer, /calculatePotGeometry\(numericPot, numericStack, street/);
  assert.match(explainer, /horseBrainAnalysis/);

  assert.match(feedbackCard, /strategyInsight\?\.horseBrainAnalysis/);
  assert.doesNotMatch(feedbackCard, /case 'All-In': return '<img /);

  assert.match(replay, /solverPolicy: handData\.solverPolicy \|\| null/);
  assert.match(udt, /HORSE BRAIN GTO:/);
});
