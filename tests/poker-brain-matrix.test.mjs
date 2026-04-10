#!/usr/bin/env node
/**
 * POKER BRAIN — VARIANT × STREET × ACTION COMBINATORIAL MATRIX
 * ──────────────────────────────────────────────────────────────
 * Tests EVERY combination of:
 *   6 variants (NLHE, PLO, PLO Hi-Lo, PLO5, PLO6, MTT)
 *   × 4 streets (preflop, flop, turn, river)
 *   × action contexts (fold, call, raise scenarios)
 *
 * For each cell, asserts the FULL pipeline:
 *   engine.getDecision() → decision-bridge.getBridgedDecision()
 *   → field completeness verification
 *
 * Run: node --experimental-loader ./tests/poker-brain-loader.mjs \
 *          tests/poker-brain-matrix.test.mjs
 */

import Engine from '../src/lib/poker-brain/engine.js';
import { getBridgedDecision } from '../src/lib/poker-brain/decision-bridge.js';

let pass = 0;
let fail = 0;
const failures = [];

function section(name) { console.log('\n' + name); }
function assert(cond, msg) {
  if (cond) { pass++; console.log('  \u2713 ' + msg); }
  else { fail++; failures.push(msg); console.log('  \u2717 ' + msg); }
}
function assertEq(a, b, msg) { assert(a === b, `${msg} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`); }
function assertIn(a, arr, msg) { assert(arr.includes(a), `${msg} (got ${JSON.stringify(a)})`); }
function assertType(val, type, msg) { assert(typeof val === type, `${msg} (got ${typeof val})`); }

const c = (r, s) => ({ rank: r, suit: s });
const cc = (cards) => cards.map(x => ({ ...x, confidence: 0.98 }));

// ============================================================================
// Define test hands for each variant × street
// ============================================================================

const VARIANTS = {
  nlhe: {
    name: 'NLHE',
    gameType: 'nlhe',
    hands: {
      preflop_strong: { hole: [c('A','s'), c('A','h')], board: [] },
      preflop_weak:   { hole: [c('7','s'), c('2','h')], board: [] },
      flop:           { hole: [c('A','s'), c('K','h')], board: [c('A','c'), c('7','d'), c('2','s')] },
      turn:           { hole: [c('A','s'), c('K','h')], board: [c('A','c'), c('7','d'), c('2','s'), c('J','h')] },
      river:          { hole: [c('A','s'), c('K','h')], board: [c('A','c'), c('7','d'), c('2','s'), c('J','h'), c('3','c')] },
    },
  },
  plo: {
    name: 'PLO',
    gameType: 'plo',
    hands: {
      preflop_strong: { hole: [c('A','s'), c('A','h'), c('K','s'), c('K','h')], board: [] },
      preflop_weak:   { hole: [c('7','s'), c('2','h'), c('9','c'), c('3','d')], board: [] },
      flop:           { hole: [c('A','s'), c('A','h'), c('K','s'), c('K','h')], board: [c('A','c'), c('7','d'), c('2','s')] },
      turn:           { hole: [c('A','s'), c('A','h'), c('K','s'), c('K','h')], board: [c('A','c'), c('7','d'), c('2','s'), c('J','h')] },
      river:          { hole: [c('A','s'), c('A','h'), c('K','s'), c('K','h')], board: [c('A','c'), c('7','d'), c('2','s'), c('J','h'), c('3','c')] },
    },
  },
  plo_hilo: {
    name: 'PLO Hi-Lo',
    gameType: 'plo_hilo',
    hands: {
      preflop_strong: { hole: [c('A','s'), c('2','h'), c('K','c'), c('Q','d')], board: [] },
      preflop_weak:   { hole: [c('9','s'), c('8','h'), c('J','c'), c('T','d')], board: [] },
      flop:           { hole: [c('A','s'), c('2','h'), c('K','c'), c('Q','d')], board: [c('3','s'), c('4','h'), c('K','d')] },
      turn:           { hole: [c('A','s'), c('2','h'), c('K','c'), c('Q','d')], board: [c('3','s'), c('4','h'), c('K','d'), c('8','c')] },
      river:          { hole: [c('A','s'), c('2','h'), c('K','c'), c('Q','d')], board: [c('3','s'), c('4','h'), c('K','d'), c('8','c'), c('5','s')] },
    },
  },
  plo5: {
    name: 'PLO5',
    gameType: 'plo5',
    hands: {
      preflop_strong: { hole: [c('A','s'), c('A','h'), c('K','s'), c('K','h'), c('Q','c')], board: [] },
      preflop_weak:   { hole: [c('7','s'), c('2','h'), c('9','c'), c('3','d'), c('4','s')], board: [] },
      flop:           { hole: [c('A','s'), c('A','h'), c('K','s'), c('K','h'), c('Q','c')], board: [c('A','c'), c('7','d'), c('2','s')] },
      turn:           { hole: [c('A','s'), c('A','h'), c('K','s'), c('K','h'), c('Q','c')], board: [c('A','c'), c('7','d'), c('2','s'), c('J','h')] },
      river:          { hole: [c('A','s'), c('A','h'), c('K','s'), c('K','h'), c('Q','c')], board: [c('A','c'), c('7','d'), c('2','s'), c('J','h'), c('3','c')] },
    },
  },
  plo6: {
    name: 'PLO6',
    gameType: 'plo6',
    hands: {
      preflop_strong: { hole: [c('A','s'), c('A','h'), c('K','s'), c('K','h'), c('Q','c'), c('J','d')], board: [] },
      preflop_weak:   { hole: [c('7','s'), c('2','h'), c('9','c'), c('3','d'), c('4','s'), c('8','c')], board: [] },
      flop:           { hole: [c('A','s'), c('A','h'), c('K','s'), c('K','h'), c('Q','c'), c('J','d')], board: [c('A','c'), c('7','d'), c('2','s')] },
      turn:           { hole: [c('A','s'), c('A','h'), c('K','s'), c('K','h'), c('Q','c'), c('J','d')], board: [c('A','c'), c('7','d'), c('2','s'), c('J','h')] },
      river:          { hole: [c('A','s'), c('A','h'), c('K','s'), c('K','h'), c('Q','c'), c('J','d')], board: [c('A','c'), c('7','d'), c('2','s'), c('J','h'), c('3','c')] },
    },
  },
  mtt: {
    name: 'MTT',
    gameType: 'nlhe',
    isTournament: true,
    tournamentStage: 'bubble',
    stackSize: 5, // short stack for push/fold
    hands: {
      preflop_strong: { hole: [c('A','s'), c('5','h')], board: [] },
      preflop_weak:   { hole: [c('7','s'), c('2','h')], board: [] },
      flop:           { hole: [c('A','s'), c('K','h')], board: [c('A','c'), c('7','d'), c('2','s')] },
      turn:           { hole: [c('A','s'), c('K','h')], board: [c('A','c'), c('7','d'), c('2','s'), c('J','h')] },
      river:          { hole: [c('A','s'), c('K','h')], board: [c('A','c'), c('7','d'), c('2','s'), c('J','h'), c('3','c')] },
    },
  },
};

// Action contexts for postflop
const ACTION_CONTEXTS = [
  { name: 'check-option', betToCall: 0, potSize: 10 },
  { name: 'small-bet',    betToCall: 3, potSize: 10 },
  { name: 'half-pot',     betToCall: 5, potSize: 10 },
  { name: 'pot-bet',      betToCall: 10, potSize: 10 },
  { name: 'overbet',      betToCall: 20, potSize: 10 },
];

const STREETS = ['preflop', 'flop', 'turn', 'river'];
const VALID_ACTIONS = ['FOLD', 'CALL', 'RAISE', 'CHECK'];
const REQUIRED_FIELDS = ['action', 'confidence', 'reasoning'];
const POSTFLOP_FIELDS = ['equity', 'potOdds'];

// ============================================================================
// Run the matrix
// ============================================================================

for (const [vKey, variant] of Object.entries(VARIANTS)) {
  section(`=== ${variant.name} ===`);

  for (const street of STREETS) {
    const handKey = street === 'preflop' ? 'preflop_strong' : street;
    const hand = variant.hands[handKey];
    if (!hand) continue;

    const streetStr = street.charAt(0).toUpperCase() + street.slice(1);
    const stackSize = variant.stackSize || 100;
    const bigBlind = 1;

    // --- Engine direct ---
    section(`${variant.name} / ${streetStr} / Engine Direct`);

    const engineState = {
      gameType: variant.gameType,
      holeCards: hand.hole,
      boardCards: hand.board,
      potSize: 10,
      betToCall: street === 'preflop' ? 1 : 0,
      stackSize,
      bigBlind,
      position: 'btn',
      numPlayers: 6,
      street,
      preflopAction: street === 'preflop' ? 'rfi' : undefined,
      istournament: variant.isTournament || false,
      tournamentStage: variant.tournamentStage || undefined,
    };

    const direct = Engine.getDecision(engineState);
    assert(direct != null, `${vKey}/${street}: engine returns result`);
    assertIn(direct.action, VALID_ACTIONS, `${vKey}/${street}: engine action valid`);
    assertType(direct.confidence, 'number', `${vKey}/${street}: engine confidence is number`);
    assertType(direct.reasoning, 'string', `${vKey}/${street}: engine reasoning is string`);
    assert(direct.reasoning.length > 0, `${vKey}/${street}: engine reasoning non-empty`);

    if (street !== 'preflop') {
      assertType(direct.equity, 'number', `${vKey}/${street}: engine equity is number`);
      assert(direct.equity >= 0 && direct.equity <= 100, `${vKey}/${street}: engine equity in [0,100] (got ${direct.equity})`);
    }

    // Variant-specific fields
    if (variant.gameType.includes('plo')) {
      assertEq(direct.isOmaha, true, `${vKey}/${street}: engine isOmaha = true`);
    }
    if (variant.gameType === 'plo_hilo') {
      assertEq(direct.isHiLo, true, `${vKey}/${street}: engine isHiLo = true`);
      if (street !== 'preflop') {
        assertType(direct.highEquity, 'number', `${vKey}/${street}: engine highEquity is number`);
        assertType(direct.lowEquity, 'number', `${vKey}/${street}: engine lowEquity is number`);
      }
    }

    // --- Bridge parity ---
    section(`${variant.name} / ${streetStr} / Bridge Parity`);

    const bridged = await getBridgedDecision({
      rawHoleCards: cc(hand.hole),
      rawBoardCards: cc(hand.board),
      gameType: variant.gameType,
      potSize: 10,
      betToCall: street === 'preflop' ? 1 : 0,
      stackSize,
      bigBlind,
      position: 'btn',
      numPlayers: 6,
      preflopAction: street === 'preflop' ? 'rfi' : undefined,
      isTournament: variant.isTournament || false,
      tournamentStage: variant.tournamentStage || undefined,
    });

    assert(bridged != null, `${vKey}/${street}: bridge returns result`);
    assertEq(bridged.ready, true, `${vKey}/${street}: bridge ready`);
    assertEq(bridged.action, direct.action, `${vKey}/${street}: action parity (engine=${direct.action})`);
    assertEq(bridged.confidence, direct.confidence, `${vKey}/${street}: confidence parity`);
    assertEq(bridged.variant, variant.gameType, `${vKey}/${street}: variant tag`);

    // Structural completeness
    assertType(bridged.action, 'string', `${vKey}/${street}: bridged.action is string`);
    assertType(bridged.confidence, 'number', `${vKey}/${street}: bridged.confidence is number`);
    assertType(bridged.reasoning, 'string', `${vKey}/${street}: bridged.reasoning is string`);
    assert(bridged.holeCards != null, `${vKey}/${street}: bridged.holeCards populated`);
    assertEq(bridged.holeCards.length, hand.hole.length, `${vKey}/${street}: bridged holeCards count`);

    if (street !== 'preflop') {
      assertType(bridged.equity, 'number', `${vKey}/${street}: bridged.equity is number`);
      assertType(bridged.potOdds, 'number', `${vKey}/${street}: bridged.potOdds is number`);
      assert(bridged.handStrength != null, `${vKey}/${street}: bridged.handStrength populated`);
      assert(bridged.texture != null, `${vKey}/${street}: bridged.texture populated`);
      assertType(bridged.spr, 'number', `${vKey}/${street}: bridged.spr is number`);
    }

    // Tournament-specific
    if (variant.isTournament) {
      assertEq(bridged.isTournament, true, `${vKey}/${street}: bridged.isTournament = true`);
      assertType(bridged.bbStack, 'number', `${vKey}/${street}: bridged.bbStack is number`);
    }
  }

  // --- Preflop weak hand (should fold) ---
  section(`${variant.name} / Preflop Weak Hand`);
  const weakHand = variant.hands.preflop_weak;
  const weakDirect = Engine.getDecision({
    gameType: variant.gameType,
    holeCards: weakHand.hole,
    boardCards: [],
    potSize: 1.5,
    betToCall: 1,
    stackSize: variant.stackSize || 100,
    bigBlind: 1,
    position: 'utg',
    numPlayers: 6,
    street: 'preflop',
    preflopAction: 'rfi',
    istournament: variant.isTournament || false,
    tournamentStage: variant.tournamentStage || undefined,
  });
  assertEq(weakDirect.action, 'FOLD', `${vKey}/weak: engine folds trash`);

  const weakBridged = await getBridgedDecision({
    rawHoleCards: cc(weakHand.hole),
    rawBoardCards: [],
    gameType: variant.gameType,
    potSize: 1.5,
    betToCall: 1,
    stackSize: variant.stackSize || 100,
    bigBlind: 1,
    position: 'utg',
    numPlayers: 6,
    preflopAction: 'rfi',
    isTournament: variant.isTournament || false,
    tournamentStage: variant.tournamentStage || undefined,
  });
  assertEq(weakBridged.action, 'FOLD', `${vKey}/weak: bridge folds trash`);

  // --- Action context matrix (postflop only) ---
  if (variant.hands.flop) {
    section(`${variant.name} / Action Context Matrix`);
    for (const ctx of ACTION_CONTEXTS) {
      const flopHand = variant.hands.flop;
      const ctxDirect = Engine.getDecision({
        gameType: variant.gameType,
        holeCards: flopHand.hole,
        boardCards: flopHand.board,
        potSize: ctx.potSize,
        betToCall: ctx.betToCall,
        stackSize: variant.stackSize || 100,
        bigBlind: 1,
        position: 'btn',
        numPlayers: 2,
        street: 'flop',
        istournament: variant.isTournament || false,
        tournamentStage: variant.tournamentStage || undefined,
      });
      assertIn(ctxDirect.action, VALID_ACTIONS, `${vKey}/flop/${ctx.name}: action valid`);
      assertType(ctxDirect.equity, 'number', `${vKey}/flop/${ctx.name}: equity is number`);

      const ctxBridged = await getBridgedDecision({
        rawHoleCards: cc(flopHand.hole),
        rawBoardCards: cc(flopHand.board),
        gameType: variant.gameType,
        potSize: ctx.potSize,
        betToCall: ctx.betToCall,
        stackSize: variant.stackSize || 100,
        bigBlind: 1,
        position: 'btn',
        numPlayers: 2,
        isTournament: variant.isTournament || false,
        tournamentStage: variant.tournamentStage || undefined,
      });
      assertEq(ctxBridged.ready, true, `${vKey}/flop/${ctx.name}: bridge ready`);
      assertEq(ctxBridged.action, ctxDirect.action, `${vKey}/flop/${ctx.name}: action parity`);
    }
  }
}

// ============================================================================
// Position matrix: same hand, all positions
// ============================================================================
section('=== POSITION MATRIX (NLHE preflop AA) ===');
const POSITIONS = ['utg', 'utg+1', 'mp', 'hj', 'co', 'btn', 'sb', 'bb'];
for (const pos of POSITIONS) {
  const d = Engine.getDecision({
    gameType: 'nlhe',
    holeCards: [c('A','s'), c('A','h')],
    boardCards: [],
    potSize: 1.5,
    betToCall: 1,
    stackSize: 100,
    bigBlind: 1,
    position: pos,
    numPlayers: 9,
    street: 'preflop',
    preflopAction: 'rfi',
  });
  assertEq(d.action, 'RAISE', `NLHE AA ${pos.toUpperCase()} => RAISE`);
}

// ============================================================================
// Stack depth matrix: same hand, varying stacks
// ============================================================================
section('=== STACK DEPTH MATRIX (NLHE AKs flop TPGK) ===');
const STACKS = [10, 25, 50, 100, 200];
for (const stack of STACKS) {
  const d = Engine.getDecision({
    gameType: 'nlhe',
    holeCards: [c('A','s'), c('K','s')],
    boardCards: [c('A','c'), c('7','d'), c('2','h')],
    potSize: 10,
    betToCall: 0,
    stackSize: stack,
    bigBlind: 1,
    position: 'btn',
    numPlayers: 2,
    street: 'flop',
  });
  assertIn(d.action, VALID_ACTIONS, `NLHE AKs stack=${stack}: action valid (got ${d.action})`);
  assertType(d.equity, 'number', `NLHE AKs stack=${stack}: equity is number`);
  assert(d.spr != null || d.reasoning.length > 0, `NLHE AKs stack=${stack}: decision is informed`);
}

// ============================================================================
// PLO Hi-Lo specific: low equity across streets
// ============================================================================
section('=== PLO Hi-Lo LOW EQUITY PROGRESSION ===');
{
  const hiloHole = [c('A','s'), c('2','h'), c('K','c'), c('Q','d')];

  // Low-qualifying board: 3-4-K (wheel draw with nut low)
  const lowBoard3 = [c('3','s'), c('4','h'), c('K','d')];
  const lowBoard4 = [c('3','s'), c('4','h'), c('K','d'), c('8','c')];
  const lowBoard5 = [c('3','s'), c('4','h'), c('K','d'), c('8','c'), c('5','s')];

  const flopD = Engine.getDecision({
    gameType: 'plo_hilo', holeCards: hiloHole, boardCards: lowBoard3,
    potSize: 10, betToCall: 0, stackSize: 100, bigBlind: 1,
    position: 'btn', numPlayers: 2, street: 'flop',
  });
  assert(flopD.lowEquity > 0, `hilo flop lowEquity > 0 (got ${flopD.lowEquity})`);

  const turnD = Engine.getDecision({
    gameType: 'plo_hilo', holeCards: hiloHole, boardCards: lowBoard4,
    potSize: 15, betToCall: 0, stackSize: 100, bigBlind: 1,
    position: 'btn', numPlayers: 2, street: 'turn',
  });
  assert(turnD.lowEquity > 0, `hilo turn lowEquity > 0 (got ${turnD.lowEquity})`);

  const riverD = Engine.getDecision({
    gameType: 'plo_hilo', holeCards: hiloHole, boardCards: lowBoard5,
    potSize: 20, betToCall: 0, stackSize: 100, bigBlind: 1,
    position: 'btn', numPlayers: 2, street: 'river',
  });
  assert(riverD.lowEquity > 0, `hilo river lowEquity > 0 (got ${riverD.lowEquity})`);

  // No-low board (K-K-Q): lowEquity must be 0
  const noLowBoard = [c('K','s'), c('K','h'), c('Q','h')];
  const noLowD = Engine.getDecision({
    gameType: 'plo_hilo', holeCards: hiloHole, boardCards: noLowBoard,
    potSize: 10, betToCall: 0, stackSize: 100, bigBlind: 1,
    position: 'btn', numPlayers: 2, street: 'flop',
  });
  assertEq(noLowD.lowEquity, 0, 'hilo no-low board: lowEquity = 0');
}

// ============================================================================
// MTT-specific: push/fold ranges at varying stack depths
// ============================================================================
section('=== MTT PUSH/FOLD STACK DEPTH ===');
{
  const mttStacks = [3, 5, 8, 12, 15, 20];
  for (const bb of mttStacks) {
    const d = Engine.getDecision({
      gameType: 'nlhe',
      holeCards: [c('A','s'), c('5','h')],
      boardCards: [],
      potSize: 1.5,
      betToCall: 1,
      stackSize: bb,
      bigBlind: 1,
      position: 'btn',
      numPlayers: 6,
      street: 'preflop',
      preflopAction: 'rfi',
      istournament: true,
      tournamentStage: 'bubble',
    });
    assertIn(d.action, VALID_ACTIONS, `MTT A5o ${bb}bb: action valid (got ${d.action})`);
    assertType(d.bbStack, 'number', `MTT A5o ${bb}bb: bbStack present`);
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
