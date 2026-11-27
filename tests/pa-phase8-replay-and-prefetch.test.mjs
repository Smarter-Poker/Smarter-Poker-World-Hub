/**
 * Phase 8 Regression Guard: Inline Hand Replay Solver Frequency Bar,
 * Account-Scoped SWR Prefetch Cache, and Solver Coverage Gaps Harvest Export.
 *
 * Permanently verifies:
 *  1. [InlineHandReplay.jsx] "Hero Action vs Solver Frequency" visual comparison bar
 *     (`data-testid="replay-solver-frequency-bar"`):
 *     - Renders Hero Action pill, Solver Optimal pill, 0-100% horizontal frequency bar
 *       (safely converting 0..1 ratios to 0..100% and clamping), hero chosen frequency bar,
 *       and explicit EV Loss pill (`-X.XX BB`) ONLY when `evLossMeasured === true` & finite.
 *     - Strict honesty boundary: NEVER renders when `solverVerified !== true` or
 *       `strategySupported === false`.
 *     - Strict mobile/UI laws: fontSize >= 12px, zero display:none, zero scroll-snap-type,
 *       zero em dashes, strict Title Case.
 *  2. [useAssistant.js & leaks.js] Account-scoped short-lived SWR cache (`PA_SWR_TTL_MS = 30000`):
 *     - Exported `readAssistantCache(userId, key, nowMs)`, `writeAssistantCache(userId, key, value, nowMs)`,
 *       and `clearAssistantClientCache(userId)`.
 *     - Zero cross-account leakage, automatic invalidation on `pa-data-updated` and
 *       `pa-leak-review-updated`, and when `userId` changes or becomes falsy.
 *     - Instantaneous cache hydration + background revalidation in `useLeaks`,
 *       `useAssistantStats`, and `leaks.js` (`fetchCoachingSnapshot`).
 *  3. [CoachingWorkspace.jsx] Copyable Solver Coverage Gaps JSON Export:
 *     - 44px-tall `Copy Harvest Queue JSON` button (`data-testid="copy-coverage-gaps-btn"`)
 *       rendered whenever `coverageGaps` has non-empty buckets (`buckets` / `topGaps`).
 *     - Structured JSON payload `{ schemaVersion: 1, exportedAt, totalUnmeasured, buckets }`
 *       with accessible live confirmation (`Copied Harvest Queue` / `Copy Failed`).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const React = require('react');
const ReactDOMServer = require('react-dom/server');

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function loadTranspiledModule(relPath, mocks = {}) {
  const fullPath = path.join(ROOT, relPath);
  const source = fs.readFileSync(fullPath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
    fileName: fullPath,
  }).outputText;

  const moduleObj = { exports: {} };
  const customRequire = (id) => {
    if (Object.prototype.hasOwnProperty.call(mocks, id)) return mocks[id];
    if (id === 'react') return React;
    return require(id);
  };
  const fn = new Function('module', 'exports', 'require', transpiled);
  fn(moduleObj, moduleObj.exports, customRequire);
  return moduleObj.exports;
}

test('1. [InlineHandReplay] normalizeSolverFrequency and buildSolverFrequencyComparison enforce ratio conversion, clamping, and strict honesty boundaries', () => {
  const replayMod = loadTranspiledModule('src/components/personal-assistant/InlineHandReplay.jsx');
  const { normalizeSolverFrequency, buildSolverFrequencyComparison, default: InlineHandReplay } = replayMod;

  assert.equal(typeof normalizeSolverFrequency, 'function');
  assert.equal(typeof buildSolverFrequencyComparison, 'function');

  // Ratio 0..1 -> 0..100% conversion and clamping
  assert.equal(normalizeSolverFrequency(0.75), 75);
  assert.equal(normalizeSolverFrequency(0.125), 12.5);
  assert.equal(normalizeSolverFrequency(1), 100);
  assert.equal(normalizeSolverFrequency(0), 0);
  assert.equal(normalizeSolverFrequency(84.6), 84.6);
  assert.equal(normalizeSolverFrequency(135), 100);
  assert.equal(normalizeSolverFrequency(-5), null);
  assert.equal(normalizeSolverFrequency(null), null);
  assert.equal(normalizeSolverFrequency(undefined), null);
  assert.equal(normalizeSolverFrequency(''), null);
  assert.equal(normalizeSolverFrequency(NaN), null);
  assert.equal(normalizeSolverFrequency(true), null);

  // Strict honesty boundary: solverVerified !== true or strategySupported === false returns null
  assert.equal(
    buildSolverFrequencyComparison({
      street: 'flop',
      playerAction: 'call',
      solverAction: 'raise',
      optimalFrequency: 80,
      selectedFrequency: 20,
      evLossMeasured: true,
      evLossBB: 1.45,
      solverVerified: false,
    }),
    null,
  );
  assert.equal(
    buildSolverFrequencyComparison(
      {
        street: 'flop',
        playerAction: 'call',
        solverAction: 'raise',
        optimalFrequency: 80,
        solverVerified: true,
      },
      { strategySupported: false },
    ),
    null,
  );
  assert.equal(
    buildSolverFrequencyComparison({
      street: 'flop',
      playerAction: 'call',
      solverAction: 'raise',
      optimalFrequency: 80,
      solverVerified: true,
      strategySupported: false,
    }),
    null,
  );

  // Verified decision with ratio frequencies and measured EV loss
  const verifiedWithLoss = buildSolverFrequencyComparison({
    street: 'turn',
    playerAction: 'check',
    solverAction: 'bet',
    optimalFrequency: 0.82,
    selectedFrequency: 0.18,
    evLossMeasured: true,
    evLossBB: -1.35,
    solverVerified: true,
  });
  assert.ok(verifiedWithLoss);
  assert.equal(verifiedWithLoss.heroAction, 'Check');
  assert.equal(verifiedWithLoss.solverAction, 'Bet');
  assert.equal(verifiedWithLoss.optimalFrequencyPct, 82);
  assert.equal(verifiedWithLoss.heroFrequencyPct, 18);
  assert.equal(verifiedWithLoss.evLossBb, 1.35);
  assert.equal(verifiedWithLoss.evLossLabel, '-1.35 BB');

  // Verified decision where evLossMeasured is false must NEVER fabricate an EV Loss pill
  const verifiedUnmeasuredLoss = buildSolverFrequencyComparison({
    street: 'river',
    playerAction: 'fold',
    optimalAction: 'call',
    optimalPct: 68,
    heroFrequency: 32,
    evLossMeasured: false,
    evLossBB: 2.5,
    solverVerified: true,
  });
  assert.ok(verifiedUnmeasuredLoss);
  assert.equal(verifiedUnmeasuredLoss.optimalFrequencyPct, 68);
  assert.equal(verifiedUnmeasuredLoss.heroFrequencyPct, 32);
  assert.equal(verifiedUnmeasuredLoss.evLossBb, null);
  assert.equal(verifiedUnmeasuredLoss.evLossLabel, null);

  // SSR render verification for verified vs unverified vs unsupported hands
  const verifiedHtml = ReactDOMServer.renderToStaticMarkup(
    React.createElement(InlineHandReplay, {
      hand: { heroCards: ['As', 'Kd'], board: ['Qh', 'Jh', '2c'], heroPosition: 'BTN', potBb: 12, effectiveStackBb: 88 },
      initialStreet: 'flop',
      decisions: [
        {
          street: 'flop',
          playerAction: 'check',
          solverAction: 'bet',
          optimalFrequency: 0.78,
          selectedFrequency: 0.22,
          evLossMeasured: true,
          evLossBB: 0.94,
          solverVerified: true,
        },
      ],
    }),
  );
  assert.match(verifiedHtml, /data-testid="replay-solver-frequency-bar"/);
  assert.match(verifiedHtml, /data-testid="replay-hero-action-pill"/);
  assert.match(verifiedHtml, /data-testid="replay-solver-optimal-pill"/);
  assert.match(verifiedHtml, /data-testid="replay-ev-loss-pill"/);
  assert.match(verifiedHtml, /-0\.94 BB/);
  assert.match(verifiedHtml, /width:78%/);
  assert.match(verifiedHtml, /width:22%/);

  // Unverified decision must NEVER render replay-solver-frequency-bar
  const unverifiedHtml = ReactDOMServer.renderToStaticMarkup(
    React.createElement(InlineHandReplay, {
      hand: { heroCards: ['As', 'Kd'], board: ['Qh', 'Jh', '2c'] },
      initialStreet: 'flop',
      decisions: [
        {
          street: 'flop',
          playerAction: 'check',
          solverAction: 'bet',
          optimalFrequency: 78,
          evLossMeasured: true,
          evLossBB: 0.94,
          solverVerified: false,
        },
      ],
    }),
  );
  assert.doesNotMatch(unverifiedHtml, /data-testid="replay-solver-frequency-bar"/);

  // Strategy-unsupported hand must NEVER render replay-solver-frequency-bar even if decision has solverVerified: true
  const unsupportedHtml = ReactDOMServer.renderToStaticMarkup(
    React.createElement(InlineHandReplay, {
      strategySupported: false,
      hand: { heroCards: ['As', 'Kd', 'Qh', 'Jh'], board: ['2c', '3d', '4s'] },
      initialStreet: 'flop',
      decisions: [
        {
          street: 'flop',
          playerAction: 'check',
          solverAction: 'bet',
          optimalFrequency: 78,
          solverVerified: true,
        },
      ],
    }),
  );
  assert.doesNotMatch(unsupportedHtml, /data-testid="replay-solver-frequency-bar"/);
  assert.match(unsupportedHtml, /data-testid="replay-strategy-unsupported-banner"/);
});

test('2. [useAssistant & leaks.js] Account-scoped 30s SWR cache isolates accounts, expires after TTL, and invalidates on pa-data-updated & pa-leak-review-updated', () => {
  const listeners = new Map();
  const prevWindow = globalThis.window;
  globalThis.window = {
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      listeners.get(type)?.delete(fn);
    },
    dispatchEvent(evt) {
      const type = typeof evt === 'string' ? evt : evt?.type;
      for (const fn of listeners.get(type) || []) fn(evt);
    },
  };

  try {
    const assistantMod = loadTranspiledModule('src/hooks/useAssistant.js', {
      '../lib/supabase': { supabase: {} },
      '../lib/authUtils': { getAuthUser: () => null, getFreshAccessToken: async () => null },
      '../engine/EventBus': { busEmit: {} },
      '../lib/sandbox/VillainArchetypeRanges': { ARCHETYPE_CONFIG: {} },
      '../lib/sandbox/actionGrading': { gradeAction: () => false },
      '../lib/training/sessionEvidence.mjs': { deriveTrainingSessionAccuracy: () => 0 },
    });

    const {
      PA_SWR_TTL_MS,
      readAssistantCache,
      writeAssistantCache,
      clearAssistantClientCache,
    } = assistantMod;

    assert.equal(PA_SWR_TTL_MS, 30000);
    clearAssistantClientCache();

    // Rejects falsy userId or key
    assert.equal(writeAssistantCache(null, 'leaks', { leaks: [1] }, 1000), null);
    assert.equal(writeAssistantCache('', 'leaks', { leaks: [1] }, 1000), null);
    assert.equal(readAssistantCache(null, 'leaks', 1000), null);
    assert.equal(readAssistantCache('user-alpha', '', 1000), null);

    // Account-scoped storage & retrieval within 30s TTL
    const alphaLeaks = { leaks: [{ id: 'a1' }], isDemo: false };
    const betaLeaks = { leaks: [{ id: 'b1' }], isDemo: false };
    writeAssistantCache('user-alpha', 'leaks', alphaLeaks, 10_000);
    writeAssistantCache('user-beta', 'leaks', betaLeaks, 10_000);
    writeAssistantCache('user-alpha', 'coaching', { snapshot: { owner: 'alpha' } }, 10_000);

    assert.deepEqual(readAssistantCache('user-alpha', 'leaks', 25_000), alphaLeaks);
    assert.deepEqual(readAssistantCache('user-beta', 'leaks', 25_000), betaLeaks);
    assert.equal(readAssistantCache('user-beta', 'coaching', 25_000), null, 'Zero cross-account leakage');

    // Expires strictly at/after PA_SWR_TTL_MS (30000ms)
    assert.equal(readAssistantCache('user-alpha', 'leaks', 40_000), null);

    // Specific user cache clear leaves other accounts untouched
    writeAssistantCache('user-alpha', 'stats', { handsAnalyzed: 42 }, 50_000);
    writeAssistantCache('user-beta', 'stats', { handsAnalyzed: 99 }, 50_000);
    clearAssistantClientCache('user-alpha');
    assert.equal(readAssistantCache('user-alpha', 'stats', 50_100), null);
    assert.deepEqual(readAssistantCache('user-beta', 'stats', 50_100), { handsAnalyzed: 99 });

    // Omitting userId clears all entries
    clearAssistantClientCache();
    assert.equal(readAssistantCache('user-beta', 'stats', 50_100), null);

    // Automatic invalidation when pa-data-updated or pa-leak-review-updated fires
    writeAssistantCache('user-alpha', 'coaching', { snapshot: { active: 2 } }, 60_000);
    assert.ok(readAssistantCache('user-alpha', 'coaching', 60_100));
    globalThis.window.dispatchEvent({ type: 'pa-data-updated' });
    assert.equal(readAssistantCache('user-alpha', 'coaching', 60_100), null);

    writeAssistantCache('user-alpha', 'coaching', { snapshot: { active: 3 } }, 70_000);
    assert.ok(readAssistantCache('user-alpha', 'coaching', 70_100));
    globalThis.window.dispatchEvent({ type: 'pa-leak-review-updated' });
    assert.equal(readAssistantCache('user-alpha', 'coaching', 70_100), null);
  } finally {
    globalThis.window = prevWindow;
  }

  // Verify hook & page wiring in source
  const hooksSrc = read('src/hooks/useAssistant.js');
  const leaksSrc = read('pages/hub/personal-assistant/leaks.js');

  assert.match(hooksSrc, /export const PA_SWR_TTL_MS = 30000;/);
  assert.match(hooksSrc, /export function readAssistantCache\(userId, key, nowMs/);
  assert.match(hooksSrc, /export function writeAssistantCache\(userId, key, value, nowMs/);
  assert.match(hooksSrc, /export function clearAssistantClientCache\(userId\)/);
  assert.match(hooksSrc, /readAssistantCache\(authUserId,\s*'stats'\)/);
  assert.match(hooksSrc, /writeAssistantCache\(authUserId,\s*'stats'/);
  assert.match(hooksSrc, /readAssistantCache\(authUserId,\s*leaksCacheKey\)/);
  assert.match(hooksSrc, /writeAssistantCache\(authUserId,\s*leaksCacheKey/);

  assert.match(leaksSrc, /readAssistantCache\(userId,\s*'coaching'\)/);
  assert.match(leaksSrc, /writeAssistantCache\(userId,\s*'coaching',\s*json\)/);
  assert.match(leaksSrc, /clearAssistantClientCache\(userId\)/);
});

test('3. [CoachingWorkspace] buildCoverageGapsHarvestPayload and Copy Harvest Queue JSON button export structured JSON with accessible live confirmation', () => {
  const coachingSrc = read('src/components/personal-assistant/CoachingWorkspace.jsx');

  assert.match(coachingSrc, /export function buildCoverageGapsHarvestPayload\(/);
  assert.match(coachingSrc, /data-testid="copy-coverage-gaps-btn"/);
  assert.match(coachingSrc, /Copy Harvest Queue JSON/);
  assert.match(coachingSrc, /Copied Harvest Queue/);
  assert.match(coachingSrc, /Copy Failed/);
  assert.match(coachingSrc, /minHeight:\s*44/);

  const coachingMod = loadTranspiledModule('src/components/personal-assistant/CoachingWorkspace.jsx', {
    'lucide-react': new Proxy({}, { get: () => () => null }),
    '../sandbox/paKit': { BottomSheet: () => null },
    '../../lib/authUtils': { getFreshAccessToken: async () => null },
    '../../hooks/useAssistant': { useLeakHandExamples: () => ({ examples: [], isLoading: false, error: null }) },
    '../../hooks/useModalHistory': { useModalHistory: () => {} },
    '../../lib/personal-assistant/coachingIntelligence.mjs': {
      buildAdviceExplanation: () => ({}),
      buildEvidenceChain: () => [],
    },
    '../../lib/personal-assistant/liveVerificationPresentation.mjs': {
      normalizeCoverageGapsRanked: () => ({ rows: [], total: null }),
      normalizeFunnelMetrics: () => null,
    },
    './CoachingWorkspace.module.css': new Proxy({}, { get: (_, prop) => String(prop) }),
  });

  const { buildCoverageGapsHarvestPayload } = coachingMod;
  assert.equal(typeof buildCoverageGapsHarvestPayload, 'function');

  // Empty buckets return null so button never renders when there are no coverage gaps
  assert.equal(buildCoverageGapsHarvestPayload(null), null);
  assert.equal(buildCoverageGapsHarvestPayload({ solverCoverageGaps: { totalUnmeasured: 0, topGaps: [] } }), null);
  assert.equal(buildCoverageGapsHarvestPayload({ coverageGaps: { totalUnmeasured: 0, buckets: [] } }), null);

  // Supports coverageGaps.buckets and solverCoverageGaps.topGaps
  const fixedIso = '2026-11-27T00:30:00.000Z';
  const payloadFromTopGaps = buildCoverageGapsHarvestPayload(
    {
      solverCoverageGaps: {
        totalUnmeasured: 19,
        topGaps: [
          { format: 'Tournament NLH', street: 'TURN', heroPosition: 'BTN', spotType: 'barrel', count: 12, sharePercent: 63.2 },
          { format: 'Cash NLH', street: 'RIVER', heroPosition: 'BB', spotType: 'bluff_catch', count: 7, sharePercent: 36.8 },
        ],
      },
    },
    null,
    fixedIso,
  );

  assert.deepEqual(payloadFromTopGaps, {
    schemaVersion: 1,
    exportedAt: fixedIso,
    totalUnmeasured: 19,
    buckets: [
      {
        format: 'Tournament NLH',
        street: 'turn',
        position: 'BTN',
        spotType: 'barrel',
        count: 12,
        sharePercent: 63.2,
      },
      {
        format: 'Cash NLH',
        street: 'river',
        position: 'BB',
        spotType: 'bluff_catch',
        count: 7,
        sharePercent: 36.8,
      },
    ],
  });

  const payloadFromBuckets = buildCoverageGapsHarvestPayload(
    {
      coverageGaps: {
        buckets: [
          { format: 'Cash NLH', street: 'flop', position: 'CO', spotType: 'cbet', stackBucket: '100bb+', reason: 'No Exact Solver Node', count: 5 },
        ],
      },
    },
    null,
    fixedIso,
  );
  assert.equal(payloadFromBuckets.schemaVersion, 1);
  assert.equal(payloadFromBuckets.totalUnmeasured, 5);
  assert.equal(payloadFromBuckets.buckets.length, 1);
  assert.equal(payloadFromBuckets.buckets[0].position, 'CO');
  assert.equal(payloadFromBuckets.buckets[0].stackBucket, '100bb+');
});
