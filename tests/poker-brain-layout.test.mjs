#!/usr/bin/env node
/**
 * POKER BRAIN — LAYOUT / MATCHER HOLE-COUNT CONTRACT TEST
 * ─────────────────────────────────────────────────────────────
 * Verifies the layout calibration phase 3 contract:
 *
 *   1. layout.json declares 6 hero hole-card regions (so PLO6
 *      can fire).
 *   2. Engine.expectedHoleCount() returns the correct N for each
 *      supported variant (2/4/5/6).
 *   3. matcher.matchAllRegions(video, layout, { maxHoleCards })
 *      only polls the first N regions and returns
 *      polledHoleCount === N.
 *   4. A matcher with maxHoleCards larger than layout.holeCards
 *      is clamped to the layout length (no crash).
 *   5. When some regions return no card, the matcher degrades
 *      gracefully (returns whatever it has, no throw) so the
 *      decision-bridge can enter its waiting state.
 *
 * Run: node --experimental-loader ./tests/poker-brain-loader.mjs \
 *          tests/poker-brain-layout.test.mjs
 */

// Minimal DOM shim so matcher.js (written for the browser) loads under node.
const canvasStub = () => ({
  width: 0,
  height: 0,
  getContext: () => ({
    drawImage: () => {},
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    willReadFrequently: true,
  }),
});
if (typeof globalThis.document === 'undefined') {
  globalThis.document = { createElement: (tag) => (tag === 'canvas' ? canvasStub() : {}) };
}
if (typeof globalThis.performance === 'undefined') {
  globalThis.performance = { now: () => Date.now() };
}

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as pathResolve } from 'node:path';

import PokerBrainEngine from '../src/lib/poker-brain/engine.js';
import CardMatcher from '../src/lib/poker-brain/matcher.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const layoutPath = pathResolve(__dirname, '../src/lib/poker-brain/layout.json');
const layout = JSON.parse(readFileSync(layoutPath, 'utf-8'));

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed += 1;
    console.log('  \u2713 ' + msg);
  } else {
    failed += 1;
    console.log('  \u2717 ' + msg);
  }
}

function section(title) {
  console.log('\n' + title);
}

// ----------------------------------------------------------------------
// 1. layout.json declares 6 hole regions
// ----------------------------------------------------------------------
section('layout.json shape');
assert(Array.isArray(layout.holeCards), 'holeCards is an array');
assert(layout.holeCards.length === 6, `holeCards has 6 entries (got ${layout.holeCards.length})`);
for (let i = 0; i < layout.holeCards.length; i++) {
  const r = layout.holeCards[i];
  const ok =
    r && typeof r.x === 'number' && typeof r.y === 'number' &&
    typeof r.w === 'number' && typeof r.h === 'number' &&
    r.w > 0 && r.h > 0;
  assert(ok, `hole[${i}] has valid x/y/w/h`);
}
assert(Array.isArray(layout.boardCards) && layout.boardCards.length === 5, 'boardCards has 5 entries');

// ----------------------------------------------------------------------
// 2. Engine.expectedHoleCount() variant contract
// ----------------------------------------------------------------------
section('Engine.expectedHoleCount per variant');
const variantExpectations = [
  ['nlhe', 2],
  ['plo', 4],
  ['plo_hilo', 4],
  ['plo8', 4],
  ['plo5', 5],
  ['plo6', 6],
];
for (const [variant, expected] of variantExpectations) {
  const actual = PokerBrainEngine.expectedHoleCount(variant);
  assert(actual === expected, `${variant} -> ${expected} (got ${actual})`);
}
// Unknown variants default to NLHE (2)
assert(PokerBrainEngine.expectedHoleCount('unknown') === 2, 'unknown variant falls back to 2');

// ----------------------------------------------------------------------
// 3. matcher.matchAllRegions only polls first N regions
// ----------------------------------------------------------------------
section('matcher.matchAllRegions polledHoleCount contract');

function makeStubMatcher({ perSlot = [] } = {}) {
  const m = new CardMatcher();
  m.loaded = true;
  m.templateHashes = new Map([['As', 0n]]); // non-empty so the early return is skipped
  // Stub matchRegion: the slot index is tracked via a counter closure so we
  // can simulate N cards detected + the rest empty.
  let holeIndex = 0;
  let boardIndex = 0;
  m._ensureCanvases = () => {
    m._offscreenCanvas = canvasStub();
    m._offscreenCtx = m._offscreenCanvas.getContext('2d');
  };
  // We know matchAllRegions calls scaleRegion first, then matchRegion for
  // hole slots (in order), then matchRegion for board slots. We use a
  // single counter for hole calls and decide based on perSlot.
  const originalMatchRegion = m.matchRegion.bind(m);
  m.matchRegion = (source, region, videoW, videoH) => {
    // Determine whether this is a hole or board slot by position: we just
    // count total invocations and know the matcher calls holes before board.
    // Simpler: return a valid card for the first `perSlot.length` calls,
    // then null thereafter.
    const slotIdx = holeIndex + boardIndex;
    // Hole slots come first (maxHole of them), then board slots. We don't
    // know exactly how many hole slots were requested here, so instead we
    // use the region's y coordinate: hole cards in the test layout are
    // y >= 500; board cards are y ~= 400.
    if (region.y >= 500) {
      const hit = perSlot[holeIndex] || null;
      holeIndex += 1;
      return hit ? { rank: hit.rank, suit: hit.suit, confidence: 0.95, distance: 2, key: hit.rank + hit.suit } : { rank: null, suit: null, confidence: 0, distance: 64, key: null };
    } else {
      boardIndex += 1;
      return { rank: null, suit: null, confidence: 0, distance: 64, key: null };
    }
  };
  return m;
}

const fakeVideo = { videoWidth: 960, videoHeight: 2108 };

// Case A: maxHoleCards = 2 (NLHE). Only first two hole regions should be polled.
{
  const m = makeStubMatcher({
    perSlot: [
      { rank: 'A', suit: 's' },
      { rank: 'K', suit: 'h' },
      { rank: 'Q', suit: 'd' },
      { rank: 'J', suit: 'c' },
      { rank: 'T', suit: 's' },
      { rank: '9', suit: 'h' },
    ],
  });
  const res = m.matchAllRegions(fakeVideo, layout, { maxHoleCards: 2 });
  assert(res.polledHoleCount === 2, `NLHE polls 2 hole regions (got ${res.polledHoleCount})`);
  assert(res.holeCards.length === 2, `NLHE matcher returns 2 cards (got ${res.holeCards.length})`);
  assert(res.holeCards[0].rank === 'A' && res.holeCards[1].rank === 'K', 'NLHE returns the first two slots');
}

// Case B: maxHoleCards = 4 (PLO). First four slots polled.
{
  const m = makeStubMatcher({
    perSlot: [
      { rank: 'A', suit: 's' },
      { rank: 'K', suit: 'h' },
      { rank: 'Q', suit: 'd' },
      { rank: 'J', suit: 'c' },
      { rank: 'T', suit: 's' },
      { rank: '9', suit: 'h' },
    ],
  });
  const res = m.matchAllRegions(fakeVideo, layout, { maxHoleCards: 4 });
  assert(res.polledHoleCount === 4, `PLO polls 4 hole regions (got ${res.polledHoleCount})`);
  assert(res.holeCards.length === 4, `PLO returns 4 cards (got ${res.holeCards.length})`);
}

// Case C: maxHoleCards = 5 (PLO5)
{
  const m = makeStubMatcher({
    perSlot: [
      { rank: 'A', suit: 's' },
      { rank: 'K', suit: 'h' },
      { rank: 'Q', suit: 'd' },
      { rank: 'J', suit: 'c' },
      { rank: 'T', suit: 's' },
      { rank: '9', suit: 'h' },
    ],
  });
  const res = m.matchAllRegions(fakeVideo, layout, { maxHoleCards: 5 });
  assert(res.polledHoleCount === 5, `PLO5 polls 5 hole regions (got ${res.polledHoleCount})`);
  assert(res.holeCards.length === 5, `PLO5 returns 5 cards (got ${res.holeCards.length})`);
}

// Case D: maxHoleCards = 6 (PLO6)
{
  const m = makeStubMatcher({
    perSlot: [
      { rank: 'A', suit: 's' },
      { rank: 'K', suit: 'h' },
      { rank: 'Q', suit: 'd' },
      { rank: 'J', suit: 'c' },
      { rank: 'T', suit: 's' },
      { rank: '9', suit: 'h' },
    ],
  });
  const res = m.matchAllRegions(fakeVideo, layout, { maxHoleCards: 6 });
  assert(res.polledHoleCount === 6, `PLO6 polls 6 hole regions (got ${res.polledHoleCount})`);
  assert(res.holeCards.length === 6, `PLO6 returns 6 cards (got ${res.holeCards.length})`);
}

// Case E: maxHoleCards clamped when larger than layout
{
  const m = makeStubMatcher({
    perSlot: [
      { rank: 'A', suit: 's' },
      { rank: 'K', suit: 'h' },
    ],
  });
  const res = m.matchAllRegions(fakeVideo, layout, { maxHoleCards: 20 });
  assert(res.polledHoleCount === 6, `maxHoleCards clamped to layout.length (got ${res.polledHoleCount})`);
}

// Case F: omitted maxHoleCards defaults to layout length
{
  const m = makeStubMatcher({
    perSlot: [
      { rank: 'A', suit: 's' },
      { rank: 'K', suit: 'h' },
    ],
  });
  const res = m.matchAllRegions(fakeVideo, layout);
  assert(res.polledHoleCount === 6, `default polls all 6 regions (got ${res.polledHoleCount})`);
}

// Case G: graceful partial detection — 2 out of 4 slots return cards, no crash
{
  const m = makeStubMatcher({
    perSlot: [
      { rank: 'A', suit: 's' },
      null,
      { rank: 'Q', suit: 'd' },
      null,
    ],
  });
  let threw = false;
  let res = null;
  try {
    res = m.matchAllRegions(fakeVideo, layout, { maxHoleCards: 4 });
  } catch (err) {
    threw = true;
  }
  assert(!threw, 'partial detection does not throw');
  assert(res && res.polledHoleCount === 4, 'polledHoleCount still reflects requested N');
  assert(res && res.holeCards.length === 2, 'only the successful matches are returned');
}

// Case H: matcher not loaded -> safe empty result
{
  const m = new CardMatcher();
  m.loaded = false;
  const res = m.matchAllRegions(fakeVideo, layout, { maxHoleCards: 6 });
  assert(res.polledHoleCount === 0, 'unloaded matcher returns polledHoleCount 0');
  assert(Array.isArray(res.holeCards) && res.holeCards.length === 0, 'unloaded matcher returns empty holeCards');
}

// ----------------------------------------------------------------------
// 4. Bridge + variant wait-state when N < expected
// ----------------------------------------------------------------------
section('decision-bridge waits when polled < expected');
const { getBridgedDecision } = await import('../src/lib/poker-brain/decision-bridge.js');

// PLO6 requested, but only 4 cards present -> bridge should return ready:false
// with the requiredHoleCount metadata.
const partial = await getBridgedDecision({
  rawHoleCards: [
    { rank: 'A', suit: 's', confidence: 0.95 },
    { rank: 'K', suit: 'h', confidence: 0.95 },
    { rank: 'Q', suit: 'd', confidence: 0.95 },
    { rank: 'J', suit: 'c', confidence: 0.95 },
  ],
  rawBoardCards: [],
  gameType: 'plo6',
  bigBlind: 2,
  stackSize: 200,
  potSize: 3,
  betToCall: 2,
  position: 'middle',
  numPlayers: 6,
});
assert(partial.ready === false, 'PLO6 with 4 hole cards -> ready:false');
assert(partial.requiredHoleCount === 6, 'PLO6 bridge reports requiredHoleCount=6');
assert(partial.variant === 'plo6', 'PLO6 bridge reports variant=plo6');

// ----------------------------------------------------------------------
console.log('\n--------------------------------------------------');
console.log(`  PASSED: ${passed}    FAILED: ${failed}`);
console.log('--------------------------------------------------\n');
process.exit(failed === 0 ? 0 : 1);
