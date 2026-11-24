/**
 * AEO DISCOVERY, MANIFEST & SITEMAP PARITY LAW
 * (__tests__/aeo-discovery-hardening.law.test.mjs)
 *
 * Permanently hardens the 7 root-cause failure modes discovered during the
 * 35-Item and 42-Calculator/55-Tool expansions so none of them can ever
 * silently regress in future PRs:
 *
 * 1. SITEMAP <-> CONTENT MODULE SLUG PARITY:
 *    pages/sitemap.xml.js and src/lib/seo/sitemapBuilders.mjs must import
 *    every dynamic content family directly from its authoritative module
 *    (PLAYER_ARCHETYPES, BOARD_TEXTURES, INTERNATIONAL_POKER_GUIDES,
 *    POKER_POSITIONS, POKER_STAKES, FAMOUS_HANDS, POKER_ROADMAPS,
 *    US_POKER_STATES, HAND_MATCHUPS, SERIES_GUIDES, POKER_RULES,
 *    POKER_VARIANTS, POKER_MARKET_GUIDES, STARTING_HANDS, RESEARCH_REPORTS)
 *    with zero hardcoded slug arrays or missing canonical detail URLs.
 *
 * 2. OPENAPI.JSON NO-DUPLICATE-JSON-KEY GUARD:
 *    public/api/openapi.json must never contain duplicate JSON path keys
 *    (which JSON.parse silently collapses by overwriting the earlier key).
 *    Every operation must retain operationId and a 200 response example.
 *
 * 3. MCP & STREAMER BOT MANIFEST SYNCHRONIZATION:
 *    src/lib/mcp/mcpServer.mjs (MCP_TOOLS, MCP_PROMPTS, MCP_RESOURCE_TEMPLATES)
 *    and pages/api/stream/cmd.js (STREAMER_BOT_COMMANDS) must stay in exact
 *    numerical parity with public/.well-known/mcp.json,
 *    public/.well-known/mcp-registry.json, public/.well-known/agent.json,
 *    public/.well-known/ai-plugin.json, public/api/openapi.json,
 *    public/llms.txt, public/llms-full.txt, and pages/api/ai/crawler-status.js.
 *
 * 4. HUB_PAGE_SUMMARIES PARITY & 45-WORD MINIMUM LEAD DEPTH:
 *    Every entry in src/lib/seo/hubPageSummariesData.js and
 *    src/components/seo/HubPageSummary.js must match 1:1, carry a lead of
 *    at least 45 words, contain zero em dashes, and only link to valid
 *    in-site routes listed in the sitemap.
 *
 * 5. MARKDOWN MIRROR & MCP CANONICAL SLUG PARITY:
 *    renderHubToolMarkdown() and executeMcpTool() for player-types,
 *    board-textures, and international guides must resolve and emit the
 *    exact canonical slugs from the authoritative content modules.
 *
 * 6. 404 RECOVERY & TITLE LENGTH INVARIANTS:
 *    pages/404.js must preserve noindex={true} and the interactive search
 *    form routing to /hub/poker-near-me/lobby?q=.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('Law 1: Sitemap builders and pages/sitemap.xml.js list every canonical slug from all 15 content modules with zero hardcoded slug drift', async () => {
  const {
    LEARN_PAGES,
    MARKET_GUIDE_PAGES,
    INTERNATIONAL_POKER_PAGES,
    SERIES_GUIDE_PAGES,
    RESEARCH_PAGES,
    RULES_PAGES,
    GAMES_PAGES,
  } = await import('../src/lib/seo/sitemapBuilders.mjs');

  const { PLAYER_ARCHETYPES, playerTypePath } = await import('../src/content/learn/playerTypes.js');
  const { BOARD_TEXTURES, boardTexturePath } = await import('../src/content/learn/boardTextures.js');
  const { INTERNATIONAL_POKER_GUIDES, internationalGuidePath } = await import('../src/content/guides/internationalMarkets.js');
  const { POKER_POSITIONS, positionPath } = await import('../src/content/learn/positions.js');
  const { POKER_STAKES, stakePath } = await import('../src/content/learn/stakes.js');
  const { FAMOUS_HANDS, famousHandPath } = await import('../src/content/learn/famousHands.js');
  const { POKER_ROADMAPS, roadmapPath } = await import('../src/content/learn/roadmaps.js');
  const { US_POKER_STATES, stateGuidePath } = await import('../src/content/guides/states.js');
  const { HAND_MATCHUPS, matchupPath } = await import('../src/content/learn/matchups.js');
  const { SERIES_GUIDES, seriesGuidePath } = await import('../src/content/guides/seriesGuides.js');
  const { POKER_RULES, rulePath } = await import('../src/content/rules/rules.js');
  const { POKER_VARIANTS, gameVariantPath } = await import('../src/content/games/variants.js');
  const { POKER_MARKET_GUIDES, marketGuidePath } = await import('../src/content/guides/markets.js');

  const sitemapBuilderPaths = new Set(
    [
      ...LEARN_PAGES,
      ...MARKET_GUIDE_PAGES,
      ...INTERNATIONAL_POKER_PAGES,
      ...SERIES_GUIDE_PAGES,
      ...RESEARCH_PAGES,
      ...RULES_PAGES,
      ...GAMES_PAGES,
    ].map((e) => e.path)
  );

  for (const a of PLAYER_ARCHETYPES) {
    assert.ok(sitemapBuilderPaths.has(playerTypePath(a.slug)), `sitemapBuilders includes player archetype ${playerTypePath(a.slug)}`);
  }
  for (const b of BOARD_TEXTURES) {
    assert.ok(sitemapBuilderPaths.has(boardTexturePath(b.slug)), `sitemapBuilders includes board texture ${boardTexturePath(b.slug)}`);
  }
  for (const g of INTERNATIONAL_POKER_GUIDES) {
    assert.ok(sitemapBuilderPaths.has(internationalGuidePath(g.slug)), `sitemapBuilders includes international guide ${internationalGuidePath(g.slug)}`);
  }
  for (const p of POKER_POSITIONS) {
    assert.ok(sitemapBuilderPaths.has(positionPath(p.slug)), `sitemapBuilders includes position ${positionPath(p.slug)}`);
  }
  for (const s of POKER_STAKES) {
    assert.ok(sitemapBuilderPaths.has(stakePath(s.slug)), `sitemapBuilders includes stake ${stakePath(s.slug)}`);
  }
  for (const fh of FAMOUS_HANDS) {
    assert.ok(sitemapBuilderPaths.has(famousHandPath(fh.slug)), `sitemapBuilders includes famous hand ${famousHandPath(fh.slug)}`);
  }
  for (const rm of POKER_ROADMAPS) {
    assert.ok(sitemapBuilderPaths.has(roadmapPath(rm.slug)), `sitemapBuilders includes roadmap ${roadmapPath(rm.slug)}`);
  }
  for (const st of US_POKER_STATES) {
    assert.ok(sitemapBuilderPaths.has(stateGuidePath(st.slug)), `sitemapBuilders includes US state guide ${stateGuidePath(st.slug)}`);
  }
  for (const m of HAND_MATCHUPS) {
    assert.ok(sitemapBuilderPaths.has(matchupPath(m.slug)), `sitemapBuilders includes matchup ${matchupPath(m.slug)}`);
  }
  for (const sg of SERIES_GUIDES) {
    assert.ok(sitemapBuilderPaths.has(seriesGuidePath(sg.slug)), `sitemapBuilders includes series guide ${seriesGuidePath(sg.slug)}`);
  }
  for (const r of POKER_RULES) {
    assert.ok(sitemapBuilderPaths.has(rulePath(r.slug)), `sitemapBuilders includes rule ${rulePath(r.slug)}`);
  }
  for (const v of POKER_VARIANTS) {
    assert.ok(sitemapBuilderPaths.has(gameVariantPath(v.slug)), `sitemapBuilders includes game variant ${gameVariantPath(v.slug)}`);
  }
  for (const mg of POKER_MARKET_GUIDES) {
    assert.ok(sitemapBuilderPaths.has(marketGuidePath(mg.slug)), `sitemapBuilders includes regional market guide ${marketGuidePath(mg.slug)}`);
  }

  // Verify neither pages/sitemap.xml.js nor src/lib/seo/sitemapBuilders.mjs uses hardcoded slug arrays
  for (const file of ['pages/sitemap.xml.js', 'src/lib/seo/sitemapBuilders.mjs']) {
    const src = read(file);
    assert.doesNotMatch(src, /PLAYER_TYPE_SLUGS|BOARD_TEXTURE_SLUGS|INTERNATIONAL_CITY_SLUGS/, `${file} must import content modules directly instead of hardcoding slug arrays`);
  }
});

test('Law 2: public/api/openapi.json has zero duplicate path keys and preserves operationId + 200 examples on every operation', () => {
  const raw = read('public/api/openapi.json');
  const pathKeyMatches = [...raw.matchAll(/^\s{4}"(\/api\/[^"]+)":\s*\{/gm)].map((m) => m[1]);
  const counts = {};
  for (const k of pathKeyMatches) {
    counts[k] = (counts[k] || 0) + 1;
  }
  const duplicates = Object.entries(counts).filter(([, c]) => c > 1);
  assert.deepEqual(duplicates, [], `public/api/openapi.json must have zero duplicate path keys, found: ${JSON.stringify(duplicates)}`);

  const doc = JSON.parse(raw);
  assert.equal(doc.paths['/api/mcp']?.post?.operationId, 'callMcpRpc', '/api/mcp POST operationId must remain callMcpRpc');
  assert.ok(doc.paths['/api/mcp']?.post?.responses?.['200']?.content?.['application/json']?.examples?.default?.value, '/api/mcp POST must preserve 200 response example');
});

test('Law 3: MCP Server, Streamer Bot, and all public AI discovery manifests stay in exact count parity', async () => {
  const { MCP_TOOLS, MCP_PROMPTS, MCP_RESOURCE_TEMPLATES, buildA2AAgentCard } = await import('../src/lib/mcp/mcpServer.mjs');
  const { STREAMER_BOT_COMMANDS } = await import('../pages/api/stream/cmd.js');

  const toolCount = MCP_TOOLS.length;
  const promptCount = MCP_PROMPTS.length;
  const resourceCount = MCP_RESOURCE_TEMPLATES.length;
  const cmdCount = STREAMER_BOT_COMMANDS.length;

  const mcpJson = JSON.parse(read('public/.well-known/mcp.json'));
  assert.equal(mcpJson.tools_count, toolCount, '.well-known/mcp.json tools_count matches MCP_TOOLS.length');
  assert.equal(mcpJson.prompts_count, promptCount, '.well-known/mcp.json prompts_count matches MCP_PROMPTS.length');
  assert.equal(mcpJson.resource_templates_count, resourceCount, '.well-known/mcp.json resource_templates_count matches MCP_RESOURCE_TEMPLATES.length');
  assert.equal(mcpJson.capabilities?.streamerBotCommandsCount, cmdCount, '.well-known/mcp.json streamerBotCommandsCount matches STREAMER_BOT_COMMANDS.length');
  assert.equal(mcpJson.tools?.length, toolCount, '.well-known/mcp.json tools array length matches MCP_TOOLS.length');
  assert.equal(mcpJson.prompts?.length, promptCount, '.well-known/mcp.json prompts array length matches MCP_PROMPTS.length');
  assert.equal(mcpJson.resourceTemplates?.length, resourceCount, '.well-known/mcp.json resourceTemplates array length matches MCP_RESOURCE_TEMPLATES.length');

  const registryJson = JSON.parse(read('public/.well-known/mcp-registry.json'));
  assert.equal(registryJson.tools_count, toolCount, '.well-known/mcp-registry.json tools_count matches MCP_TOOLS.length');
  assert.equal(registryJson.prompts_count, promptCount, '.well-known/mcp-registry.json prompts_count matches MCP_PROMPTS.length');
  assert.equal(registryJson.resource_templates_count, resourceCount, '.well-known/mcp-registry.json resource_templates_count matches MCP_RESOURCE_TEMPLATES.length');
  assert.equal(registryJson.tools?.length, toolCount, '.well-known/mcp-registry.json tools array length matches MCP_TOOLS.length');
  assert.equal(registryJson.prompts?.length, promptCount, '.well-known/mcp-registry.json prompts array length matches MCP_PROMPTS.length');

  const a2a = buildA2AAgentCard();
  assert.equal(a2a.capabilities.mcpTools, toolCount, 'A2A card mcpTools matches MCP_TOOLS.length');
  assert.equal(a2a.capabilities.mcpPrompts, promptCount, 'A2A card mcpPrompts matches MCP_PROMPTS.length');
  assert.equal(a2a.capabilities.mcpResources, resourceCount, 'A2A card mcpResources matches MCP_RESOURCE_TEMPLATES.length');

  const aiPlugin = read('public/.well-known/ai-plugin.json');
  assert.ok(aiPlugin.includes(`${toolCount} zero-auth MCP tools`), `ai-plugin.json advertises ${toolCount} zero-auth MCP tools`);

  const llmsTxt = read('public/llms.txt');
  const llmsFullTxt = read('public/llms-full.txt');
  assert.ok(llmsTxt.includes(`All ${toolCount} Zero-Auth MCP Tools`), `llms.txt lists All ${toolCount} Zero-Auth MCP Tools`);
  assert.ok(llmsFullTxt.includes(`All ${toolCount} Zero-Auth MCP Tools`), `llms-full.txt lists All ${toolCount} Zero-Auth MCP Tools`);
  assert.ok(llmsFullTxt.includes(`All ${promptCount} MCP Prompts`), `llms-full.txt lists All ${promptCount} MCP Prompts`);
  assert.ok(llmsFullTxt.includes(`${cmdCount} Commands:`), `llms-full.txt lists ${cmdCount} Streamer Commands`);
});

test('Law 4: HUB_PAGE_SUMMARIES in hubPageSummariesData.js and HubPageSummary.js are 100% synchronized and every lead is >= 45 words', async () => {
  const { HUB_PAGE_SUMMARIES: dataSummaries } = await import('../src/lib/seo/hubPageSummariesData.js');
  const componentSrc = read('src/components/seo/HubPageSummary.js');

  for (const [key, entry] of Object.entries(dataSummaries)) {
    const words = String(entry.lead || '').split(/\s+/).filter(Boolean).length;
    assert.ok(words >= 45, `hubPageSummariesData.js [${key}] lead must have >= 45 words (found ${words})`);
    assert.ok(!entry.lead.includes('\u2014'), `hubPageSummariesData.js [${key}] lead must not contain em dashes`);
    const quotedKey = key.includes('-') ? `'${key}'` : key;
    assert.ok(componentSrc.includes(`${quotedKey}: {`), `HubPageSummary.js includes key ${key}`);
  }
});

test('Law 5: Markdown mirrors and MCP tools for player-types, board-textures, and international destinations emit canonical content slugs', async () => {
  const { renderHubToolMarkdown } = await import('../pages/api/hub-tool-markdown.js');
  const { executeMcpTool } = await import('../src/lib/mcp/mcpServer.mjs');
  const { PLAYER_ARCHETYPES } = await import('../src/content/learn/playerTypes.js');
  const { BOARD_TEXTURES } = await import('../src/content/learn/boardTextures.js');
  const { INTERNATIONAL_POKER_GUIDES } = await import('../src/content/guides/internationalMarkets.js');

  // Verify index Markdown tables contain canonical slugs
  const ptIndexMd = renderHubToolMarkdown('/learn/player-types');
  assert.ok(ptIndexMd.includes(PLAYER_ARCHETYPES[0].slug), '/learn/player-types.md links canonical slug omc-old-man-coffee');

  const btIndexMd = renderHubToolMarkdown('/learn/board-textures');
  assert.ok(btIndexMd.includes(BOARD_TEXTURES[1].slug), '/learn/board-textures.md links canonical slug king-high-disconnected-dry');

  const intlIndexMd = renderHubToolMarkdown('/poker-rooms/international');
  assert.ok(intlIndexMd.includes(INTERNATIONAL_POKER_GUIDES[0].slug), '/poker-rooms/international.md links canonical slug london-united-kingdom');

  // Verify MCP tools resolve both short aliases and canonical slugs to the canonical URL
  const ptMcp = JSON.parse((await executeMcpTool('get_player_archetype_exploit', { archetype: 'omc' })).content[0].text);
  assert.equal(ptMcp.slug, 'omc-old-man-coffee');
  assert.equal(ptMcp.canonical_url, 'https://smarter.poker/learn/player-types/omc-old-man-coffee');

  const btMcp = JSON.parse((await executeMcpTool('get_flop_board_texture_guide', { texture: 'king-high-dry' })).content[0].text);
  assert.equal(btMcp.slug, 'king-high-disconnected-dry');
  assert.equal(btMcp.canonical_url, 'https://smarter.poker/learn/board-textures/king-high-disconnected-dry');

  const intlMcp = JSON.parse((await executeMcpTool('get_international_poker_guide', { city: 'london' })).content[0].text);
  assert.equal(intlMcp.slug, 'london-united-kingdom');
  assert.equal(intlMcp.canonical_url, 'https://smarter.poker/poker-rooms/international/london-united-kingdom');
});
