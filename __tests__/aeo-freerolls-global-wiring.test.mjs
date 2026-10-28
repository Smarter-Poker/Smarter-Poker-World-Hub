import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { STATIC_PAGES, COMPARE_PAGES } from '../src/lib/seo/sitemapBuilders.mjs';
import { buildRssFeedXml } from '../pages/feed.xml.js';
import { CATEGORY_PRODUCTS } from '../src/content/glossary/terms.js';
import { buildIndexNowPayload } from '../src/lib/seo/indexNowPing.mjs';

const ROOT = process.cwd();
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('STATIC_PAGES sitemap includes /freerolls and /hub/freerolls with daily priority', () => {
  const freerollsEntry = STATIC_PAGES.find((p) => p.path === '/freerolls');
  assert.ok(freerollsEntry, 'Must include /freerolls in STATIC_PAGES');
  assert.equal(freerollsEntry.priority, '0.9');
  assert.equal(freerollsEntry.changefreq, 'daily');

  const hubFreerollsEntry = STATIC_PAGES.find((p) => p.path === '/hub/freerolls');
  assert.ok(hubFreerollsEntry, 'Must include /hub/freerolls in STATIC_PAGES');
  assert.equal(hubFreerollsEntry.priority, '0.9');
  assert.equal(hubFreerollsEntry.changefreq, 'daily');

  const compareEntry = COMPARE_PAGES.find((p) => p.path === '/compare');
  assert.ok(compareEntry, 'COMPARE_PAGES must include root /compare');
});

test('RSS 2.0 syndication feed includes daily freerolls and software comparison items', () => {
  const xml = buildRssFeedXml();
  assert.match(xml, /Daily \$2,000 Poker Freerolls &amp; Diamond Freerolls/);
  assert.match(xml, /https:\/\/smarter\.poker\/freerolls/);
  assert.match(xml, /Poker Software &amp; Freeroll Platform Comparisons/);
  assert.match(xml, /https:\/\/smarter\.poker\/compare/);
  assert.match(xml, /Poker Freerolls/);
  assert.match(xml, /Poker Software Comparison/);
});

test('Global hamburger navigation includes Daily $2,000 Freerolls in key menus', () => {
  const menuSource = read('src/config/hamburgerMenus.js');

  assert.match(
    menuSource,
    /createMenuItem\.navigation\(['"]Daily \$2,000 Freerolls['"],\s*['"]\/freerolls['"]\)/
  );
  assert.match(
    menuSource,
    /createMenuItem\.navigation\(['"]Software Comparisons['"],\s*['"]\/compare['"]\)/
  );
});

test('Contextual cross-linking to freerolls exists across tools, calculators, and glossary', () => {
  // Poker tools
  const toolsSrc = read('pages/hub/poker-tools.js');
  assert.match(toolsSrc, /href="\/freerolls"/);
  assert.match(toolsSrc, /Play Daily \$2,000 Guaranteed Poker Freerolls/);

  // ICM calculator
  const icmSrc = read('pages/hub/training/icm-calculator.js');
  assert.match(icmSrc, /router\.push\('\/freerolls'\)/);
  assert.match(icmSrc, /Test Your ICM Skills In Daily \$2,000 Freerolls/);

  // Glossary
  const clubPokerProducts = CATEGORY_PRODUCTS['Club Poker'];
  const freerollProduct = clubPokerProducts.find((p) => p.href === '/freerolls');
  assert.ok(freerollProduct, 'Glossary Club Poker category must link to /freerolls');
  assert.equal(freerollProduct.name, 'Daily Freerolls');
});

test('IndexNow payload builder processes /freerolls and /compare endpoints', () => {
  const payload = buildIndexNowPayload(['/freerolls', '/compare', 'https://smarter.poker/freerolls.md']);
  assert.equal(payload.host, 'smarter.poker');
  assert.ok(payload.urlList.includes('https://smarter.poker/freerolls'));
  assert.ok(payload.urlList.includes('https://smarter.poker/compare'));
  assert.ok(payload.urlList.includes('https://smarter.poker/freerolls.md'));
});
