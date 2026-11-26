/**
 * Phase 6 SEO, AEO, GEO, Core Web Vitals & GSC Remediation Law Test (2026-11-26)
 *
 * Permanently hardens:
 * 1. Universal Article/NewsArticle/TechArticle/BlogPosting image enforcement in
 *    SEOHead.normalizeJsonLdGraph, removal of invalid Practice Problem Quiz JSON-LD
 *    from /features/poker-trivia, and elimination of duplicate OpenSearch tags.
 * 2. Zero broken 404 /learn/* or /research/* internal links in tool pages and zero
 *    internal /hub/poker-near-me or /login redirect hops across pages/ and src/.
 * 3. Core Web Vitals explicit width/height and valid lowercase fetchpriority on
 *    global header avatar, tour cards, bankroll/tool hero banners, venue marks,
 *    and odds calculator card images.
 * 4. GSC query-driven CTR title and meta description length budgets across all
 *    lessons, research reports, and all 169 starting hand pages.
 * 5. First-party AI answer-engine referral detection and /api/seo/referral-stats
 *    ai_referral_visits + by_ai_engine attribution telemetry.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { firstThatFits, fitsInAResult, fitMetaDescription } from '../src/lib/seo/titleFit.js';
import { LESSONS } from '../src/content/learn/lessons.js';
import { RESEARCH_REPORTS } from '../src/content/research/reports.js';
import { STARTING_HANDS } from '../src/content/learn/hands.js';
import { detectAiReferral, classifyLandingSurface } from '../src/lib/seo/aiReferralTracker.js';
import { recordSeoTelemetryEvent, getSeoTelemetrySnapshot } from '../pages/api/seo/referral-stats.js';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function walkSourceFiles(dir, out = []) {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return out;
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git') continue;
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walkSourceFiles(rel, out);
    else if (/\.(js|jsx|ts|tsx|mjs)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

test('1. SEOHead enforces Article JSON-LD images, /features/poker-trivia omits invalid Quiz, and _document avoids duplicate OpenSearch', () => {
  const seoHeadSrc = read('src/components/seo/SEOHead.js');
  assert.match(seoHeadSrc, /ARTICLE_SCHEMA_TYPES\s*=\s*new Set\(/);
  assert.match(seoHeadSrc, /export function enrichArticleJsonLdImages\(/);
  assert.match(seoHeadSrc, /enrichArticleJsonLdImages\(normalizeJsonLdGraph\(props\.jsonLd\),\s*ogImage,\s*imageMetadata\)/);

  const triviaSrc = read('pages/features/poker-trivia.js');
  assert.doesNotMatch(triviaSrc, /'@type':\s*'Quiz'/, 'poker-trivia lander must not emit invalid unrendered Practice Problem Quiz schema');
  assert.doesNotMatch(triviaSrc, /eduQuestionType/, 'poker-trivia lander must not emit deprecated Practice Problem markup');

  const docSrc = read('pages/_document.js');
  assert.doesNotMatch(docSrc, /<link[^>]+opensearch\.xml/, '_document.js must not duplicate the OpenSearch link owned by SEOHead');
});

test('2. Zero broken /learn/* or /research/* internal links in SEO surfaces and zero /hub/poker-near-me or /login redirect hops site-wide', () => {
  const validResearch = new Set(RESEARCH_REPORTS.map((r) => `/research/${r.slug}`));
  const validLearn = new Set(LESSONS.map((l) => `/learn/${l.slug}`));
  const learnStaticPages = new Set(
    fs.readdirSync(path.join(ROOT, 'pages/learn')).map((f) => '/learn/' + f.replace(/\.js$/, ''))
  );
  const researchStaticPages = new Set(
    fs.readdirSync(path.join(ROOT, 'pages/research')).map((f) => '/research/' + f.replace(/\.js$/, ''))
  );

  const seoFiles = [
    ...walkSourceFiles('pages/tools'),
    ...walkSourceFiles('pages/learn'),
    ...walkSourceFiles('pages/research'),
    ...walkSourceFiles('pages/compare'),
    ...walkSourceFiles('pages/poker-rooms'),
    ...walkSourceFiles('pages/poker-series'),
  ];

  const brokenLinks = [];
  for (const rel of seoFiles) {
    const txt = read(rel);
    for (const m of txt.matchAll(/href=["'](\/research\/[a-z0-9-]+)["']/g)) {
      if (!validResearch.has(m[1]) && !researchStaticPages.has(m[1])) {
        brokenLinks.push(`${m[1]} in ${rel}`);
      }
    }
    for (const m of txt.matchAll(/href=["'](\/learn\/[a-z0-9-]+)["']/g)) {
      if (!validLearn.has(m[1]) && !learnStaticPages.has(m[1])) {
        brokenLinks.push(`${m[1]} in ${rel}`);
      }
    }
  }
  assert.deepEqual(brokenLinks, [], `Broken internal links found: ${brokenLinks.join(', ')}`);

  const allFiles = [...walkSourceFiles('pages'), ...walkSourceFiles('src')];
  const redirectHops = [];
  for (const rel of allFiles) {
    const txt = read(rel);
    if (/href=["']\/hub\/poker-near-me["']/.test(txt)) {
      redirectHops.push(`/hub/poker-near-me in ${rel}`);
    }
    if (/href=["']\/login["']/.test(txt)) {
      redirectHops.push(`/login in ${rel}`);
    }
  }
  assert.deepEqual(redirectHops, [], `Internal redirect hops found: ${redirectHops.join(', ')}`);
});

test('3. Core Web Vitals explicit width/height and valid lowercase fetchpriority on global header, tours, banners, venues, and odds cards', () => {
  const headerSrc = read('src/components/ui/UniversalHeader.js');
  assert.match(headerSrc, /width="48"[\s\S]{0,120}height="48"[\s\S]{0,200}approved-global-header__avatar/);

  const tourCardSrc = read('src/components/poker-series/TourCard.js');
  assert.match(tourCardSrc, /width="44"[\s\S]{0,120}height="44"[\s\S]{0,240}tour-logo-img/);

  const pnmTourCardSrc = read('src/components/poker-near-me/PokerTourCard.jsx');
  assert.match(pnmTourCardSrc, /width="44"\s+height="44"[\s\S]{0,120}tour-logo-img/);

  const bannerSrc = read('src/components/bankroll/BankrollImageHeader.jsx');
  assert.match(bannerSrc, /width="1200"\s+height="240"\s+fetchpriority="high"/);

  const identityMarkSrc = read('src/components/poker-near-me/PokerIdentityMark.jsx');
  assert.match(identityMarkSrc, /width=\{size\}[\s\S]{0,60}height=\{size\}/);
  assert.match(identityMarkSrc, /fetchpriority=\{priority \? 'high' : undefined\}/);
  assert.doesNotMatch(identityMarkSrc, /fetchPriority=/);

  const pokerToolsSrc = read('pages/hub/poker-tools.js');
  assert.match(pokerToolsSrc, /getCardImage\(card\.rank, card\.suit\)\}\s+alt=""\s+width="64"\s+height="90"/);
  assert.match(pokerToolsSrc, /getCardImage\(rank, suit\)\}\s+alt=""\s+width="48"\s+height="68"/);
});

test('4. GSC CTR title and meta description budgets hold across all lessons, research reports, and all 169 starting hands', () => {
  assert.equal(STARTING_HANDS.length, 169);

  for (const lesson of LESSONS) {
    const desc = fitMetaDescription(lesson.summary, 158);
    assert.ok(desc.length > 40 && desc.length <= 158, `Lesson ${lesson.slug} description length ${desc.length} out of range`);
  }

  for (const report of RESEARCH_REPORTS) {
    const title = firstThatFits([report.shortTitle]);
    const desc = fitMetaDescription(report.summary, 158);
    assert.ok(fitsInAResult(title), `Research ${report.slug} title exceeds 60 chars: ${title}`);
    assert.ok(desc.length > 40 && desc.length <= 158, `Research ${report.slug} description length ${desc.length} out of range`);
  }

  const ploReport = RESEARCH_REPORTS.find((r) => r.slug === 'pot-limit-omaha-plo4-plo5-plo6-equity-and-variance-study');
  assert.ok(ploReport, 'PLO4/5/6 study must exist');
  assert.match(ploReport.shortTitle, /PLO4 Vs PLO5 Vs PLO6/i);

  for (const hand of STARTING_HANDS) {
    const title = firstThatFits([
      `How To Play ${hand.name} (${hand.code}) GTO Guide`,
      `How To Play ${hand.code}: GTO Poker Strategy`,
      `${hand.name} (${hand.code}) GTO Guide`,
    ]);
    const desc = fitMetaDescription(hand.summary, 158);
    assert.ok(fitsInAResult(title), `Starting hand ${hand.slug} title exceeds 60 chars: ${title}`);
    assert.ok(desc.length > 40 && desc.length <= 158, `Starting hand ${hand.slug} description length ${desc.length} out of range`);
  }

  assert.match(read('pages/learn/[topic].js'), /fitMetaDescription\(lesson\.summary,\s*158\)/);
  assert.match(read('pages/research/[slug].js'), /fitMetaDescription\(report\.summary,\s*158\)/);
  assert.match(read('pages/learn/hands/[hand].js'), /fitMetaDescription\(hand\.summary,\s*158\)/);
});

test('5. First-party AI answer-engine referral detector and referral-stats telemetry track GEO landings cleanly', () => {
  const gptRef = detectAiReferral({ referrer: 'https://chatgpt.com/c/12345', search: '' });
  assert.deepEqual(gptRef, { engine: 'chatgpt', referrerHost: 'chatgpt.com', signal: 'referrer', utmSource: null });

  const pplxUtm = detectAiReferral({ referrer: '', search: '?utm_source=perplexity.ai' });
  assert.deepEqual(pplxUtm, { engine: 'perplexity', referrerHost: null, signal: 'utm_source', utmSource: 'perplexity.ai' });

  const claudeRef = detectAiReferral({ referrer: 'https://claude.ai/chat/abc', search: '' });
  assert.equal(claudeRef?.engine, 'claude');

  const organic = detectAiReferral({ referrer: 'https://www.google.com/search?q=poker', search: '' });
  assert.equal(organic, null);

  assert.equal(classifyLandingSurface('/tools/bankroll-calculator'), 'tools');
  assert.equal(classifyLandingSurface('/learn/risk-of-ruin'), 'learn');
  assert.equal(classifyLandingSurface('/poker-rooms/states/nevada'), 'poker-rooms');
  assert.equal(classifyLandingSurface('/research/pot-limit-omaha-plo4-plo5-plo6-equity-and-variance-study'), 'research');

  const before = getSeoTelemetrySnapshot().runtime_telemetry.by_category.ai_referral_visits || 0;
  recordSeoTelemetryEvent({
    category: 'ai_referral_visits',
    item: 'chatgpt:learn',
    source: 'referrer',
    engine: 'chatgpt',
    req: { headers: { 'user-agent': 'Mozilla/5.0', referer: 'https://chatgpt.com/' } },
  });
  const after = getSeoTelemetrySnapshot().runtime_telemetry;
  assert.equal(after.by_category.ai_referral_visits, before + 1);
  assert.ok((after.by_ai_engine.chatgpt || 0) >= 1);

  assert.match(read('pages/_app.js'), /recordAiReferralVisit/);
});
