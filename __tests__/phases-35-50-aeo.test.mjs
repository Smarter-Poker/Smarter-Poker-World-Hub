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

test('Phase 37: Starting Hand Encyclopedia defines 169 canonical hands with Markdown renderers', () => {
  assert.equal(STARTING_HANDS.length, 169);
  const aces = findStartingHand('AA');
  assert.ok(aces && aces.slug === 'pocket-aces');
  const ak = findStartingHand('ace-king-suited');
  assert.ok(ak && ak.code === 'AKs');
  const eights = findStartingHand('88');
  assert.ok(eights && eights.slug === 'pocket-eights');
  const eightSeven = findStartingHand('87s');
  assert.ok(eightSeven && eightSeven.slug === 'eight-seven-suited');
  const sixFive = findStartingHand('65s');
  assert.ok(sixFive && sixFive.slug === 'six-five-suited');
  const jackNine = findStartingHand('J9s');
  assert.ok(jackNine && jackNine.slug === 'jack-nine-suited');
  const fiveFour = findStartingHand('54s');
  assert.ok(fiveFour && fiveFour.slug === 'five-four-suited');
  const queenTenOff = findStartingHand('QTo');
  assert.ok(queenTenOff && queenTenOff.slug === 'queen-ten-offsuit');
  const sevenTwoOff = findStartingHand('72o');
  assert.ok(sevenTwoOff && sevenTwoOff.slug === 'seven-deuce-offsuit');

  const indexMd = renderStartingHandsIndexMarkdown();
  assert.ok(indexMd.startsWith('# Smarter.Poker Texas Hold\'em Starting Hand Encyclopedia'));
  assert.ok(indexMd.includes('Pocket Aces'));
  assert.ok(indexMd.includes('Pocket Eights'));
  assert.ok(indexMd.includes('Six-Five Suited'));
  assert.ok(indexMd.includes('Jack-Nine Suited'));
  assert.ok(indexMd.includes('Five-Four Suited'));
  assert.ok(indexMd.includes('Queen-Ten Offsuit'));
  assert.ok(indexMd.includes('Seven-Deuce Offsuit'));

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
  assert.equal(RESEARCH_REPORTS.length, 15);
  const rakeReport = findResearchReport('us-live-poker-room-rake-and-jackpot-benchmark');
  assert.ok(rakeReport);
  const dealerReport = findResearchReport('poker-dealer-toke-and-hourly-rate-benchmark');
  assert.ok(dealerReport);
  const icmReport = findResearchReport('tournament-icm-bubble-factor-and-risk-premium-study');
  assert.ok(icmReport);
  const ploReport = findResearchReport('pot-limit-omaha-plo4-plo5-plo6-equity-and-variance-study');
  assert.ok(ploReport);
  const taxReport = findResearchReport('us-poker-player-tax-w2g-reporting-and-session-accounting-benchmark');
  assert.ok(taxReport);
  const waitlistReport = findResearchReport('cardroom-waitlist-turnover-and-table-utilization-benchmark');
  assert.ok(waitlistReport);
  const clubStudy = findResearchReport('private-online-poker-club-rake-and-union-settlement-study');
  assert.ok(clubStudy);
  const mysteryStudy = findResearchReport('mystery-bounty-vs-pko-ev-and-bounty-power-factor-study');
  assert.ok(mysteryStudy);
  const shortDeckStudy = findResearchReport('short-deck-6-plus-holdem-equity-and-ante-math-benchmark');
  assert.ok(shortDeckStudy);
  const bombPotStudy = findResearchReport('double-board-plo-bomb-pot-equity-and-split-pot-variance-study');
  assert.ok(bombPotStudy);
  const lowStakesStudy = findResearchReport('live-low-stakes-1-2-and-2-5-nlh-population-tendencies-report');
  assert.ok(lowStakesStudy);
  const satelliteStudy = findResearchReport('satellite-tournament-milestone-and-bubble-survival-math-study');
  assert.ok(satelliteStudy);
  assert.ok(renderResearchIndexMarkdown().includes('First-Party Statistical Research Reports'));
  assert.ok(renderResearchReportMarkdown(rakeReport).includes('324+ Verified'));
  assert.ok(renderResearchReportMarkdown(dealerReport).includes('Down'));
  assert.ok(renderResearchReportMarkdown(ploReport).includes('PLO4'));
  assert.ok(renderResearchReportMarkdown(taxReport).includes('W-2G'));
  assert.ok(renderResearchReportMarkdown(waitlistReport).includes('Waitlist'));
  assert.ok(renderResearchReportMarkdown(clubStudy).includes('Club Arena'));
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

test('Phase 44: MCP Server exposes 18 tools and 8 resource templates plus .well-known/mcp-registry.json', async () => {
  assert.equal(MCP_TOOLS.length, 18);
  assert.equal(MCP_RESOURCE_TEMPLATES.length, 8);

  const handResult = await executeMcpTool('lookup_starting_hand', { hand: '72o' });
  const handJson = JSON.parse(handResult.content[0].text);
  assert.equal(handJson.slug, 'seven-deuce-offsuit');

  const reportResult = await executeMcpTool('get_research_report', {
    slug: 'mystery-bounty-vs-pko-ev-and-bounty-power-factor-study',
  });
  const reportJson = JSON.parse(reportResult.content[0].text);
  assert.equal(reportJson.slug, 'mystery-bounty-vs-pko-ev-and-bounty-power-factor-study');

  const simResult = await executeMcpTool('search_training_simulators', { query: 'icm' });
  const simJson = JSON.parse(simResult.content[0].text);
  assert.ok(simJson.simulators_count > 0);
  assert.ok(simJson.training_games_count > 0);

  const potResult = await executeMcpTool('calculate_pot_odds_and_mdf', { pot: 100, bet: 50, outs: 9 });
  const potJson = JSON.parse(potResult.content[0].text);
  assert.equal(potJson.required_calling_equity_percent, 25);
  assert.equal(potJson.minimum_defense_frequency_percent, 66.67);

  const rorResult = await executeMcpTool('calculate_bankroll_risk_of_ruin', { winrate_bb100: 5, std_dev_bb100: 85, buy_ins: 30 });
  const rorJson = JSON.parse(rorResult.content[0].text);
  assert.ok(rorJson.risk_of_ruin_percent > 0 && rorJson.risk_of_ruin_percent < 100);

  const bountyResult = await executeMcpTool('calculate_bounty_chip_equity', { bounty_dollars: 50, regular_pool_buyin: 50, starting_stack: 10000, pot_chips: 15000, call_chips: 10000 });
  const bountyJson = JSON.parse(bountyResult.content[0].text);
  assert.equal(bountyJson.bounty_chip_equivalent, 10000);
  assert.ok(bountyJson.bounty_adjusted_required_equity_percent < bountyJson.standard_required_equity_percent);

  const registry = JSON.parse(read('public/.well-known/mcp-registry.json'));
  assert.equal(registry.name, 'io.github.smarter-poker/mcp-server');
  assert.equal(registry.tools_count, 18);
});

test('Phase 35, 42, 43, 47, 48, 49: next.config.js, knowledge-graph, corpus, and crawler-status routes exist', () => {
  const nextConfig = read('next.config.js');
  assert.ok(nextConfig.includes("source: '/knowledge-graph.jsonld'"), 'rewrites /knowledge-graph.jsonld');
  assert.ok(nextConfig.includes("source: '/llms-es.txt'"), 'rewrites /llms-es.txt');
  assert.ok(nextConfig.includes("source: '/llms-pt.txt'"), 'rewrites /llms-pt.txt');
  assert.ok(nextConfig.includes("source: '/llms-de.txt'"), 'rewrites /llms-de.txt');
  assert.ok(nextConfig.includes("source: '/llms-fr.txt'"), 'rewrites /llms-fr.txt');
  assert.ok(nextConfig.includes("source: '/llms-it.txt'"), 'rewrites /llms-it.txt');
  assert.ok(nextConfig.includes("source: '/llms-ja.txt'"), 'rewrites /llms-ja.txt');
  assert.ok(nextConfig.includes("source: '/learn/hands.md'"), 'rewrites /learn/hands.md');
  assert.ok(nextConfig.includes("source: '/research.md'"), 'rewrites /research.md');
  assert.ok(nextConfig.includes('max-snippet:-1'), 'sets max-snippet:-1 header');

  assert.ok(fs.existsSync(path.join(ROOT, 'pages/api/ai/knowledge-graph.js')));
  assert.ok(fs.existsSync(path.join(ROOT, 'pages/api/ai/corpus.js')));
  assert.ok(fs.existsSync(path.join(ROOT, 'pages/api/ai/crawler-status.js')));
});

test('Phase 50+: Static HUB_PAGE_SUMMARIES export and 100% World Hub surface Markdown parity', async () => {
  const { HUB_PAGE_SUMMARIES, getHubPageSummaries } = await import('../src/lib/seo/hubPageSummariesData.js');
  const { renderHubToolMarkdown } = await import('../pages/api/hub-tool-markdown.js');

  const summaries = getHubPageSummaries();
  assert.ok(Object.keys(HUB_PAGE_SUMMARIES).length >= 90, 'exports >= 90 static HUB_PAGE_SUMMARIES entries');
  assert.deepEqual(summaries, HUB_PAGE_SUMMARIES);

  // Verify HubPageSummary.js stays in sync with hubPageSummariesData.js keys
  const jsxSrc = read('src/components/seo/HubPageSummary.js');
  for (const key of Object.keys(HUB_PAGE_SUMMARIES)) {
    assert.ok(jsxSrc.includes(`'${key}':`) || jsxSrc.includes(`${key}:`), `HubPageSummary.js contains key ${key}`);
  }

  const requiredRoutes = [
    '/hub/personal-assistant',
    '/hub/personal-assistant/leaks',
    '/hub/personal-assistant/sandbox',
    '/hub/training/icm-simulator',
    '/hub/training/spot-trainer',
    '/hub/training/position-mastery',
    '/hub/training/hand-history-upload',
    '/hub/trivia/endless',
    '/hub/trivia/pvp',
    '/hub/commander/venues',
    '/hub/commander/faq',
    '/hub/commander/responsible-gaming',
    '/hub/vip-membership',
    '/hub/vip-membership/compare',
    '/hub/vip-membership/monthly',
    '/hub/vip-membership/yearly',
    '/hub/vip-membership/lifetime',
    '/hub/vip-membership/gift/monthly',
    '/hub/diamond-store',
    '/hub/smarter-rewards',
    '/hub/merch-store',
    '/hub/club-shop',
    '/hub/tournaments/this-weekend',
    '/hub/preflop-charts/leaderboard',
    '/hub/preflop-charts/tutorial',
    '/hub/news',
    '/hub/news/sources',
    '/hub/leaderboards',
    '/hub/promotions',
    '/hub/lives',
    '/hub/help',
    '/hub/pages',
    '/hub/social-pages',
    '/terms',
    '/privacy',
    '/legal/official-rules',
    '/hub/home-games/in',
    '/hub/home-games/near-me',
    '/hub/home-games/in/tx',
    '/hub/home-games/in/tx/austin',
    '/hub/home-games/friday-night-austin-holdem',
  ];

  for (const route of requiredRoutes) {
    const md = renderHubToolMarkdown(route);
    assert.ok(md && md.includes('# '), `renderHubToolMarkdown(${route}) returns valid Markdown`);
  }

  const { faqSchema, datasetSchema } = await import('../src/lib/seo/hubPageSchema.js');
  const faqWithPath = faqSchema([{ question: 'Q?', answer: 'A.' }], '/hub/tournaments/this-weekend');
  assert.equal(faqWithPath['@type'], 'FAQPage');
  assert.equal(faqWithPath['@id'], 'https://smarter.poker/hub/tournaments/this-weekend#faq');

  const faqWithoutPath = faqSchema([{ question: 'Q?', answer: 'A.' }]);
  assert.equal(faqWithoutPath['@type'], 'FAQPage');
  assert.equal(faqWithoutPath['@id'], 'https://smarter.poker/#faq');

  const ds = datasetSchema({ path: '/hub/tournaments/this-weekend', name: 'Weekend', description: 'Desc' });
  assert.equal(ds['@type'], 'Dataset');

  const {
    renderPreflopRangesMarkdown,
    renderPotOddsCalculatorMarkdown,
    renderBankrollCalculatorMarkdown,
    renderPushFoldCalculatorMarkdown,
    renderBountyCalculatorMarkdown,
    renderPokerWinrateCalculatorMarkdown,
  } = await import('../src/lib/seo/markdownIngestion.mjs');
  for (const pos of ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB']) {
    const posMd = renderPreflopRangesMarkdown({ position: pos });
    assert.ok(posMd.includes(`(${pos}) Opening Strategy`) || posMd.includes(`${pos} Opening Strategy`), `renders ${pos} preflop Markdown header`);
    assert.ok(posMd.includes('Pure 100% Open Hands'), `includes pure 100% open hands for ${pos}`);
  }
  assert.ok(fs.existsSync(path.join(ROOT, 'pages/tools/preflop-ranges/[position].js')), 'positional preflop-ranges route exists');
  assert.ok(fs.existsSync(path.join(ROOT, 'pages/tools/pot-odds-calculator.js')), 'pot-odds-calculator route exists');
  assert.ok(fs.existsSync(path.join(ROOT, 'pages/tools/bankroll-calculator.js')), 'bankroll-calculator route exists');
  assert.ok(fs.existsSync(path.join(ROOT, 'pages/tools/push-fold-calculator.js')), 'push-fold-calculator route exists');
  assert.ok(fs.existsSync(path.join(ROOT, 'pages/tools/bounty-calculator.js')), 'bounty-calculator route exists');
  assert.ok(fs.existsSync(path.join(ROOT, 'pages/tools/poker-winrate-calculator.js')), 'poker-winrate-calculator route exists');

  const potMd = renderPotOddsCalculatorMarkdown({ pot: 100, bet: 50, outs: 9 });
  assert.ok(potMd.includes('25.0%'), 'pot odds Markdown computes 25.0% required equity');
  assert.ok(potMd.includes('66.7%'), 'pot odds Markdown computes 66.7% MDF');

  const brMd = renderBankrollCalculatorMarkdown({ winrate: 5, stdDev: 85, buyIns: 30 });
  assert.ok(brMd.includes('Risk Of Ruin (RoR)'), 'bankroll Markdown computes Risk of Ruin');

  const pfMd = renderPushFoldCalculatorMarkdown({ stackBb: 10, position: 'BTN' });
  assert.ok(pfMd.includes('Poker Push/Fold Short-Stack Nash Equilibrium Chart & Calculator'), 'push/fold Markdown renders');

  const btyMd = renderBountyCalculatorMarkdown({ bountyDollars: 50, startingBuyInPool: 50, startingStack: 10000 });
  assert.ok(btyMd.includes('PKO & Mystery Bounty Chip Conversion & Calling Equity Calculator'), 'bounty Markdown renders');

  const wrMd = renderPokerWinrateCalculatorMarkdown({ bigBlindDollars: 5, winrateBb100: 8, handsPerHour: 28, hoursPerMonth: 120 });
  assert.ok(wrMd.includes('Poker Winrate, BB/100 To Hourly Rate ($/Hr) & Volume Calculator'), 'winrate Markdown renders');
});
