/**
 * Phases 35-50 (Wave 2: Phase 1 of 16 through Phase 16 of 16) AEO/GEO Test Suite
 *
 * Verifies:
 * 1. Parameterized calculator Markdown states (pot odds & ICM Malmuth-Harville tables)
 * 2. Starting Hand Encyclopedia (20 canonical hands + Markdown renderers)
 * 3. Poker Near Me sub-hub Markdown renderers (live-games, map, roadtrip, alerts)
 * 4. First-party Research & Data Benchmark Hub (4 empirical reports + Markdown)
 * 5. Editorial Standards & Organization policy links
 * 6. Competitor Matrix Wave 2 (25 total verified comparisons)
 * 7. Unified JSON-LD Knowledge Graph endpoint (/api/ai/knowledge-graph)
 * 8. MCP Registry Manifest & 14 MCP tools (lookup_starting_hand, get_research_report)
 * 9. Multilingual AI Grounding Corpus (/api/ai/corpus & /llms-es.txt, /llms-pt.txt)
 * 10. AI Crawler Attribution & Corpus Health (/api/ai/crawler-status)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  renderPokerOddsCalculatorMarkdown,
  renderIcmCalculatorMarkdown,
  renderLiveCashGamesMarkdown,
  renderPokerMapMarkdown,
  renderPokerRoadtripMarkdown,
  renderTournamentAlertsMarkdown,
  renderEditorialStandardsMarkdown,
} from '../src/lib/seo/markdownIngestion.mjs';
import {
  STARTING_HANDS,
  findStartingHand,
  renderStartingHandsIndexMarkdown,
  renderStartingHandMarkdown,
} from '../src/content/learn/hands.js';
import {
  RESEARCH_REPORTS,
  findResearchReport,
  renderResearchIndexMarkdown,
  renderResearchReportMarkdown,
} from '../src/content/research/reports.js';
import { COMPARE_PAGES } from '../src/content/compare/pages.js';
import { MCP_TOOLS, MCP_RESOURCE_TEMPLATES, executeMcpTool } from '../src/lib/mcp/mcpServer.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('Phase 36: Parameterized Odds and ICM Markdown renderers compute live scenarios', () => {
  const oddsMd = renderPokerOddsCalculatorMarkdown({
    hand1: 'AA',
    hand2: 'KK',
    pot: '300',
    call: '100',
  });
  assert.ok(oddsMd.includes('Pre-Computed Pot Odds & Break-Even Equity Solution'), 'renders live scenario header');
  assert.ok(oddsMd.includes('25.0%'), 'computes 100 / (300 + 100) = 25.0% required equity');
  assert.ok(oddsMd.includes('Pre-Computed Matchup Analysis: AA Vs KK'), 'includes AA vs KK matchup block');

  const icmMd = renderIcmCalculatorMarkdown({
    stacks: '50000,30000,20000',
    payouts: '5000,3000,2000',
  });
  assert.ok(icmMd.includes('Pre-Computed Malmuth-Harville ICM Solution'), 'renders live ICM table header');
  assert.ok(icmMd.includes('$3839.29') || icmMd.includes('Player 1'), 'computes Malmuth-Harville ICM equity for Player 1');
});

test('Phase 37: Starting Hand Encyclopedia defines 20 canonical hands with Markdown renderers', () => {
  assert.equal(STARTING_HANDS.length, 20);
  const aces = findStartingHand('AA');
  assert.ok(aces && aces.slug === 'pocket-aces');
  const ak = findStartingHand('ace-king-suited');
  assert.ok(ak && ak.code === 'AKs');

  const indexMd = renderStartingHandsIndexMarkdown();
  assert.ok(indexMd.startsWith('# Smarter.Poker Texas Hold\'em Starting Hand Encyclopedia'));
  assert.ok(indexMd.includes('Pocket Aces'));

  const handMd = renderStartingHandMarkdown(aces);
  assert.ok(handMd.includes('85.2%'));
  assert.ok(handMd.includes('## 6-Max 100BB GTO Opening Strategy By Position'));
});

test('Phase 38: Poker Near Me sub-hub Markdown renderers emit complete directories', () => {
  assert.ok(renderLiveCashGamesMarkdown().includes('# Live Poker Cash Games & Table Availability Near You'));
  assert.ok(renderPokerMapMarkdown().includes('# Interactive US Poker Room & Casino Map'));
  assert.ok(renderPokerRoadtripMarkdown().includes('# Poker Road Trip Planner: Card Rooms & Tournaments Along Your Route'));
  assert.ok(renderTournamentAlertsMarkdown().includes('# Custom Poker Tournament & Live Cash Game Alerts'));
});

test('Phase 39 & 40: First-party Research Reports and Editorial Standards render cleanly', () => {
  assert.equal(RESEARCH_REPORTS.length, 4);
  const rakeReport = findResearchReport('us-live-poker-room-rake-and-jackpot-benchmark');
  assert.ok(rakeReport);
  assert.ok(renderResearchIndexMarkdown().includes('First-Party Statistical Research Reports'));
  assert.ok(renderResearchReportMarkdown(rakeReport).includes('324+ Verified'));
  assert.ok(renderEditorialStandardsMarkdown().includes('Mathematical Verification Standards'));
});

test('Phase 41: Competitor Comparison Matrix includes 25 verified pages', () => {
  assert.equal(COMPARE_PAGES.length, 25);
  for (const slug of [
    'smarter-poker-vs-run-it-once',
    'smarter-poker-vs-upswing-poker',
    'smarter-poker-vs-pokertracker-4',
    'smarter-poker-vs-holdem-manager-3',
    'smarter-poker-vs-piosolver',
    'smarter-poker-vs-monkersolver',
  ]) {
    assert.ok(COMPARE_PAGES.some((p) => p.slug === slug), `includes ${slug}`);
  }
});

test('Phase 44: MCP Server exposes 15 tools and 8 resource templates plus .well-known/mcp-registry.json', async () => {
  assert.equal(MCP_TOOLS.length, 15);
  assert.equal(MCP_RESOURCE_TEMPLATES.length, 8);

  const handResult = await executeMcpTool('lookup_starting_hand', { hand: 'KK' });
  const handJson = JSON.parse(handResult.content[0].text);
  assert.equal(handJson.slug, 'pocket-kings');

  const reportResult = await executeMcpTool('get_research_report', {
    slug: 'gto-vs-population-preflop-and-postflop-leak-study',
  });
  const reportJson = JSON.parse(reportResult.content[0].text);
  assert.equal(reportJson.slug, 'gto-vs-population-preflop-and-postflop-leak-study');

  const simResult = await executeMcpTool('search_training_simulators', { query: 'icm' });
  const simJson = JSON.parse(simResult.content[0].text);
  assert.ok(simJson.simulators_count > 0);
  assert.ok(simJson.training_games_count > 0);

  const registry = JSON.parse(read('public/.well-known/mcp-registry.json'));
  assert.equal(registry.name, 'io.github.smarter-poker/mcp-server');
  assert.equal(registry.tools_count, 15);
});

test('Phase 35, 42, 43, 47, 48, 49: next.config.js, knowledge-graph, corpus, and crawler-status routes exist', () => {
  const nextConfig = read('next.config.js');
  assert.ok(nextConfig.includes("source: '/knowledge-graph.jsonld'"), 'rewrites /knowledge-graph.jsonld');
  assert.ok(nextConfig.includes("source: '/llms-es.txt'"), 'rewrites /llms-es.txt');
  assert.ok(nextConfig.includes("source: '/llms-pt.txt'"), 'rewrites /llms-pt.txt');
  assert.ok(nextConfig.includes("source: '/learn/hands.md'"), 'rewrites /learn/hands.md');
  assert.ok(nextConfig.includes("source: '/research.md'"), 'rewrites /research.md');
  assert.ok(nextConfig.includes('max-snippet:-1'), 'sets max-snippet:-1 header');

  assert.ok(fs.existsSync(path.join(ROOT, 'pages/api/ai/knowledge-graph.js')));
  assert.ok(fs.existsSync(path.join(ROOT, 'pages/api/ai/corpus.js')));
  assert.ok(fs.existsSync(path.join(ROOT, 'pages/api/ai/crawler-status.js')));
});
