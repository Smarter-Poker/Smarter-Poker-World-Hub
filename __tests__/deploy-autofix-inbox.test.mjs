import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function loadHandler(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  return { source, handler: module.default };
}

function invoke(handler, method) {
  const req = { method };
  const res = {
    code: 200,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  };
  handler(req, res);
  return res;
}

test('deploy-autofix is retired fail-closed with no release mutation or provider path', async () => {
  const { source, handler } = await loadHandler('../pages/api/deploy-autofix.js');
  const retired = invoke(handler, 'POST');
  assert.equal(retired.code, 410);
  assert.equal(retired.body.code, 'deployment_autofix_retired');
  assert.equal(retired.body.action, 'none');
  assert.equal(retired.headers['Cache-Control'], 'no-store');
  assert.equal(invoke(handler, 'GET').code, 405);
  assert.equal(invoke(handler, 'GET').headers.Allow, 'POST');
  for (const forbidden of ['api.anthropic.com', 'api.x.ai', 'api.github.com', 'GH_PAT', 'ANTHROPIC_API_KEY', 'XAI_API_KEY']) {
    assert.equal(source.includes(forbidden), false, `retired endpoint must not contain ${forbidden}`);
  }
});

test('deploy-status is retired fail-closed and exposes no provider or release metadata', async () => {
  const { source, handler } = await loadHandler('../pages/api/deploy-status.js');
  const retired = invoke(handler, 'GET');
  assert.equal(retired.code, 410);
  assert.deepEqual(retired.body, {
    ok: false,
    code: 'deployment_autofix_retired',
    error: 'Deployment Autofix Status Is Retired',
    action: 'none',
  });
  assert.equal(invoke(handler, 'POST').code, 405);
  assert.equal(invoke(handler, 'POST').headers.Allow, 'GET');
  for (const forbidden of ['api.vercel.com', 'api.github.com', 'VERCEL_TOKEN', 'GH_PAT', 'branch', 'commitSha']) {
    assert.equal(source.includes(forbidden), false, `retired status endpoint must not contain ${forbidden}`);
  }
});

test('retired admin surface is static, local-font, and explicit about the protected release path', async () => {
  const source = await readFile(new URL('../pages/hub/admin/autofix.js', import.meta.url), 'utf8');
  assert.match(source, /Deployment Autofix Retired/);
  assert.match(source, /Protected Pull Request/);
  assert.match(source, /First-Party Operational Inbox/);
  for (const forbidden of ['useEffect', 'setInterval', 'fetch(', 'fonts.googleapis.com', '/api/deploy-status', '/api/deploy-autofix']) {
    assert.equal(source.includes(forbidden), false, `retired surface must not contain ${forbidden}`);
  }
});
