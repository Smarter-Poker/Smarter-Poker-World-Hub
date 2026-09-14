/**
 * VIDEO LIBRARY: MOBILE PHASE 9 UPGRADES STAY APPLIED.
 *
 * Phase 9 (2026-09-14) rebuilt /hub/video-library on the phase 0 foundation
 * and the always-displayed standard. Every pin below is a defect that shipped
 * on this surface, so a later edit cannot quietly put it back:
 *
 *  - four sideways rails at 375: the command controls (1,219px of buttons in
 *    357px, hidden scrollbar, mandatory snap, an edge fade mask, the four
 *    group labels culled), the creator row (1,842px in 357px), the active
 *    filter list, and New This Week (14,878px of cards in 333px); Continue
 *    Watching and the viewer's Up Next were rails of the same shape;
 *  - keepRailButtonInView scrolled the chosen control into the strip;
 *  - four culls on a phone: the rail kicker, the group labels, the command
 *    heading and the source logo on every non-featured card; Up Next was
 *    culled from the viewer entirely;
 *  - 182 rendered text nodes under 12px (7px, 8px, 9px, 10px and 11px);
 *  - min-height: 100vh, overflowX: 'hidden', a page-owned bottom pad of
 *    70px / 82px + safe area / 78px + safe area, in three places;
 *  - breakpoints at 480, 760, 761, 767, 1024, 1025 and 1180.
 *
 * Changelog: docs/changelog/2026-09-14-mobile-phase9-video-library.md
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const EM_DASH = String.fromCharCode(0x2014);

const PAGE = 'pages/hub/video-library.js';
const CSS = 'src/styles/worlds/video-library.css';
const RAIL = 'src/components/video-library/VideoLibraryCommandRail.jsx';
const TUTORIAL = 'src/tutorials/video-library.js';
const SURFACE = [PAGE, CSS, RAIL];

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('the page is built on the phase 0a foundation', () => {
  const src = read(PAGE);
  assert.match(src, /import HubPageShell from '\.\.\/\.\.\/src\/components\/ui\/HubPageShell'/);
  assert.match(src, /<HubPageShell\s+className="video-library"/);
  assert.match(src, /<PullToRefresh\s+onRefresh=\{refreshLibrary\}/);
  assert.match(src, /useLoadFailsafe\(catalogLoading, setCatalogLoading\)/);
  assert.match(src, /const refreshLibrary = useCallback\(async \(\) => \{\s*if \(!requireOnline\(\)\) return;/, 'refresh checks requireOnline');
  assert.match(src, /useModalHistory\(Boolean\(selectedVideo\), handleCloseVideo\)/, 'Back closes the viewer');
  assert.match(src, /useModalHistory\(showReelsModal, closeReels\)/, 'Back closes Reels');
  assert.match(src, /useModalHistory\(Boolean\(showPlaylistModal\), closePlaylistSheet\)/, 'Back closes the playlist sheet');
  assert.match(src, /<section className="vl-command-main"/, 'the shell owns <main>; the page column is a section');
  assert.doesNotMatch(src, /<main className="vl-command-main">/);
});

test('every control row wraps and every card row is a grid: no rail on the surface', () => {
  const css = stripComments(read(CSS));
  assert.match(css, /@media \(max-width: 768px\) \{[\s\S]*?\.vl-type-toggle-row \{\s*display: grid !important;\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(css, /\.vl-filter-group-label \{\s*grid-column: 1 \/ -1;/, 'group labels are headings inside the grid, not culled');
  assert.match(css, /\.vl-source-pills \{[^}]*display: flex !important;\s*flex-wrap: wrap;/, 'the creator row wraps');
  assert.match(css, /\.vl-active-filter-list \{[^}]*flex-wrap: wrap;/);
  assert.match(css, /\.vl-cw-grid,\s*\.vl-new-week-grid \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\) !important; \}/);
  const page = stripComments(read(PAGE));
  assert.match(page, /className="vl-cw-grid" style=\{\{\s*display: 'grid'/);
  assert.match(page, /className="vl-new-week-grid" data-tutorial="new" style=\{\{ display: 'grid'/);
  assert.match(page, /className="vl-up-next-grid" style=\{\{\s*display: 'grid'/, 'Up Next is a grid in the viewer');
  assert.doesNotMatch(page, /keepRailButtonInView|filterRailRef|sourceRailRef/);
  const banned = [/scrollbar-width\s*:\s*none/i, /scrollbarWidth\s*:\s*'none'/, /scroll-snap-type\s*:/i, /scrollSnapType\s*:/, /::-webkit-scrollbar\s*\{\s*display\s*:\s*none/i, /overflow-x:\s*auto/, /overflowX:\s*'auto'/, /mask-image:\s*linear-gradient/];
  for (const rel of SURFACE) {
    const src = stripComments(read(rel));
    for (const re of banned) assert.doesNotMatch(src, re, `${rel} reintroduced a rail (${re})`);
  }
});

test('four cards then Show More, ten creators then Show All: bounded rows, 44px buttons', () => {
  const page = stripComments(read(PAGE));
  assert.match(page, /const INITIAL_RAIL_CARDS = 4;/);
  assert.match(page, /continueWatchingVideos\.slice\(0, cwVisible\)/);
  assert.match(page, /newThisWeek\.slice\(0, newWeekVisible\)/);
  assert.match(page, /setCwVisible\(continueWatchingVideos\.length\)/);
  assert.match(page, /setNewWeekVisible\(newThisWeek\.length\)/);
  assert.match(page, /className=\{`vl-source-pills\$\{sourcesExpanded \? ' is-expanded' : ''\}`\}/);
  assert.match(page, /\.vl-show-more \{[^}]*min-height: 44px/);
  const css = stripComments(read(CSS));
  assert.match(css, /\.vl-source-pills:not\(\.is-expanded\) > \.vl-source-button:nth-child\(n \+ 11\) \{ display: none !important; \}/);
});

test('nothing is culled on a phone', () => {
  const css = stripComments(read(CSS));
  for (const sel of ['.vl-rail-kicker', '.vl-filter-group-label', '.vl-command-heading', '.vl-source-chip-logo']) {
    const re = new RegExp(`${sel.replace(/[.]/g, '\\$&')}[^{]*\\{[^}]*display:\\s*none`);
    assert.doesNotMatch(css, re, `${sel} is culled`);
  }
  const page = stripComments(read(PAGE));
  assert.doesNotMatch(page, /\.vl-up-next-rail \{[^}]*display: none/, 'Up Next is culled in the viewer');
});

test('100dvh, clip, no page-owned bottom pad, and the three sanctioned breakpoints', () => {
  const allowed = new Set(['900', '768', '600']);
  for (const rel of SURFACE) {
    const src = stripComments(read(rel));
    for (const m of src.matchAll(/@media[^{]*\((?:max|min)-width:\s*(\d+)px\)/g)) assert.ok(allowed.has(m[1]) || m[1] === '769', `${rel} uses a ${m[1]}px breakpoint`);
    assert.doesNotMatch(src, /(?<![\w-])100vh/, `${rel} uses 100vh`);
    assert.doesNotMatch(src, /overflow-x:\s*hidden/, `${rel} uses overflow-x hidden (use clip)`);
    assert.doesNotMatch(src, /overflowX:\s*'hidden'/, `${rel} uses overflowX hidden (use clip)`);
  }
  const page = stripComments(read(PAGE));
  assert.doesNotMatch(page, /paddingBottom: 70\b/, 'the page pads its own bottom (BottomNavSpacer owns it)');
  const css = stripComments(read(CSS));
  assert.doesNotMatch(css, /calc\((?:78|82)px \+ env\(safe-area-inset-bottom/, 'the page pads its own bottom (BottomNavSpacer owns it)');
});

test('no font under 12px on the surface', () => {
  const tooSmall = (line) => line.replace(/^[^{]*\{/, '').split(';')
    .filter((d) => /^\s*font(-size)?\s*:/.test(d))
    .some((d) => { const v = d.replace(/^\s*font(-size)?\s*:/, '').replace(/\/\s*[\d.]+/g, ''); return [...v.matchAll(/(?<![\w.])(\d+(?:\.\d+)?)px/g)].some((m) => Number(m[1]) < 12); });
  const hits = [];
  for (const rel of SURFACE) {
    stripComments(read(rel)).split('\n').forEach((line, i) => {
      if (tooSmall(line)) hits.push(`${rel}:${i + 1}`);
      for (const m of line.matchAll(/fontSize:\s*'?(\d+(?:\.\d+)?)(?:px)?'?(?=\s*[,}])/g)) if (Number(m[1]) < 12) hits.push(`${rel}:${i + 1}`);
    });
  }
  assert.deepEqual(hits, [], `text under 12px:\n${hits.join('\n')}`);
});

test('the tutorial is registered for the prefix with eight steps whose targets exist', () => {
  assert.match(read('src/tutorials/index.js'), /prefix: '\/hub\/video-library', tutorial: VIDEO_LIBRARY_TUTORIAL/);
  const tut = read(TUTORIAL);
  assert.equal((tut.match(/^\s{4}\{\s*$/gm) || []).length, 8);
  assert.ok(!tut.includes(EM_DASH));
  const dom = read(PAGE) + read(RAIL);
  for (const t of [...tut.matchAll(/target: '([^']+)'/g)].flatMap((m) => m[1].split('|'))) assert.match(dom, new RegExp(`data-tutorial="${t}"`), `no data-tutorial="${t}"`);
});

test('the budget row and the law count phase 9 as converted', () => {
  assert.equal(JSON.parse(read('scripts/ci/mobile-budget.json')).routes['/hub/video-library'].converted, true);
  const converted = JSON.parse(read('__tests__/no-slide-to-see.law.test.mjs').match(/const CONVERTED = (\[[^\]]*\]);/)[1]);
  assert.deepEqual(converted.slice(0, 8), [1, 2, 3, 4, 5, 6, 7, 9]);
});
