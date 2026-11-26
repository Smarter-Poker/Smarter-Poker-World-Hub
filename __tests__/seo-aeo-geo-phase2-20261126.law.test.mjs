/**
 * SEO, AEO & GEO PHASE 2 HARDENING LAWS (2026-11-26)
 *
 * Permanently locks in all Phase 2 upgrades across smarter.poker:
 *   1. /freerolls passes canonical="/freerolls" (not canonicalUrl) to SEOHead so
 *      canonical, og:url, hreflang, RSS, and oEmbed tags render properly.
 *   2. /hub/poker-series and /hub/poker-tours key canonical, og:title,
 *      og:description, and og:url tags to eliminate duplicate canonicals and
 *      contradictory og:url metadata.
 *   3. pages/_app.js uses defaultCanonical for fallback og:url instead of
 *      hardcoding https://smarter.poker across subpages.
 *   4. /hub/article?id=<uuid> renders full SSR NewsArticle + BreadcrumbList +
 *      SpeakableSpecification JSON-LD, self-canonicalizes via normalizeCanonicalUrl,
 *      keeps SEOHead outside PageTransition, and returns 404/noindex on missing rows.
 *   5. RFC 8288 GEO Link discovery headers (/llms.txt, /.well-known/mcp.json,
 *      /.well-known/ai-facts.json) are served site-wide across homepage, Hub,
 *      compare, features, glossary, rules, games, poker-series, authors, about,
 *      facts, press, and freerolls.
 *   6. Homepage LandingProductSummary advertises the accurate 52 Free Poker
 *      Calculators count and provides one-hop links to /hub/poker-series,
 *      /hub/poker-tours, /hub/events-calendar, and /hub/home-games/near-me.
 *   7. /hub renders a semantic SSR <h1> and a concise <=160 char description.
 *   8. /about and /features emit FAQPage JSON-LD matched by visible FaqSection,
 *      and /poker-rooms/guides BreadcrumbList points directly to
 *      /hub/poker-near-me/lobby (no redirect hop).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('1. /freerolls passes canonical="/freerolls" to SEOHead (never dead canonicalUrl prop)', () => {
  const src = read('pages/freerolls.js');
  assert.match(src, /<SEOHead[\s\S]*?canonical="\/freerolls"/);
  assert.doesNotMatch(src, /<SEOHead[\s\S]*?canonicalUrl=/);
});

test('2. /hub/poker-series and /hub/poker-tours key canonical and og:* tags for Next Head deduplication', () => {
  for (const file of ['pages/hub/poker-series.js', 'pages/hub/poker-tours.js']) {
    const src = read(file);
    assert.match(src, /<link key="canonical" rel="canonical"/, `${file} must key canonical`);
    assert.match(src, /<meta key="og-url" property="og:url"/, `${file} must key og-url`);
    assert.match(src, /<meta key="og-title" property="og:title"/, `${file} must key og-title`);
    assert.match(src, /<meta key="og-description" property="og:description"/, `${file} must key og-description`);
  }
});

test('3. pages/_app.js uses defaultCanonical for fallback og:url instead of hardcoded apex', () => {
  const src = read('pages/_app.js');
  assert.match(src, /<meta key="og-url" property="og:url" content=\{defaultCanonical \|\| 'https:\/\/smarter\.poker\/'\} \/>/);
});

test('4. /hub/article renders SSR NewsArticle metadata and self-canonicalizes ?id=', () => {
  const articleSrc = read('pages/hub/article.js');
  const sharedSeoSrc = read('vendor/commander-shared/src/components/seo/SEOHead.js');

  assert.match(articleSrc, /export async function getServerSideProps\(\{ query = \{\}, res \}\)/);
  assert.match(articleSrc, /'@type': 'NewsArticle'/);
  assert.match(articleSrc, /'@type': 'BreadcrumbList'/);
  assert.match(articleSrc, /'@type': 'SpeakableSpecification'/);
  // SEOHead must be rendered before the JSX <PageTransition>
  const seoIdx = articleSrc.indexOf('canonical={`/hub/article?id=${article.id}`}');
  const ptIdx = articleSrc.lastIndexOf('<PageTransition>');
  assert.ok(seoIdx > -1 && ptIdx > seoIdx, 'SEOHead must stay outside <PageTransition> for SSR');
  assert.match(sharedSeoSrc, /baseCanonical === `\$\{SITE_URL\}\/hub\/article`/);
});

test('5. RFC 8288 GEO Link discovery headers cover homepage, hub, compare, features, glossary, rules, games, and freerolls', () => {
  const cfg = read('next.config.js');
  assert.match(
    cfg,
    /source: '\/:surface\(tools\|learn\|research\|poker-rooms\|hub\|compare\|features\|glossary\|rules\|games\|poker-series\|authors\)\/:path\*'/
  );
  assert.match(
    cfg,
    /source: '\/:surface\(tools\|learn\|research\|hub\|compare\|features\|glossary\|rules\|games\|authors\|about\|facts\|press\|freerolls\)'/
  );
  assert.match(cfg, /source: '\/',[\s\S]{0,220}rel="llms-txt"/);
});

test('6. LandingProductSummary reflects 52 Free Poker Calculators and links major tournament/home-game directories', () => {
  const src = read('src/components/landing/LandingProductSummary.js');
  assert.ok(src.includes('52 Free Poker Calculators & Solvers'));
  assert.ok(!src.includes('34 Free Poker Calculators'));
  for (const href of ['/hub/poker-series', '/hub/poker-tours', '/hub/events-calendar', '/hub/home-games/near-me']) {
    assert.ok(src.includes(`href: '${href}'`), `LandingProductSummary must link to ${href}`);
  }
});

test('7. /hub renders a semantic SSR <h1> and concise description', () => {
  const src = read('pages/hub/index.js');
  assert.match(src, /<h1[\s\S]*?Smarter\.Poker World Hub/);
  const descMatch = src.match(/<SEOHead[\s\S]*?description="([^"]+)"/);
  assert.ok(descMatch && descMatch[1].length <= 160, `hub description should be <= 160 chars (got ${descMatch?.[1]?.length})`);
});

test('8. /about, /features, and /learn/category emit FAQPage + valid FaqSection faqs prop, and market guides skip /hub/poker-near-me redirect', () => {
  for (const file of ['pages/about.js', 'pages/features/index.js', 'pages/learn/category/[category].js']) {
    const src = read(file);
    assert.match(src, /'@type': 'FAQPage'/, `${file} must emit FAQPage JSON-LD`);
    assert.match(src, /<FaqSection[^>]*\bfaqs=\{/, `${file} must pass faqs={} prop to FaqSection`);
    assert.doesNotMatch(src, /<FaqSection[^>]*\bitems=\{/, `${file} must not pass dead items={} prop to FaqSection`);
  }
  for (const file of ['pages/poker-rooms/guides/index.js', 'pages/poker-rooms/guides/[city].js']) {
    const src = read(file);
    assert.ok(src.includes('${SITE_URL}/hub/poker-near-me/lobby'), `${file} breadcrumb must point directly to /hub/poker-near-me/lobby`);
    assert.ok(!src.includes("item: `${SITE_URL}/hub/poker-near-me`"), `${file} breadcrumb must not point to redirecting /hub/poker-near-me`);
  }
});
