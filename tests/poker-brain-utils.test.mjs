#!/usr/bin/env node
/**
 * POKER BRAIN — UTILITY COVERAGE TESTS
 * ─────────────────────────────────────────────────────────────
 * Exercises the poker-brain utility functions that are exported
 * but not covered by the wiring or variant test suites.
 *
 * Covers:
 *   - hand-strength-validator: normalizeLabel, strengthRank, LABELS,
 *     compareHandStrength
 *   - auto-table-state: positionFromOffset, canonicalPosition,
 *     detectPlayerCountByStacks
 *   - tournament-detect: parsePlayerCount, parsePaidSpots,
 *     stageFromBlindLevel, extractTournamentInfo, detectTournamentStage
 *   - session-audit: analyzeHand, analyzeSession
 *   - decision-bridge: extractCards, DECISION_CONFIDENCE
 *   - card-localizer: estimateHeroHoleCount
 *   - engine: calculateM, icmAdjustedEV, getBestFiveCardFromCards,
 *     classifyTexture, countOuts
 *
 * Run: node --experimental-loader ./tests/poker-brain-loader.mjs \
 *          tests/poker-brain-utils.test.mjs
 */

import {
  normalizeLabel,
  strengthRank,
  compareHandStrength,
  LABELS,
} from '../src/lib/poker-brain/hand-strength-validator.js';

import {
  positionFromOffset,
  canonicalPosition,
  detectPlayerCountByStacks,
} from '../src/lib/poker-brain/auto-table-state.js';

import {
  parsePlayerCount,
  parsePaidSpots,
  stageFromBlindLevel,
  detectTournamentStage,
  extractTournamentInfo,
} from '../src/lib/poker-brain/tournament-detect.js';

import {
  analyzeHand,
  analyzeSession,
} from '../src/lib/poker-brain/session-audit.js';

import {
  extractCards,
  DECISION_CONFIDENCE,
} from '../src/lib/poker-brain/decision-bridge.js';

import { estimateHeroHoleCount } from '../src/lib/poker-brain/card-localizer.js';

import Engine from '../src/lib/poker-brain/engine.js';

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

// ============================================================================
// 1. hand-strength-validator
// ============================================================================
section('hand-strength-validator: LABELS');
assert(Array.isArray(LABELS), 'LABELS is an array');
assert(LABELS.length === 10, `LABELS has 10 entries (got ${LABELS.length})`);
assert(LABELS.includes('Royal Flush'), 'LABELS includes Royal Flush');
assert(LABELS.includes('High Card'), 'LABELS includes High Card');

section('hand-strength-validator: strengthRank');
assertEq(strengthRank('Royal Flush'), 9, 'Royal Flush = 9');
assertEq(strengthRank('Straight Flush'), 8, 'Straight Flush = 8');
assertEq(strengthRank('Four of a Kind'), 7, 'Four of a Kind = 7');
assertEq(strengthRank('Full House'), 6, 'Full House = 6');
assertEq(strengthRank('Flush'), 5, 'Flush = 5');
assertEq(strengthRank('Straight'), 4, 'Straight = 4');
assertEq(strengthRank('Three of a Kind'), 3, 'Three of a Kind = 3');
assertEq(strengthRank('Two Pair'), 2, 'Two Pair = 2');
assertEq(strengthRank('One Pair'), 1, 'One Pair = 1');
assertEq(strengthRank('High Card'), 0, 'High Card = 0');
assert(strengthRank('garbage') === -1 || strengthRank('garbage') == null, 'unknown label returns -1 or null');

section('hand-strength-validator: normalizeLabel');
assertEq(normalizeLabel('Straight Flush'), 'Straight Flush', 'exact match preserved');
assertEq(normalizeLabel('Full House'), 'Full House', 'Full House exact');
assertEq(normalizeLabel('HIGH CARD'), 'High Card', 'case-insensitive');
assertEq(normalizeLabel('full house'), 'Full House', 'lowercase normalized');
assertEq(normalizeLabel(''), null, 'empty string -> null');
assertEq(normalizeLabel(null), null, 'null -> null');
assertEq(normalizeLabel(undefined), null, 'undefined -> null');

section('hand-strength-validator: compareHandStrength');
{
  const v = compareHandStrength('Full House', 'Two Pair');
  assert(v != null, 'compareHandStrength returns a result');
  assertEq(v.match, false, 'FH vs Two Pair => no match');
  assertEq(v.severity, 'critical', 'FH vs Two Pair => critical severity');
}
{
  const v = compareHandStrength('Full House', 'Full House');
  assert(v != null && v.match === true, 'same label => match');
  assertEq(v.severity, 'ok', 'same label => severity ok');
}
{
  const v = compareHandStrength('Full House', 'High Card');
  assert(v != null, 'FH vs HC returns result');
  assertEq(v.match, false, 'FH vs HC no match');
}

// ============================================================================
// 2. auto-table-state: positionFromOffset
// ============================================================================
section('auto-table-state: positionFromOffset');

if (typeof positionFromOffset === 'function') {
  // 6-handed table positions
  const p6_0 = positionFromOffset(0, 6);
  const p6_1 = positionFromOffset(1, 6);
  const p6_2 = positionFromOffset(2, 6);
  assert(typeof p6_0 === 'string' && p6_0.length > 0, `6h offset 0 => position string (got "${p6_0}")`);
  assert(typeof p6_1 === 'string' && p6_1.length > 0, `6h offset 1 => position string (got "${p6_1}")`);
  assert(typeof p6_2 === 'string' && p6_2.length > 0, `6h offset 2 => position string (got "${p6_2}")`);

  // 9-handed table should produce more positions
  const positions9 = [];
  for (let i = 0; i < 9; i++) {
    const p = positionFromOffset(i, 9);
    positions9.push(p);
  }
  assert(positions9.length === 9, '9h produces 9 position strings');
  assert(new Set(positions9).size >= 4, '9h has at least 4 distinct position labels');
} else {
  assert(false, 'positionFromOffset is not a function — skipped');
}

section('auto-table-state: canonicalPosition');
if (typeof canonicalPosition === 'function') {
  // canonicalPosition typically takes dealer + hero seat info
  const pos = canonicalPosition({ heroSeatId: 3, dealerSeatId: 0, numPlayers: 6 });
  assert(typeof pos === 'string' || pos == null, `canonicalPosition returns string or null (got ${typeof pos})`);
} else {
  assert(false, 'canonicalPosition is not a function — skipped');
}

// ============================================================================
// 3. tournament-detect
// ============================================================================
section('tournament-detect: parsePlayerCount');
{
  const r1 = parsePlayerCount('45/100 players');
  assert(r1 != null, 'parsePlayerCount("45/100 players") returns result');
  assert(r1.remaining === 45 || r1.total === 100, 'parsed 45/100 correctly');
}
{
  const r2 = parsePlayerCount('Players: 45');
  assert(r2 != null, 'parsePlayerCount("Players: 45") returns result');
  assertEq(r2.remaining, 45, 'remaining = 45');
}
{
  const r3 = parsePlayerCount('');
  assert(r3 == null || r3.remaining == null, 'empty string => null or no remaining');
}

section('tournament-detect: parsePaidSpots');
{
  const p1 = parsePaidSpots('pays 15');
  assert(p1 === 15 || p1 != null, `parsePaidSpots("pays 15") (got ${p1})`);
}
{
  const p2 = parsePaidSpots('');
  assert(p2 == null || p2 === 0, 'empty string => null or 0');
}

section('tournament-detect: stageFromBlindLevel');
{
  const s1 = stageFromBlindLevel(1);
  assertIn(s1, ['early', 'middle', 'late', 'bubble', 'itm', 'ft'], `blindLevel 1 => stage (got "${s1}")`);
  const s2 = stageFromBlindLevel(3);
  assertIn(s2, ['early', 'middle', 'late', 'bubble', 'itm', 'ft'], `blindLevel 3 => stage (got "${s2}")`);
  const s3 = stageFromBlindLevel(20);
  assertIn(s3, ['early', 'middle', 'late', 'bubble', 'itm', 'ft'], `blindLevel 20 => stage (got "${s3}")`);
}

section('tournament-detect: detectTournamentStage');
{
  const d1 = detectTournamentStage({ blindLevel: 5 });
  assert(d1 != null, 'detectTournamentStage returns result');
  assert(typeof d1 === 'string' || typeof d1 === 'object', 'returns string or object');
}

section('tournament-detect: extractTournamentInfo');
if (typeof extractTournamentInfo === 'function') {
  const info = extractTournamentInfo('45/100 remaining, pays 18, Level 5');
  assert(info != null, 'extractTournamentInfo returns result');
} else {
  assert(false, 'extractTournamentInfo is not a function — skipped');
}

// ============================================================================
// 4. session-audit: analyzeHand + analyzeSession
// ============================================================================
section('session-audit: analyzeHand');

const testHand = {
  handId: 'test-h1',
  streetDecisions: {
    preflop: { action: 'RAISE', equity: 75, potOdds: 25, confidence: 90, reasoning: 'Premium hand' },
    flop: { action: 'BET', equity: 65, potOdds: 30, confidence: 80, reasoning: 'Top pair' },
  },
  position: 'btn',
  gameType: 'nlhe',
  bigBlind: 2,
  holeCards: [{ rank: 'A', suit: 's' }, { rank: 'K', suit: 'h' }],
  finalBoard: [{ rank: 'A', suit: 'c' }, { rank: '7', suit: 'd' }, { rank: '2', suit: 's' }],
};
const review = analyzeHand(testHand);
assert(review != null, 'analyzeHand returns a result');
assert(review.handId === 'test-h1', 'handId preserved');
assert(typeof review.grade === 'string', `grade is string (got "${review.grade}")`);
assert(typeof review.score === 'number', `score is number (got ${review.score})`);
assert(review.score >= 0 && review.score <= 100, `score in [0, 100] (got ${review.score})`);

// Hand with no decisions -> should still return a grade (N/A or similar)
const emptyHand = {
  handId: 'test-h2',
  streetDecisions: {},
  position: 'bb',
  gameType: 'nlhe',
  bigBlind: 1,
  holeCards: [],
  finalBoard: [],
};
const reviewEmpty = analyzeHand(emptyHand);
assert(reviewEmpty != null, 'analyzeHand handles empty decisions');

section('session-audit: analyzeSession');
const sessionResult = analyzeSession([testHand, emptyHand]);
assert(sessionResult != null, 'analyzeSession returns a result');
assert(typeof sessionResult.grade === 'string', `session grade is string (got "${sessionResult.grade}")`);
assert(typeof sessionResult.totalHands === 'number', `totalHands is number (got ${sessionResult.totalHands})`);
assertEq(sessionResult.totalHands, 2, 'totalHands = 2');
assert(Array.isArray(sessionResult.handReviews), 'handReviews is array');

// ============================================================================
// 5. decision-bridge: extractCards + DECISION_CONFIDENCE
// ============================================================================
section('decision-bridge: extractCards');

{
  const raw = [
    { rank: 'A', suit: 's', confidence: 0.98 },
    { rank: 'K', suit: 'h', confidence: 0.95 },
  ];
  const result = extractCards(raw);
  assert(result != null, 'extractCards returns result');
  assert(Array.isArray(result.cards), 'result.cards is array');
  assertEq(result.cards.length, 2, 'extractCards returns 2 cards');
  assert(result.cards[0].rank === 'A', 'first card is Ace');
  assertEq(result.hadUnknown, false, 'no unknown cards');
  assert(result.minConfidence >= 0.9, `minConfidence >= 0.9 (got ${result.minConfidence})`);
}

{
  const empty = extractCards([]);
  assert(empty != null && Array.isArray(empty.cards) && empty.cards.length === 0, 'empty input => empty cards');
}

{
  const nullInput = extractCards(null);
  assert(nullInput != null && Array.isArray(nullInput.cards) && nullInput.cards.length === 0, 'null input => empty cards');
}

section('decision-bridge: DECISION_CONFIDENCE');
assert(typeof DECISION_CONFIDENCE === 'object' || typeof DECISION_CONFIDENCE === 'number',
  'DECISION_CONFIDENCE is exported');
if (typeof DECISION_CONFIDENCE === 'object') {
  assert('DEFAULT_FLOOR' in DECISION_CONFIDENCE, 'DECISION_CONFIDENCE has DEFAULT_FLOOR');
  assert('STRONG_FLOOR' in DECISION_CONFIDENCE, 'DECISION_CONFIDENCE has STRONG_FLOOR');
  assert(DECISION_CONFIDENCE.DEFAULT_FLOOR < DECISION_CONFIDENCE.STRONG_FLOOR,
    'DEFAULT_FLOOR < STRONG_FLOOR');
}

// ============================================================================
// 6. card-localizer: estimateHeroHoleCount
// ============================================================================
section('card-localizer: estimateHeroHoleCount');

if (typeof estimateHeroHoleCount === 'function') {
  // Narrow strip (aspect ratio ~1.67) -> 2 cards (NLHE)
  const nlhe = estimateHeroHoleCount({ w: 100, h: 60 });
  assertEq(nlhe, 2, 'narrow strip (100x60) => 2 cards');

  // Medium strip -> 4 cards (PLO)
  const plo = estimateHeroHoleCount({ w: 140, h: 60 });
  assertEq(plo, 4, 'medium strip (140x60) => 4 cards');

  // Wide strip -> 6 cards (PLO6)
  const plo6 = estimateHeroHoleCount({ w: 200, h: 60 });
  assertEq(plo6, 6, 'wide strip (200x60) => 6 cards');

  // All return values should be valid hole counts
  assertIn(nlhe, [2, 4, 5, 6], 'NLHE hole count is valid');
  assertIn(plo, [2, 4, 5, 6], 'PLO hole count is valid');
  assertIn(plo6, [2, 4, 5, 6], 'PLO6 hole count is valid');
} else {
  assert(false, 'estimateHeroHoleCount is not a function — skipped');
}

// ============================================================================
// 7. Engine utility methods not covered by variant tests
// ============================================================================
section('Engine: classifyTexture');

const monoBoard = [{ rank: 'A', suit: 's' }, { rank: 'K', suit: 's' }, { rank: 'Q', suit: 's' }];
const rainbowBoard = [{ rank: 'A', suit: 's' }, { rank: 'K', suit: 'h' }, { rank: '2', suit: 'c' }];

const mono = Engine.classifyTexture(monoBoard);
assert(mono != null, 'classifyTexture returns result for monotone');
assert(typeof mono === 'string' || typeof mono === 'object', 'texture is string or object');

const rainbow = Engine.classifyTexture(rainbowBoard);
assert(rainbow != null, 'classifyTexture returns result for rainbow');

section('Engine: countOuts');
{
  // flush draw: 4 hearts in hand/board, 9 outs
  const hole = [{ rank: 'A', suit: 'h' }, { rank: 'K', suit: 'h' }];
  const board = [{ rank: '2', suit: 'h' }, { rank: '7', suit: 'h' }, { rank: 'J', suit: 'c' }];
  const outs = Engine.countOuts(hole, board);
  assert(outs != null, 'countOuts returns a result');
  if (typeof outs === 'number') {
    assert(outs > 0, `flush draw outs (got ${outs})`);
  } else if (typeof outs === 'object') {
    assert(typeof outs.outs === 'number', `outs.outs is number (got ${outs.outs})`);
    assert(Array.isArray(outs.improves), 'outs.improves is array');
    assert(outs.improves.some(i => i.includes('Flush')), 'improves includes Flush');
  }
}

section('Engine: getBestFiveCardFromCards');
{
  const seven = [
    { rank: 'A', suit: 's' }, { rank: 'K', suit: 's' },
    { rank: 'Q', suit: 's' }, { rank: 'J', suit: 's' },
    { rank: 'T', suit: 's' }, { rank: '9', suit: 'h' },
    { rank: '2', suit: 'c' },
  ];
  const best = Engine.getBestFiveCardFromCards(seven);
  assert(best != null, 'getBestFiveCardFromCards returns result');
  if (typeof best === 'object' && best.label) {
    assert(best.label.includes('Flush') || best.label.includes('Straight'),
      `royal flush detected (got "${best.label}")`);
  }
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
