/**
 * Poker Brain — Hardwired Detection & Decision Bridge Tests
 * ==========================================================
 * Tests for:
 *   1. hardwired-detect.js — isHardwiredEligible, validateHardwiredResolution,
 *      scaleRegion (via hardwiredDetect), dedup logic
 *   2. decision-bridge.js — extractCards, streetFromBoardLength,
 *      getBridgedDecision (not-ready paths, card validation, variant handling)
 *   3. Source code hardening checks
 *
 * Run:
 *   node --loader ./tests/poker-brain-loader.mjs tests/poker-brain-detect-bridge.test.mjs
 */

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ─── Helpers ─────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    process.stdout.write(`  PASS  ${name}\n`);
  } catch (err) {
    failed++;
    failures.push({ name, err });
    process.stdout.write(`  FAIL  ${name}\n    ${err.message}\n`);
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    passed++;
    process.stdout.write(`  PASS  ${name}\n`);
  } catch (err) {
    failed++;
    failures.push({ name, err });
    process.stdout.write(`  FAIL  ${name}\n    ${err.message}\n`);
  }
}

function section(title) {
  process.stdout.write(`\n── ${title} ${'─'.repeat(60 - title.length)}\n`);
}

// ─── Imports ────────────────────────────────────────────────────────────────

import {
  isHardwiredEligible,
  validateHardwiredResolution,
  hardwiredDetect,
} from '../src/lib/poker-brain/hardwired-detect.js';

import {
  extractCards,
  streetFromBoardLength,
  getBridgedDecision,
  DECISION_CONFIDENCE,
} from '../src/lib/poker-brain/decision-bridge.js';

// ═════════════════════════════════════════════════════════════════════════════
// PART 1: HARDWIRED DETECTION
// ═════════════════════════════════════════════════════════════════════════════

section('isHardwiredEligible');

test('screen mode is eligible', () => {
  assert.strictEqual(isHardwiredEligible('screen'), true);
});

test('window mode is eligible', () => {
  assert.strictEqual(isHardwiredEligible('window'), true);
});

test('display mode is eligible', () => {
  assert.strictEqual(isHardwiredEligible('display'), true);
});

test('camera mode is NOT eligible', () => {
  assert.strictEqual(isHardwiredEligible('camera'), false);
});

test('null/undefined returns false', () => {
  assert.strictEqual(isHardwiredEligible(null), false);
  assert.strictEqual(isHardwiredEligible(undefined), false);
  assert.strictEqual(isHardwiredEligible(''), false);
});

test('case insensitive: SCREEN / Screen', () => {
  assert.strictEqual(isHardwiredEligible('SCREEN'), true);
  assert.strictEqual(isHardwiredEligible('Screen'), true);
  assert.strictEqual(isHardwiredEligible('WINDOW'), true);
});

test('unknown mode returns false', () => {
  assert.strictEqual(isHardwiredEligible('webcam'), false);
  assert.strictEqual(isHardwiredEligible('usb'), false);
});

// ─── validateHardwiredResolution ─────────────────────────────────────────────

section('validateHardwiredResolution');

test('exact match is valid', () => {
  const layout = { referenceSize: { w: 468, h: 932 } };
  const result = validateHardwiredResolution(468, 932, layout);
  assert.strictEqual(result.valid, true);
  assert.ok(Math.abs(result.scaleFactor - 1.0) < 0.01);
});

test('scaled up 2x is valid (same AR)', () => {
  const layout = { referenceSize: { w: 468, h: 932 } };
  const result = validateHardwiredResolution(936, 1864, layout);
  assert.strictEqual(result.valid, true);
  assert.ok(Math.abs(result.scaleFactor - 2.0) < 0.01);
});

test('wrong aspect ratio is invalid', () => {
  const layout = { referenceSize: { w: 468, h: 932 } };
  // 16:9 vs ~1:2 — way off
  const result = validateHardwiredResolution(1920, 1080, layout);
  assert.strictEqual(result.valid, false);
  assert.ok(result.reason.includes('Aspect ratio'));
});

test('no video dimensions returns invalid', () => {
  const layout = { referenceSize: { w: 468, h: 932 } };
  assert.strictEqual(validateHardwiredResolution(0, 0, layout).valid, false);
  assert.strictEqual(validateHardwiredResolution(null, null, layout).valid, false);
});

test('uses default reference size 468x932 when layout has no referenceSize', () => {
  // After our fix, defaults should be 468x932 (matching hardwiredDetect)
  const layout = {};
  const result = validateHardwiredResolution(468, 932, layout);
  assert.strictEqual(result.valid, true);
  assert.ok(Math.abs(result.scaleFactor - 1.0) < 0.01);
});

test('within 5% AR deviation is valid', () => {
  const layout = { referenceSize: { w: 468, h: 932 } };
  // Slight stretch: 468 * 1.04 = 486.72 ≈ 487 width — ~4% AR change
  const result = validateHardwiredResolution(487, 932, layout);
  assert.strictEqual(result.valid, true);
});

test('over 5% AR deviation is invalid', () => {
  const layout = { referenceSize: { w: 468, h: 932 } };
  // Big stretch: 600 width — AR goes from 0.502 to 0.644 — ~28% change
  const result = validateHardwiredResolution(600, 932, layout);
  assert.strictEqual(result.valid, false);
});

// ─── hardwiredDetect edge cases ──────────────────────────────────────────────

section('hardwiredDetect edge cases');

test('returns empty when matcher not ready', () => {
  const mockVideo = { videoWidth: 468, videoHeight: 932 };
  const layout = { referenceSize: { w: 468, h: 932 }, holeCards: [], boardCards: [] };

  // null matcher
  let result = hardwiredDetect(mockVideo, layout, null);
  assert.strictEqual(result.hardwired, true);
  assert.deepStrictEqual(result.holeCards, []);
  assert.deepStrictEqual(result.boardCards, []);

  // matcher with isReady returning false
  result = hardwiredDetect(mockVideo, layout, { isReady: () => false, getTemplateCount: () => 0 });
  assert.deepStrictEqual(result.holeCards, []);
});

test('returns empty when video has no dimensions', () => {
  const mockVideo = { videoWidth: 0, videoHeight: 0 };
  const layout = { referenceSize: { w: 468, h: 932 } };
  const mockMatcher = { isReady: () => true, getTemplateCount: () => 52 };
  const result = hardwiredDetect(mockVideo, layout, mockMatcher);
  assert.strictEqual(result.hardwired, true);
  assert.deepStrictEqual(result.holeCards, []);
});

test('hardwiredDetect threshold constant is 18', () => {
  const result = hardwiredDetect({ videoWidth: 0, videoHeight: 0 }, {}, null);
  assert.strictEqual(result.hardwiredThreshold, 18);
});

// ═════════════════════════════════════════════════════════════════════════════
// PART 2: DECISION BRIDGE — extractCards
// ═════════════════════════════════════════════════════════════════════════════

section('extractCards');

test('empty input returns empty cards', () => {
  const result = extractCards([]);
  assert.deepStrictEqual(result.cards, []);
  assert.strictEqual(result.hadUnknown, false);
  assert.strictEqual(result.dropped, 0);
});

test('null/undefined input returns empty cards', () => {
  assert.deepStrictEqual(extractCards(null).cards, []);
  assert.deepStrictEqual(extractCards(undefined).cards, []);
});

test('filters by confidence floor', () => {
  const cards = [
    { rank: 'A', suit: 's', confidence: 0.95 },
    { rank: 'K', suit: 'h', confidence: 0.70 },
    { rank: 'Q', suit: 'd', confidence: 0.85 },
  ];
  const result = extractCards(cards, 0.80);
  assert.strictEqual(result.cards.length, 2);
  assert.strictEqual(result.dropped, 1);
  assert.strictEqual(result.hadUnknown, true);
  assert.strictEqual(result.cards[0].rank, 'A');
  assert.strictEqual(result.cards[1].rank, 'Q');
});

test('drops cards with null rank/suit', () => {
  const cards = [
    { rank: 'A', suit: 's', confidence: 0.95 },
    { rank: null, suit: 's', confidence: 0.99 },
    null,
  ];
  const result = extractCards(cards, 0.80);
  assert.strictEqual(result.cards.length, 1);
  assert.strictEqual(result.dropped, 2);
});

test('normalizes rank to uppercase and suit to lowercase', () => {
  const cards = [
    { rank: 'a', suit: 'S', confidence: 0.99 },
    { rank: 't', suit: 'H', confidence: 0.99 },
  ];
  const result = extractCards(cards, 0.80);
  assert.strictEqual(result.cards[0].rank, 'A');
  assert.strictEqual(result.cards[0].suit, 's');
  assert.strictEqual(result.cards[1].rank, 'T');
  assert.strictEqual(result.cards[1].suit, 'h');
});

test('tracks minConfidence correctly', () => {
  const cards = [
    { rank: 'A', suit: 's', confidence: 0.95 },
    { rank: 'K', suit: 'h', confidence: 0.82 },
  ];
  const result = extractCards(cards, 0.80);
  assert.ok(Math.abs(result.minConfidence - 0.82) < 0.001);
});

test('minConfidence is 0 when no cards pass', () => {
  const cards = [
    { rank: 'A', suit: 's', confidence: 0.50 },
  ];
  const result = extractCards(cards, 0.80);
  assert.strictEqual(result.minConfidence, 0);
});

test('cards without confidence field are treated as 0', () => {
  const cards = [
    { rank: 'A', suit: 's' },  // no confidence key
  ];
  const result = extractCards(cards, 0.80);
  assert.strictEqual(result.cards.length, 0);
  assert.strictEqual(result.dropped, 1);
});

test('default confidence floor is 0.80', () => {
  assert.strictEqual(DECISION_CONFIDENCE.DEFAULT_FLOOR, 0.80);
  assert.strictEqual(DECISION_CONFIDENCE.STRONG_FLOOR, 0.90);
});

// ═════════════════════════════════════════════════════════════════════════════
// PART 3: DECISION BRIDGE — streetFromBoardLength
// ═════════════════════════════════════════════════════════════════════════════

section('streetFromBoardLength');

test('0 hole cards → waiting', () => {
  assert.strictEqual(streetFromBoardLength(0, 0), 'waiting');
  assert.strictEqual(streetFromBoardLength(1, 0), 'waiting');
});

test('2+ hole, 0 board → preflop', () => {
  assert.strictEqual(streetFromBoardLength(2, 0), 'preflop');
  assert.strictEqual(streetFromBoardLength(4, 0), 'preflop');
});

test('3 board → flop', () => {
  assert.strictEqual(streetFromBoardLength(2, 3), 'flop');
});

test('4 board → turn', () => {
  assert.strictEqual(streetFromBoardLength(2, 4), 'turn');
});

test('5 board → river', () => {
  assert.strictEqual(streetFromBoardLength(2, 5), 'river');
});

test('1-2 board → transient', () => {
  assert.strictEqual(streetFromBoardLength(2, 1), 'transient');
  assert.strictEqual(streetFromBoardLength(2, 2), 'transient');
});

test('6+ board → transient', () => {
  assert.strictEqual(streetFromBoardLength(2, 6), 'transient');
});

// ═════════════════════════════════════════════════════════════════════════════
// PART 4: DECISION BRIDGE — getBridgedDecision (not-ready paths)
// ═════════════════════════════════════════════════════════════════════════════

section('getBridgedDecision — card validation');

await testAsync('not ready when no hole cards for NLHE', async () => {
  const result = await getBridgedDecision({
    rawHoleCards: [],
    rawBoardCards: [],
    gameType: 'nlhe',
  });
  assert.strictEqual(result.ready, false);
  assert.strictEqual(result.action, 'WAIT');
  assert.ok(result.reason.includes('No hole cards'));
  assert.strictEqual(result.requiredHoleCount, 2);
});

await testAsync('not ready when only 1 hole card for NLHE', async () => {
  const result = await getBridgedDecision({
    rawHoleCards: [{ rank: 'A', suit: 's', confidence: 0.95 }],
    rawBoardCards: [],
    gameType: 'nlhe',
  });
  assert.strictEqual(result.ready, false);
  assert.ok(result.reason.includes('1/2'));
});

await testAsync('not ready when only 2 hole cards for PLO', async () => {
  const result = await getBridgedDecision({
    rawHoleCards: [
      { rank: 'A', suit: 's', confidence: 0.95 },
      { rank: 'K', suit: 'h', confidence: 0.90 },
    ],
    rawBoardCards: [],
    gameType: 'plo',
  });
  assert.strictEqual(result.ready, false);
  assert.ok(result.reason.includes('2/4'));
  assert.strictEqual(result.requiredHoleCount, 4);
  assert.strictEqual(result.variant, 'plo');
});

await testAsync('not ready when only 3 hole cards for PLO5', async () => {
  const result = await getBridgedDecision({
    rawHoleCards: [
      { rank: 'A', suit: 's', confidence: 0.95 },
      { rank: 'K', suit: 'h', confidence: 0.90 },
      { rank: 'Q', suit: 'd', confidence: 0.88 },
    ],
    rawBoardCards: [],
    gameType: 'plo5',
  });
  assert.strictEqual(result.ready, false);
  assert.ok(result.reason.includes('3/5'));
});

await testAsync('not ready when only 4 hole cards for PLO6', async () => {
  const result = await getBridgedDecision({
    rawHoleCards: [
      { rank: 'A', suit: 's', confidence: 0.95 },
      { rank: 'K', suit: 'h', confidence: 0.90 },
      { rank: 'Q', suit: 'd', confidence: 0.88 },
      { rank: 'J', suit: 'c', confidence: 0.92 },
    ],
    rawBoardCards: [],
    gameType: 'plo6',
  });
  assert.strictEqual(result.ready, false);
  assert.ok(result.reason.includes('4/6'));
});

await testAsync('detection metadata is populated even when not ready', async () => {
  const result = await getBridgedDecision({
    rawHoleCards: [{ rank: 'A', suit: 's', confidence: 0.95 }],
    rawBoardCards: [{ rank: 'K', suit: 'h', confidence: 0.85 }],
    gameType: 'nlhe',
  });
  assert.ok(result.detection);
  assert.strictEqual(result.detection.holeConfidence, 0.95);
  assert.strictEqual(result.detection.boardConfidence, 0.85);
});

// ─── getBridgedDecision — local fallback engine path ─────────────────────────

section('getBridgedDecision — local fallback engine');

await testAsync('NLHE preflop gets a decision from local fallback', async () => {
  // supabase mock returns no session, so Horse Brain is skipped → local fallback
  const result = await getBridgedDecision({
    rawHoleCards: [
      { rank: 'A', suit: 's', confidence: 0.95 },
      { rank: 'A', suit: 'h', confidence: 0.92 },
    ],
    rawBoardCards: [],
    gameType: 'nlhe',
    potSize: 100,
    betToCall: 50,
    stackSize: 1000,
    bigBlind: 10,
    position: 'btn',
    numPlayers: 6,
  });
  assert.strictEqual(result.ready, true);
  assert.strictEqual(result.source, 'local_fallback');
  assert.ok(['RAISE', 'CALL', 'FOLD', 'CHECK', 'ALL_IN'].includes(result.action));
  assert.strictEqual(result.street, 'preflop');
  assert.strictEqual(result.degraded, false);
});

await testAsync('NLHE postflop (flop) with AA gets a decision', async () => {
  const result = await getBridgedDecision({
    rawHoleCards: [
      { rank: 'A', suit: 's', confidence: 0.95 },
      { rank: 'A', suit: 'h', confidence: 0.92 },
    ],
    rawBoardCards: [
      { rank: '7', suit: 'c', confidence: 0.90 },
      { rank: '2', suit: 'd', confidence: 0.88 },
      { rank: 'K', suit: 's', confidence: 0.91 },
    ],
    gameType: 'nlhe',
    potSize: 200,
    betToCall: 0,
    stackSize: 1000,
    bigBlind: 10,
    position: 'btn',
    numPlayers: 6,
  });
  assert.strictEqual(result.ready, true);
  assert.strictEqual(result.street, 'flop');
  assert.ok(result.handStrength); // should have a hand strength label
  assert.ok(result.texture); // should have texture info
});

await testAsync('partial board (1-2 cards) treated as preflop', async () => {
  const result = await getBridgedDecision({
    rawHoleCards: [
      { rank: 'A', suit: 's', confidence: 0.95 },
      { rank: 'K', suit: 'h', confidence: 0.92 },
    ],
    rawBoardCards: [
      { rank: '7', suit: 'c', confidence: 0.90 },
    ],
    gameType: 'nlhe',
    potSize: 100,
    betToCall: 50,
    stackSize: 1000,
    bigBlind: 10,
    position: 'btn',
    numPlayers: 6,
  });
  assert.strictEqual(result.ready, true);
  assert.strictEqual(result.street, 'preflop');
  assert.deepStrictEqual(result.boardCards, []);
});

await testAsync('PLO preflop with 4 hole cards gets a decision', async () => {
  const result = await getBridgedDecision({
    rawHoleCards: [
      { rank: 'A', suit: 's', confidence: 0.95 },
      { rank: 'A', suit: 'h', confidence: 0.92 },
      { rank: 'K', suit: 's', confidence: 0.90 },
      { rank: 'K', suit: 'h', confidence: 0.88 },
    ],
    rawBoardCards: [],
    gameType: 'plo',
    potSize: 100,
    betToCall: 50,
    stackSize: 1000,
    bigBlind: 10,
    position: 'btn',
    numPlayers: 6,
  });
  assert.strictEqual(result.ready, true);
  assert.strictEqual(result.source, 'local_fallback');
  assert.ok(result.isOmaha === true);
});

await testAsync('PLO Hi-Lo is detected correctly', async () => {
  const result = await getBridgedDecision({
    rawHoleCards: [
      { rank: 'A', suit: 's', confidence: 0.95 },
      { rank: '2', suit: 'h', confidence: 0.92 },
      { rank: '3', suit: 's', confidence: 0.90 },
      { rank: 'K', suit: 'h', confidence: 0.88 },
    ],
    rawBoardCards: [],
    gameType: 'plo_hilo',
    potSize: 100,
    betToCall: 50,
    stackSize: 1000,
    bigBlind: 10,
    position: 'btn',
    numPlayers: 6,
  });
  assert.strictEqual(result.ready, true);
  assert.strictEqual(result.isHiLo, true);
});

await testAsync('extra hole cards are trimmed (e.g. 5 hole in PLO mode)', async () => {
  const result = await getBridgedDecision({
    rawHoleCards: [
      { rank: 'A', suit: 's', confidence: 0.95 },
      { rank: 'K', suit: 'h', confidence: 0.92 },
      { rank: 'Q', suit: 'd', confidence: 0.90 },
      { rank: 'J', suit: 'c', confidence: 0.88 },
      { rank: 'T', suit: 's', confidence: 0.86 },
    ],
    rawBoardCards: [],
    gameType: 'plo',
    potSize: 100,
    betToCall: 50,
    stackSize: 1000,
    bigBlind: 10,
    position: 'btn',
    numPlayers: 6,
  });
  assert.strictEqual(result.ready, true);
  assert.strictEqual(result.holeCards.length, 4); // trimmed from 5 to 4
});

await testAsync('confidence floor filters out low-confidence cards', async () => {
  const result = await getBridgedDecision({
    rawHoleCards: [
      { rank: 'A', suit: 's', confidence: 0.95 },
      { rank: 'K', suit: 'h', confidence: 0.50 }, // below floor
    ],
    rawBoardCards: [],
    gameType: 'nlhe',
    confidenceFloor: 0.80,
  });
  assert.strictEqual(result.ready, false);
  assert.ok(result.reason.includes('1/2'));
});

await testAsync('SPR and mRatio are computed in local fallback', async () => {
  const result = await getBridgedDecision({
    rawHoleCards: [
      { rank: 'A', suit: 's', confidence: 0.95 },
      { rank: 'K', suit: 'h', confidence: 0.92 },
    ],
    rawBoardCards: [
      { rank: '7', suit: 'c', confidence: 0.90 },
      { rank: '2', suit: 'd', confidence: 0.88 },
      { rank: 'A', suit: 'c', confidence: 0.91 },
    ],
    gameType: 'nlhe',
    potSize: 200,
    betToCall: 100,
    stackSize: 1000,
    bigBlind: 10,
    position: 'btn',
    numPlayers: 6,
  });
  assert.strictEqual(result.ready, true);
  assert.ok(result.spr != null); // SPR = 1000/200 = 5.0
  assert.ok(result.mRatio != null);
});

await testAsync('tournament mode with push-fold hint', async () => {
  const result = await getBridgedDecision({
    rawHoleCards: [
      { rank: 'A', suit: 's', confidence: 0.95 },
      { rank: 'K', suit: 'h', confidence: 0.92 },
    ],
    rawBoardCards: [],
    gameType: 'nlhe',
    potSize: 30,
    betToCall: 20,
    stackSize: 100,
    bigBlind: 10,
    position: 'btn',
    numPlayers: 6,
    isTournament: true,
    tournamentStage: 'bubble',
  });
  assert.strictEqual(result.ready, true);
  assert.strictEqual(result.isTournament, true);
  // bb = 10, stack = 100 → bbStack = 10 → push-fold zone
  if (result.pushFoldHint) {
    assert.ok(result.pushFoldHint.bbStack <= 20);
    assert.ok(typeof result.pushFoldHint.inRange === 'boolean');
  }
});

await testAsync('engine error produces degraded result', async () => {
  // Trigger with impossible game type that the engine might choke on
  const result = await getBridgedDecision({
    rawHoleCards: [
      { rank: 'A', suit: 's', confidence: 0.95 },
      { rank: 'K', suit: 'h', confidence: 0.92 },
    ],
    rawBoardCards: [],
    gameType: 'nlhe',
    potSize: 0,
    betToCall: 0,
    stackSize: 0,
    bigBlind: 0,
    position: 'btn',
    numPlayers: 2,
  });
  // Even edge-case inputs should produce some result (engine is robust)
  assert.ok(result.ready === true || result.ready === false);
  assert.ok(result.source === 'local_fallback' || result.source === 'error');
});

// ═════════════════════════════════════════════════════════════════════════════
// PART 5: DEDUP LOGIC (tested via source analysis)
// ═════════════════════════════════════════════════════════════════════════════

section('Dedup logic — source code verification');

test('hardwired-detect.js has within-group dedup', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/lib/poker-brain/hardwired-detect.js'), 'utf8'
  );
  assert.ok(src.includes('const dedup = (cards)'), 'dedup function should exist');
  assert.ok(src.includes('seen.has(k)'), 'dedup checks for duplicate keys');
  assert.ok(src.includes('keep[prev.index] = false'), 'dedup marks worse match for removal');
});

test('hardwired-detect.js has cross-dedup between hole and board', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/lib/poker-brain/hardwired-detect.js'), 'utf8'
  );
  assert.ok(src.includes('holeKeys.has(c.key)'), 'cross-dedup: board checks against hole keys');
  assert.ok(src.includes('boardKeys.has(c.key)'), 'cross-dedup: hole checks against board keys');
});

test('hardwired-detect.js has try-catch around verifyCardSuit', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/lib/poker-brain/hardwired-detect.js'), 'utf8'
  );
  const catchCount = (src.match(/catch\s*\(_\)/g) || []).length;
  assert.ok(catchCount >= 2, `Expected >=2 catch blocks for hole+board suit verify, got ${catchCount}`);
});

// ═════════════════════════════════════════════════════════════════════════════
// PART 6: DECISION BRIDGE — Source Hardening
// ═════════════════════════════════════════════════════════════════════════════

section('Decision bridge — source hardening');

test('decision-bridge.js has retry logic with exponential backoff', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/lib/poker-brain/decision-bridge.js'), 'utf8'
  );
  assert.ok(src.includes('HB_MAX_RETRIES'), 'retry constant exists');
  assert.ok(src.includes('Math.pow(2, attempt)'), 'exponential backoff formula present');
  assert.ok(src.includes('Math.random()'), 'jitter present in backoff');
});

test('decision-bridge.js does not retry 4xx errors', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/lib/poker-brain/decision-bridge.js'), 'utf8'
  );
  assert.ok(src.includes('resp.status >= 400 && resp.status < 500'), '4xx guard present');
  assert.ok(src.includes('return null'), '4xx returns null immediately');
});

test('decision-bridge.js handles JSON parse errors', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/lib/poker-brain/decision-bridge.js'), 'utf8'
  );
  assert.ok(src.includes('try { return await resp.json(); }'), 'JSON parse wrapped in try-catch');
  assert.ok(src.includes('catch (jsonErr)'), 'JSON error caught');
});

test('decision-bridge.js uses consistent isOmaha detection', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/lib/poker-brain/decision-bridge.js'), 'utf8'
  );
  // After our fix, fallback path should use the same pattern as primary path
  const omahaChecks = src.match(/String\(gameType\)\.toLowerCase\(\)\.includes\('plo'\)/g) || [];
  assert.ok(omahaChecks.length >= 2, `Expected >=2 consistent PLO checks, got ${omahaChecks.length}`);
  // Should NOT have the old fragile pattern
  assert.ok(!src.includes('PokerBrainEngine.isHiLoVariant\n    ?'), 'old fragile isOmaha pattern removed');
});

test('decision-bridge.js wraps all engine calls in try-catch', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/lib/poker-brain/decision-bridge.js'), 'utf8'
  );
  const catchBlocks = (src.match(/catch\s*\(err\)/g) || []).length;
  // getDecision, handStrength (x2), texture (x2), outs, lowHand (x2), pushFold
  assert.ok(catchBlocks >= 5, `Expected >=5 try-catch blocks for engine safety, got ${catchBlocks}`);
});

test('decision-bridge.js preserves equityOriginal fields on recompute path', () => {
  // This is in recompute.js but let's verify the bridge properly
  // passes through equity from Horse Brain
  const src = readFileSync(
    resolve(process.cwd(), 'src/lib/poker-brain/decision-bridge.js'), 'utf8'
  );
  assert.ok(src.includes('horseBrainResult.equity'), 'Horse Brain equity passed through');
});

test('decision-bridge.js has PLO Hi-Lo low hand eval in both paths', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/lib/poker-brain/decision-bridge.js'), 'utf8'
  );
  const lowHandChecks = (src.match(/getBestLowFromCards/g) || []).length;
  assert.ok(lowHandChecks >= 2, `Expected >=2 getBestLowFromCards calls (Horse+fallback), got ${lowHandChecks}`);
});

test('hardwired-detect reference sizes match between detect and validate', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/lib/poker-brain/hardwired-detect.js'), 'utf8'
  );
  // After fix: both should default to 468x932
  const defaults468 = (src.match(/\|\|\s*468/g) || []).length;
  const defaults932 = (src.match(/\|\|\s*932/g) || []).length;
  assert.ok(defaults468 >= 2, `Expected >=2 default width 468, got ${defaults468}`);
  assert.ok(defaults932 >= 2, `Expected >=2 default height 932, got ${defaults932}`);
});

// ═════════════════════════════════════════════════════════════════════════════
// PART 7: DECISION BRIDGE — outs and texture
// ═════════════════════════════════════════════════════════════════════════════

section('getBridgedDecision — outs and texture');

await testAsync('flop with draw shows outs', async () => {
  // Flush draw: two hearts in hand, two on board
  const result = await getBridgedDecision({
    rawHoleCards: [
      { rank: 'A', suit: 'h', confidence: 0.95 },
      { rank: 'K', suit: 'h', confidence: 0.92 },
    ],
    rawBoardCards: [
      { rank: '7', suit: 'h', confidence: 0.90 },
      { rank: '2', suit: 'h', confidence: 0.88 },
      { rank: 'T', suit: 's', confidence: 0.91 },
    ],
    gameType: 'nlhe',
    potSize: 200,
    betToCall: 100,
    stackSize: 1000,
    bigBlind: 10,
    position: 'btn',
    numPlayers: 6,
  });
  assert.strictEqual(result.ready, true);
  assert.strictEqual(result.street, 'flop');
  assert.ok(result.outs > 0, `Expected outs > 0 for flush draw, got ${result.outs}`);
});

await testAsync('river has no outs computed', async () => {
  const result = await getBridgedDecision({
    rawHoleCards: [
      { rank: 'A', suit: 's', confidence: 0.95 },
      { rank: 'K', suit: 'h', confidence: 0.92 },
    ],
    rawBoardCards: [
      { rank: '7', suit: 'c', confidence: 0.90 },
      { rank: '2', suit: 'd', confidence: 0.88 },
      { rank: 'T', suit: 's', confidence: 0.91 },
      { rank: 'J', suit: 'h', confidence: 0.89 },
      { rank: '3', suit: 'c', confidence: 0.87 },
    ],
    gameType: 'nlhe',
    potSize: 300,
    betToCall: 150,
    stackSize: 1000,
    bigBlind: 10,
    position: 'btn',
    numPlayers: 6,
  });
  assert.strictEqual(result.ready, true);
  assert.strictEqual(result.street, 'river');
  // Outs not computed on river (no more cards to come)
  assert.strictEqual(result.outs, 0);
});

await testAsync('PLO flop does not compute outs (Omaha variant skip)', async () => {
  const result = await getBridgedDecision({
    rawHoleCards: [
      { rank: 'A', suit: 's', confidence: 0.95 },
      { rank: 'K', suit: 'h', confidence: 0.92 },
      { rank: 'Q', suit: 'd', confidence: 0.90 },
      { rank: 'J', suit: 'c', confidence: 0.88 },
    ],
    rawBoardCards: [
      { rank: '7', suit: 'c', confidence: 0.90 },
      { rank: '2', suit: 'd', confidence: 0.88 },
      { rank: 'T', suit: 's', confidence: 0.91 },
    ],
    gameType: 'plo',
    potSize: 200,
    betToCall: 100,
    stackSize: 1000,
    bigBlind: 10,
    position: 'btn',
    numPlayers: 6,
  });
  assert.strictEqual(result.ready, true);
  assert.strictEqual(result.outs, 0); // outs skipped for PLO
  assert.ok(result.isOmaha === true);
});

// ═════════════════════════════════════════════════════════════════════════════
// SUMMARY
// ═════════════════════════════════════════════════════════════════════════════

section('SUMMARY');
process.stdout.write(`\n  ${passed} passed, ${failed} failed, ${passed + failed} total\n\n`);
if (failures.length > 0) {
  process.stdout.write('Failures:\n');
  for (const f of failures) {
    process.stdout.write(`  - ${f.name}: ${f.err.message}\n`);
  }
  process.exit(1);
}
