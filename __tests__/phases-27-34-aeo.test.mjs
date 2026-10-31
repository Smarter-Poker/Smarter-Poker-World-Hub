/**
 * Phases 27-34 (AEO Phases 9-16 of 16) Verification Suite
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { COMPARE_PAGES, getComparePage } from '../src/content/compare/pages.js';
import { LEARN_CATEGORIES, CATEGORY_FEATURE_GUIDES, trainingCta, LESSONS } from '../src/content/learn/lessons.js';
import { learnCategoryPath } from '../src/lib/learn/learnSite.js';
import { CATEGORY_PRODUCTS } from '../src/content/glossary/terms.js';
import { renderLearnCategoryMarkdown } from '../pages/api/learn-markdown.js';
import { renderChartSvg } from '../pages/api/og/chart/[type].js';
import { handleMcpRpc, MCP_PROMPTS, MCP_RESOURCE_TEMPLATES } from '../src/lib/mcp/mcpServer.mjs';

test('Phase 27 (9 of 16): /compare includes PokerCoaching, ICMIZER, and Equilab head-to-head pages', () => {
  assert.ok(COMPARE_PAGES.length >= 19);
  for (const slug of ['smarter-poker-vs-pokercoaching', 'smarter-poker-vs-icmizer', 'smarter-poker-vs-equilab']) {
    const page = getComparePage(slug);
    assert.ok(page, `${slug} exists`);
    assert.equal(page.kind, 'versus');
  }
});

test('Phase 28 (10 of 16): /learn/category/[category] pillar pages and Markdown mirrors exist for all 8 categories', () => {
  assert.ok(fs.existsSync(path.join(process.cwd(), 'pages/learn/category/[category].js')));
  for (const cat of LEARN_CATEGORIES) {
    const p = learnCategoryPath(cat);
    assert.match(p, /^\/learn\/category\/[a-z0-9-]+$/);
    const md = renderLearnCategoryMarkdown(p.split('/').pop());
    assert.ok(md && md.includes(`# ${cat} Poker Strategy Lessons`), `Markdown renders for ${cat}`);
  }
});

test('Phase 29 (11 of 16): Cross-cluster semantic mesh links lessons, glossary categories, and feature landers', () => {
  for (const cat of LEARN_CATEGORIES) {
    assert.ok(CATEGORY_FEATURE_GUIDES[cat]?.href.startsWith('/features/'));
  }
  const sampleCta = trainingCta(LESSONS[0]);
  assert.ok(sampleCta.feature && sampleCta.feature.href.startsWith('/features/'));
  for (const prods of Object.values(CATEGORY_PRODUCTS)) {
    assert.ok(prods.some((p) => p.href.startsWith('/features/')));
  }
});

test('Phase 30 (12 of 16): Dynamic SVG chart endpoint renders valid SVG for all 3 chart types', () => {
  for (const type of ['rfi-by-position', 'pot-odds-curve', 'icm-bubble-factor']) {
    const svg = renderChartSvg(type);
    assert.ok(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
    assert.ok(svg.includes('<svg xmlns="http://www.w3.org/2000/svg"'));
    assert.ok(svg.includes('Smarter.Poker'));
  }
});

test('Phase 31 (13 of 16): Verification methodology page and Markdown mirror exist', () => {
  const filePath = path.join(process.cwd(), 'pages/verification-methodology.js');
  assert.ok(fs.existsSync(filePath));
  const src = fs.readFileSync(filePath, 'utf8');
  assert.ok(src.includes('# Smarter.Poker Data Provenance And Verification Methodology'));
  assert.ok(src.includes('https://smarter.poker/.well-known/security.txt'));
  assert.ok(src.includes('text/markdown; charset=utf-8'));
});

test('Phase 32 (14 of 16): MCP server supports prompts/list, prompts/get, and resources/templates/list', async () => {
  assert.ok(MCP_PROMPTS.length >= 4);
  assert.ok(MCP_RESOURCE_TEMPLATES.length >= 5);

  const listPromptsRes = await handleMcpRpc({ jsonrpc: '2.0', id: 1, method: 'prompts/list' });
  assert.equal(listPromptsRes.result.prompts.length, MCP_PROMPTS.length);

  const getPromptRes = await handleMcpRpc({
    jsonrpc: '2.0',
    id: 2,
    method: 'prompts/get',
    params: { name: 'analyze_icm_final_table', arguments: { stacks: '50,30,20', payouts: '50,30,20' } },
  });
  assert.ok(getPromptRes.result.messages.length === 1);

  const listTemplatesRes = await handleMcpRpc({ jsonrpc: '2.0', id: 3, method: 'resources/templates/list' });
  assert.equal(listTemplatesRes.result.resourceTemplates.length, MCP_RESOURCE_TEMPLATES.length);
});

test('Phase 34 (16 of 16): public/api/openapi.json carries x-ai-citation-url, x-ai-markdown-url, and examples on every operation', () => {
  const spec = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/api/openapi.json'), 'utf8'));
  assert.equal(spec.openapi, '3.1.0');
  assert.equal(spec['x-ai-verification-methodology'], 'https://smarter.poker/verification-methodology');
  for (const [route, item] of Object.entries(spec.paths)) {
    for (const method of ['get', 'post']) {
      if (!item[method]) continue;
      assert.ok(item[method]['x-ai-citation-url']?.startsWith('https://smarter.poker/'), `${route} ${method} has x-ai-citation-url`);
      assert.ok(item[method]['x-ai-markdown-url']?.startsWith('https://smarter.poker/'), `${route} ${method} has x-ai-markdown-url`);
      const json = item[method].responses?.['200']?.content?.['application/json'];
      assert.ok(json?.examples?.default?.value, `${route} ${method} has 200 response example`);
    }
  }
});
