import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

test('pages/404.js renders SEOHead with noindex={true} to prevent Soft-404 indexing', () => {
  const src = fs.readFileSync(path.join(ROOT, 'pages/404.js'), 'utf8');
  assert.match(src, /import SEOHead from '\.\.\/src\/components\/seo\/SEOHead'/);
  assert.match(src, /<SEOHead[\s\S]*?noindex=\{true\}/);
});

test('pages/404.js provides an interactive search form routing to /hub/poker-near-me/lobby', () => {
  const src = fs.readFileSync(path.join(ROOT, 'pages/404.js'), 'utf8');
  assert.match(src, /role="search"/);
  assert.match(src, /type="search"/);
  assert.match(src, /\/hub\/poker-near-me\/lobby\?q=/);
});

test('pages/404.js includes all 4 high-converting 1-click recovery links', () => {
  const src = fs.readFileSync(path.join(ROOT, 'pages/404.js'), 'utf8');
  const expectedRoutes = [
    { title: 'Poker Odds Calculator', href: '/tools/poker-odds-calculator' },
    { title: 'Preflop Range Matrix', href: '/tools/preflop-ranges' },
    { title: 'Live Poker Rooms Directory', href: '/hub/poker-near-me/lobby' },
    { title: 'Club Arena Free Games', href: '/hub/club-arena' },
  ];
  for (const route of expectedRoutes) {
    assert.ok(src.includes(route.title), `404.js must include "${route.title}"`);
    assert.ok(src.includes(route.href), `404.js must link to "${route.href}"`);
  }
});
