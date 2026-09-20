/**
 * PERSONAL ASSISTANT: MOBILE PHASE 4 UPGRADES STAY APPLIED.
 *
 * Phase 4 (2026-09-09) rebuilt the three /hub/personal-assistant routes on the
 * phase 0 foundation and the always-displayed standard. Every pin below is a
 * specific defect that shipped on this surface, so a later edit cannot quietly
 * put it back:
 *
 *  - the five section anchors were an `overflow-x: auto` snap carousel of
 *    126px cards below 640, with the scrollbar hidden;
 *  - `.loopLabel` was `display: none` below 960, leaving three numbered steps
 *    with nothing saying what the row was;
 *  - `.sessionDate` was `display: none` below 640, hiding the one field that
 *    tells two sessions apart;
 *  - the leaks trend was a deliberate horizontal snap carousel;
 *  - CoachingWorkspace's six views sat in a fixed 6x72px `overflow-x` box;
 *  - the page carried its own `padding-bottom: calc(88px + safe-area)` on top
 *    of the BottomNavSpacer that pages/_app.js already renders for all three
 *    routes (they are in src/config/bottom-nav-routes.json);
 *  - `min-height: 100vh` on the hub and the sandbox route;
 *  - `overflow-x: hidden` on the leaks and sandbox page roots, which makes
 *    them scroll containers on WebKit and re-parents fixed descendants;
 *  - 30-plus type declarations between 7px and 11px;
 *  - four breakpoints (380 / 640 / 960 plus the sandbox route's own 640).
 *
 * Changelog: docs/changelog/2026-09-09-mobile-phase4-personal-assistant.md
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const EM_DASH = String.fromCharCode(0x2014);

const HUB_PAGE = 'pages/hub/personal-assistant/index.js';
const LEAKS_PAGE = 'pages/hub/personal-assistant/leaks.js';
const SANDBOX_PAGE = 'pages/hub/personal-assistant/sandbox.js';
const PAGES = [HUB_PAGE, LEAKS_PAGE, SANDBOX_PAGE];
const HUB_CSS = 'src/styles/worlds/PersonalAssistantHub.module.css';
const TOOLS_CSS = 'src/styles/worlds/PersonalAssistantTools.module.css';
const COACH_CSS = 'src/components/personal-assistant/CoachingWorkspace.module.css';
const CSS_FILES = [HUB_CSS, TOOLS_CSS, COACH_CSS];
const TUTORIAL = 'src/tutorials/personal-assistant.js';
const COMPONENT_DIR = 'src/components/personal-assistant';

function walk(dir) {
  const full = path.join(ROOT, dir);
  return fs.readdirSync(full).flatMap((entry) => {
    const rel = path.join(dir, entry);
    return fs.statSync(path.join(ROOT, rel)).isDirectory() ? walk(rel) : [rel];
  });
}

const COMPONENT_FILES = walk(COMPONENT_DIR).filter((f) => /\.(js|jsx)$/.test(f));

// Source with comments removed: these files explain what they replaced, and a
// pin must judge the code, not the explanation of the code.
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('the hub page is built on the phase 0a foundation', () => {
  const src = read(HUB_PAGE);
  assert.match(src, /import HubPageShell from '\.\.\/\.\.\/\.\.\/src\/components\/ui\/HubPageShell'/, 'imports HubPageShell');
  assert.match(src, /<HubPageShell\b/, 'renders HubPageShell');
  assert.match(src, /import PullToRefresh from/, 'imports PullToRefresh');
  assert.match(src, /<PullToRefresh\b/, 'renders PullToRefresh');
  assert.match(src, /useLoadFailsafe\(dataLoading, setDataLoading\)/, 'caps the load at eight seconds');
  assert.match(src, /useModalHistory\(showMenu, closeMenu\)/, 'Back closes the menu');
  assert.match(src, /const haptic = useHaptics\(\)/, 'uses haptics');
  assert.match(src, /const requireOnline = useCallback/, 'has an offline guard');
});

test('the retry and the daily reload are guarded when the browser is offline', () => {
  const src = read(HUB_PAGE);
  // retryAssistantData is the one network action on the hub page.
  assert.match(src, /const retryAssistantData = useCallback\(async \(\) => \{\s*if \(isRetrying\) return;\s*if \(!requireOnline\(\)\) return;/,
    'retryAssistantData checks requireOnline before firing');
  assert.match(src, /if \(!requireOnline\(\)\) return;\s*haptic\('light'\);\s*setDailyHandReloadKey/,
    'the daily-hand retry checks requireOnline before firing');
  // Leak detection reads hand history and writes user_leaks.
  assert.match(read(LEAKS_PAGE), /const handleRunDetection = useCallback\(async \(\) => \{\s*if \(!requireOnline\(\)\) return;/,
    'leak detection checks requireOnline before firing');
});

test('the loading flags are the capped pair, not the raw hook flags', () => {
  const src = stripComments(read(HUB_PAGE));
  const body = src.slice(src.indexOf('return (\n    <PageTransition>'));
  assert.doesNotMatch(body, /\bstatsLoading\b/, 'the render reads statsBusy, not the uncapped statsLoading');
  assert.doesNotMatch(body, /\bsessionsLoading\b/, 'the render reads sessionsBusy, not the uncapped sessionsLoading');
  assert.match(src, /const statsBusy = statsLoading && dataLoading;/);
  assert.match(src, /const sessionsBusy = sessionsLoading && dataLoading;/);
});

test('no hidden horizontal rail anywhere on the surface', () => {
  const banned = [
    /scrollbar-width\s*:\s*none/i,
    /scrollbarWidth\s*:\s*['"]none['"]/,
    /scroll-snap-type\s*:/i,
    /scrollSnapType\s*:/,
    /::-webkit-scrollbar\s*\{\s*display\s*:\s*none/i,
  ];
  for (const rel of [...PAGES, ...CSS_FILES, ...COMPONENT_FILES]) {
    const src = read(rel);
    for (const re of banned) assert.doesNotMatch(src, re, `${rel} reintroduced a hidden rail (${re})`);
  }
  // The specific carousels this phase replaced.
  assert.match(read(HUB_CSS), /grid-template-columns: repeat\(auto-fit, minmax\(104px, 1fr\)\)/, 'the anchors wrap');
  assert.match(read(LEAKS_PAGE), /trendPointRow: \{\s*display: 'flex',\s*flexWrap: 'wrap',/, 'the trend row wraps');
  assert.match(read(COACH_CSS), /\.viewNav \{ display: grid; grid-template-columns: repeat\(auto-fit, minmax\(104px, 1fr\)\); \}/,
    'the coaching views wrap');
  assert.doesNotMatch(read(COACH_CSS), /\.viewNav \{[^}]*overflow-x/, 'the coaching views are not a scroller');
});

test('nothing on the surface is culled with display none', () => {
  for (const rel of [...CSS_FILES]) {
    const src = stripComments(read(rel));
    const hits = src.split('\n')
      .map((line, i) => [i + 1, line])
      .filter(([, line]) => /display:\s*none/i.test(line));
    assert.deepEqual(hits, [], `${rel} culls content:\n${hits.map(([n, l]) => `${n}: ${l.trim()}`).join('\n')}`);
  }
  // The two named in ROLLOUT-PLAN, by class, so a rename cannot hide them.
  const hub = read(HUB_CSS);
  assert.doesNotMatch(hub, /\.loopLabel \{ display: none/, 'the Decision Loop keeps its label');
  assert.doesNotMatch(hub, /\.sessionDate \{ display: none/, 'a session keeps its date');
  assert.match(hub, /\.sessionDate \{ grid-column: 2; grid-row: 2;/, 'the date is laid out, not hidden');
});

test('100dvh everywhere and no bare overflow-x hidden', () => {
  for (const rel of [...PAGES, ...CSS_FILES, ...COMPONENT_FILES]) {
    const src = stripComments(read(rel));
    assert.doesNotMatch(src, /min-?[Hh]eight:?\s*['"]?100vh/, `${rel} still uses 100vh`);
    assert.doesNotMatch(src, /overflowX:\s*'hidden'/, `${rel} uses overflow-x hidden (use clip)`);
    assert.doesNotMatch(src, /overflow-x:\s*hidden/, `${rel} uses overflow-x hidden (use clip)`);
  }
  assert.match(read(LEAKS_PAGE), /overflowX: 'clip'/, 'the leaks page root clips');
  assert.match(read(SANDBOX_PAGE), /overflow-x: clip;/, 'the sandbox page root clips');
});

test('the page does not add a second bottom clearance', () => {
  const hub = stripComments(read(HUB_CSS));
  assert.doesNotMatch(hub, /padding-bottom:\s*calc\(\s*\d+px \+ env\(safe-area-inset-bottom/,
    'BottomNavSpacer in pages/_app.js owns the bottom clearance');
  const routes = JSON.parse(read('src/config/bottom-nav-routes.json'));
  for (const route of ['/hub/personal-assistant', '/hub/personal-assistant/leaks', '/hub/personal-assistant/sandbox']) {
    assert.ok(Object.prototype.hasOwnProperty.call(routes, route), `${route} is in bottom-nav-routes.json`);
  }
});

test('no font under 12px on the surface', () => {
  /* DECIMALS COUNT. The first pass of this sweep matched `([0-9]|1[01])px`
     and therefore missed `.telemetryLabel { font-size: 6.5px }` inside the
     Tools module's phone block, which rendered the three Leak Finder
     telemetry labels at 6.5px, the smallest type in the estate. A browser
     measurement at 375 is what found it. This pattern reads the number. */
  /* Read declaration by declaration, not line by line: several rules here are
     written one per line with four properties in them, so "is there a `font:`
     earlier on this line" also caught the `margin: 8px 0` in
     `.nextAction > strong { font-size: 18px; margin: 8px 0; }`. */
  const tooSmall = (line) => line
    .replace(/^[^{]*\{/, '')
    .split(';')
    .filter((decl) => /^\s*font(-size)?\s*:/.test(decl))
    .some((decl) => {
      // `font:` shorthand is `weight size/line-height family`; the value after
      // the slash is a line-height, not a size.
      const value = decl.replace(/^\s*font(-size)?\s*:/, '').replace(/\/\s*[\d.]+/g, '');
      return [...value.matchAll(/(?<![\w.])(\d+(?:\.\d+)?)px/g)].some((m) => Number(m[1]) < 12);
    });
  for (const rel of CSS_FILES) {
    const src = stripComments(read(rel));
    const hits = src.split('\n')
      .map((line, i) => [i + 1, line])
      .filter(([, line]) => tooSmall(line));
    assert.deepEqual(hits, [], `${rel} has text under 12px:\n${hits.map(([n, l]) => `${n}: ${l.trim()}`).join('\n')}`);
  }
  for (const rel of [...PAGES, ...COMPONENT_FILES]) {
    const src = stripComments(read(rel));
    const hits = src.split('\n')
      .map((line, i) => [i + 1, line])
      .filter(([, line]) => /fontSize:\s*(\d+(\.\d+)?)\b/.test(line) && Number(line.match(/fontSize:\s*(\d+(?:\.\d+)?)/)[1]) < 12)
      .concat(src.split('\n').map((line, i) => [i + 1, line]).filter(([, line]) => tooSmall(line)));
    assert.deepEqual(hits, [], `${rel} has text under 12px:\n${hits.map(([n, l]) => `${n}: ${l.trim()}`).join('\n')}`);
  }
});

test('three breakpoints only: 900, 768, 600', () => {
  const allowed = new Set(['900', '768', '600']);
  for (const rel of [...CSS_FILES, SANDBOX_PAGE]) {
    const src = read(rel);
    const widths = [...src.matchAll(/@media[^{]*\(max-width:\s*(\d+)px\)/g)].map((m) => m[1]);
    for (const w of widths) assert.ok(allowed.has(w), `${rel} uses a ${w}px breakpoint (900/768/600 only)`);
  }
});

test('layout is CSS only: no width branch decides what renders', () => {
  for (const rel of [...PAGES, ...COMPONENT_FILES]) {
    const src = stripComments(read(rel));
    assert.doesNotMatch(src, /window\.innerWidth/, `${rel} branches on window.innerWidth (hydration #418)`);
    assert.doesNotMatch(src, /matchMedia\(/, `${rel} branches on matchMedia (hydration #418)`);
  }
});

test('the tutorial is registered for the whole prefix with eight steps', () => {
  const registry = read('src/tutorials/index.js');
  assert.match(registry, /prefix: '\/hub\/personal-assistant', tutorial: PERSONAL_ASSISTANT_TUTORIAL/);
  assert.doesNotMatch(registry, /prefix: '\/hub\/personal-assistant'[^\n]*exact: true/, 'the row is a prefix, not exact');

  const tut = read(TUTORIAL);
  const steps = (tut.match(/^\s{4}\{\s*$/gm) || []).length;
  assert.equal(steps, 8, `the tour has eight steps (found ${steps})`);
  assert.ok(!tut.includes(EM_DASH), 'no em dash in the tutorial');

  // Every alternative of every target exists somewhere on the three routes.
  const dom = PAGES.map(read).join('\n');
  const targets = [...tut.matchAll(/target: '([^']+)'/g)].flatMap((m) => m[1].split('|'));
  assert.ok(targets.length >= 8, 'the tour spotlights at least eight elements');
  for (const t of targets) {
    assert.match(dom, new RegExp(`data-tutorial="${t}"`), `no data-tutorial="${t}" on any personal-assistant route`);
  }
});

test('the budget row for the route is converted', () => {
  const budget = JSON.parse(read('scripts/ci/mobile-budget.json'));
  const row = budget.routes['/hub/personal-assistant'];
  assert.ok(row, 'the route has a budget row');
  assert.equal(row.converted, true, 'the row is flipped to converted, so 12px/44px are enforced in CI');
});

test('the law allowlist counts phase 4 as converted', () => {
  const law = read('__tests__/no-slide-to-see.law.test.mjs');
  // PIN MOVED, NOT LOOSENED (mobile phase 5): the list is append-only, so
  // what matters is that 4 is in it with 1..3 ahead. Phase 5's own test
  // pins the full array.
  const converted = JSON.parse(law.match(/const CONVERTED = (\[[^\]]*\]);/)[1]);
  assert.deepEqual(converted.slice(0, 4), [1, 2, 3, 4], 'phases 1 to 4 lead CONVERTED in order');
  assert.match(law, /'src\/components\/personal-assistant',/, 'the component dir is in the phase 4 target list');
});
