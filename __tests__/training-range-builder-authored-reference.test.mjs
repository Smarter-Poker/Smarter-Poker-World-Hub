import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const require = createRequire(import.meta.url);
const { parse } = require('@babel/parser');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

const API_FILE = 'pages/api/training/grade-range.js';
const PAGE_FILE = 'pages/hub/training/range-builder.js';
const API_SOURCE = read(API_FILE);
const PAGE_SOURCE = read(PAGE_FILE);

function compile(relativePath, dependencies = {}) {
  const babel = require('@babel/core');
  const transformModulesCommonJs = require('@babel/plugin-transform-modules-commonjs');
  const compiled = babel.transformSync(read(relativePath), {
    babelrc: false,
    configFile: false,
    filename: relativePath,
    plugins: [transformModulesCommonJs],
    sourceType: 'module',
  }).code;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled)((specifier) => {
    assert.ok(Object.hasOwn(dependencies, specifier), `unexpected ${relativePath} dependency: ${specifier}`);
    return dependencies[specifier];
  }, module, module.exports);
  return module.exports;
}

function response() {
  return {
    statusCode: 200,
    headers: {},
    headersSent: false,
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; this.headersSent = true; return this; },
  };
}

const allHands = ['AA', 'AKs', '72o'];
const referenceByPosition = Object.fromEntries(
  ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB'].map((position) => [position, {
    AA: { raise: 1 },
    AKs: { raise: position === 'MP' ? 0.3 : 0.6 },
  }])
);

function loadRoute({ authUser = { id: 'user-1' } } = {}) {
  return compile(API_FILE, {
    '../../../src/lib/serverAuth': {
      getServerUserWithFallback: async () => authUser
        ? { user: authUser, error: null }
        : { user: null, error: { message: 'unauthorized' } },
    },
    '../../../src/lib/supabaseServerClient': { createClient: () => ({}) },
    '../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: { write: {} } },
    '../../../src/utils/trainingApiUtils': {
      getAllHands: () => allHands,
      getCombos: (hand) => hand.length === 2 ? 6 : hand.endsWith('s') ? 4 : 12,
      withTiming() {},
    },
    '../../../src/config/solverRanges': {
      RFI: referenceByPosition,
      getHandFrequencies: (spot, hand) => ({ raise: spot?.[hand]?.raise || 0, call: 0 }),
    },
    '../../../src/lib/apiErrorHandler': { reportApiError() {} },
  });
}

async function post(handler, body, { authorization = 'Bearer test-token' } = {}) {
  const res = response();
  await handler({ method: 'POST', headers: { authorization }, body }, res);
  return res;
}

test('Range Builder page and comparison API parse', () => {
  for (const [file, source] of [[PAGE_FILE, PAGE_SOURCE], [API_FILE, API_SOURCE]]) {
    assert.doesNotThrow(() => parse(source, {
      sourceType: 'module',
      plugins: ['jsx', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator'],
    }), file);
  }
});

test('the API exposes only exact 6-max 100BB RFI authored-reference identities', async () => {
  const route = loadRoute();
  const result = await post(route.default, {
    gameType: 'cash_6max',
    scenario: 'rfi',
    position: 'MP',
    stackDepth: 100,
    selectedHands: ['AA', 'AKs'],
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.success, true);
  assert.deepEqual(result.body.reference, {
    id: 'cash_6max:rfi:MP:100bb',
    label: 'MP 6-Max Cash RFI At 100BB',
    gameType: 'cash_6max',
    tableSize: 6,
    scenario: 'rfi',
    position: 'MP',
    stackDepth: 100,
  });
  assert.deepEqual(result.body.provenance, {
    source: 'static_authored_preflop_reference',
    authority: 'authored_reference',
    authoritative: false,
    solverVerified: false,
    exactEVAvailable: false,
    practiceOnly: true,
    version: 'range-builder-rfi-100bb-v1',
    referenceId: 'cash_6max:rfi:MP:100bb',
  });
  assert.deepEqual(result.body.diff.matched, ['AA']);
  assert.deepEqual(result.body.diff.mixed.AKs, { selected: true, referenceFrequency: 0.3 });
  assert.equal(result.body.stats.totalReferenceCombos, 6);
  assert.equal(Object.hasOwn(result.body, 'grade'), false);
  assert.equal(Object.hasOwn(result.body.stats, 'totalGTOCombos'), false);
});

test('unsupported dimensions fail closed instead of substituting Button or another spot', async () => {
  const route = loadRoute();
  const base = {
    gameType: 'cash_6max', scenario: 'rfi', position: 'BTN', stackDepth: 100, selectedHands: ['AA'],
  };
  const unsupported = [
    { ...base, position: 'BB' },
    { ...base, position: 'not-a-position' },
    { ...base, scenario: 'vs3bet' },
    { ...base, stackDepth: 50 },
    { ...base, gameType: 'cash_9max' },
    { ...base, vsPosition: 'CO' },
    { position: 'BTN', selectedHands: ['AA'] },
  ];

  for (const body of unsupported) {
    const result = await post(route.default, body);
    assert.equal(result.statusCode, 422, JSON.stringify(body));
    assert.equal(result.body.code, 'UNSUPPORTED_AUTHORED_REFERENCE');
    assert.equal(result.body.success, false);
  }

  assert.equal(route.resolveAuthoredRangeReference({ ...base, position: 'BB' }), null);
  assert.equal(route.resolveAuthoredRangeReference({ ...base, position: 'not-a-position' }), null);
  assert.equal(route.resolveAuthoredRangeReference(base).reference.position, 'BTN');
  assert.doesNotMatch(API_SOURCE, /RFI\[['"]BTN['"]\]|\|\|\s*RFI\.|startsWith\(pos\)|Object\.values\(FOUR_BET/);
});

test('invalid hand identities and authentication errors fail explicitly', async () => {
  const route = loadRoute();
  const base = {
    gameType: 'cash_6max', scenario: 'rfi', position: 'BTN', stackDepth: 100,
  };

  const invalidNotation = await post(route.default, { ...base, selectedHands: ['aa'] });
  assert.equal(invalidNotation.statusCode, 400);
  assert.equal(invalidNotation.body.code, 'INVALID_SELECTED_HANDS');

  const duplicates = await post(route.default, { ...base, selectedHands: ['AA', 'AA'] });
  assert.equal(duplicates.statusCode, 400);
  assert.equal(duplicates.body.code, 'INVALID_SELECTED_HANDS');

  const missingAuth = await post(route.default, { ...base, selectedHands: ['AA'] }, { authorization: '' });
  assert.equal(missingAuth.statusCode, 401);
  assert.equal(missingAuth.body.code, 'AUTH_REQUIRED');
});

test('the page verifies provenance, records only practice activity, and surfaces failures', () => {
  assert.match(PAGE_SOURCE, /gameType:\s*'cash_6max'/);
  assert.match(PAGE_SOURCE, /scenario:\s*'rfi'/);
  assert.match(PAGE_SOURCE, /stackDepth:\s*100/);
  assert.match(PAGE_SOURCE, /isExactAuthoredReferenceResponse\(data, position\)/);
  assert.match(PAGE_SOURCE, /data\?\.provenance\?\.practiceOnly === true/);
  assert.match(PAGE_SOURCE, /data\?\.provenance\?\.solverVerified === false/);
  assert.match(PAGE_SOURCE, /savePracticeSession\('range-builder'/);
  assert.doesNotMatch(PAGE_SOURCE, /\/api\/training\/save-session/);
  assert.doesNotMatch(PAGE_SOURCE, /bus\.emitDecision(?:Correct|Incorrect)/);
  assert.match(PAGE_SOURCE, /AUTHORED STATIC REFERENCE.*PRACTICE ONLY.*NOT SOLVER VERIFIED/);
  assert.match(PAGE_SOURCE, /role="alert"/);
  assert.match(PAGE_SOURCE, /No result was recorded/);
  assert.match(PAGE_SOURCE, /Compare To Reference/);
  assert.doesNotMatch(PAGE_SOURCE, /RESULTS - GTO DIFF|Grade My Range|GTO Combos|GTO includes/);
});
