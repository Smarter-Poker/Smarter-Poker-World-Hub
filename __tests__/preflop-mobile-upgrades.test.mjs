/**
 * PREFLOP CHARTS: MOBILE PHASE 2 UPGRADES STAY APPLIED.
 *
 * Phase 2 (2026-09-04) rebuilt Preflop Charts (pages/hub/memory-games.js,
 * served at /hub/preflop-charts) on the phase 0 foundation: HubPageShell,
 * the 8s load failsafe, the offline guard, haptics, no 100vh, no
 * window.innerWidth render decisions, a 13x13 matrix that fits 375px with
 * no sideways scroll, a wrapping mode grid and section nav, a
 * ResponsiveTable leaderboard, no text under 12px anywhere on the route,
 * and an eight-step tutorial registered for both URL prefixes. Each pin
 * below is one of those, so a later edit cannot quietly undo it.
 *
 * Changelog: docs/changelog/2026-09-04-mobile-phase2-preflop-charts.md
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const EM_DASH = String.fromCharCode(0x2014);

const PAGE = 'pages/hub/memory-games.js';
const CSS = 'src/styles/worlds/memory-games.css';
const TUTORIAL = 'src/tutorials/preflop-charts.js';
const COMPONENT_DIR = 'src/components/memory-games';
const SUBPAGES = ['achievements', 'leaderboard', 'stats', 'tutorial'].map((p) => `pages/hub/memory-games/${p}.js`);

function walk(dir) {
  const full = path.join(ROOT, dir);
  return fs.readdirSync(full).flatMap((entry) => {
    const rel = path.join(dir, entry);
    return fs.statSync(path.join(ROOT, rel)).isDirectory() ? walk(rel) : [rel];
  });
}

const ROUTE_FILES = [PAGE, CSS, ...SUBPAGES, ...walk(COMPONENT_DIR)].filter((f) => /\.(js|jsx|css)$/.test(f));

// Source with block comments removed: the files explain what they replaced,
// and a pin must judge the code, not the explanation.
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('the page is built on the phase 0a foundation', () => {
  const src = read(PAGE);
  assert.match(src, /import HubPageShell from '\.\.\/\.\.\/src\/components\/ui\/HubPageShell'/);
  assert.match(src, /<HubPageShell className="preflop" maxWidth=\{1080\}/);
  assert.match(src, /useLoadFailsafe\(memoryDashboardLoading, setMemoryDashboardLoading\)/);
  assert.match(src, /useInitialLoadRef\(\)/);
  assert.match(src, /className="preflop-menu preflop-menu-skeleton"/, 'first-paint skeleton mirrors the menu');
  assert.match(src, /useModalHistory\(/, 'page wires useModalHistory');
  assert.match(src, /useOnlineStatus\(\)/);
  assert.match(src, /OFFLINE_TOAST/);
  assert.match(src, /useHaptics\(\)/);
  assert.match(src, /<PullToRefresh onRefresh=\{refreshMenu\}/);
  assert.match(src, /TUTORIAL_WILL_OPEN_EVENT/, 'page returns to the menu when the tour is about to open');
  assert.doesNotMatch(src, /100vh/, 'no 100vh left on the page');
  assert.doesNotMatch(src, /paddingBottom:\s*70/, 'no page-owned bottom clearance');
  assert.doesNotMatch(src, /window\.innerWidth/, 'no window width decides a render or an effect origin');
  assert.doesNotMatch(src, /import[^\n]*from\s+['"]framer-motion['"]/, 'framer-motion is not in the menu chunk');
  assert.doesNotMatch(src, /import UniversalHeader/, 'the shell owns the header');
});

test('every remaining network mutation is guarded and every mode pick has a haptic', () => {
  const src = read(PAGE);
  const guards = (src.match(/requireOnline\(\)/g) || []).length;
  assert.ok(guards >= 5, `expected at least 5 requireOnline() guards, found ${guards}`);
  assert.doesNotMatch(src, /checkAndDeductDiamonds|DiamondEngine\.deduct\s*\(/, 'free local practice has no entry-fee mutation');
  assert.match(src, /const updatePreference = useCallback\(async \(key, value\) => \{\s*if \(!requireOnline\(\)\) return;/);
  assert.match(src, /LOCAL PRACTICE AUTHORITY BOUNDARY/, 'locally graded results stop at the browser boundary');
  assert.doesNotMatch(
    src,
    /(?:recordSession|checkAndUnlock|updateLeaderboard|completeChallenge|processGameResult)\s*\(/,
    'locally graded results cannot reach retired persistence services',
  );
  assert.match(src, /haptic\('light'\); setGameType\(m\.key\);/, 'mode card haptic');
  assert.match(src, /const handleStrokeStart = useCallback[\s\S]*?haptic\('light'\);/, 'one haptic per stroke');
  assert.match(src, /haptic\('success'\)/, 'pass haptic');
});

test('the matrix is one paint control that fits 375px with no sideways scroll', () => {
  const matrix = stripComments(read(`${COMPONENT_DIR}/PreflopRangeMatrix.jsx`));
  assert.match(matrix, /role="gridcell"/);
  assert.doesNotMatch(matrix, /<button/, 'cells are not buttons');
  assert.match(matrix, /data-allow-small-target="true"/);
  assert.match(matrix, /document\.elementFromPoint/);
  assert.match(matrix, /onPointerDown=\{handlePointerDown\}/);
  assert.match(matrix, /onPointerMove=\{handlePointerMove\}/);
  assert.match(matrix, /aria-selected=\{!!userAction\}/);
  assert.match(matrix, /aria-activedescendant/);
  assert.doesNotMatch(matrix, /scrollIntoView\(\{ block: 'nearest', inline/, 'no horizontal scrollIntoView');
  const css = read(CSS);
  assert.doesNotMatch(css, /min-width:\s*628px/);
  assert.doesNotMatch(css, /preflop-lab-grid-scroll/);
  assert.doesNotMatch(css, /overflow-x:\s*auto/, 'nothing on the route scrolls sideways');
  assert.match(css, /\.preflop-lab-grid \{[^}]*grid-template-columns: minmax\(20px, 0\.8fr\) repeat\(13, minmax\(0, 1fr\)\);[^}]*width: 100%;[^}]*min-width: 0;/s);
  assert.match(css, /\.preflop-lab-grid\[role='grid'\] \{[^}]*touch-action: none;/s);
  assert.match(css, /\.preflop-lab-touch-readout \{[^}]*min-height: 44px;[^}]*font-size: 14px;/s);
  const budget = read('e2e/mobile-budget.spec.ts');
  assert.match(budget, /data-allow-small-target/, 'the budget spec excludes the paint grid from tiny targets');
  assert.match(read(PAGE), /className="preflop-lab-touch-readout"/);
});

test('no rail, no snap, no hidden scrollbar: the mode grid and section nav wrap', () => {
  const css = read(CSS);
  assert.match(css, /\.preflop-mode-rail \{[^}]*grid-template-columns: repeat\(auto-fill, minmax\(140px, 1fr\)\);/s);
  assert.match(css, /@media \(max-width: 768px\) \{[\s\S]*?\.preflop-mode-rail \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.doesNotMatch(css, /scroll-snap/);
  assert.doesNotMatch(css, /scrollbar-width:\s*none/);
  assert.doesNotMatch(css, /flex:\s*0 0 118px/);
  assert.match(css, /\.preflop-subpage-nav,\s*\.preflop-tab-rail \{[^}]*flex-wrap: wrap;/s);
  assert.match(css, /\.preflop-subpage-nav\.is-sticky \{[^}]*top: var\(--sp-header-height, 56px\);/s);
  assert.match(css, /\.preflop-lab-command-strip \{[^}]*top: var\(--sp-header-height, 56px\);/s);
  const rail = stripComments(read(`${COMPONENT_DIR}/PreflopTabRail.jsx`));
  assert.doesNotMatch(rail, /scrollIntoView/);
  assert.match(rail, /role="tablist"/);
  assert.match(rail, /tabIndex=\{selected === item\.key \? 0 : -1\}/, 'roving tabindex kept');
});

test('memory-games.css uses only the 900 / 768 / 600 boundaries', () => {
  const css = read(CSS);
  const queries = [...css.matchAll(/@media\s*\(([^)]+)\)/g)].map((m) => m[1].trim());
  const widths = queries.filter((q) => /width/.test(q));
  for (const q of widths) {
    assert.match(q, /^(max-width: (900|768|600)px|min-width: (901|769|601)px)$/, `unexpected breakpoint: ${q}`);
  }
  assert.ok(widths.length > 0);
  // `overflow-x: hidden` alone would make an accidental scroller (see
  // __tests__/fixed-elements-stay-fixed.test.mjs); the shell owns that rule.
  assert.doesNotMatch(css, /overflow-x:\s*hidden/);
});

test('live rankings stay responsive and the retired browser-owned board renders no unverified table', () => {
  assert.match(read(PAGE), /<ResponsiveTable columns=\{LEADERBOARD_COLUMNS\}/);
  const retiredLeaderboard = read('pages/hub/memory-games/leaderboard.js');
  assert.doesNotMatch(retiredLeaderboard, /<ResponsiveTable|from\(['"]training_leaderboard['"]\)/);
  assert.match(retiredLeaderboard, /No Unverified Scores Displayed/);
  assert.match(retiredLeaderboard, /Legacy Rankings Are Archived/);
  assert.match(retiredLeaderboard, /Open Club Arena/);
  const raw = [PAGE, ...SUBPAGES, ...walk(COMPONENT_DIR)].filter((f) => /\.(js|jsx)$/.test(f) && /<table\b/.test(read(f)));
  assert.deepEqual(raw, [], `raw tables (use ResponsiveTable): ${raw.join(', ')}`);
  assert.doesNotMatch(read(CSS), /preflop-ranking-scroll/);
});

test('no text under 12px on the page, the stylesheet, the components or the subpages', () => {
  const small = [
    /font-size:\s*(?:[0-9]|1[01])px/,
    /font:\s*[^;]*\b(?:[0-9]|1[01])px/,
    /fontSize:\s*(?:[0-9]|1[01])\b/,
    /fontSize:\s*'(?:[0-9]|1[01])px'/,
    /clamp\(\s*(?:[0-9]|1[01])px/,
  ];
  const offences = ROUTE_FILES.flatMap((f) =>
    read(f).split('\n').map((line, i) => (small.some((re) => re.test(line)) ? `${f}:${i + 1}: ${line.trim()}` : null)).filter(Boolean)
  );
  assert.deepEqual(offences, [], `text under 12px:\n${offences.join('\n')}`);
});

test('the tutorial has eight steps, both prefixes, every target on the menu, and the guide links to it', () => {
  const tut = read(TUTORIAL);
  assert.match(tut, /preflop_tutorial_seen_v1/);
  const stepsBlock = tut.slice(tut.indexOf('steps: ['), tut.lastIndexOf(']'));
  const ids = [...stepsBlock.matchAll(/^\s{4}\{\s*$/gm)];
  assert.equal(ids.length, 8, `expected 8 tutorial steps, found ${ids.length}`);
  assert.ok(!tut.includes(EM_DASH));
  const registry = read('src/tutorials/index.js');
  assert.match(registry, /prefix: '\/hub\/preflop-charts', tutorial: PREFLOP_TUTORIAL/);
  assert.match(registry, /prefix: '\/hub\/memory-games', tutorial: PREFLOP_TUTORIAL/);
  const dom = [PAGE, ...walk(COMPONENT_DIR)].filter((f) => /\.(js|jsx)$/.test(f)).map(read).join('\n');
  for (const target of ['mode-grid', 'scenario', 'legend', 'matrix', 'submit', 'daily', 'subnav', 'jarvis']) {
    assert.match(dom, new RegExp(`data-tutorial="${target}"|tutorialTarget="${target}"`), `route has the ${target} spotlight target`);
  }
  const page = read(PAGE);
  assert.match(page, /<PreflopMatrixPrimer/, 'the menu carries the static matrix primer');
  assert.doesNotMatch(page, /requestPageTutorial|openPageTutorial/, 'the page never launches the tour itself');
  assert.match(read('pages/hub/memory-games/tutorial.js'), /href="\/hub\/preflop-charts\?tutorial=1"/);
  assert.match(read('pages/hub/memory-games/tutorial.js'), /PREFLOP_TUTORIAL\.steps\.map/);
  assert.match(read('src/components/tutorial/TutorialProvider.jsx'), /router\.query\.tutorial/);
  assert.match(read('src/components/tutorial/TutorialProvider.jsx'), /shallow: true/);
  assert.match(read('src/components/tutorial/PageTutorial.jsx'), /split\('\|'\)/, 'the engine accepts target alternatives');
});

test('every dialog the page opens is a back-gesture sheet with a 44px close', () => {
  const jarvis = read(`${COMPONENT_DIR}/JarvisExplanationDialog.jsx`);
  assert.match(jarvis, /useModalHistory\(open, onClose\)/);
  assert.match(jarvis, /useScrimDismiss\(onClose\)/);
  const jarvisCss = read(`${COMPONENT_DIR}/JarvisExplanationDialog.module.css`);
  assert.match(jarvisCss, /@media \(max-width: 600px\)/);
  assert.match(jarvisCss, /\.close \{[^}]*min-width: 44px;[^}]*min-height: 44px;/s);
  assert.match(jarvisCss, /safe-area-inset-bottom/);
  const ood = read('src/components/gates/OutOfDiamondsModal.jsx');
  assert.match(ood, /useModalHistory\(!!isOpen, onClose\)/);
  assert.match(ood, /useScrimDismiss\(onClose\)/);
  assert.match(ood, /\.sp-ood-close \{[^}]*min-width: 44px;[^}]*min-height: 44px;/);
  assert.match(ood, /@media \(max-width: 600px\)/);
  assert.match(read(PAGE), /useModalHistory\(showFilters, closeFilters\)/);
});

test('the review panel stacks its sections instead of hiding them behind tabs', () => {
  const review = read(`${COMPONENT_DIR}/EnhancedReviewPanel.jsx`);
  assert.doesNotMatch(review, /reviewTab === '/);
  assert.match(review, /id="preflop-review-overview"/);
  assert.match(review, /id="preflop-review-mistakes"/);
  assert.match(review, /id="preflop-review-solution"/);
  assert.match(review, /<PreflopStaticGrid/);
});

test('the subpages sit on HubPageShell and the shell owns the clearance', () => {
  const shell = read(`${COMPONENT_DIR}/PreflopSubpageShell.jsx`);
  assert.match(shell, /<HubPageShell/);
  assert.match(shell, /header=\{<UniversalHeader pageDepth=\{2\} \/>\}/);
  const css = read(CSS);
  assert.doesNotMatch(css, /\.preflop-subpage \{[^}]*min-height: 100vh/s);
  assert.doesNotMatch(css, /\.preflop-subpage \{[^}]*padding-bottom: calc\(76px/s);
});

test('no em dashes or emoji in the touched files', () => {
  const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  for (const f of [...ROUTE_FILES, TUTORIAL, 'src/components/gates/OutOfDiamondsModal.jsx', 'src/games/scenarioFilters.js', 'src/games/ScenarioFilterPanel.jsx']) {
    const src = read(f);
    assert.ok(!src.includes(EM_DASH), `${f} contains an em dash`);
    assert.ok(!emoji.test(src), `${f} contains an emoji`);
  }
});
