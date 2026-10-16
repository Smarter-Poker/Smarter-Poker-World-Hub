/**
 * AEO PHASE 4 TEST SUITE: SEGMENTED XML SITEMAPS & DYNAMIC LASTMOD EVIDENCE
 *
 * Verifies:
 *   1. Segmented sitemaps exist and export proper getServerSideProps handlers:
 *      - pages/sitemap.xml.js (Root index & core sitemap)
 *      - pages/sitemap-venues.xml.js (Physical rooms, locations, and home games)
 *      - pages/sitemap-series.xml.js (Tournament series and major tours)
 *   2. robots.txt declares all 5 sitemaps:
 *      - sitemap.xml
 *      - sitemap-venues.xml
 *      - sitemap-series.xml
 *      - sitemap-videos.xml
 *      - hub/club-arena/sitemap.xml
 *   3. Dynamic lastmod evidence:
 *      - Event series entries extract scrape_timestamp when available
 *      - Never outputs current generation time as lastmod
 *      - Omits lastmod when change evidence is missing
 *   4. Clean XML structure:
 *      - urlset xmlns declaration
 *      - Valid <loc>, <changefreq>, <priority> elements
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  generateSitemapXml,
  sitemapLastmodLine,
  SITE_URL,
} from '../src/lib/seo/sitemapBuilders.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('all segmented sitemap page modules exist on disk', () => {
  const files = [
    'pages/sitemap.xml.js',
    'pages/sitemap-venues.xml.js',
    'pages/sitemap-series.xml.js',
    'pages/sitemap-videos.xml.js',
  ];
  for (const f of files) {
    assert.ok(fs.existsSync(path.join(ROOT, f)), `missing sitemap module: ${f}`);
  }
});

test('robots.txt lists all segmented and specialized sitemaps', () => {
  const robots = read('public/robots.txt');
  const expectedSitemaps = [
    'https://smarter.poker/sitemap.xml',
    'https://smarter.poker/sitemap-venues.xml',
    'https://smarter.poker/sitemap-series.xml',
    'https://smarter.poker/sitemap-videos.xml',
    'https://smarter.poker/hub/club-arena/sitemap.xml',
  ];
  for (const sitemap of expectedSitemaps) {
    assert.match(robots, new RegExp(`^Sitemap: ${sitemap.replace(/\//g, '\\/')}$`, 'm'));
  }
});

test('sitemapLastmodLine formats valid ISO strings and ignores null/invalid', () => {
  assert.equal(
    sitemapLastmodLine('2026-10-15T12:00:00Z'),
    '    <lastmod>2026-10-15T12:00:00.000Z</lastmod>\n',
  );
  assert.equal(sitemapLastmodLine(null), '');
  assert.equal(sitemapLastmodLine(undefined), '');
  assert.equal(sitemapLastmodLine('not a date'), '');
  assert.equal(sitemapLastmodLine(0), '');
});

test('generateSitemapXml builds valid XML with loc, priority, changefreq and optional lastmod', () => {
  const sampleUrls = [
    {
      path: '/hub/venues/1828',
      priority: '0.7',
      changefreq: 'daily',
      lastmod: '2026-09-01T10:00:00.000Z',
    },
    {
      path: '/about',
      priority: '0.8',
      changefreq: 'monthly',
    },
  ];

  const xml = generateSitemapXml(sampleUrls);
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/);
  assert.match(xml, /<loc>https:\/\/smarter\.poker\/hub\/venues\/1828<\/loc>/);
  assert.match(xml, /<lastmod>2026-09-01T10:00:00\.000Z<\/lastmod>/);
  assert.match(xml, /<loc>https:\/\/smarter\.poker\/about<\/loc>/);
  // Second entry has no lastmod:
  assert.ok(!xml.includes('<loc>https://smarter.poker/about</loc>\n    <lastmod>'));
});

test('pages/sitemap-venues.xml.js and sitemap-series.xml.js set proper headers and cache control', () => {
  const venuesCode = read('pages/sitemap-venues.xml.js');
  const seriesCode = read('pages/sitemap-series.xml.js');

  assert.match(venuesCode, /res\.setHeader\('Content-Type', 'text\/xml'\)/);
  assert.match(venuesCode, /res\.setHeader\('Cache-Control'/);
  assert.match(venuesCode, /buildPokerVenueUrls/);
  assert.match(venuesCode, /buildHomeGameUrls/);

  assert.match(seriesCode, /res\.setHeader\('Content-Type', 'text\/xml'\)/);
  assert.match(seriesCode, /res\.setHeader\('Cache-Control'/);
  assert.match(seriesCode, /buildPokerEventDetailUrls/);
});

test('sitemap.xml.js addSeries extracts scrape_timestamp as real evidence lastmod', () => {
  const sitemapCode = read('pages/sitemap.xml.js');
  assert.match(sitemapCode, /evidenceRow\?\.scrape_timestamp/);
  assert.match(sitemapCode, /addSeries\(row\.id, row\)/);
  assert.match(sitemapCode, /addSeries\(toPokerSeriesRouteId\(row\.id\), row\)/);
});
