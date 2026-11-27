/**
 * Phase 9 Regression Guard: PA Kit, Inline Hand Replay, Quick Spot Drill & Live Spot Quick Entry
 * Visual Polish, 4-Color Poker Cards, GPU-Composited Animations, Reduced-Motion & Accessibility.
 *
 * Permanently verifies:
 *  1. [paKit.jsx & paTokens.js]
 *     - Z-index tokens strictly above BOTTOM_NAV_Z = 900 (backdrop: 950, sheet: 951, popover: 980, toast: 1000).
 *     - PAStyles() @media (prefers-reduced-motion: reduce) disables transitions/animations on
 *       .pa-btn, .pa-disclosure > summary::after, .pa-disclosure-body, .pa-progress-fill, .pa-replay-tab.
 *     - PAStyles() .pa-replay-tab focus-visible (outline: 2px solid #83deff; outline-offset: 2px;), hover, and active press feedback.
 *     - BottomSheet gentle in-viewport entrance animation when !reduce
 *       (initial: { opacity: 0, scale: 0.985 }, animate: { opacity: 1, scale: 1 }, transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] }).
 *     - .pa-disclosure rotating chevron indicator on summary::after + hover tint + composited fade-in on [open] > .pa-disclosure-body.
 *     - aria-hidden="true" on all 5 decorative Lucide icons (X, Inbox, AlertTriangle, RefreshCw, LogIn).
 *     - safeStorage throttles private-mode console.warn to once per session.
 *  2. [InlineHandReplay.jsx]
 *     - className="pa-btn pa-replay-tab" on all 4 street <button role="tab"> pills (Pre, Flop, Turn, River).
 *     - High-contrast 4-color SUIT_COLORS (c: '#4DE0A5', d: '#56D8FF', h: '#FF6B7A', s: '#F1F5FC'),
 *       obsidian bevels (Hero cards with #56d8ff top rim, Board cards with #aec0d0 top rim), and #9eb4c8 "None (Preflop)".
 *     - GPU-composited Optimal Frequency and Hero Frequency fill bars using .pa-progress-fill,
 *       transform: scaleX(pct / 100), and transformOrigin: 'left center'.
 *  3. [QuickSpotDrill.jsx]
 *     - parseDrillHeroHandCards parses concrete 2-card combos (e.g., As Kd, AhKh) into 4-color obsidian playing-card badges
 *       and keeps a styled pill fallback for range notation (e.g., AKs, QQ).
 *     - 250ms countdown bar and level ladder bar use GPU-composited width: '100%', transform: scaleX(ratio),
 *       transformOrigin: 'left center' guarded by reduce.
 *     - Smooth reduced-motion-guarded reveal transition on post-answer feedback / GTO explanation card.
 *     - aria-hidden="true" on all decorative Lucide icons (Flame, Zap, AlertTriangle, RotateCcw) and no noisy
 *       [App] Handled exception console.warn on navigator.vibrate?.().
 *  4. [LiveSpotQuickEntry.jsx]
 *     - className="pa-btn" on all interactive buttons/links (Sign In, Dismiss, Drill This Spot, Cancel Audit,
 *       Choose .Txt File, Analyze Hand History).
 *     - Bulk audit progress bar uses GPU-composited scaleX with .pa-progress-fill.
 *     - Raw ASCII "Review & Action ->" replaced with <ChevronRight size={16} aria-hidden="true" />, and stack input has placeholder="100".
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
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

test('1. [paTokens & paKit] Z-index above 900, reduced-motion CSS, sheet entrance, disclosure chevrons, icon a11y, and safeStorage warn throttling', async () => {
  const paTokens = await import(pathToFileURL(path.join(ROOT, 'src/components/sandbox/paTokens.js')).href);
  const paKitSrc = read('src/components/sandbox/paKit.jsx');

  // Z-index hierarchy strictly above BOTTOM_NAV_Z = 900
  assert.deepEqual(paTokens.Z, {
    base: 1,
    felt: 10,
    feltCards: 20,
    sticky: 50,
    bottomNav: 100,
    backdrop: 950,
    sheet: 951,
    popover: 980,
    toast: 1000,
  });

  // 4-color deck tokens exported from paTokens
  assert.deepEqual(paTokens.SUIT_COLORS, {
    c: '#4DE0A5',
    d: '#56D8FF',
    h: '#FF6B7A',
    s: '#F1F5FC',
  });

  // PAStyles() rules: reduced-motion, .pa-replay-tab focus/hover/active, .pa-disclosure chevron & fade-in, .pa-progress-fill
  assert.match(paKitSrc, /\.pa-replay-tab:focus-visible\s*\{\s*outline:\s*2px solid #83deff;\s*outline-offset:\s*2px;\s*\}/i);
  assert.match(paKitSrc, /\.pa-replay-tab:hover:not\(:disabled\)/);
  assert.match(paKitSrc, /\.pa-replay-tab:active:not\(:disabled\)/);
  assert.match(paKitSrc, /\.pa-progress-fill\s*\{[\s\S]*?transform-origin:\s*left center/);
  assert.match(paKitSrc, /\.pa-disclosure\s*>\s*summary:hover/);
  assert.match(paKitSrc, /\.pa-disclosure\s*>\s*summary::after\s*\{[\s\S]*?transform:\s*rotate\(0deg\)/);
  assert.match(paKitSrc, /\.pa-disclosure\[open\]\s*>\s*summary::after\s*\{\s*transform:\s*rotate\(180deg\)/);
  assert.match(paKitSrc, /@media\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{[\s\S]*?\.pa-disclosure\[open\]\s*>\s*\.pa-disclosure-body\s*\{[\s\S]*?animation:\s*paDisclosureFade/);
  assert.match(
    paKitSrc,
    /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.pa-btn,[\s\S]*?\.pa-disclosure\s*>\s*summary::after,[\s\S]*?\.pa-disclosure-body,[\s\S]*?\.pa-progress-fill,[\s\S]*?\.pa-replay-tab[\s\S]*?transition:\s*none\s*!important;[\s\S]*?animation:\s*none\s*!important;/,
  );

  // BottomSheet in-viewport entrance animation when !reduce
  assert.match(paKitSrc, /initial:\s*\{\s*opacity:\s*0,\s*scale:\s*0\.985\s*\}/);
  assert.match(paKitSrc, /animate:\s*\{\s*opacity:\s*1,\s*scale:\s*1\s*\}/);
  assert.match(paKitSrc, /transition:\s*\{\s*duration:\s*0\.18,\s*ease:\s*\[0\.22,\s*1,\s*0\.36,\s*1\]\s*\}/);

  // All 5 decorative Lucide icons in paKit.jsx carry aria-hidden="true"
  for (const iconName of ['X', 'Inbox', 'AlertTriangle', 'RefreshCw', 'LogIn']) {
    const matches = paKitSrc.match(new RegExp(`<${iconName}\\b[^>]*>`, 'g')) || [];
    assert.ok(matches.length >= 1, `Expected <${iconName} ...> in paKit.jsx`);
    for (const tag of matches) {
      assert.match(tag, /aria-hidden="true"/, `${tag} in paKit.jsx must have aria-hidden="true"`);
    }
  }

  // Runtime test of safeStorage once-per-session warning throttle
  const paKitMod = loadTranspiledModule('src/components/sandbox/paKit.jsx', {
    './paTokens': paTokens,
    'react-dom': { createPortal: (node) => node },
    'framer-motion': {
      motion: { div: 'div' },
      AnimatePresence: ({ children }) => children,
    },
    'lucide-react': {
      X: () => null,
      AlertTriangle: () => null,
      RefreshCw: () => null,
      LogIn: () => null,
      Inbox: () => null,
    },
  });

  const prevWindow = globalThis.window;
  const prevWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.join(' '));
  globalThis.window = {
    localStorage: {
      getItem() { throw new Error('QuotaExceededError'); },
      setItem() { throw new Error('QuotaExceededError'); },
      removeItem() { throw new Error('QuotaExceededError'); },
    },
  };
  try {
    paKitMod.safeStorage.resetWarn?.();
    assert.equal(paKitMod.safeStorage.get('k1', 'fallback'), 'fallback');
    assert.equal(paKitMod.safeStorage.set('k1', 'v1'), false);
    assert.equal(paKitMod.safeStorage.remove('k1'), false);
    assert.equal(warnings.length, 1, 'safeStorage must warn at most once per session');
    assert.match(warnings[0], /\[safeStorage\] read blocked:/);
  } finally {
    console.warn = prevWarn;
    globalThis.window = prevWindow;
  }
});

test('2. [InlineHandReplay] 4-color cards, obsidian bevels, street tab .pa-btn.pa-replay-tab, #9eb4c8 preflop label, and GPU scaleX frequency bars', () => {
  const replaySrc = read('src/components/personal-assistant/InlineHandReplay.jsx');
  const replayMod = loadTranspiledModule('src/components/personal-assistant/InlineHandReplay.jsx');
  const InlineHandReplay = replayMod.default;

  // Source contracts
  assert.match(replaySrc, /c:\s*'#4DE0A5'/);
  assert.match(replaySrc, /d:\s*'#56D8FF'/);
  assert.match(replaySrc, /h:\s*'#FF6B7A'/);
  assert.match(replaySrc, /s:\s*'#F1F5FC'/);
  assert.doesNotMatch(replaySrc, /#688299/, 'None (Preflop) must be brightened from #688299 to #9eb4c8');

  // SSR render on preflop to verify "None (Preflop)" color and 4 street tabs with .pa-btn.pa-replay-tab
  const preflopHtml = ReactDOMServer.renderToStaticMarkup(
    React.createElement(InlineHandReplay, {
      hand: { heroCards: ['Ac', 'Kd'], board: ['Qh', 'Js', '2c'], heroPosition: 'BTN', potBb: 6.5, effectiveStackBb: 100 },
      initialStreet: 'preflop',
      streetTimeline: [
        { street: 'preflop', board: [] },
        { street: 'flop', board: ['Qh', 'Js', '2c'] },
        { street: 'turn', board: ['Qh', 'Js', '2c', '9d'] },
        { street: 'river', board: ['Qh', 'Js', '2c', '9d', '4s'] },
      ],
      decisions: [
        {
          street: 'preflop',
          playerAction: 'raise',
          solverAction: 'raise',
          optimalFrequency: 0.85,
          selectedFrequency: 0.85,
          evLossMeasured: true,
          evLossBB: 0,
          solverVerified: true,
        },
      ],
    }),
  );

  assert.match(preflopHtml, /None \(Preflop\)/);
  assert.match(preflopHtml, /color:#9eb4c8[^>]*>None \(Preflop\)/);

  // All 4 street tabs have role="tab" and class="pa-btn pa-replay-tab"
  const tabMatches = preflopHtml.match(/<button[^>]*role="tab"[^>]*>/g) || [];
  assert.equal(tabMatches.length, 4, 'Expected 4 street tabs (Pre, Flop, Turn, River)');
  for (const tabTag of tabMatches) {
    assert.match(tabTag, /class="pa-btn pa-replay-tab"/);
  }

  // SSR render on flop with all 4 suits across Hero and Board cards + frequency bars
  const flopHtml = ReactDOMServer.renderToStaticMarkup(
    React.createElement(InlineHandReplay, {
      hand: { heroCards: ['Ac', 'Kd'], board: ['Qh', 'Js', '2c'], heroPosition: 'BTN', potBb: 14, effectiveStackBb: 93 },
      initialStreet: 'flop',
      decisions: [
        {
          street: 'flop',
          playerAction: 'check',
          solverAction: 'bet',
          optimalFrequency: 0.76,
          selectedFrequency: 0.24,
          evLossMeasured: true,
          evLossBB: 0.85,
          solverVerified: true,
        },
      ],
    }),
  );

  // 4-color suits rendered
  assert.match(flopHtml, /color:#4DE0A5/i);
  assert.match(flopHtml, /color:#56D8FF/i);
  assert.match(flopHtml, /color:#FF6B7A/i);
  assert.match(flopHtml, /color:#F1F5FC/i);

  // Hero cards have #56d8ff top rim (data-card-variant="hero"), Board cards have #aec0d0 top rim (data-card-variant="board")
  assert.match(flopHtml, /border-top-color:#56d8ff[^>]*data-card="Ac"[^>]*data-card-variant="hero"/);
  assert.match(flopHtml, /border-top-color:#aec0d0[^>]*data-card="Qh"[^>]*data-card-variant="board"/);

  // Optimal and Hero frequency fill bars use .pa-progress-fill + GPU-composited scaleX + transform-origin:left center
  assert.match(flopHtml, /data-testid="replay-solver-frequency-bar"/);
  assert.match(flopHtml, /class="pa-progress-fill"\s+data-testid="replay-optimal-frequency-fill"[^>]*transform:scaleX\(0\.76\);transform-origin:left center/);
  assert.match(flopHtml, /class="pa-progress-fill"\s+data-testid="replay-hero-frequency-fill"[^>]*transform:scaleX\(0\.24\);transform-origin:left center/);
});

test('3. [QuickSpotDrill] 4-color combo card parser & pill fallback, GPU timer & level ladder bars, feedback reveal, icon a11y, and silent vibrate catch', async () => {
  const drillSrc = read('src/components/sandbox/QuickSpotDrill.jsx');
  const paTokens = await import(pathToFileURL(path.join(ROOT, 'src/components/sandbox/paTokens.js')).href);

  const drillMod = loadTranspiledModule('src/components/sandbox/QuickSpotDrill.jsx', {
    'lucide-react': {
      Zap: () => null,
      Check: () => null,
      X: () => null,
      Flame: () => null,
      RotateCcw: () => null,
      AlertTriangle: () => null,
      CalendarDays: () => null,
    },
    '../../lib/authUtils': { authedFetch: async () => ({ ok: true, json: async () => ({}) }) },
    '../../lib/personal-assistant/lockedDrillResult': { lockedDrillResult: () => ({}) },
    '../../lib/personal-assistant/persistenceContract': { readPersistenceResponse: async () => ({}) },
    '../../lib/sandbox/leakReview': { gradeReview: () => ({}), migrateRecord: (r) => r, SCHEMA_VERSION: 3 },
    '../../lib/personal-assistant/assistantDefaults.mjs': {
      PA_ANALYSIS_DEFAULTS: { practiceDifficulty: 'standard' },
      resolveDrillTiming: () => ({ durationSeconds: 15, label: '15s Standard' }),
    },
    './paTokens': paTokens,
    './paKit': {
      BottomSheet: ({ children }) => React.createElement('div', null, children),
      PAStyles: () => null,
      Skeleton: () => null,
      EmptyState: () => null,
      ErrorState: () => null,
      safeStorage: { get: () => '1', set: () => true, remove: () => true },
      usePrefersReducedMotion: () => false,
    },
  });

  const { parseDrillHeroHandCards } = drillMod;
  assert.equal(typeof parseDrillHeroHandCards, 'function');

  // Concrete 2-card combos parse to 4-color cards
  const asKd = parseDrillHeroHandCards('As Kd');
  assert.equal(asKd?.length, 2);
  assert.deepEqual(asKd[0], { rank: 'A', canonicalRank: 'A', suitKey: 's', suit: '♠', color: '#F1F5FC', code: 'As' });
  assert.deepEqual(asKd[1], { rank: 'K', canonicalRank: 'K', suitKey: 'd', suit: '♦', color: '#56D8FF', code: 'Kd' });

  const ahQc = parseDrillHeroHandCards('AhQc');
  assert.equal(ahQc?.length, 2);
  assert.equal(ahQc[0].color, '#FF6B7A');
  assert.equal(ahQc[1].color, '#4DE0A5');

  const tens = parseDrillHeroHandCards('10s 10h');
  assert.equal(tens?.length, 2);
  assert.equal(tens[0].rank, '10');
  assert.equal(tens[0].code, 'Ts');
  assert.equal(tens[1].code, 'Th');

  // Range notation or duplicate cards return null so range pill fallback renders
  assert.equal(parseDrillHeroHandCards('AKs'), null);
  assert.equal(parseDrillHeroHandCards('QQ'), null);
  assert.equal(parseDrillHeroHandCards('T9o'), null);
  assert.equal(parseDrillHeroHandCards('As As'), null);
  assert.equal(parseDrillHeroHandCards(null), null);

  // GPU-composited timer bar & level ladder bar guarded by reduce
  assert.match(drillSrc, /data-testid="drill-timer-fill"/);
  assert.match(drillSrc, /data-testid="drill-level-ladder-fill"/);
  assert.match(drillSrc, /transform:\s*`scaleX\(\$\{Math\.min\(1,\s*Math\.max\(0,\s*timer\s*\/\s*spotDuration\)\)\}\)`/);
  assert.match(drillSrc, /transform:\s*`scaleX\(\$\{Math\.max\(0,\s*Math\.min\(1,\s*ladderPct\s*\/\s*100\)\)\}\)`/);
  assert.match(drillSrc, /transition:\s*reduce\s*\?\s*'none'\s*:\s*'transform 0\.25s linear/);
  assert.doesNotMatch(drillSrc, /transition:\s*reduce\s*\?\s*'none'\s*:\s*'width 0\.25s linear/);

  // Reduced-motion-guarded reveal transition on GTO explanation card
  assert.match(drillSrc, /className="pa-feedback-reveal"/);
  assert.match(drillSrc, /data-testid="drill-gto-explanation"/);

  // All decorative Lucide icons in QuickSpotDrill.jsx carry aria-hidden="true"
  for (const iconName of ['Flame', 'Zap', 'AlertTriangle', 'RotateCcw', 'CalendarDays', 'Check', 'X']) {
    const matches = drillSrc.match(new RegExp(`<${iconName}\\b[^>]*>`, 'g')) || [];
    assert.ok(matches.length >= 1, `Expected <${iconName} ...> in QuickSpotDrill.jsx`);
    for (const tag of matches) {
      assert.match(tag, /aria-hidden="true"/, `${tag} in QuickSpotDrill.jsx must have aria-hidden="true"`);
    }
  }

  // Noisy [App] Handled exception console.warn on navigator.vibrate removed
  assert.doesNotMatch(drillSrc, /\[App\] Handled exception/);
});

test('4. [LiveSpotQuickEntry] .pa-btn on all interactive buttons, GPU scaleX bulk progress bar, ChevronRight CTA icon, and stack placeholder="100"', () => {
  const liveSpotSrc = read('src/components/personal-assistant/LiveSpotQuickEntry.jsx');

  // Every <button> in LiveSpotQuickEntry has className="pa-btn"
  const buttonTags = liveSpotSrc.match(/<button\b[\s\S]*?>/g) || [];
  assert.ok(buttonTags.length >= 9, `Expected >= 9 <button> elements in LiveSpotQuickEntry.jsx, found ${buttonTags.length}`);
  for (const btnTag of buttonTags) {
    assert.match(btnTag, /className="pa-btn"/, `Button missing className="pa-btn": ${btnTag}`);
  }

  // Action links (Sign In, Drill This Spot) also carry className="pa-btn"
  const linkTags = liveSpotSrc.match(/<a\b[\s\S]*?>/g) || [];
  assert.equal(linkTags.length, 2, 'Expected Sign In and Drill This Spot action links');
  for (const linkTag of linkTags) {
    assert.match(linkTag, /className="pa-btn"/, `Link missing className="pa-btn": ${linkTag}`);
  }

  // Bulk audit progress bar switched to GPU-composited scaleX with .pa-progress-fill
  assert.match(liveSpotSrc, /className="pa-progress-fill"/);
  assert.match(liveSpotSrc, /data-testid="live-spot-bulk-progress-fill"/);
  assert.match(liveSpotSrc, /transform:\s*`scaleX\(/);
  assert.match(liveSpotSrc, /transformOrigin:\s*'left center'/);
  assert.doesNotMatch(liveSpotSrc, /transition:\s*'width 0\.2s ease'/);

  // Raw ASCII "Review & Action ->" replaced with <ChevronRight size={16} aria-hidden="true" /> and stack input has placeholder="100"
  assert.doesNotMatch(liveSpotSrc, /Review &amp; Action -&gt;|Review & Action ->/);
  assert.match(liveSpotSrc, /<span>Review &amp; Action<\/span>\s*<ChevronRight size=\{16\} aria-hidden="true" \/>/);
  assert.match(liveSpotSrc, /id=\{id\('stack'\)\}[\s\S]{0,160}placeholder="100"/);

  // Strict personal-assistant component laws on InlineHandReplay.jsx and LiveSpotQuickEntry.jsx
  for (const rel of [
    'src/components/personal-assistant/InlineHandReplay.jsx',
    'src/components/personal-assistant/LiveSpotQuickEntry.jsx',
  ]) {
    const src = read(rel);
    assert.doesNotMatch(src, /display\s*:\s*['"]?none/i, `${rel} must never use display: none`);
    assert.doesNotMatch(src, /scroll-snap-type|scrollSnapType/i, `${rel} must never use scroll-snap-type`);
    assert.doesNotMatch(src, /scrollbar-width\s*:\s*none|scrollbarWidth\s*:\s*['"]none['"]/i, `${rel} must never hide scrollbars`);
    assert.doesNotMatch(src, /window\.innerWidth|matchMedia\(/, `${rel} must never branch on window.innerWidth or matchMedia(`);
    assert.doesNotMatch(src, /—|&mdash;|&#8212;/i, `${rel} must never contain em dashes`);
  }
});
