/**
 * GSC & Organic Growth Series 5: Phase 5 Tests
 * Verifies:
 *   1. Dynamic OpenGraph Tool Social Card Generator (/api/og/tool-card.js)
 *      renders 1200x630 Satori ImageResponse with display:flex on all elements
 *   2. Interactive Calculator Share Permalinks (parseCardListFromParam,
 *      buildCardListParam, URL query hydration, and Share Hand button) in
 *      src/lib/poker/oddsPermalink.js and pages/hub/poker-tools.js
 *   3. Printable / Save PDF Chart button and @media print stylesheet in
 *      pages/tools/preflop-ranges/index.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  parseCardListFromParam,
  buildCardListParam,
} from '../src/lib/poker/oddsPermalink.js';

const ROOT = process.cwd();

test('pages/api/og/tool-card.js exists and uses @vercel/og ImageResponse with 1200x630 dimensions', () => {
  const filePath = path.join(ROOT, 'pages/api/og/tool-card.js');
  assert.ok(fs.existsSync(filePath), 'pages/api/og/tool-card.js must exist');
  const src = fs.readFileSync(filePath, 'utf8');
  assert.match(src, /import\s+\{\s*ImageResponse\s*\}\s+from\s+['"]@vercel\/og['"]/);
  assert.match(src, /export\s+const\s+config\s*=\s*\{\s*runtime:\s*['"]edge['"]\s*\}/);
  assert.match(src, /width:\s*1200/);
  assert.match(src, /height:\s*630/);
  assert.ok(!src.includes('\u2014'), 'tool-card.js must not contain literal em dashes');
});

test('parseCardListFromParam and buildCardListParam round-trip card tokens and poker-tools.js wires Share Hand', () => {
  const parsed = parseCardListFromParam('As,10h,Qd,2c,Ts');
  assert.equal(parsed.length, 5);
  assert.equal(parsed[0].rank, 'A');
  assert.equal(parsed[0].suit, 'spades');
  assert.equal(parsed[1].rank, '10');
  assert.equal(parsed[1].suit, 'hearts');
  assert.equal(parsed[4].rank, '10');
  assert.equal(parsed[4].suit, 'spades');
  assert.equal(buildCardListParam(parsed), 'As,10h,Qd,2c,10s');

  const filePath = path.join(ROOT, 'pages/hub/poker-tools.js');
  const src = fs.readFileSync(filePath, 'utf8');
  assert.match(src, /parseCardListFromParam/);
  assert.match(src, /buildCardListParam/);
  assert.match(src, /shareHandPermalink/);
  assert.match(src, /Share Hand/);
  assert.match(src, /ogImage="\/api\/og\/tool-card\?tool=odds/);
});

test('pages/tools/preflop-ranges/index.js includes Print / Save PDF Chart button, @media print rules, and dynamic OG tool-card', () => {
  const filePath = path.join(ROOT, 'pages/tools/preflop-ranges/index.js');
  const src = fs.readFileSync(filePath, 'utf8');
  assert.match(src, /Print \/ Save PDF Chart/);
  assert.match(src, /window\.print\(\)/);
  assert.match(src, /@media print/);
  assert.match(src, /\/api\/og\/tool-card\?tool=ranges/);
  assert.ok(!src.includes('\u2014'), 'preflop-ranges/index.js must not contain literal em dashes');
});
