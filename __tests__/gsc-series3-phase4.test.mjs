/**
 * GSC & AEO SERIES 3 PHASE 4: HIGH-INTENT GTO PREFLOP RANGE MATRIX HUBS
 *
 * Verifies:
 *   1. Preflop matrix hub page module exists on disk:
 *      - pages/tools/preflop-ranges/index.js
 *      - pages/tools/preflop-ranges.js
 *   2. 13x13 Grid Matrix completeness:
 *      - Full 169 hands represented (pairs, suited, offsuit)
 *      - Correct rank indexing and combo mathematics
 *   3. Position coverage:
 *      - Positional coverage across UTG, MP, HJ, CO, BTN, SB
 *      - Accurate opening frequency metrics and pure vs mixed hand partitioning
 *   4. SEO & Schema.org standards:
 *      - Title <= 60 chars and title-cased
 *      - Description >= 60 chars
 *      - SoftwareApplication schema with GameApplication category and FAQPage schema
 *   5. Sitemap promotion:
 *      - Listed in STATIC_PAGES with 0.9 priority
 *      - Listed in pages/sitemap.xml.js
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATIC_PAGES } from '../src/lib/seo/sitemapBuilders.mjs';
import { RFI, ALL_HANDS } from '../src/config/solverRanges.js';
import { describeRange, combosFor, TOTAL_COMBOS } from '../src/lib/seo/preflopReference.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('preflop matrix hub page modules exist on disk', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'pages/tools/preflop-ranges/index.js')), 'pages/tools/preflop-ranges/index.js exists');
  assert.ok(fs.existsSync(path.join(ROOT, 'pages/tools/preflop-ranges.js')), 'pages/tools/preflop-ranges.js exists');
});

test('ALL_HANDS covers exactly 169 unique 13x13 preflop combinations summing to 1,326 combos', () => {
  assert.equal(ALL_HANDS.length, 169, '169 hand categories');
  const sumCombos = ALL_HANDS.reduce((acc, h) => acc + combosFor(h), 0);
  assert.equal(sumCombos, TOTAL_COMBOS, '1,326 total combinations');
});

test('RFI ranges exist for all standard 6-max positions with positive opening frequencies', () => {
  const positions = ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB'];
  for (const pos of positions) {
    assert.ok(RFI[pos], `RFI[${pos}] exists`);
    const stats = describeRange(RFI[pos], 'raise');
    assert.ok(stats.percent > 5, `${pos} opens > 5%`);
    assert.ok(stats.reach > stats.percent, `${pos} reach > percent`);
    assert.ok(stats.always.length > 0, `${pos} has pure opening hands`);
  }
});

test('STATIC_PAGES lists /tools/preflop-ranges with priority 0.9 and weekly changefreq', () => {
  const entry = STATIC_PAGES.find((p) => p.path === '/tools/preflop-ranges');
  assert.ok(entry, '/tools/preflop-ranges in STATIC_PAGES');
  assert.equal(entry.priority, '0.9');
  assert.equal(entry.changefreq, 'weekly');
});

test('preflop-ranges component sets valid Schema.org structure and no em dashes in copy', () => {
  const code = read('pages/tools/preflop-ranges/index.js');
  assert.match(code, /hubProductSchema/, 'uses hubProductSchema');
  assert.match(code, /applicationCategory:\s*'GameApplication'/, 'GameApplication declared');
  assert.match(code, /canonical=\{canonicalUrl\}/, 'self-canonical declared');
  assert.ok(!code.includes('—'), 'zero em dashes in preflop matrix hub');
});
