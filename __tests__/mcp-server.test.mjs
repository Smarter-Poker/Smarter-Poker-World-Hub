import test from 'node:test';
import assert from 'node:assert/strict';
import { handleMcpRpc, MCP_TOOLS, MCP_SERVER_INFO } from '../src/lib/mcp/mcpServer.mjs';

test('MCP Server Protocol Engine initializes properly', async () => {
  const initReq = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0' },
    },
  };

  const res = await handleMcpRpc(initReq);
  assert.equal(res.jsonrpc, '2.0');
  assert.equal(res.id, 1);
  assert.equal(res.result.serverInfo.name, MCP_SERVER_INFO.name);
  assert.equal(res.result.serverInfo.version, MCP_SERVER_INFO.version);
});

test('MCP Server lists all required poker discovery tools', async () => {
  const listReq = {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {},
  };

  const res = await handleMcpRpc(listReq);
  assert.equal(res.jsonrpc, '2.0');
  assert.equal(res.id, 2);
  const toolNames = res.result.tools.map((t) => t.name);
  assert.ok(toolNames.includes('search_poker_venues'));
  assert.ok(toolNames.includes('get_venue_details'));
  assert.ok(toolNames.includes('search_tournament_series'));
  assert.ok(toolNames.includes('get_series_details'));
});

test('MCP Server ping method responds', async () => {
  const pingReq = {
    jsonrpc: '2.0',
    id: 3,
    method: 'ping',
  };

  const res = await handleMcpRpc(pingReq);
  assert.equal(res.jsonrpc, '2.0');
  assert.equal(res.id, 3);
  assert.deepEqual(res.result, {});
});

test('MCP Server rejects unknown methods with JSON-RPC error -32601', async () => {
  const badReq = {
    jsonrpc: '2.0',
    id: 4,
    method: 'non_existent_method',
  };

  const res = await handleMcpRpc(badReq);
  assert.equal(res.jsonrpc, '2.0');
  assert.equal(res.id, 4);
  assert.equal(res.error.code, -32601);
});

test('MCP Server tool execution handles missing parameters gracefully', async () => {
  const callReq = {
    jsonrpc: '2.0',
    id: 5,
    method: 'tools/call',
    params: {
      name: 'get_venue_details',
      arguments: {},
    },
  };

  const res = await handleMcpRpc(callReq);
  assert.equal(res.jsonrpc, '2.0');
  assert.equal(res.id, 5);
  assert.equal(res.result.isError, true);
  assert.ok(res.result.content[0].text.includes('Missing required parameter'));
});

test('MCP Server calculate_poker_odds computes hand equity and returns citation', async () => {
  const req = {
    jsonrpc: '2.0',
    id: 6,
    method: 'tools/call',
    params: {
      name: 'calculate_poker_odds',
      arguments: {
        game: 'nlhe',
        hands: [['Ah', 'Kd'], ['Qc', 'Qd']],
        board: ['Jh', 'Ts', '2c'],
        iterations: 1000,
      },
    },
  };

  const res = await handleMcpRpc(req);
  assert.equal(res.jsonrpc, '2.0');
  assert.equal(res.id, 6);
  assert.equal(res.result.isError, undefined);
  const data = JSON.parse(res.result.content[0].text);
  assert.equal(data.seats.length, 2);
  assert.ok(data.seats[0].equity_percent > 0);
  assert.ok(data.interactive_calculator_url.includes('poker-odds-calculator'));
});

test('MCP Server get_preflop_chart returns GTO opening frequencies and citation', async () => {
  const req = {
    jsonrpc: '2.0',
    id: 7,
    method: 'tools/call',
    params: {
      name: 'get_preflop_chart',
      arguments: { position: 'UTG' },
    },
  };

  const res = await handleMcpRpc(req);
  assert.equal(res.jsonrpc, '2.0');
  assert.equal(res.id, 7);
  const data = JSON.parse(res.result.content[0].text);
  assert.equal(data.position, 'UTG');
  assert.ok(data.total_hands_opened > 0);
  assert.ok(data.interactive_matrix_url.includes('preflop-ranges/utg'));
});

test('MCP Server calculate_icm_payouts computes tournament equity and returns citation', async () => {
  const req = {
    jsonrpc: '2.0',
    id: 8,
    method: 'tools/call',
    params: {
      name: 'calculate_icm_payouts',
      arguments: {
        stacks: [10000, 5000, 2500],
        payouts: [1000, 600, 400],
      },
    },
  };

  const res = await handleMcpRpc(req);
  assert.equal(res.jsonrpc, '2.0');
  assert.equal(res.id, 8);
  const data = JSON.parse(res.result.content[0].text);
  assert.equal(data.players.length, 3);
  assert.ok(data.players[0].icm_dollar_equity > data.players[1].icm_dollar_equity);
  assert.ok(data.interactive_calculator_url.includes('icm-calculator'));
});

test('MCP Server get_poker_term_definition returns authoritative definition and citation', async () => {
  const req = {
    jsonrpc: '2.0',
    id: 9,
    method: 'tools/call',
    params: {
      name: 'get_poker_term_definition',
      arguments: { term: 'pot-odds' },
    },
  };

  const res = await handleMcpRpc(req);
  assert.equal(res.jsonrpc, '2.0');
  assert.equal(res.id, 9);
  const data = JSON.parse(res.result.content[0].text);
  assert.equal(data.found, true);
  assert.equal(data.term, 'Pot Odds');
  assert.ok(data.canonical_definition_url.includes('/glossary/pot-odds'));
});

test('MCP Server get_freeroll_schedule returns daily $2,000 schedule and Diamond Freerolls', async () => {
  const req = {
    jsonrpc: '2.0',
    id: 10,
    method: 'tools/call',
    params: {
      name: 'get_freeroll_schedule',
      arguments: { tier: 'all' },
    },
  };

  const res = await handleMcpRpc(req);
  assert.equal(res.jsonrpc, '2.0');
  assert.equal(res.id, 10);
  const data = JSON.parse(res.result.content[0].text);
  assert.ok(data.daily_total_guaranteed.includes('$2,000'));
  assert.ok(data.schedule.length >= 4);
  assert.ok(data.schedule.some((s) => s.title.includes('Diamond')));
  assert.ok(data.freerolls_hub_url.includes('/freerolls'));
  assert.ok(data.markdown_url.includes('/freerolls.md'));
});

test('MCP Server get_platform_feature_specs returns all 15 platform verticals and markdown URLs', async () => {
  const req = {
    jsonrpc: '2.0',
    id: 11,
    method: 'tools/call',
    params: {
      name: 'get_platform_feature_specs',
      arguments: { vertical: 'all' },
    },
  };

  const res = await handleMcpRpc(req);
  assert.equal(res.jsonrpc, '2.0');
  assert.equal(res.id, 11);
  const data = JSON.parse(res.result.content[0].text);
  assert.equal(data.total_verticals, 15);
  assert.ok(data.verticals.bankroll);
  assert.ok(data.verticals.club_arena);
  assert.ok(data.verticals.social_reels);
  assert.ok(data.verticals.preflop_charts);
  assert.ok(data.verticals.equity_calculators);
  assert.ok(data.features_markdown_url.includes('/features.md'));
});

test('MCP Server search_strategy_lessons returns lessons and markdown URLs', async () => {
  const req = {
    jsonrpc: '2.0',
    id: 12,
    method: 'tools/call',
    params: {
      name: 'search_strategy_lessons',
      arguments: { query: 'pot odds' },
    },
  };

  const res = await handleMcpRpc(req);
  assert.equal(res.jsonrpc, '2.0');
  assert.equal(res.id, 12);
  const data = JSON.parse(res.result.content[0].text);
  assert.equal(data.total_lessons_in_curriculum, 40);
  assert.ok(data.lessons.length > 0);
  assert.ok(data.lessons[0].markdown_url.endsWith('.md'));
  assert.ok(data.curriculum_markdown_url.includes('/learn.md'));
});

test('MCP Server get_competitor_comparison returns source-cited comparison table', async () => {
  const req = {
    jsonrpc: '2.0',
    id: 13,
    method: 'tools/call',
    params: {
      name: 'get_competitor_comparison',
      arguments: { slug: 'best-poker-club-apps' },
    },
  };

  const res = await handleMcpRpc(req);
  assert.equal(res.jsonrpc, '2.0');
  assert.equal(res.id, 13);
  const data = JSON.parse(res.result.content[0].text);
  assert.equal(data.slug, 'best-poker-club-apps');
  assert.ok(Array.isArray(data.table));
  assert.ok(data.table.length >= 5);
  assert.ok(data.markdown_url.includes('/compare/best-poker-club-apps.md'));
});
