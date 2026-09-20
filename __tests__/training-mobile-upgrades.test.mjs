/**
 * TRAINING GAMES: MOBILE PHASE 5 UPGRADES STAY APPLIED.
 *
 * Phase 5 (2026-09-13) rebuilt the Training surface on the phase 0 foundation
 * and the always-displayed standard. Every pin below is a defect that shipped
 * on this surface, so a later edit cannot quietly put it back:
 *
 *  - [data-pills-row], opted into by six trainers, was a hidden-scrollbar snap
 *    strip below 600 (four of eight positions off the right edge);
 *  - .sp-cat-chips on the hub was the same rail;
 *  - GameLane, StudyStreakMap and the action history each hid a scrollbar;
 *  - five display:none culls, including the coach back button's label;
 *  - /hub/training rendered 866 text nodes under 12px;
 *  - 104 uses of 100vh and 60 bare overflow-x: hidden;
 *  - fifteen distinct breakpoints.
 *
 * Changelog: docs/changelog/2026-09-13-mobile-phase5-training-games.md
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const EM_DASH = String.fromCharCode(0x2014);

const HUB = 'pages/hub/training.js';
const CSS = 'src/styles/worlds/training.css';
const TUTORIAL = 'src/tutorials/training.js';

function walk(dir) {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full).flatMap((entry) => {
    const rel = path.join(dir, entry);
    return fs.statSync(path.join(ROOT, rel)).isDirectory() ? walk(rel) : [rel];
  });
}
const SURFACE = [HUB, CSS, ...walk('pages/hub/training'), ...walk('src/components/training')]
  .filter((f) => /\.(js|jsx|ts|tsx|css)$/.test(f));

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('the hub is built on the phase 0a foundation', () => {
  const src = read(HUB);
  assert.match(src, /import HubPageShell from '\.\.\/\.\.\/src\/components\/ui\/HubPageShell'/);
  assert.match(src, /<HubPageShell className="training"/);
  assert.match(src, /<PullToRefresh onRefresh=\{refreshDashboard\}/);
  assert.match(src, /useLoadFailsafe\(dataLoading, setDataLoading\)/);
  assert.match(src, /useModalHistory\(Boolean\(setupGame\), handleSetupClose\)/);
  assert.match(src, /const haptic = useHaptics\(\)/);
  assert.match(src, /const startDrill = useCallback\(\(game\) => \{\s*if \(!game\) return;\s*if \(!requireOnline\(\)\) return;/,
    'starting a drill checks requireOnline first');
});

test('the render reads the capped loading pair, not the raw hook flags', () => {
  const src = stripComments(read(HUB));
  const body = src.slice(src.indexOf('return (\n    <PageTransition>'), src.indexOf('\nfunction renderHeroHeadline'));
  assert.doesNotMatch(body, /loading=\{statsLoading/);
  assert.doesNotMatch(body, /loading=\{progressLoading/);
  assert.match(src, /const statsBusy = statsLoading && dataLoading;/);
});

test('[data-pills-row] wraps for all six trainers, and no rail is left on the surface', () => {
  const css = stripComments(read(CSS));
  assert.match(css, /body\.world-training \[data-pills-row\] \{\s*display: grid !important;\s*grid-template-columns: repeat\(auto-fit, minmax\(84px, 1fr\)\) !important;/);
  const banned = [/scrollbar-width\s*:\s*none/i, /scrollbarWidth\s*:\s*['"]none['"]/, /scroll-snap-type\s*:/i, /scrollSnapType\s*:/, /::-webkit-scrollbar\s*\{\s*display\s*:\s*none/i];
  for (const rel of SURFACE) {
    const src = stripComments(read(rel));
    for (const re of banned) assert.doesNotMatch(src, re, `${rel} reintroduced a hidden rail (${re})`);
  }
  assert.match(read(HUB), /\.sp-cat-chips \{ display: flex; flex-wrap: wrap;/);
});

test('nothing on the surface is culled with display none outside print', () => {
  const css = stripComments(read(CSS)).replace(/@media print \{[\s\S]*?\n\}/g, '');
  const hits = css.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /display:\s*none/i.test(l));
  assert.deepEqual(hits, [], `training.css culls content:\n${hits.map(([n, l]) => `${n}: ${l.trim()}`).join('\n')}`);
  assert.match(css, /button\.sp-coach-back > span \{\s*font-size: 12px;/, 'the back button keeps its label');
});

test('100dvh, clip, and the three sanctioned breakpoints', () => {
  const allowed = new Set(['900', '768', '600']);
  for (const rel of SURFACE) {
    const src = stripComments(read(rel));
    for (const m of src.matchAll(/@media[^{]*\(max-width:\s*(\d+)px\)/g)) {
      assert.ok(allowed.has(m[1]), `${rel} uses a ${m[1]}px breakpoint`);
    }
    assert.doesNotMatch(src, /overflowX:\s*'hidden'/, `${rel} uses overflow-x hidden (use clip)`);
  }
});

test('no font under 12px on the surface, outside the sanctioned range grids', () => {
  const tooSmall = (line) => line.replace(/^[^{]*\{/, '').split(';')
    .filter((d) => /^\s*font(-size)?\s*:/.test(d))
    .some((d) => {
      const v = d.replace(/^\s*font(-size)?\s*:/, '').replace(/\/\s*[\d.]+/g, '');
      return [...v.matchAll(/(?<![\w.])(\d+(?:\.\d+)?)px/g)].some((m) => Number(m[1]) < 12);
    });
  const hits = [];
  for (const rel of SURFACE) {
    const src = stripComments(read(rel));
    src.split('\n').forEach((line, i) => {
      if (tooSmall(line)) hits.push(`${rel}:${i + 1}`);
      const m = line.match(/fontSize:\s*(\d+(?:\.\d+)?)(?![\d.])/);
      if (m && Number(m[1]) < 12 && !/allow-small|data-allow/.test(line)) hits.push(`${rel}:${i + 1}`);
    });
  }
  // Files that carry a data-allow-small range grid may keep cell sizes small.
  const exempt = new Set(SURFACE.filter((f) => /data-allow-small/.test(read(f))));
  const real = hits.filter((h) => !exempt.has(h.split(':')[0]));
  assert.deepEqual(real, [], `text under 12px:\n${real.join('\n')}`);
});

test('the tutorial is registered for the prefix with eight steps whose targets exist', () => {
  const registry = read('src/tutorials/index.js');
  assert.match(registry, /prefix: '\/hub\/training', tutorial: TRAINING_TUTORIAL/);
  const tut = read(TUTORIAL);
  assert.equal((tut.match(/^\s{4}\{\s*$/gm) || []).length, 8);
  assert.ok(!tut.includes(EM_DASH));
  const dom = read(HUB);
  for (const t of [...tut.matchAll(/target: '([^']+)'/g)].flatMap((m) => m[1].split('|'))) {
    assert.match(dom, new RegExp(`data-tutorial="${t}"`), `no data-tutorial="${t}" on the hub`);
  }
});

test('the budget row and the law count phase 5 as converted', () => {
  assert.equal(JSON.parse(read('scripts/ci/mobile-budget.json')).routes['/hub/training'].converted, true);
  assert.match(read('__tests__/no-slide-to-see.law.test.mjs'), /const CONVERTED = \[1, 2, 3, 4, 5\];/);
});
