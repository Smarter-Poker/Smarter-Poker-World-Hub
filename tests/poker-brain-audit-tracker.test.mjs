#!/usr/bin/env node

/**
 * Poker Brain — Session Audit + Table State Tracker + Hand Strength Validator Tests
 * ==================================================================================
 * Covers three previously untested modules:
 *   1. session-audit.js — analyzeHand, analyzeSession, leak detection
 *   2. table-state-tracker.js — temporal smoothing, EMA, mode voting, sticky position
 *   3. hand-strength-validator.js — normalizeLabel, compareHandStrength, strengthRank
 *
 * Run:
 *   node --loader ./tests/poker-brain-loader.mjs tests/poker-brain-audit-tracker.test.mjs
 */

import assert from 'assert';

let pass = 0, fail = 0;
const failures = [];

function section(name) { console.log('\n' + name); }

function test(cond, msg) {
  if (cond) { pass++; console.log('  \u2713 ' + msg); }
  else { fail++; failures.push(msg); console.log('  \u2717 ' + msg); }
}

function testEq(a, b, msg) {
  test(a === b, `${msg} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`);
}

// ============================================================================
// PART 1: Session Audit
// ============================================================================

section('=== PART 1: Session Audit — analyzeHand ===');

const { analyzeHand, analyzeSession } = await import('../src/lib/poker-brain/session-audit.js');

// Empty hand
{
  const r = analyzeHand(null);
  testEq(r.grade, null, 'analyzeHand: null hand -> null grade');
}

{
  const r = analyzeHand({ handId: 'h1' });
  test(r.comments && r.comments[0] === 'No decision data', 'analyzeHand: missing streetDecisions -> No decision data');
}

// Strong hand played aggressively
{
  const hand = {
    handId: 'h2',
    streetDecisions: {
      preflop: { action: 'RAISE', equity: 75, potOdds: 20, confidence: 85 },
      flop: { action: 'RAISE', equity: 80, potOdds: 30, confidence: 90 },
    },
    position: 'BTN',
    gameType: 'nlhe',
    bigBlind: 2,
    holeCards: [{ rank: 'A', suit: 's' }, { rank: 'A', suit: 'h' }],
    finalBoard: [],
  };
  const r = analyzeHand(hand);
  test(r.score >= 70, `analyzeHand: strong aggressive play scores well (${r.score})`);
  test(r.grade === 'A' || r.grade === 'B', `analyzeHand: strong play gets A or B (${r.grade})`);
  testEq(r.mistakes.length, 0, 'analyzeHand: no mistakes for strong play');
}

// Folding with positive equity = mistake
{
  const hand = {
    handId: 'h3',
    streetDecisions: {
      flop: { action: 'FOLD', equity: 60, potOdds: 30, confidence: 70 },
    },
    position: 'CO',
    gameType: 'nlhe',
    bigBlind: 2,
    holeCards: [{ rank: 'K', suit: 's' }, { rank: 'Q', suit: 's' }],
    finalBoard: [],
  };
  const r = analyzeHand(hand);
  test(r.score < 50, `analyzeHand: folding 60% equity scores poorly (${r.score})`);
  test(r.mistakes.length > 0, 'analyzeHand: folding with equity flagged as mistake');
}

// Correct fold with bad equity
{
  const hand = {
    handId: 'h4',
    streetDecisions: {
      river: { action: 'FOLD', equity: 15, potOdds: 40, confidence: 80 },
    },
    position: 'UTG',
    gameType: 'nlhe',
    bigBlind: 2,
    holeCards: [],
    finalBoard: [],
  };
  const r = analyzeHand(hand);
  test(r.score >= 55, `analyzeHand: correct fold with bad equity scores well (${r.score})`);
}

section('=== PART 1b: Session Audit — analyzeSession ===');

// Empty session
{
  const r = analyzeSession([]);
  testEq(r.grade, 'N/A', 'analyzeSession: empty hands -> N/A grade');
  testEq(r.totalHands, 0, 'analyzeSession: empty -> 0 total hands');
}

// Session with over-folding leak
{
  const hands = [];
  for (let i = 0; i < 10; i++) {
    hands.push({
      handId: `h${i}`,
      streetDecisions: {
        flop: { action: 'FOLD', equity: 55, potOdds: 25, confidence: 70 },
      },
      position: 'BB',
      gameType: 'nlhe',
      bigBlind: 2,
      holeCards: [],
      finalBoard: [],
    });
  }
  const r = analyzeSession(hands);
  test(r.leaks.some(l => l.type === 'over-folding'), 'analyzeSession: detects over-folding leak');
  test(r.recommendations.length > 0, 'analyzeSession: generates recommendations');
  testEq(r.totalHands, 10, 'analyzeSession: correct total hands');
}

// Session with calling station pattern
{
  const hands = [];
  for (let i = 0; i < 10; i++) {
    hands.push({
      handId: `cs${i}`,
      streetDecisions: {
        turn: { action: 'CALL', equity: 15, potOdds: 30, confidence: 60 },
      },
      position: 'CO',
      gameType: 'nlhe',
      bigBlind: 2,
      holeCards: [],
      finalBoard: [],
    });
  }
  const r = analyzeSession(hands);
  test(r.leaks.some(l => l.type === 'calling-station'), 'analyzeSession: detects calling-station leak');
}

// Mixed good session
{
  const hands = [
    {
      handId: 'g1',
      streetDecisions: {
        preflop: { action: 'RAISE', equity: 80, potOdds: 15, confidence: 90 },
        flop: { action: 'RAISE', equity: 85, potOdds: 20, confidence: 92 },
      },
      position: 'BTN', gameType: 'nlhe', bigBlind: 2, holeCards: [], finalBoard: [],
    },
    {
      handId: 'g2',
      streetDecisions: {
        preflop: { action: 'FOLD', equity: 12, potOdds: 50, confidence: 80 },
      },
      position: 'UTG', gameType: 'nlhe', bigBlind: 2, holeCards: [], finalBoard: [],
    },
  ];
  const r = analyzeSession(hands);
  test(r.overallScore >= 60, `analyzeSession: good session scores well (${r.overallScore})`);
  testEq(r.handsAnalyzed, 2, 'analyzeSession: analyzed 2 hands');
  test(Object.keys(r.positionBreakdown).length > 0, 'analyzeSession: position breakdown populated');
}

// ============================================================================
// PART 2: Table State Tracker
// ============================================================================

section('=== PART 2: Table State Tracker ===');

const { TableStateTracker } = await import('../src/lib/poker-brain/table-state-tracker.js');

// Initial state
{
  const t = new TableStateTracker();
  const s = t.snapshot();
  test(s.bounds === null, 'TableStateTracker: initial bounds = null');
  testEq(s.playerCount, 0, 'TableStateTracker: initial playerCount = 0');
  test(s.variant === null, 'TableStateTracker: initial variant = null');
  test(s.position === null, 'TableStateTracker: initial position = null');
  test(s.dealerPoint === null, 'TableStateTracker: initial dealerPoint = null');
}

// Bounds EMA smoothing
{
  const t = new TableStateTracker();
  t.update({ tableBounds: { x: 100, y: 200, w: 400, h: 300, confidence: 0.9 } });
  const s1 = t.snapshot();
  testEq(s1.bounds.x, 100, 'Bounds: first observation accepted exactly');
  testEq(s1.bounds.w, 400, 'Bounds: first width accepted exactly');

  // Slightly different — should EMA smooth
  t.update({ tableBounds: { x: 110, y: 200, w: 400, h: 300, confidence: 0.9 } });
  const s2 = t.snapshot();
  test(s2.bounds.x > 100 && s2.bounds.x < 110, `Bounds: EMA smoothed x (${s2.bounds.x})`);
}

// Bounds outlier rejection
{
  const t = new TableStateTracker();
  t.update({ tableBounds: { x: 100, y: 200, w: 400, h: 300, confidence: 0.9 } });
  // Large jump with LOW confidence — should be rejected
  t.update({ tableBounds: { x: 500, y: 200, w: 400, h: 300, confidence: 0.3 } });
  const s = t.snapshot();
  test(s.bounds.x < 200, `Bounds: large jump rejected with low confidence (x=${s.bounds.x})`);
}

// Bounds large jump accepted with high confidence
{
  const t = new TableStateTracker();
  t.update({ tableBounds: { x: 100, y: 200, w: 400, h: 300, confidence: 0.9 } });
  t.update({ tableBounds: { x: 500, y: 200, w: 400, h: 300, confidence: 0.8 } });
  const s = t.snapshot();
  testEq(s.bounds.x, 500, 'Bounds: large jump accepted with high confidence');
}

// Player count mode voting
{
  const t = new TableStateTracker();
  // Need MIN_OBSERVED (3) matching values in WINDOW (8)
  t.update({ playerCount: 6 });
  t.update({ playerCount: 6 });
  testEq(t.snapshot().playerCount, 0, 'PlayerCount: not committed with only 2 observations');

  t.update({ playerCount: 6 });
  testEq(t.snapshot().playerCount, 6, 'PlayerCount: committed after 3 matching observations');
}

// Player count noisy input — mode wins
{
  const t = new TableStateTracker();
  t.update({ playerCount: 6 });
  t.update({ playerCount: 5 }); // noise
  t.update({ playerCount: 6 });
  t.update({ playerCount: 6 });
  testEq(t.snapshot().playerCount, 6, 'PlayerCount: mode(6) wins over noise(5)');
}

// Variant mode voting
{
  const t = new TableStateTracker();
  t.update({ variant: 'plo' });
  t.update({ variant: 'plo' });
  testEq(t.snapshot().variant, null, 'Variant: not committed with only 2 observations');

  t.update({ variant: 'plo' });
  testEq(t.snapshot().variant, 'plo', 'Variant: committed after 3 matching observations');
}

// Position sticky/agreement filter
{
  const t = new TableStateTracker();
  t.update({ position: 'BTN' });
  testEq(t.snapshot().position, null, 'Position: not committed after 1 frame');

  t.update({ position: 'BTN' });
  testEq(t.snapshot().position, null, 'Position: not committed after 2 frames');

  t.update({ position: 'BTN' });
  testEq(t.snapshot().position, 'BTN', 'Position: committed after 3 agreements');
}

// Position resets on disagreement
{
  const t = new TableStateTracker();
  t.update({ position: 'CO' });
  t.update({ position: 'CO' });
  t.update({ position: 'SB' }); // disagreement
  t.update({ position: 'SB' });
  testEq(t.snapshot().position, null, 'Position: interrupted agreement doesnt commit');

  t.update({ position: 'SB' });
  testEq(t.snapshot().position, 'SB', 'Position: new agreement commits SB');
}

// Dealer point EMA
{
  const t = new TableStateTracker();
  t.update({
    tableBounds: { x: 0, y: 0, w: 400, h: 300, confidence: 0.9 },
    dealerPoint: { x: 100, y: 150 },
  });
  testEq(t.snapshot().dealerPoint.x, 100, 'DealerPoint: first observation accepted');

  t.update({ dealerPoint: { x: 110, y: 155 } });
  const s = t.snapshot();
  test(s.dealerPoint.x > 100 && s.dealerPoint.x <= 110, `DealerPoint: EMA smoothed (${s.dealerPoint.x})`);
}

// Reset clears everything
{
  const t = new TableStateTracker();
  t.update({ tableBounds: { x: 100, y: 200, w: 400, h: 300, confidence: 0.9 } });
  t.update({ playerCount: 6 });
  t.update({ playerCount: 6 });
  t.update({ playerCount: 6 });
  t.reset();
  const s = t.snapshot();
  test(s.bounds === null, 'Reset: bounds cleared');
  testEq(s.playerCount, 0, 'Reset: playerCount cleared');
  testEq(s.frame, 0, 'Reset: frame counter cleared');
}

// 'unknown' position is ignored
{
  const t = new TableStateTracker();
  t.update({ position: 'unknown' });
  t.update({ position: 'unknown' });
  t.update({ position: 'unknown' });
  testEq(t.snapshot().position, null, 'Position: unknown values ignored');
}

// ============================================================================
// PART 3: Hand Strength Validator
// ============================================================================

section('=== PART 3: Hand Strength Validator ===');

const { normalizeLabel, compareHandStrength, strengthRank } =
  await import('../src/lib/poker-brain/hand-strength-validator.js');

// normalizeLabel
testEq(normalizeLabel('One Pair'), 'One Pair', 'normalizeLabel: exact match');
testEq(normalizeLabel('one pair'), 'One Pair', 'normalizeLabel: case insensitive');
testEq(normalizeLabel('  Full House  '), 'Full House', 'normalizeLabel: whitespace trimmed');
testEq(normalizeLabel('flush!'), 'Flush', 'normalizeLabel: strips punctuation');
testEq(normalizeLabel('Your hand: Straight Flush'), 'Straight Flush', 'normalizeLabel: substring match');
testEq(normalizeLabel('pair of aces'), 'One Pair', 'normalizeLabel: fuzzy pair match');
testEq(normalizeLabel('two pair'), 'Two Pair', 'normalizeLabel: fuzzy two pair');
testEq(normalizeLabel('trips'), 'Three of a Kind', 'normalizeLabel: trips fuzzy');
testEq(normalizeLabel('boat'), 'Full House', 'normalizeLabel: boat = Full House');
testEq(normalizeLabel(null), null, 'normalizeLabel: null input -> null');
testEq(normalizeLabel(''), null, 'normalizeLabel: empty string -> null');
testEq(normalizeLabel('gibberish xyz'), null, 'normalizeLabel: unrecognizable -> null');

// strengthRank
testEq(strengthRank('High Card'), 0, 'strengthRank: High Card = 0');
testEq(strengthRank('One Pair'), 1, 'strengthRank: One Pair = 1');
testEq(strengthRank('Royal Flush'), 9, 'strengthRank: Royal Flush = 9');
testEq(strengthRank('Unknown'), -1, 'strengthRank: unknown = -1');

// compareHandStrength
{
  const r = compareHandStrength('Flush', 'Flush');
  test(r.match === true, 'compareHandStrength: exact match');
  testEq(r.severity, 'ok', 'compareHandStrength: exact match severity = ok');
}

{
  const r = compareHandStrength('Flush', 'Straight');
  test(r.match === false, 'compareHandStrength: one-off mismatch');
  testEq(r.severity, 'warn', 'compareHandStrength: one-off = warn');
}

{
  const r = compareHandStrength('Flush', 'One Pair');
  test(r.match === false, 'compareHandStrength: big mismatch');
  testEq(r.severity, 'critical', 'compareHandStrength: big mismatch = critical');
}

{
  const r = compareHandStrength(null, 'Flush');
  testEq(r.severity, 'unknown', 'compareHandStrength: null engine label = unknown');
}

{
  const r = compareHandStrength('Flush', 'asdfghjkl');
  testEq(r.severity, 'unknown', 'compareHandStrength: unrecognizable OCR = unknown');
}

// ============================================================================
// PART 4: Source code checks
// ============================================================================

section('=== PART 4: Storage Source Hardening ===');

import { readFileSync } from 'fs';
import { resolve } from 'path';

const storageSrc = readFileSync(resolve(process.cwd(), 'src/lib/poker-brain/storage.js'), 'utf8');

test(storageSrc.includes('_dbInstance'), 'storage.js has pooled IndexedDB connection (_dbInstance)');
test(storageSrc.includes('_dbPromise'), 'storage.js deduplicates concurrent open requests');
test(storageSrc.includes('onclose'), 'storage.js clears cache on connection close');
test(storageSrc.includes('destroy()'), 'storage.js has destroy() for cleanup');
test(storageSrc.includes('removeEventListener'), 'storage.js removes window listeners in destroy');
test(!storageSrc.includes('.single()'), 'storage.js has no .single() calls');

// ============================================================================
// Summary
// ============================================================================

console.log(`\n${'='.repeat(60)}`);
console.log(`PASSED: ${pass}   FAILED: ${fail}   TOTAL: ${pass + fail}`);
if (failures.length) {
  console.log('\nFailures:');
  failures.forEach(f => console.log('  - ' + f));
}
console.log(`${'='.repeat(60)}`);
process.exit(fail > 0 ? 1 : 0);
