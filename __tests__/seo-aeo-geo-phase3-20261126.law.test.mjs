/**
 * SEO, AEO & GEO PHASE 3 HARDENING LAWS (2026-11-26)
 *
 * Permanently locks in all Phase 3 technical SEO, AEO, and edge-performance upgrades:
 *   1. /sitemap-news.xml exists, uses Google News <news:news> for <=48h articles,
 *      uses real evidence <lastmod>, and is registered in /sitemap_index.xml
 *      alongside evidence-based authority/learn lastmod timestamps.
 *   2. /404, /500, and /_error never emit canonical="/404" or og:url="/404" in pages/_app.js.
 *   3. ReelsStatusScreen honors titleAs="h2" so /hub/reels emits a single <h1>.
 *   4. /learn/hands/[hand] permanently redirects shorthand aliases (e.g. /learn/hands/aa)
 *      to the canonical slug (/learn/hands/pocket-aces).
 *   5. /hub/video-library/watch/[videoId] emits WebPage + SpeakableSpecification in buildVideoJsonLd.
 *   6. /hub/home-games/[slug] emits BreadcrumbList, SpeakableSpecification, FAQPage JSON-LD,
 *      and matching visible <FaqSection faqs={...} />.
 *   7. /hub/venues/[id] serves 5-minute edge CDN caching (s-maxage=300, stale-while-revalidate=3600).
 *   8. /search serves RFC 8288 GEO Link discovery headers and SpeakableSpecification;
 *      core pages emit SpeakableSpecification and concise <=160-char meta descriptions.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AUTHORITY_EVIDENCE_LASTMOD,
  LEARN_EVIDENCE_LASTMOD,
  buildNewsArticleUrls,
  generateNewsSitemapXml,
  latestEvidenceDate,
} from '../src/lib/seo/sitemapBuilders.mjs';
import { buildVideoJsonLd, buildVideoWatchWebPageJsonLd, normaliseVideoRow } from '../src/lib/videoLibraryWatch.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('1. /sitemap-news.xml generates valid Google News XML for <=48h articles and is registered in sitemap_index.xml', async () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'pages/sitemap-news.xml.js')), 'pages/sitemap-news.xml.js must exist');
  const indexSrc = read('pages/sitemap_index.xml.js');
  assert.ok(indexSrc.includes("'/sitemap-news.xml'"), 'sitemap_index.xml.js must register /sitemap-news.xml');
  assert.ok(AUTHORITY_EVIDENCE_LASTMOD && LEARN_EVIDENCE_LASTMOD, 'evidence-based lastmod constants must resolve');
  assert.equal(latestEvidenceDate(['2026-09-01', '2026-11-15']), '2026-11-15T00:00:00.000Z');

  const nowMs = Date.parse('2026-11-26T18:00:00.000Z');
  const entries = await buildNewsArticleUrls([
    { id: '11111111-1111-4111-8111-111111111111', title: 'Fresh WSOP Update & Recap', published_at: '2026-11-26T12:00:00.000Z' },
    { id: '22222222-2222-4222-8222-222222222222', title: 'Archive Poker Story', published_at: '2026-11-10T12:00:00.000Z' },
  ]);
  assert.equal(entries.length, 2);
  const xml = generateNewsSitemapXml(entries, { nowMs });
  assert.match(xml, /xmlns:news="http:\/\/www\.google\.com\/schemas\/sitemap-news\/0\.9"/);
  assert.match(xml, /<loc>https:\/\/smarter\.poker\/hub\/article\?id=11111111-1111-4111-8111-111111111111<\/loc>/);
  assert.match(xml, /<news:title>Fresh WSOP Update &amp; Recap<\/news:title>/);
  assert.doesNotMatch(xml, /<news:title>Archive Poker Story<\/news:title>/, 'articles older than 48h omit <news:news> block');
});

test('2. pages/_app.js suppresses canonical and og:url on /404, /500, and /_error routes', () => {
  const src = read('pages/_app.js');
  assert.match(src, /const isErrorRoute\s*=/);
  assert.match(src, /hasUnexpandedDynamicBracket \|\| isErrorRoute/);
  assert.match(src, /\{!isErrorRoute && \(\s*<meta key="og-url" property="og:url"/);
});

test('3. ReelsStatusScreen honors titleAs="h2" so /hub/reels emits a single H1', () => {
  const screenSrc = read('src/components/reels/ReelsStatusScreen.jsx');
  const reelsSrc = read('pages/hub/reels.js');
  assert.match(screenSrc, /titleAs = 'h1'/);
  assert.match(screenSrc, /<Heading>\{title\}<\/Heading>/);
  assert.match(reelsSrc, /<ReelsStatusScreen title=\{title\} titleAs=\{titleAs\}/);
});

test('4. /learn/hands/[hand] permanently redirects shorthand aliases to canonical slugs', () => {
  const src = read('pages/learn/hands/[hand].js');
  assert.match(src, /if \(params\?\.hand && params\.hand !== hand\.slug\)/);
  assert.match(src, /destination: handPath\(hand\.slug\),\s*permanent: true/);
});

test('5. video watch pages emit WebPage with SpeakableSpecification alongside VideoObject and BreadcrumbList', () => {
  const video = normaliseVideoRow({
    youtube_video_id: 'dQw4w9WgXcQ',
    title: 'WSOP Main Event Final Table Breakdown',
    published_at: '2026-10-01T12:00:00Z',
    duration: '12:30',
  });
  const graph = [
    ...buildVideoJsonLd(video, { channelName: 'PokerGO', description: 'Final table breakdown.' }),
    buildVideoWatchWebPageJsonLd(video),
  ];
  const types = graph.map((n) => n['@type']);
  assert.deepEqual(types, ['VideoObject', 'BreadcrumbList', 'WebPage']);
  assert.equal(graph[2].speakable['@type'], 'SpeakableSpecification');
  assert.match(read('pages/hub/video-library/watch/[videoId]/[[...slug]].js'), /buildVideoWatchWebPageJsonLd\(video\)/);
});

test('6. /hub/home-games/[slug] emits BreadcrumbList, SpeakableSpecification, FAQPage, and visible FaqSection', () => {
  const src = read('pages/hub/home-games/[slug].js');
  assert.match(src, /import FaqSection from '\.\.\/\.\.\/\.\.\/src\/components\/seo\/FaqSection'/);
  assert.match(src, /'@type': 'BreadcrumbList'/);
  assert.match(src, /'@type': 'SpeakableSpecification'/);
  assert.match(src, /'@type': 'FAQPage'/);
  assert.match(src, /<FaqSection[\s\S]*?faqs=\{buildHomeGameFaqs\(data\)\}/);
});

test('7. /hub/venues/[id] sets 5-minute edge CDN Cache-Control and /search carries RFC 8288 Link header', () => {
  const venueSrc = read('pages/hub/venues/[id].js');
  const nextCfg = read('next.config.js');
  assert.match(venueSrc, /Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600'/);
  assert.match(nextCfg, /source: '\/search',[\s\S]{0,220}rel="llms-txt"/);
});

test('8. Core index pages emit SpeakableSpecification and stay within SERP meta description budgets', () => {
  const speakablePages = [
    'pages/index.js',
    'pages/learn/index.js',
    'pages/learn/matchups/index.js',
    'pages/compare/index.js',
    'src/content/compare/pages.js',
    'pages/glossary/index.js',
    'pages/rules/index.js',
    'pages/games/index.js',
    'pages/authors/index.js',
    'pages/press.js',
    'pages/poker-series/guides/index.js',
    'pages/search.js',
    'pages/hub/tournaments/this-weekend.js',
  ];
  for (const file of speakablePages) {
    assert.match(read(file), /SpeakableSpecification/, `${file} must emit SpeakableSpecification`);
  }

  const conciseDescPages = [
    'pages/index.js',
    'pages/facts.js',
    'pages/rules/index.js',
    'pages/games/index.js',
    'pages/authors/index.js',
    'pages/hub/news.js',
    'pages/hub/home-games.js',
    'pages/hub/home-games/near-me.js',
    'pages/hub/events-calendar.js',
    'pages/learn/roadmaps/index.js',
    'pages/learn/positions/index.js',
    'pages/learn/stakes/index.js',
    'pages/learn/famous-hands/index.js',
    'pages/learn/cheat-sheets.js',
    'pages/learn/poker-math.js',
  ];
  for (const file of conciseDescPages) {
    const src = read(file);
    const m = src.match(/<SEOHead[\s\S]*?description="([^"]+)"/);
    assert.ok(m, `${file} must have static SEOHead description`);
    assert.ok(m[1].length <= 160, `${file} description must be <= 160 chars (got ${m[1].length})`);
  }
});
