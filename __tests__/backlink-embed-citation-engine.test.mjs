/**
 * Backlink, SVG Authority Badge, One-Click Citation & Dead-Tool Replacement Engine Tests
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderBadgeSvg, escapeXml } from '../pages/api/seo/badge.js';
import { renderEmbedsMarkdown } from '../src/lib/seo/markdownIngestion.mjs';
import { buildResearchJsonFeed } from '../pages/api/feeds/research.js';
import { buildRssFeedXml } from '../pages/feed.xml.js';
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

test('Dynamic SVG Authority Badge generator renders valid, accessible SVG across all 5 presets', () => {
  for (const type of ['venue', 'commander', 'research', 'gto', 'club']) {
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

test('Webmaster Embed Portal (/tools/embeds) ships all 11 calculators and 5 SVG backlink badges', () => {
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
  ]) {
    assert.ok(embedsSrc.includes(`id: '${widgetId}'`), `embeds.js includes ${widgetId}`);
  }

  for (const badgeId of [
    'badge-venue',
    'badge-commander',
    'badge-research',
    'badge-gto',
    'badge-club',
  ]) {
    assert.ok(embedsSrc.includes(`id: '${badgeId}'`), `embeds.js includes ${badgeId}`);
  }

  const md = renderEmbedsMarkdown();
  assert.ok(md.includes('Pot Odds, Implied Odds & MDF Calculator'));
  assert.ok(md.includes('Short-Stack Push/Fold Nash Equilibrium Chart'));
  assert.ok(md.includes('Poker Bankroll & Risk Of Ruin Calculator'));
  assert.ok(md.includes('PKO & Mystery Bounty Chip Equity Calculator'));
  assert.ok(md.includes('Poker Winrate (BB/100 To $/Hr) & Volume Calculator'));
  assert.ok(md.includes('Multi-Way All-In Main & Side Pot Calculator'));
  assert.ok(md.includes('Tournament Blind Structure & Chip Distribution Generator'));
  assert.ok(md.includes('Stack-To-Pot Ratio (SPR) & Geometric Bet Sizing Calculator'));
  assert.ok(md.includes('Dynamic SVG Authority & Partner Backlink Badges'));
});

test('Research, Starting Hands, Glossary, and Calculator pages wire CitationBacklinkBox with HTML, Badge, Markdown, BBCode, Press, and BibTeX formats', () => {
  const boxSrc = read('src/components/seo/CitationBacklinkBox.js');
  assert.ok(boxSrc.includes('HTML Contextual Backlink'));
  assert.ok(boxSrc.includes('SVG Authority Badge Embed'));
  assert.ok(boxSrc.includes('Markdown / Substack Citation'));
  assert.ok(boxSrc.includes('Forum BBCode (TwoPlusTwo / CardsChat)'));
  assert.ok(boxSrc.includes('Journalist / Media Attribution Quote'));
  assert.ok(boxSrc.includes('Academic / Game Theory BibTeX'));

  const wiredPages = [
    'pages/research/[slug].js',
    'pages/research/index.js',
    'pages/learn/hands/[hand].js',
    'pages/learn/hands/index.js',
    'pages/learn/[topic].js',
    'pages/glossary/[term].js',
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
    'pages/tools/preflop-ranges/index.js',
  ];

  for (const pagePath of wiredPages) {
    const pageSrc = read(pagePath);
    assert.ok(pageSrc.includes('CitationBacklinkBox'), `${pagePath} renders CitationBacklinkBox`);
  }
});

test('JSON Feed 1.1 (/api/feeds/research) and RSS 2.0 (/feed.xml) syndicate all 15 research studies and 11 calculators with canonical backlinks', () => {
  const jsonFeed = buildResearchJsonFeed();
  assert.equal(jsonFeed.version, 'https://jsonfeed.org/version/1.1');
  assert.equal(jsonFeed.feed_url, 'https://smarter.poker/api/feeds/research');
  assert.equal(jsonFeed.items.length, 26);

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
