import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

import {
  calculateEquity,
  evaluateHand,
  expandRangeToCombos,
  simulateRunouts,
} from '../src/lib/sandbox/EquityEngine.js';
import { EQUITY_WORKER_SOURCE } from '../src/lib/sandbox/equityWorkerSource.js';
import { gradeAction, parseActionLabel, sizeBucketFromPercent } from '../src/lib/sandbox/actionGrading.js';
import { parseHandHistory } from '../src/lib/sandbox/HandHistoryParser.js';
import { parseNativeSolverImport, NativeSolverImportError } from '../src/lib/sandbox/nativeSolverImport.mjs';
import { validateAndNormalizeScenario, ScenarioValidationError } from '../src/lib/sandbox/scenarioContract.mjs';
import {
  classifyHandAuditEligibility,
  computeStatsFromAuditHands,
  LEAK_PATTERNS,
  patternIsMeasured,
} from '../src/lib/personal-assistant/leakRecord.js';
import { buildCoachingSnapshot, buildTrainingPlan } from '../src/lib/personal-assistant/coachingIntelligence.mjs';
import { replayScenarioFromEntry } from '../src/components/sandbox/replayScenario.mjs';
import { computeHandState } from '../src/components/sandbox/actionEngine.mjs';

const sandboxSource = () => readFileSync(new URL('../pages/hub/personal-assistant/sandbox.js', import.meta.url), 'utf8');

test('native Sandbox runouts use every seated opponent in range and random-hand modes', async () => {
  const source = sandboxSource();
  const rangeStart = source.indexOf('  const equityRangeArg = useMemo(');
  const rangeEnd = source.indexOf('\n  const {\n    equity,', rangeStart);
  const effectStart = source.indexOf('  useEffect(() => {', source.indexOf('// ── Async Runout Simulation'));
  const effectEnd = source.indexOf('// ── Snapshot & Undo Helpers', effectStart);
  assert.ok(rangeStart >= 0 && rangeEnd > rangeStart && effectStart >= 0 && effectEnd > effectStart);

  for (const scenario of [
    { ranges: ['QQ', 'KK'], enabled: true, expected: { villains: ['QQ', 'KK'] } },
    { ranges: ['QQ', 'KK', 'JJ', 'TT', '99'], enabled: true, expected: { villains: ['QQ', 'KK', 'JJ', 'TT', '99'] } },
    { ranges: ['QQ', 'KK'], enabled: false, expected: { villains: [null, null] } },
    { ranges: ['QQ'], enabled: true, expected: 'QQ' },
    { ranges: ['QQ'], enabled: false, expected: null },
  ]) {
    const calls = [];
    const pending = [];
    const context = {
      useMemo: fn => fn(),
      useEffect: fn => fn(),
      activePlayBlock: null,
      villains: scenario.ranges.map(range => ({ range })),
      equityVsRange: scenario.enabled,
      resolvedVillainRanges: scenario.ranges,
      heroCardsMemo: ['As', 'Ad'],
      communityCards: ['Kh', '7c', '2d', '9c'],
      runoutReqIdRef: { current: 0 },
      makeAbortHandle: () => ({ signal: undefined, abort() {} }),
      setRunouts() {},
      setRunoutsComputing() {},
      isAbortError: () => false,
      simulateRunoutsAsync: (...args) => {
        calls.push(args);
        const result = Promise.resolve({ baseline: 4, distribution: [] });
        pending.push(result);
        return result;
      },
    };
    vm.runInNewContext(source.slice(rangeStart, rangeEnd) + source.slice(effectStart, effectEnd), context);
    await Promise.all(pending);
    assert.equal(calls.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(calls[0][3])), scenario.expected);
  }

  // An independent numerical witness makes this more than a prop-name test:
  // aces beat QQ on this turn, but must hit an ace to beat the second seat's set.
  const hero = ['As', 'Ad'];
  const board = ['Kh', '7c', '2d', '9c'];
  const headsUp = simulateRunouts(hero, board, 50, 'QQ', 123);
  const multiway = simulateRunouts(hero, board, 50, { villains: ['QQ', 'KK'] }, 123);
  assert.ok(headsUp.baseline > 90);
  assert.ok(multiway.baseline < 10);
  assert.deepEqual(multiway.bestCards.slice(0, 2).map(card => card.card).sort(), ['Ac', 'Ah']);
});

test('native Hand Replay restores its logged board, seats, position, stacks and pot/action state', () => {
  const source = sandboxSource();
  const recordStart = source.indexOf('  const recordExplorationSnapshot = useCallback(');
  const recordEnd = source.indexOf('// ── Table Card & Deal Interactions', recordStart);
  const restoreStart = source.indexOf('  const restoreScenario = useCallback(');
  const restoreEnd = source.indexOf('  const restoreScenarioRef = useRef(', restoreStart);
  const replayHandler = source.match(/onLoadScenario=\{\(entry\) => \{([\s\S]*?)\n          \}\}/);
  assert.ok(recordStart >= 0 && recordEnd > recordStart && restoreStart >= 0 && restoreEnd > restoreStart && replayHandler);

  const initial = {
    gameType: 'tournament', heroPosition: 'CO', heroStack: 85, potBase: 6.5,
    heroHand: { card1: 'As', card2: 'Ad' },
    board: { flop: ['Kh', '7c', '2d'], turn: '9c', river: '4s' },
    villains: [
      { id: 7, position: 'BB', stack: 95, range: 'QQ', archetype: { id: 'gto_neutral', name: 'GTO Neutral' } },
      { id: 9, position: 'SB', stack: 45, range: 'KK', archetype: { id: 'gto_neutral', name: 'GTO Neutral' } },
    ],
    actionHistory: [
      { street: 'flop', actorKey: 'hero', isHero: true, action: 'bet', amount: 5 },
      { street: 'flop', actorKey: 'villain_0', isVillain: true, action: 'call', amount: 5 },
    ],
    preflopPosts: [],
    authority: 'authored-sandbox-ungraded',
  };
  let log = [];
  const restored = {};
  const context = {
    useCallback: fn => fn,
    sandboxSnapshot: initial,
    heroHand: initial.heroHand,
    heroPosition: initial.heroPosition,
    heroStack: initial.heroStack,
    communityCards: ['Kh', '7c', '2d', '9c', '4s'],
    currentStreet: 'river',
    equity: { heroEquity: 4 },
    handState: { pot: 16.5 },
    actionHistory: initial.actionHistory,
    sessionStartedAtRef: { current: 1 },
    setSessionLog: update => { log = update(log); },
    pushUndo() {},
    POSITIONS: ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'],
    MAX_VILLAINS: 5,
    DEFAULT_VILLAINS: [{ id: 0, position: 'BB', stack: 100, range: '' }],
    withVillainIds: list => list,
    boardToArray: value => Array.isArray(value) ? value.filter(Boolean) : [...(value.flop || []), value.turn, value.river].filter(Boolean),
    pruneActionsToMaxVillains: actions => actions,
    replayScenarioFromEntry,
    toast: { success() {}, error(message) { assert.fail(message); } },
    setActiveVillainIdx() {},
    setReplayIndex() {},
  };
  for (const [setter, field] of Object.entries({
    setGameType: 'gameType', setHeroPosition: 'heroPosition', setHeroStack: 'heroStack',
    setPotBase: 'potBase', setHeroHand: 'heroHand', setBoard: 'board', setVillains: 'villains',
    setActionHistory: 'actionHistory', setPreflopPosts: 'preflopPosts',
  })) context[setter] = value => { restored[field] = value; };
  vm.runInNewContext(
    source.slice(restoreStart, restoreEnd) + source.slice(recordStart, recordEnd)
      + '\nrecordExplorationSnapshot("Logged For Replay");'
      + `\n((entry) => {${replayHandler[1]}})(globalThis.logEntry());`,
    { ...context, logEntry: () => log[0] },
  );
  assert.equal(log.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(restored)), {
    gameType: initial.gameType, heroPosition: initial.heroPosition, heroStack: initial.heroStack,
    potBase: initial.potBase, heroHand: initial.heroHand, board: initial.board,
    villains: initial.villains, actionHistory: initial.actionHistory, preflopPosts: initial.preflopPosts,
  });
  const replayedHand = computeHandState({
    ...restored, basePot: restored.potBase, actions: restored.actionHistory, street: 'river',
  });
  assert.equal(replayedHand.pot, 16.5, 'replaying must add the two recorded bets exactly once');
});

test('legacy replays restore display fields without stale wagers and reject impossible cards', () => {
  const legacy = {
    hand: 'AsAd', board: 'Kh 7c 2d 9c 4s', position: 'CO', stackDepth: 85, potSize: 16.5,
  };
  const restored = replayScenarioFromEntry(legacy);
  assert.deepEqual(restored.board, { flop: ['Kh', '7c', '2d'], turn: '9c', river: '4s' });
  assert.equal(restored.heroPosition, 'CO');
  assert.equal(restored.heroStack, 85);
  assert.equal(restored.potBase, 16.5);
  assert.deepEqual(restored.actionHistory, []);
  assert.deepEqual(restored.preflopPosts, []);
  assert.equal(restored.villains.length, 1);
  assert.equal(restored.authority, 'authored-sandbox-ungraded');
  assert.equal(replayScenarioFromEntry({ ...legacy, board: 'As 7c 2d' }), null);
  assert.equal(replayScenarioFromEntry({ ...legacy, hand: 'AsAs' }), null);
  assert.equal(replayScenarioFromEntry({ ...legacy, board: 'Kh 7c' }), null);
  assert.equal(replayScenarioFromEntry({ ...legacy, board: 'Invalid Board' }), null);
  assert.equal(replayScenarioFromEntry({ ...legacy, board: { flop: ['Kh', '7c', '2d'], turn: null, river: '4s' } }), null);
  assert.equal(replayScenarioFromEntry({ ...legacy, board: { flop: ['Kh', '7c'], turn: '9c', river: '4s' } }), null);
  assert.equal(replayScenarioFromEntry({ ...legacy, villains: [null] }), null);
  const missingBase = replayScenarioFromEntry({ ...legacy, potBase: null, actionHistory: [{ action: 'bet', amount: 5 }] });
  assert.equal(missingBase.potBase, 16.5);
  assert.deepEqual(missingBase.actionHistory, []);
});

function bootEquityWorkerVm() {
  const messages = [];
  const sandbox = {
    Math,
    Number,
    String,
    Array,
    Object,
    Set,
    Map,
    RegExp,
    Error,
    TypeError,
    RangeError,
    JSON,
    Int32Array,
    Uint8Array,
    Uint32Array,
    Float64Array,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    self: {
      postMessage(payload) {
        messages.push(payload);
      },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(EQUITY_WORKER_SOURCE, sandbox);
  assert.equal(messages[0]?.type, 'ready', 'worker must emit ready message on boot');

  let nextId = 1;
  return {
    call(op, payload) {
      const id = nextId++;
      sandbox.self.onmessage({ data: { id, op, ...payload } });
      const reply = messages.find(m => m.id === id);
      assert.ok(reply, `worker must reply to request ${id}`);
      if (!reply.ok) throw new Error(reply.error);
      return reply.result;
    },
  };
}

test('equityWorkerSource executes in VM with exact parity to EquityEngine.js', () => {
  const worker = bootEquityWorkerVm();

  const cases = [
    { hero: ['As', 'Ks'], board: ['Ah', '7d', '2c'], sims: 400, range: 'QQ+,AKs,AQs,KQs', seed: 1337 },
    { hero: ['as', 'ks'], board: ['ah', '7d', '2c'], sims: 400, range: 'TT-88,ATs-A8s', seed: 4242 },
    { hero: ['Qh', 'Jh'], board: ['Th', '9d', '2h', '3c'], sims: 350, range: null, seed: 9001 },
  ];

  for (const c of cases) {
    const engineRes = calculateEquity(c.hero, c.board, c.sims, c.range, c.seed);
    const workerRes = JSON.parse(JSON.stringify(worker.call('equity', c)));
    assert.deepEqual(workerRes, engineRes, `worker equity must match EquityEngine for ${c.hero.join('')}`);
  }

  const runoutEngine = simulateRunouts(['As', 'Kd'], ['Qh', 'Jc', '4s'], 60, 'QQ+,AQ+,KQs', 777);
  const runoutWorker = JSON.parse(JSON.stringify(worker.call('runouts', {
    hero: ['As', 'Kd'],
    board: ['Qh', 'Jc', '4s'],
    sims: 60,
    range: 'QQ+,AQ+,KQs',
    seed: 777,
  })));
  assert.deepEqual(runoutWorker, runoutEngine, 'worker runout simulation must match EquityEngine exactly');
});

test('range expansion handles dash ranges, blocker collisions, and rejects invalid pair suffixes', () => {
  const dead = new Set(['As', 'Kd']);
  const aces = expandRangeToCombos('AA', dead);
  // 4 choose 2 = 6 combos total; As blocks 3 of them => 3 combos remain.
  assert.equal(aces.length, 3);
  assert.ok(aces.every(([c1, c2]) => c1 !== 'As' && c2 !== 'As' && c1 !== c2));

  const dashPairs = expandRangeToCombos('99-77', new Set());
  assert.equal(dashPairs.length, 18, '99, 88, 77 = 3 * 6 = 18 combos');

  const dashSuited = expandRangeToCombos('ATs-A8s', new Set());
  assert.equal(dashSuited.length, 12, 'ATs, A9s, A8s = 3 * 4 = 12 combos');

  // Invalid pair suffixes (AAo, AAs) must produce 0 combos, never duplicate cards.
  assert.equal(expandRangeToCombos('AAo', new Set()).length, 0);
  assert.equal(expandRangeToCombos('AAs', new Set()).length, 0);

  // Hand evaluation ranks a royal flush above a wheel straight flush and quads.
  const royal = evaluateHand(['As', 'Ks', 'Qs', 'Js', 'Ts', '2d', '3c']);
  const wheelSf = evaluateHand(['5h', '4h', '3h', '2h', 'Ah', 'Kd', 'Qc']);
  const quads = evaluateHand(['Ad', 'Ac', 'Ah', 'As', 'Kd', '2c', '3d']);
  assert.ok(royal > wheelSf && wheelSf > quads);
});

test('actionGrading parses and grades check/fold/call/bet/raise/all-in consistently', () => {
  assert.equal(sizeBucketFromPercent(25), 'small');
  assert.equal(sizeBucketFromPercent(60), 'medium');
  assert.equal(sizeBucketFromPercent(85), 'large');
  assert.equal(sizeBucketFromPercent(110), 'pot');

  const parsedBet = parseActionLabel('Bet 75%');
  assert.equal(parsedBet.type, 'bet');
  assert.equal(parsedBet.size, 'medium');

  assert.equal(gradeAction('Bet 75%', 'Bet 75%'), true);
  assert.equal(gradeAction('Bet 33%', 'Bet 100%'), false);
  assert.equal(gradeAction('Fold', 'Raise 100%'), false);
  assert.equal(gradeAction('All-In', 'Shove'), true);
});

test('scenarioContract rejects duplicate card collisions and supports 3-way all-in closure', () => {
  assert.throws(
    () => validateAndNormalizeScenario({
      heroHand: { card1: 'As', card2: 'As' },
      board: { flop: ['Kd', '7c', '2h'], turn: null, river: null },
      heroPosition: 'BTN',
      heroStack: 100,
      potSize: 6.5,
      gameType: 'cash',
      villains: [{ position: 'BB', stack: 100 }],
      actionHistory: [],
    }),
    ScenarioValidationError,
    'duplicate hero cards must be rejected',
  );

  assert.throws(
    () => validateAndNormalizeScenario({
      heroHand: { card1: 'As', card2: 'Kd' },
      board: { flop: ['As', '7c', '2h'], turn: null, river: null },
      heroPosition: 'BTN',
      heroStack: 100,
      potSize: 6.5,
      gameType: 'cash',
      villains: [{ position: 'BB', stack: 100 }],
      actionHistory: [],
    }),
    ScenarioValidationError,
    'hero card colliding with board card must be rejected',
  );

  const threeWayAllIn = validateAndNormalizeScenario({
    heroHand: { card1: 'Ah', card2: 'Ad' },
    board: { flop: ['Ks', '7c', '2d'], turn: null, river: null },
    heroPosition: 'BTN',
    heroStack: 40,
    potSize: 120,
    gameType: 'cash',
    villains: [
      { position: 'UTG', stack: 40 },
      { position: 'CO', stack: 40 },
    ],
    actionHistory: [
      { street: 'preflop', position: 'UTG', action: 'allin', amount: 40 },
      { street: 'preflop', position: 'CO', action: 'allin', amount: 40 },
      { street: 'preflop', position: 'BTN', action: 'call', amount: 40 },
    ],
  });
  assert.equal(threeWayAllIn.actionHistory.length, 3);
  assert.equal(`${threeWayAllIn.heroHand.card1}${threeWayAllIn.heroHand.card2}`, 'AhAd');
});

test('HandHistoryParser and nativeSolverImport parse valid inputs and reject malformed payloads', () => {
  const psSample = [
    'PokerStars Hand #250000001: Hold\'em No Limit ($1/$2 USD) - 2026/11/24 12:00:00 ET',
    'Table \'Alpha\' 6-max Seat #1 is the button',
    'Seat 1: Hero ($200 in chips)',
    'Seat 2: Villain ($200 in chips)',
    'Hero: posts small blind $1',
    'Villain: posts big blind $2',
    '*** HOLE CARDS ***',
    'Dealt to Hero [As Ks]',
    'Hero: raises $4 to $6',
    'Villain: calls $4',
    '*** FLOP *** [Ah 7d 2c]',
    'Villain: checks',
    'Hero: bets $4',
    'Villain: folds',
    'Hero collected $12 from pot',
  ].join('\n');

  const parsed = parseHandHistory(psSample);
  assert.equal(parsed.success, true, 'PokerStars hand history must parse');
  assert.deepEqual(parsed.heroHand, { card1: 'As', card2: 'Ks' });

  const validImport = parseNativeSolverImport(JSON.stringify({
    provider: 'PioSOLVER',
    board: 'Ah 7d 2c',
    heroPosition: 'BTN',
    villainPosition: 'BB',
    potSize: 12,
    effectiveStack: 100,
    villainRange: 'QQ+,AKs,AQs',
  }), { fileName: 'pio-spot.json' });
  assert.equal(validImport.state.heroPosition, 'BTN');
  assert.equal(validImport.state.villains[0].position, 'BB');
  assert.equal(validImport.state.potSize, 12);

  assert.throws(
    () => parseNativeSolverImport('not valid solver data {{{', { fileName: 'bad.json' }),
    NativeSolverImportError,
  );
});

test('leakRecord excludes unsupported variants/special formats, separates Cash+Tournament, and computes real AF', () => {
  const heroId = '11111111-1111-4111-8111-111111111111';
  const villainId = '22222222-2222-4222-8222-222222222222';

  assert.equal(classifyHandAuditEligibility({ game_variant: 'plo5' }).eligible, false);
  assert.equal(classifyHandAuditEligibility({ game_variant: 'short_deck' }).eligible, false);
  assert.equal(classifyHandAuditEligibility({ game_variant: 'nlh', bomb_pot: { ante: 2 } }).reason, 'unsupported_special_format');
  assert.equal(classifyHandAuditEligibility({ game_variant: 'nlh', community_cards2: ['Ah', 'Kd', '2c'] }).reason, 'unsupported_special_format');
  assert.equal(classifyHandAuditEligibility({ game_variant: 'nlh', tournament_id: 't-1' }).format, 'tournament');
  assert.equal(classifyHandAuditEligibility({ game_variant: 'nlh', tournament_id: null }).format, 'cash');

  const makeHand = (id, overrides = {}) => ({
    id,
    game_variant: 'nlh',
    tournament_id: null,
    players: [{ userId: heroId, seat: 1 }, { userId: villainId, seat: 2 }],
    community_cards: ['Ah', '7d', '2c', '9s', '3h'],
    actions: [
      { street: 'preflop', playerId: heroId, action: 'raise', amount: 6 },
      { street: 'preflop', playerId: villainId, action: 'call', amount: 6 },
      { street: 'flop', playerId: villainId, action: 'bet', amount: 8 },
      { street: 'flop', playerId: heroId, action: 'call', amount: 8 },
      { street: 'turn', playerId: villainId, action: 'bet', amount: 16 },
      { street: 'turn', playerId: heroId, action: 'call', amount: 16 },
    ],
    ...overrides,
  });

  // 15 Cash NLH + 10 Tournament NLH + 2 PLO + 1 Bomb Pot = 25 eligible hands, 50 passive postflop calls, 0 bets => passive
  const hands = [];
  for (let i = 0; i < 15; i++) hands.push(makeHand(`cash-${i}`));
  for (let i = 0; i < 10; i++) hands.push(makeHand(`mtt-${i}`, { tournament_id: 'tourney-1' }));
  // Add 5 aggressive postflop actions so AF = 5 / 45 = 0.11 (< 1.5) over 50 postflop actions (>= 40)
  for (let i = 0; i < 5; i++) {
    hands[i].actions[3] = { street: 'flop', playerId: heroId, action: 'raise', amount: 20 };
  }
  hands.push(makeHand('plo-1', { game_variant: 'plo4' }));
  hands.push(makeHand('ofc-1', { game_variant: 'ofc' }));
  hands.push(makeHand('bomb-1', { bomb_pot: { multiplier: 4 } }));

  const stats = computeStatsFromAuditHands(hands, heroId);
  assert.equal(stats.handsPlayed, 25);
  assert.equal(stats.cashHands, 15);
  assert.equal(stats.tournamentHands, 10);
  assert.equal(stats.excludedUnsupportedHands, 2);
  assert.equal(stats.excludedSpecialFormatHands, 1);
  assert.equal(stats.postflopAggressiveActions, 5);
  assert.equal(stats.postflopPassiveActions, 45);
  assert.equal(stats.postflopActions, 50);
  assert.equal(stats.aggFactor, 0.11);
  assert.equal(patternIsMeasured(stats, 'passive_postflop'), true);
  assert.equal(LEAK_PATTERNS.passive_postflop.check(stats), true);
  assert.equal(LEAK_PATTERNS.over_aggressive_postflop.check(stats), false);

  // Zero postflop calls => aggFactor must be null (never Infinity or fabricated)
  const zeroCallStats = computeStatsFromAuditHands([
    makeHand('no-calls', {
      actions: [
        { street: 'preflop', playerId: heroId, action: 'raise', amount: 6 },
        { street: 'flop', playerId: heroId, action: 'bet', amount: 8 },
      ],
    }),
  ], heroId);
  assert.equal(zeroCallStats.aggFactor, null);
  assert.equal(patternIsMeasured(zeroCallStats, 'passive_postflop'), false);
});

test('buildTrainingPlan produces deterministic ordered modules with Cash/Tournament scope and mastery targets', () => {
  const now = Date.parse('2026-11-24T18:00:00.000Z');
  const leaks = [
    {
      id: 'leak-mtt-1',
      leak_type: 'solver_club_arena_mtt_001_flop_btn_cbet',
      leak_category: 'flop',
      situation_class: 'BTN Flop C-Bet In Tournaments',
      status: 'persistent',
      total_samples: 24,
      mistake_count: 10,
      avg_ev_loss_bb: 0.42,
      ev_loss_measured: true,
      recommended_drill: 'mtt-001',
    },
    {
      id: 'leak-cash-1',
      leak_type: 'overfolding_to_cbets',
      leak_category: 'flop',
      situation_class: 'Overfolding To C-Bets',
      status: 'emerging',
      total_samples: 60,
      mistake_count: 12,
      avg_ev_loss_bb: 0.14,
      ev_loss_measured: false,
      recommended_drill: 'cash-006',
    },
  ];
  const reviews = [
    { leak_id: 'leak-mtt-1', due_at: '2026-11-24T12:00:00.000Z', reps: 2, strong_streak: 2, retired: false },
  ];
  const decisions = [
    {
      hand_external_id: 'club-arena:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      decision_key: 'flop:1',
      game_id: 'mtt-001',
      street: 'flop',
      hero_position: 'BTN',
      spot_type: 'cbet',
      solver_verified: true,
      ev_loss_measured: true,
      ev_loss: 0.42,
      leak_id: 'leak-mtt-1',
    },
  ];

  const snapshot = buildCoachingSnapshot({ leaks, decisions, reviews, now });
  const plan = buildTrainingPlan({ leaks, decisions, reviews, coverage: snapshot.coverage, now });

  assert.equal(plan.version, 'pa-training-plan-v2');
  assert.equal(plan.totalModules, 2);
  assert.equal(plan.dueNowCount, 1);
  assert.equal(plan.modules[0].leakId, 'leak-mtt-1');
  assert.equal(plan.modules[0].formatScope, 'Tournament NLH');
  assert.equal(plan.modules[0].cadence, 'Review Due Today');
  assert.equal(plan.modules[0].mastery.currentStreak, 2);
  assert.equal(plan.modules[0].mastery.targetStreak, 4);
  assert.equal(plan.modules[0].mastery.remainingSessions, 2);
  assert.deepEqual(plan.modules[0].exampleHands, ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']);
  assert.equal(plan.modules[1].formatScope, 'Cash NLH');
  assert.deepEqual(snapshot.trainingPlan, plan);
});
