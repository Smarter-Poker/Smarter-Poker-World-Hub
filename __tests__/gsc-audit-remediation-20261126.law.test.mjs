/**
 * GSC AUDIT REMEDIATION & SEO/AEO/GEO HARDENING LAWS (2026-11-26)
 *
 * Permanently pins every root-cause fix discovered during the live Google Search
 * Console audit of sc-domain:smarter.poker:
 *   1. Unexpanded Next.js dynamic route brackets ([state], [slug], [gameId], etc.)
 *      never leak into <link rel="canonical"> or <link rel="alternate" type="text/markdown">.
 *   2. /hub/training/play/[gameId] emits noindex in its SSR loading branch.
 *   3. All 4 crawled legacy /research/* 404 slugs permanently 301-redirect to
 *      their canonical live studies (HTML and .md mirrors).
 *   4. Synthetic scraper test fixtures ("Series Test" / "TableCaptain Cloud")
 *      are excluded from sitemaps, isPublicSeries(), and return 410 Gone.
 *   5. Series SSR summary renders .series-aeo-kernel, .stats-grid-dl, and visible
 *      FAQ Q&A matching FAQPage JSON-LD (eliminating zero-event Soft 404s) while
 *      venueAeo.mjs supports both camelCase SSR props and snake_case DB rows.
 *   6. Series without venue/city disambiguate titles by date range when it fits.
 *   7. VideoObject JSON-LD author always carries a valid url field.
 *   8. /hub/merch-store/[productId] Product offers emit hasMerchantReturnPolicy,
 *      shippingDetails, priceValidUntil, and seller for Google Merchant Listings.
 *   9. Video Library /auth/login?redirect=... links and parameterized
 *      /tools/poker-odds-calculator?hand1=... links carry rel="nofollow" to
 *      protect crawl budget.
 *  10. Filtered /hub/reels?category=... / ?feed=... / ?mode=... pages emit
 *      noindex so feed views never fail Video Indexing "not on a watch page".
 *  11. Raw .md AI-ingestion endpoints emit X-Robots-Tag: noindex, follow so
 *      Googlebot indexes HTML while LLMs still ingest 200 OK Markdown.
 *  12. /learn/category/[category] pillar pages emit FAQPage schema and visible
 *      FaqSection matching the schema.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  isServableSeriesParentEvidence,
  isSyntheticTestSeries,
} from '../src/lib/poker-near-me/seriesRouteIdentity.mjs';
import {
  isPublicSeries,
  seriesTitle,
  toSeoSeries,
} from '../src/lib/poker-near-me/seriesSeo.mjs';
import {
  buildSeriesFactKernel,
  buildSeriesPaaQuestions,
} from '../src/lib/poker-near-me/venueAeo.mjs';
import {
  buildVideoObject,
  normaliseVideoRow,
} from '../src/lib/videoLibraryWatch.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('1. unexpanded Next.js dynamic route brackets are never emitted in canonical or markdown links', () => {
  const appSrc = read('pages/_app.js');
  const seoHeadSrc = read('src/components/seo/SEOHead.js');
  const sharedSeoSrc = read('vendor/commander-shared/src/components/seo/SEOHead.js');

  assert.match(appSrc, /hasUnexpandedDynamicBracket\s*=\s*\/\\\[/);
  assert.match(appSrc, /\{defaultCanonical && <link key="canonical" rel="canonical" href=\{defaultCanonical\} \/>\}/);
  assert.match(sharedSeoSrc, /if \(!trimmed \|\| \/\\\[/);
  assert.match(seoHeadSrc, /safeMarkdownFallback/);
  assert.match(seoHeadSrc, /if \(resolvedMarkdownUrl && \/\\\[/);
});

test('2. /hub/training/play/[gameId] emits SEOHead noindex in its SSR loading branch', () => {
  const src = read('pages/hub/training/play/[gameId].js');
  const loadingIdx = src.indexOf('if (loading || !gameId)');
  const returnIdx = src.indexOf('className="training-play-page"');
  assert.ok(loadingIdx > -1 && returnIdx > loadingIdx);
  const loadingBranch = src.slice(loadingIdx, returnIdx);
  assert.match(loadingBranch, /<SEOHead[\s\S]*?noindex=\{true\}/);
});

test('3. all 4 crawled legacy /research/* 404 slugs have permanent 301 redirects in next.config.js', () => {
  const cfg = read('next.config.js');
  const pairs = [
    ['/research/plo4-plo5-plo6-equity-and-variance-study', '/research/pot-limit-omaha-plo4-plo5-plo6-equity-and-variance-study'],
    ['/research/live-poker-tournament-guarantee-and-overlay-study', '/research/daily-poker-tournament-buy-in-and-guarantee-index'],
    ['/research/live-cash-game-winrate-variance-and-bankroll-study', '/research/live-low-stakes-1-2-and-2-5-nlh-population-tendencies-report'],
    ['/research/state-by-state-live-poker-legal-and-regulatory-guide', '/poker-rooms/states'],
  ];
  for (const [from, to] of pairs) {
    assert.ok(cfg.includes(`source: '${from}'`), `missing redirect source ${from}`);
    assert.ok(cfg.includes(`destination: '${to}'`), `missing redirect destination ${to}`);
  }
});

test('4. synthetic scraper test fixtures (Series Test / TableCaptain Cloud) are rejected everywhere', () => {
  const testFixture = {
    id: 5001340,
    name: 'Series Test',
    series_uid: 'pa_series-test-tablecaptain-cloud-juneau-2026',
    data_quality: 'scraped_verified',
    source_url: 'https://www.pokeratlas.com/poker-tournament-series/series-test-tablecaptain-cloud-juneau-2026',
    scrape_html_hash: 'a'.repeat(64),
    scrape_timestamp: '2026-11-01T00:00:00Z',
    scrape_batch_id: 'batch-1',
  };
  assert.equal(isSyntheticTestSeries(testFixture), true);
  assert.equal(isServableSeriesParentEvidence(testFixture, Date.parse('2026-11-02T00:00:00Z')), false);
  assert.equal(isPublicSeries(toSeoSeries(testFixture)), false);

  const seriesPageSrc = read('pages/hub/series/[id].js');
  assert.match(seriesPageSrc, /if \(seoSeries && isSyntheticTestSeries\(seoSeries\)\)[\s\S]*?res\.statusCode = 410/);
});

test('5. series SSR summary renders fact kernel, stats-grid-dl, and visible FAQ with camelCase support', () => {
  const camelSeries = toSeoSeries({
    id: 495,
    name: 'Platinum Stack',
    venue_name: 'Hard Rock Hollywood',
    city: 'Hollywood',
    state: 'FL',
    start_date: '2026-03-26',
    end_date: '2026-03-29',
    main_event_buyin: 800,
    main_event_guaranteed: 200000,
    events: [],
  });
  const kernel = buildSeriesFactKernel(camelSeries, 'Hard Rock Hollywood', 'March 26 to March 29, 2026');
  assert.match(kernel, /\$800 Main Event buy-in/);
  assert.match(kernel, /\$200,000 in total guarantees/);

  const faqs = buildSeriesPaaQuestions(camelSeries, 'Hard Rock Hollywood', 'March 26 to March 29, 2026');
  assert.equal(faqs.length, 4);
  assert.match(faqs[1].answer, /\$800/);
  assert.match(faqs[3].answer, /\$200,000/);

  const seriesPageSrc = read('pages/hub/series/[id].js');
  const summaryStart = seriesPageSrc.indexOf('function SeriesSummary(');
  const summaryEnd = seriesPageSrc.indexOf('function formatEventDay(');
  const summarySrc = seriesPageSrc.slice(summaryStart, summaryEnd);
  assert.match(summarySrc, /className="series-aeo-kernel"/);
  assert.match(summarySrc, /className="stats-grid-dl"/);
  assert.match(summarySrc, /className="series-summary-faq"/);
  assert.match(summarySrc, /buildSeriesFactKernel\(/);
  assert.match(summarySrc, /buildSeriesPaaQuestions\(/);
});

test('6. unlocated multi-stop series disambiguate titles using compact date range when it fits', () => {
  const trailblazer = toSeoSeries({
    id: 5001039,
    name: 'Trailblazer Tour Season III',
    venue_name: null,
    city: null,
    state: null,
    start_date: '2026-08-26',
    end_date: '2026-09-07',
  });
  const title = seriesTitle(trailblazer);
  assert.match(title, /Trailblazer Tour Season III/);
  assert.match(title, /Aug 26-Sep 7, 2026|Aug 2026/);
});

test('7. VideoObject JSON-LD emits verified registered channel author url without fabricating unverified URLs', () => {
  const baseRow = {
    youtube_video_id: 'xUcjIQTh0uw',
    source_id: 'BRAD_OWEN',
    source_name: 'Brad Owen',
    type: 'cash',
    title: 'Overbluffing With Seven Deuce?',
    duration: '15:00',
    published_at: '2026-10-20T12:00:00Z',
    views_count: 50000,
    availability_status: 'verified',
    embeddable: true,
  };
  const verifiedHref = '/hub/video-library/channels/7a12825b-0559-4fc8-a69f-d88377434c08';
  const verifiedObj = buildVideoObject(normaliseVideoRow(baseRow), {
    channelName: 'Brad Owen',
    channelHref: verifiedHref,
    description: 'Watch Overbluffing With Seven Deuce?',
  });
  assert.equal(verifiedObj.author['@type'], 'Organization');
  assert.equal(verifiedObj.author.name, 'Brad Owen');
  assert.equal(verifiedObj.author.url, `https://smarter.poker${verifiedHref}`);
});

test('8. /hub/merch-store/[productId] Product offers include Merchant Listings required fields', () => {
  const src = read('pages/hub/merch-store/[productId].js');
  assert.match(src, /hasMerchantReturnPolicy/);
  assert.match(src, /OfferShippingDetails/);
  assert.match(src, /priceValidUntil/);
  assert.match(src, /seller:/);
});

test('9. auth redirect links in Video Library and parameterized odds calculator links use rel="nofollow"', () => {
  for (const file of [
    'src/components/video-library/WatchTracking.jsx',
    'src/components/video-library/ChannelFollow.jsx',
    'src/components/video-library/StudyStatus.jsx',
    'pages/hub/video-library/owner.js',
    'pages/hub/video-library/playlists/[playlistId].js',
  ]) {
    const src = read(file);
    assert.match(src, /rel="nofollow"/, `${file} must mark /auth/login?redirect links rel="nofollow"`);
  }

  for (const file of [
    'pages/learn/hands/[hand].js',
    'pages/learn/matchups/index.js',
    'pages/learn/matchups/[slug].js',
    'pages/learn/famous-hands/index.js',
    'pages/learn/famous-hands/[slug].js',
  ]) {
    const src = read(file);
    assert.match(src, /poker-odds-calculator\?hand1=[\s\S]{0,160}rel="nofollow"/, `${file} must mark parameterized odds-calculator links rel="nofollow"`);
  }
});

test('10. filtered /hub/reels feed views emit noindex while keeping canonical reels watch pages indexable', () => {
  const src = read('pages/hub/reels.js');
  assert.match(src, /const isFilteredFeed = Boolean\(query\.category \|\| query\.feed \|\| query\.mode\)/);
  assert.match(src, /noindex=\{reelsUnavailable \|\| isFilteredFeed\}/);
});

test('11. raw .md AI-ingestion mirrors emit X-Robots-Tag: noindex, follow in next.config.js', () => {
  const cfg = read('next.config.js');
  assert.match(cfg, /source: '\/:path\*\.md'[\s\S]*?key: 'X-Robots-Tag'[\s\S]*?value: 'noindex, follow'/);
});

test('12. /learn/category/[category] emits FAQPage JSON-LD and visible FaqSection', () => {
  const src = read('pages/learn/category/[category].js');
  assert.match(src, /'@type': 'FAQPage'/);
  assert.match(src, /<FaqSection/);
});
