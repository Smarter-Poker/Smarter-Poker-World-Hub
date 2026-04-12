#!/usr/bin/env node

/**
 * Poker Brain — Persistence & Hardening Tests
 * =============================================
 * Tests for:
 *   1. localStorage persistence (persistCalibratedHashes / restoreCalibratedHashes / clearCalibratedHashes)
 *   2. Canvas caching in auto-table-state.js (downscaleROI reuse)
 *   3. validateAction in action-detect.js
 *   4. Horse Brain retry logic (exponential backoff)
 *   5. verifyCardSuit try-catch safety in detection-loop.js
 *
 * Run:
 *   node --loader ./tests/poker-brain-loader.mjs tests/poker-brain-persistence.test.mjs
 */

import assert from 'assert';
import { readFileSync } from 'fs';
import { resolve } from 'path';

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
// Shim localStorage for Node.js
// ============================================================================

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => store.has(k) ? store.get(k) : null,
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};

// Shim document.createElement for canvas-using modules
globalThis.document = globalThis.document || {
  createElement: (tag) => {
    if (tag === 'canvas') {
      return {
        width: 0, height: 0,
        getContext: () => ({
          drawImage: () => {},
          getImageData: (x, y, w, h) => ({
            data: new Uint8ClampedArray(w * h * 4),
            width: w, height: h,
          }),
          clearRect: () => {},
        }),
      };
    }
    return {};
  },
};

// ============================================================================
// PART 1: localStorage persistence functions
// ============================================================================

section('=== PART 1: localStorage Persistence ===');

const {
  persistCalibratedHashes,
  restoreCalibratedHashes,
  clearCalibratedHashes,
} = await import('../src/lib/poker-brain/template-capture.js');

// Test persistCalibratedHashes
{
  store.clear();
  const fakeHashes = new Map();
  fakeHashes.set('Ah', { dHash: [123, 456], aHash: [789, 101] });
  fakeHashes.set('Kd', { dHash: [222, 333], aHash: [444, 555] });
  fakeHashes.set('bad', { dHash: null, aHash: null }); // should be skipped

  const saved = persistCalibratedHashes(fakeHashes);
  testEq(saved, 2, 'persistCalibratedHashes saves valid entries, skips invalid');

  const meta = JSON.parse(store.get('pb-cal-meta'));
  test(meta.count === 2, 'Meta records correct count');
  test(typeof meta.savedAt === 'number', 'Meta includes savedAt timestamp');
  test(meta.keys.includes('Ah') && meta.keys.includes('Kd'), 'Meta includes correct keys');

  const ahStored = JSON.parse(store.get('pb-cal-Ah'));
  test(ahStored.dHash[0] === 123 && ahStored.dHash[1] === 456, 'Ah dHash stored correctly');
  test(ahStored.aHash[0] === 789 && ahStored.aHash[1] === 101, 'Ah aHash stored correctly');
}

// Test persistCalibratedHashes with null input
{
  const result = persistCalibratedHashes(null);
  testEq(result, 0, 'persistCalibratedHashes returns 0 for null input');
}

// Test restoreCalibratedHashes
{
  store.clear();
  // Prepare stored data
  const meta = { keys: ['Ah', 'Kd', 'missing'], savedAt: Date.now(), count: 2 };
  store.set('pb-cal-meta', JSON.stringify(meta));
  store.set('pb-cal-Ah', JSON.stringify({ dHash: [100, 200], aHash: [300, 400] }));
  store.set('pb-cal-Kd', JSON.stringify({ dHash: [500, 600], aHash: [700, 800] }));
  // 'missing' key intentionally NOT stored to test robustness

  const fakeMatcher = { templateHashes: new Map() };
  const restored = restoreCalibratedHashes(fakeMatcher);
  testEq(restored, 2, 'restoreCalibratedHashes restores 2 entries (skips missing)');
  test(fakeMatcher.templateHashes.has('Ah'), 'Ah restored into matcher');
  test(fakeMatcher.templateHashes.has('Kd'), 'Kd restored into matcher');

  const ah = fakeMatcher.templateHashes.get('Ah');
  test(ah.dHash[0] === 100 && ah.dHash[1] === 200, 'Restored Ah dHash matches');
}

// Test restoreCalibratedHashes with stale data
{
  store.clear();
  const staleMeta = { keys: ['Ah'], savedAt: Date.now() - 90000000, count: 1 }; // 25h ago
  store.set('pb-cal-meta', JSON.stringify(staleMeta));
  store.set('pb-cal-Ah', JSON.stringify({ dHash: [1, 2], aHash: [3, 4] }));

  const fakeMatcher = { templateHashes: new Map() };
  const restored = restoreCalibratedHashes(fakeMatcher);
  testEq(restored, 0, 'restoreCalibratedHashes returns 0 for stale data (>24h)');
  test(!fakeMatcher.templateHashes.has('Ah'), 'Stale Ah not restored');
}

// Test restoreCalibratedHashes with custom maxAge
{
  store.clear();
  const recentMeta = { keys: ['Ah'], savedAt: Date.now() - 5000, count: 1 }; // 5s ago
  store.set('pb-cal-meta', JSON.stringify(recentMeta));
  store.set('pb-cal-Ah', JSON.stringify({ dHash: [1, 2], aHash: [3, 4] }));

  const fakeMatcher = { templateHashes: new Map() };
  const restored = restoreCalibratedHashes(fakeMatcher, { maxAgeMs: 1000 }); // 1s max
  testEq(restored, 0, 'restoreCalibratedHashes respects custom maxAgeMs');
}

// Test restoreCalibratedHashes with no meta
{
  store.clear();
  const fakeMatcher = { templateHashes: new Map() };
  const restored = restoreCalibratedHashes(fakeMatcher);
  testEq(restored, 0, 'restoreCalibratedHashes returns 0 when no meta exists');
}

// Test restoreCalibratedHashes with corrupt entry
{
  store.clear();
  const meta = { keys: ['Ah', 'corrupt'], savedAt: Date.now(), count: 2 };
  store.set('pb-cal-meta', JSON.stringify(meta));
  store.set('pb-cal-Ah', JSON.stringify({ dHash: [1, 2], aHash: [3, 4] }));
  store.set('pb-cal-corrupt', 'NOT JSON!!!');

  const fakeMatcher = { templateHashes: new Map() };
  const restored = restoreCalibratedHashes(fakeMatcher);
  testEq(restored, 1, 'restoreCalibratedHashes skips corrupt entries gracefully');
}

// Test clearCalibratedHashes
{
  store.clear();
  const meta = { keys: ['Ah', 'Kd'], savedAt: Date.now(), count: 2 };
  store.set('pb-cal-meta', JSON.stringify(meta));
  store.set('pb-cal-Ah', JSON.stringify({ dHash: [1, 2], aHash: [3, 4] }));
  store.set('pb-cal-Kd', JSON.stringify({ dHash: [5, 6], aHash: [7, 8] }));

  clearCalibratedHashes();
  test(store.get('pb-cal-meta') === null || store.get('pb-cal-meta') === undefined, 'clearCalibratedHashes removes meta');
  test(!store.has('pb-cal-Ah'), 'clearCalibratedHashes removes Ah');
  test(!store.has('pb-cal-Kd'), 'clearCalibratedHashes removes Kd');
}

// Test round-trip: persist -> clear -> verify empty -> persist again -> restore
{
  store.clear();
  const hashes = new Map();
  hashes.set('Ts', { dHash: [11, 22], aHash: [33, 44] });
  hashes.set('9c', { dHash: [55, 66], aHash: [77, 88] });

  persistCalibratedHashes(hashes);
  clearCalibratedHashes();

  const matcher1 = { templateHashes: new Map() };
  testEq(restoreCalibratedHashes(matcher1), 0, 'Restore after clear returns 0');

  // Re-persist and restore
  persistCalibratedHashes(hashes);
  const matcher2 = { templateHashes: new Map() };
  testEq(restoreCalibratedHashes(matcher2), 2, 'Re-persist and restore returns 2');
  test(matcher2.templateHashes.get('Ts').dHash[0] === 11, 'Round-trip Ts dHash[0] correct');
  test(matcher2.templateHashes.get('9c').aHash[1] === 88, 'Round-trip 9c aHash[1] correct');
}

// ============================================================================
// PART 2: validateAction in action-detect.js
// ============================================================================

section('=== PART 2: validateAction ===');

const { validateAction } = await import('../src/lib/poker-brain/action-detect.js');

// No buttons visible
{
  const r = validateAction(null, 'FOLD');
  test(!r.consistent, 'validateAction: null actions -> inconsistent');
  test(r.reason.includes('not hero turn') || r.reason.includes('No action'), 'validateAction: null explains why');
}

{
  const r = validateAction({ fold: false, checkCall: false, betRaise: false, any: false }, 'CHECK');
  test(!r.consistent, 'validateAction: no buttons visible -> inconsistent');
}

// Fold button not visible
{
  const r = validateAction({ fold: false, checkCall: true, betRaise: true, any: true }, 'FOLD');
  test(!r.consistent, 'validateAction: FOLD without fold button -> inconsistent');
}

// Check button not visible
{
  const r = validateAction({ fold: true, checkCall: false, betRaise: true, any: true }, 'CHECK');
  test(!r.consistent, 'validateAction: CHECK without checkCall -> inconsistent');
}

{
  const r = validateAction({ fold: true, checkCall: false, betRaise: true, any: true }, 'CALL');
  test(!r.consistent, 'validateAction: CALL without checkCall -> inconsistent');
}

// Raise button not visible
{
  const r = validateAction({ fold: true, checkCall: true, betRaise: false, any: true }, 'RAISE');
  test(!r.consistent, 'validateAction: RAISE without betRaise -> inconsistent');
}

{
  const r = validateAction({ fold: true, checkCall: true, betRaise: false, any: true }, 'BET');
  test(!r.consistent, 'validateAction: BET without betRaise -> inconsistent');
}

// All consistent
{
  const full = { fold: true, checkCall: true, betRaise: true, any: true };
  test(validateAction(full, 'FOLD').consistent, 'validateAction: FOLD with all buttons -> consistent');
  test(validateAction(full, 'CHECK').consistent, 'validateAction: CHECK with all buttons -> consistent');
  test(validateAction(full, 'CALL').consistent, 'validateAction: CALL with all buttons -> consistent');
  test(validateAction(full, 'RAISE').consistent, 'validateAction: RAISE with all buttons -> consistent');
  test(validateAction(full, 'BET').consistent, 'validateAction: BET with all buttons -> consistent');
}

// Case insensitivity
{
  const full = { fold: true, checkCall: true, betRaise: true, any: true };
  test(validateAction(full, 'fold').consistent, 'validateAction: lowercase fold -> consistent');
  test(validateAction(full, 'Raise').consistent, 'validateAction: mixed case Raise -> consistent');
}

// ============================================================================
// PART 3: Source code hardening checks
// ============================================================================

section('=== PART 3: Source Code Hardening Checks ===');

const detectionLoopSrc = readFileSync(resolve(process.cwd(), 'src/lib/poker-brain/detection-loop.js'), 'utf8');
const autoTableStateSrc = readFileSync(resolve(process.cwd(), 'src/lib/poker-brain/auto-table-state.js'), 'utf8');
const dealerDetectSrc = readFileSync(resolve(process.cwd(), 'src/lib/poker-brain/dealer-detect.js'), 'utf8');
const actionDetectSrc = readFileSync(resolve(process.cwd(), 'src/lib/poker-brain/action-detect.js'), 'utf8');
const decisionBridgeSrc = readFileSync(resolve(process.cwd(), 'src/lib/poker-brain/decision-bridge.js'), 'utf8');

// Canvas caching checks
test(autoTableStateSrc.includes('_dsCanvas'), 'auto-table-state.js has cached canvas (_dsCanvas)');
test(autoTableStateSrc.includes('_dsCtx'), 'auto-table-state.js has cached context (_dsCtx)');
test(dealerDetectSrc.includes('_cachedCanvas'), 'dealer-detect.js has cached canvas');
test(actionDetectSrc.includes('detectAvailableActions._canvas'), 'action-detect.js has cached canvas');

// verifyCardSuit try-catch in detection-loop.js
{
  // Count try-catch blocks around verifyCardSuit calls
  const tryCatchCount = (detectionLoopSrc.match(/try\s*\{[^}]*verifyCardSuit/g) || []).length;
  test(tryCatchCount >= 2, `detection-loop.js: verifyCardSuit wrapped in try-catch (found ${tryCatchCount} instances, need >= 2)`);
}

// Horse Brain retry logic
test(decisionBridgeSrc.includes('HB_MAX_RETRIES'), 'decision-bridge.js has HB_MAX_RETRIES constant');
test(decisionBridgeSrc.includes('HB_BASE_DELAY_MS'), 'decision-bridge.js has HB_BASE_DELAY_MS constant');
test(decisionBridgeSrc.includes('Math.pow(2, attempt)'), 'decision-bridge.js uses exponential backoff');

// PLO Hi-Lo low hand support
test(decisionBridgeSrc.includes('lowHandStrength'), 'decision-bridge.js includes lowHandStrength field');
test(decisionBridgeSrc.includes('getBestLowFromCards'), 'decision-bridge.js calls getBestLowFromCards');
test(decisionBridgeSrc.includes('isHiLo'), 'decision-bridge.js checks isHiLo flag');

// No .single() calls
test(!autoTableStateSrc.includes('.single()'), 'auto-table-state.js has no .single() calls');
test(!detectionLoopSrc.includes('.single()'), 'detection-loop.js has no .single() calls');
test(!decisionBridgeSrc.includes('.single()'), 'decision-bridge.js has no .single() calls');

// ============================================================================
// PART 4: canonicalPosition in auto-table-state.js
// ============================================================================

section('=== PART 4: canonicalPosition ===');

const { canonicalPosition, positionFromOffset } = await import('../src/lib/poker-brain/auto-table-state.js');

// Heads-up (2 players)
testEq(positionFromOffset(0, 2), 'BTN/SB', 'HU: offset 0 = BTN/SB');
testEq(positionFromOffset(1, 2), 'BB', 'HU: offset 1 = BB');

// 6-max
testEq(positionFromOffset(0, 6), 'BTN', '6-max: offset 0 = BTN');
testEq(positionFromOffset(1, 6), 'SB', '6-max: offset 1 = SB');
testEq(positionFromOffset(2, 6), 'BB', '6-max: offset 2 = BB');
testEq(positionFromOffset(3, 6), 'UTG', '6-max: offset 3 = UTG');
testEq(positionFromOffset(4, 6), 'MP', '6-max: offset 4 = MP');
testEq(positionFromOffset(5, 6), 'CO', '6-max: offset 5 = CO');

// 9-max (full ring)
testEq(positionFromOffset(0, 9), 'BTN', '9-max: offset 0 = BTN');
testEq(positionFromOffset(3, 9), 'UTG', '9-max: offset 3 = UTG');
testEq(positionFromOffset(4, 9), 'UTG+1', '9-max: offset 4 = UTG+1');
testEq(positionFromOffset(7, 9), 'HJ', '9-max: offset 7 = HJ');
testEq(positionFromOffset(8, 9), 'CO', '9-max: offset 8 = CO');

// canonicalPosition with angle-based calculation
{
  const pos = canonicalPosition({ dealerAngleDeg: 0, heroAngleDeg: 0, numPlayers: 6 });
  testEq(pos, 'BTN', 'canonicalPosition: hero on dealer = BTN');
}

{
  const pos = canonicalPosition({ dealerAngleDeg: 0, heroAngleDeg: 180, numPlayers: 6 });
  testEq(pos, 'UTG', 'canonicalPosition: hero opposite dealer in 6-max = UTG');
}

// Edge case: invalid inputs
{
  const pos = canonicalPosition({ dealerAngleDeg: NaN, heroAngleDeg: 90, numPlayers: 6 });
  testEq(pos, 'unknown', 'canonicalPosition: NaN dealer angle = unknown');
}

// Negative offset wraps correctly
testEq(positionFromOffset(-1, 6), 'CO', '6-max: offset -1 wraps to CO');

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
