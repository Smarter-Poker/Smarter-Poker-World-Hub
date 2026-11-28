/**
 * OTC TIER 2 BOFU COMPETITOR SWITCHERS & 60 HAND MATCHUPS FORTRESS (2026-11-27)
 * =============================================================================
 * Permanent regression locks for:
 *   1. Five high-intent BOFU competitor switcher landers (/compare/smarter-poker-vs-*):
 *      title <= 60 chars (fitsInAResult), description <= 158 chars, >= 40-word GEO lead,
 *      >= 4 FAQs matching FAQPage JSON-LD, verified HTTPS sources, zero em/en dashes.
 *   2. 60 verified programmatic /tools/odds/[matchup] entries across NLHE, PLO4, and PLO5:
 *      unique slugs, exact equity math summing to 100.00% (+/- 0.05%), title <= 60 chars,
 *      description <= 158 chars, >= 3 FAQs, zero em/en dashes.
 *   3. /sitemap-tools.xml includes /tools/gto-leak-finder and all 60 /tools/odds/<slug> URLs
 *      with zero duplicate <loc> entries.
 *   4. public/llms-full.txt cites all 5 switcher pages and /tools/gto-leak-finder cleanly.
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
import { generateSitemapXml } from '../src/lib/seo/sitemapBuilders.mjs';
import { TOOLS_SITEMAP_URLS } from '../pages/sitemap-tools.xml.js';
import { syncLlmsFull } from '../scripts/generate-llms-full.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const BOFU_SWITCHER_SLUGS = [
  'smarter-poker-vs-gto-wizard',
  'smarter-poker-vs-pokeratlas',
  'smarter-poker-vs-bravo-poker-live',
  'smarter-poker-vs-upswing-poker',
  'smarter-poker-vs-poker-bankroll-tracker',
];

const REQUIRED_PLO_MATCHUPS = [
  'aakk-vs-jt98-plo4',
  'aakk-vs-random-plo4',
  'aakq-vs-jt98-plo4',
  'aa-double-suited-vs-kk-double-suited-plo4',
  'kkqq-vs-jt98-plo4',
  'aakkj-vs-jt987-plo5',
];

test('OTC TIER 2 LAW 1 — All 5 BOFU /compare/smarter-poker-vs-* switcher landers satisfy SEO, GEO, FAQPage, and citation invariants', () => {
  const routes = compareRoutes();
  const seenSlugs = new Set(COMPARE_PAGES.map((p) => p.slug));
  assert.equal(seenSlugs.size, COMPARE_PAGES.length, 'COMPARE_PAGES slugs must remain 100% unique');

  for (const slug of BOFU_SWITCHER_SLUGS) {
    const page = getComparePage(slug);
    assert.ok(page, `BOFU switcher slug "${slug}" must exist in COMPARE_PAGES`);
    assert.ok(routes.includes(`/compare/${slug}`), `/compare/${slug} must appear in compareRoutes()`);
    assert.ok(fitsInAResult(page.title), `${slug} title "${page.title}" must fit <= 60 chars`);
    assert.ok(
      page.description.length >= 70 && page.description.length <= 158,
      `${slug} description length ${page.description.length} must be 70..158`,
    );

    const summaryWords = page.summary.text.trim().split(/\s+/).length;
    assert.ok(summaryWords >= 38, `${slug} GEO direct-answer summary must be ~40+ words (got ${summaryWords})`);

    assert.ok(Array.isArray(page.faq) && page.faq.length >= 4, `${slug} must include >= 4 FAQs (got ${page.faq?.length || 0})`);
    assert.ok(page.table && page.table.products.length >= 2, `${slug} must include a side-by-side comparison table`);
    assert.ok(page.table.columns.length >= 6, `${slug} table must compare >= 6 factual attributes`);

    for (const productId of page.table.products) {
      assert.ok(PRODUCTS[productId], `${slug} references valid product "${productId}"`);
    }

    const sources = pageSources(page);
    assert.ok(sources.length >= 3, `${slug} must cite >= 3 verified sources`);
    for (const src of sources) {
      assert.match(src.url, /^https:\/\/[^\s]+$/, `${slug} source "${src.key}" must be an https URL`);
    }
    assert.ok(
      sources.some((s) => s.kind !== 'own'),
      `${slug} must cite at least one external competitor primary/press source`,
    );
    assert.ok(
      sources.some((s) => s.key === 'spHome'),
      `${slug} must cite spHome for Smarter.Poker compliance disclosure`,
    );

    const jsonLd = compareJsonLd(page);
    const faqNode = jsonLd.find((n) => n['@type'] === 'FAQPage');
    assert.ok(faqNode && faqNode.mainEntity.length >= 4, `${slug} must emit FAQPage JSON-LD with >= 4 questions`);
    assert.ok(jsonLd.some((n) => n['@type'] === 'Article'), `${slug} must emit Article JSON-LD`);
    assert.ok(jsonLd.some((n) => n['@type'] === 'BreadcrumbList'), `${slug} must emit BreadcrumbList JSON-LD`);

    const serialized = JSON.stringify(page);
    assert.doesNotMatch(serialized, /[—–]/, `${slug} must contain zero em or en dashes`);
    assert.doesNotMatch(
      serialized,
      /#(f59e0b|eab308|fbbf24|d97706|ffd700|facc15|d4af37|d4a853|f2b84b)\b/i,
      `${slug} must contain zero banned gold hexes`,
    );
  }
});

test('OTC TIER 2 LAW 2 — Programmatic hand matchups expand to >= 60 verified NLHE, PLO4 & PLO5 entries with exact equity math', () => {
  assert.ok(
    TOOL_HAND_MATCHUPS.length >= 60,
    `TOOL_HAND_MATCHUPS must contain >= 60 matchups (got ${TOOL_HAND_MATCHUPS.length})`,
  );

  const seenSlugs = new Set();
  const seenTitles = new Set();
  const gamesSeen = new Set();

  for (const m of TOOL_HAND_MATCHUPS) {
    assert.ok(!seenSlugs.has(m.slug), `duplicate matchup slug "${m.slug}"`);
    seenSlugs.add(m.slug);
    assert.equal(getToolHandMatchup(m.slug), m, `lookup resolves ${m.slug}`);
    assert.equal(m.path, toolMatchupPath(m.slug), `path matches slug for ${m.slug}`);

    assert.ok(!seenTitles.has(m.title), `duplicate matchup title "${m.title}"`);
    seenTitles.add(m.title);
    assert.ok(fitsInAResult(m.title), `${m.slug} title "${m.title}" must fit <= 60 chars with brand`);
    assert.ok(
      m.description.length >= 70 && m.description.length <= 158,
      `${m.slug} description length ${m.description.length} must be 70..158`,
    );
    assert.doesNotMatch(JSON.stringify(m), /[—–]/, `${m.slug} must contain zero em or en dashes`);

    // Strict preflop equity math locks: within 0.05% tolerance
    const outcomeSum = m.winA + m.winB + m.tie;
    const equitySum = m.equityA + m.equityB;
    assert.ok(
      Math.abs(outcomeSum - 100) <= 0.05,
      `${m.slug} winA+winB+tie=${outcomeSum.toFixed(2)} must equal 100.00 (+/- 0.05)`,
    );
    assert.ok(
      Math.abs(equitySum - 100) <= 0.05,
      `${m.slug} equityA+equityB=${equitySum.toFixed(2)} must equal 100.00 (+/- 0.05)`,
    );
    assert.ok(
      Math.abs(m.winA + m.tie / 2 - m.equityA) <= 0.05,
      `${m.slug} equityA (${m.equityA}) must equal winA + tie/2`,
    );
    assert.ok(
      Math.abs(m.winB + m.tie / 2 - m.equityB) <= 0.05,
      `${m.slug} equityB (${m.equityB}) must equal winB + tie/2`,
    );

    assert.ok(m.faqs.length >= 3, `${m.slug} must have >= 3 FAQs`);
    assert.ok(m.flopHitNotes.length >= 3, `${m.slug} must have >= 3 flop hit notes`);
    assert.ok(m.strategicTakeaways.length >= 3, `${m.slug} must have >= 3 strategic takeaways`);
    assert.match(
      m.calculatorUrl,
      /^\/tools\/poker-odds-calculator\?game=(nlhe|plo4|plo5)&h0=/,
      `${m.slug} calculatorUrl must target nlhe, plo4, or plo5 with preloaded cards`,
    );

    for (const rel of m.relatedSlugs) {
      assert.ok(getToolHandMatchup(rel), `${m.slug} related slug "${rel}" must resolve`);
      assert.notEqual(rel, m.slug, `${m.slug} must not self-link`);
    }

    gamesSeen.add(m.game);
  }

  assert.ok(gamesSeen.has('nlhe'), 'Must include NLHE matchups');
  assert.ok(gamesSeen.has('plo4'), 'Must include PLO4 matchups');
  assert.ok(gamesSeen.has('plo5'), 'Must include PLO5 matchups');
  for (const ploSlug of REQUIRED_PLO_MATCHUPS) {
    assert.ok(getToolHandMatchup(ploSlug), `Required PLO matchup "${ploSlug}" must exist`);
  }
});

test('OTC TIER 2 LAW 3 — pages/sitemap-tools.xml.js registers /tools/gto-leak-finder and all 60 /tools/odds/<slug> URLs without duplicates', () => {
  const xml = generateSitemapXml(TOOLS_SITEMAP_URLS);

  assert.ok(
    xml.includes('<loc>https://smarter.poker/tools/gto-leak-finder</loc>'),
    'sitemap-tools.xml must register https://smarter.poker/tools/gto-leak-finder',
  );

  for (const matchup of TOOL_HAND_MATCHUPS) {
    assert.ok(
      xml.includes(`<loc>https://smarter.poker/tools/odds/${matchup.slug}</loc>`),
      `sitemap-tools.xml must include /tools/odds/${matchup.slug}`,
    );
  }

  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.equal(
    new Set(locs).size,
    locs.length,
    'sitemap-tools.xml must not emit duplicate <loc> URLs',
  );
});

test('OTC TIER 2 LAW 4 — public/llms-full.txt registers all 5 BOFU switcher pages and /tools/gto-leak-finder in full parity', () => {
  const llmsFull = read('public/llms-full.txt');

  for (const slug of BOFU_SWITCHER_SLUGS) {
    assert.ok(
      llmsFull.includes(`https://smarter.poker/compare/${slug}`),
      `public/llms-full.txt must reference https://smarter.poker/compare/${slug}`,
    );
    assert.ok(
      llmsFull.includes(`https://smarter.poker/compare/${slug}.md`),
      `public/llms-full.txt must reference https://smarter.poker/compare/${slug}.md`,
    );
  }

  assert.ok(
    llmsFull.includes('https://smarter.poker/tools/gto-leak-finder'),
    'public/llms-full.txt must reference https://smarter.poker/tools/gto-leak-finder',
  );

  const { inSync } = syncLlmsFull({ write: false });
  assert.ok(inSync, 'public/llms-full.txt must remain in 100% sync with scripts/generate-llms-full.mjs');
});
