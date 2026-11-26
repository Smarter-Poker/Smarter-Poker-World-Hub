/**
 * SEO, AEO & GEO FORENSIC HARDENING LAWS (2026-11-26)
 *
 * Permanently prevents recurrence of the 5 real production defects uncovered
 * during the live forensic audit after Phases 1-4:
 *   1. Zero broken 404 internal links on /poker-rooms/states/[state]:
 *      /hub/poker-near-me/in/<code> links are emitted ONLY for states with active
 *      venues in data/poker-venue-directory-snapshot.json; 0-venue states route
 *      cleanly to /hub/poker-near-me/lobby.
 *   2. Zero hidden FAQPage JSON-LD on /poker-rooms/guides and /facts:
 *      every FAQPage question appears visibly in rendered SSR markup.
 *   3. Zero redirect-hop /hub/poker-near-me internal links on market & state guides.
 *   4. Zero stale "15 US State" count drift across pages, APIs, OpenAPI, and
 *      .well-known AI/MCP manifests after expanding to all 51 US jurisdictions.
 *   5. /sitemap-tournaments.xml is cleanly deduplicated from /sitemap-series.xml
 *      (zero buildPokerEventDetailUrls duplication), and public/robots.txt declares
 *      https://smarter.poker/sitemap-news.xml.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import venueSnapshot from '../data/poker-venue-directory-snapshot.json' with { type: 'json' };
import { US_POKER_STATES } from '../src/content/guides/states.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('1. /poker-rooms/states/[state] gates /hub/poker-near-me/in/<code> on snapshot venue availability (zero 404 internal links)', () => {
  const src = read('pages/poker-rooms/states/[state].js');
  assert.match(src, /poker-venue-directory-snapshot\.json/);
  assert.match(src, /hasLiveStateDirectory/);
  assert.match(src, /const liveRoomsHref = hasLiveStateDirectory\s*\?\s*`\/hub\/poker-near-me\/in\/\$\{stateGuide\.code\.toLowerCase\(\)\}`\s*:\s*'\/hub\/poker-near-me\/lobby'/);
  assert.doesNotMatch(src, /href="\/hub\/poker-near-me"/, 'state detail page must never link to redirecting /hub/poker-near-me');

  // Verify the snapshot actually separates states with venues from 0-venue states (like AK/UT/HI/DC)
  const statesWithVenues = new Set(
    (venueSnapshot?.venues || [])
      .filter((v) => v && !v.is_suppressed && v.state)
      .map((v) => String(v.state).trim().toUpperCase())
  );
  assert.ok(statesWithVenues.has('NV') && statesWithVenues.has('TX') && statesWithVenues.has('CA'));
  assert.equal(statesWithVenues.has('UT'), false, 'UT has 0 catalog venues so must route to /hub/poker-near-me/lobby');
  assert.equal(statesWithVenues.has('HI'), false, 'HI has 0 catalog venues so must route to /hub/poker-near-me/lobby');
  assert.equal(US_POKER_STATES.length, 51);
});

test('2. /poker-rooms/guides and /facts visibly render every FAQPage JSON-LD question and omit redirect hops', () => {
  const guidesSrc = read('pages/poker-rooms/guides/index.js');
  assert.match(guidesSrc, /import FaqSection from '\.\.\/\.\.\/\.\.\/src\/components\/seo\/FaqSection'/);
  assert.match(guidesSrc, /<FaqSection[\s\S]*?DIRECTORY_FAQS\.map/);
  assert.doesNotMatch(guidesSrc, /href="\/hub\/poker-near-me"/, 'guides index must link directly to /hub/poker-near-me/lobby');

  const factsSrc = read('pages/facts.js');
  assert.match(factsSrc, /Clarification On \{item\.topic\}: \{item\.misconception\}/, 'facts page must visibly render the exact FAQPage question text');
});

test('3. Zero stale "15 US State" count drift remains across production pages, APIs, OpenAPI, and .well-known AI manifests', () => {
  const checkedFiles = [
    'pages/api/ai/knowledge-graph.js',
    'pages/api/ai/crawler-status.js',
    'pages/api/ai/corpus.js',
    'pages/api/datasets/catalog.js',
    'pages/api/feeds/research.js',
    'pages/api/hub-tool-markdown.js',
    'pages/api/seo/outreach-generator.js',
    'pages/poker-rooms/index.js',
    'pages/poker-rooms/states/index.js',
    'pages/poker-rooms/states/[state].js',
    'pages/poker-rooms/comps-and-tipping-guide.js',
    'pages/learn/index.js',
    'pages/learn/poker-as-a-business.js',
    'pages/research/annual-state-of-poker-2026.js',
    'pages/search.js',
    'src/content/authors.js',
    'src/lib/mcp/mcpServer.mjs',
    'src/lib/seo/datasetCatalog.mjs',
    'src/lib/seo/markdownIngestion.mjs',
    'public/.well-known/mcp.json',
    'public/.well-known/mcp-registry.json',
    'public/.well-known/ai-plugin.json',
    'public/api/openapi.json',
  ];
  for (const file of checkedFiles) {
    const content = read(file);
    assert.doesNotMatch(content, /\b15\s+US\s+State/i, `${file} still contains stale "15 US State" count`);
  }
});

test('4. /sitemap-tournaments.xml is cleanly deduplicated from /sitemap-series.xml and robots.txt declares /sitemap-news.xml', () => {
  const tournSrc = read('pages/sitemap-tournaments.xml.js');
  assert.doesNotMatch(tournSrc, /buildPokerEventDetailUrls/, 'sitemap-tournaments.xml must not duplicate sitemap-series.xml detail URLs');
  assert.match(tournSrc, /SERIES_GUIDE_PAGES/);
  assert.match(tournSrc, /\/hub\/tournaments\/this-weekend/);
  assert.match(tournSrc, /\/freerolls/);

  const robots = read('public/robots.txt');
  assert.ok(robots.includes('Sitemap: https://smarter.poker/sitemap-news.xml'), 'robots.txt must declare sitemap-news.xml');
});
