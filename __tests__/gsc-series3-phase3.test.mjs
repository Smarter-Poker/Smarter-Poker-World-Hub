/**
 * GSC & AEO SERIES 3 PHASE 3: CLEAN ROOT TOOL URLS & DEDICATED TOOL LANDERS
 *
 * Verifies:
 *   1. Dedicated root tool landers exist on disk:
 *      - pages/tools/poker-odds-calculator.js
 *      - pages/tools/icm-calculator.js
 *   2. Next.js rewrite configuration aliases /tools/* to underlying tool pages:
 *      - /tools/poker-odds-calculator -> /hub/poker-tools
 *      - /tools/icm-calculator -> /hub/training/icm-calculator
 *   3. Dynamic canonical resolution:
 *      - /tools/poker-odds-calculator serves self-canonical and SoftwareApplication schema
 *      - /tools/icm-calculator serves self-canonical and SoftwareApplication schema
 *   4. Sitemaps offer clean root tool URLs:
 *      - /tools/poker-odds-calculator in STATIC_PAGES with high priority (0.9)
 *      - /tools/icm-calculator in STATIC_PAGES with high priority (0.9)
 *      - Preserved in both pages/sitemap.xml.js and src/lib/seo/sitemapBuilders.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATIC_PAGES } from '../src/lib/seo/sitemapBuilders.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('dedicated tool lander page modules exist on disk', () => {
  const files = [
    'pages/tools/poker-odds-calculator.js',
    'pages/tools/icm-calculator.js',
  ];
  for (const f of files) {
    assert.ok(fs.existsSync(path.join(ROOT, f)), `missing tool lander module: ${f}`);
  }
});

test('next.config.js declares clean tool URL rewrites', () => {
  const config = read('next.config.js');
  assert.match(
    config,
    /source:\s*'\/tools\/poker-odds-calculator'[\s\S]*?destination:\s*'\/hub\/poker-tools'/,
    'poker-odds-calculator rewrite configured',
  );
  assert.match(
    config,
    /source:\s*'\/tools\/icm-calculator'[\s\S]*?destination:\s*'\/hub\/training\/icm-calculator'/,
    'icm-calculator rewrite configured',
  );
});

test('both tool pages support dynamic effectiveCanonical for clean tool landers', () => {
  const pokerToolsCode = read('pages/hub/poker-tools.js');
  const icmCalcCode = read('pages/hub/training/icm-calculator.js');

  assert.match(
    pokerToolsCode,
    /router\.pathname === '\/tools\/poker-odds-calculator'/,
    'poker-tools checks pathname for clean tool lander',
  );
  assert.match(
    pokerToolsCode,
    /canonical=\{effectiveCanonical\}/,
    'poker-tools passes effectiveCanonical to SEOHead',
  );

  assert.match(
    icmCalcCode,
    /router\.pathname === '\/tools\/icm-calculator'/,
    'icm-calculator checks pathname for clean tool lander',
  );
  assert.match(
    icmCalcCode,
    /canonical=\{effectiveCanonical\}/,
    'icm-calculator passes effectiveCanonical to SEOHead',
  );
});

test('STATIC_PAGES lists clean root tool URLs with priority 0.9', () => {
  const oddsUrl = STATIC_PAGES.find((p) => p.path === '/tools/poker-odds-calculator');
  const icmUrl = STATIC_PAGES.find((p) => p.path === '/tools/icm-calculator');

  assert.ok(oddsUrl, '/tools/poker-odds-calculator listed in STATIC_PAGES');
  assert.equal(oddsUrl.priority, '0.9');
  assert.equal(oddsUrl.changefreq, 'weekly');

  assert.ok(icmUrl, '/tools/icm-calculator listed in STATIC_PAGES');
  assert.equal(icmUrl.priority, '0.9');
  assert.equal(icmUrl.changefreq, 'weekly');
});

test('pages/sitemap.xml.js includes clean root tool URLs', () => {
  const sitemapCode = read('pages/sitemap.xml.js');
  assert.match(sitemapCode, /path:\s*'\/tools\/poker-odds-calculator'/);
  assert.match(sitemapCode, /path:\s*'\/tools\/icm-calculator'/);
});
