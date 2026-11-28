/**
 * GROWTH WAVE 3 PROGRAMMATIC SEO CI FORTRESS (2026-11-27)
 * =======================================================
 * Permanent regression locks for:
 *   1. /compare/plo4-vs-plo5 comparison lander (verified PLO4 vs PLO5 stats,
 *      schema, title <= 60, description <= 158, internal links)
 *   2. Top 30 programmatic /tools/odds/[matchup] pages (exact verified math,
 *      title <= 60, description <= 158, #SMARTERDESIGN funnel, FAQPage parity)
 *   3. /sitemap-tools.xml inclusion of all 30 /tools/odds/<slug> URLs
 *   4. extractVideoKeyMoments(description, durationSec) & VideoObject Clip hasPart
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  COMPARE_PAGES,
  PRODUCTS,
  compareJsonLd,
  compareRoutes,
  getComparePage,
  pageSources,
} from '../src/content/compare/pages.js';
import {
  TOOL_HAND_MATCHUPS,
  getToolHandMatchup,
  toolMatchupPath,
} from '../src/content/tools/handMatchups.js';
import { fitsInAResult } from '../src/lib/seo/titleFit.js';
import { hubProductSchema } from '../src/lib/seo/hubPageSchema.js';
import { generateSitemapXml, TOOLS_PAGES } from '../src/lib/seo/sitemapBuilders.mjs';
import {
  buildVideoObject,
  extractVideoKeyMoments,
  normaliseVideoRow,
} from '../src/lib/videoLibraryWatch.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const REQUIRED_30_MATCHUP_SLUGS = [
  'aa-vs-kk',
  'aa-vs-aks',
  'aa-vs-qq',
  'aa-vs-jts',
  'kk-vs-qq',
  'kk-vs-aks',
  'kk-vs-ako',
  'qq-vs-aks',
  'qq-vs-ako',
  'jj-vs-aks',
  'jj-vs-ako',
  'tt-vs-aks',
  'aks-vs-aqo',
  'aks-vs-kqs',
  'aks-vs-jts',
  'aks-vs-76s',
  'ako-vs-22',
  'ako-vs-qq',
  'aa-vs-72o',
  'q8o-vs-random',
  'k5s-vs-random',
  'a9s-vs-random',
  'a3s-vs-random',
  'q9o-vs-random',
  'k7s-vs-random',
  'jj-vs-tt',
  '99-vs-ako',
  '88-vs-aqs',
  'aakk-vs-jt98-plo4',
  'aakk-vs-random-plo4',
];

test('WAVE 3 LAW 1 — /compare/plo4-vs-plo5 satisfies all benchmarks, SEO budgets, schema, and internal links', () => {
  const page = getComparePage('plo4-vs-plo5');
  assert.ok(page, 'plo4-vs-plo5 must exist in COMPARE_PAGES');
  assert.ok(compareRoutes().includes('/compare/plo4-vs-plo5'), 'plo4-vs-plo5 must appear in compareRoutes()');
  assert.ok(fitsInAResult(page.title), `Title "${page.title}" + brand must fit <= 60 chars`);
  assert.ok(page.description.length >= 70 && page.description.length <= 158, `Description length ${page.description.length} must be 70..158`);
  assert.doesNotMatch(JSON.stringify(page), /[—–]/, 'Zero em or en dashes in plo4-vs-plo5 comparison copy');

  const combined = JSON.stringify({ page, plo4: PRODUCTS.plo4Format, plo5: PRODUCTS.plo5Format });
  for (const token of ['6 Two-Card', '10 Two-Card', '270,725', '2,598,960', '53.6%', '51.4%', '120', '145', '155', '185', '65', '85', '100', '130']) {
    assert.ok(combined.includes(token), `plo4-vs-plo5 must document verified benchmark token "${token}"`);
  }

  const sources = pageSources(page);
  assert.ok(
    sources.some((s) => s.url === 'https://smarter.poker/tools/poker-odds-calculator'),
    'plo4-vs-plo5 must cite /tools/poker-odds-calculator',
  );
  assert.ok(
    sources.some((s) => s.url === 'https://smarter.poker/research/pot-limit-omaha-plo4-plo5-plo6-equity-and-variance-study'),
    'plo4-vs-plo5 must cite /research/pot-limit-omaha-plo4-plo5-plo6-equity-and-variance-study',
  );
  assert.ok(
    page.productLinks.some((id) => PRODUCTS[id]?.href === '/tools/poker-odds-calculator'),
    'plo4-vs-plo5 must link internally to /tools/poker-odds-calculator',
  );
  assert.ok(
    (page.extraLinks || []).some((l) => l.href === '/research/pot-limit-omaha-plo4-plo5-plo6-equity-and-variance-study'),
    'plo4-vs-plo5 must link internally to /research/pot-limit-omaha-plo4-plo5-plo6-equity-and-variance-study',
  );

  const jsonLd = compareJsonLd(page);
  assert.ok(jsonLd.some((n) => n['@type'] === 'Article'), 'Article schema present');
  assert.ok(jsonLd.some((n) => n['@type'] === 'BreadcrumbList'), 'BreadcrumbList schema present');
  const faqNode = jsonLd.find((n) => n['@type'] === 'FAQPage');
  assert.ok(faqNode && faqNode.mainEntity.length >= 4, 'FAQPage schema with >= 4 questions present');
});

test('WAVE 3 LAW 2 — All 30 /tools/odds/[matchup] entries have exact math, SEO fit, valid schema, and zero dashes', () => {
  assert.equal(TOOL_HAND_MATCHUPS.length, 30, 'Exactly 30 programmatic hand-vs-hand matchups');
  assert.deepEqual(
    TOOL_HAND_MATCHUPS.map((m) => m.slug),
    REQUIRED_30_MATCHUP_SLUGS,
    'All 30 required matchup slugs must be present in canonical order',
  );

  const seenTitles = new Set();
  for (const m of TOOL_HAND_MATCHUPS) {
    assert.equal(getToolHandMatchup(m.slug), m, `lookup resolves ${m.slug}`);
    assert.equal(m.path, toolMatchupPath(m.slug));
    assert.ok(fitsInAResult(m.title), `${m.slug} title "${m.title}" must fit <= 60 chars with brand`);
    assert.ok(!seenTitles.has(m.title), `unique title for ${m.slug}`);
    seenTitles.add(m.title);
    assert.ok(m.description.length >= 70 && m.description.length <= 158, `${m.slug} description length ${m.description.length} must be 70..158`);
    assert.doesNotMatch(JSON.stringify(m), /[—–]/, `${m.slug} contains zero em or en dashes`);

    // Mathematical consistency: winA + winB + tie === 100 and equity = win + tie/2
    const sum = m.winA + m.winB + m.tie;
    assert.ok(Math.abs(sum - 100) <= 0.02, `${m.slug} winA+winB+tie=${sum} must sum to 100`);
    assert.ok(Math.abs(m.winA + m.tie / 2 - m.equityA) <= 0.02, `${m.slug} equityA must equal winA + tie/2`);
    assert.ok(Math.abs(m.winB + m.tie / 2 - m.equityB) <= 0.02, `${m.slug} equityB must equal winB + tie/2`);

    assert.ok(m.flopHitNotes.length >= 3, `${m.slug} has >= 3 flop hit notes`);
    assert.ok(m.strategicTakeaways.length >= 3, `${m.slug} has >= 3 strategic takeaways`);
    assert.ok(m.faqs.length >= 3, `${m.slug} has >= 3 FAQs`);
    assert.match(m.calculatorUrl, /^\/tools\/poker-odds-calculator\?game=(nlhe|plo4)&h0=/, `${m.slug} calculator URL preloads hands`);

    for (const rel of m.relatedSlugs) {
      assert.ok(getToolHandMatchup(rel), `${m.slug} related slug ${rel} resolves`);
      assert.notEqual(rel, m.slug, `${m.slug} does not link to itself`);
    }

    const nodes = hubProductSchema({
      path: m.path,
      name: m.h1,
      description: m.description,
      trail: [['Poker Tools', '/tools'], [`${m.handA} Vs ${m.handB}`, m.path]],
      faqs: m.faqs,
    });
    assert.ok(nodes.some((n) => n['@type'] === 'FAQPage'), `${m.slug} generates FAQPage JSON-LD`);
    assert.ok(
      nodes.some((n) => (Array.isArray(n['@type']) ? n['@type'].includes('SoftwareApplication') : n['@type'] === 'SoftwareApplication')),
      `${m.slug} generates SoftwareApplication JSON-LD`,
    );
  }
});

test('WAVE 3 LAW 3 — pages/tools/odds/[matchup].js mounts #SMARTERDESIGN funnel, visible FaqSection, and zero banned colors', () => {
  const src = read('pages/tools/odds/[matchup].js');
  assert.match(src, /export async function getStaticPaths\s*\(/);
  assert.match(src, /fallback:\s*false/);
  assert.match(src, /export async function getStaticProps\s*\(/);
  assert.match(src, /<SmarterSeoMasthead[\s\S]*?vertical="tools"/);
  assert.match(src, /<SmarterCalculatorSaveBar\b/);
  assert.match(src, /<SmarterAccountUnlockGate[\s\S]*?variant="calculator-pro"/);
  assert.match(src, /<FaqSection[\s\S]*?faqs=\{faqs\}/);
  assert.match(src, /hubProductSchema\(/);
  assert.match(src, /matchup\.calculatorUrl/);
  assert.doesNotMatch(src, /[—–]/, 'Zero em or en dashes in [matchup].js');
  assert.doesNotMatch(src, /#(f59e0b|eab308|fbbf24|d97706|ffd700|facc15)\b/i, 'Zero banned gold hexes in [matchup].js');
});

test('WAVE 3 LAW 4 — pages/sitemap-tools.xml.js registers all 30 /tools/odds/<slug> URLs cleanly', async () => {
  const sitemapSrc = read('pages/sitemap-tools.xml.js');
  assert.match(sitemapSrc, /TOOL_HAND_MATCHUPS/, 'sitemap-tools.xml.js must import TOOL_HAND_MATCHUPS');
  const { TOOLS_SITEMAP_URLS } = await import('../pages/sitemap-tools.xml.js');
  assert.equal(TOOLS_SITEMAP_URLS.length, TOOLS_PAGES.length + 30, 'sitemap includes base tools plus all 30 odds matchups');
  const xml = generateSitemapXml(TOOLS_SITEMAP_URLS);
  for (const slug of REQUIRED_30_MATCHUP_SLUGS) {
    assert.ok(
      xml.includes(`<loc>https://smarter.poker/tools/odds/${slug}</loc>`),
      `sitemap-tools.xml must include /tools/odds/${slug}`,
    );
  }
});

test('WAVE 3 LAW 5 — extractVideoKeyMoments parses MM:SS & HH:MM:SS chapters and VideoObject emits/omits Clip hasPart cleanly', () => {
  const desc = [
    'High Stakes Cash Game Session Breakdown',
    '0:00 - Table Lineup And Effective Stacks',
    '03:15: 3-Bet Pot With Pocket Queens',
    '1:02:40 | Huge River Hero Call',
    '1:45:00 Past End Of Video Should Be Dropped',
  ].join('\n');

  const moments = extractVideoKeyMoments(desc, 5400);
  assert.equal(moments.length, 3);
  assert.deepEqual(moments, [
    { name: 'Table Lineup And Effective Stacks', startOffset: 0, endOffset: 195 },
    { name: '3-Bet Pot With Pocket Queens', startOffset: 195, endOffset: 3760 },
    { name: 'Huge River Hero Call', startOffset: 3760, endOffset: 5400 },
  ]);

  // Rejects invalid seconds, non-increasing timestamps, or fewer than 2 valid moments
  assert.deepEqual(extractVideoKeyMoments('0:00 Only One Timestamp', 600), []);
  assert.deepEqual(extractVideoKeyMoments('0:75 Bad Seconds\n1:90 Bad Seconds', 600), []);
  assert.deepEqual(extractVideoKeyMoments('5:00 First\n3:00 Out Of Order', 600), []);
  assert.deepEqual(extractVideoKeyMoments('No timestamps at all in this prose.', 600), []);

  const video = normaliseVideoRow({
    youtube_video_id: 'abcDEF12345',
    source_id: 'HCL',
    type: 'cash',
    title: 'High Stakes PLO5 Session',
    duration: '1:30:00',
    published_at: '2026-10-15T12:00:00Z',
    views_count: 12000,
    availability_status: 'verified',
    embeddable: true,
  });

  // Emits Clip hasPart when description carries >= 2 valid chapter lines
  const withClips = buildVideoObject(video, {
    channelName: 'Hustler Casino Live',
    description: desc,
  });
  assert.ok(Array.isArray(withClips.hasPart) && withClips.hasPart.length === 3, 'VideoObject emits 3 Clip nodes');
  assert.equal(withClips.hasPart[0]['@type'], 'Clip');
  assert.equal(withClips.hasPart[0].name, 'Table Lineup And Effective Stacks');
  assert.equal(withClips.hasPart[0].startOffset, 0);
  assert.equal(withClips.hasPart[0].endOffset, 195);
  assert.ok(withClips.hasPart[0].url.endsWith('?t=0'));
  assert.equal(withClips.hasPart[2].startOffset, 3760);
  assert.equal(withClips.hasPart[2].endOffset, 5400);

  // Omits hasPart cleanly when description has no chapters
  const withoutClips = buildVideoObject(video, {
    channelName: 'Hustler Casino Live',
    description: 'Watch High Stakes PLO5 Session From Hustler Casino Live.',
  });
  assert.equal(withoutClips.hasPart, undefined, 'hasPart must be omitted when no chapters exist');
});
