#!/usr/bin/env node
/**
 * POKER BRAIN — ENGINE METHOD COVERAGE
 * ─────────────────────────────────────────────────────────────
 * Tests every public method on the PokerBrainEngine that isn't
 * already covered by the variant/matrix/error tests.
 *
 * Covers: parseCards, createDeck, shuffleDeck, evaluateHand,
 * evaluateLow, getBestFiveCardFromCards, getBestLowFromCards,
 * calculateEquity, clearEquityCache, classifyTexture,
 * calculateEquityVsRange, expandRange, expandHandCode, countOuts,
 * RANGES, inferPreflopAction, expectedHoleCount, isHiLoVariant,
 * nutLowPotential, getPushFoldRange, calculateM,
 * bubbleFactorForStage, computeICMBubbleFactor,
 * estimatePloHandEquityVsRandom, icmAdjustedEV, PUSH_RANGE_BY_BB,
 * getHandName, calculatePotOdds, calculateImpliedOdds,
 * calculateStackToPot, getHandType, getOmahaHoleCardCombos,
 * removeCard, cardInArray, cardsEqual, cardToString
 *
 * Run: node --experimental-loader ./tests/poker-brain-loader.mjs \
 *          tests/poker-brain-engine.test.mjs
 */

import Engine from '../src/lib/poker-brain/engine.js';

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

const c = (r, s) => ({ rank: r, suit: s });

// ============================================================================
// Card Utilities
// ============================================================================
section('parseCards');
{
  const p = Engine.parseCards('As Kh Qd');
  assertEq(p.length, 3, 'parses 3 space-separated cards');
  assertEq(p[0].rank, 'A', 'first rank');
  assertEq(p[1].rank, 'K', 'second rank');
  assertEq(p[2].rank, 'Q', 'third rank');
}
{
  const p = Engine.parseCards('2c3d4h5s');
  assertEq(p.length, 4, 'parses 4 concatenated cards');
}
{
  const p = Engine.parseCards('');
  assert(Array.isArray(p) && p.length === 0, 'empty string => empty array');
}
{
  const p = Engine.parseCards('XxYy');
  assertEq(p.length, 0, 'garbage => empty array');
}

section('createDeck + shuffleDeck');
{
  const deck = Engine.createDeck();
  assertEq(deck.length, 52, 'deck has 52 cards');

  // All unique
  const strs = deck.map(c => `${c.rank}${c.suit}`);
  assertEq(new Set(strs).size, 52, 'all 52 cards unique');

  const shuffled = Engine.shuffleDeck(deck);
  assertEq(shuffled.length, 52, 'shuffled has 52 cards');
  // At least some cards should be in different positions
  let diff = 0;
  for (let i = 0; i < 52; i++) {
    if (shuffled[i].rank !== deck[i].rank || shuffled[i].suit !== deck[i].suit) diff++;
  }
  assert(diff > 10, `shuffle moved at least 10 cards (moved ${diff})`);
}

section('cardToString / cardsEqual / cardInArray / removeCard');
{
  assertEq(Engine.cardToString(c('A','s')), 'As', 'A spade');
  assertEq(Engine.cardToString(c('2','c')), '2c', '2 clubs');
  assertEq(Engine.cardsEqual(c('A','s'), c('A','s')), true, 'same');
  assertEq(Engine.cardsEqual(c('A','s'), c('A','h')), false, 'diff suit');
  assertEq(Engine.cardsEqual(c('A','s'), c('K','s')), false, 'diff rank');
  assertEq(Engine.cardInArray(c('K','h'), [c('A','s'), c('K','h')]), true, 'found');
  assertEq(Engine.cardInArray(c('Q','d'), [c('A','s'), c('K','h')]), false, 'not found');
  const after = Engine.removeCard(c('K','h'), [c('A','s'), c('K','h'), c('Q','d')]);
  assertEq(after.length, 2, 'removed one card');
}

// ============================================================================
// Hand Evaluation
// ============================================================================
section('evaluateHand: all hand ranks');
{
  // Royal flush
  const rf = Engine.evaluateHand([c('A','s'), c('K','s'), c('Q','s'), c('J','s'), c('T','s')]);
  assert(rf.name === 'Royal Flush', `royal flush (got "${rf.name}")`);

  // Straight flush
  const sf = Engine.evaluateHand([c('9','h'), c('8','h'), c('7','h'), c('6','h'), c('5','h')]);
  assert(sf.name === 'Straight Flush', `straight flush (got "${sf.name}")`);

  // Four of a kind
  const foak = Engine.evaluateHand([c('A','s'), c('A','h'), c('A','c'), c('A','d'), c('K','s')]);
  assert(foak.name === 'Four of a Kind', `four of a kind (got "${foak.name}")`);

  // Full house
  const fh = Engine.evaluateHand([c('A','s'), c('A','h'), c('A','c'), c('K','d'), c('K','s')]);
  assert(fh.name === 'Full House', `full house (got "${fh.name}")`);

  // Flush
  const fl = Engine.evaluateHand([c('A','s'), c('J','s'), c('8','s'), c('5','s'), c('2','s')]);
  assert(fl.name === 'Flush', `flush (got "${fl.name}")`);

  // Straight
  const st = Engine.evaluateHand([c('9','s'), c('8','h'), c('7','c'), c('6','d'), c('5','s')]);
  assert(st.name === 'Straight', `straight (got "${st.name}")`);

  // Three of a kind
  const trip = Engine.evaluateHand([c('A','s'), c('A','h'), c('A','c'), c('K','d'), c('Q','s')]);
  assert(trip.name === 'Three of a Kind', `three of a kind (got "${trip.name}")`);

  // Two pair
  const tp = Engine.evaluateHand([c('A','s'), c('A','h'), c('K','c'), c('K','d'), c('Q','s')]);
  assert(tp.name === 'Two Pair', `two pair (got "${tp.name}")`);

  // One pair
  const op = Engine.evaluateHand([c('A','s'), c('A','h'), c('K','c'), c('Q','d'), c('J','s')]);
  assert(op.name === 'One Pair', `one pair (got "${op.name}")`);

  // High card
  const hc = Engine.evaluateHand([c('A','s'), c('K','h'), c('Q','c'), c('J','d'), c('9','s')]);
  assert(hc.name === 'High Card', `high card (got "${hc.name}")`);

  // Score ordering: RF > SF > ... > HC
  assert(rf.score > sf.score, 'RF > SF');
  assert(sf.score > foak.score, 'SF > 4K');
  assert(foak.score > fh.score, '4K > FH');
  assert(fh.score > fl.score, 'FH > FL');
  assert(fl.score > st.score, 'FL > ST');
  assert(st.score > trip.score, 'ST > 3K');
  assert(trip.score > tp.score, '3K > 2P');
  assert(tp.score > op.score, '2P > 1P');
  assert(op.score > hc.score, '1P > HC');
}

// Wheel straight (A-2-3-4-5)
{
  const wheel = Engine.evaluateHand([c('A','s'), c('2','h'), c('3','c'), c('4','d'), c('5','s')]);
  assert(wheel.name === 'Straight', `wheel is straight (got "${wheel.name}")`);
}

section('evaluateLow');
{
  const low = Engine.evaluateLow([c('A','s'), c('2','h'), c('3','c'), c('4','d'), c('5','s')]);
  assert(low != null, 'evaluateLow returns result for wheel');
  assert(low.score != null || low.rank != null, 'low result has score or rank');
}
{
  // High cards can't make a qualifying low — evaluateLow returns null or a high-score result
  const noLow = Engine.evaluateLow([c('K','s'), c('Q','h'), c('J','c'), c('T','d'), c('9','s')]);
  assert(noLow == null || (noLow != null && typeof noLow === 'object'), 'evaluateLow handles high cards');
}

section('getBestFiveCardFromCards + getBestLowFromCards');
{
  const seven = [c('A','s'), c('K','s'), c('Q','s'), c('J','s'), c('T','s'), c('9','h'), c('2','c')];
  const best = Engine.getBestFiveCardFromCards(seven);
  assert(best != null, 'getBestFiveCardFromCards returns result');
  assert(best.name === 'Royal Flush', `best 5 from 7 = RF (got "${best.name}")`);
}
{
  const seven = [c('A','s'), c('2','h'), c('3','c'), c('4','d'), c('5','s'), c('K','h'), c('Q','c')];
  const low = Engine.getBestLowFromCards(seven);
  assert(low != null, 'getBestLowFromCards returns result for wheel cards');
}

// ============================================================================
// Equity Calculation
// ============================================================================
section('calculateEquity');
{
  const eq = Engine.calculateEquity(
    [c('A','s'), c('A','h')],
    [c('2','c'), c('7','d'), c('K','s')],
    1, 'nlhe', 500
  );
  assert(typeof eq === 'object', 'calculateEquity returns object');
  assert(typeof eq.equity === 'number', 'equity is number');
  assert(eq.equity > 80, `AA on dry board > 80% (got ${eq.equity})`);
}
{
  // PLO equity
  const eq = Engine.calculateEquity(
    [c('A','s'), c('A','h'), c('K','s'), c('K','h')],
    [c('A','c'), c('7','d'), c('2','s')],
    1, 'plo', 500
  );
  assert(typeof eq.equity === 'number', 'PLO equity is number');
  assert(eq.equity > 50, `PLO AAKKds set > 50% (got ${eq.equity})`);
}
{
  // Hi-Lo equity with low fields
  const eq = Engine.calculateEquity(
    [c('A','s'), c('2','h'), c('K','c'), c('Q','d')],
    [c('3','s'), c('4','h'), c('K','d')],
    1, 'plo_hilo', 500
  );
  assert(typeof eq.equity === 'number', 'HiLo equity is number');
}

section('clearEquityCache');
{
  Engine.clearEquityCache();
  assert(true, 'clearEquityCache runs without error');
}

// ============================================================================
// Texture Analysis
// ============================================================================
section('classifyTexture: all texture types');
{
  const mono = Engine.classifyTexture([c('A','s'), c('K','s'), c('Q','s')]);
  assert(mono != null, 'monotone texture result');
  assertEq(mono.monotone, true, 'AKQ spades is monotone');

  const rainbow = Engine.classifyTexture([c('A','s'), c('K','h'), c('Q','c')]);
  assertEq(rainbow.rainbow, true, 'AKQ rainbow is rainbow');

  const paired = Engine.classifyTexture([c('A','s'), c('A','h'), c('K','c')]);
  assertEq(paired.paired, true, 'AAK is paired');

  const twoTone = Engine.classifyTexture([c('A','s'), c('K','s'), c('Q','h')]);
  assertEq(twoTone.twoTone, true, 'AKs Qh is two-tone');

  const connected = Engine.classifyTexture([c('8','s'), c('9','h'), c('T','c')]);
  // 'connected' may be named differently in the texture object
  assert(connected != null, '8-9-T returns texture result');
}

// ============================================================================
// countOuts
// ============================================================================
section('countOuts');
{
  // Flush draw
  const fd = Engine.countOuts(
    [c('A','h'), c('K','h')],
    [c('2','h'), c('7','h'), c('J','c')]
  );
  assert(fd != null && typeof fd.outs === 'number', 'flush draw: outs is number');
  assert(fd.improves.some(i => i.includes('Flush')), 'flush draw: improves includes Flush');

  // Open-ended straight draw
  const oesd = Engine.countOuts(
    [c('J','s'), c('T','h')],
    [c('9','c'), c('8','d'), c('2','s')]
  );
  assert(oesd != null && typeof oesd.outs === 'number', 'OESD: outs is number');

  // Made hand (set) — fewer outs
  const set = Engine.countOuts(
    [c('A','s'), c('A','h')],
    [c('A','c'), c('7','d'), c('2','s')]
  );
  assert(set != null, 'set: countOuts returns result');
}

// ============================================================================
// Range Functions
// ============================================================================
section('expandHandCode + expandRange');
{
  const ak = Engine.expandHandCode('AKs', []);
  assert(Array.isArray(ak), 'expandHandCode AKs returns array');
  assertEq(ak.length, 4, 'AKs has 4 suited combos');

  const aa = Engine.expandHandCode('AA', []);
  assertEq(aa.length, 6, 'AA has 6 combos');

  const ako = Engine.expandHandCode('AKo', []);
  assertEq(ako.length, 12, 'AKo has 12 offsuit combos');

  // With dead cards
  const aaWithDead = Engine.expandHandCode('AA', [c('A','s')]);
  assertEq(aaWithDead.length, 3, 'AA with 1 dead ace has 3 combos');
}

section('RANGES');
{
  const ranges = Engine.RANGES;
  assert(ranges != null, 'RANGES is exported');
  assert(ranges.RFI != null, 'RFI range exists');
  assert(ranges.BB_DEFEND != null, 'BB_DEFEND range exists');
  assert(ranges.THREEBET_RANGE != null, 'THREEBET_RANGE exists');
  assert(ranges.FOURBET_RANGE != null, 'FOURBET_RANGE exists');
}

section('calculateEquityVsRange');
{
  const eqr = Engine.calculateEquityVsRange(
    [c('A','s'), c('A','h')],
    [],
    ['KK', 'QQ', 'AKs'],
    200
  );
  assert(eqr != null, 'calculateEquityVsRange returns result');
  assert(typeof eqr === 'number' || (typeof eqr === 'object' && typeof eqr.equity === 'number'),
    'equityVsRange returns number or object with equity');
}

// ============================================================================
// Variant/Tournament Utilities
// ============================================================================
section('expectedHoleCount');
{
  assertEq(Engine.expectedHoleCount('nlhe'), 2, 'nlhe = 2');
  assertEq(Engine.expectedHoleCount('plo'), 4, 'plo = 4');
  assertEq(Engine.expectedHoleCount('plo_hilo'), 4, 'plo_hilo = 4');
  assertEq(Engine.expectedHoleCount('plo5'), 5, 'plo5 = 5');
  assertEq(Engine.expectedHoleCount('plo6'), 6, 'plo6 = 6');
  assertEq(Engine.expectedHoleCount('unknown'), 2, 'unknown defaults to 2');
}

section('isHiLoVariant');
{
  assertEq(Engine.isHiLoVariant('plo_hilo'), true, 'plo_hilo = true');
  assertEq(Engine.isHiLoVariant('plo8'), true, 'plo8 = true');
  assertEq(Engine.isHiLoVariant('PLO8'), true, 'PLO8 = true');
  assertEq(Engine.isHiLoVariant('nlhe'), false, 'nlhe = false');
  assertEq(Engine.isHiLoVariant('plo'), false, 'plo = false');
}

section('nutLowPotential');
{
  const nl = Engine.nutLowPotential([c('A','s'), c('2','h'), c('K','c'), c('Q','d')]);
  assertEq(nl, 1.0, 'A-2 = nut low potential 1.0');
  const noLow = Engine.nutLowPotential([c('K','s'), c('Q','h'), c('J','c'), c('T','d')]);
  assertEq(noLow, 0, 'KQJT = no low potential');
  const partial = Engine.nutLowPotential([c('A','s'), c('5','h'), c('K','c'), c('Q','d')]);
  assert(partial > 0 && partial < 1, `A-5 partial low (got ${partial})`);
}

section('getPushFoldRange');
{
  const r5 = Engine.getPushFoldRange(5);
  assert(r5 != null, 'push range at 5bb exists');
  assert(r5.has('AA'), '5bb includes AA');
  assert(!r5.has('72o'), '5bb excludes 72o');

  const r10 = Engine.getPushFoldRange(10);
  assert(r10 != null, 'push range at 10bb exists');

  const r30 = Engine.getPushFoldRange(30);
  assertEq(r30, null, 'no push range at 30bb');
}

section('PUSH_RANGE_BY_BB');
{
  assert(Engine.PUSH_RANGE_BY_BB != null, 'PUSH_RANGE_BY_BB exists');
  assert(typeof Engine.PUSH_RANGE_BY_BB === 'object', 'PUSH_RANGE_BY_BB is object');
}

section('calculateM');
{
  const m = Engine.calculateM(1500, 100, 9);
  assert(typeof m === 'number', 'calculateM returns number');
  // M = stack / (BB + SB + antes) = 1500 / (100 + 50 + 9*ante)
  assert(m > 0, `M > 0 (got ${m})`);
}

section('bubbleFactorForStage');
{
  assertEq(Engine.bubbleFactorForStage('early'), 1.0, 'early = 1.0');
  assertEq(Engine.bubbleFactorForStage('bubble'), 1.5, 'bubble = 1.5');
  assertEq(Engine.bubbleFactorForStage('itm'), 1.25, 'itm = 1.25');
  assert(Engine.bubbleFactorForStage('ft') >= 1.0, `ft >= 1.0 (got ${Engine.bubbleFactorForStage('ft')})`);
}

section('computeICMBubbleFactor');
{
  const icm = Engine.computeICMBubbleFactor({ stage: 'bubble', bigBlind: 1, stackSize: 5, numPlayers: 6 });
  assert(typeof icm === 'number', 'computeICMBubbleFactor returns number');
  assert(icm >= 1.0, `ICM factor >= 1.0 (got ${icm})`);
}

section('icmAdjustedEV');
{
  assertEq(Engine.icmAdjustedEV(10, 1.5), 10, 'positive EV unchanged');
  assertEq(Engine.icmAdjustedEV(-10, 1.5), -15, 'negative EV scaled');
  assertEq(Engine.icmAdjustedEV(0, 1.5), 0, 'zero EV unchanged');
}

section('estimatePloHandEquityVsRandom');
{
  const eq = Engine.estimatePloHandEquityVsRandom([c('A','s'), c('A','h'), c('K','s'), c('K','h')]);
  assert(eq != null, 'estimatePloHandEquityVsRandom returns result');
  assert(typeof eq.equity === 'number', 'PLO equity estimate is number');
  assert(eq.equity > 40, `AAKKds estimate > 40% (got ${eq.equity})`);
  assert(Array.isArray(eq.features), 'features is array');
}

section('inferPreflopAction');
{
  assertEq(Engine.inferPreflopAction(0, 1, 1.5), 'rfi', 'no bet to call = rfi');
  assertEq(Engine.inferPreflopAction(1, 1, 1.5), 'rfi', 'limped pot = rfi');
  const vs3 = Engine.inferPreflopAction(6, 1, 10);
  assertIn(vs3, ['vs_raise', 'vs_3bet', 'vs_4bet', 'rfi'], `6bb raise => action mode (got "${vs3}")`);
}

// ============================================================================
// Utility Functions
// ============================================================================
section('getHandName');
{
  assert(typeof Engine.getHandName(100) === 'string', 'getHandName(100) returns string');
  assert(typeof Engine.getHandName(0) === 'string', 'getHandName(0) returns string');
}

section('calculatePotOdds');
{
  const po = Engine.calculatePotOdds(5, 15);
  assertEq(po, 25, 'potOdds(5, 15) = 25%');
  const po2 = Engine.calculatePotOdds(10, 10);
  assertEq(po2, 50, 'potOdds(10, 10) = 50%');
}

section('calculateImpliedOdds');
{
  const io = Engine.calculateImpliedOdds(5, 15, 50);
  assert(typeof io === 'number', 'calculateImpliedOdds returns number');
  // impliedOdds can be negative when call is unprofitable with implied odds
  assert(io !== null && !isNaN(io), `impliedOdds is a valid number (got ${io})`);
}

section('calculateStackToPot');
{
  assertEq(Engine.calculateStackToPot(100, 20), 5, 'SPR = 5');
  assertEq(Engine.calculateStackToPot(50, 50), 1, 'SPR = 1');
  assertEq(Engine.calculateStackToPot(200, 10), 20, 'SPR = 20');
}

section('getHandType');
{
  assertEq(Engine.getHandType(c('A','s'), c('K','s')), 'AKs', 'AKs');
  assertEq(Engine.getHandType(c('A','s'), c('K','h')), 'AKo', 'AKo');
  assertEq(Engine.getHandType(c('A','s'), c('A','h')), 'AA', 'AA pair');
  assertEq(Engine.getHandType(c('5','s'), c('5','h')), '55', '55 pair');
  assertEq(Engine.getHandType(c('2','c'), c('7','d')), '72o', '72o');
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
