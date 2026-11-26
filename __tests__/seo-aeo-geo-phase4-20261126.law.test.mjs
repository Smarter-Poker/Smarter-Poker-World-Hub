/**
 * SEO, AEO & GEO PHASE 4 HARDENING LAWS (2026-11-26)
 *
 * Permanently locks in all Phase 4 programmatic scale, internal-link mesh,
 * and AI discovery upgrades:
 *   1. US_POKER_STATES covers all 50 US states plus Washington, D.C. (51 jurisdictions)
 *      with unique slugs, 2-letter postal codes, complete tax/legality/rake/FAQ data,
 *      zero em dashes, and 2-letter alias resolution.
 *   2. /poker-rooms/states/[state] permanently redirects 2-letter postal aliases
 *      (e.g. /poker-rooms/states/ga -> /poker-rooms/states/georgia) and renders
 *      a contextual internal-link mesh to state rooms, home games, tax calculator,
 *      and weekend tournaments.
 *   3. /hub/article renders an SSR contextual internal-link mesh connecting news
 *      stories to poker series, tours, venues, 50-state directory, and calculators.
 *   4. /api/ai/crawler-status dynamically reports US_POKER_STATES.length (51) and
 *      lists /sitemap-news.xml in discovery_manifests; MCP, corpus, dataset catalog,
 *      and llms-full.txt stay synchronized on 51 US jurisdictions.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { US_POKER_STATES, getStateGuideBySlug, stateGuidePath } from '../src/content/guides/states.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const ALL_51_CODES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL',
  'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME',
  'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH',
  'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI',
  'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
];

test('1. US_POKER_STATES covers all 50 US states + DC (51 jurisdictions) with zero em dashes and full alias coverage', () => {
  assert.equal(US_POKER_STATES.length, 51, 'must cover all 50 US states plus Washington, D.C.');
  const codes = new Set(US_POKER_STATES.map((s) => s.code));
  const slugs = new Set(US_POKER_STATES.map((s) => s.slug));
  assert.equal(codes.size, 51, 'all 51 jurisdiction codes must be unique');
  assert.equal(slugs.size, 51, 'all 51 jurisdiction slugs must be unique');

  for (const code of ALL_51_CODES) {
    assert.ok(codes.has(code), `missing state code: ${code}`);
    const resolved = getStateGuideBySlug(code.toLowerCase());
    assert.ok(resolved && resolved.code === code, `2-letter alias ${code.toLowerCase()} must resolve`);
    assert.ok(resolved.title && resolved.h1 && resolved.summary, `${code} must have title, h1, summary`);
    assert.ok(resolved.legalStatus && resolved.minAge && resolved.stateIncomeTaxRate, `${code} must have legality/age/tax`);
    assert.ok(Array.isArray(resolved.faqs) && resolved.faqs.length >= 2, `${code} must have at least 2 FAQs`);
    assert.ok(stateGuidePath(resolved.slug).startsWith('/poker-rooms/states/'));
  }

  const rawStates = read('src/content/guides/states.js');
  assert.ok(!rawStates.includes('—'), 'states.js must contain zero em dashes');
});

test('2. /poker-rooms/states/[state] redirects 2-letter aliases permanently and renders state internal-link mesh', () => {
  const detailSrc = read('pages/poker-rooms/states/[state].js');
  assert.match(detailSrc, /String\(params\.state\)\.trim\(\)\.toLowerCase\(\) !== stateGuide\.slug/);
  assert.match(detailSrc, /destination: stateGuidePath\(stateGuide\.slug\),\s*permanent: true/);
  assert.ok(detailSrc.includes('/hub/poker-near-me/in/${stateGuide.code.toLowerCase()}'));
  assert.ok(detailSrc.includes('/hub/home-games/in/${stateGuide.code.toLowerCase()}'));
  assert.ok(detailSrc.includes('/tools/poker-tax-calculator'));
});

test('3. /hub/article renders contextual internal-link mesh to series, tours, rooms, state directory, and calculators', () => {
  const src = read('pages/hub/article.js');
  for (const href of [
    '/hub/poker-series',
    '/hub/poker-tours',
    '/hub/poker-near-me/lobby',
    '/poker-rooms/states',
    '/tools/icm-calculator',
    '/tools/poker-odds-calculator',
  ]) {
    assert.ok(src.includes(`href="${href}"`), `pages/hub/article.js must link to ${href}`);
  }
});

test('4. AI crawler status, MCP, dataset catalog, and llms-full.txt stay synchronized on 51 US jurisdictions and /sitemap-news.xml', () => {
  const crawlerSrc = read('pages/api/ai/crawler-status.js');
  assert.match(crawlerSrc, /us_state_poker_guides:\s*US_POKER_STATES\.length/);
  assert.match(crawlerSrc, /sitemap_news_xml:\s*`\$\{SITE\}\/sitemap-news\.xml`/);
  assert.match(read('src/lib/mcp/mcpServer.mjs'), /us_state_poker_guides:\s*51/);
  assert.ok(read('public/llms-full.txt').includes('https://smarter.poker/sitemap-news.xml'));
  const indexSrc = read('pages/poker-rooms/states/index.js');
  const descMatch = indexSrc.match(/<SEOHead[\s\S]*?description="([^"]+)"/);
  assert.ok(descMatch && descMatch[1].length <= 160, `states index description must be <= 160 chars (got ${descMatch?.[1]?.length})`);
});
