/**
 * Executes both real Pages API handlers with every external dependency stubbed.
 * Run: node --experimental-vm-modules --test __tests__/gdpr-financial-refusal.test.mjs
 * No Supabase SDK, credentials, network, provider or business operation is loaded.
 * This covers explicit SQL refusals, not arbitrary malformed receipt validation,
 * database precheck completeness, provider cascades or deployed behavior.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const ROOT = new URL('../', import.meta.url);
const ACTOR = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const REQUEST = '33333333-3333-4333-8333-333333333333';
const routes = [
  { name: 'self', path: 'pages/api/account/delete-gdpr.js', target: ACTOR },
  { name: 'admin', path: 'pages/api/admin/users/delete-gdpr.js', target: OTHER },
];

// Current fn_delete_user_gdpr financial-precheck refusal has no status/request_id.
const refusal = {
  success: false,
  error: 'financial_precheck_failed',
  precheck: {
    clear: false,
    blockers: ['club 44444444-4444-4444-8444-444444444444: chip balance 12.00'],
    checked_at: '2026-09-12T03:47:14.815881+00:00',
  },
};
// Current successful SQL summary has neither status nor success: true.
const receipt = route => ({
  request_id: REQUEST,
  user_id: route.target,
  requested_by: ACTOR,
  anonymized_columns: { profiles_anonymized: 1 },
});
const plain = value => JSON.parse(JSON.stringify(value));

async function invoke(route, options = {}) {
  const calls = { rpc: [], provider: [], audits: [], warnings: [], unexpected: [] };
  function unexpected(message) {
    calls.unexpected.push(message);
    throw new Error(message);
  }
  const user = options.noUser ? null : { id: ACTOR };
  const authError = options.authError ? { message: 'invalid session' } : null;
  const supabase = {
    auth: {
      getUser: async () => ({ data: { user }, error: authError }),
      admin: {
        async deleteUser(id) {
          calls.provider.push(id);
          if (options.providerThrows) throw new Error('provider threw');
          return { error: options.providerError ? { message: 'provider refused' } : null };
        },
      },
    },
    from(table) {
      assert.equal(table, 'profiles');
      return {
        select(columns) {
          assert.equal(columns, 'role');
          return {
            eq(column, id) {
              assert.equal(column, 'id');
              assert.equal(id, ACTOR);
              return { maybeSingle: async () => ({ data: { role: options.role ?? 'admin' } }) };
            },
          };
        },
      };
    },
    async rpc(name, args) {
      calls.rpc.push({ name, args: plain(args) });
      if (name === 'fn_delete_user_gdpr') {
        return { data: options.summary ?? receipt(route), error: options.rpcError ? { message: 'RPC refused' } : null };
      }
      if (name === 'fn_mark_gdpr_completed') {
        if (options.markerThrows) throw new Error('marker threw');
        return { data: true, error: options.markerError ? { message: 'marker refused' } : null };
      }
      return unexpected(`Unexpected RPC: ${name}`);
    },
  };
  const dependencies = {
    supabaseServerClient: { createClient: () => supabase },
    serverAuth: { getServerUserWithFallback: async () => ({ user, error: authError }) },
    apiRateLimit: { rateLimit: () => options.rateDenied ? { ok: false, retryAfter: 60 } : { ok: true } },
    mfaGate: { requireRecentMfa: async () => options.mfaDenied ? { ok: false, status: 403, requiresStepUp: true } : { ok: true } },
    sentryWrap: { reportApiError: error => unexpected(`Unexpected handler error: ${error.message}`) },
  };
  const context = vm.createContext({
    process: { env: Object.freeze({}) },
    console: { warn: (...args) => calls.warnings.push(args) },
    fetch: () => unexpected('Network is prohibited'),
    require(specifier) {
      assert.equal(specifier, '../../../../src/lib/antiAbuse');
      return { logAdminAction: async (_client, entry) => calls.audits.push(entry) };
    },
  });
  // SourceTextModule parses and executes the complete handler without rewriting
  // imports, exports, guards or handler code. Unknown imports cannot resolve.
  const module = new vm.SourceTextModule(await readFile(new URL(route.path, ROOT), 'utf8'), {
    context,
    identifier: route.path,
    importModuleDynamically: specifier => unexpected(`Unexpected dynamic import: ${specifier}`),
  });
  await module.link(specifier => {
    const name = specifier.split('/').at(-1);
    if (!specifier.match(/^\.\.\//) || !dependencies[name]) return unexpected(`Unexpected import: ${specifier}`);
    const exports = dependencies[name];
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  });
  await module.evaluate();
  const req = {
    method: options.method ?? 'POST',
    headers: options.noAuthorization ? {} : { authorization: 'Bearer local-test-token' },
    body: { user_id: route.target, confirm: true, reason: 'local regression', ...options.body },
  };
  const res = {
    statusCode: 200, headersSent: false, headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = plain(value); this.headersSent = true; return this; },
  };
  await module.namespace.default(req, res);
  assert.deepEqual(calls.unexpected, [], 'No unstubbed dependency or unexpected handler failure');
  return { calls, res };
}

function assertNoDeletion(calls) {
  assert.equal(calls.provider.length, 0, 'Authoritative refusal must not dispatch auth.admin.deleteUser');
  assert.equal(calls.rpc.filter(call => call.name === 'fn_mark_gdpr_completed').length, 0);
  assert.equal(calls.audits.length, 0);
}

for (const route of routes) {
  test(`${route.name}: financial refusal stops provider deletion and completion`, async () => {
    const { calls, res } = await invoke(route, { summary: refusal });
    assertNoDeletion(calls);
    assert.equal(calls.rpc.length, 1);
    assert.equal(res.statusCode, 500); // Preserve this route's existing refusal response.
    assert.equal(res.body.success, false);
    assert.equal(res.body.error, refusal.error);
    assert.deepEqual(res.body.summary, refusal);
    assert.equal(calls.warnings.length, 0);
  });

  test(`${route.name}: explicit refusal wins even if status says anonymized`, async () => {
    const { calls, res } = await invoke(route, { summary: { ...refusal, status: 'anonymized', request_id: REQUEST } });
    assertNoDeletion(calls);
    assert.equal(res.body.success, false);
  });

  test(`${route.name}: valid status-less summary preserves target and original completion identity`, async () => {
    const summary = receipt(route);
    const { calls, res } = await invoke(route, { summary });
    assert.deepEqual(calls.provider, [route.target]);
    assert.deepEqual(calls.rpc, [
      { name: 'fn_delete_user_gdpr', args: { p_user_id: route.target, p_requested_by: ACTOR, p_reason: 'local regression' } },
      { name: 'fn_mark_gdpr_completed', args: { p_request_id: REQUEST } },
    ]);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.auth_deleted, true);
    assert.equal(res.body.request_id, REQUEST);
    assert.deepEqual(res.body.summary, summary);
    assert.equal(calls.audits.length, route.name === 'admin' ? 1 : 0);
    if (calls.audits.length) {
      assert.equal(calls.audits[0].target_id, route.target);
      assert.equal(calls.audits[0].details.request_id, REQUEST);
    }
  });

  test(`${route.name}: existing failed status remains a refusal`, async () => {
    const { calls, res } = await invoke(route, { summary: { status: 'failed', error: 'anonymization refused' } });
    assertNoDeletion(calls);
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.error, 'anonymization refused');
  });

  test(`${route.name}: RPC transport error still refuses before provider`, async () => {
    const { calls, res } = await invoke(route, { rpcError: true });
    assertNoDeletion(calls);
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.error, 'RPC refused');
  });

  for (const [name, options, statusCode] of [
    ['method', { method: 'GET' }, 405],
    ['missing bearer', { noAuthorization: true }, 401],
    ['invalid session', { authError: true }, 401],
    ['missing user', { noUser: true }, 401],
    ['confirmation', { body: { confirm: false } }, 400],
  ]) test(`${route.name}: ${name} gate stops before financial RPC`, async () => {
    const { calls, res } = await invoke(route, options);
    assertNoDeletion(calls);
    assert.equal(calls.rpc.length, 0);
    assert.equal(res.statusCode, statusCode);
  });

  for (const fault of ['providerError', 'providerThrows']) {
    test(`${route.name}: ${fault} preserves partial result and skips completion`, async () => {
      const { calls, res } = await invoke(route, { [fault]: true });
      assert.deepEqual(calls.provider, [route.target]);
      assert.equal(calls.rpc.length, 1);
      assert.equal(res.statusCode, 207);
      assert.equal(res.body.success, true);
      assert.equal(res.body.partial, true);
      assert.equal(res.body.auth_deleted, false);
      assert.equal(res.body.request_id, REQUEST);
      assert.match(res.body.auth_error, /provider/);
    });
  }
  for (const fault of ['markerError', 'markerThrows']) {
    test(`${route.name}: ${fault} preserves provider success without a second deletion`, async () => {
      const { calls, res } = await invoke(route, { [fault]: true });
      assert.deepEqual(calls.provider, [route.target]);
      assert.equal(calls.rpc.length, 2);
      assert.equal(calls.rpc[1].args.p_request_id, REQUEST);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.auth_deleted, true);
      assert.equal(calls.warnings.length, 1);
    });
  }
}

for (const [name, options, statusCode] of [
  ['admin role', { role: 'user' }, 403],
  ['MFA', { mfaDenied: true }, 403],
  ['target', { body: { user_id: null } }, 400],
  ['audit reason', { body: { reason: ' ' } }, 400],
]) test(`admin: ${name} gate remains before financial RPC`, async () => {
  const { calls, res } = await invoke(routes[1], options);
  assertNoDeletion(calls);
  assert.equal(calls.rpc.length, 0);
  assert.equal(res.statusCode, statusCode);
});

test('self: rate limit remains before financial RPC', async () => {
  const { calls, res } = await invoke(routes[0], { rateDenied: true });
  assertNoDeletion(calls);
  assert.equal(calls.rpc.length, 0);
  assert.equal(res.statusCode, 429);
  assert.equal(res.body.retryAfter, 60);
});
