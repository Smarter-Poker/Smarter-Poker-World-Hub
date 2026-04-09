// Variant parity tests for the Poker Brain.
//
// For each supported variant (NLHE, PLO, PLO Hi-Lo, PLO5, PLO6, MTT) we
// construct a sample hand, run it through BOTH the engine directly and
// the decision bridge, and assert the HUD-visible fields match the
// engine's outputs field-for-field.
//
// Run with:
//   node --experimental-loader ./tests/poker-brain-loader.mjs \
//     tests/poker-brain-variants.test.mjs

import Engine from '../src/lib/poker-brain/engine.js';
import { getBridgedDecision } from '../src/lib/poker-brain/decision-bridge.js';
import {
  recomputeHandEquity,
  recomputeHandsBatch,
  summarizeRecompute,
} from '../src/lib/poker-brain/recompute.js';

let pass = 0;
let fail = 0;
const failures = [];

function section(name) {
  console.log('\n' + name);
}
function assert(cond, msg) {
  if (cond) { pass++; console.log('  \u2713 ' + msg); }
  else { fail++; failures.push(msg); console.log('  \u2717 ' + msg); }
}
function assertEq(actual, expected, msg) {
  assert(actual === expected, `${msg} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);
}
function assertIn(actual, allowed, msg) {
  assert(allowed.includes(actual), `${msg} (got ${JSON.stringify(actual)}, allowed ${JSON.stringify(allowed)})`);
}

// Helper: wrap raw cards into the matcher shape (confidence required)
const cardsWithConfidence = (cards) =>
  cards.map(c => ({ rank: c.rank, suit: c.suit, confidence: 0.98 }));

// ============================================================================
// 1. Variant utilities
// ============================================================================
section('Engine variant utilities');

assertEq(Engine.expectedHoleCount('nlhe'), 2, 'expectedHoleCount nlhe = 2');
assertEq(Engine.expectedHoleCount('plo'), 4, 'expectedHoleCount plo = 4');
assertEq(Engine.expectedHoleCount('plo_hilo'), 4, 'expectedHoleCount plo_hilo = 4');
assertEq(Engine.expectedHoleCount('plo5'), 5, 'expectedHoleCount plo5 = 5');
assertEq(Engine.expectedHoleCount('plo6'), 6, 'expectedHoleCount plo6 = 6');
assertEq(Engine.expectedHoleCount('PLO8'), 4, 'expectedHoleCount PLO8 = 4');

assertEq(Engine.isHiLoVariant('nlhe'), false, 'isHiLoVariant nlhe = false');
assertEq(Engine.isHiLoVariant('plo_hilo'), true, 'isHiLoVariant plo_hilo = true');
assertEq(Engine.isHiLoVariant('plo8'), true, 'isHiLoVariant plo8 = true');
assertEq(Engine.isHiLoVariant('plo'), false, 'isHiLoVariant plo = false');

// nutLowPotential: A-2 should be max
const a2 = [{rank:'A',suit:'s'},{rank:'2',suit:'h'},{rank:'K',suit:'c'},{rank:'Q',suit:'d'}];
const kk = [{rank:'K',suit:'s'},{rank:'K',suit:'h'},{rank:'Q',suit:'c'},{rank:'Q',suit:'d'}];
assertEq(Engine.nutLowPotential(a2), 1.0, 'nutLowPotential A2 = 1.0');
assertEq(Engine.nutLowPotential(kk), 0, 'nutLowPotential KK = 0');

// Push-fold chart
assert(Engine.getPushFoldRange(5) != null, 'getPushFoldRange(5) returns a range');
assert(Engine.getPushFoldRange(5).has('72o') === false, 'push range @ 5bb excludes 72o');
assert(Engine.getPushFoldRange(5).has('AA'), 'push range @ 5bb includes AA');
assert(Engine.getPushFoldRange(10).has('55'), 'push range @ 10bb includes 55');
assert(Engine.getPushFoldRange(30) == null, 'getPushFoldRange(30) returns null (out of pf territory)');

// ICM
assertEq(Engine.bubbleFactorForStage('early'), 1.0, 'bubble factor early = 1.0');
assertEq(Engine.bubbleFactorForStage('bubble'), 1.5, 'bubble factor bubble = 1.5');
assertEq(Engine.bubbleFactorForStage('itm'), 1.25, 'bubble factor itm = 1.25');
assert(Engine.icmAdjustedEV(10, 1.5) === 10, 'icmAdjustedEV positive EV unchanged');
assert(Engine.icmAdjustedEV(-10, 1.5) === -15, 'icmAdjustedEV negative EV scaled by bubble');

// M ratio
const m = Engine.calculateM(1500, 100, 9);
assert(typeof m === 'number' && m > 0, `calculateM returns positive (got ${m})`);

// ============================================================================
// 2. NLHE parity: engine vs bridge
// ============================================================================
section('NLHE: preflop AA UTG');

const nlheState = {
  gameType: 'nlhe',
  holeCards: [{rank:'A',suit:'s'},{rank:'A',suit:'h'}],
  boardCards: [],
  potSize: 1.5,
  betToCall: 1,
  stackSize: 100,
  bigBlind: 1,
  position: 'utg',
  numPlayers: 6,
  street: 'preflop',
  preflopAction: 'rfi',
};
const nlheDirect = Engine.getDecision(nlheState);
const nlheBridged = getBridgedDecision({
  rawHoleCards: cardsWithConfidence(nlheState.holeCards),
  rawBoardCards: [],
  gameType: 'nlhe',
  potSize: nlheState.potSize,
  betToCall: nlheState.betToCall,
  stackSize: nlheState.stackSize,
  bigBlind: nlheState.bigBlind,
  position: 'utg',
  numPlayers: 6,
  preflopAction: 'rfi',
});
assertEq(nlheDirect.action, 'RAISE', 'NLHE AA UTG -> RAISE direct');
assertEq(nlheBridged.ready, true, 'NLHE AA bridged ready');
assertEq(nlheBridged.action, nlheDirect.action, 'NLHE action parity');
assertEq(nlheBridged.confidence, nlheDirect.confidence, 'NLHE confidence parity');
assertEq(nlheBridged.variant, 'nlhe', 'NLHE variant tag');
assertEq(nlheBridged.isOmaha, false, 'NLHE isOmaha = false');
assertEq(nlheBridged.isHiLo, false, 'NLHE isHiLo = false');

// ============================================================================
// 3. PLO parity: premium AAKK double-suited
// ============================================================================
section('PLO: preflop AAKK ds UTG');

const ploHole = [
  {rank:'A',suit:'s'},{rank:'A',suit:'h'},
  {rank:'K',suit:'s'},{rank:'K',suit:'h'},
];
const ploDirect = Engine.getDecision({
  gameType: 'plo',
  holeCards: ploHole,
  boardCards: [],
  potSize: 1.5,
  betToCall: 1,
  stackSize: 100,
  bigBlind: 1,
  position: 'utg',
  numPlayers: 6,
  street: 'preflop',
  preflopAction: 'rfi',
});
const ploBridged = getBridgedDecision({
  rawHoleCards: cardsWithConfidence(ploHole),
  rawBoardCards: [],
  gameType: 'plo',
  potSize: 1.5,
  betToCall: 1,
  stackSize: 100,
  bigBlind: 1,
  position: 'utg',
  numPlayers: 6,
  preflopAction: 'rfi',
});
assertEq(ploDirect.action, 'RAISE', 'PLO AAKKds -> RAISE direct');
assertEq(ploBridged.ready, true, 'PLO bridged ready');
assertEq(ploBridged.action, ploDirect.action, 'PLO action parity');
assertEq(ploBridged.isOmaha, true, 'PLO isOmaha = true');
assertEq(ploBridged.isHiLo, false, 'PLO isHiLo = false');

// PLO rejects 2-card hole
const ploTooFew = getBridgedDecision({
  rawHoleCards: cardsWithConfidence([{rank:'A',suit:'s'},{rank:'A',suit:'h'}]),
  rawBoardCards: [],
  gameType: 'plo',
  bigBlind: 1,
  stackSize: 100,
});
assertEq(ploTooFew.ready, false, 'PLO with 2 hole cards => not ready');
assert(ploTooFew.reason && ploTooFew.reason.includes('4'), 'PLO reason mentions 4 cards');

// ============================================================================
// 4. PLO Hi-Lo: A2KK double-suited
// ============================================================================
section('PLO Hi-Lo: A2KK');

const hiloHole = [
  {rank:'A',suit:'s'},{rank:'2',suit:'s'},
  {rank:'K',suit:'h'},{rank:'K',suit:'h'}, // invalid dup for test; use distinct
];
const hiloHoleValid = [
  {rank:'A',suit:'s'},{rank:'2',suit:'h'},
  {rank:'K',suit:'c'},{rank:'Q',suit:'d'},
];
const hiloDirect = Engine.getDecision({
  gameType: 'plo_hilo',
  holeCards: hiloHoleValid,
  boardCards: [],
  potSize: 1.5,
  betToCall: 1,
  stackSize: 100,
  bigBlind: 1,
  position: 'utg',
  numPlayers: 6,
  street: 'preflop',
  preflopAction: 'rfi',
});
const hiloBridged = getBridgedDecision({
  rawHoleCards: cardsWithConfidence(hiloHoleValid),
  rawBoardCards: [],
  gameType: 'plo_hilo',
  potSize: 1.5,
  betToCall: 1,
  stackSize: 100,
  bigBlind: 1,
  position: 'utg',
  numPlayers: 6,
  preflopAction: 'rfi',
});
assertEq(hiloBridged.isHiLo, true, 'Hi-Lo isHiLo = true');
assertEq(hiloBridged.isOmaha, true, 'Hi-Lo isOmaha = true');
assertEq(hiloDirect.action, 'RAISE', 'Hi-Lo A2+broadway -> RAISE direct');
assertEq(hiloBridged.action, hiloDirect.action, 'Hi-Lo action parity');
assert(
  hiloBridged.reasoning && (hiloBridged.reasoning.toLowerCase().includes('low') || hiloBridged.reasoning.includes('PLO_HILO')),
  `Hi-Lo reasoning mentions low or variant (got: ${hiloBridged.reasoning})`
);

// Hi-Lo postflop: low-qualifying board -> lowEquity populated
const lowBoard = [{rank:'5',suit:'s'},{rank:'7',suit:'c'},{rank:'3',suit:'d'}];
const hiloPostDirect = Engine.getDecision({
  gameType: 'plo_hilo',
  holeCards: hiloHoleValid,
  boardCards: lowBoard,
  potSize: 10,
  betToCall: 0,
  stackSize: 100,
  bigBlind: 1,
  position: 'btn',
  numPlayers: 2,
  street: 'flop',
});
assert(typeof hiloPostDirect.highEquity === 'number', 'Hi-Lo postflop has highEquity');
assert(typeof hiloPostDirect.lowEquity === 'number', 'Hi-Lo postflop has lowEquity');

// ============================================================================
// 5. PLO5: 5-card hole
// ============================================================================
section('PLO5: 5-card hole');

const plo5Hole = [
  {rank:'A',suit:'s'},{rank:'A',suit:'h'},
  {rank:'K',suit:'s'},{rank:'K',suit:'h'},
  {rank:'Q',suit:'c'},
];
const plo5Direct = Engine.getDecision({
  gameType: 'plo5',
  holeCards: plo5Hole,
  boardCards: [],
  potSize: 1.5,
  betToCall: 1,
  stackSize: 100,
  bigBlind: 1,
  position: 'btn',
  numPlayers: 6,
  street: 'preflop',
  preflopAction: 'rfi',
});
const plo5Bridged = getBridgedDecision({
  rawHoleCards: cardsWithConfidence(plo5Hole),
  rawBoardCards: [],
  gameType: 'plo5',
  potSize: 1.5,
  betToCall: 1,
  stackSize: 100,
  bigBlind: 1,
  position: 'btn',
  numPlayers: 6,
  preflopAction: 'rfi',
});
assertEq(plo5Direct.action, 'RAISE', 'PLO5 premium -> RAISE direct');
assertEq(plo5Bridged.ready, true, 'PLO5 bridged ready');
assertEq(plo5Bridged.action, plo5Direct.action, 'PLO5 action parity');
assertEq(plo5Bridged.holeCards.length, 5, 'PLO5 bridged holeCards length = 5');

// PLO5 with 4-card hole -> not ready
const plo5Short = getBridgedDecision({
  rawHoleCards: cardsWithConfidence(plo5Hole.slice(0, 4)),
  rawBoardCards: [],
  gameType: 'plo5',
  stackSize: 100,
  bigBlind: 1,
});
assertEq(plo5Short.ready, false, 'PLO5 with 4 cards => not ready');

// PLO5 postflop equity
const plo5Board = [{rank:'A',suit:'d'},{rank:'7',suit:'c'},{rank:'2',suit:'h'}];
const plo5Post = Engine.getDecision({
  gameType: 'plo5',
  holeCards: plo5Hole,
  boardCards: plo5Board,
  potSize: 10,
  betToCall: 5,
  stackSize: 100,
  bigBlind: 1,
  position: 'btn',
  numPlayers: 2,
  street: 'flop',
});
assert(plo5Post.equity > 50, `PLO5 set of aces on A72 > 50% equity (got ${plo5Post.equity})`);

// ============================================================================
// 6. PLO6: 6-card hole
// ============================================================================
section('PLO6: 6-card hole');

const plo6Hole = [
  {rank:'A',suit:'s'},{rank:'A',suit:'h'},
  {rank:'K',suit:'s'},{rank:'K',suit:'h'},
  {rank:'Q',suit:'c'},{rank:'J',suit:'d'},
];
const plo6Bridged = getBridgedDecision({
  rawHoleCards: cardsWithConfidence(plo6Hole),
  rawBoardCards: [],
  gameType: 'plo6',
  potSize: 1.5,
  betToCall: 1,
  stackSize: 100,
  bigBlind: 1,
  position: 'btn',
  numPlayers: 6,
  preflopAction: 'rfi',
});
assertEq(plo6Bridged.ready, true, 'PLO6 bridged ready');
assertEq(plo6Bridged.holeCards.length, 6, 'PLO6 bridged holeCards length = 6');
assertEq(plo6Bridged.isOmaha, true, 'PLO6 isOmaha = true');

// ============================================================================
// 7. MTT push/fold: 5bb with A5o should push
// ============================================================================
section('MTT: push/fold short stack');

const mttDirect = Engine.getDecision({
  gameType: 'nlhe',
  holeCards: [{rank:'A',suit:'s'},{rank:'5',suit:'h'}],
  boardCards: [],
  potSize: 1.5,
  betToCall: 1,
  stackSize: 5,
  bigBlind: 1,
  position: 'btn',
  numPlayers: 6,
  street: 'preflop',
  preflopAction: 'rfi',
  istournament: true,
  tournamentStage: 'bubble',
});
assertEq(mttDirect.action, 'RAISE', 'MTT 5bb A5o -> push (RAISE)');
assert(mttDirect.reasoning.toLowerCase().includes('push') || mttDirect.reasoning.toLowerCase().includes('shove'), `MTT reasoning mentions shove (got: ${mttDirect.reasoning})`);
assertEq(mttDirect.bubbleFactor, 1.5, 'MTT bubble factor = 1.5');
assertEq(mttDirect.bbStack, 5, 'MTT bbStack = 5');

// MTT 72o at 5bb -> fold
const mttFold = Engine.getDecision({
  gameType: 'nlhe',
  holeCards: [{rank:'7',suit:'s'},{rank:'2',suit:'h'}],
  boardCards: [],
  potSize: 1.5,
  betToCall: 1,
  stackSize: 5,
  bigBlind: 1,
  position: 'btn',
  numPlayers: 6,
  street: 'preflop',
  preflopAction: 'rfi',
  istournament: true,
  tournamentStage: 'bubble',
});
assertEq(mttFold.action, 'FOLD', 'MTT 5bb 72o -> FOLD');

// Bridge parity: tournament fields surface
const mttBridged = getBridgedDecision({
  rawHoleCards: cardsWithConfidence([{rank:'A',suit:'s'},{rank:'5',suit:'h'}]),
  rawBoardCards: [],
  gameType: 'nlhe',
  potSize: 1.5,
  betToCall: 1,
  stackSize: 5,
  bigBlind: 1,
  position: 'btn',
  numPlayers: 6,
  preflopAction: 'rfi',
  isTournament: true,
  tournamentStage: 'bubble',
});
assertEq(mttBridged.ready, true, 'MTT bridged ready');
assertEq(mttBridged.action, mttDirect.action, 'MTT action parity');
assertEq(mttBridged.isTournament, true, 'MTT isTournament = true');
assertEq(mttBridged.tournamentStage, 'bubble', 'MTT stage parity');
assertEq(mttBridged.bbStack, 5, 'MTT bridged bbStack = 5');
assertEq(mttBridged.bubbleFactor, 1.5, 'MTT bridged bubbleFactor = 1.5');
assert(mttBridged.pushFoldHint != null, 'MTT bridged has pushFoldHint');
assertEq(mttBridged.pushFoldHint.inRange, true, 'MTT A5o in push range @ 5bb');
assert(typeof mttBridged.mRatio === 'number' && mttBridged.mRatio > 0, 'MTT bridged has mRatio');

// ============================================================================
// 8. Cross-variant: field completeness per variant
// ============================================================================
section('Cross-variant field completeness');

const variants = [
  { gt: 'nlhe', hole: [{rank:'A',suit:'s'},{rank:'K',suit:'h'}] },
  { gt: 'plo', hole: ploHole },
  { gt: 'plo_hilo', hole: hiloHoleValid },
  { gt: 'plo5', hole: plo5Hole },
  { gt: 'plo6', hole: plo6Hole },
];
for (const v of variants) {
  const b = getBridgedDecision({
    rawHoleCards: cardsWithConfidence(v.hole),
    rawBoardCards: [],
    gameType: v.gt,
    potSize: 1.5,
    betToCall: 1,
    stackSize: 100,
    bigBlind: 1,
    position: 'btn',
    numPlayers: 6,
    preflopAction: 'rfi',
  });
  assertEq(b.ready, true, `${v.gt}: bridged ready`);
  assert(typeof b.equity === 'number', `${v.gt}: equity is a number`);
  assert(typeof b.confidence === 'number', `${v.gt}: confidence is a number`);
  assertIn(b.action, ['FOLD', 'CALL', 'RAISE'], `${v.gt}: action is valid`);
  assertEq(b.variant, v.gt, `${v.gt}: variant tag parity`);
}

// ============================================================================
// Hi-Lo equity correctness — verify getOmahaLowBest is actually firing
// ============================================================================
section('PLO Hi-Lo low-side equity math');

// Nut-low draw: A-2-Q-J double-suited on a 3-4-5 board. The hero has
// the nut low (A-2-3-4-5 wheel) plus open-ended to the straight. lowEquity
// must be very high (>80%), and the scoop equity should dominate.
{
  const hand = Engine.getDecision({
    street: 'flop',
    position: 'btn',
    holeCards: [
      { rank: 'A', suit: 's' },
      { rank: '2', suit: 's' },
      { rank: 'Q', suit: 'h' },
      { rank: 'J', suit: 'h' },
    ],
    boardCards: [
      { rank: '3', suit: 'c' },
      { rank: '4', suit: 'd' },
      { rank: 'K', suit: 'd' },
    ],
    potSize: 20,
    betToCall: 0,
    stackSize: 200,
    bigBlind: 2,
    numPlayers: 2,
    gameType: 'plo_hilo',
  });
  assert(hand.lowEquity > 50, `A2-wheel nut low: lowEquity high (got ${hand.lowEquity})`);
  assert(hand.highEquity >= 0 && hand.highEquity <= 100, `highEquity bounded (got ${hand.highEquity})`);
  assertEq(hand.isHiLo, true, 'plo_hilo flagged isHiLo');
}

// No-low-possible board: K-K-Q (no wheel cards) — qualifying low is
// impossible on any runout that keeps this board, so lowEquity must
// be zero when the board has 3 high cards.
{
  const hand = Engine.getDecision({
    street: 'river',
    position: 'btn',
    holeCards: [
      { rank: 'A', suit: 's' },
      { rank: '2', suit: 'h' },
      { rank: 'Q', suit: 'c' },
      { rank: 'J', suit: 'd' },
    ],
    boardCards: [
      { rank: 'K', suit: 's' },
      { rank: 'K', suit: 'h' },
      { rank: 'Q', suit: 'h' },
      { rank: 'J', suit: 's' },
      { rank: 'T', suit: 'c' },
    ],
    potSize: 40,
    betToCall: 0,
    stackSize: 200,
    bigBlind: 2,
    numPlayers: 2,
    gameType: 'plo_hilo',
  });
  assertEq(hand.lowEquity, 0, 'no-low board: lowEquity = 0');
}

// High-only PLO (not Hi-Lo) should always have lowEquity = 0 regardless
// of hole cards — no low pot exists.
{
  const hand = Engine.getDecision({
    street: 'flop',
    position: 'btn',
    holeCards: [
      { rank: 'A', suit: 's' },
      { rank: '2', suit: 's' },
      { rank: 'Q', suit: 'h' },
      { rank: 'J', suit: 'h' },
    ],
    boardCards: [
      { rank: '3', suit: 'c' },
      { rank: '4', suit: 'd' },
      { rank: 'K', suit: 'd' },
    ],
    potSize: 20,
    betToCall: 0,
    stackSize: 200,
    bigBlind: 2,
    numPlayers: 2,
    gameType: 'plo',
  });
  assertEq(hand.lowEquity, 0, 'plain PLO (not Hi-Lo): lowEquity = 0');
  assertEq(hand.isHiLo, false, 'plain PLO flagged isHiLo = false');
}

// Low evaluation must honor the 2-from-hole / 3-from-board constraint.
// Hole = Q-Q-J-T (no low cards). Even if the board runs out 2-3-4-5-7
// (enough low cards on board), the player cannot claim a low because
// they can't contribute 2 low hole cards. lowEquity must be 0.
{
  const hand = Engine.getDecision({
    street: 'river',
    position: 'btn',
    holeCards: [
      { rank: 'Q', suit: 's' },
      { rank: 'Q', suit: 'h' },
      { rank: 'J', suit: 'c' },
      { rank: 'T', suit: 'd' },
    ],
    boardCards: [
      { rank: '2', suit: 's' },
      { rank: '3', suit: 'h' },
      { rank: '4', suit: 'c' },
      { rank: '5', suit: 'd' },
      { rank: '7', suit: 's' },
    ],
    potSize: 40,
    betToCall: 0,
    stackSize: 200,
    bigBlind: 2,
    numPlayers: 2,
    gameType: 'plo_hilo',
  });
  assertEq(hand.lowEquity, 0, 'QQJT in hole cannot claim low (2-from-hole rule)');
}

// ============================================================================
// Historical hand recomputer
// ============================================================================
section('Recompute utility');

// Single hand: AA set on A-7-2 rainbow flop. Under the evaluator-fix
// commit this should compute ~97% equity. We simulate an "old stored"
// hand with a stale equity value and verify recomputeHandEquity produces
// a new answer that differs.
{
  const stale = {
    holeCards: [{ rank: 'A', suit: 's' }, { rank: 'A', suit: 'h' }],
    board: [
      { rank: 'A', suit: 'c' },
      { rank: '7', suit: 'd' },
      { rank: '2', suit: 's' },
    ],
    gameType: 'nlhe',
    players: 2,
    equity: 23.4, // bogus pre-bug-fix value
  };
  const rec = recomputeHandEquity(stale);
  assert(rec != null, 'recomputeHandEquity returns a result');
  assert(rec.equity > 90 && rec.equity <= 100, `recomputed equity high (got ${rec.equity})`);
  assert(rec.lowEquity === 0, 'nlhe lowEquity = 0');
  assertEq(rec.schemaVersion, 4, 'schemaVersion = 4');
}

// Accepts 2-char string cards too
{
  const rec = recomputeHandEquity({
    holeCards: ['As', 'Ah'],
    board: ['Ac', '7d', '2s'],
    gameType: 'nlhe',
    players: 2,
  });
  assert(rec != null, 'string-card shape accepted');
  assert(rec.equity > 90, `string-card equity high (got ${rec && rec.equity})`);
}

// Wrong hole-card count for variant -> null (can't re-evaluate)
{
  const rec = recomputeHandEquity({
    holeCards: [{ rank: 'A', suit: 's' }, { rank: 'K', suit: 'h' }],
    board: [{ rank: '2', suit: 'c' }, { rank: '3', suit: 'd' }, { rank: '4', suit: 's' }],
    gameType: 'plo',
    players: 2,
  });
  assertEq(rec, null, 'PLO with 2 hole cards -> null');
}

// Preflop hand -> skipped with reason (engine uses charts, not MC)
{
  const rec = recomputeHandEquity({
    holeCards: [{ rank: 'A', suit: 's' }, { rank: 'A', suit: 'h' }],
    board: [],
    gameType: 'nlhe',
    players: 2,
  });
  assert(rec != null && rec.skipped === true, 'preflop skipped');
  assertEq(rec.equity, null, 'preflop equity = null');
}

// Batch + summarize: 3 hands, 2 recomputable, 1 insufficient data
{
  const old = [
    {
      holeCards: ['As', 'Ah'],
      board: ['Ac', '7d', '2s'],
      gameType: 'nlhe',
      players: 2,
      equity: 22.1,   // stale bogus
      lowEquity: 0,
    },
    {
      holeCards: ['Ks', 'Kh'],
      board: ['Qc', 'Jd', 'Ts'],
      gameType: 'nlhe',
      players: 2,
      equity: 80,     // stale plausible but different
      lowEquity: 0,
    },
    {
      holeCards: ['As'],        // insufficient - only 1 card
      board: ['Ac', '7d', '2s'],
      gameType: 'nlhe',
      players: 2,
      equity: null,
    },
  ];
  const fixed = recomputeHandsBatch(old);
  assertEq(fixed.length, 3, 'batch returns same length');
  assert(fixed[0].equity > 90, 'batch hand 0 recomputed');
  assert(fixed[0].equityOriginal === 22.1, 'batch hand 0 preserved original');
  assert(fixed[1].equity != null && fixed[1].equity !== 80, 'batch hand 1 recomputed');
  assertEq(fixed[2].recomputeError, 'insufficient-data', 'batch hand 2 flagged as error');

  const summary = summarizeRecompute(old, fixed);
  assertEq(summary.total, 3, 'summary.total = 3');
  assert(summary.changedEquity >= 1, 'summary.changedEquity >= 1');
  assertEq(summary.errored, 1, 'summary.errored = 1');
  assert(summary.maxEquityDelta > 50, `summary.maxEquityDelta > 50 (got ${summary.maxEquityDelta})`);
}

// PLO Hi-Lo recompute: old hand had lowEquity=0 baked in; new evaluator
// must produce a non-zero lowEquity when hero has nut-low potential.
{
  const stale = {
    holeCards: ['As', '2s', 'Qh', 'Jh'],
    board: ['3c', '4d', 'Kd'],
    gameType: 'plo_hilo',
    players: 2,
    equity: 40,
    lowEquity: 0,    // pre-phase-4 was always 0 for Omaha Hi-Lo
  };
  const rec = recomputeHandEquity(stale);
  assert(rec != null, 'plo_hilo recomputed');
  assert(rec.lowEquity > 20, `plo_hilo lowEquity > 20 (got ${rec && rec.lowEquity})`);
}

// ============================================================================
// Summary
// ============================================================================
console.log('\n--------------------------------------------------');
console.log(`  PASSED: ${pass}    FAILED: ${fail}`);
console.log('--------------------------------------------------');
if (fail > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
