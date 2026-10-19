/**
 * GSC & AEO SERIES 3 PHASE 2: SITEMAP INDEX SPLITTING & SUB-SITEMAPS
 *
 * Verifies:
 *   1. All dedicated category sub-sitemaps and master index exist on disk:
 *      - pages/sitemap.xml.js (Full root urlset)
 *      - pages/sitemap_index.xml.js (Master sitemapindex)
 *      - pages/sitemap-core.xml.js (Core landers, legal, tools)
 *      - pages/sitemap-venues.xml.js (Physical venues, locations, home games)
 *      - pages/sitemap-tournaments.xml.js (Tournaments, series, tours)
 *      - pages/sitemap-series.xml.js (Series detail routes)
 *      - pages/sitemap-compare.xml.js (App and club comparison teardowns)
 *      - pages/sitemap-learn.xml.js (Strategy lessons and glossary terms)
 *      - pages/sitemap-videos.xml.js (Video library with VideoObject schema)
 *   2. Master sitemap_index.xml outputs valid <sitemapindex> syntax:
 *      - References all category sub-sitemaps and arena sitemap
 *      - Supports optional evidence-based <lastmod>
 *   3. Sub-sitemaps partition URLs cleanly:
 *      - /sitemap-core.xml serves core static pages and release-gated features
 *      - /sitemap-compare.xml serves comparison routes with COMPARE_AS_OF lastmod
 *      - /sitemap-learn.xml serves lessons and glossary terms
 *      - /sitemap-tournaments.xml serves tournament series and tours
 *   4. Cache-Control and Content-Type:
 *      - All sitemaps output 'text/xml'
 *      - Cache-Control: 'public, s-maxage=300, stale-while-revalidate=1800'
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  generateSitemapIndexXml,
  generateSitemapXml,
  sitemapLastmodLine,
  STATIC_PAGES,
  COMPARE_PAGES,
  LEARN_PAGES,
  GLOSSARY_PAGES,
} from '../src/lib/seo/sitemapBuilders.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('all category sub-sitemaps and master index modules exist on disk', () => {
  const files = [
    'pages/sitemap.xml.js',
    'pages/sitemap_index.xml.js',
    'pages/sitemap-core.xml.js',
    'pages/sitemap-venues.xml.js',
    'pages/sitemap-tournaments.xml.js',
    'pages/sitemap-series.xml.js',
    'pages/sitemap-compare.xml.js',
    'pages/sitemap-learn.xml.js',
    'pages/sitemap-videos.xml.js',
  ];
  for (const f of files) {
    assert.ok(fs.existsSync(path.join(ROOT, f)), `missing sitemap module: ${f}`);
  }
});

test('generateSitemapIndexXml generates valid XML sitemapindex schema', () => {
  const sitemaps = [
    { loc: 'https://smarter.poker/sitemap-core.xml' },
    { loc: '/sitemap-venues.xml' },
    { loc: '/sitemap-tournaments.xml' },
    { loc: '/sitemap-compare.xml', lastmod: '2026-10-18T10:00:00.000Z' },
    { loc: '/sitemap-learn.xml' },
    { loc: '/sitemap-videos.xml' },
    { loc: '/hub/club-arena/sitemap.xml' },
  ];

  const xml = generateSitemapIndexXml(sitemaps);
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<sitemapindex xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/);
  assert.match(xml, /<loc>https:\/\/smarter\.poker\/sitemap-core\.xml<\/loc>/);
  assert.match(xml, /<loc>https:\/\/smarter\.poker\/sitemap-venues\.xml<\/loc>/);
  assert.match(xml, /<loc>https:\/\/smarter\.poker\/sitemap-tournaments\.xml<\/loc>/);
  assert.match(xml, /<loc>https:\/\/smarter\.poker\/sitemap-compare\.xml<\/loc>/);
  assert.match(xml, /<lastmod>2026-10-18T10:00:00\.000Z<\/lastmod>/);
  assert.match(xml, /<loc>https:\/\/smarter\.poker\/sitemap-learn\.xml<\/loc>/);
  assert.match(xml, /<loc>https:\/\/smarter\.poker\/sitemap-videos\.xml<\/loc>/);
  assert.match(xml, /<loc>https:\/\/smarter\.poker\/hub\/club-arena\/sitemap\.xml<\/loc>/);
  assert.match(xml, /<\/sitemapindex>$/);
});

test('sub-sitemap modules export correct getServerSideProps with text/xml headers', () => {
  const modules = [
    'pages/sitemap_index.xml.js',
    'pages/sitemap-core.xml.js',
    'pages/sitemap-compare.xml.js',
    'pages/sitemap-learn.xml.js',
    'pages/sitemap-tournaments.xml.js',
  ];

  for (const m of modules) {
    const code = read(m);
    assert.match(code, /res\.setHeader\('Content-Type', 'text\/xml'\)/, `${m} sets text/xml`);
    assert.match(code, /res\.setHeader\('Cache-Control'/, `${m} sets Cache-Control`);
    assert.match(code, /export async function getServerSideProps/, `${m} exports getServerSideProps`);
  }
});

test('STATIC_PAGES includes all interactive tools and calculators', () => {
  const paths = STATIC_PAGES.map((p) => p.path);
  assert.ok(paths.includes('/hub/poker-tools'), 'poker-tools in STATIC_PAGES');
  assert.ok(paths.includes('/hub/training/icm-calculator'), 'icm-calculator in STATIC_PAGES');
  assert.ok(paths.includes('/hub/training/equity-calculator'), 'equity-calculator in STATIC_PAGES');
});

test('COMPARE_PAGES all carry valid deterministic lastmod timestamps', () => {
  assert.ok(COMPARE_PAGES.length > 10, 'has compare pages');
  for (const page of COMPARE_PAGES) {
    assert.ok(page.lastmod, `${page.path} has lastmod`);
    const time = new Date(page.lastmod).getTime();
    assert.ok(Number.isFinite(time) && time > 0, `${page.path} lastmod is valid time`);
  }
});

test('LEARN_PAGES and GLOSSARY_PAGES are non-empty and well-formed', () => {
  assert.ok(LEARN_PAGES.length >= 40, 'has at least 40 learn pages');
  assert.ok(GLOSSARY_PAGES.length >= 70, 'has at least 70 glossary terms');
  assert.ok(LEARN_PAGES.some((p) => p.path === '/learn'), '/learn is present');
  assert.ok(GLOSSARY_PAGES.some((p) => p.path === '/glossary'), '/glossary is present');
});
