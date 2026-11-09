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

test('Dynamic SVG Authority & Annual Award Badge generator renders valid, accessible SVG across all 13 presets', () => {
  const presetKeys = Object.keys(BADGE_PRESETS);
  assert.equal(presetKeys.length, 13);

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

test('Webmaster Embed Portal (/tools/embeds) ships all 8 calculators, 10 SVG backlink/award badges, and 6 streamer bot commands', () => {
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
  ]) {
    assert.ok(embedsSrc.includes(`id: '${widgetId}'`), `embeds.js includes ${widgetId}`);
  }

  for (const badgeId of [
    'badge-venue',
    'badge-commander',
    'badge-research',
    'badge-gto',
    'badge-club',
    'badge-award-top50',
    'badge-award-texas',
    'badge-award-cpa',
    'badge-award-dealer',
    'badge-award-edu',
  ]) {
    assert.ok(embedsSrc.includes(`id: '${badgeId}'`), `embeds.js includes ${badgeId}`);
  }

  for (const cmdId of ['cmd-odds', 'cmd-potodds', 'cmd-pushfold', 'cmd-icm', 'cmd-bounty', 'cmd-winrate']) {
    assert.ok(embedsSrc.includes(`id: '${cmdId}'`), `embeds.js includes streamer command ${cmdId}`);
  }

  const md = renderEmbedsMarkdown();
  assert.ok(md.includes('Pot Odds, Implied Odds & MDF Calculator'));
  assert.ok(md.includes('Short-Stack Push/Fold Nash Equilibrium Chart'));
  assert.ok(md.includes('Poker Bankroll & Risk Of Ruin Calculator'));
  assert.ok(md.includes('PKO & Mystery Bounty Chip Equity Calculator'));
  assert.ok(md.includes('Poker Winrate (BB/100 To $/Hr) & Volume Calculator'));
  assert.ok(md.includes('Dynamic SVG Authority, Partner & 2026 Annual Award Backlink Badges'));
  assert.ok(md.includes('Twitch & YouTube Streamer Chatbot Commands'));
});

test('All 20 authority page templates wire CitationBacklinkBox with 7 citation formats including Wikipedia {{cite web}}', () => {
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
    'pages/glossary/[term].js',
    'pages/glossary/index.js',
    'pages/compare/[slug].js',
    'pages/compare/index.js',
    'pages/features/index.js',
    'src/components/features/FeatureLanderLayout.js',
    'pages/editorial-standards.js',
    'pages/verification-methodology.js',
    'pages/tools/pot-odds-calculator.js',
    'pages/tools/push-fold-calculator.js',
    'pages/tools/bankroll-calculator.js',
    'pages/tools/bounty-calculator.js',
    'pages/tools/poker-winrate-calculator.js',
    'pages/tools/preflop-ranges/index.js',
  ];

  for (const pagePath of wiredPages) {
    const pageSrc = read(pagePath);
    assert.ok(pageSrc.includes('CitationBacklinkBox'), `${pagePath} renders CitationBacklinkBox`);
  }
});

test('JSON Feed 1.1 (/api/feeds/research) and RSS 2.0 (/feed.xml) syndicate all 15 research studies and 8 calculators with canonical backlinks', () => {
  const jsonFeed = buildResearchJsonFeed();
  assert.equal(jsonFeed.version, 'https://jsonfeed.org/version/1.1');
  assert.equal(jsonFeed.feed_url, 'https://smarter.poker/api/feeds/research');
  assert.equal(jsonFeed.items.length, 23);

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

test('Open Dataset Catalog (/api/datasets/catalog) serves Schema.org DataCatalog, Zenodo metadata, CITATION.cff, and Wikipedia citations', () => {
  const payload = getDatasetCatalogPayload();
  assert.equal(payload.datasets_count, 15);
  assert.equal(payload.wikipedia_targets_count, WIKIPEDIA_CITATION_TARGETS.length);
  assert.ok(WIKIPEDIA_CITATION_TARGETS.length >= 6);

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

test('Twitch & YouTube Streamer Chatbot API (/api/stream/cmd) evaluates !odds, !potodds, !pushfold, !icm, !bounty, and !winrate', () => {
  assert.equal(STREAMER_BOT_COMMANDS.length, 6);

  const oddsRes = evaluateStreamCommand({ cmd: 'odds', q: 'AA vs KK' });
  assert.ok(oddsRes.text.includes('81.9% vs 18.1%'));
  assert.ok(oddsRes.text.includes('https://smarter.poker/tools/poker-odds-calculator'));

  const potOddsRes = evaluateStreamCommand({ cmd: 'potodds', pot: '100', bet: '50' });
  assert.ok(potOddsRes.text.includes('Required Equity = 25.0%'));
  assert.ok(potOddsRes.text.includes('Minimum Defense Frequency (MDF) = 66.7%'));

  for (const cmd of ['pushfold', 'icm', 'bounty', 'winrate', 'help']) {
    const res = evaluateStreamCommand({ cmd });
    assert.ok(res.text.includes('https://smarter.poker/tools/'), `${cmd} includes canonical tool URL`);
  }
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
