/**
 * Phase 7 SEO, Edge CDN Caching, Traffic Recovery, HTML Sitemap & Schema Law Test (2026-11-26)
 *
 * Permanently hardens:
 * 1. Vercel Edge CDN Cache-Control (s-maxage + stale-while-revalidate + Vary: Accept)
 *    across all public Markdown-negotiated SEO getServerSideProps routes.
 * 2. Traffic recovery for removed high-impression GSC watch URLs (gy5wNpDc_f4 ->
 *    /learn/best-poker-players, gW_J_uIbE20 -> /hub/video-library) and the evergreen
 *    /learn/best-poker-players authority hub.
 * 3. Remaining schema, Markdown, and CWV completeness: EventSeries image,
 *    SportsOrganization description + image, /poker-rooms alternate markdown link,
 *    DeepRouteSignalDeck explicit width/height, and home-games/in/[state] CollectionPage.
 * 4. Fast categorized HTML /sitemap directory linked from global footers and
 *    state-to-venue direct internal links on /poker-rooms/states/[state], plus
 *    PLO4/PLO5/PLO6 calculator-to-study cross-links.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { setPublicSeoHtmlCache } from '../src/lib/seo/edgeCacheHeaders.mjs';
import { tourSchema } from '../src/lib/seo/tourPageSeo.js';
import { seriesSchema } from '../src/lib/poker-near-me/seriesSeo.mjs';
import { LEARN_PAGES, STATIC_PAGES } from '../src/lib/seo/sitemapBuilders.mjs';
import { POKER_VARIANTS, gameVariantPath } from '../src/content/games/variants.js';
import { POKER_RULES, rulePath } from '../src/content/rules/rules.js';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('1. setPublicSeoHtmlCache sets public s-maxage + Vary: Accept and is wired across key public SEO SSR routes', () => {
  const headers = {};
  const mockRes = {
    getHeader: (k) => headers[String(k).toLowerCase()],
    setHeader: (k, v) => {
      headers[String(k).toLowerCase()] = v;
    },
  };
  setPublicSeoHtmlCache(mockRes);
  assert.match(headers['cache-control'], /^public,\s*max-age=0,\s*s-maxage=3600,\s*stale-while-revalidate=86400$/);
  assert.equal(headers.vary, 'Accept');

  // Calling again when Vary already has Accept-Encoding appends Accept without duplicating
  headers.vary = 'Accept-Encoding';
  setPublicSeoHtmlCache(mockRes);
  assert.equal(headers.vary, 'Accept-Encoding, Accept');

  for (const rel of [
    'pages/poker-rooms/index.js',
    'pages/compare/index.js',
    'pages/tools/index.js',
    'pages/tools/bankroll-calculator.js',
    'pages/tools/pot-odds-calculator.js',
    'pages/tools/poker-odds-calculator.js',
    'pages/research/index.js',
    'pages/research/[slug].js',
    'pages/about.js',
    'pages/facts.js',
    'pages/freerolls.js',
    'pages/learn/best-poker-players.js',
  ]) {
    assert.match(read(rel), /setPublicSeoHtmlCache\(/, `${rel} must call setPublicSeoHtmlCache on HTML responses`);
  }
});

test('2. Dead high-impression GSC watch URLs redirect permanently and /learn/best-poker-players ships full authority schema', () => {
  const nextCfg = read('next.config.js');
  assert.match(nextCfg, /source:\s*'\/hub\/video-library\/watch\/gy5wNpDc_f4\/who-is-the-best-poker-player-of-all-time'[\s\S]{0,120}destination:\s*'\/learn\/best-poker-players'/);
  assert.match(nextCfg, /source:\s*'\/hub\/video-library\/watch\/gW_J_uIbE20\/corey-eyring-getting-steamrolled'[\s\S]{0,120}destination:\s*'\/hub\/video-library'/);

  const playersSrc = read('pages/learn/best-poker-players.js');
  assert.match(playersSrc, /'@type':\s*'Article'/);
  assert.match(playersSrc, /'@type':\s*'ItemList'/);
  assert.match(playersSrc, /'@type':\s*'FAQPage'/);
  assert.match(playersSrc, /<FaqSection/);
  assert.match(playersSrc, /SpeakableSpecification/);
  assert.ok(LEARN_PAGES.some((p) => p.path === '/learn/best-poker-players'), 'sitemap-learn must include /learn/best-poker-players');
});

test('3. EventSeries image, SportsOrganization description+image, /poker-rooms.md link, DeepRouteSignalDeck dims, and Home Games CollectionPage', () => {
  const tourNodes = tourSchema({ code: 'WSOP', name: 'World Series Of Poker', type: 'major', website: 'https://www.wsop.com', stops: [] });
  const org = tourNodes.find((n) => n['@type'] === 'SportsOrganization');
  assert.ok(org?.description, 'SportsOrganization must include description');
  assert.ok(org?.image && org.image.startsWith('https://'), 'SportsOrganization must include absolute image');

  const seriesNodes = seriesSchema({
    id: 5000953,
    name: 'WSOP Circuit Talking Stick',
    venue: 'Talking Stick Resort',
    city: 'Scottsdale',
    state: 'AZ',
    startDate: '2026-11-05',
    endDate: '2026-11-16',
    events: [],
  });
  const evSeries = seriesNodes.find((n) => n['@type'] === 'EventSeries');
  assert.ok(evSeries?.image && evSeries.image.startsWith('https://'), 'EventSeries must include absolute image');

  assert.match(read('src/components/seo/SEOHead.js'), /pathname === '\/poker-rooms'/);
  assert.match(read('src/components/poker-near-me/DeepRouteSignalDeck.jsx'), /width="1200"[\s\S]{0,60}height="514"/);
  assert.match(read('pages/hub/home-games/in/[state]/index.js'), /'@type':\s*'CollectionPage'[\s\S]{0,400}SpeakableSpecification/);
});

test('4. HTML /sitemap directory is linked from footers, registered in sitemap-core, state pages link top live venues, and PLO tools link PLO study', () => {
  const sitemapPageSrc = read('pages/sitemap.js');
  assert.match(sitemapPageSrc, /US_POKER_STATES/);
  assert.match(sitemapPageSrc, /POKER_MARKET_GUIDES/);
  assert.match(sitemapPageSrc, /RESEARCH_REPORTS/);
  assert.match(sitemapPageSrc, /gameVariantPath/);
  assert.doesNotMatch(sitemapPageSrc, /\bvariantPath\b/);
  assert.match(sitemapPageSrc, /'@type':\s*'CollectionPage'/);
  assert.ok(POKER_VARIANTS.length > 0 && gameVariantPath(POKER_VARIANTS[0].slug).startsWith('/games/'));
  assert.ok(POKER_RULES.length > 0 && rulePath(POKER_RULES[0].slug).startsWith('/rules/'));
  assert.ok(STATIC_PAGES.some((p) => p.path === '/sitemap'), 'sitemap-core must include /sitemap');

  assert.match(read('src/components/landing/LandingProductSummary.js'), /href="\/sitemap"/);
  assert.match(read('src/components/features/FeatureLanderLayout.js'), /href="\/sitemap"/);

  const statePageSrc = read('pages/poker-rooms/states/[state].js');
  assert.match(statePageSrc, /topStateVenues/);
  assert.match(statePageSrc, /href=\{`\/hub\/venues\/\$\{venue\.id\}`\}/);

  assert.match(read('pages/tools/plo-bet-calculator.js'), /href="\/research\/pot-limit-omaha-plo4-plo5-plo6-equity-and-variance-study"/);
  assert.match(read('pages/tools/plo-outs-calculator.js'), /href="\/research\/pot-limit-omaha-plo4-plo5-plo6-equity-and-variance-study"/);
});
