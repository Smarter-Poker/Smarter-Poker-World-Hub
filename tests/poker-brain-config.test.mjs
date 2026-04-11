#!/usr/bin/env node
/**
 * POKER BRAIN — CONFIG, CONSTANTS & RANGE VALIDATION TESTS
 * ─────────────────────────────────────────────────────────────
 * Validates: RANGES, PUSH_RANGE_BY_BB (Nash), DECISION_CONFIDENCE,
 * expectedHoleCount, isHiLoVariant, layout.json schema, deck/utility.
 *
 * Run: node --experimental-loader ./tests/poker-brain-loader.mjs \
 *          tests/poker-brain-config.test.mjs
 */

import Engine from '../src/lib/poker-brain/engine.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const E = Engine;

let pass = 0;
let fail = 0;
const failures = [];

function section(name) { console.log('\n' + name); }
function assert(cond, msg) {
  if (cond) { pass++; console.log('  \u2713 ' + msg); }
  else { fail++; failures.push(msg); console.log('  \u2717 ' + msg); }
}
function assertEq(a, b, msg) {
  assert(a === b, `${msg} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`);
}

// ============================================================================
// 1. RANGES validation
// ============================================================================
section('RANGES: RFI, BB_DEFEND, THREEBET, FOURBET');

{
  assert(E.RANGES !== undefined && E.RANGES !== null, 'E.RANGES exists');
  assert(typeof E.RANGES === 'object', 'E.RANGES is an object');

  // All RANGES values are Sets (not arrays)
  // RFI ranges
  if (E.RANGES.RFI) {
    const rfi = E.RANGES.RFI;
    assert(typeof rfi === 'object', 'RFI is an object');
    const positions = Object.keys(rfi);
    assert(positions.length >= 3, 'RFI has at least 3 positions');

    // Validate hand string format in each position
    for (const pos of positions) {
      const hands = rfi[pos];
      assert(hands instanceof Set, `RFI[${pos}] is a Set`);
      assert(hands.size > 0, `RFI[${pos}] is non-empty (${hands.size} hands)`);
      for (const hand of hands) {
        assert(typeof hand === 'string', `RFI[${pos}] hand is string: ${hand}`);
        assert(hand.length >= 2 && hand.length <= 3, `RFI hand valid format: ${hand}`);
      }
    }

    // UTG should be tighter than BTN
    if (rfi.utg && rfi.btn) {
      assert(rfi.utg.size < rfi.btn.size,
        `UTG (${rfi.utg.size}) tighter than BTN (${rfi.btn.size})`);
    }
  } else {
    assert(false, 'E.RANGES.RFI exists');
  }

  // BB_DEFEND
  if (E.RANGES.BB_DEFEND) {
    assert(E.RANGES.BB_DEFEND instanceof Set, 'BB_DEFEND is a Set');
    assert(E.RANGES.BB_DEFEND.size > 0, `BB_DEFEND non-empty (${E.RANGES.BB_DEFEND.size} hands)`);
  } else {
    assert(false, 'BB_DEFEND exists');
  }

  // THREEBET_RANGE
  if (E.RANGES.THREEBET_RANGE) {
    assert(E.RANGES.THREEBET_RANGE instanceof Set, 'THREEBET_RANGE is a Set');
    assert(E.RANGES.THREEBET_RANGE.has('AA'), 'THREEBET includes AA');
    assert(E.RANGES.THREEBET_RANGE.has('KK'), 'THREEBET includes KK');
    assert(E.RANGES.THREEBET_RANGE.has('QQ'), 'THREEBET includes QQ');
    assert(E.RANGES.THREEBET_RANGE.has('AKs'), 'THREEBET includes AKs');
  } else {
    assert(false, 'THREEBET_RANGE exists');
  }

  // FOURBET_RANGE
  if (E.RANGES.FOURBET_RANGE) {
    assert(E.RANGES.FOURBET_RANGE instanceof Set, 'FOURBET_RANGE is a Set');
    assert(E.RANGES.FOURBET_RANGE.has('AA'), 'FOURBET includes AA');
    assert(E.RANGES.FOURBET_RANGE.has('KK'), 'FOURBET includes KK');
    // FOURBET should be subset of THREEBET
    if (E.RANGES.THREEBET_RANGE) {
      const fourInThree = [...E.RANGES.FOURBET_RANGE].every(h => E.RANGES.THREEBET_RANGE.has(h));
      assert(fourInThree, 'FOURBET_RANGE is subset of THREEBET_RANGE');
    }
    assert(E.RANGES.FOURBET_RANGE.size <= E.RANGES.THREEBET_RANGE.size,
      'FOURBET_RANGE smaller than THREEBET_RANGE');
  } else {
    assert(false, 'FOURBET_RANGE exists');
  }
}

// ============================================================================
// 2. PUSH_RANGE_BY_BB Nash spot-checks
// ============================================================================
section('PUSH_RANGE_BY_BB: Nash equilibrium validation');

{
  // PUSH_RANGE_BY_BB is an object map { 5: [...], 10: [...], 15: [...], 20: [...] }
  // getPushFoldRange(bb) is the function interface
  assert(typeof E.PUSH_RANGE_BY_BB === 'object', 'PUSH_RANGE_BY_BB is an object');
  assert(typeof E.getPushFoldRange === 'function', 'getPushFoldRange is a function');

  const toArr = (v) => v ? (Array.isArray(v) ? v : [...v]) : [];

  // 5bb: very wide
  const range5 = E.getPushFoldRange(5);
  assert(range5 !== null && range5 !== undefined, '5bb range exists');
  const r5 = toArr(range5);
  assert(r5.length >= 40, `5bb range is wide (${r5.length} hands)`);
  assert(r5.includes('AA'), '5bb includes AA');

  // 10bb: moderate
  const range10 = E.getPushFoldRange(10);
  assert(range10 !== null && range10 !== undefined, '10bb range exists');
  const r10 = toArr(range10);
  assert(r10.length >= 20, `10bb range moderate (${r10.length} hands)`);
  assert(r10.includes('AA'), '10bb includes AA');

  // 15bb: tighter
  const range15 = E.getPushFoldRange(15);
  assert(range15 !== null && range15 !== undefined, '15bb range exists');
  const r15 = toArr(range15);
  assert(r15.includes('AA'), '15bb includes AA');
  assert(r15.includes('KK'), '15bb includes KK');

  // 20bb: premium only
  const range20 = E.getPushFoldRange(20);
  assert(range20 !== null && range20 !== undefined, '20bb range exists');
  const r20 = toArr(range20);
  assert(r20.includes('AA'), '20bb includes AA');

  // >20bb: may return null
  const range25 = E.getPushFoldRange(25);
  assert(range25 === null || typeof range25 === 'object', '25bb range is null or collection');

  // Monotonic: 5bb range includes all 10bb range hands
  const set5 = new Set(r5);
  const all10in5 = r10.every(h => set5.has(h));
  assert(all10in5, 'All 10bb hands are in 5bb range (monotonic)');

  // 10bb includes all 15bb
  const set10 = new Set(r10);
  const all15in10 = r15.every(h => set10.has(h));
  assert(all15in10, 'All 15bb hands are in 10bb range (monotonic)');

  // 15bb includes all 20bb
  const set15 = new Set(r15);
  const all20in15 = r20.every(h => set15.has(h));
  assert(all20in15, 'All 20bb hands are in 15bb range (monotonic)');

  // Ordering by size
  assert(r5.length >= r10.length, '5bb >= 10bb in size');
  assert(r10.length >= r15.length, '10bb >= 15bb in size');
  assert(r15.length >= r20.length, '15bb >= 20bb in size');

  // All hands in ranges are valid format
  for (const range of [r5, r10, r15, r20]) {
    for (const h of range) {
      assert(typeof h === 'string' && h.length >= 2 && h.length <= 3, `Push hand valid format: ${h}`);
    }
  }
}

// ============================================================================
// 3. DECISION_CONFIDENCE
// ============================================================================
section('DECISION_CONFIDENCE: thresholds');

{
  // DECISION_CONFIDENCE is defined in decision-bridge.js, not engine.js.
  // Import and test it separately.
  let dc;
  try {
    const bridge = await import('../src/lib/poker-brain/decision-bridge.js');
    dc = bridge.DECISION_CONFIDENCE;
  } catch (e) {
    dc = null;
  }

  assert(dc !== undefined && dc !== null, 'DECISION_CONFIDENCE exists (from decision-bridge)');

  if (dc && typeof dc === 'object') {
    const keys = Object.keys(dc);
    assert(keys.length >= 2, `DECISION_CONFIDENCE has ${keys.length} keys`);

    for (const [key, val] of Object.entries(dc)) {
      assert(typeof val === 'number', `DECISION_CONFIDENCE.${key} is number`);
      assert(Number.isFinite(val), `DECISION_CONFIDENCE.${key} is finite`);
      assert(val >= 0 && val <= 1, `DECISION_CONFIDENCE.${key} in [0,1]`);
    }

    if ('DEFAULT_FLOOR' in dc && 'STRONG_FLOOR' in dc) {
      assert(dc.DEFAULT_FLOOR <= dc.STRONG_FLOOR, 'DEFAULT_FLOOR <= STRONG_FLOOR');
    }
  }
}

// ============================================================================
// 4. expectedHoleCount
// ============================================================================
section('expectedHoleCount: variant → card count');

{
  assert(typeof E.expectedHoleCount === 'function', 'expectedHoleCount is function');

  assertEq(E.expectedHoleCount('nlhe'), 2, 'nlhe → 2');
  assertEq(E.expectedHoleCount('holdem'), 2, 'holdem → 2');
  assertEq(E.expectedHoleCount('plo'), 4, 'plo → 4');
  assertEq(E.expectedHoleCount('plo4'), 4, 'plo4 → 4');
  assertEq(E.expectedHoleCount('plo5'), 5, 'plo5 → 5');
  assertEq(E.expectedHoleCount('plo6'), 6, 'plo6 → 6');
  assertEq(E.expectedHoleCount('plo_hilo'), 4, 'plo_hilo → 4');
  assertEq(E.expectedHoleCount('plo8'), 4, 'plo8 → 4');

  // MTT is NLHE-based
  const mttCount = E.expectedHoleCount('mtt');
  assertEq(mttCount, 2, 'mtt → 2');
}

// ============================================================================
// 5. isHiLoVariant
// ============================================================================
section('isHiLoVariant: variant → boolean');

{
  assert(typeof E.isHiLoVariant === 'function', 'isHiLoVariant is function');

  assertEq(E.isHiLoVariant('plo_hilo'), true, 'plo_hilo → true');
  assertEq(E.isHiLoVariant('plo8'), true, 'plo8 → true');
  assertEq(E.isHiLoVariant('nlhe'), false, 'nlhe → false');
  assertEq(E.isHiLoVariant('holdem'), false, 'holdem → false');
  assertEq(E.isHiLoVariant('plo'), false, 'plo → false');
  assertEq(E.isHiLoVariant('plo4'), false, 'plo4 → false');
  assertEq(E.isHiLoVariant('plo5'), false, 'plo5 → false');
  assertEq(E.isHiLoVariant('plo6'), false, 'plo6 → false');
}

// ============================================================================
// 6. layout.json schema validation
// ============================================================================
section('layout.json: schema validation');

{
  let layout;
  try {
    const layoutPath = resolve(process.cwd(), 'src/lib/poker-brain/layout.json');
    layout = JSON.parse(readFileSync(layoutPath, 'utf-8'));
  } catch (e) {
    layout = null;
  }

  assert(layout !== null, 'layout.json loaded successfully');

  if (layout) {
    // referenceSize
    assert(layout.referenceSize !== undefined, 'Has referenceSize');
    assert(typeof layout.referenceSize === 'object', 'referenceSize is object');
    assert(typeof layout.referenceSize.w === 'number' && layout.referenceSize.w > 0, 'referenceSize.w > 0');
    assert(typeof layout.referenceSize.h === 'number' && layout.referenceSize.h > 0, 'referenceSize.h > 0');

    // boardCards
    assert(Array.isArray(layout.boardCards), 'boardCards is array');
    assertEq(layout.boardCards.length, 5, 'boardCards has 5 entries');
    for (let i = 0; i < layout.boardCards.length; i++) {
      const bc = layout.boardCards[i];
      assert(typeof bc.x === 'number', `boardCards[${i}].x is number`);
      assert(typeof bc.y === 'number', `boardCards[${i}].y is number`);
      assert(typeof bc.w === 'number' && bc.w > 0, `boardCards[${i}].w > 0`);
      assert(typeof bc.h === 'number' && bc.h > 0, `boardCards[${i}].h > 0`);
      assert(bc.x >= 0, `boardCards[${i}].x >= 0`);
      assert(bc.y >= 0, `boardCards[${i}].y >= 0`);
    }

    // holeCards
    assert(Array.isArray(layout.holeCards), 'holeCards is array');
    assert(layout.holeCards.length >= 2, 'holeCards has at least 2 entries');
    for (let i = 0; i < layout.holeCards.length; i++) {
      const hc = layout.holeCards[i];
      assert(typeof hc.x === 'number', `holeCards[${i}].x is number`);
      assert(typeof hc.y === 'number', `holeCards[${i}].y is number`);
      assert(typeof hc.w === 'number' && hc.w > 0, `holeCards[${i}].w > 0`);
      assert(typeof hc.h === 'number' && hc.h > 0, `holeCards[${i}].h > 0`);
    }

    // seats
    assert(Array.isArray(layout.seats), 'seats is array');
    assert(layout.seats.length >= 2, 'seats has at least 2 entries');
    for (const seat of layout.seats) {
      assert(typeof seat.id === 'string', `seat has id: ${seat.id}`);
      assert(typeof seat.x === 'number', `seat.x is number for ${seat.id}`);
      assert(typeof seat.y === 'number', `seat.y is number for ${seat.id}`);
    }

    // holeCardsByVariant (if present)
    if (layout.holeCardsByVariant) {
      assert(typeof layout.holeCardsByVariant === 'object', 'holeCardsByVariant is object');
      const variants = Object.keys(layout.holeCardsByVariant);
      assert(variants.length > 0, 'holeCardsByVariant has entries');
      for (const v of variants) {
        assert(Array.isArray(layout.holeCardsByVariant[v]), `holeCardsByVariant[${v}] is array`);
      }
    }

    // boardCards and holeCards don't overlap (different Y regions typically)
    if (layout.boardCards.length > 0 && layout.holeCards.length > 0) {
      const boardMinY = Math.min(...layout.boardCards.map(b => b.y));
      const boardMaxY = Math.max(...layout.boardCards.map(b => b.y + b.h));
      const holeMinY = Math.min(...layout.holeCards.map(h => h.y));
      const holeMaxY = Math.max(...layout.holeCards.map(h => h.y + h.h));
      // Board should generally be above hole cards (lower Y value)
      assert(boardMaxY < holeMinY || holeMaxY < boardMinY, 'Board and hole card regions don\'t overlap in Y');
    }
  }
}

// ============================================================================
// 7. Deck and utility constants
// ============================================================================
section('Deck and utility constants');

{
  // createDeck
  const deck = E.createDeck();
  assert(Array.isArray(deck), 'createDeck returns array');
  assertEq(deck.length, 52, 'Deck has 52 cards');

  // All cards have rank and suit
  for (const card of deck) {
    assert(typeof card.rank === 'string', `Card has rank: ${card.rank}`);
    assert(typeof card.suit === 'string', `Card has suit: ${card.suit}`);
  }

  // No duplicate cards
  const cardKeys = deck.map(c => `${c.rank}${c.suit}`);
  const uniqueKeys = new Set(cardKeys);
  assertEq(uniqueKeys.size, 52, 'No duplicate cards in deck');

  // calculatePotOdds
  const odds1 = E.calculatePotOdds(50, 100);
  assert(typeof odds1 === 'number', 'calculatePotOdds returns number');
  assert(Math.abs(odds1 - 33.33) < 1, `calculatePotOdds(50,100) ≈ 33.3% (got ${odds1})`);

  const odds0 = E.calculatePotOdds(0, 100);
  assertEq(odds0, 0, 'calculatePotOdds(0,100) = 0');

  // calculateStackToPot
  const stp = E.calculateStackToPot(1000, 100);
  assertEq(stp, 10, 'calculateStackToPot(1000,100) = 10');

  // expandHandCode
  const aa = E.expandHandCode('AA', []);
  assert(Array.isArray(aa), 'expandHandCode returns array');
  assertEq(aa.length, 6, 'AA = 6 combos');

  const aks = E.expandHandCode('AKs', []);
  assertEq(aks.length, 4, 'AKs = 4 combos');

  const ako = E.expandHandCode('AKo', []);
  assertEq(ako.length, 12, 'AKo = 12 combos');

  // Dead card removal
  const aaWithDead = E.expandHandCode('AA', [{ rank: 'A', suit: 's' }]);
  assertEq(aaWithDead.length, 3, 'AA with 1 dead ace = 3 combos');
}

// ============================================================================
// SUMMARY
// ============================================================================
console.log(`\n${'='.repeat(60)}`);
console.log(`CONFIG TESTS: ${pass} passed, ${fail} failed of ${pass + fail}`);
if (failures.length) {
  console.log('FAILURES:');
  failures.forEach(f => console.log('  - ' + f));
}
process.exit(fail > 0 ? 1 : 0);
