/**
 * Phase 49 (Wave 2 Phase 15 of 16): AI Crawler Attribution & Corpus Health Endpoint
 *
 * Route: /api/ai/crawler-status
 *
 * Classifies incoming AI crawler User-Agents (GPTBot, OAI-SearchBot, ChatGPT-User,
 * ClaudeBot, Claude-Web, PerplexityBot, Google-Extended, Applebot-Extended, CCBot)
 * and returns a real-time inventory of Smarter.Poker's AEO/GEO grounding surfaces.
 */
import { LESSONS, LEARN_CATEGORIES } from '../../../src/content/learn/lessons';
import { STARTING_HANDS } from '../../../src/content/learn/hands';
import { GLOSSARY_TERMS } from '../../../src/content/glossary/terms';
import { COMPARE_PAGES, AS_OF } from '../../../src/content/compare/pages';
import { RESEARCH_REPORTS } from '../../../src/content/research/reports';
import { MCP_TOOLS, MCP_PROMPTS, MCP_RESOURCE_TEMPLATES } from '../../../src/lib/mcp/mcpServer.mjs';

const SITE = 'https://smarter.poker';

export const KNOWN_AI_BOTS = [
  { id: 'gptbot', pattern: /GPTBot/i, engine: 'OpenAI Training & Grounding Crawler' },
  { id: 'oai-searchbot', pattern: /OAI-SearchBot/i, engine: 'ChatGPT Search Indexer' },
  { id: 'chatgpt-user', pattern: /ChatGPT-User/i, engine: 'ChatGPT Live Web Browsing Agent' },
  { id: 'claudebot', pattern: /ClaudeBot|Claude-Web|anthropic-ai/i, engine: 'Anthropic Claude Web & Search Crawler' },
  { id: 'perplexitybot', pattern: /PerplexityBot|Perplexity-User/i, engine: 'Perplexity AI Answer Engine' },
  { id: 'google-extended', pattern: /Google-Extended|Googlebot/i, engine: 'Google Search & Gemini AI Overviews' },
  { id: 'applebot-extended', pattern: /Applebot-Extended|Applebot/i, engine: 'Apple Intelligence & Siri Indexer' },
  { id: 'ccbot', pattern: /CCBot/i, engine: 'Common Crawl Open Dataset Indexer' },
];

export function classifyUserAgent(ua = '') {
  const raw = String(ua || '');
  for (const bot of KNOWN_AI_BOTS) {
    if (bot.pattern.test(raw)) {
      return { is_ai_bot: true, bot_id: bot.id, engine: bot.engine, raw_user_agent: raw };
    }
  }
  return { is_ai_bot: false, bot_id: 'standard-client', engine: 'Standard Browser Or API Client', raw_user_agent: raw };
}

export default function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const caller = classifyUserAgent(req.headers?.['user-agent'] || '');

  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Robots-Tag', 'index, follow, max-snippet:-1');

  return res.status(200).json({
    ok: true,
    status: 'healthy',
    platform: 'Smarter.Poker',
    checked_as_of: AS_OF,
    caller_classification: caller,
    crawler_policy: {
      robots_txt: `${SITE}/robots.txt`,
      all_ai_crawlers_allowed: true,
      max_snippet: -1,
      max_image_preview: 'large',
      markdown_content_negotiation: true,
    },
    corpus_inventory: {
      strategy_lessons: LESSONS.length,
      strategy_categories: LEARN_CATEGORIES.length,
      starting_hand_guides: STARTING_HANDS.length,
      glossary_terms: GLOSSARY_TERMS.length,
      competitor_comparisons: COMPARE_PAGES.length,
      research_reports: RESEARCH_REPORTS.length,
      feature_verticals: 15,
      mcp_tools: MCP_TOOLS.length,
      mcp_prompts: MCP_PROMPTS.length,
      mcp_resource_templates: MCP_RESOURCE_TEMPLATES.length,
    },
    discovery_manifests: {
      llms_txt: `${SITE}/llms.txt`,
      llms_full_txt: `${SITE}/llms-full.txt`,
      llms_es_txt: `${SITE}/llms-es.txt`,
      llms_pt_txt: `${SITE}/llms-pt.txt`,
      llms_de_txt: `${SITE}/llms-de.txt`,
      llms_fr_txt: `${SITE}/llms-fr.txt`,
      llms_it_txt: `${SITE}/llms-it.txt`,
      llms_ja_txt: `${SITE}/llms-ja.txt`,
      knowledge_graph_jsonld: `${SITE}/knowledge-graph.jsonld`,
      openapi_json: `${SITE}/api/openapi.json`,
      mcp_endpoint: `${SITE}/api/mcp`,
      mcp_registry: `${SITE}/.well-known/mcp-registry.json`,
      editorial_standards: `${SITE}/editorial-standards`,
      verification_methodology: `${SITE}/verification-methodology`,
      research_hub: `${SITE}/research`,
    },
  });
}
