/**
 * GUARD: the training reference endpoints are open to everyone.
 *
 * Dan, 2026-10-12, asked whether the training charts should be open to
 * everyone or show a sign-in button: "THEY SHOULD OPEN TO EVERYONE."
 *
 * Before this, a signed-out visitor to /hub/training/preflop-charts (and
 * /hub/training/range-explorer, which forwards there) saw "Auth required" and
 * an empty chart, and /hub/training/final-table-sim showed no ICM equity.
 * Both endpoints serve the same answer to every caller and touch nothing
 * per-user, so they take no token. They keep their rate limits, and neither
 * one may write to the database.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const PREFLOP = read('pages/api/training/preflop-ranges.js');
const ICM = read('pages/api/training/icm-calc.js');

// A Supabase query starts with .from('<table>') or .rpc('<fn>'); Array.from(...) in the ICM maths is not one.
const DB_ACCESS = /supabaseServerClient|@supabase\/supabase-js|createClient\(|\.from\(\s*['"`]|\.rpc\(\s*['"`]|\.(?:insert|upsert)\(/;

function compile(relativePath, dependencies) {
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
    assert.ok(Object.hasOwn(dependencies, specifier), `unexpected dependency: ${specifier}`);
    return dependencies[specifier];
  }, module, module.exports);
  return module.exports;
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

test('preflop-ranges has no sign-in path: no missing-token 401 and no identity lookup', () => {
  assert.doesNotMatch(PREFLOP, /'Auth required'/);
  assert.doesNotMatch(PREFLOP, /status\(401\)/);
  assert.doesNotMatch(PREFLOP, /getServerUserWithFallback|req\.headers\.authorization/);
  assert.doesNotMatch(PREFLOP, DB_ACCESS);
});

test('preflop-ranges keeps its read rate limit and GET-only check', () => {
  assert.match(PREFLOP, /if \(!applyRateLimit\(req, res, LIMITS\.read\)\) return;/);
  assert.match(PREFLOP, /req\.method !== 'GET'/);
});

test('preflop-ranges is cached publicly and does not vary by identity', () => {
  assert.match(
    PREFLOP,
    /setHeader\('Cache-Control', 'public, max-age=300, s-maxage=300, stale-while-revalidate=600'\)/,
  );
  assert.doesNotMatch(PREFLOP, /'Cache-Control', 'private/);
  assert.doesNotMatch(PREFLOP, /setHeader\('Vary', 'Authorization'\)/);
});

test('icm-calc allows anonymous use and still rate-limits', () => {
  assert.doesNotMatch(ICM, /'Auth required'/);
  assert.doesNotMatch(ICM, /status\(401\)/);
  assert.doesNotMatch(ICM, /getServerUserWithFallback|req\.headers\.authorization/);
  assert.match(ICM, /if \(!applyRateLimit\(req, res, LIMITS\.write\)\) return;/);
  assert.match(ICM, /req\.method !== 'POST'/);
});

test('icm-calc never touches the database, so an anonymous caller cannot write to it', () => {
  assert.doesNotMatch(ICM, DB_ACCESS);
});

test('an anonymous POST to icm-calc returns the equity; the rate limit runs first', async () => {
  let rateLimited = 0;
  const route = compile('pages/api/training/icm-calc.js', {
    '../../../src/lib/apiRateLimit': {
      applyRateLimit: () => { rateLimited += 1; return true; },
      LIMITS: { write: {} },
    },
    '../../../src/utils/trainingApiUtils': { withTiming() {} },
    '../../../src/lib/apiErrorHandler': { reportApiError() {} },
  });

  const res = response();
  await route.default(
    { method: 'POST', headers: {}, body: { stacks: [5000, 3000, 2000], prizes: [500, 300, 200] } },
    res,
  );
  assert.equal(rateLimited, 1);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.results.length, 3);
  assert.equal(res.body.totalPrizePool, 1000);
  const totalEquity = res.body.results.reduce((sum, row) => sum + row.icmDollars, 0);
  assert.ok(Math.abs(totalEquity - 1000) < 0.05, `equities sum to the pool, got ${totalEquity}`);
});
