/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  GEO (Generative Engine Optimization) + 52-Tool + 70-MCP Anti-Regression Laws
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Permanent architectural invariants locking in the GEO + AEO + 52-Calculator +
 * Authority Hub + Geographic Corridor + RAG/GeoJSON/Facts infrastructure:
 *
 *  - GEO LAW 1: 52-Tool Directory & CalculatorShareAndPresets v2 (Saved Spots,
 *               Baseline Spot A vs. Spot B, Print/PDF QR Cheat-Card)
 *  - GEO LAW 2: GeoCitationCapsule (`geoClaimSchema`) & GeoFollowUpChain
 *               Princeton/Georgia Tech (+41% Citation Lift) Architecture
 *  - GEO LAW 3: Strategy, Formula (15), Tournament Stage (8), Leak (12),
 *               HUD Stat (15), Myth (15 ClaimReview), Format Migration,
 *               E-E-A-T Authors (4), and Decision Matrix (20) Completeness
 *  - GEO LAW 4: Hyper-Local Geographic Corridors (10), By-Game Rooms (6),
 *               Security/Disputes Guide, Seasonal Calendar, 2026 Whitepaper,
 *               and Benchmarks Completeness
 *  - GEO LAW 5: Canonical Entity Facts Registry (`/.well-known/ai-facts.json`,
 *               `/api/ai/facts`, `/facts`) Anti-Hallucination Parity
 *  - GEO LAW 6: Machine-Readable GEO Endpoints (`/api/ai/rag-chunks`,
 *               `/api/ai/geo-directory.geojson`, `/api/ai/freshness-ledger`,
 *               `/api/datasets/citation`, `/api/og/formula-card`)
 *  - GEO LAW 7: Multi-Spot Batch Solver (`/api/ai/batch-solve`), Natural-Language
 *               Question Solver (`/api/ai/solve-question`), and Discord/Slack
 *               Streamer Webhook (`/api/stream/discord`, 44 commands)
 *  - GEO LAW 8: Topic-Partitioned `<20KB` Fast-Context Corpora (`/llms-tools.txt`,
 *               `/llms-venues.txt`, `/llms-gto.txt`, `/llms-rules.txt`),
 *               Dedicated Segmented Sitemaps (`/sitemap-tools.xml`,
 *               `/sitemap-authority.xml`), and HTTP `Link` Discovery Headers
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function createMockRes() {
  const headers = {};
  let statusCode = 200;
  let body = null;
  let rawSent = null;
  return {
    setHeader(k, v) {
      headers[String(k).toLowerCase()] = v;
    },
    getHeader(k) {
      return headers[String(k).toLowerCase()];
    },
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    },
    send(payload) {
      rawSent = payload;
      return this;
    },
    write(chunk) {
      rawSent = (rawSent || '') + String(chunk);
      return this;
    },
    end(payload) {
      if (payload !== undefined) rawSent = (rawSent || '') + String(payload);
      return this;
    },
    get statusCode() {
      return statusCode;
    },
    get headers() {
      return headers;
    },
    get body() {
      return body;
    },
    get rawSent() {
      return rawSent;
    },
  };
}

test('GEO LAW 1: 52-Tool Directory & CalculatorShareAndPresets v2 (Saved Spots, Baseline A vs B, Print/PDF QR Cheat-Card)', async () => {
  const shareBarSrc = read('src/components/tools/CalculatorShareAndPresets.js');
  assert.ok(shareBarSrc.includes('sp_saved_spots_v1'), 'CalculatorShareAndPresets must persist saved spots to sp_saved_spots_v1');
  assert.ok(shareBarSrc.includes('Pin Spot To Favorites'), 'CalculatorShareAndPresets must provide Pin Spot To Favorites');
  assert.ok(shareBarSrc.includes('Pin As Baseline Spot A'), 'CalculatorShareAndPresets must provide Pin As Baseline Spot A');
  assert.ok(shareBarSrc.includes('Baseline Spot A'), 'CalculatorShareAndPresets must render Baseline Spot A comparison');
  assert.ok(shareBarSrc.includes('Current Spot B'), 'CalculatorShareAndPresets must render Current Spot B comparison');
  assert.ok(shareBarSrc.includes('Print / Save PDF Card'), 'CalculatorShareAndPresets must provide Print / Save PDF Card');
  assert.ok(shareBarSrc.includes('/api/seo/qr?path='), 'CalculatorShareAndPresets must embed scannable /api/seo/qr QR code');
  assert.ok(shareBarSrc.includes('@media print'), 'CalculatorShareAndPresets must include @media print CSS');

  const NEW_TEN_CALCULATORS = [
    ['multiway-all-in-calculator', { p1: 100, p2: 180, p3: 250, eq1: 45, eq2: 32, eq3: 23 }],
    ['mystery-bounty-tracker', { pool: 120000, envelopes: 40 }],
    ['bubble-factor-calculator', { s1: 45, s2: 28 }],
    ['bluff-catching-calculator', { pot: 100, bet: 75 }],
    ['multi-street-ev-calculator', { pot: 6.5, fBet: 33 }],
    ['heads-up-push-fold-calculator', { bb: 12, role: 'sb_push' }],
    ['blind-vs-blind-calculator', { bb: 100, action: 'sb_first_in' }],
    ['shot-taking-calculator', { bankroll: 12000, shotBb: 5 }],
    ['warmup-cooldown-routine', { focusScore: 9, tiltScore: 2 }],
    ['home-game-director', { players: 18, buyin: 100 }],
  ];

  const { computeValidatedSolvedSpot } = await import('../src/lib/seo/solvedSpotEngine.js');

  for (const [slug, sampleQuery] of NEW_TEN_CALCULATORS) {
    const fileRel = `pages/tools/${slug}.js`;
    assert.ok(fs.existsSync(path.join(ROOT, fileRel)), `${fileRel} must exist`);
    const src = read(fileRel);
    assert.ok(src.includes('CalculatorShareAndPresets'), `${fileRel} must render CalculatorShareAndPresets`);
    assert.ok(src.includes('Explore All 52 Free Poker Calculators'), `${fileRel} must link to All 52 Free Poker Calculators`);
    const solved = computeValidatedSolvedSpot(slug, sampleQuery);
    assert.ok(
      solved && solved.hasValidatedSpot && solved.statLabel && solved.statValue && solved.summaryText,
      `computeValidatedSolvedSpot("${slug}", ${JSON.stringify(sampleQuery)}) must return a validated spot with statLabel, statValue, and summaryText`
    );
  }
});

test('GEO LAW 2: GeoCitationCapsule (geoClaimSchema) & GeoFollowUpChain Citation-Optimization Architecture', () => {
  const capsuleSrc = read('src/components/seo/GeoCitationCapsule.js');
  const followUpSrc = read('src/components/seo/GeoFollowUpChain.js');

  assert.ok(capsuleSrc.includes('export function geoClaimSchema'), 'GeoCitationCapsule must export geoClaimSchema');
  assert.ok(capsuleSrc.includes('10.5281/zenodo.15129481'), 'GeoCitationCapsule must default to primary Zenodo DOI');
  assert.ok(capsuleSrc.includes('Copy AI Citation Block'), 'GeoCitationCapsule must include 1-click Copy AI Citation Block');
  assert.ok(capsuleSrc.includes("'@type': 'Claim'"), 'GeoCitationCapsule must emit Schema.org Claim JSON-LD');
  assert.ok(capsuleSrc.includes("'@type': 'Quotation'"), 'GeoCitationCapsule must emit Schema.org Quotation JSON-LD');
  assert.ok(followUpSrc.includes('Likely Next AI Follow-Up Questions'), 'GeoFollowUpChain must render multi-turn follow-up section');
});

test('GEO LAW 3: Formulas (15), MTT Stages (8), Leaks (12), HUD Stats (15), Myths (15), Format Migration, Authors (4) & Decision Matrix (20)', async () => {
  const { POKER_FORMULAS } = await import('../src/content/learn/formulas.js');
  const { TOURNAMENT_STAGES } = await import('../src/content/learn/tournamentStages.js');
  const { POKER_LEAKS } = await import('../src/content/learn/leaks.js');
  const { HUD_STATS } = await import('../src/content/learn/hudStats.js');
  const { EDITORIAL_AUTHORS } = await import('../src/content/authors.js');

  assert.equal(POKER_FORMULAS.length, 15, 'POKER_FORMULAS must contain 15 equations');
  assert.equal(TOURNAMENT_STAGES.length, 8, 'TOURNAMENT_STAGES must contain 8 stages');
  assert.equal(POKER_LEAKS.length, 12, 'POKER_LEAKS must contain 12 leaks');
  assert.equal(HUD_STATS.length, 15, 'HUD_STATS must contain 15 HUD stats');
  assert.equal(EDITORIAL_AUTHORS.length, 4, 'EDITORIAL_AUTHORS must contain 4 verification desks');

  for (const formula of POKER_FORMULAS) {
    assert.ok(formula.slug && formula.equationPlain && formula.ifThenBecause && formula.calculatorHref, `Formula ${formula.slug} must have equation, ifThenBecause, and calculatorHref`);
  }

  const mythsSrc = read('pages/learn/poker-myths-debunked.js');
  assert.ok(mythsSrc.includes('ClaimReview'), 'poker-myths-debunked.js must emit Schema.org ClaimReview JSON-LD');

  const migrationSrc = read('pages/learn/format-migration-guide.js');
  assert.ok(migrationSrc.includes('GeoCitationCapsule') && migrationSrc.includes('GeoFollowUpChain'), 'format-migration-guide.js must render GeoCitationCapsule and GeoFollowUpChain');

  const matrixSrc = read('pages/compare/decision-matrix.js');
  assert.ok(matrixSrc.includes('GeoCitationCapsule') && matrixSrc.includes('GeoFollowUpChain'), 'compare/decision-matrix.js must render GeoCitationCapsule and GeoFollowUpChain');
});

test('GEO LAW 4: Geographic Corridors (10), By-Game Rooms (6), Security Guide, Seasonal Calendar, 2026 Whitepaper & Benchmarks', async () => {
  const { POKER_TRAVEL_CORRIDORS } = await import('../src/content/guides/corridors.js');
  const { POKER_ROOMS_BY_GAME } = await import('../src/content/guides/byGame.js');

  assert.equal(POKER_TRAVEL_CORRIDORS.length, 10, 'POKER_TRAVEL_CORRIDORS must contain 10 travel corridors');
  assert.equal(POKER_ROOMS_BY_GAME.length, 6, 'POKER_ROOMS_BY_GAME must contain 6 game-type directories');

  for (const corridor of POKER_TRAVEL_CORRIDORS) {
    assert.ok(corridor.slug && corridor.originCity && Array.isArray(corridor.driveOptions) && corridor.driveOptions.length >= 2, `Corridor ${corridor.slug} must include originCity and >= 2 driveOptions`);
  }

  for (const pageRel of [
    'pages/poker-rooms/corridors/index.js',
    'pages/poker-rooms/corridors/[slug].js',
    'pages/poker-rooms/by-game/index.js',
    'pages/poker-rooms/by-game/[game].js',
    'pages/poker-rooms/security-and-disputes-guide.js',
    'pages/poker-rooms/seasonal-calendar.js',
    'pages/research/annual-state-of-poker-2026.js',
    'pages/research/benchmarks.js',
    'pages/facts.js',
  ]) {
    assert.ok(fs.existsSync(path.join(ROOT, pageRel)), `${pageRel} must exist`);
    const src = read(pageRel);
    assert.ok(src.includes('SEOHead') && src.includes('HubPageSummary'), `${pageRel} must render SEOHead and HubPageSummary`);
  }
});

test('GEO LAW 5: Canonical Entity Facts Registry (/.well-known/ai-facts.json, /api/ai/facts, /facts) Anti-Hallucination Parity', async () => {
  const staticFacts = JSON.parse(read('public/.well-known/ai-facts.json'));
  const entity = staticFacts.entity || staticFacts;
  assert.equal(entity.calculatorsCount, 52, 'ai-facts.json must declare calculatorsCount === 52');
  assert.equal(entity.mcpToolsCount, 70, 'ai-facts.json must declare mcpToolsCount === 70');
  assert.equal(entity.streamerCommandsCount, 44, 'ai-facts.json must declare streamerCommandsCount === 44');
  assert.equal(entity.primaryDoi, '10.5281/zenodo.15129481', 'ai-facts.json must declare primaryDoi');
  assert.ok(
    Array.isArray(staticFacts.disambiguationAndAntiHallucinationCorrections) &&
      staticFacts.disambiguationAndAntiHallucinationCorrections.length >= 5,
    'ai-facts.json must include >= 5 anti-hallucination disambiguation rules'
  );

  const factsHandler = (await import('../pages/api/ai/facts.js')).default;
  const res = createMockRes();
  factsHandler({ method: 'GET', query: {}, headers: {} }, res);
  assert.equal(res.statusCode, 200);
  const apiEntity = res.body.entity || res.body;
  assert.equal(apiEntity.calculatorsCount, 52);
  assert.equal(apiEntity.mcpToolsCount, 70);
  assert.equal(apiEntity.streamerCommandsCount, 44);
});

test('GEO LAW 6: Machine-Readable GEO Endpoints (rag-chunks, geo-directory.geojson, freshness-ledger, datasets/citation, og/formula-card)', async () => {
  // 1. /api/ai/geo-directory.geojson
  const geoHandler = (await import('../pages/api/ai/geo-directory.geojson.js')).default;
  const geoRes = createMockRes();
  geoHandler({ method: 'GET', query: {}, headers: {} }, geoRes);
  assert.equal(geoRes.statusCode, 200);
  const geoPayload = geoRes.body || JSON.parse(geoRes.rawSent);
  assert.equal(geoPayload.type, 'FeatureCollection');
  assert.ok(Array.isArray(geoPayload.features) && geoPayload.features.length >= 30, 'GeoJSON FeatureCollection must contain >= 30 spatial features');

  // 2. /api/ai/rag-chunks
  const ragHandler = (await import('../pages/api/ai/rag-chunks.js')).default;
  const ragRes = createMockRes();
  ragHandler({ method: 'GET', query: {}, headers: {} }, ragRes);
  assert.equal(ragRes.statusCode, 200);
  const ragPayload = ragRes.body || JSON.parse(ragRes.rawSent);
  const totalChunks = ragPayload.total_chunks || ragPayload.totalChunks || ragPayload.chunks?.length || 0;
  assert.ok(totalChunks >= 100, `RAG chunks endpoint must emit >= 100 chunks (found ${totalChunks})`);
  assert.ok(ragPayload.chunks[0].if_then_because && ragPayload.chunks[0].doi === '10.5281/zenodo.15129481');

  // 3. /api/ai/freshness-ledger
  const freshHandler = (await import('../pages/api/ai/freshness-ledger.js')).default;
  const freshRes = createMockRes();
  freshHandler({ method: 'GET', query: {}, headers: {} }, freshRes);
  assert.equal(freshRes.statusCode, 200);
  const freshPayload = freshRes.body || JSON.parse(freshRes.rawSent);
  assert.equal(freshPayload.counts.calculatorsCount, 52);
  assert.equal(freshPayload.counts.mcpToolsCount, 70);
  assert.equal(freshPayload.counts.streamerCommandsCount, 44);

  // 4. /api/datasets/citation (.bib and .ris)
  const citHandler = (await import('../pages/api/datasets/citation.js')).default;
  const bibRes = createMockRes();
  citHandler({ method: 'GET', query: { format: 'bibtex' }, headers: {} }, bibRes);
  assert.equal(bibRes.statusCode, 200);
  assert.ok(String(bibRes.rawSent).includes('@techreport{'), 'BibTeX endpoint must emit @techreport entries');
  assert.ok(String(bibRes.rawSent).includes('10.5281/zenodo.15129481'), 'BibTeX endpoint must include Zenodo DOI');

  const risRes = createMockRes();
  citHandler({ method: 'GET', query: { format: 'ris' }, headers: {} }, risRes);
  assert.equal(risRes.statusCode, 200);
  assert.ok(String(risRes.rawSent).includes('TY  - RPRT'), 'RIS endpoint must emit TY  - RPRT entries');

  // 5. /api/og/formula-card
  const ogFormulaHandler = (await import('../pages/api/og/formula-card.js')).default;
  const svgRes = createMockRes();
  ogFormulaHandler({ method: 'GET', query: { slug: 'pot-odds' }, headers: {} }, svgRes);
  assert.equal(svgRes.statusCode, 200);
  assert.ok(String(svgRes.rawSent).includes('<svg') && String(svgRes.rawSent).includes('10.5281/zenodo.15129481'), 'Formula card SVG must render valid SVG with DOI');
});

test('GEO LAW 7: Multi-Spot Batch Solver, Natural-Language Question Solver, 70 MCP Tools & 44 Streamer/Discord Commands', async () => {
  const { MCP_TOOLS, MCP_PROMPTS, MCP_RESOURCE_TEMPLATES, executeMcpTool } = await import('../src/lib/mcp/mcpServer.mjs');
  assert.equal(MCP_TOOLS.length, 70);
  assert.equal(MCP_PROMPTS.length, 14);
  assert.equal(MCP_RESOURCE_TEMPLATES.length, 24);

  // Test new MCP tools
  const formulaMcp = JSON.parse((await executeMcpTool('lookup_poker_math_formula', { formula: 'mdf' })).content[0].text);
  assert.ok(formulaMcp.canonical_url.includes('/learn/formulas'));

  const corridorMcp = JSON.parse((await executeMcpTool('lookup_poker_travel_corridor', { corridor: 'nyc' })).content[0].text);
  assert.ok(corridorMcp.canonical_url.includes('/poker-rooms/corridors'));

  // Test /api/ai/batch-solve
  const batchHandler = (await import('../pages/api/ai/batch-solve.js')).default;
  const batchRes = createMockRes();
  await batchHandler(
    {
      method: 'POST',
      body: {
        spots: [
          { tool: 'pot-odds-calculator', params: { pot: 100, bet: 50 } },
          { tool: 'multiway-all-in-calculator', params: { p1: 100, p2: 180, p3: 250, eq1: 45, eq2: 32, eq3: 23 } },
        ],
      },
      query: {},
      headers: {},
    },
    batchRes
  );
  assert.equal(batchRes.statusCode, 200);
  assert.equal(batchRes.body.spots_count, 2);

  // Test /api/ai/solve-question
  const nlHandler = (await import('../pages/api/ai/solve-question.js')).default;
  const nlRes = createMockRes();
  await nlHandler(
    {
      method: 'GET',
      query: { q: 'I face a 75 bet into a 150 pot on the river, what pot odds and MDF do I need?' },
      headers: {},
    },
    nlRes
  );
  assert.equal(nlRes.statusCode, 200);
  assert.ok(nlRes.body.matchedTool && nlRes.body.canonicalUrl && nlRes.body.ifThenBecause);

  // Test /api/stream/discord
  const discordHandler = (await import('../pages/api/stream/discord.js')).default;
  const discRes = createMockRes();
  discordHandler({ method: 'GET', query: { cmd: '!3way', q: '45 30 25' }, headers: {} }, discRes);
  assert.equal(discRes.statusCode, 200);
  assert.ok(Array.isArray(discRes.body.embeds) && discRes.body.embeds.length === 1);
  assert.ok(Array.isArray(discRes.body.blocks) && discRes.body.blocks.length >= 1);
});

test('GEO LAW 8: Topic-Partitioned <20KB Fast-Context Corpora, Dedicated Segmented Sitemaps & HTTP Link Discovery Headers', async () => {
  const { renderTopicFastContextMarkdown } = await import('../pages/api/ai/corpus.js');

  for (const topic of ['tools', 'venues', 'gto', 'rules']) {
    const text = renderTopicFastContextMarkdown(topic);
    assert.ok(text && text.length > 500, `Topic corpus "${topic}" must return rich markdown`);
    assert.ok(Buffer.byteLength(text, 'utf8') < 20480, `Topic corpus "${topic}" must stay under 20KB for fast-context ingestion`);
    assert.ok(!text.includes('\u2014'), `Topic corpus "${topic}" must contain zero em dashes`);
  }

  assert.ok(fs.existsSync(path.join(ROOT, 'pages/sitemap-tools.xml.js')), 'pages/sitemap-tools.xml.js must exist');
  assert.ok(fs.existsSync(path.join(ROOT, 'pages/sitemap-authority.xml.js')), 'pages/sitemap-authority.xml.js must exist');
  const sitemapIndexSrc = read('pages/sitemap_index.xml.js');
  assert.ok(sitemapIndexSrc.includes('sitemap-tools.xml') && sitemapIndexSrc.includes('sitemap-authority.xml'), 'sitemap_index.xml.js must register sitemap-tools.xml and sitemap-authority.xml');

  const nextConfigSrc = read('next.config.js');
  for (const rewriteSource of [
    '/llms-tools.txt',
    '/llms-venues.txt',
    '/llms-gto.txt',
    '/llms-rules.txt',
    '/api/datasets/citation.bib',
    '/api/datasets/citation.ris',
  ]) {
    assert.ok(nextConfigSrc.includes(`source: '${rewriteSource}'`), `next.config.js must include rewrite for ${rewriteSource}`);
  }
  assert.ok(fs.existsSync(path.join(ROOT, 'pages/api/ai/geo-directory.geojson.js')), 'pages/api/ai/geo-directory.geojson.js must exist');
  assert.ok(nextConfigSrc.includes('rel="llms-txt"') && nextConfigSrc.includes('/.well-known/ai-facts.json'), 'next.config.js must advertise HTTP Link headers for /llms.txt and /.well-known/ai-facts.json');
});
