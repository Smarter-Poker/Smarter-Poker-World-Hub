import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../pages/api/jarvis/dealer-reference.js', import.meta.url), 'utf8');
const { code } = require('@babel/core').transformSync(source, {
  filename: 'dealer-reference.js', babelrc: false, configFile: false, presets: [require.resolve('next/babel')],
});

test('only an authenticated question with an actual dealer answer succeeds', async () => {
  const calls = [];
  let content = '  ';
  const imports = {
    '../../../src/lib/serverAuth': { getServerUserWithFallback: async () => ({user: {id: 'dealer'}}) },
    '../../../src/lib/supabaseServerClient': { createClient: () => ({}) },
    '../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: {write: 1} },
    '../../../src/lib/apiErrorHandler': { reportApiError: assert.fail },
    '../../../src/lib/grokClient': { getGrokClient: () => ({chat: {completions: {
      async create(payload) { calls.push(payload); return {choices: [{message: {content}}]}; },
    }}}) },
  };
  const api = {};
  runInNewContext(code, {exports: api, require: path => Object.hasOwn(imports, path) ? imports[path] : require(path), process: {env: {}}, console});
  const request = { method: 'POST', headers: {}, body: {query: 'Where is the button?'} };
  const res = {status(code) { this.code = code; return this; }, json(body) { this.body = body; }};
  await api.default(request, res);
  assert.equal(res.code, 401);
  assert.equal(calls.length, 0);
  request.headers.authorization = 'Bearer fixture';
  await api.default(request, res);
  assert.equal(res.code, 502);
  assert.ok(res.body.error);
  content = 'Follow the button marker.';
  await api.default(request, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.answer, content);
  assert.equal(calls.at(-1).messages.at(-1).content, request.body.query);
});
