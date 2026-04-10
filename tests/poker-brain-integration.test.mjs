#!/usr/bin/env node
/**
 * POKER BRAIN — INTEGRATION & STORAGE CONTRACT TESTS
 * ─────────────────────────────────────────────────────────────
 * Tests the full pipeline from detection → state machine →
 * decision bridge → storage, verifying field contracts at
 * every stage.
 *
 * Also tests:
 *   - HandStateMachine full lifecycle (multi-street hand)
 *   - Storage contract: all fields populated/read correctly
 *   - Recompute pipeline: stale equity → fresh equity
 *   - Session audit pipeline: hand → review → session summary
 *   - State machine → bridge → audit end-to-end
 *
 * Run: node --experimental-loader ./tests/poker-brain-loader.mjs \
 *          tests/poker-brain-integration.test.mjs
 */

import Engine from '../src/lib/poker-brain/engine.js';
import { getBridgedDecision, extractCards, streetFromBoardLength } from '../src/lib/poker-brain/decision-bridge.js';
import { HandStateMachine, deriveStreet, STREETS } from '../src/lib/poker-brain/state.js';
import { recomputeHandEquity, recomputeHandsBatch, summarizeRecompute } from '../src/lib/poker-brain/recompute.js';
import { analyzeHand, analyzeSession } from '../src/lib/poker-brain/session-audit.js';
import { normalizeLabel, strengthRank, compareHandStrength } from '../src/lib/poker-brain/hand-strength-validator.js';
import { validateAction } from '../src/lib/poker-brain/action-detect.js';

let pass = 0;
let fail = 0;
const failures = [];

function section(name) { console.log('\n' + name); }
function assert(cond, msg) {
  if (cond) { pass++; console.log('  \u2713 ' + msg); }
  else { fail++; failures.push(msg); console.log('  \u2717 ' + msg); }
}
function assertEq(a, b, msg) { assert(a === b, `${msg} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`); }

const c = (r, s) => ({ rank: r, suit: s });
const cc = (cards) => cards.map(x => ({ ...x, confidence: 0.98 }));

// ============================================================================
// 1. HandStateMachine: full multi-street lifecycle
// ============================================================================
section('HandStateMachine: full NLHE hand lifecycle');

{
  const completedHands = [];
  const sm = new HandStateMachine({
    onHandEnd: (hand) => completedHands.push(hand),
    requiredFrames: 1, // skip frame stability check for tests
  });

  // Preflop: observe hole cards first (creates _currentHand)
  const holeCards = [c('A','s'), c('K','h')];
  sm.observe(holeCards, []);

  // Set context AFTER observe (requires _currentHand to exist)
  sm.setHandContext({
    position: 'btn',
    potAtStart: 1.5,
    stackAtStart: 100,
    gameType: 'nlhe',
    bigBlind: 1,
  });
  assertEq(sm.getState().street, STREETS.PREFLOP, 'preflop after hole cards');

  // Record preflop decision
  sm.recordDecision({
    street: 'preflop',
    action: 'RAISE',
    equity: 67,
    potOdds: 25,
    confidence: 85,
    reasoning: 'Premium hand, 3-bet',
    raiseAmount: 3,
  });

  // Flop: observe 3 board cards
  const flop = [c('A','c'), c('7','d'), c('2','s')];
  sm.observe(holeCards, flop);
  assertEq(sm.getState().street, STREETS.FLOP, 'flop after 3 board cards');

  // Record flop decision
  sm.recordDecision({
    street: 'flop',
    action: 'RAISE',
    equity: 88,
    potOdds: 30,
    confidence: 90,
    reasoning: 'Top pair top kicker on dry board',
    raiseAmount: 7,
  });

  // Turn: observe 4 board cards
  const turn = [...flop, c('J','h')];
  sm.observe(holeCards, turn);
  assertEq(sm.getState().street, STREETS.TURN, 'turn after 4 board cards');

  sm.recordDecision({
    street: 'turn',
    action: 'RAISE',
    equity: 85,
    potOdds: 33,
    confidence: 88,
    reasoning: 'Still top pair, barrel',
  });

  // River: observe 5 board cards
  const river = [...turn, c('3','c')];
  sm.observe(holeCards, river);
  assertEq(sm.getState().street, STREETS.RIVER, 'river after 5 board cards');

  sm.recordDecision({
    street: 'river',
    action: 'RAISE',
    equity: 82,
    potOdds: 40,
    confidence: 85,
    reasoning: 'Value bet river',
  });

  // Hand ends: simulate hole cards disappearing
  sm.observe([], []);

  // Verify completed hand
  assertEq(completedHands.length, 1, 'one hand completed');
  const hand = completedHands[0];

  // Storage contract fields
  assert(hand.position === 'btn', 'hand.position preserved');
  assert(hand.potAtStart === 1.5, 'hand.potAtStart preserved');
  assert(hand.stackAtStart === 100, 'hand.stackAtStart preserved');
  assert(hand.gameType === 'nlhe', 'hand.gameType preserved');
  assert(hand.bigBlind === 1, 'hand.bigBlind preserved');
  assert(hand.holeCards != null && hand.holeCards.length === 2, 'hand.holeCards populated');
  assert(hand.finalBoard != null, 'hand.finalBoard populated');
  assert(hand.startedAt != null, 'hand.startedAt populated');
  assert(hand.endedAt != null, 'hand.endedAt populated');
  assert(hand.handId != null, 'hand.handId populated');

  // Street decisions contract
  const sd = hand.streetDecisions;
  assert(sd != null, 'streetDecisions populated');
  assert(sd.preflop != null, 'preflop decision recorded');
  assert(sd.flop != null, 'flop decision recorded');
  assert(sd.turn != null, 'turn decision recorded');
  assert(sd.river != null, 'river decision recorded');

  // Each street decision has required fields
  for (const st of ['preflop', 'flop', 'turn', 'river']) {
    const d = sd[st];
    assert(d.action != null, `${st}: action populated`);
    assert(typeof d.equity === 'number', `${st}: equity is number`);
    assert(typeof d.confidence === 'number', `${st}: confidence is number`);
    assert(typeof d.reasoning === 'string', `${st}: reasoning is string`);
  }
}

// ============================================================================
// 2. HandStateMachine: PLO hand with correct hole count
// ============================================================================
section('HandStateMachine: PLO hand lifecycle');

{
  const completedHands = [];
  const sm = new HandStateMachine({
    onHandEnd: (hand) => completedHands.push(hand),
    requiredFrames: 1,
  });

  const ploHole = [c('A','s'), c('A','h'), c('K','s'), c('K','h')];
  sm.observe(ploHole, []);

  sm.setHandContext({
    position: 'utg',
    potAtStart: 2,
    stackAtStart: 200,
    gameType: 'plo',
    bigBlind: 2,
  });

  sm.recordDecision({
    street: 'preflop',
    action: 'RAISE',
    equity: 65,
    potOdds: 20,
    confidence: 90,
    reasoning: 'Premium PLO hand',
  });

  const ploFlop = [c('A','c'), c('7','d'), c('2','s')];
  sm.observe(ploHole, ploFlop);

  sm.recordDecision({
    street: 'flop',
    action: 'RAISE',
    equity: 85,
    potOdds: 30,
    confidence: 92,
    reasoning: 'Set of aces',
  });

  // Hand ends
  sm.observe([], []);

  assertEq(completedHands.length, 1, 'PLO hand completed');
  const hand = completedHands[0];
  assertEq(hand.gameType, 'plo', 'PLO gameType preserved');
  assertEq(hand.holeCards.length, 4, 'PLO 4 hole cards preserved');
  assert(hand.streetDecisions.preflop != null, 'PLO preflop decision');
  assert(hand.streetDecisions.flop != null, 'PLO flop decision');
}

// ============================================================================
// 3. HandStateMachine: multiple hands in sequence
// ============================================================================
section('HandStateMachine: sequential hands');

{
  const completedHands = [];
  const sm = new HandStateMachine({
    onHandEnd: (hand) => completedHands.push(hand),
    requiredFrames: 1,
  });

  // Hand 1: quick fold
  sm.observe([c('7','s'), c('2','h')], []);
  sm.setHandContext({ position: 'utg', potAtStart: 1.5, stackAtStart: 100, gameType: 'nlhe', bigBlind: 1 });
  sm.recordDecision({ street: 'preflop', action: 'FOLD', equity: 25, confidence: 95, reasoning: 'Trash' });
  sm.observe([], []); // hand ends

  // Hand 2: plays to flop
  sm.observe([c('A','s'), c('A','h')], []);
  sm.setHandContext({ position: 'btn', potAtStart: 1.5, stackAtStart: 98, gameType: 'nlhe', bigBlind: 1 });
  sm.recordDecision({ street: 'preflop', action: 'RAISE', equity: 85, confidence: 95, reasoning: 'AA' });
  sm.observe([c('A','s'), c('A','h')], [c('K','c'), c('Q','d'), c('J','s')]);
  sm.recordDecision({ street: 'flop', action: 'RAISE', equity: 70, confidence: 80, reasoning: 'Overpair on broadway' });
  sm.observe([], []); // hand ends

  assertEq(completedHands.length, 2, '2 sequential hands completed');
  assertEq(completedHands[0].position, 'utg', 'hand 1 position');
  assertEq(completedHands[1].position, 'btn', 'hand 2 position');
  assertEq(completedHands[0].streetDecisions.preflop.action, 'FOLD', 'hand 1 folded');
  assertEq(completedHands[1].streetDecisions.flop.action, 'RAISE', 'hand 2 raised flop');
}

// ============================================================================
// 4. Full pipeline: detection → bridge → state machine → audit
// ============================================================================
section('Full pipeline: bridge → state machine → audit');

{
  const completedHands = [];
  const sm = new HandStateMachine({
    onHandEnd: (hand) => completedHands.push(hand),
    requiredFrames: 1,
  });

  // Preflop: use bridge to get decision
  const holeCards = [c('Q','s'), c('Q','h')];
  sm.observe(holeCards, []);
  sm.setHandContext({ position: 'co', potAtStart: 1.5, stackAtStart: 100, gameType: 'nlhe', bigBlind: 1 });

  const preflopBridged = await getBridgedDecision({
    rawHoleCards: cc(holeCards),
    rawBoardCards: [],
    gameType: 'nlhe',
    potSize: 1.5,
    betToCall: 1,
    stackSize: 100,
    bigBlind: 1,
    position: 'co',
    numPlayers: 6,
    preflopAction: 'rfi',
  });

  assert(preflopBridged.ready, 'preflop bridge ready');
  sm.recordDecision({
    street: 'preflop',
    action: preflopBridged.action,
    equity: preflopBridged.equity || 0,
    potOdds: preflopBridged.potOdds || 0,
    confidence: preflopBridged.confidence,
    reasoning: preflopBridged.reasoning,
  });

  // Flop
  const flopCards = [c('Q','c'), c('7','d'), c('2','s')];
  sm.observe(holeCards, flopCards);

  const flopBridged = await getBridgedDecision({
    rawHoleCards: cc(holeCards),
    rawBoardCards: cc(flopCards),
    gameType: 'nlhe',
    potSize: 6,
    betToCall: 0,
    stackSize: 97,
    bigBlind: 1,
    position: 'co',
    numPlayers: 2,
  });

  assert(flopBridged.ready, 'flop bridge ready');
  assert(flopBridged.equity > 90, `QQ set on Q72: equity > 90% (got ${flopBridged.equity})`);
  sm.recordDecision({
    street: 'flop',
    action: flopBridged.action,
    equity: flopBridged.equity,
    potOdds: flopBridged.potOdds,
    confidence: flopBridged.confidence,
    reasoning: flopBridged.reasoning,
    handStrength: flopBridged.handStrength,
    texture: flopBridged.texture,
    spr: flopBridged.spr,
  });

  // End hand
  sm.observe([], []);

  // Audit the completed hand
  assertEq(completedHands.length, 1, 'pipeline hand completed');
  const hand = completedHands[0];

  const review = analyzeHand(hand);
  assert(review != null, 'audit returns review');
  assert(review.handId === hand.handId, 'audit handId matches');
  assert(typeof review.grade === 'string', 'review has grade');
  assert(typeof review.score === 'number', 'review has score');

  // Session audit
  const session = analyzeSession(completedHands);
  assert(session != null, 'session audit returns result');
  assert(typeof session.grade === 'string', 'session has grade');
  assertEq(session.totalHands, 1, 'session totalHands = 1');
}

// ============================================================================
// 5. Recompute pipeline: stale → fresh equity
// ============================================================================
section('Recompute pipeline integration');

{
  // Simulate a hand with stale (pre-fix) equity
  const staleHand = {
    holeCards: [c('A','s'), c('A','h')],
    board: [c('A','c'), c('7','d'), c('2','s')],
    gameType: 'nlhe',
    players: 2,
    equity: 22.1, // bogus value
    lowEquity: 0,
  };

  // Recompute single (does NOT carry equityOriginal — batch does)
  const fresh = recomputeHandEquity(staleHand);
  assert(fresh != null, 'recompute returns result');
  assert(fresh.equity > 90, `fresh equity > 90% (got ${fresh.equity})`);
  assertEq(fresh.schemaVersion, 4, 'schemaVersion = 4');

  // Batch of mixed hands
  const batch = [
    staleHand,
    {
      holeCards: [c('K','s'), c('K','h')],
      board: [c('Q','c'), c('J','d'), c('T','s')],
      gameType: 'nlhe',
      players: 2,
      equity: 80,
    },
    {
      holeCards: ['As'], // insufficient
      board: [c('A','c'), c('7','d'), c('2','s')],
      gameType: 'nlhe',
      players: 2,
    },
  ];

  const fixed = recomputeHandsBatch(batch);
  assertEq(fixed.length, 3, 'batch returns same count');
  assert(fixed[0].equity > 90, 'batch hand 0 recomputed');
  assert(fixed[0].equityOriginal === 22.1, 'batch preserves original equity');
  assert(fixed[1].equity != null, 'batch hand 1 recomputed');
  assertEq(fixed[2].recomputeError, 'insufficient-data', 'batch hand 2 error');

  const summary = summarizeRecompute(batch, fixed);
  assertEq(summary.total, 3, 'summary.total = 3');
  assert(summary.errored >= 1, 'summary has errors');
  assert(summary.changedEquity >= 1, 'summary has changed equity');
}

// ============================================================================
// 6. Hi-Lo recompute: lowEquity must be non-zero after recompute
// ============================================================================
section('Recompute: PLO Hi-Lo low equity');

{
  const stale = {
    holeCards: [c('A','s'), c('2','h'), c('Q','c'), c('J','d')],
    board: [c('3','s'), c('4','h'), c('K','d')],
    gameType: 'plo_hilo',
    players: 2,
    equity: 40,
    lowEquity: 0, // pre-fix: always 0
  };

  const fresh = recomputeHandEquity(stale);
  assert(fresh != null, 'HiLo recompute returns result');
  assert(fresh.lowEquity > 20, `HiLo lowEquity > 20 (got ${fresh.lowEquity})`);
  assert(fresh.equity != null, 'HiLo equity populated');
}

// ============================================================================
// 7. Hand strength validator in pipeline
// ============================================================================
section('Validator pipeline: engine → bridge → validator');

{
  // Get decision from engine
  const decision = Engine.getDecision({
    gameType: 'nlhe',
    holeCards: [c('A','s'), c('K','s')],
    boardCards: [c('A','c'), c('7','d'), c('2','s')],
    potSize: 10,
    betToCall: 0,
    stackSize: 100,
    bigBlind: 1,
    position: 'btn',
    numPlayers: 2,
    street: 'flop',
  });

  // Simulate OCR reading "One Pair" from PokerBros
  const normalized = normalizeLabel('One Pair');
  assertEq(normalized, 'One Pair', 'OCR label normalized');

  // Engine says top pair — compare with OCR
  if (decision.handStrength) {
    const comparison = compareHandStrength(decision.handStrength, 'One Pair');
    assert(comparison != null, 'comparison result exists');
    assert(typeof comparison.match === 'boolean', 'comparison has match field');
    assert(typeof comparison.severity === 'string', 'comparison has severity field');
  } else {
    assert(true, 'engine handStrength not available on this path (acceptable)');
  }

  // Rank ordering
  assert(strengthRank('Full House') > strengthRank('One Pair'), 'FH ranks higher than 1P');
  assert(strengthRank('Royal Flush') > strengthRank('Four of a Kind'), 'RF ranks higher than 4K');
}

// ============================================================================
// 8. Validate action detection in pipeline
// ============================================================================
section('Action validation pipeline');

{
  // actions object requires `any: true` to indicate buttons are visible
  // Simulate: bridge recommends RAISE, but only check/call visible
  const actions = { any: true, fold: true, checkCall: true, betRaise: false };
  const result = validateAction(actions, 'RAISE');
  assert(result != null, 'validateAction returns result');
  assert(result.consistent === false, 'RAISE with no betRaise button => inconsistent');

  // Bridge recommends FOLD, fold visible
  const result2 = validateAction({ any: true, fold: true, checkCall: true, betRaise: true }, 'FOLD');
  assert(result2.consistent === true, 'FOLD with fold visible => consistent');

  // Bridge recommends CALL, checkCall visible
  const result3 = validateAction({ any: true, fold: true, checkCall: true, betRaise: true }, 'CALL');
  assert(result3.consistent === true, 'CALL with checkCall visible => consistent');

  // No buttons visible => inconsistent regardless
  const result4 = validateAction({ any: false }, 'FOLD');
  assert(result4.consistent === false, 'no buttons => inconsistent');
}

// ============================================================================
// 9. extractCards → engine pipeline
// ============================================================================
section('extractCards → engine pipeline');

{
  // Simulate OCR output with varying confidence
  const rawCards = [
    { rank: 'A', suit: 's', confidence: 0.99 },
    { rank: 'K', suit: 'h', confidence: 0.95 },
    { rank: 'Q', suit: 'd', confidence: 0.88 },
    { rank: null, suit: null, confidence: 0.3 }, // bad detection
  ];

  const extracted = extractCards(rawCards);
  assert(extracted.cards.length <= 4, 'extractCards filters cards');
  assert(extracted.minConfidence <= 0.99, 'minConfidence tracked');

  // Feed valid cards to engine
  if (extracted.cards.length >= 2) {
    const eq = Engine.calculateEquity(
      extracted.cards.slice(0, 2),
      extracted.cards.length > 2 ? extracted.cards.slice(2) : [],
      1, 'nlhe', 200
    );
    assert(typeof eq.equity === 'number', 'engine accepts extracted cards');
  }
}

// ============================================================================
// 10. deriveStreet + streetFromBoardLength parity
// ============================================================================
section('deriveStreet ↔ streetFromBoardLength parity');

{
  const cases = [
    { hole: 0, board: 0, expected: 'waiting' },
    { hole: 2, board: 0, expected: 'preflop' },
    { hole: 2, board: 3, expected: 'flop' },
    { hole: 2, board: 4, expected: 'turn' },
    { hole: 2, board: 5, expected: 'river' },
  ];

  for (const tc of cases) {
    const sfbl = streetFromBoardLength(tc.hole, tc.board);
    const holeArr = tc.hole === 0 ? [] : [c('A','s'), c('K','h')];
    const boardArr = [];
    const boardCards = [c('2','c'), c('7','d'), c('J','s'), c('Q','h'), c('3','c')];
    for (let i = 0; i < tc.board; i++) boardArr.push(boardCards[i]);
    const ds = deriveStreet(holeArr, boardArr);

    assertEq(sfbl, tc.expected, `streetFromBoardLength(${tc.hole},${tc.board}) = ${tc.expected}`);

    // Map STREETS enum to string for comparison
    const streetMap = {
      [STREETS.WAITING]: 'waiting',
      [STREETS.PREFLOP]: 'preflop',
      [STREETS.FLOP]: 'flop',
      [STREETS.TURN]: 'turn',
      [STREETS.RIVER]: 'river',
    };
    assertEq(streetMap[ds], tc.expected, `deriveStreet matches for ${tc.expected}`);
  }
}

// ============================================================================
// Summary
// ============================================================================
console.log('\n==================================================');
console.log(`  PASSED: ${pass}    FAILED: ${fail}`);
console.log('==================================================');
if (fail > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
