/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  OTC TIER 2 CI FORTRESS: 60-SECOND GTO LEAK FINDER, VERIFY-PHONE
 *  CONTEXTUAL CONTINUITY & DAY-0 ACTIVATION CHECKLIST (2026-11-27)
 * ═══════════════════════════════════════════════════════════════════════════
 * Permanent regression locks for:
 *   1. src/content/tools/gtoLeakFinderSpots.js — 5 mathematically valid GTO
 *      decision spots + pure deterministic scoreGtoLeakFinder(answers).
 *   2. pages/tools/gto-leak-finder.js — #SMARTERDESIGN masthead, SEOHead
 *      (<= 60 char title, <= 158 char description, dynamic OG card, canonical,
 *      WebApplication + FAQPage JSON-LD matching visible FaqSection), 5-hand
 *      interactive flow, sp:seo-tool-engaged + trackSeoFunnelEvent wiring,
 *      Peak-Dopamine Reveal Screen (guest locked matrix + unlock CTA +
 *      sp_saved_spots_v1 persistence vs signed-in full matrix), valid CSS
 *      module class references, zero banned gold, zero em dashes.
 *   3. pages/hub/verify-phone.js — exported describePendingDestination(nextPath)
 *      and appendSeoUnlockedParam(rawPath) preserving non-SEO paths while
 *      adding unlocked=1 to SEO routes, plus contextual continuity bar when
 *      isWelcome && nextPath.
 *   4. src/components/seo/SmarterUnlockedWelcomeBanner.jsx — Day-0 First 3
 *      Wins mini-checklist (auto-checking Win #1 on savedSpotCount > 0) +
 *      contextual 2-link Hub Gravity rail, preserving zero lib/analytics
 *      imports and variant parity with SmarterAccountUnlockGate.jsx.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const require = createRequire(import.meta.url);
const ts = require('typescript');

const {
  GTO_LEAK_FINDER_SPOTS,
  scoreGtoLeakFinder,
} = await import('../src/content/tools/gtoLeakFinderSpots.js');

const BANNED_GOLD = /#(f59e0b|eab308|fbbf24|d97706|ffd700|d4af37|facc15)\b/i;

test('OTC-T2 LAW 1: gtoLeakFinderSpots.js exports 5 solver-accurate spots and pure scoreGtoLeakFinder()', () => {
  assert.equal(Array.isArray(GTO_LEAK_FINDER_SPOTS), true);
  assert.equal(GTO_LEAK_FINDER_SPOTS.length, 5);

  const expectedCategories = [
    'Preflop 3-Bet Defense',
    'Flop C-Bet Discipline',
    'Turn Barrel Selection',
    'River Bluff-Catching',
    'MTT ICM Shove/Fold',
  ];
  assert.deepEqual(
    GTO_LEAK_FINDER_SPOTS.map((s) => s.category),
    expectedCategories,
  );

  for (const spot of GTO_LEAK_FINDER_SPOTS) {
    assert.ok(spot.id && typeof spot.id === 'string');
    assert.ok(spot.title && typeof spot.title === 'string');
    assert.ok(spot.heroPos && spot.villainAction);
    assert.equal(Array.isArray(spot.heroCards) && spot.heroCards.length === 2, true);
    assert.equal(Array.isArray(spot.boardCards), true);
    assert.equal(typeof spot.potBb, 'number');
    assert.equal(typeof spot.stackBb, 'number');
    assert.equal(spot.options.length, 3, `${spot.id} must have 3 action options`);
    const optimalOpts = spot.options.filter((o) => o.isOptimal);
    assert.equal(optimalOpts.length, 1, `${spot.id} must have exactly 1 optimal option`);
    assert.equal(optimalOpts[0].evDeltaBb, 0, `${spot.id} optimal option must have 0 EV loss`);
    const freqSum = spot.options.reduce((sum, o) => sum + o.solverFreqPct, 0);
    assert.equal(freqSum, 100, `${spot.id} solver frequencies must sum to 100%`);
    assert.ok(spot.leakTitle && spot.leakFixDrill.startsWith('/'));
    assert.ok(spot.bb100Impact > 0);
  }

  // Empty answers
  const emptyScore = scoreGtoLeakFinder({});
  assert.equal(emptyScore.answeredCount, 0);
  assert.equal(emptyScore.optimalCount, 0);
  assert.equal(emptyScore.accuracyPct, 0);
  assert.equal(emptyScore.estimatedLeakBb100, 0);
  assert.equal(emptyScore.primaryLeak, null);
  assert.equal(emptyScore.categoryBreakdown.length, 5);

  // All 5 optimal
  const allOptimal = {};
  for (const spot of GTO_LEAK_FINDER_SPOTS) {
    allOptimal[spot.id] = spot.options.find((o) => o.isOptimal).id;
  }
  const perfectScore = scoreGtoLeakFinder(allOptimal);
  assert.equal(perfectScore.answeredCount, 5);
  assert.equal(perfectScore.optimalCount, 5);
  assert.equal(perfectScore.accuracyPct, 100);
  assert.equal(perfectScore.estimatedLeakBb100, 0);
  assert.equal(perfectScore.primaryLeak, null);
  assert.match(perfectScore.playerGrade, /Solver Elite/);

  // Mixed answers (3 optimal, 2 worst blunders)
  const mixed = {
    'preflop-3bet-defense': 'fold-3bet', // worst blunder (-1.85 BB, 1.8 BB/100)
    'flop-cbet-discipline': 'check-back', // optimal
    'turn-barrel-selection': 'barrel-large', // optimal
    'river-bluff-catching': 'call-river', // optimal
    'mtt-icm-shove-fold': 'limp-call-icm', // worst blunder (-1.94 BB, 1.7 BB/100)
  };
  const mixedScore = scoreGtoLeakFinder(mixed);
  assert.equal(mixedScore.answeredCount, 5);
  assert.equal(mixedScore.optimalCount, 3);
  assert.equal(mixedScore.accuracyPct, 60);
  assert.equal(mixedScore.estimatedLeakBb100, 3.5);
  assert.equal(mixedScore.primaryLeak?.spotId, 'preflop-3bet-defense');
  assert.equal(mixedScore.primaryLeak?.bb100Impact, 1.8);

  // Array-form input parity
  const arrayInput = Object.entries(mixed).map(([spotId, optionId]) => ({ spotId, optionId }));
  assert.deepEqual(scoreGtoLeakFinder(arrayInput), mixedScore);
});

test('OTC-T2 LAW 2: pages/tools/gto-leak-finder.js wires SEO, JSON-LD, funnel telemetry, guest unlock gate & valid CSS module classes', () => {
  const src = read('pages/tools/gto-leak-finder.js');
  const dataSrc = read('src/content/tools/gtoLeakFinderSpots.js');

  // SEO title <= 60 chars and meta description <= 158 chars
  const titleMatch = src.match(/<SEOHead[\s\S]*?title="([^"]+)"/);
  const descMatch = src.match(/<SEOHead[\s\S]*?description="([^"]+)"/);
  assert.ok(titleMatch, 'gto-leak-finder.js must pass literal title to SEOHead');
  assert.ok(descMatch, 'gto-leak-finder.js must pass literal description to SEOHead');
  assert.equal(titleMatch[1], '60-Second GTO Poker Leak Finder Free | Smarter.Poker');
  assert.ok(titleMatch[1].length <= 60, `Title exceeds 60 chars: ${titleMatch[1].length}`);
  assert.ok(descMatch[1].length <= 158, `Description exceeds 158 chars: ${descMatch[1].length}`);

  assert.match(src, /\/api\/og\/tool-card\?tool=gto&title=60-Second%20GTO%20Leak%20Finder&subtitle=5-Hand%20Solver%20Diagnostic/);
  assert.match(src, /CANONICAL_PATH\s*=\s*'\/tools\/gto-leak-finder'/);
  assert.match(src, /<SmarterSeoMasthead[\s\S]*?vertical="tools"/);
  assert.match(src, /<SmarterAccountUnlockGate[\s\S]*?variant="training-gto"/);
  assert.match(src, /hubProductSchema\(/);
  assert.match(src, /<FaqSection\s+faqs=\{LEAK_FINDER_FAQS\}/);
  assert.match(src, /sp:seo-tool-engaged/);
  assert.match(src, /trackSeoFunnelEvent\('seo_leak_finder_step'/);
  assert.match(src, /trackSeoFunnelEvent\('seo_leak_finder_complete'/);
  assert.match(src, /trackSeoFunnelEvent\('seo_leak_finder_unlock_click'/);
  assert.match(src, /openQuickSignup\(/);
  assert.match(src, /unlockKey:\s*'gto-leak-finder-report'/);
  assert.match(src, /redirectPath:\s*'\/tools\/gto-leak-finder\?unlocked=1'/);
  assert.match(src, /SAVED_SPOTS_STORAGE_KEY/);
  assert.match(src, /Unlock Full Leak Report &amp; 30-Day Free VIP/);
  assert.match(src, /Copy Shareable Score Card/);

  // Verify every styles.* reference exists in SmarterSeoKit.module.css
  const css = read('src/components/seo/SmarterSeoKit.module.css');
  const definedClasses = new Set([...css.matchAll(/\.([A-Za-z][A-Za-z0-9_-]*)/g)].map((m) => m[1]));
  const missingClasses = [];
  for (const m of src.matchAll(/\bstyles\.([A-Za-z][A-Za-z0-9_-]*)\b/g)) {
    if (!definedClasses.has(m[1])) missingClasses.push(`styles.${m[1]}`);
  }
  assert.deepEqual(missingClasses, [], `Undefined CSS module classes in gto-leak-finder.js: ${missingClasses.join(', ')}`);

  // Verify global _app.js mounts GuestConversionBar & SmarterUnlockedWelcomeBanner cleanly
  const appSrc = read('pages/_app.js');
  assert.match(appSrc, /<GuestConversionBar \/>/);
  assert.match(appSrc, /<SmarterUnlockedWelcomeBanner \/>/);

  // Zero em/en dashes, zero banned gold, clean JSX compilation
  for (const [label, body] of [['gto-leak-finder.js', src], ['gtoLeakFinderSpots.js', dataSrc]]) {
    assert.doesNotMatch(body, /[\u2014\u2013]/, `${label} must not contain em or en dashes`);
    assert.doesNotMatch(body, BANNED_GOLD, `${label} must not contain banned gold hexes`);
  }
  const transpiled = ts.transpileModule(src, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: 'gto-leak-finder.jsx',
  });
  assert.equal(transpiled.diagnostics?.length || 0, 0);
});

test('OTC-T2 LAW 3: pages/hub/verify-phone.js exports describePendingDestination & appendSeoUnlockedParam and renders continuity bar', () => {
  const src = read('pages/hub/verify-phone.js');
  assert.match(src, /export function describePendingDestination\(/);
  assert.match(src, /export function appendSeoUnlockedParam\(/);
  assert.match(src, /data-testid="verify-phone-continuity-bar"/);
  assert.match(src, /Claim Your Free 30-Day VIP \+ 500 Diamonds In 15 Seconds, Or Skip Straight There/);
  assert.doesNotMatch(src, BANNED_GOLD, 'verify-phone.js must not contain banned gold hexes');

  const compiled = ts.transpileModule(src, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: 'verify-phone.jsx',
  }).outputText;

  const mod = { exports: {} };
  vm.runInNewContext(compiled, {
    module: mod,
    exports: mod.exports,
    console,
    encodeURIComponent,
    URL,
    require: (name) => {
      if (name === 'react' || name === 'react/jsx-runtime') return require(name);
      return {};
    },
  });

  const { describePendingDestination, appendSeoUnlockedParam } = mod.exports;
  assert.equal(describePendingDestination('/tools/gto-leak-finder'), 'Your Full GTO Leak Report');
  assert.equal(describePendingDestination('/tools/preflop-ranges?pos=BTN'), 'Your Saved GTO Preflop Range');
  assert.equal(describePendingDestination('/tools/odds/aa-vs-kk'), 'Your Saved Hand Equity Spot');
  assert.equal(describePendingDestination('/tools/poker-odds-calculator'), 'Your Saved Hand Equity Spot');
  assert.equal(describePendingDestination('/hub/series/wsop-2026'), 'Your Tournament Event Reminder');
  assert.equal(describePendingDestination('/hub/venues/bellagio'), 'Your Followed Poker Room');
  assert.equal(describePendingDestination('/learn/hands/ak'), 'Your GTO Strategy Drill');
  assert.equal(describePendingDestination('https://evil.example/tools/odds'), null);
  assert.equal(describePendingDestination('//evil.example/tools/odds'), null);

  // SEO routes get unlocked=1 once; non-SEO routes remain untouched
  assert.equal(appendSeoUnlockedParam('/tools/gto-leak-finder'), '/tools/gto-leak-finder?unlocked=1');
  assert.equal(appendSeoUnlockedParam('/tools/gto-leak-finder?unlocked=1'), '/tools/gto-leak-finder?unlocked=1');
  assert.equal(appendSeoUnlockedParam('/tools/preflop-ranges?pos=CO'), '/tools/preflop-ranges?pos=CO&unlocked=1');
  assert.equal(appendSeoUnlockedParam('/learn/hands/aa#faq'), '/learn/hands/aa?unlocked=1#faq');
  assert.equal(appendSeoUnlockedParam('/hub/series/wsop'), '/hub/series/wsop?unlocked=1');
  assert.equal(appendSeoUnlockedParam('/hub/venues/aria'), '/hub/venues/aria?unlocked=1');
  assert.equal(appendSeoUnlockedParam('/compare/plo4-vs-plo5'), '/compare/plo4-vs-plo5?unlocked=1');
  assert.equal(appendSeoUnlockedParam('/freerolls'), '/freerolls?unlocked=1');
  assert.equal(
    appendSeoUnlockedParam('/hub/personal-assistant/review?hand=abc-123'),
    '/hub/personal-assistant/review?hand=abc-123',
  );
  assert.equal(
    appendSeoUnlockedParam('/hub/club-arena/invite/xyz?ref=1'),
    '/hub/club-arena/invite/xyz?ref=1',
  );
});

test('OTC-T2 LAW 4: SmarterUnlockedWelcomeBanner renders Day-0 First 3 Wins checklist and contextual Hub Gravity rail', () => {
  const src = read('src/components/seo/SmarterUnlockedWelcomeBanner.jsx');
  assert.match(src, /data-testid="unlocked-banner-day0-checklist"/);
  assert.match(src, /data-testid="unlocked-banner-gravity-rail"/);
  assert.match(src, /Explore More Free On Smarter\.Poker/);
  assert.match(src, /Day-0 First 3 Wins/);
  assert.doesNotMatch(src, /lib\/analytics/, 'SmarterUnlockedWelcomeBanner must never import lib/analytics');
  assert.doesNotMatch(src, BANNED_GOLD, 'SmarterUnlockedWelcomeBanner must not contain banned gold hexes');

  const compiled = ts.transpileModule(src, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: 'SmarterUnlockedWelcomeBanner.jsx',
  }).outputText;

  const mod = { exports: {} };
  vm.runInNewContext(compiled, {
    module: mod,
    exports: mod.exports,
    console,
    require: (name) => {
      if (name === 'react' || name === 'react/jsx-runtime') return require(name);
      if (name === 'next/link') return { default: () => null };
      if (name === 'next/router') return { useRouter: () => ({ asPath: '/tools/gto-leak-finder' }) };
      if (name.endsWith('/seoFunnelTelemetry')) return { trackSeoFunnelEvent: () => {} };
      if (name.endsWith('.module.css')) return { default: {} };
      return {};
    },
  });

  const { buildDay0ChecklistState, resolveHubGravityLinks } = mod.exports;
  assert.equal(typeof buildDay0ChecklistState, 'function');
  assert.equal(typeof resolveHubGravityLinks, 'function');

  // Win #1 auto-checked when savedSpotCount > 0
  const freshChecklist = buildDay0ChecklistState({ savedSpotCount: 0, completedIds: [] });
  assert.equal(freshChecklist.length, 3);
  assert.equal(freshChecklist[0].completed, false);
  assert.equal(freshChecklist[1].href, '/hub/training');
  assert.equal(freshChecklist[2].href, '/hub/poker-near-me');

  const syncedChecklist = buildDay0ChecklistState({ savedSpotCount: 2, completedIds: ['play-gto-hands'] });
  assert.equal(syncedChecklist[0].completed, true);
  assert.equal(syncedChecklist[1].completed, true);
  assert.equal(syncedChecklist[2].completed, false);

  // Contextual Hub Gravity rail returns 2 distinct links per vertical
  const gtoLinks = resolveHubGravityLinks('gto-leak-finder-report', '/tools/gto-leak-finder');
  assert.equal(gtoLinks.length, 2);
  assert.ok(gtoLinks.some((l) => l.href === '/hub/bankroll-manager'));
  assert.ok(gtoLinks.some((l) => l.href === '/hub/poker-near-me/lobby'));

  const venueLinks = resolveHubGravityLinks('live-venue-intel', '/hub/venues/bellagio');
  assert.equal(venueLinks.length, 2);
  assert.ok(venueLinks.some((l) => l.href === '/tools/gto-leak-finder'));
  assert.ok(venueLinks.some((l) => l.href === '/hub/bankroll-manager'));
});
