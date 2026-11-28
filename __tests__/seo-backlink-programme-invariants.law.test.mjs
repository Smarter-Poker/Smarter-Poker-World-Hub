/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  SEO, AEO & Backlink Programme Anti-Regression Invariant Law Suite
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Enforces structural, filesystem-backed invariants across all 10 Phase 8-10
 * subsystems so that adding a new calculator, MCP tool, streamer command,
 * research study, rule, venue badge, calendar, or dataset cannot silently
 * drift or regress any cross-cutting registry or security boundary.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  TOOL_OG_PRESETS,
  computeValidatedSolvedSpot,
  buildSolvedSpotOgImageUrl,
} from '../src/lib/seo/solvedSpotEngine.js';
import { OEMBED_CALCULATORS } from '../pages/api/seo/oembed.js';
import { STREAMER_BOT_COMMANDS } from '../pages/api/stream/cmd.js';
import {
  MCP_TOOLS,
  MCP_PROMPTS,
  MCP_RESOURCE_TEMPLATES,
  MCP_SERVER_INFO,
} from '../src/lib/mcp/mcpServer.mjs';
import { ZENODO_RECORDS, getDatasetCatalogPayload, buildDataCatalogJsonLd } from '../src/lib/seo/datasetCatalog.mjs';
import { buildJupyterNotebookPayload } from '../pages/api/datasets/catalog.js';
import {
  buildResearchChartSvg,
  extractNumericMetric,
} from '../pages/api/seo/research-chart.js';
import { RESEARCH_REPORTS, RESEARCH_DATASET_DOI } from '../src/content/research/reports.js';
import { renderBadgeSvg, BADGE_PRESETS } from '../pages/api/seo/badge.js';
import { buildSeriesCalendarIcs } from '../pages/api/seo/series-calendar.js';
import { SERIES_GUIDES } from '../src/content/guides/seriesGuides.js';
import {
  classifyTelemetryRequest,
  recordSeoTelemetryEvent,
  getSeoTelemetrySnapshot,
} from '../pages/api/seo/referral-stats.js';
import {
  renderEmbedsMarkdown,
  renderToolsDirectoryMarkdown,
  renderPressKitMarkdown,
  renderSearchDirectoryMarkdown,
} from '../src/lib/seo/markdownIngestion.mjs';
import { renderHubToolMarkdown } from '../pages/api/hub-tool-markdown.js';
import { buildResearchJsonFeed } from '../pages/api/feeds/research.js';
import { buildRssFeedXml } from '../pages/feed.xml.js';
import { resolveToolWikidataLinks } from '../src/lib/seo/wikidataRegistry.mjs';
import {
  INDEXNOW_PRIORITY_URLS,
  OPENSEARCH_SUGGESTION_INDEX,
} from '../pages/api/seo/outreach-generator.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/**
 * LAW 1: Filesystem-to-Registry Calculator Parity & Validated Solved-Spot OG Boundary
 * Why it previously broke: When new calculator pages were added to `pages/tools/*.js`,
 * they were not automatically registered in `solvedSpotEngine.js`, `SEOHead.js`,
 * `oembed.js`, `public/embed-sdk.js`, or `pages/tools/embeds.js`, and OG previews
 * previously trusted caller-supplied `?result=` parameters.
 */
test('LAW 1: Every calculator page in pages/tools/ is registered in SolvedSpotEngine, SEOHead, oEmbed, embed-sdk.js, and embeds.js, and OG previews never trust caller result=', () => {
  const toolsDir = path.join(ROOT, 'pages/tools');
  const toolSlugs = [];

  for (const entry of fs.readdirSync(toolsDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.js')) {
      const slug = entry.name.replace(/\.js$/, '');
      if (slug !== 'index' && slug !== 'embeds') {
        toolSlugs.push(slug);
      }
    } else if (entry.isDirectory()) {
      const indexFile = path.join(toolsDir, entry.name, 'index.js');
      if (fs.existsSync(indexFile)) {
        toolSlugs.push(entry.name);
      }
    }
  }
  toolSlugs.sort();

  assert.ok(toolSlugs.length >= 41, `Expected at least 41 interactive calculators, found ${toolSlugs.length}`);

  const seoHeadSrc = read('src/components/seo/SEOHead.js');
  const embedSdkSrc = read('public/embed-sdk.js');
  const embedsPageSrc = read('pages/tools/embeds.js');
  const oembedLanderPaths = new Set(
    OEMBED_CALCULATORS.map((w) => w.landerUrl.replace('https://smarter.poker/tools/', ''))
  );
  const embedsPageLanderPaths = new Set(
    [...embedsPageSrc.matchAll(/landerUrl:\s*'https:\/\/smarter\.poker\/tools\/([^']+)'/g)].map((m) => m[1])
  );

  for (const slug of toolSlugs) {
    assert.ok(
      TOOL_OG_PRESETS[slug],
      `[LAW 1 VIOLATION] pages/tools/${slug} is missing from TOOL_OG_PRESETS in src/lib/seo/solvedSpotEngine.js`
    );

    assert.ok(
      seoHeadSrc.includes(`'${slug}':`),
      `[LAW 1 VIOLATION] pages/tools/${slug} is missing from SOLVED_SPOT_QUERY_SCHEMAS in src/components/seo/SEOHead.js`
    );

    assert.ok(
      oembedLanderPaths.has(slug),
      `[LAW 1 VIOLATION] pages/tools/${slug} is missing from OEMBED_CALCULATORS in pages/api/seo/oembed.js`
    );

    assert.ok(
      embedsPageLanderPaths.has(slug),
      `[LAW 1 VIOLATION] pages/tools/${slug} is missing from WIDGETS in pages/tools/embeds.js`
    );

    assert.ok(
      embedSdkSrc.includes(`path: '/tools/${slug}'`),
      `[LAW 1 VIOLATION] pages/tools/${slug} is missing from WIDGET_REGISTRY in public/embed-sdk.js`
    );

    // Every calculator must either wire useSolvedSpotUrlSync or restore query state via router.query / getServerSideProps
    if (slug !== 'poker-odds-calculator' && slug !== 'preflop-ranges') {
      const pageRel = fs.existsSync(path.join(ROOT, `pages/tools/${slug}.js`))
        ? `pages/tools/${slug}.js`
        : `pages/tools/${slug}/index.js`;
      const pageSrc = read(pageRel);
      const effectiveSrc =
        slug === 'icm-calculator'
          ? pageSrc + '\n' + read('pages/hub/training/icm-calculator.js')
          : pageSrc;
      assert.ok(
        effectiveSrc.includes('useSolvedSpotUrlSync') || effectiveSrc.includes('router.query'),
        `[LAW 1 VIOLATION] ${pageRel} must wire useSolvedSpotUrlSync or router.query restoration so deep-linked share URLs restore calculator inputs`
      );
    }

    // Verify caller-supplied result/statValue is never trusted by computeValidatedSolvedSpot or buildSolvedSpotOgImageUrl
    const poisoned = computeValidatedSolvedSpot(slug, {
      result: 'POISONED_CALLER_RESULT',
      statValue: 'POISONED_CALLER_STAT',
    });
    assert.ok(
      !String(poisoned.statValue || '').includes('POISONED_CALLER'),
      `[LAW 1 VIOLATION] computeValidatedSolvedSpot('${slug}') leaked caller-supplied result/statValue`
    );
    const ogUrl = buildSolvedSpotOgImageUrl(`/tools/${slug}`, {
      result: 'POISONED',
      statValue: 'POISONED',
    });
    assert.ok(!ogUrl.includes('POISONED'), `[LAW 1 VIOLATION] buildSolvedSpotOgImageUrl('/tools/${slug}') leaked caller result`);
  }

  // Test deterministic calculation on all 8 newest calculators
  assert.equal(computeValidatedSolvedSpot('geometric-bet-calculator', { pot: '100', stack: '300', mode: '3e' }).hasValidatedSpot, true);
  assert.equal(computeValidatedSolvedSpot('late-reg-calculator', { buyin: '1000', rem: '25', bb: '20' }).hasValidatedSpot, true);
  assert.equal(computeValidatedSolvedSpot('mtt-grind-planner', { mtts: '12', abi: '109', br: '25000' }).hasValidatedSpot, true);
  assert.equal(computeValidatedSolvedSpot('plo-outs-calculator', { outs: '20', nut: '14', wrap: 'wrap_20' }).hasValidatedSpot, true);
  assert.equal(computeValidatedSolvedSpot('poker-trip-planner', { days: '5', flight: '450', hotel: '220', buyins: '15000' }).hasValidatedSpot, true);
  assert.equal(computeValidatedSolvedSpot('shot-clock', { primary: '30', bank: '30' }).hasValidatedSpot, true);
  assert.equal(computeValidatedSolvedSpot('table-selection-calculator', { recs: '3', depth: '150', rake: '12' }).hasValidatedSpot, true);
  assert.equal(computeValidatedSolvedSpot('winrate-confidence-calculator', { wr: '5', sd: '85', hands: '50000' }).hasValidatedSpot, true);

  const ogToolCardSrc = read('pages/api/og/tool-card.js');
  assert.ok(ogToolCardSrc.includes('computeValidatedSolvedSpot'));
  assert.ok(!ogToolCardSrc.includes("searchParams.get('result')"));
  assert.ok(!ogToolCardSrc.includes("searchParams.get('statValue')"));
});

/**
 * LAW 2: Rules Attribution & Printable Scannable QR Sheet Invariants
 * Why it previously broke: Copy buttons previously labeled Smarter.Poker's editorial
 * interpretation as "Copy Official Floor Ruling", and printable sheets lacked real
 * scannable ISO/IEC 18004 QR codes or used raw <style>{`...`}</style> tags.
 */
test('LAW 2: Rules and printable QR sheets cite official TDA/RROP sources, never claim editorial text is an Official Floor Ruling, and embed scannable QR SVG + dangerouslySetInnerHTML print CSS', () => {
  for (const ruleFile of ['pages/rules/[slug].js', 'pages/rules/index.js']) {
    const src = read(ruleFile);
    assert.ok(
      !src.includes('Copy Official Floor Ruling'),
      `[LAW 2 VIOLATION] ${ruleFile} must not label editorial summaries as "Copy Official Floor Ruling"`
    );
    assert.ok(
      src.includes('tdaRef'),
      `[LAW 2 VIOLATION] ${ruleFile} must cite rule.tdaRef (Poker TDA / RROP official reference)`
    );
  }

  for (const printablePage of [
    'pages/rules/[slug].js',
    'pages/rules/index.js',
    'pages/tools/mixed-game-placards.js',
    'pages/learn/cheat-sheets.js',
    'pages/tools/home-game-kit.js',
  ]) {
    const src = read(printablePage);
    assert.ok(
      src.includes('/api/seo/qr?path='),
      `[LAW 2 VIOLATION] ${printablePage} must embed a scannable /api/seo/qr?path= SVG QR code`
    );
    assert.ok(
      src.includes('@media print') && src.includes('dangerouslySetInnerHTML'),
      `[LAW 2 VIOLATION] ${printablePage} must define @media print via dangerouslySetInnerHTML`
    );
  }
});

/**
 * LAW 3: Combinatorial & Solver Assumptions on All Dynamic Authority Hub Fact Sheets
 * Why it previously broke: Shareable equity and strategy fact sheets omitted deck size,
 * suit-combination counts, stack depth, or rake model assumptions.
 */
test('LAW 3: All 9 dynamic authority detail templates provide 1-click Discord/Reddit fact sheets with explicit solver/combinatorial assumptions and telemetry', () => {
  const dynamicAuthorityTemplates = [
    { file: 'pages/learn/matchups/[slug].js', requiredToken: '52-Card Deck Full Enumeration' },
    { file: 'pages/learn/hands/[hand].js', requiredToken: '52-Card Deck Full Enumeration' },
    { file: 'pages/learn/famous-hands/[slug].js', requiredToken: 'Assumptions:' },
    { file: 'pages/learn/positions/[pos].js', requiredToken: '100BB Effective Stack' },
    { file: 'pages/learn/stakes/[stake].js', requiredToken: '100BB Standard Buy-In' },
    { file: 'pages/poker-rooms/states/[state].js', requiredToken: 'State Gaming Commission Statutes' },
    { file: 'pages/learn/board-textures/[slug].js', requiredToken: '100BB Single-Raised Pot' },
    { file: 'pages/learn/player-types/[type].js', requiredToken: '100BB 6-Max & 9-Max Cash Game' },
    { file: 'pages/poker-rooms/international/[slug].js', requiredToken: 'Statutory Visitor Gaming Tax' },
  ];

  for (const { file, requiredToken } of dynamicAuthorityTemplates) {
    const src = read(file);
    assert.ok(
      src.includes(requiredToken),
      `[LAW 3 VIOLATION] ${file} must include explicit model/combinatorial assumptions (${requiredToken})`
    );
    assert.ok(
      src.includes('solved_spot_shares'),
      `[LAW 3 VIOLATION] ${file} must record solved_spot_shares telemetry when fact sheets are copied`
    );
  }
});

/**
 * LAW 4: Research Charts Dataset Provenance, Honest Uncertainty & Non-Compulsory Embed Links
 * Why it previously broke: `extractNumericMetric` previously fell back to a fabricated
 * `{ value: 50 }` when a row had no parseable number, and `pages/research/[slug].js`
 * wrapped the chart `<img` in a compulsory ranking backlink.
 */
test('LAW 4: Research charts never fabricate fallback values, stamp units/dates/methodology/uncertainty/DOI on every SVG, and never wrap chart images in compulsory ranking links', () => {
  assert.equal(
    extractNumericMetric(['Non-Numeric Label', 'Qualitative Note'], ['Col A', 'Col B']),
    null,
    '[LAW 4 VIOLATION] extractNumericMetric must return null (never fabricated value: 50) for non-numeric rows'
  );

  const chartApiSrc = read('pages/api/seo/research-chart.js');
  assert.ok(
    !chartApiSrc.includes('value: 50'),
    '[LAW 4 VIOLATION] pages/api/seo/research-chart.js must never contain a fabricated value: 50 fallback'
  );

  for (const report of RESEARCH_REPORTS) {
    const svg = buildResearchChartSvg(report);
    assert.ok(svg.includes('PUBLISHED'), `[LAW 4 VIOLATION] Missing PUBLISHED date on ${report.slug}`);
    assert.ok(svg.includes('UPDATED'), `[LAW 4 VIOLATION] Missing UPDATED date on ${report.slug}`);
    assert.ok(svg.includes('Plotted Column:'), `[LAW 4 VIOLATION] Missing Plotted Column on ${report.slug}`);
    assert.ok(svg.includes('Methodology:'), `[LAW 4 VIOLATION] Missing Methodology on ${report.slug}`);
    assert.ok(svg.includes('Uncertainty &amp; Range:'), `[LAW 4 VIOLATION] Missing Uncertainty & Range on ${report.slug}`);
    assert.ok(svg.includes(`DOI: ${RESEARCH_DATASET_DOI}`), `[LAW 4 VIOLATION] Missing primary Zenodo DOI on ${report.slug}`);
  }

  const researchDetailSrc = read('pages/research/[slug].js');
  assert.ok(
    !researchDetailSrc.includes('<a href="${url}" target="_blank" rel="noopener"><img src="${chartSvgUrl}"'),
    '[LAW 4 VIOLATION] pages/research/[slug].js must not wrap chart <img in a compulsory ranking link'
  );
  assert.ok(
    researchDetailSrc.includes('const chartHtmlSnippet = `<figure') &&
      !researchDetailSrc.includes('const chartHtmlSnippet = `<figure><a href='),
    '[LAW 4 VIOLATION] pages/research/[slug].js chartHtmlSnippet must use plain <figure>/<img without a compulsory <a href=> wrapper'
  );
});

/**
 * LAW 5: Self-Service Venue Badge Anti-Spoofing
 * Why it previously broke: Unauthenticated self-service callers could pass
 * `type=verified-venue` or `label=Official Partner` and manufacture a "Verified"
 * or "Official Partner" SVG badge.
 */
test('LAW 5: Self-service venue badges sanitize unverified "Verified" or "Official Partner" claims to "Publicly Listed"', () => {
  for (const badgeType of ['verified-venue', 'venue', 'directory-listing']) {
    const svg = renderBadgeSvg({
      type: badgeType,
      label: 'Verified Official Partner Casino',
      value: 'Claimed Venue Partner',
    });
    assert.ok(
      !svg.includes('Verified Official Partner'),
      `[LAW 5 VIOLATION] renderBadgeSvg(type=${badgeType}) allowed unverified "Verified Official Partner" label`
    );
    assert.ok(
      !svg.includes('Claimed Venue Partner'),
      `[LAW 5 VIOLATION] renderBadgeSvg(type=${badgeType}) allowed unverified "Claimed Venue Partner" value`
    );
    assert.ok(
      svg.includes('Publicly Listed'),
      `[LAW 5 VIOLATION] renderBadgeSvg(type=${badgeType}) must sanitize unverified claims to "Publicly Listed"`
    );
  }
});

/**
 * LAW 6: RFC 5545 Calendar Invariants (VTIMEZONE, Stable UIDs, SEQUENCE, STATUS & Zero Invented Schedules)
 * Why it previously broke: Calendar feeds previously omitted `VTIMEZONE`, used an
 * invented `20270601` fallback date, or referenced an obsolete `$2,000` freeroll amount.
 */
test('LAW 6: Calendar feeds include VTIMEZONE, deterministic UIDs, SEQUENCE/STATUS update support, and zero invented 20270601 or $2,000 strings', () => {
  const calendarSrc = read('pages/api/seo/series-calendar.js');
  assert.ok(!calendarSrc.includes('20270601'), '[LAW 6 VIOLATION] series-calendar.js must not contain invented 20270601 dates');
  assert.ok(!calendarSrc.includes('$2,000'), '[LAW 6 VIOLATION] series-calendar.js must not contain obsolete $2,000 freeroll strings');

  const freerolls = buildSeriesCalendarIcs('freerolls');
  assert.ok(freerolls.ics.includes('BEGIN:VTIMEZONE'));
  assert.ok(freerolls.ics.includes('TZID:America/Chicago'));
  assert.ok(freerolls.ics.includes('250 Chips Guaranteed'));

  const cancelled = buildSeriesCalendarIcs('freerolls', { status: 'cancelled', sequence: 4 });
  assert.ok(cancelled.ics.includes('STATUS:CANCELLED'));
  assert.ok(cancelled.ics.includes('SEQUENCE:4'));

  for (const guide of SERIES_GUIDES) {
    const res = buildSeriesCalendarIcs(guide.slug);
    assert.ok(res.ics.includes('BEGIN:VTIMEZONE'), `[LAW 6 VIOLATION] Missing VTIMEZONE for ${guide.slug}`);
    assert.ok(res.ics.includes(`UID:${guide.slug}-`), `[LAW 6 VIOLATION] Missing deterministic UID for ${guide.slug}`);
    assert.ok(res.ics.includes('SEQUENCE:'), `[LAW 6 VIOLATION] Missing SEQUENCE for ${guide.slug}`);
    assert.ok(res.ics.includes('STATUS:CONFIRMED'), `[LAW 6 VIOLATION] Missing STATUS:CONFIRMED for ${guide.slug}`);
  }
});

/**
 * LAW 7: Zenodo DOI Single-Source-of-Truth, Scoped Scholar Meta & Executed Notebook
 * Why it previously broke: Retired v1 URL-list DOIs (`24095049`, `24095057`, `24095560`,
 * `24095564`, `24095597`, `24095602`) were hardcoded in generator scripts, and
 * `citation_doi` was emitted on non-research pages.
 */
test('LAW 7: Zero retired v1 Zenodo DOIs exist anywhere in the codebase, citation_doi is scoped strictly to /research, and all notebook code cells are pre-executed', () => {
  const retiredV1Dois = ['24095049', '24095057', '24095560', '24095564', '24095597', '24095602'];
  const filesToCheck = [
    'src/lib/seo/datasetCatalog.mjs',
    'src/content/research/reports.js',
    'src/lib/mcp/mcpServer.mjs',
    'public/.well-known/mcp.json',
    'public/.well-known/mcp-registry.json',
    'public/llms.txt',
    'public/llms-full.txt',
    'scripts/generate-llms-full.mjs',
    'pages/api/datasets/catalog.js',
    'pages/api/seo/oembed.js',
    'pages/research/index.js',
    'pages/research/[slug].js',
  ];

  for (const rel of filesToCheck) {
    const content = read(rel);
    for (const oldId of retiredV1Dois) {
      assert.ok(
        !content.includes(oldId),
        `[LAW 7 VIOLATION] ${rel} contains retired v1 Zenodo ID ${oldId}`
      );
    }
  }

  assert.equal(ZENODO_RECORDS.length, 6);
  const seoHeadSrc = read('src/components/seo/SEOHead.js');
  assert.ok(
    !seoHeadSrc.includes('citation_doi'),
    '[LAW 7 VIOLATION] global SEOHead.js must not emit citation_doi on non-research routes'
  );

  const nb = buildJupyterNotebookPayload();
  const codeCells = nb.cells.filter((c) => c.cell_type === 'code');
  assert.ok(codeCells.length >= 4);
  for (const cell of codeCells) {
    assert.equal(typeof cell.execution_count, 'number', '[LAW 7 VIOLATION] Notebook code cell missing execution_count');
    assert.ok(Array.isArray(cell.outputs) && cell.outputs.length > 0, '[LAW 7 VIOLATION] Notebook code cell missing executed outputs');
  }
});

/**
 * LAW 8: MCP 55-Tool & 34-Streamer-Command Exact Parity
 * Why it previously broke: Adding MCP tools or streamer commands to `mcpServer.mjs`
 * or `pages/api/stream/cmd.js` left `public/.well-known/mcp.json`,
 * `public/.well-known/mcp-registry.json`, `pages/tools/embeds.js`, or
 * `scripts/generate-llms-full.mjs` out of sync.
 */
test('LAW 8: MCP tools, prompts, resource templates, packageVersion (1.0.8), and streamer commands match 1:1 across all manifests and embeds.js', () => {
  const mcpJson = JSON.parse(read('public/.well-known/mcp.json'));
  const mcpRegistryJson = JSON.parse(read('public/.well-known/mcp-registry.json'));

  const expectedToolNames = MCP_TOOLS.map((t) => t.name);
  const expectedPromptNames = MCP_PROMPTS.map((p) => p.name);

  assert.equal(MCP_SERVER_INFO.packageVersion, '1.0.8');
  assert.equal(mcpJson.package_version, MCP_SERVER_INFO.packageVersion);
  assert.equal(mcpRegistryJson.package_version, MCP_SERVER_INFO.packageVersion);

  assert.deepEqual(mcpJson.tools, expectedToolNames, '[LAW 8 VIOLATION] public/.well-known/mcp.json tools out of sync with MCP_TOOLS');
  assert.deepEqual(mcpRegistryJson.tools, expectedToolNames, '[LAW 8 VIOLATION] public/.well-known/mcp-registry.json tools out of sync with MCP_TOOLS');
  assert.deepEqual(mcpJson.prompts, expectedPromptNames, '[LAW 8 VIOLATION] public/.well-known/mcp.json prompts out of sync with MCP_PROMPTS');
  assert.deepEqual(mcpRegistryJson.prompts, expectedPromptNames, '[LAW 8 VIOLATION] public/.well-known/mcp-registry.json prompts out of sync with MCP_PROMPTS');

  assert.equal(mcpJson.tools_count, MCP_TOOLS.length);
  assert.equal(mcpRegistryJson.tools_count, MCP_TOOLS.length);
  assert.equal(mcpJson.prompts_count, MCP_PROMPTS.length);
  assert.equal(mcpRegistryJson.prompts_count, MCP_PROMPTS.length);
  assert.equal(mcpJson.resource_templates_count, MCP_RESOURCE_TEMPLATES.length);
  assert.equal(mcpRegistryJson.resource_templates_count, MCP_RESOURCE_TEMPLATES.length);

  // Streamer commands parity between pages/api/stream/cmd.js and pages/tools/embeds.js
  const embedsPageSrc = read('pages/tools/embeds.js');
  const apiCommands = STREAMER_BOT_COMMANDS.map((c) => c.command);
  const embedPortalCommands = [...embedsPageSrc.matchAll(/command:\s*'(!?[a-z0-9-]+)'/gi)].map((m) => m[1]);
  assert.deepEqual(
    embedPortalCommands,
    apiCommands,
    '[LAW 8 VIOLATION] STREAM_CHAT_COMMANDS in pages/tools/embeds.js is out of sync with STREAMER_BOT_COMMANDS in pages/api/stream/cmd.js'
  );
});

/**
 * LAW 9: Telemetry DNS Label Boundary Anti-Spoofing & Memory Bounds
 * Why it previously broke: Checking `Boolean(refererHost && !isCrawler)` or
 * `refererHost.endsWith(claimedPartner)` without a leading `.` boundary allowed
 * `evil-cardschat.com` or mismatched referers (`attacker.example` with
 * `?partner=cardschat.com`) to spoof `partner_verified: true`.
 */
test('LAW 9: Telemetry enforces strict DNS label boundary matching between Referer and claimed partner, rejects crawlers, and enforces memory bounds', () => {
  // 1. Subdomain lookalike attack (`evil-cardschat.com` claiming `cardschat.com`)
  const lookalikeAttempt = classifyTelemetryRequest(
    {
      headers: {
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)',
        referer: 'https://evil-cardschat.com/spoof',
      },
    },
    { partner: 'cardschat.com' }
  );
  assert.equal(
    lookalikeAttempt.isVerifiedPartnerInstall,
    false,
    '[LAW 9 VIOLATION] Suffix lookalike domain evil-cardschat.com must NOT verify as cardschat.com'
  );

  // 2. Cross-domain mismatch attack (`attacker.example` claiming `upswingpoker.com`)
  const mismatchAttempt = classifyTelemetryRequest(
    {
      headers: {
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)',
        referer: 'https://attacker.example/page',
      },
    },
    { partner: 'upswingpoker.com' }
  );
  assert.equal(
    mismatchAttempt.isVerifiedPartnerInstall,
    false,
    '[LAW 9 VIOLATION] Mismatched referer attacker.example must NOT verify as upswingpoker.com'
  );

  // 3. Valid exact domain and valid subdomain (`forums.cardschat.com` claiming `cardschat.com`)
  const validSubdomain = classifyTelemetryRequest(
    {
      headers: {
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)',
        referer: 'https://forums.cardschat.com/threads/123',
      },
    },
    { partner: 'cardschat.com' }
  );
  assert.equal(validSubdomain.isVerifiedPartnerInstall, true);
  assert.equal(validSubdomain.verifiedRefererHost, 'forums.cardschat.com');

  // 4. Crawler with valid referer must still be rejected as a human partner install
  const crawlerWithValidReferer = classifyTelemetryRequest(
    {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)',
        referer: 'https://cardschat.com/poker-odds/',
      },
    },
    { partner: 'cardschat.com' }
  );
  assert.equal(crawlerWithValidReferer.isCrawler, true);
  assert.equal(crawlerWithValidReferer.isVerifiedPartnerInstall, false);

  // 5. Self-referral from smarter.poker must never count as an external verified partner
  const selfReferral = classifyTelemetryRequest(
    {
      headers: {
        'user-agent': 'Mozilla/5.0',
        referer: 'https://smarter.poker/tools/embeds',
      },
    },
    { partner: 'smarter.poker' }
  );
  assert.equal(selfReferral.isVerifiedPartnerInstall, false);

  // 6. Verify category separation in snapshot
  const ev = recordSeoTelemetryEvent({
    category: 'command_calls',
    item: '!geo',
    partner: 'cardschat.com',
    source: 'law-test',
    req: {
      headers: {
        'user-agent': 'Nightbot-URL-Fetcher/1.0',
        referer: 'https://evil-cardschat.com/',
      },
    },
  });
  assert.equal(ev.partner_verified, false);

  const snap = getSeoTelemetrySnapshot();
  assert.ok(snap.runtime_telemetry.by_category);
  assert.ok('referral_visits' in snap.runtime_telemetry.by_category);
  assert.ok('widget_loads' in snap.runtime_telemetry.by_category);
  assert.ok('command_calls' in snap.runtime_telemetry.by_category);
  assert.ok('conversions' in snap.runtime_telemetry.by_category);
  assert.equal(snap.verified_distribution_surfaces.surface_counts.embeddable_calculators, 50);
  assert.equal(snap.verified_distribution_surfaces.surface_counts.mcp_tools, 70);
  assert.equal(snap.verified_distribution_surfaces.surface_counts.streamer_chat_commands, 44);
});

function listFilesystemCalculatorSlugs() {
  const toolsDir = path.join(ROOT, 'pages/tools');
  const slugs = new Set();
  for (const entry of fs.readdirSync(toolsDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.js')) {
      const slug = entry.name.replace(/\.js$/, '');
      if (slug !== 'index' && slug !== 'embeds') slugs.add(slug);
    } else if (entry.isDirectory()) {
      if (fs.existsSync(path.join(toolsDir, entry.name, 'index.js'))) {
        slugs.add(entry.name);
      }
    }
  }
  return [...slugs].sort();
}

/**
 * LAW 10: Markdown Ingestion Single-Source-of-Truth Parity (`renderEmbedsMarkdown` & `renderToolsDirectoryMarkdown`)
 * Why it previously broke: `renderEmbedsMarkdown()` hardcoded only 23 calculators,
 * 15 badges, and 18 streamer commands, and `renderToolsDirectoryMarkdown()` hardcoded
 * only 33 calculators ("34 Tools"), so AI crawlers reading `/tools/embeds.md` or
 * `/tools.md` missed 18 embeddable widgets and 16 streamer commands.
 */
test('LAW 10: renderEmbedsMarkdown and renderToolsDirectoryMarkdown dynamically emit every calculator, badge, and streamer command with zero drift', () => {
  const toolSlugs = listFilesystemCalculatorSlugs();
  const embedsMd = renderEmbedsMarkdown();
  const embedUrls = [...embedsMd.matchAll(/- Embed URL: `([^`]+)`/g)].map((m) => m[1]);

  assert.equal(
    embedUrls.length,
    OEMBED_CALCULATORS.length,
    '[LAW 10 VIOLATION] renderEmbedsMarkdown Embed URL count drifted from OEMBED_CALCULATORS'
  );
  assert.equal(embedUrls.length, toolSlugs.length);

  for (const badgeKey of Object.keys(BADGE_PRESETS)) {
    assert.ok(
      embedsMd.includes(`type=${badgeKey}`),
      `[LAW 10 VIOLATION] renderEmbedsMarkdown is missing badge preset type=${badgeKey}`
    );
  }

  for (const cmd of STREAMER_BOT_COMMANDS) {
    assert.ok(
      embedsMd.includes(`\`${cmd.command}\``),
      `[LAW 10 VIOLATION] renderEmbedsMarkdown is missing streamer command ${cmd.command}`
    );
  }

  const toolsDirMd = renderToolsDirectoryMarkdown();
  for (const slug of toolSlugs) {
    assert.ok(
      toolsDirMd.includes(`/tools/${slug}`),
      `[LAW 10 VIOLATION] renderToolsDirectoryMarkdown is missing /tools/${slug}`
    );
  }
  assert.ok(
    toolsDirMd.includes('/tools/embeds'),
    '[LAW 10 VIOLATION] renderToolsDirectoryMarkdown must include /tools/embeds'
  );

  // Also verify renderHubToolMarkdown('/tools/embeds') and '/tools/what-beats-what' return valid Markdown
  assert.ok(renderHubToolMarkdown('/tools/embeds')?.includes('Embeddable Poker Widgets'));
  assert.ok(renderHubToolMarkdown('/tools/what-beats-what')?.includes('https://smarter.poker/tools/who-wins-calculator'));
});

/**
 * LAW 11: JSON Feed 1.1 (`/api/feeds/research`) & RSS 2.0 (`/feed.xml`) Full Syndication Parity
 * Why it previously broke: `pages/api/feeds/research.js` and `pages/feed.xml.js`
 * maintained separate static arrays of 23 calculators and omitted the 18 newer
 * calculators and 15 authority hubs.
 */
test('LAW 11: JSON Feed 1.1 (/api/feeds/research) and RSS 2.0 (/feed.xml) syndicate every research report, every calculator in pages/tools/, and all authority hubs', () => {
  const toolSlugs = listFilesystemCalculatorSlugs();
  const jsonFeed = buildResearchJsonFeed();
  assert.ok(
    jsonFeed.items.length >= RESEARCH_REPORTS.length + toolSlugs.length,
    '[LAW 11 VIOLATION] JSON Feed item count must be at least RESEARCH_REPORTS.length + toolSlugs.length'
  );

  const jsonFeedUrls = new Set(jsonFeed.items.map((i) => i.url));
  const rssXml = buildRssFeedXml();

  for (const slug of toolSlugs) {
    const url = `https://smarter.poker/tools/${slug}`;
    assert.ok(jsonFeedUrls.has(url), `[LAW 11 VIOLATION] JSON Feed missing ${url}`);
    assert.ok(rssXml.includes(url), `[LAW 11 VIOLATION] RSS 2.0 feed.xml missing ${url}`);
  }

  for (const hubPath of [
    '/learn/positions',
    '/learn/stakes',
    '/learn/famous-hands',
    '/learn/roadmaps',
    '/learn/player-types',
    '/learn/board-textures',
    '/poker-rooms/states',
    '/poker-rooms/international',
    '/learn/mental-game',
    '/learn/poker-as-a-business',
    '/learn/poker-math',
    '/learn/cheat-sheets',
    '/learn/online-vs-live-poker',
    '/learn/live-poker-tells',
    '/poker-rooms/comps-and-tipping-guide',
    '/search',
  ]) {
    assert.ok(
      rssXml.includes(`https://smarter.poker${hubPath}`),
      `[LAW 11 VIOLATION] RSS 2.0 feed.xml missing authority hub ${hubPath}`
    );
  }
});

/**
 * LAW 12: Next.js Content-Negotiation (`Accept: text/markdown`) Un-Shadowed Rewrites
 * Why it previously broke: `next.config.js` had a catch-all `{ source: '/learn/:slug', destination: '/api/learn-markdown?slug=:slug' }`
 * in `beforeFiles` that intercepted `Accept: text/markdown` requests for `/learn/player-types`,
 * `/learn/board-textures`, `/learn/mental-game`, and `/learn/poker-as-a-business` unless
 * those hubs were placed BEFORE `/learn/:slug`, and 8 new calculators lacked `Accept: text/markdown` rewrites.
 */
test('LAW 12: next.config.js defines un-shadowed Accept: text/markdown and .md rewrites for all 41 calculators and all authority hubs', () => {
  const nextConfigSrc = read('next.config.js');
  const toolSlugs = listFilesystemCalculatorSlugs();

  for (const slug of toolSlugs) {
    const pageRel = fs.existsSync(path.join(ROOT, `pages/tools/${slug}.js`))
      ? `pages/tools/${slug}.js`
      : `pages/tools/${slug}/index.js`;
    const pageSrc = read(pageRel);
    assert.ok(
      nextConfigSrc.includes(`source: '/tools/${slug}'`) ||
        (pageSrc.includes('getServerSideProps') && pageSrc.includes('text/markdown')),
      `[LAW 12 VIOLATION] /tools/${slug} must either define a next.config.js Accept: text/markdown rewrite or handle Accept: text/markdown in getServerSideProps`
    );
    assert.ok(
      nextConfigSrc.includes(`source: '/tools/${slug}.md'`),
      `[LAW 12 VIOLATION] next.config.js is missing .md rewrite for /tools/${slug}.md`
    );
  }

  const catchAllLearnIdx = nextConfigSrc.indexOf("source: '/learn/:slug'");
  assert.ok(catchAllLearnIdx > 0);

  for (const learnHub of [
    '/learn/player-types',
    '/learn/player-types/:type',
    '/learn/board-textures',
    '/learn/board-textures/:slug',
    '/learn/mental-game',
    '/learn/poker-as-a-business',
    '/learn/positions',
    '/learn/stakes',
    '/learn/famous-hands',
    '/learn/roadmaps',
  ]) {
    const idx = nextConfigSrc.indexOf(`source: '${learnHub}'`);
    assert.ok(
      idx > 0 && idx < catchAllLearnIdx,
      `[LAW 12 VIOLATION] ${learnHub} must appear BEFORE '/learn/:slug' in next.config.js beforeFiles so Accept: text/markdown is not shadowed`
    );
  }
});

/**
 * LAW 13: Wikidata Entity Resolution Completeness (`resolveToolWikidataLinks`)
 * Why it previously broke: `resolveToolWikidataLinks(toolKey)` used substring checks
 * that fell through to `[]` for 10 calculators (`home-game-kit`, `format-quiz`,
 * `board-texture-analyzer`, `session-planner`, `hand-converter`, `mixed-game-placards`,
 * `poker-iq-test`, `poker-trip-planner`, `shot-clock`, `mtt-grind-planner`).
 */
test('LAW 13: Every calculator in pages/tools/ resolves to at least 2 Wikidata entity URIs in resolveToolWikidataLinks', () => {
  const toolSlugs = listFilesystemCalculatorSlugs();
  for (const slug of [...toolSlugs, 'embeds']) {
    const links = resolveToolWikidataLinks(`/tools/${slug}`);
    assert.ok(
      Array.isArray(links) && links.length >= 2,
      `[LAW 13 VIOLATION] resolveToolWikidataLinks('/tools/${slug}') returned fewer than 2 Wikidata entities: ${JSON.stringify(links)}`
    );
  }
});

/**
 * LAW 14: 22-Dataset Catalog Parity (`datasetCatalog.mjs` vs `catalog.js` vs `openapi.json`)
 * Why it previously broke: `Smarter-Poker/smarter-poker-open-datasets` was upgraded to
 * 19 and then 22 datasets while `src/lib/seo/datasetCatalog.mjs` only iterated over
 * the 15 `RESEARCH_REPORTS`.
 */
test('LAW 14: Dataset catalog, Schema.org DataCatalog JSON-LD, Jupyter notebook, and OpenAPI spec agree on all 22 datasets and MCP v1.0.8 (70 tools)', () => {
  const catalog = getDatasetCatalogPayload();
  assert.equal(catalog.datasets_count, 22, '[LAW 14 VIOLATION] datasetCatalog.mjs must expose all 22 datasets');
  assert.equal(catalog.datasets.length, 22);

  const jsonLd = buildDataCatalogJsonLd();
  assert.equal(jsonLd.dataset.length, 22, '[LAW 14 VIOLATION] DataCatalog JSON-LD must contain all 22 datasets');

  const nb = buildJupyterNotebookPayload();
  const nbText = JSON.stringify(nb);
  assert.ok(nbText.includes('22 Datasets') || nbText.includes('22 datasets'), '[LAW 14 VIOLATION] Jupyter notebook must reference 22 datasets');
  assert.ok(nbText.includes('v1.0.8'), '[LAW 14 VIOLATION] Jupyter notebook must reference MCP v1.0.8');
  assert.ok(nbText.includes('70'), '[LAW 14 VIOLATION] Jupyter notebook must reference 70 MCP tools');
});

/**
 * LAW 15: Universal Search (`pages/search.js`), OpenSearch & IndexNow Completeness
 * Why it previously broke: `pages/search.js` omitted the 30 detail pages for
 * `PLAYER_ARCHETYPES`, `BOARD_TEXTURES`, and `INTERNATIONAL_POKER_GUIDES`, and
 * `OPENSEARCH_SUGGESTION_INDEX` omitted `poker-winrate-calculator`, `preflop-ranges`,
 * and 5 authority hubs.
 */
test('LAW 15: INDEXNOW_PRIORITY_URLS, OPENSEARCH_SUGGESTION_INDEX, and pages/search.js index all 41 calculators and all authority hub collections', () => {
  const toolSlugs = listFilesystemCalculatorSlugs();
  const indexNowSet = new Set(INDEXNOW_PRIORITY_URLS);
  const openSearchUrls = new Set(OPENSEARCH_SUGGESTION_INDEX.map((item) => item.url));
  const searchPageSrc = read('pages/search.js');

  for (const slug of toolSlugs) {
    const url = `https://smarter.poker/tools/${slug}`;
    assert.ok(indexNowSet.has(url), `[LAW 15 VIOLATION] INDEXNOW_PRIORITY_URLS missing ${url}`);
    assert.ok(openSearchUrls.has(url), `[LAW 15 VIOLATION] OPENSEARCH_SUGGESTION_INDEX missing ${url}`);
    assert.ok(searchPageSrc.includes(`/tools/${slug}`), `[LAW 15 VIOLATION] pages/search.js missing /tools/${slug}`);
  }

  for (const requiredImport of ['PLAYER_ARCHETYPES', 'BOARD_TEXTURES', 'INTERNATIONAL_POKER_GUIDES']) {
    assert.ok(
      searchPageSrc.includes(requiredImport),
      `[LAW 15 VIOLATION] pages/search.js must import and index ${requiredImport} detail pages`
    );
  }
});

/**
 * LAW 16: CitationBacklinkBox & AiPromptLauncher Universal Wiring
 * Why it previously broke: `pages/hub/poker-tools.js` (rendered by `/tools/poker-odds-calculator`),
 * `pages/hub/training/icm-calculator.js` (rendered by `/tools/icm-calculator`), and
 * `pages/tools/embeds.js` lacked `CitationBacklinkBox` and `AiPromptLauncher`, and
 * `pages/learn/category/[category].js`, `pages/learn/poker-hand-rankings.js`,
 * `pages/compare/index.js`, and `pages/glossary/index.js` were missing one of the two.
 */
test('LAW 16: Every calculator page in pages/tools/ and every authority hub page wires both CitationBacklinkBox and AiPromptLauncher', () => {
  const toolSlugs = listFilesystemCalculatorSlugs();

  for (const slug of [...toolSlugs, 'index', 'embeds']) {
    const pageRel = fs.existsSync(path.join(ROOT, `pages/tools/${slug}.js`))
      ? `pages/tools/${slug}.js`
      : `pages/tools/${slug}/index.js`;
    let effectiveSrc = read(pageRel);
    if (slug === 'poker-odds-calculator') {
      effectiveSrc += '\n' + read('pages/hub/poker-tools.js');
    } else if (slug === 'icm-calculator') {
      effectiveSrc += '\n' + read('pages/hub/training/icm-calculator.js');
    } else if (slug === 'preflop-ranges') {
      effectiveSrc += '\n' + read('src/components/seo/PreflopRangeMatrixHub.jsx');
    }

    assert.ok(
      effectiveSrc.includes('CitationBacklinkBox'),
      `[LAW 16 VIOLATION] ${pageRel} must render CitationBacklinkBox`
    );
    assert.ok(
      effectiveSrc.includes('AiPromptLauncher'),
      `[LAW 16 VIOLATION] ${pageRel} must render AiPromptLauncher`
    );
  }

  for (const authorityPage of [
    'pages/learn/category/[category].js',
    'pages/learn/poker-hand-rankings.js',
    'pages/compare/index.js',
    'pages/glossary/index.js',
    'pages/press.js',
    'pages/search.js',
  ]) {
    const src = read(authorityPage);
    assert.ok(src.includes('CitationBacklinkBox'), `[LAW 16 VIOLATION] ${authorityPage} missing CitationBacklinkBox`);
    assert.ok(src.includes('AiPromptLauncher'), `[LAW 16 VIOLATION] ${authorityPage} missing AiPromptLauncher`);
  }
});

/**
 * LAW 17: Zero Stale Tool/Calculator/Dataset Counts Across Public Discovery Surfaces
 * Why it previously broke: `pages/press.js`, `pages/search.js`, `pages/api/ai/knowledge-graph.js`,
 * `pages/api/mcp/index.js`, and `public/llms.txt` retained legacy `"24 Free Calculators"`,
 * `"35 Zero-Auth MCP Tools"`, `"30-Tool MCP Server"`, or broken `/tools/what-beats-what` links.
 */
test('LAW 17: Public discovery surfaces (llms.txt, knowledge-graph.js, press.js, search.js, api/mcp/index.js) contain zero stale 24-calculator or 30/35-MCP-tool claims', () => {
  const llmsTxt = read('public/llms.txt');
  assert.ok(!llmsTxt.includes('/tools/what-beats-what'), '[LAW 17 VIOLATION] public/llms.txt must not link to non-existent /tools/what-beats-what');
  assert.ok(llmsTxt.includes('/tools/who-wins-calculator'), '[LAW 17 VIOLATION] public/llms.txt must link to /tools/who-wins-calculator');
  assert.ok(llmsTxt.includes('/tools/mixed-game-placards'), '[LAW 17 VIOLATION] public/llms.txt must link to /tools/mixed-game-placards');

  for (const rel of [
    'pages/press.js',
    'pages/search.js',
    'pages/api/ai/knowledge-graph.js',
    'pages/api/mcp/index.js',
    'src/lib/seo/markdownIngestion.mjs',
  ]) {
    const src = read(rel);
    assert.ok(!/24\s+(?:Free|Interactive|Browser-Native)/i.test(src), `[LAW 17 VIOLATION] ${rel} still contains stale "24 Free/Interactive/Browser-Native" calculator count`);
    assert.ok(!/35\s+(?:Zero-Auth|MCP)/i.test(src), `[LAW 17 VIOLATION] ${rel} still contains stale "35 Zero-Auth/MCP" tool count`);
    assert.ok(!/30-Tool\s+MCP/i.test(src), `[LAW 17 VIOLATION] ${rel} still contains stale "30-Tool MCP" count`);
  }
});

