#!/usr/bin/env node

/**
 * Poker Brain — React Component Structural Tests
 * ================================================
 * Since these components can't be rendered in Node (they use React hooks,
 * browser APIs, and Next.js dynamic imports), we verify:
 *
 *   1. File existence and non-zero size
 *   2. Export shapes via AST-free text analysis (export default, named exports)
 *   3. Pure exported utility functions from CalibrationOverlay
 *   4. Component prop interfaces (destructured params) documented correctly
 *   5. Import dependency graph correctness
 *   6. No banned patterns (emoji, .single(), etc.)
 *
 * Run:
 *   node tests/poker-brain-components.test.mjs
 */

import { readFileSync, statSync, existsSync } from 'fs';
import { resolve } from 'path';
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

function testDeep(a, b, msg) {
  try { assert.deepStrictEqual(a, b); test(true, msg); }
  catch (e) { test(false, `${msg} (${e.message})`); }
}

const ROOT = resolve(process.cwd(), 'src/components/poker-brain');
const LIB = resolve(process.cwd(), 'src/lib/poker-brain');

function readComponent(name) {
  const path = resolve(ROOT, name);
  return readFileSync(path, 'utf8');
}

// ============================================================================
// PART 1: File Existence & Size
// ============================================================================

section('Component files exist and have content');

const COMPONENTS = [
  'HUD.jsx',
  'HandHistory.jsx',
  'CalibrationOverlay.jsx',
  'LaunchButton.jsx',
  'LiveFeed.jsx',
  'Onboarding.jsx',
];

for (const name of COMPONENTS) {
  const fullPath = resolve(ROOT, name);
  const exists = existsSync(fullPath);
  test(exists, `${name} exists`);
  if (exists) {
    const stat = statSync(fullPath);
    test(stat.size > 100, `${name} has substantial content (${stat.size} bytes)`);
  }
}

// ============================================================================
// PART 2: Lib files exist
// ============================================================================

section('Lib module files exist');

const LIB_FILES = [
  'engine.js',
  'state.js',
  'matcher.js',
  'ocr.js',
  'suit-color.js',
  'dealer-detect.js',
  'card-localizer.js',
  'hardwired-detect.js',
  'decision-bridge.js',
  'storage.js',
  'action-detect.js',
  'detection-loop.js',
  'ocr-loop.js',
  'table-finder.js',
  'table-state-tracker.js',
  'hand-strength-validator.js',
  'tournament-detect.js',
  'session-audit.js',
  'layout-capture.json',
];

for (const name of LIB_FILES) {
  const fullPath = resolve(LIB, name);
  test(existsSync(fullPath), `lib/${name} exists`);
}

// ============================================================================
// PART 3: Export Verification
// ============================================================================

section('HUD.jsx — exports');
{
  const src = readComponent('HUD.jsx');
  test(/export\s+default/.test(src), 'HUD has a default export');
  test(/import\s+React/.test(src), 'HUD imports React');
  test(/useState/.test(src), 'HUD uses useState');
  test(/useEffect/.test(src), 'HUD uses useEffect');
  test(/useRef/.test(src), 'HUD uses useRef');
  test(/useCallback/.test(src), 'HUD uses useCallback');
  // HUD should import core poker-brain modules
  test(/from\s+['"].*\/matcher['"]/.test(src), 'HUD imports matcher');
  test(/from\s+['"].*\/engine['"]/.test(src), 'HUD imports engine');
  test(/from\s+['"].*\/state['"]/.test(src), 'HUD imports state');
  test(/from\s+['"].*\/decision-bridge['"]/.test(src), 'HUD imports decision-bridge');
  test(/from\s+['"].*\/storage['"]/.test(src), 'HUD imports storage');
  test(/HandStateMachine/.test(src), 'HUD uses HandStateMachine');
  test(/TableStateTracker/.test(src), 'HUD uses TableStateTracker');
  test(/hardwiredDetect/.test(src), 'HUD uses hardwiredDetect');
}

section('HandHistory.jsx — exports');
{
  const src = readComponent('HandHistory.jsx');
  test(/export\s+default\s+function\s+HandHistory/.test(src), 'HandHistory has named default export');
  test(/hands\s*=\s*\[\]/.test(src), 'HandHistory has hands prop with default []');
  // Internal helpers
  test(/function\s+MiniCard/.test(src), 'HandHistory defines MiniCard helper');
  test(/function\s+CardRow/.test(src), 'HandHistory defines CardRow helper');
  test(/function\s+DecisionRow/.test(src), 'HandHistory defines DecisionRow helper');
  test(/function\s+HandCard/.test(src), 'HandHistory defines HandCard helper');
}

section('CalibrationOverlay.jsx — exports');
{
  const src = readComponent('CalibrationOverlay.jsx');
  test(/export\s+default\s+CalibrationOverlay/.test(src), 'CalibrationOverlay has default export');
  test(/export\s+const\s+OVERRIDES_KEY/.test(src), 'CalibrationOverlay exports OVERRIDES_KEY');
  test(/export\s+function\s+loadLayoutOverrides/.test(src), 'CalibrationOverlay exports loadLayoutOverrides');
  test(/export\s+function\s+saveLayoutOverrides/.test(src), 'CalibrationOverlay exports saveLayoutOverrides');
  test(/export\s+function\s+mergeLayoutWithOverrides/.test(src), 'CalibrationOverlay exports mergeLayoutWithOverrides');
  // Internal helpers
  test(/function\s+mergeRect/.test(src), 'CalibrationOverlay defines mergeRect');
  test(/function\s+flattenLayout/.test(src), 'CalibrationOverlay defines flattenLayout');
  test(/function\s+setOverride/.test(src), 'CalibrationOverlay defines setOverride');
}

section('LaunchButton.jsx — exports');
{
  const src = readComponent('LaunchButton.jsx');
  test(/export\s+default\s+function\s+PokerBrainLaunchButton/.test(src), 'LaunchButton has named default export');
  test(/dynamic\(/.test(src), 'LaunchButton uses next/dynamic for HUD lazy load');
  test(/ssr:\s*false/.test(src), 'LaunchButton disables SSR for HUD');
}

section('LiveFeed.jsx — exports');
{
  const src = readComponent('LiveFeed.jsx');
  test(/export\s+default\s+function\s+LiveFeed/.test(src), 'LiveFeed has named default export');
  test(/storage/.test(src), 'LiveFeed accepts storage prop');
  test(/sessionId/.test(src), 'LiveFeed accepts sessionId prop');
  test(/function\s+MiniCard/.test(src), 'LiveFeed defines MiniCard helper');
}

section('Onboarding.jsx — exports');
{
  const src = readComponent('Onboarding.jsx');
  test(/export\s+default\s+function\s+Onboarding/.test(src), 'Onboarding has named default export');
  test(/onComplete/.test(src), 'Onboarding accepts onComplete prop');
  test(/onSelectCapture/.test(src), 'Onboarding accepts onSelectCapture prop');
  test(/onSelectVariant/.test(src), 'Onboarding accepts onSelectVariant prop');
  test(/const\s+STEPS/.test(src), 'Onboarding defines STEPS array');
}

// ============================================================================
// PART 4: Code Safety Rules Compliance
// ============================================================================

section('No .single() calls in components');
{
  for (const name of COMPONENTS) {
    const src = readComponent(name);
    const hasSingle = /\.single\(\)/.test(src);
    test(!hasSingle, `${name}: no .single() calls (rule #1)`);
  }
}

section('No emoji in component UI strings');
{
  // Check for common emoji ranges in source
  const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u;
  for (const name of COMPONENTS) {
    const src = readComponent(name);
    const hasEmoji = emojiRegex.test(src);
    test(!hasEmoji, `${name}: no emoji characters (rule #8)`);
  }
}

section('No raw supabase imports in components (should use lib/supabase)');
{
  for (const name of COMPONENTS) {
    const src = readComponent(name);
    const rawImport = /from\s+['"]@supabase\/supabase-js['"]/.test(src);
    test(!rawImport, `${name}: no raw @supabase/supabase-js import (rule #4)`);
  }
}

// ============================================================================
// PART 5: Cross-component import consistency
// ============================================================================

section('Import dependency consistency');
{
  const hud = readComponent('HUD.jsx');
  const launch = readComponent('LaunchButton.jsx');

  // LaunchButton should dynamically import HUD
  test(/import\(['"]\.\/HUD['"]\)/.test(launch), 'LaunchButton dynamically imports HUD');

  // HUD should import HandHistory and Onboarding
  test(/import\s+HandHistory\s+from\s+['"]\.\/HandHistory['"]/.test(hud), 'HUD imports HandHistory');
  test(/import\s+Onboarding\s+from\s+['"]\.\/Onboarding['"]/.test(hud), 'HUD imports Onboarding');
}

// ============================================================================
// PART 6: Lib module export patterns
// ============================================================================

section('Lib module export patterns');
{
  const engineSrc = readFileSync(resolve(LIB, 'engine.js'), 'utf8');
  test(/export\s+default/.test(engineSrc), 'engine.js has default export');

  const stateSrc = readFileSync(resolve(LIB, 'state.js'), 'utf8');
  test(/export.*HandStateMachine/.test(stateSrc), 'state.js exports HandStateMachine');
  test(/export.*STREETS/.test(stateSrc), 'state.js exports STREETS');
  test(/export.*deriveStreet/.test(stateSrc), 'state.js exports deriveStreet');

  const matcherSrc = readFileSync(resolve(LIB, 'matcher.js'), 'utf8');
  test(/export.*PokerBrainMatcher/.test(matcherSrc), 'matcher.js exports PokerBrainMatcher');
  test(/export.*computeDHash/.test(matcherSrc), 'matcher.js exports computeDHash');
  test(/export.*hammingDistance/.test(matcherSrc), 'matcher.js exports hammingDistance');

  const ocrSrc = readFileSync(resolve(LIB, 'ocr.js'), 'utf8');
  test(/export.*parsePokerNumber/.test(ocrSrc), 'ocr.js exports parsePokerNumber');
  test(/export.*parseBlindLevel/.test(ocrSrc), 'ocr.js exports parseBlindLevel');

  const suitSrc = readFileSync(resolve(LIB, 'suit-color.js'), 'utf8');
  test(/export\s+function\s+detectDominantSuitColor/.test(suitSrc), 'suit-color.js exports detectDominantSuitColor');
  test(/export\s+function\s+verifyCardSuit/.test(suitSrc), 'suit-color.js exports verifyCardSuit');

  const dealerSrc = readFileSync(resolve(LIB, 'dealer-detect.js'), 'utf8');
  test(/export\s+function\s+detectDealer/.test(dealerSrc), 'dealer-detect.js exports detectDealer');
  test(/export\s+function\s+heroPositionFromDealer/.test(dealerSrc), 'dealer-detect.js exports heroPositionFromDealer');
  test(/export\s+function\s+findDealerButtonGlobal/.test(dealerSrc), 'dealer-detect.js exports findDealerButtonGlobal');
  test(/export\s+function\s+detectOccupiedSeats/.test(dealerSrc), 'dealer-detect.js exports detectOccupiedSeats');

  const hardwiredSrc = readFileSync(resolve(LIB, 'hardwired-detect.js'), 'utf8');
  test(/export\s+function\s+isHardwiredEligible/.test(hardwiredSrc), 'hardwired-detect.js exports isHardwiredEligible');
  test(/export\s+function\s+validateHardwiredResolution/.test(hardwiredSrc), 'hardwired-detect.js exports validateHardwiredResolution');
  test(/export\s+function\s+hardwiredDetect/.test(hardwiredSrc), 'hardwired-detect.js exports hardwiredDetect');

  const trackerSrc = readFileSync(resolve(LIB, 'table-state-tracker.js'), 'utf8');
  test(/export\s+class\s+TableStateTracker/.test(trackerSrc), 'table-state-tracker.js exports TableStateTracker class');
  test(/export\s+default\s+TableStateTracker/.test(trackerSrc), 'table-state-tracker.js default exports TableStateTracker');

  const storageSrc = readFileSync(resolve(LIB, 'storage.js'), 'utf8');
  test(/export.*usePokerBrainStorage/.test(storageSrc), 'storage.js exports usePokerBrainStorage');
  test(/class\s+PokerBrainStorage/.test(storageSrc), 'storage.js defines PokerBrainStorage class');
}

// ============================================================================
// PART 7: Layout JSON schema verification
// ============================================================================

section('layout-capture.json schema');
{
  const layoutPath = resolve(LIB, 'layout-capture.json');
  const layout = JSON.parse(readFileSync(layoutPath, 'utf8'));

  test(layout.referenceSize != null, 'layout has referenceSize');
  test(typeof layout.referenceSize?.w === 'number', 'referenceSize.w is number');
  test(typeof layout.referenceSize?.h === 'number', 'referenceSize.h is number');
  test(layout.referenceSize?.w > 0, 'referenceSize.w > 0');
  test(layout.referenceSize?.h > 0, 'referenceSize.h > 0');

  test(Array.isArray(layout.boardCards), 'boardCards is array');
  testEq(layout.boardCards.length, 5, 'boardCards has 5 regions');
  for (let i = 0; i < layout.boardCards.length; i++) {
    const r = layout.boardCards[i];
    test(typeof r.x === 'number' && typeof r.y === 'number', `boardCards[${i}] has x,y`);
    test(typeof r.w === 'number' && typeof r.h === 'number', `boardCards[${i}] has w,h`);
    test(r.w > 0 && r.h > 0, `boardCards[${i}] has positive dimensions`);
  }

  // holeCardsByVariant
  test(typeof layout.holeCardsByVariant === 'object', 'holeCardsByVariant exists');
  if (layout.holeCardsByVariant) {
    const variants = Object.keys(layout.holeCardsByVariant);
    test(variants.length >= 1, 'at least 1 variant in holeCardsByVariant');
    for (const v of variants) {
      const regions = layout.holeCardsByVariant[v];
      test(Array.isArray(regions), `holeCardsByVariant.${v} is array`);
      test(regions.length >= 2, `holeCardsByVariant.${v} has >= 2 hole card regions`);
    }
    // NLHE should have 2 hole cards
    if (layout.holeCardsByVariant.nlhe) {
      testEq(layout.holeCardsByVariant.nlhe.length, 2, 'nlhe has 2 hole cards');
    }
    // PLO should have 4
    if (layout.holeCardsByVariant.plo) {
      testEq(layout.holeCardsByVariant.plo.length, 4, 'plo has 4 hole cards');
    }
  }

  // Seats
  if (layout.seats) {
    test(Array.isArray(layout.seats), 'seats is array');
    test(layout.seats.length >= 2, 'seats has >= 2 entries');
  }
}

// ============================================================================
// PART 8: Component size verification (guards against accidental truncation)
// ============================================================================

section('Component minimum sizes (guard against truncation)');
{
  const sizes = {
    'HUD.jsx': 50000,             // 93KB — the largest component
    'CalibrationOverlay.jsx': 10000,
    'HandHistory.jsx': 5000,
    'LaunchButton.jsx': 5000,
    'LiveFeed.jsx': 3000,
    'Onboarding.jsx': 4000,
  };
  for (const [name, minSize] of Object.entries(sizes)) {
    const fullPath = resolve(ROOT, name);
    if (existsSync(fullPath)) {
      const stat = statSync(fullPath);
      test(stat.size >= minSize, `${name}: ${stat.size} bytes >= ${minSize} minimum`);
    }
  }
}

// ============================================================================
// PART 9: API route files exist
// ============================================================================

section('API route files exist');
{
  const API_ROOT = resolve(process.cwd(), 'pages/api/poker-brain');
  const routes = [
    'decide.js',
    'stats.js',
    'calibration.js',
    'migrate-equities.js',
    'sessions.js',
  ];
  for (const name of routes) {
    const fullPath = resolve(API_ROOT, name);
    test(existsSync(fullPath), `api/poker-brain/${name} exists`);
  }
  // Nested routes
  const sessionRoute = resolve(API_ROOT, 'session/[id].js');
  test(existsSync(sessionRoute), 'api/poker-brain/session/[id].js exists');
  const handRoute = resolve(API_ROOT, 'hand/[id].js');
  test(existsSync(handRoute), 'api/poker-brain/hand/[id].js exists');
}

// ============================================================================
// PART 10: Safety rules compliance across all lib files
// ============================================================================

section('Safety rules compliance — lib files');
{
  const libFiles = LIB_FILES.filter(f => f.endsWith('.js'));
  for (const name of libFiles) {
    const fullPath = resolve(LIB, name);
    if (!existsSync(fullPath)) continue;
    const src = readFileSync(fullPath, 'utf8');

    // No .single() (rule #1)
    const hasSingle = /\.single\(\)/.test(src);
    test(!hasSingle, `lib/${name}: no .single() calls`);
  }
}

section('Safety rules compliance — API routes');
{
  const API_ROOT = resolve(process.cwd(), 'pages/api/poker-brain');
  const routeFiles = [
    'decide.js', 'stats.js', 'calibration.js',
    'migrate-equities.js', 'sessions.js',
  ];
  for (const name of routeFiles) {
    const fullPath = resolve(API_ROOT, name);
    if (!existsSync(fullPath)) continue;
    const src = readFileSync(fullPath, 'utf8');

    // No .single() (rule #1)
    test(!/\.single\(\)/.test(src), `api/${name}: no .single() calls`);

    // Must use supabaseServerClient (rule #4)
    if (/supabase/.test(src)) {
      test(
        /supabaseServerClient/.test(src) || /createClient/.test(src),
        `api/${name}: uses proper Supabase client import`
      );
    }
  }
}

// ============================================================================
// REPORT
// ============================================================================

console.log('\n' + '='.repeat(60));
console.log(`RESULTS: ${pass} passed, ${fail} failed, ${pass + fail} total`);
if (failures.length > 0) {
  console.log('\nFAILURES:');
  failures.forEach(f => console.log('  - ' + f));
}
console.log('='.repeat(60));
process.exit(fail > 0 ? 1 : 0);
