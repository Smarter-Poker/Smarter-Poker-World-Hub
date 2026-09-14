/**
 * ODDS CALCULATOR: MOBILE PHASE 10 UPGRADES STAY APPLIED.
 *
 * Phase 10 (2026-09-14) rebuilt /hub/poker-tools on the phase 0 foundation
 * and the always-displayed standard. Every pin below is a defect that shipped
 * on this surface, so a later edit cannot quietly put it back:
 *
 *  - the card picker was thirteen fixed columns, so every one of the 52
 *    cards was a 22px-wide target at 375 (54 targets under 44px measured);
 *  - the equity was shown only on the 10px seat badges on the felt, the
 *    smallest text on the page;
 *  - a page-owned header and a page-owned fixed settings sheet duplicated the
 *    shared header and hamburger (so the page had no Page Tutorial row);
 *  - min-height: 100vh, overflowX: 'hidden', paddingBottom: 70 boilerplate;
 *  - 36px Calculate / New Hand, chips at 8px padding, dead-card thumbnails
 *    as 30x42 click targets.
 *
 * Changelog: docs/changelog/2026-09-14-mobile-phase10-odds-calculator.md
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const EM_DASH = String.fromCharCode(0x2014);

const PAGE = 'pages/hub/poker-tools.js';
const TUTORIAL = 'src/tutorials/poker-tools.js';

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('the page is built on the phase 0a foundation with the shared header and hamburger', () => {
  const src = read(PAGE);
  assert.match(src, /import HubPageShell from '\.\.\/\.\.\/src\/components\/ui\/HubPageShell'/);
  assert.match(src, /<HubPageShell\s+className="poker-tools"/);
  assert.match(src, /header=\{<UniversalHeader pageDepth=\{1\} onMenuClick=\{\(\) => setShowMenu\(true\)\} \/>\}/);
  assert.match(src, /getMenuConfig\('odds-calculator', user\)/, 'the hamburger uses the shared Analysis Workspace menu (which carries the Page Tutorial row)');
  assert.match(src, /<HamburgerMenu\s+isOpen=\{showMenu\}/);
  assert.match(src, /const haptic = useHaptics\(\);/);
  assert.match(src, /haptic\('light'\);\s*\n\s*if \(selectedSlot\.type === 'hand'\)/, 'a card tap buzzes');
  assert.match(src, /haptic\('medium'\);\s*\n\s*setCalculating\(true\);/, 'Calculate buzzes');
  const stripped = stripComments(src);
  assert.doesNotMatch(stripped, /(?<![\w-])100vh/);
  assert.doesNotMatch(stripped, /overflowX:\s*'hidden'/);
  assert.doesNotMatch(stripped, /paddingBottom: 70\b/, 'BottomNavSpacer owns the bottom clearance');
  assert.doesNotMatch(stripped, /position: 'fixed', inset: 0, zIndex: 9999/, 'the page-owned settings sheet is gone');
});

test('every card in the picker is a 44px target and the results are stacked cards', () => {
  const src = stripComments(read(PAGE));
  assert.match(src, /gridTemplateColumns: 'repeat\(auto-fill, minmax\(44px, 1fr\)\)', gap: 4/, 'the picker is an auto-fill grid at 44px');
  assert.doesNotMatch(src, /gridTemplateColumns: 'repeat\(13, 1fr\)'/, 'thirteen fixed columns are back');
  assert.match(src, /<section aria-label="Equity results" data-tutorial="results"/);
  assert.match(src, /results\.map\(\(r, pi\) =>/);
  assert.match(src, /Number\(r\.equity \|\| 0\)\.toFixed\(1\)/);
  assert.match(src, /Wins \{Number\(r\.wins \|\| 0\)\.toLocaleString\(\)\} · Ties/);
});

test('no font under 12px and every control is 44px', () => {
  const src = stripComments(read(PAGE));
  const hits = [];
  src.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/fontSize:\s*'?(\d+(?:\.\d+)?)(?:px)?'?(?=\s*[,}])/g)) if (Number(m[1]) < 12) hits.push(`${PAGE}:${i + 1}`);
    if (/fontSize: Math\.max\((\d+),/.test(line) && Number(line.match(/fontSize: Math\.max\((\d+),/)[1]) < 12) hits.push(`${PAGE}:${i + 1} (Math.max floor)`);
  });
  assert.deepEqual(hits, [], `text under 12px:\n${hits.join('\n')}`);
  assert.doesNotMatch(src, /minHeight: 36\b/, 'a 36px control');
  assert.match(src, /flex: 1, minWidth: 70, minHeight: 44, padding: '10px 6px'/, 'game tabs are 44px');
  assert.match(src, /aria-label=\{`Remove dead card \$\{c\.rank\} of \$\{c\.suit\}`\}/, 'dead cards are buttons');
  assert.match(src, /padding: '6px 12px', minHeight: 44, borderRadius: 6/, 'presets are 44px');
});

test('the tutorial is registered for the route with eight steps whose targets exist', () => {
  assert.match(read('src/tutorials/index.js'), /prefix: '\/hub\/poker-tools', tutorial: POKER_TOOLS_TUTORIAL, exact: true/);
  const tut = read(TUTORIAL);
  assert.equal((tut.match(/^\s{4}\{\s*$/gm) || []).length, 8);
  assert.ok(!tut.includes(EM_DASH));
  const dom = read(PAGE);
  for (const t of [...tut.matchAll(/target: '([^']+)'/g)].flatMap((m) => m[1].split('|'))) assert.match(dom, new RegExp(`data-tutorial="${t}"`), `no data-tutorial="${t}"`);
});

test('the budget row and the law count phase 10 as converted', () => {
  assert.equal(JSON.parse(read('scripts/ci/mobile-budget.json')).routes['/hub/poker-tools'].converted, true);
  const converted = JSON.parse(read('__tests__/no-slide-to-see.law.test.mjs').match(/const CONVERTED = (\[[^\]]*\]);/)[1]);
  assert.deepEqual(converted, [1, 2, 3, 4, 5, 6, 7, 9, 10], 'every surviving phase of the rollout is converted');
});
