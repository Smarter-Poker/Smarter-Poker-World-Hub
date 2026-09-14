/**
 * POKER TRIVIA: MOBILE PHASE 7 UPGRADES STAY APPLIED.
 *
 * Phase 7 (2026-09-14) rebuilt /hub/trivia and its subpages on the phase 0
 * foundation and the always-displayed standard. Every pin below is a defect
 * that shipped on this surface, so a later edit cannot quietly put it back:
 *
 *  - the mode-filter row was a sideways rail (715px of chips in a 357px strip
 *    at 375, hidden scrollbar, snap points, a scrollTo that centred the active
 *    chip) pinned under the header as a sticky bar;
 *  - the tournament bracket was a flex rail with overflow-x auto, so a
 *    four-round bracket on a phone was three rounds off screen;
 *  - the By Mode table on stats and the leaderboard were real <table>s (the
 *    first with minWidth 460 inside an overflowX auto box);
 *  - 112 rendered text nodes under 12px on the lobby (8px eyebrows, 9px chip
 *    counts, 10px kickers), 60 on achievements;
 *  - min-height: 100vh, overflowX: 'hidden' and a page-owned 70px bottom pad
 *    on every subpage, doubling the app shell's BottomNavSpacer;
 *  - breakpoints at 390, 400, 480, 680 and 700.
 *
 * Changelog: docs/changelog/2026-09-14-mobile-phase7-poker-trivia.md
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const EM_DASH = String.fromCharCode(0x2014);

const HUB = 'pages/hub/trivia/index.js';
const LOBBY = 'src/components/trivia/TriviaLobby.jsx';
const TOURNAMENTS = 'pages/hub/trivia/tournaments.js';
const TUTORIAL = 'src/tutorials/trivia.js';
const HUB_PAGES = [HUB, TOURNAMENTS, 'pages/hub/trivia/stats.js', 'pages/hub/trivia/leaderboard.js', 'pages/hub/trivia/achievements.js', 'pages/hub/trivia/settings.js'];
const SURFACE = [
  ...fs.readdirSync(path.join(ROOT, 'pages/hub/trivia')).map((f) => `pages/hub/trivia/${f}`),
  ...fs.readdirSync(path.join(ROOT, 'src/components/trivia')).map((f) => `src/components/trivia/${f}`),
  'src/styles/worlds/trivia.css',
  'src/styles/trivia/TriviaHub.module.css',
].filter((f) => /\.(js|jsx|css)$/.test(f));

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('the lobby is built on the phase 0a foundation', () => {
  const src = read(HUB);
  assert.match(src, /import HubPageShell from '\.\.\/\.\.\/\.\.\/src\/components\/ui\/HubPageShell'/);
  assert.match(src, /<HubPageShell\s+className="trivia"/);
  assert.match(src, /<PullToRefresh onRefresh=\{refreshLobby\} disabled=\{menuOpen\}>/);
  assert.match(src, /useLoadFailsafe\(isLoading, setIsLoading\)/);
  assert.match(src, /const refreshLobby = useCallback\(async \(\) => \{\s*if \(!requireOnline\(\)\) return;/, 'refresh checks requireOnline');
  assert.match(src, /requireOnline=\{requireOnline\}/, 'the lobby is handed requireOnline');
  assert.match(src, /haptic=\{haptic\}/, 'the lobby is handed the haptic');
  const lobby = read(LOBBY);
  assert.match(lobby, /useModalHistory\(showChargePopup, closeChargePopup\)/, 'Back closes the entry popup');
  assert.match(lobby, /if \(!requireOnline\(\)\) return;\s*haptic\('light'\);/, 'starting a mode checks the network and buzzes');
  const css = read('src/styles/trivia/TriviaHub.module.css');
  assert.match(css, /min-height: 100dvh;/);
  assert.doesNotMatch(css, /padding-bottom: 70px/, 'BottomNavSpacer owns the bottom clearance');
});

test('the mode filters wrap and the bracket stacks: no rail on the surface', () => {
  const lobby = stripComments(read(LOBBY));
  assert.match(lobby, /\.mode-filters \{\s*display: grid;\s*grid-template-columns: repeat\(auto-fit, minmax\(150px, 1fr\)\);/);
  assert.doesNotMatch(lobby, /filterRailRef/, 'the rail ref is gone');
  assert.doesNotMatch(lobby, /rail\.scrollTo\(/, 'nothing scrolls a rail');
  assert.doesNotMatch(lobby, /\.mode-filters \{[^}]*position: sticky/, 'a wrapping filter block is not pinned under the header');
  // Keyboard roving on the toolbar stays: it is the WAI-ARIA toolbar pattern, not a rail.
  assert.match(lobby, /case 'ArrowRight'/);
  assert.match(lobby, /filterButtonRefs\.current\[filterIndex\]\?\.focus\(\)/);
  const tournaments = stripComments(read(TOURNAMENTS));
  assert.match(tournaments, /\.bracket-rounds \{\s*display: grid;\s*grid-template-columns: repeat\(auto-fit, minmax\(180px, 1fr\)\);/);
  assert.match(tournaments, /@media \(max-width: 768px\) \{[\s\S]*?\.bracket-rounds \{\s*grid-template-columns: 1fr;/, 'one round per row on a phone');
  const banned = [/scrollbar-width\s*:\s*none/i, /scroll-snap-type\s*:/i, /scrollSnapType\s*:/, /::-webkit-scrollbar\s*\{\s*display\s*:\s*none/i, /overflow-x:\s*auto/, /overflowX:\s*'auto'/];
  for (const rel of SURFACE) {
    const src = stripComments(read(rel));
    for (const re of banned) assert.doesNotMatch(src, re, `${rel} reintroduced a rail (${re})`);
  }
});

test('the tables are ResponsiveTable: cards on a phone, a table on desktop', () => {
  for (const rel of ['pages/hub/trivia/stats.js', 'pages/hub/trivia/leaderboard.js']) {
    const src = stripComments(read(rel));
    assert.match(src, /import ResponsiveTable from '\.\.\/\.\.\/\.\.\/src\/components\/ui\/ResponsiveTable'/, `${rel} imports ResponsiveTable`);
    assert.match(src, /<ResponsiveTable/, `${rel} renders ResponsiveTable`);
    assert.doesNotMatch(src, /<table/, `${rel} still renders a raw table`);
    assert.doesNotMatch(src, /minWidth: '460px'/);
  }
});

test('100dvh, clip, no page-owned bottom pad, and the three sanctioned breakpoints', () => {
  const allowed = new Set(['900', '768', '600']);
  for (const rel of SURFACE) {
    const src = stripComments(read(rel));
    for (const m of src.matchAll(/@media[^{]*\(max-width:\s*(\d+)px\)/g)) assert.ok(allowed.has(m[1]), `${rel} uses a ${m[1]}px breakpoint`);
    assert.doesNotMatch(src, /(?<![\w-])100vh/, `${rel} uses 100vh`);
    assert.doesNotMatch(src, /overflow-x:\s*hidden/, `${rel} uses overflow-x hidden (use clip)`);
    assert.doesNotMatch(src, /overflowX:\s*'hidden'/, `${rel} uses overflowX hidden (use clip)`);
  }
  for (const rel of HUB_PAGES) {
    const src = stripComments(read(rel));
    assert.doesNotMatch(src, /paddingBottom: 70\b|padding-bottom: 70px/, `${rel} pads its own bottom (BottomNavSpacer owns it)`);
  }
});

test('no font under 12px on the surface', () => {
  const tooSmall = (line) => line.replace(/^[^{]*\{/, '').split(';')
    .filter((d) => /^\s*font(-size)?\s*:/.test(d))
    .some((d) => { const v = d.replace(/^\s*font(-size)?\s*:/, '').replace(/\/\s*[\d.]+/g, ''); return [...v.matchAll(/(?<![\w.])(\d+(?:\.\d+)?)px/g)].some((m) => Number(m[1]) < 12) || [...v.matchAll(/(?<![\w.])(\d*\.\d+)rem/g)].some((m) => Number(m[1]) * 16 < 12); });
  const hits = [];
  for (const rel of SURFACE) {
    stripComments(read(rel)).split('\n').forEach((line, i) => {
      if (tooSmall(line)) hits.push(`${rel}:${i + 1}`);
      const m = line.match(/fontSize:\s*'?(\d+(?:\.\d+)?)(?:px)?'?(?=\s*[,}])/); if (m && Number(m[1]) < 12) hits.push(`${rel}:${i + 1}`);
    });
  }
  assert.deepEqual(hits, [], `text under 12px:\n${hits.join('\n')}`);
});

test('the tutorial is registered for the prefix with eight steps whose targets exist', () => {
  assert.match(read('src/tutorials/index.js'), /prefix: '\/hub\/trivia', tutorial: TRIVIA_TUTORIAL/);
  const tut = read(TUTORIAL);
  assert.equal((tut.match(/^\s{4}\{\s*$/gm) || []).length, 8);
  assert.ok(!tut.includes(EM_DASH));
  const dom = read(LOBBY);
  for (const t of [...tut.matchAll(/target: '([^']+)'/g)].flatMap((m) => m[1].split('|'))) assert.match(dom, new RegExp(`data-tutorial="${t}"`), `no data-tutorial="${t}"`);
});

test('the budget row and the law count phase 7 as converted', () => {
  assert.equal(JSON.parse(read('scripts/ci/mobile-budget.json')).routes['/hub/trivia'].converted, true);
  const converted = JSON.parse(read('__tests__/no-slide-to-see.law.test.mjs').match(/const CONVERTED = (\[[^\]]*\]);/)[1]);
  assert.deepEqual(converted.slice(0, 7), [1, 2, 3, 4, 5, 6, 7]);
});
