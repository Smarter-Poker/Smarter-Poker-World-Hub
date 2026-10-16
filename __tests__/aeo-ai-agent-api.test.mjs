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

  // Operation IDs
  assert.equal(doc.paths['/api/ai/venues'].get.operationId, 'searchVenues');
  assert.equal(doc.paths['/api/ai/venues/{id}'].get.operationId, 'getVenueDetails');
  assert.equal(doc.paths['/api/ai/series'].get.operationId, 'searchSeries');

  // Schemas
  assert.ok(doc.components.schemas.VenueSummary);
  assert.ok(doc.components.schemas.SeriesSummary);
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
