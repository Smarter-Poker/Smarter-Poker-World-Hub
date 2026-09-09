import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { BB_DEFENSE, FOUR_BET, RFI, getHandFrequencies } from '../src/config/solverRanges.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const API = fs.readFileSync(path.join(ROOT, 'pages/api/training/preflop-ranges.js'), 'utf8');
const PAGE = fs.readFileSync(path.join(ROOT, 'pages/hub/training/preflop-charts.js'), 'utf8');
const CORPUS = fs.readFileSync(path.join(ROOT, 'src/config/solverRanges.js'), 'utf8');

function compile(relativePath, dependencies = {}) {
  const babel = require('@babel/core');
  const transformModulesCommonJs = require('@babel/plugin-transform-modules-commonjs');
  const compiled = babel.transformSync(
    fs.readFileSync(path.join(ROOT, relativePath), 'utf8'),
    {
      babelrc: false,
      configFile: false,
      filename: relativePath,
      plugins: [transformModulesCommonJs],
      sourceType: 'module',
    },
  ).code;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled)((specifier) => {
    assert.ok(Object.hasOwn(dependencies, specifier), `unexpected dependency: ${specifier}`);
    return dependencies[specifier];
  }, module, module.exports);
  return module.exports;
}

function loadRoute() {
  return compile('pages/api/training/preflop-ranges.js', {
    '../../../src/lib/serverAuth': {
      getServerUserWithFallback: async () => ({ user: { id: 'user-1' }, error: null }),
    },
    '../../../src/lib/supabaseServerClient': { createClient: () => ({}) },
    '../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: { read: {} } },
    '../../../src/utils/trainingApiUtils': {
      getAllHands: () => ['AA', 'AKs', '72o'],
      getCombos: (hand) => (hand.length === 2 ? 6 : hand.endsWith('s') ? 4 : 12),
      withTiming() {},
    },
    '../../../src/lib/sentryWrap': { reportApiError() {} },
    '../../../src/config/solverRanges': { RFI, BB_DEFENSE, FOUR_BET, getHandFrequencies },
  });
}

function response() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    headersSent: false,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; this.headersSent = true; return this; },
  };
}

async function get(handler, query) {
  const res = response();
  await handler({ method: 'GET', headers: { authorization: 'Bearer test-token' }, query }, res);
  return res;
}

test('the static chart corpus exposes only its real 6-max cash 100BB spot identities', () => {
  assert.deepEqual(Object.keys(RFI), ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB']);
  assert.deepEqual(Object.keys(FOUR_BET), ['UTG_vs_3bet', 'CO_vs_3bet', 'BTN_vs_3bet']);
  assert.deepEqual(Object.keys(BB_DEFENSE), ['vs_UTG', 'vs_CO', 'vs_BTN', 'vs_SB']);

  assert.match(CORPUS, /Authored teaching-reference ranges for 6-max cash at exactly 100BB/);
  assert.match(CORPUS, /not a provenance-sealed solver export/);
  assert.match(CORPUS, /consumers must not label it solver-exact GTO/);
});

test('the API fails closed outside the exact corpus and performs no nearby-chart substitution', () => {
  assert.match(API, /gameType: 'cash_6max'/);
  assert.match(API, /stackDepth: 100/);
  assert.match(API, /rfi: Object\.freeze\(\['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB'\]\)/);
  assert.match(API, /vs3bet: Object\.freeze\(\['UTG', 'CO', 'BTN'\]\)/);
  assert.match(API, /bb_defense: Object\.freeze\(\['UTG', 'CO', 'BTN', 'SB'\]\)/);
  assert.match(API, /gameType !== PREFLOP_REFERENCE_CONTRACT\.gameType/);
  assert.match(API, /stackDepth !== PREFLOP_REFERENCE_CONTRACT\.stackDepth/);
  assert.match(API, /if \(vsPosition\)/);
  assert.match(API, /if \(!supportedPositions\.includes\(position\)\)/);
  assert.match(API, /source: 'authored_reference_6max_cash_100bb'/);
  assert.match(API, /solverExact: false/);
  assert.match(API, /No checksummed solver artifact or solve-tree provenance is attached/);

  assert.doesNotMatch(API, /fallbackKey|derived_from_rfi|memory_charts_gold|getRFIByDepth/);
  assert.doesNotMatch(API, /\|\|\s*BB_DEFENSE\['vs_BTN'\]/);
  assert.doesNotMatch(API, /startsWith\(position\)|startsWith\(pos\)/);
});

test('the API returns exact identities and rejects every unsupported dimension at runtime', async () => {
  const route = loadRoute();
  const exact = await get(route.default, {
    gameType: 'cash_6max', stackDepth: '100', scenario: 'vs3bet', position: 'CO',
  });
  assert.equal(exact.statusCode, 200);
  assert.equal(exact.body.range.spotLabel, 'CO Response To 3-Bet');
  assert.equal(exact.body.range.source, 'authored_reference_6max_cash_100bb');
  assert.equal(exact.body.range.provenance.solverExact, false);
  assert.deepEqual(exact.body.range.actions, ['4-Bet', 'Call', 'Fold']);

  const base = { gameType: 'cash_6max', stackDepth: '100', scenario: 'rfi', position: 'BTN' };
  const unsupported = [
    { ...base, gameType: 'mtt' },
    { ...base, stackDepth: '50' },
    { ...base, scenario: 'push_fold' },
    { ...base, scenario: 'vs3bet', position: 'MP' },
    { ...base, scenario: 'bb_defense', position: 'HJ' },
    { ...base, position: 'BB' },
    { ...base, vsPosition: 'SB' },
  ];
  for (const query of unsupported) {
    const result = await get(route.default, query);
    assert.equal(result.statusCode, 422, JSON.stringify(query));
    assert.equal(result.body.success, false, JSON.stringify(query));
  }
});

test('the chart UI offers only supported nodes and visibly discloses authored-reference authority', () => {
  assert.match(PAGE, /const SUPPORTED_GAME_TYPE = 'cash_6max'/);
  assert.match(PAGE, /const SUPPORTED_STACK_DEPTH = 100/);
  assert.match(PAGE, /Authored Reference · Not Solver-Exact/);
  assert.match(PAGE, /provenance\?\.disclosure/);
  assert.match(PAGE, /setRangeData\(null\)/);
  assert.match(PAGE, /requestRef\.current !== requestId/);
  assert.match(PAGE, /role="alert"/);

  assert.doesNotMatch(PAGE, /value: 'mtt'|value: 'spins'|value: 'push_fold'/);
  assert.doesNotMatch(PAGE, /setGameType|setStackDepth|GAME_TYPES|STACK_DEPTHS/);
  assert.doesNotMatch(PAGE, /Each Chart Shows The Solver-Correct Mix|Exact GTO Play Requires/);
});
