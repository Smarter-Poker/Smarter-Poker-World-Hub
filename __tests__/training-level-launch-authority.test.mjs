import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { TRAINING_LIBRARY } from '../src/data/TRAINING_LIBRARY.js';
import { isCanonicalTrainingGameId } from '../src/lib/training/customTrainingLaunchContract.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const require = createRequire(import.meta.url);

function compileSessionStart({ authUser = { id: 'user-1' }, authError = null } = {}) {
  const babel = require('@babel/core');
  const transformModulesCommonJs = require('@babel/plugin-transform-modules-commonjs');
  const source = read('pages/api/session/start.js');
  const compiled = babel.transformSync(source, {
    babelrc: false,
    configFile: false,
    filename: 'pages/api/session/start.js',
    plugins: [transformModulesCommonJs],
    sourceType: 'module',
  }).code;
  const dependencies = {
    '../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: { write: {} } },
    '../../../src/lib/serverAuth': {
      getServerUserWithFallback: async () => ({ user: authUser, error: authError }),
    },
    '../../../src/lib/supabaseServerClient': { createClient: () => ({}) },
    '../../../src/lib/training/customTrainingLaunchContract.mjs': { isCanonicalTrainingGameId },
    '../../../src/lib/sentryWrap': { reportApiError() {} },
  };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled)((specifier) => {
    assert.ok(Object.hasOwn(dependencies, specifier), `unexpected session-start dependency: ${specifier}`);
    return dependencies[specifier];
  }, module, module.exports);
  return module.exports.default;
}

function response() {
  return {
    statusCode: 200,
    headersSent: false,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; this.headersSent = true; return this; },
  };
}

async function callSessionStart(handler, { method = 'POST', gameId = 'cash-001' } = {}) {
  const res = response();
  await handler({ method, headers: { authorization: 'Bearer test' }, body: { game_id: gameId } }, res);
  return res;
}

test('all and only canonical library game IDs pass the shared launch validator', () => {
  assert.equal(TRAINING_LIBRARY.length, 107);
  for (const game of TRAINING_LIBRARY) {
    assert.equal(isCanonicalTrainingGameId(game.id), true, game.id);
  }
  for (const invalid of ['', 'cash-999', 'custom-training', '../cash-001']) {
    assert.equal(isCanonicalTrainingGameId(invalid), false, invalid);
  }
});

test('LevelSelector enters the signed Arena handshake without legacy false-success state', () => {
  const selector = read('src/components/training/LevelSelector.tsx');
  const arena = read('pages/hub/training/arena/[gameId].js');
  const trainer = read('src/hooks/useGTOTrainer.js');
  const delivery = read('pages/api/training/batch-preload.js');

  assert.match(selector, /isCanonicalTrainingGameId\(gameId\)/);
  assert.match(selector, /getGameById\(gameId\)/);
  assert.match(selector, /This Training Game Does Not Exist In The Canonical Library/);
  assert.match(selector, /await router\.push\(\{[\s\S]*pathname: '\/hub\/training\/arena\/\[gameId\]'/);
  assert.match(selector, /if \(navigated === false\)/);
  assert.doesNotMatch(selector, /\/api\/session\/start|client-\$\{Date\.now|session=\$\{sessionId\}/);
  assert.doesNotMatch(selector, /engineType|engine_type:\s*libraryGame|category:\s*'CASH'/);
  assert.match(arena, /<GodModeArena[\s\S]*sessionId=\{resolvedSessionId\}/);
  assert.match(trainer, /assertSignedTrainingDelivery\(data, trainingSessionId/);
  assert.match(delivery, /prepareTrainingAttemptDelivery\(/);
});

test('legacy session-start route authenticates, validates, and can never mint false success', async () => {
  const handler = compileSessionStart();

  const invalid = await callSessionStart(handler, { gameId: 'cash-999' });
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.body.code, 'INVALID_TRAINING_GAME');

  const retired = await callSessionStart(handler, { gameId: 'cash-001' });
  assert.equal(retired.statusCode, 410);
  assert.equal(retired.body.success, false);
  assert.equal(retired.body.code, 'TRAINING_SESSION_START_RETIRED');
  assert.equal(retired.body.arenaPath, '/hub/training/arena/cash-001');
  assert.equal(Object.hasOwn(retired.body, 'session_id'), false);
  assert.equal(Object.hasOwn(retired.body, 'config'), false);

  const method = await callSessionStart(handler, { method: 'GET' });
  assert.equal(method.statusCode, 405);

  const unauthenticated = await callSessionStart(
    compileSessionStart({ authUser: null, authError: new Error('invalid') }),
  );
  assert.equal(unauthenticated.statusCode, 401);
});
