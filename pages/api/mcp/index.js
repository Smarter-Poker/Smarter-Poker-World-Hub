/**
 * /api/mcp
 * ═══════════════════════════════════════════════════════════════════════════
 * Public Model Context Protocol (MCP) Server Endpoint for AI Agents
 *
 * Implements both:
 * 1. HTTP JSON-RPC 2.0 (POST /api/mcp)
 * 2. Server-Sent Events (SSE) stream (GET /api/mcp)
 *
 * Exposes live poker room searches, tournament series, and schedules
 * directly to external autonomous agents and reasoning engines (Claude Desktop,
 * Cursor, OpenAI, ChatGPT, Windsurf, custom agents).
 */
import {
  handleMcpRpc,
  MCP_SERVER_INFO,
  MCP_TOOLS,
  MCP_PROMPTS,
  MCP_RESOURCE_TEMPLATES,
  buildA2AAgentCard,
} from '../../../src/lib/mcp/mcpServer.mjs';
import { originFrom } from '../../../src/lib/poker-near-me/seriesSeo.mjs';

export default async function handler(req, res) {
  // CORS Headers for AI Agent clients
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const origin = originFrom(req);

  // SSE (Server-Sent Events) endpoint: GET /api/mcp or GET /api/mcp?transport=sse
  if (req.method === 'GET') {
    if (String(req.query?.format || '').toLowerCase() === 'a2a') {
      return res.status(200).json(buildA2AAgentCard(origin));
    }

    const acceptHeader = String(req.headers.accept || '');
    const isSse = acceptHeader.includes('text/event-stream') || req.query.transport === 'sse';

    if (isSse) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      // Send endpoint initialization event
      const endpointUri = `${origin}/api/mcp`;
      res.write(`event: endpoint\ndata: ${JSON.stringify({ endpoint: endpointUri })}\n\n`);

      // Keep alive heartbeat ping
      const keepAlive = setInterval(() => {
        if (!res.writableEnded) {
          res.write(': keepalive\n\n');
        }
      }, 15000);

      req.on('close', () => {
        clearInterval(keepAlive);
      });

      return;
    }

    // Direct GET returns server capabilities and discovery information
    return res.status(200).json({
      name: MCP_SERVER_INFO.name,
      version: MCP_SERVER_INFO.version,
      description: 'Smarter.Poker Model Context Protocol (MCP) Server exposing 30 zero-auth poker mathematics, ICM/Chop, variance, GTO preflop, live cardroom, and TDA rules tools plus 15 resource templates.',
      protocolVersion: '2024-11-05',
      status: 'active',
      transport: ['http-jsonrpc', 'sse'],
      counts: {
        tools: MCP_TOOLS.length,
        prompts: MCP_PROMPTS.length,
        resourceTemplates: MCP_RESOURCE_TEMPLATES.length,
      },
      endpoints: {
        jsonrpc: `${origin}/api/mcp`,
        sse: `${origin}/api/mcp?transport=sse`,
        a2a_agent_card: `${origin}/api/mcp?format=a2a`,
        well_known: `${origin}/.well-known/mcp.json`,
        registry: `${origin}/.well-known/mcp-registry.json`,
        glama_directory: 'https://glama.ai/mcp/servers/Smarter-Poker/smarter-poker-mcp',
        glama_schema: 'https://glama.ai/mcp/servers/Smarter-Poker/smarter-poker-mcp/schema',
      },
      archival_identifiers: {
        mcp_doi: '10.5281/zenodo.24095057',
        mcp_doi_url: 'https://doi.org/10.5281/zenodo.24095057',
        datasets_doi: '10.5281/zenodo.24095049',
        datasets_doi_url: 'https://doi.org/10.5281/zenodo.24095049',
        zenodo_records: [
          'https://doi.org/10.5281/zenodo.24095049',
          'https://doi.org/10.5281/zenodo.24095057',
          'https://doi.org/10.5281/zenodo.24095560',
          'https://doi.org/10.5281/zenodo.24095564',
          'https://doi.org/10.5281/zenodo.24095597',
          'https://doi.org/10.5281/zenodo.24095602',
        ],
        mcp_swhid: 'swh:1:snp:02b8992833424620305edcfb730b3cf8add15747',
        datasets_swhid: 'swh:1:snp:ff23640ad24a3a825d320bae8621fd50ba58c16f',
      },
      tools_available: MCP_TOOLS.map((t) => t.name),
      tools: MCP_TOOLS,
      prompts: MCP_PROMPTS,
      resourceTemplates: MCP_RESOURCE_TEMPLATES,
      documentation: `${origin}/llms.txt`,
      openapi: `${origin}/api/openapi.json`,
    });
  }

  // JSON-RPC HTTP POST handler
  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const rpcResponse = await handleMcpRpc(body, { origin });
      return res.status(200).json(rpcResponse);
    } catch (err) {
      return res.status(400).json({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32700,
          message: `Parse error: ${err.message}`,
        },
      });
    }
  }

  res.setHeader('Allow', 'GET, POST, OPTIONS');
  return res.status(405).json({ error: 'Method Not Allowed' });
}
