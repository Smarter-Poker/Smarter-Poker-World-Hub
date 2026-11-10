/**
 * Master Verification Suite for Phases 1 through 6 of the SEO, AEO & Organic Traffic Expansion Build.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  renderToolsDirectoryMarkdown,
  renderSidePotCalculatorMarkdown,
  renderBlindStructureCalculatorMarkdown,
  renderSprCalculatorMarkdown,
  renderPloBetCalculatorMarkdown,
  renderPayoutCalculatorMarkdown,
  renderRakeCalculatorMarkdown,
  renderThreeBetCalculatorMarkdown,
  renderRulesIndexMarkdown,
  renderRuleDetailMarkdown,
  renderGamesIndexMarkdown,
  renderGameVariantMarkdown,
  renderPokerHandRankingsMarkdown,
  renderMarketGuidesIndexMarkdown,
  renderMarketGuideCityMarkdown,
} from '../src/lib/seo/markdownIngestion.mjs';
import { POKER_RULES } from '../src/content/rules/rules.js';
import { POKER_VARIANTS } from '../src/content/games/variants.js';
import { POKER_MARKET_GUIDES } from '../src/content/guides/markets.js';
import { STARTING_HANDS, findStartingHand, getExpandedHandMatchups, renderStartingHandMarkdown } from '../src/content/learn/hands.js';
import { VIDEO_LIBRARY_PLAYERS, buildPlayerJsonLd } from '../src/lib/videoLibraryPlayers.mjs';
import { renderVideoWatchMarkdown, videoSitemapEntry } from '../src/lib/videoLibraryWatch.mjs';
import { COMPARE_PAGES, getComparePage } from '../src/content/compare/pages.js';
import { buildTourIcs } from '../src/lib/poker-near-me/calendarExport.mjs';
import { renderHomeGameGeoMarkdown, renderHubToolMarkdown } from '../pages/api/hub-tool-markdown.js';
import { MCP_TOOLS, executeMcpTool } from '../src/lib/mcp/mcpServer.mjs';
import { STATIC_PAGES, RESEARCH_PAGES, LEARN_PAGES, RULES_PAGES, GAMES_PAGES, MARKET_GUIDE_PAGES } from '../src/lib/seo/sitemapBuilders.mjs';
import { buildRssFeedXml } from '../pages/feed.xml.js';
import { buildKnowledgeGraph } from '../pages/api/ai/knowledge-graph.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('Phase 1 of 6: Master Tools Directory and 3 new interactive poker calculators exist and emit clean Markdown', () => {
  for (const rel of [
    'pages/tools/index.js',
    'pages/tools/side-pot-calculator.js',
    'pages/tools/blind-structure-calculator.js',
    'pages/tools/spr-calculator.js',
  ]) {
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `${rel} exists`);
    const src = read(rel);
    assert.ok(src.includes('SEOHead'), `${rel} renders SEOHead`);
    assert.ok(src.includes('faqs:'), `${rel} embeds FAQPage via hubProductSchema`);
  }

  const toolsMd = renderToolsDirectoryMarkdown();
  assert.ok(toolsMd.includes('https://smarter.poker/tools/side-pot-calculator'));
  assert.ok(toolsMd.includes('https://smarter.poker/tools/blind-structure-calculator'));
  assert.ok(toolsMd.includes('https://smarter.poker/tools/spr-calculator'));

  const sidePotMd = renderSidePotCalculatorMarkdown();
  assert.ok(sidePotMd.includes('# Poker Side Pot & Multi-Way All-In Payout Calculator'));
  assert.ok(sidePotMd.includes('Main Pot'));

  const blindMd = renderBlindStructureCalculatorMarkdown({ startingStack: 20000, levelMinutes: 20, targetHours: 4 });
  assert.ok(blindMd.includes('# Poker Tournament Blind Structure & Chip Distribution Generator'));
  assert.ok(blindMd.includes('20,000'));

  const sprMd = renderSprCalculatorMarkdown({ effectiveStack: 90, pot: 10 });
  assert.ok(sprMd.includes('# Poker Stack-To-Pot Ratio (SPR) & Geometric Bet Sizing Calculator'));
  assert.ok(sprMd.includes('9.00'));
});

test('Phase 2 of 6: Starting Hand 8-Matchup Equity Matrix, Video Watch Markdown & Sitemap, Wikidata sameAs, and Channels Index', () => {
  assert.equal(STARTING_HANDS.length, 169);
  for (const code of ['AA', 'KK', 'AKs', '87s', '72o']) {
    const hand = findStartingHand(code);
    const matchups = getExpandedHandMatchups(hand);
    assert.ok(matchups.length >= 8, `${code} has at least 8 expanded matchups`);
    const md = renderStartingHandMarkdown(hand);
    assert.ok(md.includes('## Head-To-Head Preflop Equity Matchups'));
    assert.ok(md.includes('/tools/poker-odds-calculator?hand1='));
  }

  for (const player of VIDEO_LIBRARY_PLAYERS) {
    assert.ok(player.wikidataUrl && player.wikidataUrl.startsWith('https://www.wikidata.org/wiki/Q'), `${player.id} has Wikidata URI`);
    const jsonLd = buildPlayerJsonLd(player, []);
    const person = jsonLd.find((n) => n['@type'] === 'Person');
    assert.ok(Array.isArray(person.sameAs) && person.sameAs.includes(player.wikidataUrl));
  }

  const sampleVideo = {
    videoId: 'dQw4w9WgXcQ',
    title: 'Phil Ivey Vs Daniel Negreanu $500,000 High Stakes Cash Game Pot',
    rawTitle: 'Phil Ivey vs Daniel Negreanu $500,000 High Stakes Cash Game Pot',
    description: 'High Stakes Cash Game Hand Analysis.',
    channelName: 'Hustler Casino Live',
    channelId: 'UC123',
    duration: '15:25',
    publishedAt: '2026-10-01T12:00:00Z',
    viewsCount: 125000,
    views: '125K',
    type: 'cash',
    category: 'Cash Game',
    tags: ['Phil Ivey', 'Daniel Negreanu', 'High Stakes Poker'],
  };
  const watchMd = renderVideoWatchMarkdown(sampleVideo, {
    channelName: 'Hustler Casino Live',
    channelHref: '/hub/video-library/channel/UC123',
  });
  assert.ok(watchMd.includes('# Phil Ivey Vs Daniel Negreanu'));
  assert.ok(watchMd.includes('https://smarter.poker/hub/video-library/players'));
  assert.ok(watchMd.includes('https://smarter.poker/hub/video-library/channels'));

  const sitemapXml = videoSitemapEntry(sampleVideo, 'Hustler Casino Live');
  assert.ok(sitemapXml.includes('<lastmod>2026-10-01T12:00:00+00:00</lastmod>') || sitemapXml.includes('<lastmod>2026-10-01'));
  assert.ok(sitemapXml.includes('<video:view_count>125000</video:view_count>'));
  assert.ok(sitemapXml.includes('<video:family_friendly>yes</video:family_friendly>'));
  assert.ok(sitemapXml.includes('<video:tag>Phil Ivey</video:tag>'));

  assert.ok(fs.existsSync(path.join(ROOT, 'pages/hub/video-library/channels/index.js')));
});

test('Phase 3 of 6: 30 verified comparison pages with HRC, Flopzilla, Wynn vs Venetian, Borgata vs Parx, and Florida Rooms', () => {
  assert.equal(COMPARE_PAGES.length, 30);
  for (const slug of [
    'smarter-poker-vs-holdem-resources-calculator',
    'smarter-poker-vs-flopzilla',
    'wynn-vs-venetian-poker-las-vegas',
    'borgata-vs-parx-poker',
    'best-poker-rooms-in-florida',
  ]) {
    const page = getComparePage(slug);
    assert.ok(page, `comparison ${slug} exists`);
    assert.ok(page.table.products.length >= 2);
    assert.ok(page.table.columns.length >= 5);
  }
});

test('Phase 4 of 6: Home Games Geo FAQPage + Host Tools and Poker Tour RFC 5545 .ics calendar feed', () => {
  const statePage = read('pages/hub/home-games/in/[state]/index.js');
  const cityPage = read('pages/hub/home-games/in/[state]/[city].js');
  assert.ok(statePage.includes("'@type': 'FAQPage'"));
  assert.ok(statePage.includes('/tools/blind-structure-calculator'));
  assert.ok(statePage.includes('/tools/side-pot-calculator'));
  assert.ok(cityPage.includes("'@type': 'FAQPage'"));
  assert.ok(cityPage.includes('/tools/blind-structure-calculator'));
  assert.ok(cityPage.includes('/tools/side-pot-calculator'));

  const geoMd = renderHomeGameGeoMarkdown('/hub/home-games/in/tx/austin');
  assert.ok(geoMd.includes('/tools/blind-structure-calculator'));
  assert.ok(geoMd.includes('/tools/side-pot-calculator'));

  const ics = buildTourIcs({
    seo: { code: 'WSOP', name: 'World Series Of Poker', canonical: '/hub/tours/WSOP' },
    stops: [
      {
        name: 'WSOP Summer Championship',
        venue: 'Horseshoe & Paris',
        location: 'Las Vegas, NV',
        dates: 'May 26 - Jul 15',
        buyin_range: '$400 - $250,000',
        flagship: '$10,000 Main Event',
      },
    ],
  });
  assert.ok(ics.includes('BEGIN:VCALENDAR'));
  assert.ok(ics.includes('BEGIN:VEVENT'));
  assert.ok(ics.includes('SUMMARY:WSOP Summer Championship (WSOP)'));
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20260526'));
});

test('Phase 5 of 6: 35 MCP tools, Sitemaps, RSS Feed, llms.txt, and 404 recovery routes', async () => {
  assert.equal(MCP_TOOLS.length, 45);

  const sidePotRes = await executeMcpTool('calculate_side_pots', {
    contributions: [
      { name: 'Player 1', amount: 2500 },
      { name: 'Player 2', amount: 6000 },
      { name: 'Player 3', amount: 12000 },
    ],
    dead_money: 300,
  });
  const sidePotJson = JSON.parse(sidePotRes.content[0].text);
  assert.equal(sidePotJson.pots[0].label, 'Main Pot');
  assert.equal(sidePotJson.pots[0].amount, 7800);
  assert.equal(sidePotJson.pots[1].label, 'Side Pot 1');
  assert.equal(sidePotJson.pots[1].amount, 7000);
  assert.equal(sidePotJson.uncalled_returns[0].returned_chips, 6000);

  const blindRes = await executeMcpTool('generate_blind_structure', {
    starting_stack: 20000,
    level_minutes: 20,
    target_hours: 4,
    ante_format: 'bba',
  });
  const blindJson = JSON.parse(blindRes.content[0].text);
  assert.equal(blindJson.schedule.length, 18);
  assert.equal(blindJson.starting_big_blinds, 100);

  const sprRes = await executeMcpTool('calculate_spr_sizing', {
    effective_stack: 90,
    pot_size: 10,
  });
  const sprJson = JSON.parse(sprRes.content[0].text);
  assert.equal(sprJson.spr, 9);
  assert.ok(sprJson.two_street_geometric_pct > 150 && sprJson.two_street_geometric_pct < 170);

  const staticPaths = new Set(STATIC_PAGES.map((p) => p.path));
  for (const requiredPath of [
    '/tools',
    '/tools/side-pot-calculator',
    '/tools/blind-structure-calculator',
    '/tools/spr-calculator',
    '/hub/video-library/channels',
    '/hub/video-library/players',
    '/hub/video-library/players/phil-ivey',
  ]) {
    assert.ok(staticPaths.has(requiredPath), `STATIC_PAGES includes ${requiredPath}`);
  }
  assert.equal(RESEARCH_PAGES.length, 16);
  assert.ok(LEARN_PAGES.length >= 210);

  const rss = buildRssFeedXml();
  assert.ok(rss.includes('https://smarter.poker/tools/side-pot-calculator'));
  assert.ok(rss.includes('https://smarter.poker/tools/blind-structure-calculator'));
  assert.ok(rss.includes('https://smarter.poker/tools/spr-calculator'));
  assert.ok(rss.includes('https://smarter.poker/research/us-live-poker-room-rake-and-jackpot-benchmark'));
  assert.ok(rss.includes('https://smarter.poker/compare/wynn-vs-venetian-poker-las-vegas'));

  const page404 = read('pages/404.js');
  for (const href of ['/tools', '/learn/hands', '/rules', '/games', '/learn/poker-hand-rankings', '/poker-rooms/guides', '/research', '/freerolls', '/hub/video-library']) {
    assert.ok(page404.includes(`href: '${href}'`), `pages/404.js includes ${href}`);
  }
});

test('Phase 6 of 6: 12-Item Master Expansion — 30 Official Rules, 15 Game Variants, 4 New Calculators, Hand Rankings, 12 Market Guides, & Training Vaults #SmarterCasinoRealism', () => {
  // 1. 30 Official Poker Rules & Floor Rulings
  assert.equal(POKER_RULES.length, 30);
  assert.equal(RULES_PAGES.length, 31);
  assert.ok(renderRulesIndexMarkdown().includes('Official Poker Rules & Casino Floor Rulings Encyclopedia'));
  assert.ok(renderRuleDetailMarkdown('showdown-order-who-shows-first').includes('TDA Rule 16'));
  assert.ok(renderHubToolMarkdown('/rules/verbal-declarations-binding-action').includes('Verbal Declarations'));

  // 2. 15 Poker Variants & Mixed Games
  assert.equal(POKER_VARIANTS.length, 15);
  assert.equal(GAMES_PAGES.length, 16);
  assert.ok(renderGamesIndexMarkdown().includes('Poker Variants & Mixed Games Encyclopedia'));
  assert.ok(renderGameVariantMarkdown('pot-limit-omaha-plo4').includes('Mandatory Two-Card Rule'));
  assert.ok(renderHubToolMarkdown('/games/short-deck-six-plus').includes('Short Deck'));

  // 3. 4 New Interactive Calculators (/tools/plo-bet-calculator, /tools/payout-calculator, /tools/rake-calculator, /tools/3bet-calculator)
  for (const rel of [
    'pages/tools/plo-bet-calculator.js',
    'pages/tools/payout-calculator.js',
    'pages/tools/rake-calculator.js',
    'pages/tools/3bet-calculator.js',
  ]) {
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `${rel} exists`);
    const src = read(rel);
    assert.ok(src.includes('SEOHead'), `${rel} renders SEOHead`);
    assert.ok(src.includes('CitationBacklinkBox'), `${rel} renders CitationBacklinkBox`);
    assert.equal(src.includes('\u2014'), false, `${rel} contains zero em dashes`);
  }
  assert.ok(renderPloBetCalculatorMarkdown().includes('Pot-Limit Omaha (PLO) Max Bet'));
  assert.ok(renderPayoutCalculatorMarkdown().includes('Poker Tournament Payout & Prize Pool Distribution Calculator'));
  assert.ok(renderRakeCalculatorMarkdown().includes('Live Cash Game Rake, Promo Drop & Time-Charge Impact Calculator'));
  assert.ok(renderThreeBetCalculatorMarkdown().includes('Preflop 3-Bet, 4-Bet Sizing & Minimum Defense Frequency (MDF) Calculator'));

  // 4. Official Poker Hand Rankings Cheat Sheet (/learn/poker-hand-rankings)
  const handRankingsSrc = read('pages/learn/poker-hand-rankings.js');
  assert.ok(handRankingsSrc.includes('2,598,960'));
  assert.ok(handRankingsSrc.includes('133,784,560'));
  assert.ok(renderPokerHandRankingsMarkdown().includes('Royal Flush'));
  assert.ok(renderHubToolMarkdown('/learn/poker-hand-rankings').includes('2,598,960'));

  // 5. Top 12 US Regional Poker Market Strategy Guides (/poker-rooms/guides and /poker-rooms/guides/[city]) + First-Time Guide + 15 State Guides + Comps Guide
  assert.equal(POKER_MARKET_GUIDES.length, 12);
  assert.equal(MARKET_GUIDE_PAGES.length, 31);
  assert.ok(renderMarketGuidesIndexMarkdown().includes('US Regional Live Poker Market Strategy Guides'));
  assert.ok(renderMarketGuideCityMarkdown('las-vegas-nevada').includes('Las Vegas'));
  assert.ok(renderHubToolMarkdown('/poker-rooms/guides/houston-texas').includes('Houston'));

  // 6. Training Vaults #SmarterCasinoRealism & Daily Challenge Reference Section
  for (const trainingRel of [
    'pages/hub/training/achievements.js',
    'pages/hub/training/streaks.js',
    'pages/hub/training/leaderboard.js',
    'pages/hub/training/tournaments.js',
    'pages/hub/training/daily-challenge.js',
  ]) {
    const src = read(trainingRel);
    const nonCommentLines = src
      .split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*') && !l.includes('cleaned-emoji artifact'))
      .join('\n');
    assert.equal(nonCommentLines.includes('\u2014'), false, `${trainingRel} UI copy has zero em dashes`);
    assert.ok(
      src.includes('achievements-casino.module.css') ||
      src.includes('daily-challenge-casino.module.css') ||
      src.includes('#25c8ff') ||
      src.includes("borderRadius: '2px'") ||
      src.includes('borderRadius: 2'),
      `${trainingRel} adopts #SmarterCasinoRealism visual tokens`
    );
  }
  const dailySrc = read('pages/hub/training/daily-challenge.js');
  assert.ok(dailySrc.includes('CitationBacklinkBox'), 'daily-challenge.js wires CitationBacklinkBox');
  assert.ok(dailySrc.includes('/hub/training/achievements'), 'daily-challenge.js links to Achievements Vault');
  assert.ok(dailySrc.includes('/hub/training/streaks'), 'daily-challenge.js links to Streaks Vault');
  assert.ok(renderHubToolMarkdown('/hub/training/daily-challenge').includes('Daily GTO Poker Hand Challenge'));

  // 7. Unified Knowledge Graph & Sitemaps include Rules, Variants, and Market Guides
  const graph = buildKnowledgeGraph()['@graph'];
  assert.ok(graph.some((n) => n['@id'] === 'https://smarter.poker/rules#encyclopedia'));
  assert.ok(graph.some((n) => n['@id'] === 'https://smarter.poker/games#variants'));
  assert.ok(graph.some((n) => n['@id'] === 'https://smarter.poker/poker-rooms/guides#markets'));
});
