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
