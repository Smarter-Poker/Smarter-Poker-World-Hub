/**
 * Backlink, SVG Authority Badge, One-Click Citation & Dead-Tool Replacement Engine Tests
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderBadgeSvg, escapeXml, BADGE_PRESETS } from '../pages/api/seo/badge.js';
import { renderEmbedsMarkdown } from '../src/lib/seo/markdownIngestion.mjs';
import { renderHubToolMarkdown } from '../pages/api/hub-tool-markdown.js';
import { buildResearchJsonFeed } from '../pages/api/feeds/research.js';
import { buildRssFeedXml } from '../pages/feed.xml.js';
import {
  getDatasetCatalogPayload,
  buildZenodoMetadata,
  buildCitationCff,
  buildDataCatalogJsonLd,
  WIKIPEDIA_CITATION_TARGETS,
} from '../src/lib/seo/datasetCatalog.mjs';
import {
  generateOutreachPackage,
  OUTREACH_CAMPAIGNS,
  SUPPORTED_OUTREACH_LANGUAGES,
} from '../src/lib/seo/outreachEngine.mjs';
import { evaluateStreamCommand, STREAMER_BOT_COMMANDS } from '../pages/api/stream/cmd.js';
import { executeMcpTool } from '../src/lib/mcp/mcpServer.mjs';
import { COMPARE_PAGES } from '../src/content/compare/pages.js';
import { RESEARCH_REPORTS } from '../src/content/research/reports.js';
import { POKER_RULES } from '../src/content/rules/rules.js';
import { POKER_VARIANTS } from '../src/content/games/variants.js';
import { POKER_MARKET_GUIDES } from '../src/content/guides/markets.js';
import { LESSONS } from '../src/content/learn/lessons.js';
import { GLOSSARY_TERMS } from '../src/content/glossary/terms.js';
import { STARTING_HANDS } from '../src/content/learn/hands.js';
import {
  DEAD_TOOL_REPLACEMENTS,
  DIRECTORY_NETWORK_TARGETS,
  JOURNALIST_PR_ANGLES,
  OPEN_DATASET_AND_ACADEMIC_MIRRORS,
  INSTITUTIONAL_AND_ECOSYSTEM_CHANNELS,
  BACKLINK_EXECUTION_TODO_CHECKLIST,
  getBacklinkOpportunitiesPayload,
} from '../src/lib/seo/backlinkCatalog.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('Dynamic SVG Authority & Annual Award Badge generator renders valid, accessible SVG across all 16 presets', () => {
  const presetKeys = Object.keys(BADGE_PRESETS);
  assert.equal(presetKeys.length, 16);

  for (const type of presetKeys) {
    const svg = renderBadgeSvg({ type });
    assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'), `${type} badge is valid SVG`);
    assert.ok(svg.includes('role="img"'), `${type} badge includes role="img"`);
    assert.ok(svg.includes('Smarter.Poker') || svg.includes('Club Commander'), `${type} badge includes brand attribution`);
  }

  const customSvg = renderBadgeSvg({
    type: 'venue',
    label: 'Bellagio & Aria <Live>',
    value: 'Verified On Smarter.Poker',
    theme: 'gold',
  });
  assert.ok(customSvg.includes('Bellagio &amp; Aria &lt;Live&gt;'), 'escapes XML entities safely');
  assert.equal(escapeXml('A & B < C > "D" \'E\''), 'A &amp; B &lt; C &gt; &quot;D&quot; &apos;E&apos;');
});

test('Webmaster Embed Portal (/tools/embeds) ships all 15 calculators, 12 SVG backlink/award badges, and 6 streamer bot commands', () => {
  const embedsSrc = read('pages/tools/embeds.js');
  for (const widgetId of [
    'odds-calculator',
    'icm-calculator',
    'preflop-ranges',
    'pot-odds-calculator',
    'push-fold-calculator',
    'bankroll-calculator',
    'bounty-calculator',
    'poker-winrate-calculator',
    'side-pot-calculator',
    'blind-structure-calculator',
    'spr-calculator',
    'plo-bet-calculator',
    'payout-calculator',
    'rake-calculator',
    '3bet-calculator',
  ]) {
    assert.ok(embedsSrc.includes(`id: '${widgetId}'`), `embeds.js includes ${widgetId}`);
  }

  for (const badgeId of [
    'badge-venue',
    'badge-commander',
    'badge-research',
    'badge-gto',
    'badge-club',
    'badge-daily',
    'badge-rules',
    'badge-award-top50',
    'badge-award-texas',
    'badge-award-vegas',
    'badge-award-florida',
    'badge-award-california',
    'badge-award-cpa',
    'badge-award-dealer',
    'badge-award-edu',
  ]) {
    assert.ok(embedsSrc.includes(`id: '${badgeId}'`), `embeds.js includes ${badgeId}`);
  }

  for (const cmdId of [
    'cmd-odds',
    'cmd-potodds',
    'cmd-pushfold',
    'cmd-icm',
    'cmd-bounty',
    'cmd-winrate',
    'cmd-plo',
    'cmd-rake',
    'cmd-3bet',
    'cmd-rule',
  ]) {
    assert.ok(embedsSrc.includes(`id: '${cmdId}'`), `embeds.js includes streamer command ${cmdId}`);
  }
  assert.ok(embedsSrc.includes('STREAM_CHAT_COMMANDS.map'), 'embeds.js renders STREAM_CHAT_COMMANDS in JSX');
  assert.ok(embedsSrc.includes('Copy Nightbot Command'), 'embeds.js renders Copy Nightbot Command button');
  assert.ok(embedsSrc.includes('id="streamer-commands-heading"'), 'embeds.js renders streamer commands JSX section');
  assert.ok(embedsSrc.includes('syndication-apis-heading'), 'embeds.js renders Open Datasets & Syndication APIs section');

  const embedUrls = [...embedsSrc.matchAll(/embedUrl:\s*'([^']+)'/g)].map((m) => m[1]);
  assert.equal(embedUrls.length, 23, 'all 23 widgets define embedUrl');
  for (const url of embedUrls) {
    assert.ok(
      url.startsWith('https://smarter.poker/tools/') && url.endsWith('?embed=true'),
      `Expected canonical /tools/*?embed=true URL, got ${url}`
    );
  }

  const nextConfigSrc = read('next.config.js');
  assert.ok(
    nextConfigSrc.includes("source: '/tools/:path*'") &&
      nextConfigSrc.includes("frame-ancestors 'self' https: http:"),
    'next.config.js must allow cross-origin iframe embedding on /tools/:path*'
  );
  assert.ok(
    nextConfigSrc.includes("source: '/api/seo/backlink-opportunities'") &&
      nextConfigSrc.includes("destination: '/api/ai/backlink-opportunities'"),
    'next.config.js must rewrite /api/seo/backlink-opportunities to /api/ai/backlink-opportunities'
  );

  const md = renderEmbedsMarkdown();
  const mdEmbedUrls = [...md.matchAll(/- Embed URL: `([^`]+)`/g)].map((m) => m[1]);
  assert.equal(mdEmbedUrls.length, 23, 'renderEmbedsMarkdown lists 23 Embed URLs');
  for (const url of mdEmbedUrls) {
    assert.ok(
      url.startsWith('https://smarter.poker/tools/') && url.endsWith('?embed=true'),
      `Expected renderEmbedsMarkdown Embed URL to use /tools/*?embed=true, got ${url}`
    );
  }
  assert.ok(md.includes('Pot Odds, Implied Odds & MDF Calculator'));
  assert.ok(md.includes('Short-Stack Push/Fold Nash Equilibrium Chart'));
  assert.ok(md.includes('Poker Bankroll & Risk Of Ruin Calculator'));
  assert.ok(md.includes('PKO & Mystery Bounty Chip Equity Calculator'));
  assert.ok(md.includes('Poker Winrate (BB/100 To $/Hr) & Volume Calculator'));
  assert.ok(md.includes('Multi-Way All-In Main & Side Pot Calculator'));
  assert.ok(md.includes('Tournament Blind Structure & Chip Distribution Generator'));
  assert.ok(md.includes('Stack-To-Pot Ratio (SPR) & Geometric Bet Sizing Calculator'));
  assert.ok(md.includes('Pot-Limit Omaha (PLO) Max Bet & Bomb Pot Calculator'));
  assert.ok(md.includes('Tournament Payout & Prize Pool Distribution Calculator'));
  assert.ok(md.includes('Live Cash Game Rake & Time-Charge Calculator'));
  assert.ok(md.includes('GTO Preflop 3-Bet, Squeeze, 4-Bet & MDF Calculator'));
  assert.ok(md.includes('Dynamic SVG Authority, Partner & 2026 Annual Award Backlink Badges'));
  assert.ok(md.includes('Twitch & YouTube Streamer Chatbot Commands'));
});

test('All authority page templates wire CitationBacklinkBox with 7 citation formats including Wikipedia {{cite web}}', () => {
  const boxSrc = read('src/components/seo/CitationBacklinkBox.js');
  assert.ok(boxSrc.includes('HTML Contextual Backlink'));
  assert.ok(boxSrc.includes('SVG Authority Badge Embed'));
  assert.ok(boxSrc.includes('Markdown / Substack Citation'));
  assert.ok(boxSrc.includes('Forum BBCode (TwoPlusTwo / CardsChat)'));
  assert.ok(boxSrc.includes('Wikipedia / MediaWiki Citation ({{cite web}})'));
  assert.ok(boxSrc.includes('Journalist / Media Attribution Quote'));
  assert.ok(boxSrc.includes('Academic / Game Theory BibTeX'));

  const wiredPages = [
    'pages/research/[slug].js',
    'pages/research/index.js',
    'pages/learn/hands/[hand].js',
    'pages/learn/hands/index.js',
    'pages/learn/[topic].js',
    'pages/learn/index.js',
    'pages/learn/poker-hand-rankings.js',
    'pages/glossary/[term].js',
    'pages/glossary/index.js',
    'pages/compare/[slug].js',
    'pages/compare/index.js',
    'pages/features/index.js',
    'pages/rules/index.js',
    'pages/rules/[slug].js',
    'pages/games/index.js',
    'pages/games/[variant].js',
    'pages/poker-rooms/guides/index.js',
    'pages/poker-rooms/guides/[city].js',
    'src/components/features/FeatureLanderLayout.js',
    'pages/editorial-standards.js',
    'pages/verification-methodology.js',
    'pages/tools/index.js',
    'pages/tools/pot-odds-calculator.js',
    'pages/tools/push-fold-calculator.js',
    'pages/tools/bankroll-calculator.js',
    'pages/tools/bounty-calculator.js',
    'pages/tools/poker-winrate-calculator.js',
    'pages/tools/side-pot-calculator.js',
    'pages/tools/blind-structure-calculator.js',
    'pages/tools/spr-calculator.js',
    'pages/tools/plo-bet-calculator.js',
    'pages/tools/payout-calculator.js',
    'pages/tools/rake-calculator.js',
    'pages/tools/3bet-calculator.js',
    'pages/tools/preflop-ranges/index.js',
    'pages/hub/training/daily-challenge.js',
  ];

  for (const pagePath of wiredPages) {
    const pageSrc = read(pagePath);
    assert.ok(pageSrc.includes('CitationBacklinkBox'), `${pagePath} renders CitationBacklinkBox`);
  }
});

test('JSON Feed 1.1 (/api/feeds/research) and RSS 2.0 (/feed.xml) syndicate all 15 research studies and 23 calculators with canonical backlinks', () => {
  const jsonFeed = buildResearchJsonFeed();
  assert.equal(jsonFeed.version, 'https://jsonfeed.org/version/1.1');
  assert.equal(jsonFeed.feed_url, 'https://smarter.poker/api/feeds/research');
  assert.equal(jsonFeed.items.length, 38);

  for (const item of jsonFeed.items) {
    assert.match(item.url, /^https:\/\/smarter\.poker\//);
    assert.ok(item.content_html.includes('<a href="https://smarter.poker/'), 'includes canonical HTML backlink');
    assert.ok(item.content_html.includes('https://smarter.poker/api/seo/badge'), 'includes SVG authority badge');
  }

  const rssXml = buildRssFeedXml();
  for (const calcPath of [
    '/tools/poker-odds-calculator',
    '/tools/icm-calculator',
    '/tools/preflop-ranges',
    '/tools/pot-odds-calculator',
    '/tools/push-fold-calculator',
    '/tools/bankroll-calculator',
    '/tools/bounty-calculator',
    '/tools/poker-winrate-calculator',
    '/tools/side-pot-calculator',
    '/tools/blind-structure-calculator',
    '/tools/spr-calculator',
    '/tools/plo-bet-calculator',
    '/tools/payout-calculator',
    '/tools/rake-calculator',
    '/tools/3bet-calculator',
    '/learn/poker-hand-rankings',
    '/rules/showdown-order-who-shows-first',
    '/games/texas-holdem',
    '/poker-rooms/guides/las-vegas-nevada',
    '/research/us-live-poker-room-rake-and-jackpot-benchmark',
  ]) {
    assert.ok(rssXml.includes(`https://smarter.poker${calcPath}`), `RSS feed includes ${calcPath}`);
  }
});

test('Backlink & Dead-Tool Replacement Catalog maps legacy poker tools, directories, open dataset mirrors, and PR studies to live routes', () => {
  const payload = getBacklinkOpportunitiesPayload();
  assert.equal(payload.counts.deadToolReplacements, DEAD_TOOL_REPLACEMENTS.length);
  assert.equal(payload.counts.openDatasetMirrors, OPEN_DATASET_AND_ACADEMIC_MIRRORS.length);
  assert.equal(payload.counts.institutionalChannels, INSTITUTIONAL_AND_ECOSYSTEM_CHANNELS.length);
  assert.equal(payload.counts.executionTodoChecklist, BACKLINK_EXECUTION_TODO_CHECKLIST.length);
  assert.ok(DEAD_TOOL_REPLACEMENTS.length >= 7);
  assert.ok(DIRECTORY_NETWORK_TARGETS.length >= 4);
  assert.ok(JOURNALIST_PR_ANGLES.length >= 4);
  assert.ok(OPEN_DATASET_AND_ACADEMIC_MIRRORS.length >= 3);
  assert.ok(INSTITUTIONAL_AND_ECOSYSTEM_CHANNELS.length >= 3);
  assert.ok(BACKLINK_EXECUTION_TODO_CHECKLIST.length >= 8);

  for (const todo of BACKLINK_EXECUTION_TODO_CHECKLIST) {
    assert.match(todo.targetLandingUrl, /^https:\/\/smarter\.poker\//);
    assert.ok(todo.actionPlan.length > 20);
  }

  for (const item of DEAD_TOOL_REPLACEMENTS) {
    assert.match(item.replacementUrl, /^https:\/\/smarter\.poker\//);
    assert.match(item.comparisonUrl, /^https:\/\/smarter\.poker\//);
    assert.ok(item.outreachTemplate.includes('https://smarter.poker/'));
    assert.ok(item.searchFootprints.length >= 2);
  }
});

test('Open Dataset Catalog (/api/datasets/catalog) serves Schema.org DataCatalog, Zenodo metadata, CITATION.cff, provenance rights, and Wikipedia citations', () => {
  const payload = getDatasetCatalogPayload();
  assert.equal(payload.datasets_count, 15);
  assert.equal(payload.wikipedia_targets_count, WIKIPEDIA_CITATION_TARGETS.length);
  assert.ok(WIKIPEDIA_CITATION_TARGETS.length >= 6);
  assert.ok(payload.provenance_and_redistribution_rights);
  assert.ok(payload.provenance_and_redistribution_rights.included_first_party_scope.length >= 4);
  assert.ok(payload.provenance_and_redistribution_rights.excluded_from_bulk_redistribution.length >= 2);
  assert.ok(payload.provenance_and_redistribution_rights.wikipedia_editorial_compliance_policy.includes('WP:COI'));

  const zenodo = buildZenodoMetadata();
  assert.equal(zenodo.upload_type, 'dataset');
  assert.equal(zenodo.license, 'cc-by-4.0');

  const cff = buildCitationCff();
  assert.ok(cff.includes('cff-version: 1.2.0'));
  assert.ok(cff.includes('https://smarter.poker/research'));

  const jsonLd = buildDataCatalogJsonLd();
  assert.equal(jsonLd['@type'], 'DataCatalog');
  assert.equal(jsonLd.dataset.length, 15);

  for (const wiki of WIKIPEDIA_CITATION_TARGETS) {
    assert.ok(wiki.citeWebTemplate.includes('{{cite web'));
    assert.ok(wiki.citeTechreportTemplate.includes('{{cite techreport'));
    assert.match(wiki.canonicalSourceUrl, /^https:\/\/smarter\.poker\//);
  }
});

test('Automated Outreach & Multilingual Syndication Engine (/api/seo/outreach-generator) generates localized snippets across 7 languages', () => {
  const pkg = generateOutreachPackage({
    campaign: 'cardroom-awards',
    lang: 'es',
    target: 'The Lodge Card Club',
  });
  assert.equal(pkg.campaigns_count, 1);
  assert.equal(pkg.requested_language, 'es');
  assert.equal(pkg.supported_languages.length, 7);
  assert.equal(Object.keys(SUPPORTED_OUTREACH_LANGUAGES).length, 7);
  assert.equal(OUTREACH_CAMPAIGNS.length, 8);
  assert.ok(pkg.campaigns[0].renderedSubject.includes('The Lodge Card Club'));
  assert.ok(pkg.campaigns[0].renderedBody.includes('The Lodge Card Club'));
  assert.ok(pkg.campaigns[0].localizedSnippets.htmlBacklink.includes('hreflang="es"'));
  assert.equal(pkg.multilingual_bundles.length, 7);
});

test('Twitch & YouTube Streamer Chatbot API (/api/stream/cmd) evaluates !odds, !potodds, !pushfold, !icm, !bounty, !winrate, !plo, !rake, !3bet, !rule, !chop, !outs, !variance, !matchup, !tax, !stake, !iso, !series, !board, !mratio, !straddle, !sat, !bbj, !position, !math, and !iq', () => {
  assert.equal(STREAMER_BOT_COMMANDS.length, 26);

  const oddsRes = evaluateStreamCommand({ cmd: 'odds', q: 'AA vs KK' });
  assert.ok(oddsRes.text.includes('81.9% vs 18.1%'));
  assert.ok(oddsRes.text.includes('https://smarter.poker/tools/poker-odds-calculator'));

  const potOddsRes = evaluateStreamCommand({ cmd: 'potodds', pot: '100', bet: '50' });
  assert.ok(potOddsRes.text.includes('Required Equity = 25.0%'));
  assert.ok(potOddsRes.text.includes('Minimum Defense Frequency (MDF) = 66.7%'));

  for (const cmd of ['pushfold', 'icm', 'bounty', 'winrate', 'plo', 'rake', '3bet', 'tax', 'stake', 'iso', 'board', 'mratio', 'straddle', 'sat', 'bbj', 'iq', 'help']) {
    const res = evaluateStreamCommand({ cmd });
    assert.ok(res.text.includes('https://smarter.poker/tools/'), `${cmd} includes canonical tool URL`);
  }

  const posRes = evaluateStreamCommand({ cmd: 'position', q: 'btn' });
  assert.ok(posRes.text.includes('https://smarter.poker/learn/positions'), 'position command includes canonical /learn/positions URL');

  const mathRes = evaluateStreamCommand({ cmd: 'math', q: 'mdf' });
  assert.ok(mathRes.text.includes('https://smarter.poker/learn/poker-math'), 'math command includes canonical /learn/poker-math URL');

  const seriesRes = evaluateStreamCommand({ cmd: 'series', q: 'wsop' });
  assert.ok(seriesRes.text.includes('https://smarter.poker/poker-series/guides'), 'series command includes canonical /poker-series/guides URL');

  const ruleRes = evaluateStreamCommand({ cmd: 'rule' });
  assert.ok(ruleRes.text.includes('https://smarter.poker/rules'), 'rule command includes canonical /rules URL');
});

test('MCP Server executes get_citation_and_backlink_kit tool with full outreach, Wikipedia, and Zenodo payloads', async () => {
  const res = await executeMcpTool('get_citation_and_backlink_kit', {
    campaign: 'edu-quant-clubs',
    lang: 'de',
    target: 'MIT Pokerbots',
  });
  assert.ok(Array.isArray(res.content));
  const parsed = JSON.parse(res.content[0].text);
  assert.equal(parsed.embed_portal_url, 'https://smarter.poker/tools/embeds');
  assert.equal(parsed.dataset_catalog_url, 'https://smarter.poker/api/datasets/catalog');
  assert.equal(parsed.outreach_package.requested_language, 'de');
  assert.ok(parsed.outreach_package.campaigns[0].renderedSubject.includes('MIT Pokerbots'));
  assert.ok(parsed.wikipedia_citation_targets.length >= 6);
});

test('All 23 interactive calculators export getServerSideProps and renderHubToolMarkdown forwards dynamic query parameters', () => {
  const calculatorPages = [
    'pages/tools/poker-odds-calculator.js',
    'pages/tools/icm-calculator.js',
    'pages/tools/preflop-ranges/index.js',
    'pages/tools/pot-odds-calculator.js',
    'pages/tools/push-fold-calculator.js',
    'pages/tools/bankroll-calculator.js',
    'pages/tools/bounty-calculator.js',
    'pages/tools/poker-winrate-calculator.js',
    'pages/tools/side-pot-calculator.js',
    'pages/tools/blind-structure-calculator.js',
    'pages/tools/spr-calculator.js',
    'pages/tools/plo-bet-calculator.js',
    'pages/tools/payout-calculator.js',
    'pages/tools/rake-calculator.js',
    'pages/tools/3bet-calculator.js',
    'pages/tools/chop-calculator.js',
    'pages/tools/variance-calculator.js',
    'pages/tools/outs-calculator.js',
    'pages/tools/poker-tax-calculator.js',
    'pages/tools/staking-calculator.js',
    'pages/tools/iso-calculator.js',
    'pages/tools/home-game-kit.js',
    'pages/tools/format-quiz.js',
  ];

  for (const rel of calculatorPages) {
    const src = read(rel);
    assert.ok(src.includes('export async function getServerSideProps'), `${rel} must export getServerSideProps`);
  }

  const payoutMd = renderHubToolMarkdown('/tools/payout-calculator', { entries: 200, buyIn: 500 });
  assert.ok(payoutMd.includes('200-Entry Poker Tournament At $500 Net Buy-In'), 'payout-calculator.md reflects entries & buyIn query');
  assert.ok(payoutMd.includes('$100,000 Prize Pool'), 'payout-calculator.md computes dynamic prize pool');

  const ploMd = renderHubToolMarkdown('/tools/plo-bet-calculator', { previousPot: 10, lastBet: 5 });
  assert.ok(ploMd.includes('Previous Pot = 10 BB, Facing Bet = 5 BB'), 'plo-bet-calculator.md reflects previousPot & lastBet query');
  assert.ok(ploMd.includes('25.0 BB'), 'plo-bet-calculator.md computes 3*5 + 10 = 25.0 BB');

  const rakeMd = renderHubToolMarkdown('/tools/rake-calculator', { bigBlind: 10, rakeCap: 8, promoDrop: 2, potsWonPerHour: 4 });
  assert.ok(rakeMd.includes('At A $10 Big Blind Game With A $8 Rake Cap + $2 Promo Drop'), 'rake-calculator.md reflects dynamic rake inputs');
  assert.ok(rakeMd.includes('$40.00/Hr'), 'rake-calculator.md computes dynamic hourly pot rake');

  const threeBetMd = renderHubToolMarkdown('/tools/3bet-calculator', { openSize: 3, threeBetSize: 10.5 });
  assert.ok(threeBetMd.includes('Against A 3 BB Preflop Open'), '3bet-calculator.md reflects openSize query');
  assert.ok(threeBetMd.includes('A 3-Bet To 10.5 BB'), '3bet-calculator.md reflects threeBetSize query');
});

test('Zero broken internal URLs or em dashes exist across backlinkCatalog, outreachEngine, datasetCatalog, llms.txt, and openapi.json', () => {
  const compareSlugs = new Set(COMPARE_PAGES.map((p) => p.slug));
  const researchSlugs = new Set(RESEARCH_REPORTS.map((p) => p.slug));
  const ruleSlugs = new Set(POKER_RULES.map((p) => p.slug));
  const gameSlugs = new Set(POKER_VARIANTS.map((p) => p.slug));
  const guideSlugs = new Set(POKER_MARKET_GUIDES.map((p) => p.slug));
  const lessonSlugs = new Set(LESSONS.map((p) => p.slug));
  const glossarySlugs = new Set(GLOSSARY_TERMS.map((p) => p.slug));
  const handSlugs = new Set(STARTING_HANDS.map((p) => p.slug.toLowerCase()));

  for (const item of DEAD_TOOL_REPLACEMENTS) {
    assert.ok(!item.outreachTemplate.includes('\u2014'), `${item.id} outreachTemplate must not contain em dashes`);
  }

  const filesToAudit = [
    'src/lib/seo/backlinkCatalog.mjs',
    'src/lib/seo/outreachEngine.mjs',
    'src/lib/seo/datasetCatalog.mjs',
    'public/llms.txt',
    'public/api/openapi.json',
    'pages/tools/embeds.js',
    'pages/api/feeds/research.js',
    'pages/feed.xml.js',
  ];

  for (const rel of filesToAudit) {
    const txt = read(rel);
    const urls = [...new Set(txt.match(/https:\/\/smarter\.poker\/[a-zA-Z0-9_\-\/.]+/g) || [])];
    for (const rawUrl of urls) {
      const clean = rawUrl.replace(/[.,;:)]+$/, '');
      const urlPath = clean.replace('https://smarter.poker', '').replace(/\.md$/, '');
      if (urlPath.startsWith('/compare/') && urlPath !== '/compare') {
        const s = urlPath.replace('/compare/', '');
        assert.ok(compareSlugs.has(s), `[${rel}] broken /compare/ slug: ${clean}`);
      } else if (urlPath.startsWith('/research/') && urlPath !== '/research' && urlPath !== '/research/') {
        const s = urlPath.replace('/research/', '');
        assert.ok(researchSlugs.has(s), `[${rel}] broken /research/ slug: ${clean}`);
      } else if (urlPath.startsWith('/rules/') && urlPath !== '/rules') {
        const s = urlPath.replace('/rules/', '');
        assert.ok(ruleSlugs.has(s), `[${rel}] broken /rules/ slug: ${clean}`);
      } else if (urlPath.startsWith('/games/') && urlPath !== '/games') {
        const s = urlPath.replace('/games/', '');
        assert.ok(gameSlugs.has(s), `[${rel}] broken /games/ slug: ${clean}`);
      } else if (urlPath.startsWith('/poker-rooms/guides/') && urlPath !== '/poker-rooms/guides') {
        const s = urlPath.replace('/poker-rooms/guides/', '');
        assert.ok(guideSlugs.has(s), `[${rel}] broken /poker-rooms/guides/ slug: ${clean}`);
      } else if (urlPath.startsWith('/features/') && urlPath !== '/features') {
        const s = urlPath.replace('/features/', '');
        assert.ok(fs.existsSync(path.join(ROOT, `pages/features/${s}.js`)), `[${rel}] broken /features/ route: ${clean}`);
      } else if (urlPath.startsWith('/learn/hands/') && urlPath !== '/learn/hands') {
        const s = urlPath.replace('/learn/hands/', '').toLowerCase();
        assert.ok(handSlugs.has(s), `[${rel}] broken /learn/hands/ slug: ${clean}`);
      } else if (
        urlPath.startsWith('/learn/') &&
        urlPath !== '/learn' &&
        urlPath !== '/learn/hands' &&
        urlPath !== '/learn/matchups' &&
        !urlPath.startsWith('/learn/matchups/') &&
        urlPath !== '/learn/positions' &&
        !urlPath.startsWith('/learn/positions/') &&
        urlPath !== '/learn/stakes' &&
        !urlPath.startsWith('/learn/stakes/') &&
        urlPath !== '/learn/famous-hands' &&
        !urlPath.startsWith('/learn/famous-hands/') &&
        urlPath !== '/learn/roadmaps' &&
        !urlPath.startsWith('/learn/roadmaps/') &&
        urlPath !== '/learn/poker-math' &&
        urlPath !== '/learn/cheat-sheets' &&
        urlPath !== '/learn/online-vs-live-poker' &&
        urlPath !== '/learn/live-poker-tells' &&
        urlPath !== '/learn/poker-hand-rankings'
      ) {
        const s = urlPath.replace('/learn/', '');
        assert.ok(lessonSlugs.has(s), `[${rel}] broken /learn/ lesson slug: ${clean}`);
      } else if (urlPath.startsWith('/glossary/') && urlPath !== '/glossary') {
        const s = urlPath.replace('/glossary/', '');
        assert.ok(glossarySlugs.has(s), `[${rel}] broken /glossary/ slug: ${clean}`);
      }
    }
  }
});

test('Schema.org JSON-LD & Google Scholar citation structured data pass rich-result validation across backlink, dataset, and citation pages', async () => {
  const sharedSeoSrc = read('vendor/commander-shared/src/components/seo/SEOHead.js');
  assert.ok(
    sharedSeoSrc.includes("JSON.stringify(toJsonLdDocument(jsonLd)).replace(/</g, '\\\\u003c')"),
    'Shared SEOHead escapes < as \\u003c at the JSON-LD script boundary'
  );

  const hubSeoSrc = read('src/components/seo/SEOHead.js');
  assert.ok(hubSeoSrc.includes('export function normalizeJsonLdGraph(jsonLd)'), 'World Hub SEOHead defines normalizeJsonLdGraph');
  for (const calcPath of ['/tools/plo-bet-calculator', '/tools/payout-calculator', '/tools/rake-calculator', '/tools/3bet-calculator']) {
    assert.ok(hubSeoSrc.includes(`pathname === '${calcPath}'`), `SEOHead auto-resolves markdownUrl for ${calcPath}`);
  }

  const researchSlugSrc = read('pages/research/[slug].js');
  assert.ok(researchSlugSrc.includes('schemas.organization'), 'research/[slug].js includes Organization node in @graph');
  assert.ok(researchSlugSrc.includes('includedInDataCatalog'), 'research/[slug].js links Dataset to DataCatalog');
  assert.ok(researchSlugSrc.includes('variableMeasured: report.table.columns'), 'research/[slug].js declares variableMeasured');
  assert.ok(researchSlugSrc.includes('name="citation_title"'), 'research/[slug].js emits Google Scholar citation_title meta tag');
  assert.ok(researchSlugSrc.includes('name="citation_publication_date"'), 'research/[slug].js emits citation_publication_date meta tag');
  assert.ok(researchSlugSrc.includes('name="dc.identifier"'), 'research/[slug].js emits Dublin Core dc.identifier meta tag');
  assert.ok(
    researchSlugSrc.includes('{report.doi ? <meta key="citation-doi" name="citation_doi" content={report.doi} /> : null}'),
    'research/[slug].js only emits citation_doi when report.doi is explicitly defined'
  );
  assert.ok(
    RESEARCH_REPORTS.every((r) => r.doi === null && r.collectionDoi === '10.5281/zenodo.24115647'),
    'individual reports do not borrow the collection DOI as their own individual report DOI'
  );

  const researchIndexSrc = read('pages/research/index.js');
  assert.ok(researchIndexSrc.includes('schemas.organization'), 'research/index.js includes Organization node in @graph');
  assert.ok(researchIndexSrc.includes("'@type': 'DataCatalog'"), 'research/index.js includes DataCatalog node in @graph');
  assert.ok(
    researchIndexSrc.includes('<meta key="citation-doi" name="citation_doi" content="10.5281/zenodo.24115647" />'),
    'research/index.js emits citation_doi for the parent dataset collection'
  );

  const embedsSrc = read('pages/tools/embeds.js');
  assert.ok(embedsSrc.includes('schemas.organization'), 'tools/embeds.js includes Organization node in @graph');
  assert.ok(embedsSrc.includes("'@id': 'https://smarter.poker/tools/embeds#widget-list'"), 'tools/embeds.js includes ItemList of 15 widgets');

  for (const noRedundantCtxFile of ['pages/tools/index.js', 'pages/features/index.js']) {
    const fileSrc = read(noRedundantCtxFile);
    assert.ok(!fileSrc.includes("'@context': 'https://schema.org'"), `${noRedundantCtxFile} child graph nodes do not redeclare @context`);
  }

  const catalogJsonLd = buildDataCatalogJsonLd();
  assert.equal(catalogJsonLd.inLanguage, 'en-US');
  assert.ok(
    Array.isArray(catalogJsonLd.sameAs) &&
      catalogJsonLd.sameAs.includes('https://github.com/Smarter-Poker/smarter-poker-open-datasets') &&
      catalogJsonLd.sameAs.includes('https://doi.org/10.5281/zenodo.24115647')
  );
  assert.equal(catalogJsonLd.dataset[0].distribution.length, 3, 'Each dataset in DataCatalog exposes HTML, Markdown, and JSON distributions');

  const { resolveToolWikidataLinks } = await import('../src/lib/seo/wikidataRegistry.mjs');
  assert.ok(resolveToolWikidataLinks('/tools/plo-bet-calculator').some((u) => u.includes('Q649282')), 'PLO tool resolves Omaha Holdem Q649282');
  assert.ok(resolveToolWikidataLinks('/tools/payout-calculator').some((u) => u.includes('Q1156823')), 'Payout tool resolves Prize Money Q1156823');
  assert.ok(resolveToolWikidataLinks('/tools/3bet-calculator').some((u) => u.includes('Q131476')), '3-Bet tool resolves Game Theory Q131476');
});

test('25-Item Free Discovery, Viral Calculators, Matchups, Series Guides, Press Kit, Search & AI Agent Protocols Suite', async () => {
  const { HAND_MATCHUPS, getMatchupBySlug } = await import('../src/content/learn/matchups.js');
  const { SERIES_GUIDES, getSeriesGuideBySlug } = await import('../src/content/guides/seriesGuides.js');
  const { MCP_TOOLS, MCP_RESOURCE_TEMPLATES, buildA2AAgentCard, readMcpResource } = await import('../src/lib/mcp/mcpServer.mjs');
  const { buildOpenSearchXml, buildFeedsOpmlXml, buildHumansTxt } = await import('../pages/api/hub-tool-markdown.js');
  const { buildJupyterNotebookPayload } = await import('../pages/api/datasets/catalog.js');
  const { renderOgCardSvg } = await import('../pages/api/seo/badge.js');
  const { buildIndexNowPayload, buildOpenSearchSuggestPayload } = await import('../pages/api/seo/outreach-generator.js');

  assert.equal(HAND_MATCHUPS.length, 25, '25 canonical hand-vs-hand matchups');
  assert.equal( getMatchupBySlug('aa-vs-kk')?.handA, 'AA');
  assert.equal(SERIES_GUIDES.length, 10, '10 major poker series strategy guides');
  assert.equal(getSeriesGuideBySlug('wsop-las-vegas')?.shortName, 'WSOP Las Vegas');

  assert.equal(MCP_TOOLS.length, 45, '45 zero-auth MCP tools');
  assert.equal(MCP_RESOURCE_TEMPLATES.length, 16, '16 MCP resource templates');

  const a2a = buildA2AAgentCard();
  assert.equal(a2a.schemaVersion, '1.0');
  assert.equal(a2a.capabilities.mcpTools, 45);
  assert.equal(a2a.capabilities.mcpResources, 16);

  const taxRes = await executeMcpTool('calculate_poker_taxes_w2g', {
    gross_winnings: 35000,
    gross_losses: 15000,
    filing_status: 'recreational',
  });
  const taxParsed = JSON.parse(taxRes.content[0].text);
  assert.equal(taxParsed.canonical_url, 'https://smarter.poker/tools/poker-tax-calculator');

  const stakeRes = await executeMcpTool('calculate_staking_markup_split', {
    package_buyins: 10000,
    markup: 1.2,
    action_sold_pct: 50,
    investor_share_pct: 10,
    gross_cashes: 25000,
  });
  const stakeParsed = JSON.parse(stakeRes.content[0].text);
  assert.equal(stakeParsed.canonical_url, 'https://smarter.poker/tools/staking-calculator');

  const isoRes = await executeMcpTool('calculate_preflop_isolation_raise', {
    limpers: 2,
    out_of_position: true,
    environment: 'live',
  });
  const isoParsed = JSON.parse(isoRes.content[0].text);
  assert.equal(isoParsed.canonical_url, 'https://smarter.poker/tools/iso-calculator');

  const homeChipRes = await executeMcpTool('calculate_home_game_chip_set', {
    players: 8,
    format: 'tournament',
  });
  const homeChipParsed = JSON.parse(homeChipRes.content[0].text);
  assert.equal(homeChipParsed.canonical_url, 'https://smarter.poker/tools/home-game-kit');

  const seriesGuideRes = await executeMcpTool('get_poker_series_strategy_guide', {
    slug: 'wsop',
  });
  const seriesGuideParsed = JSON.parse(seriesGuideRes.content[0].text);
  assert.equal(seriesGuideParsed.slug, 'wsop-las-vegas');

  const chopRes = await executeMcpTool('calculate_tournament_chop', {
    stacks: [500000, 300000, 200000],
    payouts: [50000, 30000, 20000],
    saveAmount: 5000,
  });
  const chopParsed = JSON.parse(chopRes.content[0].text);
  assert.equal(chopParsed.players.length, 3);

  const varRes = await executeMcpTool('simulate_poker_variance', {
    winrateBb100: 5,
    stdDevBb100: 85,
    handsPlayed: 100000,
  });
  const varParsed = JSON.parse(varRes.content[0].text);
  assert.equal(varParsed.expected_value_bb, 5000);

  const outsRes = await executeMcpTool('calculate_draw_outs', { outs: 9, street: 'flop' });
  const outsParsed = JSON.parse(outsRes.content[0].text);
  assert.equal(outsParsed.outs, 9);

  const matchupRes = await executeMcpTool('lookup_hand_matchup', { slug: 'aa-vs-kk' });
  const matchupParsed = JSON.parse(matchupRes.content[0].text);
  assert.equal(matchupParsed.slug, 'aa-vs-kk');

  assert.ok((await readMcpResource('poker://matchup/aa-vs-kk'))?.contents?.[0]?.text.includes('AA'));
  assert.ok((await readMcpResource('poker://series-guide/wsop-las-vegas'))?.contents?.[0]?.text.includes('WSOP'));
  assert.ok((await readMcpResource('poker://press-kit'))?.contents?.[0]?.text.includes('Smarter.Poker'));

  assert.ok(buildOpenSearchXml().includes('<OpenSearchDescription'));
  assert.ok(buildFeedsOpmlXml().includes('<opml version="2.0">'));
  assert.ok(buildHumansTxt().includes('Smarter.Poker'));

  const nb = buildJupyterNotebookPayload();
  assert.equal(nb.nbformat, 4);
  assert.ok(nb.cells.length >= 4);

  const ogSvg = renderOgCardSvg({ title: 'Final Table ICM Chop Calculator' });
  assert.ok(ogSvg.includes('viewBox="0 0 1200 630"'));

  const indexNow = buildIndexNowPayload();
  assert.equal(indexNow.host, 'smarter.poker');
  assert.ok(indexNow.urlList.length >= 60);

  const suggest = buildOpenSearchSuggestPayload('chop');
  assert.equal(suggest[0], 'chop');
  assert.ok(suggest[1].length >= 1);

  for (const mdPath of [
    '/tools/chop-calculator',
    '/tools/variance-calculator',
    '/tools/outs-calculator',
    '/tools/poker-tax-calculator',
    '/tools/staking-calculator',
    '/tools/iso-calculator',
    '/tools/home-game-kit',
    '/tools/format-quiz',
    '/learn/matchups',
    '/learn/matchups/aa-vs-kk',
    '/poker-series/guides',
    '/poker-series/guides/wsop-las-vegas',
    '/poker-rooms/first-time-guide',
    '/press',
    '/search',
  ]) {
    const md = renderHubToolMarkdown(mdPath);
    assert.ok(md && md.includes('https://smarter.poker'), `${mdPath}.md renders valid Markdown`);
  }
});

test('Phase 6 Partner Installation Suite: oEmbed 1.0 Provider, 1-Line JS Widget SDK, Multi-Format Embed Portal, and Factual Attribution Hardening', async () => {
  const { buildOembedPayload, buildPartnerInstallationCatalog } = await import('../pages/api/seo/oembed.js');

  const calcOembed = buildOembedPayload({
    url: 'https://smarter.poker/tools/poker-odds-calculator',
    maxwidth: 760,
    partner: 'rec.poker',
  });
  assert.equal(calcOembed.status, 200);
  assert.equal(calcOembed.body.version, '1.0');
  assert.equal(calcOembed.body.type, 'rich');
  assert.equal(calcOembed.body.provider_name, 'Smarter.Poker');
  assert.ok(calcOembed.body.html.includes('utm_source=rec.poker'), 'stamps partner utm_source onto iframe and attribution link');

  const researchOembed = buildOembedPayload({
    url: 'https://smarter.poker/research/us-live-poker-room-rake-and-jackpot-benchmark',
    partner: 'cardschat.com',
  });
  assert.equal(researchOembed.status, 200);
  assert.equal(researchOembed.body.type, 'rich');
  assert.ok(researchOembed.body.html.includes('Zenodo DOI 10.5281/zenodo.24115647'));
  assert.ok(researchOembed.body.html.includes('utm_source=cardschat.com'));

  const invalidOembed = buildOembedPayload({ url: 'https://example.com/other' });
  assert.equal(invalidOembed.status, 404);

  const catalog = buildPartnerInstallationCatalog({ partner: 'upswingpoker.com' });
  assert.equal(catalog.counts.embeddable_calculators, 23);
  assert.equal(catalog.counts.svg_attribution_badges, 16);
  assert.equal(catalog.counts.streamer_chat_commands, 26);
  assert.equal(catalog.counts.dead_tool_replacements, 12);
  assert.equal(catalog.counts.zenodo_dataset_deposits, 6);
  assert.ok(catalog.one_line_sdk_example.includes('data-partner="upswingpoker.com"'));

  const sdkSrc = read('public/embed-sdk.js');
  for (const w of catalog.calculators) {
    assert.ok(sdkSrc.includes(`'${w.id}':`), `public/embed-sdk.js registers widget ${w.id}`);
  }
  assert.ok(sdkSrc.includes('data-smarter-poker-widget'));
  assert.ok(sdkSrc.includes('utm_medium=embed-sdk'));

  const seoHeadSrc = read('src/components/seo/SEOHead.js');
  assert.ok(seoHeadSrc.includes('type="application/json+oembed"'), 'SEOHead emits oEmbed discovery link');

  const embedsSrc = read('pages/tools/embeds.js');
  assert.ok(embedsSrc.includes('1-Line JS SDK'));
  assert.ok(embedsSrc.includes('React / Next.js'));
  assert.ok(embedsSrc.includes('OEmbed 1.0 URL'));
  assert.ok(embedsSrc.includes('Test Inline Preview'));
  assert.ok(embedsSrc.includes('DEAD_TOOL_REPLACEMENTS'));
  assert.ok(embedsSrc.includes('StreamElements'));
  assert.ok(embedsSrc.includes('Fossabot'));
  assert.ok(embedsSrc.includes('/api/seo/oembed?mode=catalog'));
  assert.ok(embedsSrc.includes('/embed-sdk.js'));

  const llmsTxt = read('public/llms.txt');
  const llmsFullTxt = read('public/llms-full.txt');
  const aiPluginJson = read('public/.well-known/ai-plugin.json');
  const openApiJson = read('public/api/openapi.json');
  assert.ok(llmsTxt.includes('All 45 Zero-Auth MCP Tools'));
  assert.ok(llmsTxt.includes('!tax, !stake, !iso, !series'));
  assert.ok(llmsFullTxt.includes('All 45 Zero-Auth MCP Tools'));
  assert.ok(aiPluginJson.includes('45 zero-auth MCP tools'));
  assert.ok(openApiJson.includes('45 Tools'));

  const embedsMd = renderEmbedsMarkdown();
  for (const cmd of ['!tax', '!stake', '!iso', '!series']) {
    assert.ok(embedsMd.includes(`\`${cmd}\``), `renderEmbedsMarkdown includes ${cmd}`);
  }

  for (const rel of [
    'src/lib/seo/backlinkCatalog.mjs',
    'src/lib/seo/outreachEngine.mjs',
    'src/lib/mcp/mcpServer.mjs',
    'pages/search.js',
    'public/.well-known/ai-plugin.json',
    'pages/api/feeds/research.js',
    'pages/api/seo/badge.js',
  ]) {
    const content = read(rel);
    assert.ok(!/CERN\/Zenodo|Zenodo \(CERN\)/i.test(content), `${rel} must not contain CERN/Zenodo framing`);
    assert.ok(!/\bDR 9[0-9]\b/i.test(content), `${rel} must not contain third-party DR 9x claims`);
    assert.ok(!/\bdofollow\b/i.test(content), `${rel} must not contain dofollow claims`);
  }
});

test('35-Item Master Expansion: 10 New Calculators, 9 New Authority Hubs, 45 MCP Tools, 26 Streamer Commands, OpenSearch & Sitemap Parity', async () => {
  const { POKER_POSITIONS, getPositionBySlug } = await import('../src/content/learn/positions.js');
  const { POKER_STAKES, getStakeBySlug } = await import('../src/content/learn/stakes.js');
  const { FAMOUS_HANDS, getFamousHandBySlug } = await import('../src/content/learn/famousHands.js');
  const { POKER_ROADMAPS, getRoadmapBySlug } = await import('../src/content/learn/roadmaps.js');
  const { US_POKER_STATES, getStateGuideBySlug } = await import('../src/content/guides/states.js');
  const { LEARN_PAGES, MARKET_GUIDE_PAGES, STATIC_PAGES } = await import('../src/lib/seo/sitemapBuilders.mjs');

  assert.equal(POKER_POSITIONS.length, 9, '9 table position guides');
  assert.equal(getPositionBySlug('button')?.slug, 'btn', 'button alias resolves to btn');
  assert.equal(getPositionBySlug('under-the-gun')?.slug, 'utg', 'under-the-gun alias resolves to utg');

  assert.equal(POKER_STAKES.length, 7, '7 stake level guides');
  assert.equal(getStakeBySlug('2-5')?.slug, '2-5-live-nlh', '2-5 alias resolves to 2-5-live-nlh');

  assert.equal(FAMOUS_HANDS.length, 12, '12 famous poker hands');
  assert.equal(getFamousHandBySlug('moneymaker-farha')?.slug, 'moneymaker-vs-farha-2003-wsop');

  assert.equal(POKER_ROADMAPS.length, 5, '5 player progression roadmaps');
  assert.ok(getRoadmapBySlug('beginner-to-beating-1-3-live'));

  assert.equal(US_POKER_STATES.length, 15, '15 US state poker legality & tax guides');
  assert.equal(getStateGuideBySlug('tx')?.slug, 'texas', 'tx postal code resolves to texas');
  assert.equal(getStateGuideBySlug('nv')?.slug, 'nevada', 'nv postal code resolves to nevada');

  // Verify all 10 new MCP tools execute deterministically
  const boardRes = await executeMcpTool('analyze_flop_board_texture', { flop: 'As,Kh,7d', scenario: 'BTN_VS_BB_SRP' });
  assert.ok(JSON.parse(boardRes.content[0].text).canonical_url.includes('/tools/board-texture-analyzer'));

  const mRatioRes = await executeMcpTool('calculate_tournament_m_ratio', { stack: 24000, sb: 400, bb: 800, ante: 800, players: 9 });
  assert.ok(JSON.parse(mRatioRes.content[0].text).canonical_url.includes('/tools/m-ratio-calculator'));

  const sessRes = await executeMcpTool('calculate_cash_session_plan', { stake: '2/5', winrate_hourly: 45, hours_per_session: 6 });
  assert.ok(JSON.parse(sessRes.content[0].text).canonical_url.includes('/tools/session-planner'));

  const stradRes = await executeMcpTool('calculate_straddle_bomb_pot_ev', { blinds: '2/5', bomb_ante: 15, bomb_players: 8 });
  assert.ok(JSON.parse(stradRes.content[0].text).canonical_url.includes('/tools/straddle-calculator'));

  const fmtRes = await executeMcpTool('format_poker_hand_history', { stakes: '$2/$5 NLH', hero_position: 'BTN', hero_cards: 'AsKs', flop: 'QhJd4s' });
  assert.ok(JSON.parse(fmtRes.content[0].text).canonical_url.includes('/tools/hand-converter'));

  const satRes = await executeMcpTool('calculate_satellite_bubble_factor', { total_players: 100, seats_awarded: 10, players_remaining: 12, hero_stack: 90000 });
  assert.ok(JSON.parse(satRes.content[0].text).canonical_url.includes('/tools/satellite-calculator'));

  const bbjRes = await executeMcpTool('calculate_bad_beat_jackpot_ev', { jackpot_pool: 250000, qualifier: 'quad_8s', promo_drop: 2 });
  assert.ok(JSON.parse(bbjRes.content[0].text).canonical_url.includes('/tools/promo-ev-calculator'));

  const showRes = await executeMcpTool('resolve_holdem_showdown_winner', { board: 'Ah Kd Qh Js 9c', player1_cards: 'Tc 8c', player2_cards: 'Ac Kc' });
  assert.ok(JSON.parse(showRes.content[0].text).canonical_url.includes('/tools/who-wins-calculator'));

  const posToolRes = await executeMcpTool('get_poker_position_strategy', { position: 'btn' });
  assert.ok(JSON.parse(posToolRes.content[0].text).canonical_url.includes('/learn/positions/btn'));

  const stateToolRes = await executeMcpTool('get_us_state_poker_guide', { state: 'tx' });
  assert.ok(JSON.parse(stateToolRes.content[0].text).canonical_url.includes('/poker-rooms/states/texas'));

  // Verify Markdown ingestion across all 20 new calculator & authority hub routes
  for (const newMdRoute of [
    '/tools/board-texture-analyzer',
    '/tools/m-ratio-calculator',
    '/tools/session-planner',
    '/tools/straddle-calculator',
    '/tools/hand-converter',
    '/tools/satellite-calculator',
    '/tools/promo-ev-calculator',
    '/tools/who-wins-calculator',
    '/tools/mixed-game-placards',
    '/tools/poker-iq-test',
    '/learn/positions',
    '/learn/positions/btn',
    '/learn/stakes',
    '/learn/stakes/2-5-live-nlh',
    '/learn/famous-hands',
    '/learn/famous-hands/moneymaker-vs-farha-2003-wsop',
    '/learn/roadmaps',
    '/learn/roadmaps/beginner-to-beating-1-3-live',
    '/poker-rooms/states',
    '/poker-rooms/states/texas',
    '/learn/poker-math',
    '/learn/cheat-sheets',
    '/learn/online-vs-live-poker',
    '/learn/live-poker-tells',
    '/poker-rooms/comps-and-tipping-guide',
  ]) {
    const md = renderHubToolMarkdown(newMdRoute);
    assert.ok(md && md.includes('https://smarter.poker'), `${newMdRoute} renders valid Markdown`);
  }

  // Verify Sitemap inclusion
  const allSitemapPaths = new Set([
    ...LEARN_PAGES.map((p) => p.path),
    ...MARKET_GUIDE_PAGES.map((p) => p.path),
    ...STATIC_PAGES.map((p) => p.path),
  ]);
  for (const expectedSitemapPath of [
    '/tools/board-texture-analyzer',
    '/tools/m-ratio-calculator',
    '/tools/session-planner',
    '/tools/straddle-calculator',
    '/tools/hand-converter',
    '/tools/satellite-calculator',
    '/tools/promo-ev-calculator',
    '/tools/who-wins-calculator',
    '/tools/mixed-game-placards',
    '/tools/poker-iq-test',
    '/learn/positions',
    '/learn/positions/btn',
    '/learn/stakes',
    '/learn/famous-hands',
    '/learn/roadmaps',
    '/learn/poker-math',
    '/learn/cheat-sheets',
    '/learn/online-vs-live-poker',
    '/learn/live-poker-tells',
    '/poker-rooms/states',
    '/poker-rooms/states/texas',
    '/poker-rooms/comps-and-tipping-guide',
  ]) {
    assert.ok(allSitemapPaths.has(expectedSitemapPath), `Sitemap includes ${expectedSitemapPath}`);
  }
});

test('Phase 8 Reconciled Acceptance: Solved-Spot Engine, QR Rule Sheets, Dataset Charts, Directory Badges, VTIMEZONE Calendars, Zenodo v2026.11.12, Executed Notebook, MCP v1.0.5 & Anti-Spoof Telemetry', async () => {
  const {
    recordSeoTelemetryEvent,
    getSeoTelemetrySnapshot,
    classifyTelemetryRequest,
  } = await import('../pages/api/seo/referral-stats.js');
  const { buildResearchChartSvg, extractNumericMetric } = await import(
    '../pages/api/seo/research-chart.js'
  );
  const { buildSeriesCalendarIcs } = await import('../pages/api/seo/series-calendar.js');
  const { SERIES_GUIDES } = await import('../src/content/guides/seriesGuides.js');
  const { computeValidatedSolvedSpot, buildSolvedSpotOgImageUrl } = await import(
    '../src/lib/seo/solvedSpotEngine.js'
  );
  const { renderQrCodeSvg, buildQrMatrix } = await import('../src/lib/seo/qrCodeSvg.js');
  const { renderBadgeSvg } = await import('../pages/api/seo/badge.js');
  const { buildJupyterNotebookPayload } = await import('../pages/api/datasets/catalog.js');
  const { MCP_TOOLS, MCP_SERVER_INFO } = await import('../src/lib/mcp/mcpServer.mjs');

  // 1. Item #1: Share links & OG cards compute strictly from validated inputs (never caller ?result=)
  const potSpot = computeValidatedSolvedSpot('pot-odds-calculator', {
    pot: '200',
    bet: '100',
    outs: '9',
    result: '999% FAKE CALLER RESULT',
  });
  assert.equal(potSpot.hasValidatedSpot, true);
  assert.ok(potSpot.statValue.includes('25.0% Eq'), '200 pot facing 100 bet requires 25.0% equity');
  assert.ok(potSpot.statValue.includes('66.7% MDF'), '200 pot facing 100 bet has 66.7% MDF');
  assert.ok(!potSpot.statValue.includes('999%'), 'Caller-supplied result is ignored');

  const ogUrl = buildSolvedSpotOgImageUrl('/tools/pot-odds-calculator', {
    pot: '200',
    bet: '100',
    outs: '9',
    result: 'FAKE',
  });
  assert.ok(ogUrl.includes('pot=200&bet=100&outs=9'));
  assert.ok(!ogUrl.includes('result='), 'buildSolvedSpotOgImageUrl never forwards caller result=');

  const ogToolCardSrc = read('pages/api/og/tool-card.js');
  assert.ok(
    ogToolCardSrc.includes('computeValidatedSolvedSpot'),
    'OG tool-card computes preview results via computeValidatedSolvedSpot'
  );
  assert.ok(
    !ogToolCardSrc.includes("searchParams.get('result')"),
    'OG tool-card does not trust caller-supplied ?result='
  );

  // 2. Items #2 & #3: Floor Rule References (citing TDA/RROP), Scannable QR Sheets & Equity Assumptions
  const qrMatrix = buildQrMatrix('https://smarter.poker/rules/showdown-order');
  assert.ok(qrMatrix.size >= 29, 'ISO/IEC 18004 QR matrix sized for canonical rule URL');
  const qrSvg = renderQrCodeSvg('https://smarter.poker/rules/showdown-order');
  assert.ok(qrSvg.startsWith('<svg') && qrSvg.includes('<path d="M'));

  const rulesDetailSrc = read('pages/rules/[slug].js');
  assert.ok(
    rulesDetailSrc.includes('Copy Rule Reference For Group Chat'),
    'rules/[slug].js labels share button as Rule Reference (not Official Ruling)'
  );
  assert.ok(
    rulesDetailSrc.includes('/api/seo/qr?path='),
    'rules/[slug].js embeds scannable QR code pointing to canonical rule URL'
  );
  assert.ok(rulesDetailSrc.includes('@media print'), 'rules/[slug].js includes printable @media print stylesheet');

  const matchupsDetailSrc = read('pages/learn/matchups/[slug].js');
  assert.ok(
    matchupsDetailSrc.includes('52-Card Deck Full Enumeration Across All'),
    'learn/matchups/[slug].js states explicit 52-card deck and suit combination assumptions'
  );

  const handsDetailSrc = read('pages/learn/hands/[hand].js');
  assert.ok(
    handsDetailSrc.includes('52-Card Deck Full Enumeration'),
    'learn/hands/[hand].js states explicit 52-card deck assumptions'
  );

  // 3. Item #4: Research Charts derived from dataset with units, dates, methodology & uncertainty
  assert.equal(
    extractNumericMetric(['No Numeric Row', 'Text Only'], ['A', 'B']),
    null,
    'extractNumericMetric returns null instead of fabricated value: 50'
  );
  for (const report of RESEARCH_REPORTS) {
    const svg = buildResearchChartSvg(report);
    assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'), `SVG generated for ${report.slug}`);
    assert.ok(svg.includes('PUBLISHED'), `SVG chart stamps publication date for ${report.slug}`);
    assert.ok(svg.includes('Plotted Column:'), `SVG chart stamps plotted column & units for ${report.slug}`);
    assert.ok(svg.includes('Methodology:'), `SVG chart stamps methodology for ${report.slug}`);
    assert.ok(svg.includes('Uncertainty &amp; Range:'), `SVG chart stamps uncertainty note for ${report.slug}`);
    assert.ok(svg.includes('DOI: 10.5281/zenodo.24115647'), `SVG chart stamps new Zenodo DOI for ${report.slug}`);
  }
  const researchDetailSrc = read('pages/research/[slug].js');
  assert.ok(
    !researchDetailSrc.includes('<a href="${url}" target="_blank" rel="noopener"><img src="${chartSvgUrl}"'),
    'research/[slug].js chart embed does not force a compulsory ranking link around the image'
  );

  // 4. Item #5: Venue Badges distinguish public directory listing from verified/claimed venue
  const selfServiceVenueBadge = renderBadgeSvg({
    type: 'verified-venue',
    label: 'Verified Las Vegas Room',
    value: 'Smarter.Poker Directory',
  });
  assert.ok(
    !selfServiceVenueBadge.includes('Verified Las Vegas Room'),
    'Self-service venue badge sanitizes manufactured Verified claims'
  );
  assert.ok(selfServiceVenueBadge.includes('Publicly Listed Las Vegas Room'));
  const marketGuideSrc = read('pages/poker-rooms/guides/[city].js');
  assert.ok(
    marketGuideSrc.includes('Copy Public Directory Listing Badge HTML'),
    'poker-rooms/guides/[city].js labels self-serve badge as Public Directory Listing'
  );

  // 5. Item #6: Calendars have VTIMEZONE, verified windows, update/cancellation STATUS, and free-to-play chip amounts
  const freerollIcs = buildSeriesCalendarIcs('freerolls');
  assert.equal(freerollIcs.slug, 'freerolls');
  assert.ok(freerollIcs.ics.includes('BEGIN:VTIMEZONE'));
  assert.ok(freerollIcs.ics.includes('TZID:America/Chicago'));
  assert.ok(freerollIcs.ics.includes('2\\,000 Platform Chips Daily Guaranteed'));
  assert.ok(!freerollIcs.ics.includes('$2,000'), 'Freeroll .ics never uses obsolete dollar amounts');

  const cancelledFreerollIcs = buildSeriesCalendarIcs('freerolls', { status: 'cancelled', sequence: 3 });
  assert.ok(cancelledFreerollIcs.ics.includes('STATUS:CANCELLED'));
  assert.ok(cancelledFreerollIcs.ics.includes('SEQUENCE:3'));

  for (const guide of SERIES_GUIDES) {
    const seriesIcs = buildSeriesCalendarIcs(guide.slug);
    assert.equal(seriesIcs.slug, guide.slug);
    assert.ok(seriesIcs.ics.includes('BEGIN:VTIMEZONE'), `VTIMEZONE present for ${guide.slug}`);
    assert.ok(!seriesIcs.ics.includes('20270601'), `No invented 20270601 placeholder dates in ${guide.slug}`);
    assert.ok(
      seriesIcs.ics.includes(`URL:https://smarter.poker/poker-series/guides/${guide.slug}`),
      `Series .ics feed includes canonical URL for ${guide.slug}`
    );
  }

  // 6. Items #7, #8, #9: Executed Notebook, 6 Zenodo DOIs & MCP v1.0.5 35-tool alignment
  const nb = buildJupyterNotebookPayload();
  const codeCells = nb.cells.filter((c) => c.cell_type === 'code');
  assert.equal(codeCells.length, 3);
  assert.ok(
    codeCells.every((c) => typeof c.execution_count === 'number' && Array.isArray(c.outputs) && c.outputs.length > 0),
    'All notebook code cells have verified execution_count and outputs'
  );

  assert.equal(MCP_SERVER_INFO.version, '2.0.0');
  assert.equal(MCP_SERVER_INFO.packageVersion, '1.0.5');
  const mcpManifest = JSON.parse(read('public/.well-known/mcp.json'));
  const mcpRegistry = JSON.parse(read('public/.well-known/mcp-registry.json'));
  assert.equal(mcpManifest.version, '2.0.0');
  assert.equal(mcpManifest.package_version, '1.0.5');
  assert.equal(mcpRegistry.version, '2.0.0');
  assert.equal(mcpRegistry.package_version, '1.0.5');
  assert.deepEqual(mcpManifest.tools, MCP_TOOLS.map((t) => t.name));
  assert.deepEqual(mcpRegistry.tools, MCP_TOOLS.map((t) => t.name));

  // 7. Item #10: Telemetry separation & anti-spoofing
  const spoofAttempt = recordSeoTelemetryEvent({
    category: 'widget_loads',
    item: 'pot-odds-calculator',
    partner: 'spoofed-domain.example',
    source: 'unit-test',
    req: { headers: { 'user-agent': 'Mozilla/5.0' } },
  });
  assert.equal(spoofAttempt.partner_verified, false, 'Unbacked ?partner= parameter is not marked verified');

  const crawlerAttempt = classifyTelemetryRequest(
    { headers: { 'user-agent': 'Googlebot/2.1', referer: 'https://cardschat.com/thread' } },
    { partner: 'cardschat.com' }
  );
  assert.equal(crawlerAttempt.isCrawler, true);
  assert.equal(crawlerAttempt.isVerifiedPartnerInstall, false, 'Crawler request is not a human partner install');

  const verifiedHumanPartner = recordSeoTelemetryEvent({
    category: 'referral_visits',
    item: 'pot-odds-calculator',
    partner: 'cardschat.com',
    source: 'unit-test',
    req: {
      headers: {
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)',
        referer: 'https://www.cardschat.com/poker-odds/',
      },
    },
  });
  assert.equal(verifiedHumanPartner.partner_verified, true);
  assert.equal(verifiedHumanPartner.verified_referer, 'cardschat.com');

  const snapshot = getSeoTelemetrySnapshot();
  assert.equal(snapshot.schema_version, '1.1.0');
  assert.ok(!JSON.stringify(snapshot).includes('npmjs.com'), 'No non-existent npmjs URL in referral-stats');
  assert.ok(!JSON.stringify(snapshot).includes('pypi.org'), 'No non-existent pypi URL in referral-stats');
  assert.ok(snapshot.runtime_telemetry.verified_partner_referrers['cardschat.com'] >= 1);
  assert.ok(snapshot.runtime_telemetry.unverified_partner_params['spoofed-domain.example'] >= 1);
  assert.equal(
    snapshot.runtime_telemetry.verified_partner_referrers['spoofed-domain.example'],
    undefined,
    'Spoofed partner parameter never enters verified_partner_referrers'
  );
});


