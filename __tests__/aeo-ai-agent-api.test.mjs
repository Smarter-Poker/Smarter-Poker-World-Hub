/**
 * Test Suite: AEO Phase 6 Public AI Agent API & Machine Discovery
 * Validates OpenAPI 3.1.0 specification, .well-known/ai-plugin.json manifest,
 * and /api/ai endpoints for autonomous agents and LLM tool calling.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('public/.well-known/ai-plugin.json exists and conforms to OpenAI plugin manifest schema', () => {
  const raw = read('public/.well-known/ai-plugin.json');
  const manifest = JSON.parse(raw);

  assert.equal(manifest.schema_version, 'v1');
  assert.equal(manifest.name_for_model, 'smarter_poker');
  assert.ok(manifest.name_for_human);
  assert.ok(manifest.description_for_model.includes('poker venue discovery'));
  assert.equal(manifest.api.type, 'openapi');
  assert.equal(manifest.api.url, 'https://smarter.poker/api/openapi.json');
  assert.equal(manifest.auth.type, 'none');
  assert.ok(manifest.logo_url);
  assert.ok(manifest.legal_info_url);
});

test('public/api/openapi.json exists and validates as valid OpenAPI 3.1.0 document', () => {
  const raw = read('public/api/openapi.json');
  const doc = JSON.parse(raw);

  assert.equal(doc.openapi, '3.1.0');
  assert.equal(doc.info.title, 'Smarter.Poker Public AI Agent API');
  assert.ok(doc.servers.some((s) => s.url === 'https://smarter.poker'));

  // Path declarations
  assert.ok(doc.paths['/api/ai/venues'], 'declares /api/ai/venues');
  assert.ok(doc.paths['/api/ai/venues/{id}'], 'declares /api/ai/venues/{id}');
  assert.ok(doc.paths['/api/ai/series'], 'declares /api/ai/series');
  assert.ok(doc.paths['/api/mcp'], 'declares /api/mcp');
  assert.ok(doc.paths['/api/ai/odds'], 'declares /api/ai/odds');
  assert.ok(doc.paths['/api/ai/preflop'], 'declares /api/ai/preflop');
  assert.ok(doc.paths['/api/ai/icm'], 'declares /api/ai/icm');
  assert.ok(doc.paths['/api/ai/terms'], 'declares /api/ai/terms');
  assert.ok(doc.paths['/api/ai/freerolls'], 'declares /api/ai/freerolls');

  // Operation IDs
  assert.equal(doc.paths['/api/ai/venues'].get.operationId, 'searchVenues');
  assert.equal(doc.paths['/api/ai/venues/{id}'].get.operationId, 'getVenueDetails');
  assert.equal(doc.paths['/api/ai/series'].get.operationId, 'searchSeries');
  assert.equal(doc.paths['/api/mcp'].post.operationId, 'callMcpRpc');
  assert.equal(doc.paths['/api/ai/odds'].get.operationId, 'calculatePokerOdds');
  assert.equal(doc.paths['/api/ai/preflop'].get.operationId, 'getPreflopRange');
  assert.equal(doc.paths['/api/ai/icm'].get.operationId, 'calculateIcmPayouts');
  assert.equal(doc.paths['/api/ai/terms'].get.operationId, 'getPokerTerm');
  assert.equal(doc.paths['/api/ai/freerolls'].get.operationId, 'getFreerollSchedule');

  // Schemas
  assert.ok(doc.components.schemas.VenueSummary);
  assert.ok(doc.components.schemas.SeriesSummary);
  assert.ok(doc.components.schemas.OddsCalculationResponse);
  assert.ok(doc.components.schemas.PreflopRangeResponse);
  assert.ok(doc.components.schemas.IcmCalculationResponse);
  assert.ok(doc.components.schemas.GlossaryTermsResponse);
});

test('pages/api/openapi.js serves the OpenAPI 3.1.0 specification', () => {
  const code = read('pages/api/openapi.js');
  assert.match(code, /Content-Type.*application\/json/i);
  assert.match(code, /openapi\.json/);
  assert.match(code, /Cache-Control/);
});

test('AI Agent API endpoints exist with public caching and parameter parsing', () => {
  const venuesCode = read('pages/api/ai/venues/index.js');
  assert.match(venuesCode, /from\('poker_venues'\)/);
  assert.match(venuesCode, /q\.or\(/);
  assert.match(venuesCode, /ogImageUrl/);

  const venueIdCode = read('pages/api/ai/venues/[id].js');
  assert.match(venueIdCode, /from\('poker_venues'\)/);
  assert.match(venueIdCode, /req\.query/);
  assert.match(venueIdCode, /venue-card/);

  const seriesCode = read('pages/api/ai/series/index.js');
  assert.match(seriesCode, /from\('tournament_series'\)/);
  assert.match(seriesCode, /series-card/);
});

test('llms.txt and llms-full.txt advertise OpenAPI spec and AI Plugin manifest', () => {
  const llms = read('public/llms.txt');
  assert.match(llms, /https:\/\/smarter\.poker\/api\/openapi\.json/);
  assert.match(llms, /https:\/\/smarter\.poker\/\.well-known\/ai-plugin\.json/);

  const llmsFull = read('public/llms-full.txt');
  assert.match(llmsFull, /https:\/\/smarter\.poker\/api\/openapi\.json/);
  assert.match(llmsFull, /https:\/\/smarter\.poker\/\.well-known\/ai-plugin\.json/);
  assert.match(llmsFull, /https:\/\/smarter\.poker\/api\/ai\/venues/);
  assert.match(llmsFull, /https:\/\/smarter\.poker\/api\/ai\/series/);
});

function mockRes() {
  const headers = {};
  let statusCode = 200;
  let jsonBody = null;
  return {
    setHeader: (k, v) => { headers[k.toLowerCase()] = v; },
    status: (code) => { statusCode = code; return { json: (data) => { jsonBody = data; } }; },
    json: (data) => { jsonBody = data; },
    getStatusCode: () => statusCode,
    getHeaders: () => headers,
    getBody: () => jsonBody,
  };
}

test('GET /api/ai/odds computes equity and returns citations', async () => {
  const { default: handler } = await import('../pages/api/ai/odds.js');
  const req = {
    method: 'GET',
    query: {
      hands: 'AhKd,QcQd',
      board: 'JhTs2c',
      iterations: '1000',
    },
  };
  const res = mockRes();
  await handler(req, res);

  assert.equal(res.getStatusCode(), 200);
  const body = res.getBody();
  assert.equal(body.success, true);
  assert.equal(body.seats.length, 2);
  assert.ok(body.seats[0].equity_percent > 0);
  assert.ok(body.citation.includes('https://smarter.poker/tools/poker-odds-calculator'));
  assert.ok(!JSON.stringify(body).includes('—'), 'Must contain zero em dashes');
});

test('GET /api/ai/preflop returns 6-max 100BB GTO frequencies and citations', async () => {
  const { default: handler } = await import('../pages/api/ai/preflop.js');
  const req = {
    method: 'GET',
    query: { position: 'UTG' },
  };
  const res = mockRes();
  await handler(req, res);

  assert.equal(res.getStatusCode(), 200);
  const body = res.getBody();
  assert.equal(body.success, true);
  assert.equal(body.position, 'UTG');
  assert.ok(body.total_hands_opened > 0);
  assert.ok(body.citation.includes('https://smarter.poker/tools/preflop-ranges/utg'));
  assert.ok(!JSON.stringify(body).includes('—'), 'Must contain zero em dashes');
});

test('GET /api/ai/icm computes Malmuth-Harville tournament equity and returns citations', async () => {
  const { default: handler } = await import('../pages/api/ai/icm.js');
  const req = {
    method: 'GET',
    query: {
      stacks: '50000,30000,20000',
      payouts: '5000,3000,2000',
    },
  };
  const res = mockRes();
  await handler(req, res);

  assert.equal(res.getStatusCode(), 200);
  const body = res.getBody();
  assert.equal(body.success, true);
  assert.equal(body.players.length, 3);
  assert.ok(body.players[0].icm_dollar_equity > body.players[1].icm_dollar_equity);
  assert.ok(body.citation.includes('https://smarter.poker/tools/icm-calculator'));
  assert.ok(!JSON.stringify(body).includes('—'), 'Must contain zero em dashes');
});

test('GET /api/ai/terms searches authoritative glossary and returns citations', async () => {
  const { default: handler } = await import('../pages/api/ai/terms.js');
  const req = {
    method: 'GET',
    query: { q: 'straddle' },
  };
  const res = mockRes();
  await handler(req, res);

  assert.equal(res.getStatusCode(), 200);
  const body = res.getBody();
  assert.equal(body.success, true);
  assert.ok(body.results.length > 0);
  assert.equal(body.results[0].slug, 'straddle');
  assert.ok(body.results[0].definition.includes('Straddle'));
  assert.ok(body.results[0].citation.includes('https://smarter.poker/glossary/straddle'));
  assert.ok(!JSON.stringify(body).includes('—'), 'Must contain zero em dashes');
});

test('GET /api/ai/freerolls returns daily $2,000 schedule and Diamond Freerolls', async () => {
  const { default: handler } = await import('../pages/api/ai/freerolls.js');
  const req = {
    method: 'GET',
    query: { tier: 'all' },
  };
  const res = mockRes();
  await handler(req, res);

  assert.equal(res.getStatusCode(), 200);
  const body = res.getBody();
  assert.equal(body.success, true);
  assert.ok(body.daily_guarantee.includes('$2,000'));
  assert.ok(body.schedule.length >= 4);
  assert.ok(body.freerolls_hub_url.includes('/freerolls'));
  assert.ok(body.markdown_url.includes('/freerolls.md'));
  assert.ok(!JSON.stringify(body).includes('—'), 'Must contain zero em dashes');
});

test('GET /api/ai/bankroll returns Form W-2G tax specs and Schedule C export formats', async () => {
  const { default: handler } = await import('../pages/api/ai/bankroll.js');
  const req = { method: 'GET', query: { tax_year: '2026' } };
  const res = mockRes();
  await handler(req, res);

  assert.equal(res.getStatusCode(), 200);
  const body = res.getBody();
  assert.equal(body.success, true);
  assert.ok(body.product.includes('Bankroll Manager'));
  assert.ok(body.tax_compliance_features.form_w2g_tracking.includes('Form W-2G'));
  assert.ok(body.canonical_url.includes('/hub/bankroll-manager'));
  assert.ok(!JSON.stringify(body).includes('—'), 'Must contain zero em dashes');
});

test('GET /api/ai/toke-tracker returns dealer shift and down tracking metrics', async () => {
  const { default: handler } = await import('../pages/api/ai/toke-tracker.js');
  const req = { method: 'GET', query: { metric: 'all' } };
  const res = mockRes();
  await handler(req, res);

  assert.equal(res.getStatusCode(), 200);
  const body = res.getBody();
  assert.equal(body.success, true);
  assert.ok(body.product.includes('Dealer Toke Tracker'));
  assert.ok(body.dealer_operations_features.down_tracking.includes('Downs'));
  assert.ok(body.canonical_url.includes('/hub/toke-tracker'));
  assert.ok(!JSON.stringify(body).includes('—'), 'Must contain zero em dashes');
});

test('GET /api/ai/poker-brain returns plain-English hand review and leak detection capabilities', async () => {
  const { default: handler } = await import('../pages/api/ai/poker-brain.js');
  const req = { method: 'GET', query: { action: 'all' } };
  const res = mockRes();
  await handler(req, res);

  assert.equal(res.getStatusCode(), 200);
  const body = res.getBody();
  assert.equal(body.success, true);
  assert.ok(body.product.includes('PokerBrain'));
  assert.ok(body.ai_coaching_features.plain_english_reviews.includes('Plain-English'));
  assert.ok(body.canonical_url.includes('/hub/training/hand-history-upload'));
  assert.ok(!JSON.stringify(body).includes('—'), 'Must contain zero em dashes');
});

test('GET /api/ai/sandbox returns virtual table simulation and runout distribution specs', async () => {
  const { default: handler } = await import('../pages/api/ai/sandbox.js');
  const req = { method: 'GET', query: { mode: 'all' } };
  const res = mockRes();
  await handler(req, res);

  assert.equal(res.getStatusCode(), 200);
  const body = res.getBody();
  assert.equal(body.success, true);
  assert.ok(body.product.includes('Virtual Poker Table Sandbox'));
  assert.ok(body.sandbox_capabilities.runout_distributions.includes('44/52'));
  assert.ok(body.interactive_tool_url.includes('/tools/poker-odds-calculator'));
  assert.ok(!JSON.stringify(body).includes('—'), 'Must contain zero em dashes');
});

test('GET /api/ai/commander returns live card room waitlist, TV display, and clock specs', async () => {
  const { default: handler } = await import('../pages/api/ai/commander.js');
  const req = { method: 'GET', query: { feature: 'all' } };
  const res = mockRes();
  await handler(req, res);

  assert.equal(res.getStatusCode(), 200);
  const body = res.getBody();
  assert.equal(body.success, true);
  assert.ok(body.product.includes('Club Commander'));
  assert.ok(body.room_management_features.digital_waitlists.includes('SMS'));
  assert.ok(body.canonical_url.includes('/hub/commander'));
  assert.ok(!JSON.stringify(body).includes('—'), 'Must contain zero em dashes');
});
