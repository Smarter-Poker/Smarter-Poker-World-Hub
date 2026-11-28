/**
 * OTC TIER 8: PUBLIC HAND-PASTE GTO TEASER & INTERNAL LINK EQUITY MESH LAW SUITE (2026-11-28)
 * ===========================================================================================
 * Permanent regression locks for:
 *   1. `parseQuickHandTeaser` deterministic parsing across PokerStars, GGPoker,
 *      casual live-hand notes, preflop-only spots, and empty/malformed inputs
 *      (honest SPR computation, zero fabricated solver numbers, zero throws).
 *   2. `SmarterHandPasteTeaser` #SMARTERDESIGN surface, touch targets, SSR markup,
 *      `sp:seo-tool-engaged` dispatch, `sp_saved_spots_v1` (`kind: 'hand-review'`)
 *      persistence + cap + `sanitizeGuestSpots` compatibility, and 1-tap CTA wired
 *      to `openQuickSignup` + canonical F1 event `seo_calculator_save_bar_click`.
 *   3. `resolveCompareLinkMesh` & `resolveMatchupLinkMesh` deterministic routing
 *      where EVERY returned route is proven to exist on disk.
 *   4. Clean mounting on `pages/compare/[slug].js` and `pages/tools/odds/[matchup].js`
 *      preserving all existing SEO, JSON-LD, tables, FAQs, save bar, backlink box,
 *      AI prompt launcher, and single unlock gate, plus strict copy/design hygiene.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { COMPARE_PAGES } from '../src/content/compare/pages.js';
import { TOOL_HAND_MATCHUPS } from '../src/content/tools/handMatchups.js';
import {
  VERIFIED_MESH_STATIC_ROUTES,
  resolveCompareLinkMesh,
  resolveMatchupLinkMesh,
} from '../src/lib/seo/internalLinkMesh.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const require = createRequire(import.meta.url);
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const BANNED_GOLD_RE = /#(f59e0b|eab308|fbbf24|d97706|ffd700|facc15|d4af37|d4a853|f2b84b)\b/i;
const VALID_PREFLOP_POSITIONS = new Set(['utg', 'mp', 'hj', 'co', 'btn', 'sb']);
const VALID_MATCHUP_SLUGS = new Set(TOOL_HAND_MATCHUPS.map((m) => m.slug));

function loadJsxModule(relPath, extraRequires = {}) {
  const src = read(relPath);
  const compiled = ts.transpileModule(src, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: path.basename(relPath),
  }).outputText;

  const mod = { exports: {} };
  const localRequire = (name) => {
    if (name in extraRequires) return extraRequires[name];
    if (name === 'react' || name === 'react/jsx-runtime') return require(name);
    if (name.endsWith('.module.css')) return { __esModule: true, default: {} };
    return {};
  };
  new Function('require', 'module', 'exports', compiled)(localRequire, mod, mod.exports);
  return mod.exports;
}

function routeExistsOnDisk(href) {
  const clean = String(href || '').split('?')[0].split('#')[0].replace(/\/+$/, '');
  if (!clean.startsWith('/')) return false;

  // Dynamic route: /tools/preflop-ranges/[position]
  const preflopMatch = clean.match(/^\/tools\/preflop-ranges\/([a-z0-9-]+)$/i);
  if (preflopMatch) {
    return (
      VALID_PREFLOP_POSITIONS.has(preflopMatch[1].toLowerCase()) &&
      fs.existsSync(path.join(ROOT, 'pages/tools/preflop-ranges/[position].js'))
    );
  }

  // Dynamic route: /tools/odds/[matchup]
  const oddsMatch = clean.match(/^\/tools\/odds\/([a-z0-9-]+)$/i);
  if (oddsMatch) {
    return (
      VALID_MATCHUP_SLUGS.has(oddsMatch[1]) &&
      fs.existsSync(path.join(ROOT, 'pages/tools/odds/[matchup].js'))
    );
  }

  const directCandidates = [
    path.join(ROOT, `pages${clean}.js`),
    path.join(ROOT, `pages${clean}.jsx`),
    path.join(ROOT, `pages${clean}/index.js`),
    path.join(ROOT, `pages${clean}/index.jsx`),
  ];
  return directCandidates.some((candidate) => fs.existsSync(candidate));
}

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

const teaserMod = loadJsxModule('src/components/seo/SmarterHandPasteTeaser.jsx', {
  './SmarterQuickSignupSheet': { openQuickSignup: () => true },
  '../../lib/seo/seoFunnelTelemetry': { trackSeoFunnelEvent: () => {} },
});

const welcomeBannerMod = loadJsxModule('src/components/seo/SmarterUnlockedWelcomeBanner.jsx', {
  'next/link': { __esModule: true, default: () => null },
  'next/router': { useRouter: () => ({ asPath: '/tools', query: {} }) },
  '../../lib/seo/seoFunnelTelemetry': { trackSeoFunnelEvent: () => {} },
});

test('OTC TIER 8 LAW 1: parseQuickHandTeaser parses PokerStars, GGPoker, live notes, and malformed text safely with honest SPR and zero fabricated solver numbers', () => {
  const { parseQuickHandTeaser, SAMPLE_HAND_TEXT } = teaserMod;
  assert.equal(typeof parseQuickHandTeaser, 'function', 'parseQuickHandTeaser must be exported');

  // 1. PokerStars hand history
  const psInput = [
    "PokerStars Hand #249108412: Hold'em No Limit ($1/$2 USD)",
    'Seat 6: Hero ($200 in chips) (button)',
    'Dealt to Hero [As Qd]',
    '*** FLOP *** [Qs 9h 4d]',
    'Total pot $40',
  ].join('\n');
  const ps = parseQuickHandTeaser(psInput);
  assert.equal(ps.valid, true);
  assert.deepEqual(ps.heroCards, ['As', 'Qd']);
  assert.deepEqual(ps.boardCards, ['Qs', '9h', '4d']);
  assert.equal(ps.position, 'BTN');
  assert.equal(ps.street, 'Flop');
  assert.equal(ps.potSize, 40);
  assert.equal(ps.stackSize, 200);
  assert.equal(ps.spr, 5);
  assert.ok(ps.baselineHeadline.length > 10);
  assert.ok(ps.baselineGuidance.length > 20);
  assert.doesNotMatch(`${ps.baselineHeadline} ${ps.baselineGuidance}`, /\d+(?:\.\d+)?%/, 'must not fabricate solver percentages');

  // 2. GGPoker turn hand history
  const ggInput = [
    "Poker Hand #HD881122: Hold'em No Limit ($2/$5)",
    'Seat 1: Hero ($500 in chips) (small blind)',
    'Dealt to Hero [Ah Kh]',
    '*** TURN *** [Kd 7c 2s] [9h]',
    'Pot: $100',
  ].join('\n');
  const gg = parseQuickHandTeaser(ggInput);
  assert.equal(gg.valid, true);
  assert.deepEqual(gg.heroCards, ['Ah', 'Kh']);
  assert.deepEqual(gg.boardCards, ['Kd', '7c', '2s', '9h']);
  assert.equal(gg.position, 'SB');
  assert.equal(gg.street, 'Turn');
  assert.equal(gg.potSize, 100);
  assert.equal(gg.stackSize, 500);
  assert.equal(gg.spr, 5);

  // 3. Casual live-hand note with mismatched units (BB stack vs $ pot, no blinds) -> honest spr: null
  const liveMixed = parseQuickHandTeaser('Hero dealt Ah Kh on BTN, 100BB, flop Kd 7c 2s, pot $45');
  assert.equal(liveMixed.valid, true);
  assert.deepEqual(liveMixed.heroCards, ['Ah', 'Kh']);
  assert.deepEqual(liveMixed.boardCards, ['Kd', '7c', '2s']);
  assert.equal(liveMixed.position, 'BTN');
  assert.equal(liveMixed.street, 'Flop');
  assert.equal(liveMixed.potSize, 45);
  assert.equal(liveMixed.stackSize, 100);
  assert.equal(liveMixed.spr, null, 'mismatched BB stack and USD pot without blinds must return spr: null honestly');

  // 4. Casual live-hand note with matching BB units -> honest SPR computed
  const liveBb = parseQuickHandTeaser('Hero dealt Ah Kh on BTN, 100BB, flop Kd 7c 2s, pot 15BB');
  assert.equal(liveBb.valid, true);
  assert.equal(liveBb.potSize, 15);
  assert.equal(liveBb.stackSize, 100);
  assert.equal(liveBb.spr, 6.67);

  // 5. Built-in sample hand parses cleanly with SPR computed
  const sample = parseQuickHandTeaser(SAMPLE_HAND_TEXT);
  assert.equal(sample.valid, true);
  assert.deepEqual(sample.heroCards, ['Ah', 'Kh']);
  assert.deepEqual(sample.boardCards, ['Kd', '7c', '2s']);
  assert.equal(sample.position, 'BTN');
  assert.equal(sample.street, 'Flop');
  assert.equal(sample.spr, 4.44);

  // 6. Preflop-only note
  const pre = parseQuickHandTeaser('CO dealt Js Jd, 50BB effective');
  assert.equal(pre.valid, true);
  assert.deepEqual(pre.heroCards, ['Js', 'Jd']);
  assert.deepEqual(pre.boardCards, []);
  assert.equal(pre.position, 'CO');
  assert.equal(pre.street, 'Preflop');
  assert.equal(pre.spr, null);

  // 7. Empty / malformed / non-string inputs safely return valid: false without throwing
  for (const bad of ['', '   ', null, undefined, 12345, {}, 'Just some random poker thoughts with no cards']) {
    const res = parseQuickHandTeaser(bad);
    assert.equal(res.valid, false, `malformed input ${JSON.stringify(bad)} must return valid: false`);
    assert.deepEqual(res.heroCards, []);
    assert.equal(res.spr, null);
  }
});

test('OTC TIER 8 LAW 2: SmarterHandPasteTeaser persists hand-review spots cleanly, renders required testids, and wires canonical F1 telemetry + quick signup', () => {
  const { default: SmarterHandPasteTeaser, parseQuickHandTeaser, persistHandPasteSpot, SAMPLE_HAND_TEXT } = teaserMod;
  const { sanitizeGuestSpots } = welcomeBannerMod;

  const store = createMemoryStorage();
  const parsed = parseQuickHandTeaser(SAMPLE_HAND_TEXT);
  const saved = persistHandPasteSpot(parsed, { redirectPath: '/compare/smarter-poker-vs-gto-wizard', storage: store });

  assert.ok(saved, 'valid parsed hand must persist');
  assert.equal(saved.kind, 'hand-review');
  assert.equal(saved.toolSlug, 'hand-paste-teaser');
  assert.equal(saved.path, '/compare/smarter-poker-vs-gto-wizard');

  const rawList = JSON.parse(store.getItem('sp_saved_spots_v1'));
  assert.equal(rawList.length, 1);
  const sanitized = sanitizeGuestSpots(rawList);
  assert.equal(sanitized.length, 1);
  assert.equal(sanitized[0].kind, 'hand-review', 'sanitizeGuestSpots must preserve hand-review kind');

  // Verify cap at 25 spots
  const preseeded = Array.from({ length: 28 }, (_, i) => ({
    id: `existing-${i}`,
    kind: 'hand-review',
    toolSlug: 'hand-paste-teaser',
    toolName: 'Instant Free Street-1 GTO Check',
    summaryText: `Spot ${i}`,
    url: '/tools',
    savedAt: '2026-11-28T00:00:00Z',
  }));
  store.setItem('sp_saved_spots_v1', JSON.stringify(preseeded));
  persistHandPasteSpot(parsed, { redirectPath: '/tools/odds/aa-vs-kk', storage: store });
  const capped = JSON.parse(store.getItem('sp_saved_spots_v1'));
  assert.equal(capped.length, 25, 'sp_saved_spots_v1 must remain capped at 25');
  assert.equal(capped[0].kind, 'hand-review');

  // SSR render check
  const html = renderToStaticMarkup(
    React.createElement(SmarterHandPasteTeaser, {
      context: 'compare-smarter-poker-vs-gto-wizard',
      redirectPath: '/compare/smarter-poker-vs-gto-wizard',
    }),
  );
  assert.ok(html.includes('data-testid="hand-paste-bofu-teaser"'), 'must render root teaser testid');
  assert.ok(html.includes('data-testid="hand-paste-sample-btn"'), 'must render sample pill testid');
  assert.ok(html.includes('data-testid="hand-paste-analyze-btn"'), 'must render analyze button testid');
  assert.ok(html.includes('Load Sample Hand'));
  assert.ok(html.includes('Run Free Street-1 GTO Check'));

  // Source wiring locks
  const src = read('src/components/seo/SmarterHandPasteTeaser.jsx');
  assert.ok(src.includes('data-testid="hand-paste-result"'), 'must render result block testid');
  assert.ok(src.includes('data-testid="hand-paste-unlock-cta"'), 'must render unlock CTA testid');
  assert.ok(src.includes('Unlock Full Multi-Street GTO Breakdown Free'), 'must include unlock CTA copy');
  assert.ok(src.includes("new CustomEvent('sp:seo-tool-engaged'"), 'must dispatch sp:seo-tool-engaged');
  assert.ok(src.includes("kind: 'hand-review'"), 'must save spot with kind hand-review');
  assert.ok(src.includes("unlockKey: 'solver-matrix'"), 'must wire openQuickSignup unlockKey solver-matrix');
  assert.ok(src.includes("source: 'hand-paste-teaser'"), 'must wire openQuickSignup source hand-paste-teaser');
  assert.ok(
    src.includes("trackSeoFunnelEvent('seo_calculator_save_bar_click'"),
    'must emit canonical F1 event seo_calculator_save_bar_click',
  );
  assert.ok(src.includes("toolSlug: 'hand-paste-teaser'"), 'must pass toolSlug hand-paste-teaser');
  assert.ok(src.includes('#0b1120') && src.includes('1px solid #1e3a5f') && src.includes('borderRadius: 0'), 'must enforce #SMARTERDESIGN tokens');
  assert.ok(src.includes('minHeight: 44'), 'must enforce >=44px touch targets');
});

test('OTC TIER 8 LAW 3: resolveCompareLinkMesh returns 3 verified on-disk internal links for every /compare/[slug] page', () => {
  const exactExpected = [
    ['smarter-poker-vs-icmizer', '/tools/icm-calculator'],
    ['smarter-poker-vs-flopzilla', '/tools/poker-odds-calculator'],
    ['smarter-poker-vs-gto-wizard', '/tools/preflop-ranges/btn'],
    ['smarter-poker-vs-piosolver', '/tools/preflop-ranges/btn'],
    ['smarter-poker-vs-pokercode', '/tools/preflop-ranges/btn'],
    ['smarter-poker-vs-pokeratlas', '/hub/poker-near-me'],
    ['smarter-poker-vs-bravo-poker-live', '/hub/poker-near-me'],
    ['smarter-poker-vs-hendon-mob', '/hub/poker-near-me'],
    ['smarter-poker-vs-poker-bankroll-tracker', '/tools/bankroll-calculator'],
  ];

  for (const [slug, expectedPrimary] of exactExpected) {
    const links = resolveCompareLinkMesh(slug);
    assert.equal(links.length, 3, `${slug} must resolve 3 links`);
    assert.equal(links[0].href, expectedPrimary, `${slug} primary calculator must be ${expectedPrimary}`);
    assert.equal(links[1].href, '/tools/gto-leak-finder');
    assert.equal(links[2].href, '/hub/training');
  }

  for (const route of VERIFIED_MESH_STATIC_ROUTES) {
    assert.equal(routeExistsOnDisk(route), true, `static mesh route ${route} must exist on disk`);
  }

  // Every single COMPARE_PAGES slug must resolve 3 distinct, on-disk routes deterministically
  for (const page of COMPARE_PAGES) {
    const first = resolveCompareLinkMesh(page.slug);
    const second = resolveCompareLinkMesh(page.slug);
    assert.deepEqual(first, second, `resolveCompareLinkMesh must be deterministic for ${page.slug}`);
    assert.equal(first.length, 3, `${page.slug} must return exactly 3 links`);
    const hrefs = first.map((item) => item.href);
    assert.equal(new Set(hrefs).size, 3, `${page.slug} link mesh must have zero duplicate routes`);
    for (const href of hrefs) {
      assert.equal(routeExistsOnDisk(href), true, `${page.slug} resolved route ${href} must exist on disk`);
    }
  }
});

test('OTC TIER 8 LAW 4: resolveMatchupLinkMesh returns preflop range, leak finder, and up to 4 deterministic on-disk sibling matchups for every /tools/odds/[matchup] page', () => {
  const reversed = [...TOOL_HAND_MATCHUPS].reverse();

  for (const matchup of TOOL_HAND_MATCHUPS) {
    const meshA = resolveMatchupLinkMesh(matchup, TOOL_HAND_MATCHUPS);
    const meshB = resolveMatchupLinkMesh(matchup, reversed);

    assert.deepEqual(meshA, meshB, `resolveMatchupLinkMesh must be deterministic regardless of input order for ${matchup.slug}`);
    assert.equal(meshA.toolLinks.length, 2, `${matchup.slug} must include 2 core tool links`);
    assert.ok(
      meshA.toolLinks[0].href === '/tools/preflop-ranges/btn' ||
        meshA.toolLinks[0].href === '/tools/preflop-ranges/co',
      `${matchup.slug} must link to /tools/preflop-ranges/btn or /tools/preflop-ranges/co`,
    );
    assert.equal(meshA.toolLinks[1].href, '/tools/gto-leak-finder');
    assert.ok(
      meshA.siblingLinks.length >= 1 && meshA.siblingLinks.length <= 4,
      `${matchup.slug} must return 1..4 sibling matchups (got ${meshA.siblingLinks.length})`,
    );

    const selfHref = `/tools/odds/${matchup.slug}`;
    const allHrefs = meshA.links.map((item) => item.href);
    assert.equal(new Set(allHrefs).size, allHrefs.length, `${matchup.slug} mesh must have zero duplicates`);
    assert.ok(!allHrefs.includes(selfHref), `${matchup.slug} must never link to itself`);

    for (const sib of meshA.siblingLinks) {
      assert.match(sib.href, /^\/tools\/odds\/[a-z0-9-]+$/);
      const target = TOOL_HAND_MATCHUPS.find((m) => m.slug === sib.slug);
      assert.ok(target, `${matchup.slug} sibling ${sib.slug} must exist in TOOL_HAND_MATCHUPS`);
      assert.equal(target.game, matchup.game, `${matchup.slug} sibling ${sib.slug} must match game ${matchup.game}`);
    }

    for (const href of allHrefs) {
      assert.equal(routeExistsOnDisk(href), true, `${matchup.slug} mesh route ${href} must exist on disk`);
    }
  }
});

test('OTC TIER 8 LAW 5: pages/compare/[slug].js and pages/tools/odds/[matchup].js mount teaser & link mesh cleanly while preserving all SEO/schema/gate invariants and strict hygiene', () => {
  const compareSrc = read('pages/compare/[slug].js');
  const oddsSrc = read('pages/tools/odds/[matchup].js');
  const teaserSrc = read('src/components/seo/SmarterHandPasteTeaser.jsx');
  const meshSrc = read('src/lib/seo/internalLinkMesh.mjs');

  // Compare page mount & preservation
  assert.ok(compareSrc.includes('<SmarterHandPasteTeaser'), 'pages/compare/[slug].js must mount SmarterHandPasteTeaser');
  assert.ok(compareSrc.includes('data-testid="internal-link-mesh"'), 'pages/compare/[slug].js must mount internal-link-mesh');
  assert.ok(compareSrc.includes('resolveCompareLinkMesh(page.slug)'), 'pages/compare/[slug].js must call resolveCompareLinkMesh');
  assert.ok(compareSrc.includes('<SEOHead') && compareSrc.includes('compareJsonLd(page)'), 'compare page preserves SEOHead & JSON-LD');
  assert.ok(compareSrc.includes('<table className="cmp-table">') && compareSrc.includes('page.faq'), 'compare page preserves table & FAQs');
  assert.ok(compareSrc.includes('<CitationBacklinkBox') && compareSrc.includes('<AiPromptLauncher'), 'compare page preserves backlink box & AI prompt launcher');
  assert.equal((compareSrc.match(/<SmarterAccountUnlockGate\b/g) || []).length, 1, 'compare page preserves single SmarterAccountUnlockGate');
  assert.doesNotMatch(compareSrc, /<img|<Image/, 'compare page must not add img/Image tags');

  // Odds matchup page mount & preservation
  assert.ok(oddsSrc.includes('<SmarterHandPasteTeaser'), 'pages/tools/odds/[matchup].js must mount SmarterHandPasteTeaser');
  assert.ok(oddsSrc.includes('data-testid="internal-link-mesh"'), 'pages/tools/odds/[matchup].js must mount internal-link-mesh');
  assert.ok(oddsSrc.includes('resolveMatchupLinkMesh(matchup, TOOL_HAND_MATCHUPS)'), 'pages/tools/odds/[matchup].js must call resolveMatchupLinkMesh');
  assert.ok(oddsSrc.includes('<SEOHead') && oddsSrc.includes('hubProductSchema('), 'odds page preserves SEOHead & JSON-LD');
  assert.ok(oddsSrc.includes('<SmarterCalculatorSaveBar') && oddsSrc.includes('<FaqSection'), 'odds page preserves save bar & FAQ section');
  assert.equal((oddsSrc.match(/<SmarterAccountUnlockGate\b/g) || []).length, 1, 'odds page preserves single SmarterAccountUnlockGate');

  // Strict hygiene across all 4 owned source files
  for (const [label, src] of [
    ['src/components/seo/SmarterHandPasteTeaser.jsx', teaserSrc],
    ['src/lib/seo/internalLinkMesh.mjs', meshSrc],
    ['pages/compare/[slug].js', compareSrc],
    ['pages/tools/odds/[matchup].js', oddsSrc],
  ]) {
    assert.doesNotMatch(src, /[—–]/, `${label} must contain zero em or en dashes`);
    assert.doesNotMatch(src, /&apos;/, `${label} must never use &apos; in JSX text`);
    assert.doesNotMatch(src, BANNED_GOLD_RE, `${label} must contain zero banned gold hexes`);
    assert.doesNotMatch(src, /\bVerified\s+(?:Rooms|Venues)\b/i, `${label} must contain zero Verified Rooms/Venues claims`);
  }
});
