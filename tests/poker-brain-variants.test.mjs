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
