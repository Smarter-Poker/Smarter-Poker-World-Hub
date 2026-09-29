/**
 * Executes the real DELETE /api/auth/delete-account handler with every
 * external dependency stubbed (the harness of gdpr-financial-refusal.test.mjs).
 * Run: node --experimental-vm-modules --test __tests__/delete-account-closes-the-account.test.mjs
 * No Supabase SDK, credentials, network or provider is loaded.
 *
 * WHY. Until 2026-09-29 this endpoint hard-deleted rows and then the Auth user,
 * and it failed for EVERY account: 42501 on its first write (service_role holds
 * no write privilege on cashout_requests), and past that, P0403 from the
 * append-only financial journals a hard delete of profiles or auth.users
 * cascades into. Both the World Hub settings page and the Club Arena app call
 * it, and App Review 5.1.1(v) requires it to work. The database now closes the
 * account (public.fn_close_account, Club Arena migration 20260929051751) and
 * this handler soft-deletes the Auth user. These pin what made it work:
 *   - the handler changes NO table itself - its one table read is the MFA
 *     probe, and every change goes through fn_close_account in one transaction;
 *   - the Auth delete is SOFT, deleteUser(id, true) - a hard delete cascades
 *     into the journals and is refused;
 *   - a refusal closes nothing and says, in `error`, exactly what to settle,
 *     because both callers show `error` as it is.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const ROOT = new URL('../', import.meta.url);
const ROUTE = 'pages/api/auth/delete-account.js';
const ACTOR = '11111111-1111-4111-8111-111111111111';
const REQUEST = '33333333-3333-4333-8333-333333333333';

// Every reason public.fn_close_account refuses with. When the function learns
// a new one, add it here AND to REFUSALS; until then the new reason answers 500
// "contact support" and closes nothing, which is safe but unhelpful.
const REASONS = [
  'seated', 'tournament_entry', 'pending_cashout', 'escrow', 'chip_request',
  'club_chips', 'wallet_balance', 'open_ticket', 'club_agent', 'downline',
  'club_owner', 'club_staff', 'union_owner', 'financial',
];

const plain = (value) => JSON.parse(JSON.stringify(value));

async function invoke(options = {}) {
  const calls = { rpc: [], provider: [], tables: [], logs: [], unexpected: [] };
  function unexpected(message) {
    calls.unexpected.push(message);
    throw new Error(message);
  }
  const user = options.noUser ? null : { id: ACTOR };
  const authError = options.authError ? { message: 'invalid session' } : null;
  const supabase = {
    auth: {
      admin: {
        async deleteUser(...args) {
          calls.provider.push(args);
          return { error: options.providerError ? { message: 'provider refused' } : null };
        },
      },
    },
    from(table) {
      calls.tables.push(table);
      if (table !== 'user_mfa_factors') return unexpected(`Unexpected table: ${table}`);
      return {
        select(columns) {
          assert.equal(columns, 'enabled');
          return {
            eq(column, id) {
              assert.equal(column, 'user_id');
              assert.equal(id, ACTOR);
              return { maybeSingle: async () => ({ data: options.mfaEnabled ? { enabled: true } : null }) };
            },
          };
        },
      };
    },
    async rpc(name, args) {
      calls.rpc.push({ name, args: plain(args) });
      if (name === 'fn_close_account') {
        if (options.rpcError) return { data: null, error: { message: 'RPC refused' } };
        return { data: options.closed ?? { ok: true, already_closed: false, request_id: REQUEST }, error: null };
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
    apiRateLimit: { rateLimit: () => (options.rateDenied ? { ok: false, retryAfter: 60 } : { ok: true }) },
    mfaGate: {
      requireRecentMfa: async () =>
        options.mfaDenied ? { ok: false, status: 403, requiresStepUp: true, maxAgeSec: 300 } : { ok: true },
    },
    apiErrorHandler: { reportApiError: (error) => unexpected(`Unexpected handler error: ${error.message}`) },
  };
  const log = (level) => (...args) => calls.logs.push([level, ...args]);
  const context = vm.createContext({
    process: { env: Object.freeze({}) },
    console: { info: log('info'), warn: log('warn'), error: log('error') },
    fetch: () => unexpected('Network is prohibited'),
  });
  const module = new vm.SourceTextModule(await readFile(new URL(ROUTE, ROOT), 'utf8'), {
    context,
    identifier: ROUTE,
    importModuleDynamically: (specifier) => unexpected(`Unexpected dynamic import: ${specifier}`),
  });
  await module.link((specifier) => {
    const name = specifier.split('/').at(-1);
    if (!specifier.match(/^\.\.\//) || !dependencies[name]) return unexpected(`Unexpected import: ${specifier}`);
    const exports = dependencies[name];
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  });
  await module.evaluate();
  const req = {
    method: options.method ?? 'DELETE',
    headers: options.noAuthorization ? {} : { authorization: 'Bearer local-test-token' },
    body: { confirm: true },
  };
  const res = {
    statusCode: 200, headersSent: false, headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = plain(value); this.headersSent = true; return this; },
  };
  await module.namespace.default(req, res);
  assert.deepEqual(calls.unexpected, [], 'No unstubbed dependency or unexpected handler failure');
  return { calls, res, refusals: module.namespace.REFUSALS };
}

function assertNothingClosed(calls) {
  assert.equal(calls.provider.length, 0, 'A refusal must not touch the Auth user');
  assert.equal(calls.rpc.filter((c) => c.name === 'fn_mark_gdpr_completed').length, 0);
}

test('closes the account: one RPC, a SOFT Auth delete, the erasure marked complete', async () => {
  const { calls, res } = await invoke();
  assert.deepEqual(calls.rpc, [
    { name: 'fn_close_account', args: { p_user_id: ACTOR } },
    { name: 'fn_mark_gdpr_completed', args: { p_request_id: REQUEST } },
  ]);
  assert.deepEqual(calls.provider, [[ACTOR, true]], 'deleteUser(id, true): a hard delete cascades into the journals');
  assert.deepEqual(calls.tables, ['user_mfa_factors'], 'The handler reads the MFA probe and changes no table itself');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
});

test('a retry after the database already closed it finishes the Auth step', async () => {
  const { calls, res } = await invoke({ closed: { ok: true, already_closed: true, request_id: REQUEST } });
  assert.deepEqual(calls.provider, [[ACTOR, true]]);
  assert.deepEqual(calls.rpc.map((c) => c.name), ['fn_close_account', 'fn_mark_gdpr_completed']);
  assert.equal(res.statusCode, 200);
});

test('every reason the database refuses with has its own instruction', async () => {
  const { refusals } = await invoke();
  assert.deepEqual(Object.keys(refusals).sort(), [...REASONS].sort());
  for (const reason of REASONS) {
    assert.match(refusals[reason], /then close your account\.$/, `${reason} tells the player what to do first`);
  }
});

for (const reason of REASONS) {
  test(`refusal "${reason}": 400, the instruction in error, nothing closed`, async () => {
    const { calls, res, refusals } = await invoke({ closed: { ok: false, reason } });
    assertNothingClosed(calls);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.reason, reason);
    assert.equal(res.body.error, refusals[reason]);
  });
}

test('a financial refusal carries its blockers for support', async () => {
  const blockers = ['pending rakeback payout 44444444-4444-4444-8444-444444444444'];
  const { calls, res } = await invoke({ closed: { ok: false, reason: 'financial', blockers } });
  assertNothingClosed(calls);
  assert.deepEqual(res.body.blockers, blockers);
});

for (const reason of ['something_new', 'constructor', undefined]) {
  test(`an unknown refusal (${String(reason)}) answers 500 and closes nothing`, async () => {
    const { calls, res } = await invoke({ closed: { ok: false, reason } });
    assertNothingClosed(calls);
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.success, false);
  });
}

test('an RPC failure answers 500, says nothing changed, and touches no login', async () => {
  const { calls, res } = await invoke({ rpcError: true });
  assertNothingClosed(calls);
  assert.equal(res.statusCode, 500);
  assert.match(res.body.error, /Nothing was changed/);
});

test('an Auth failure after the scrub says so and leaves the request open', async () => {
  const { calls, res } = await invoke({ providerError: true });
  assert.deepEqual(calls.provider, [[ACTOR, true]]);
  assert.equal(calls.rpc.filter((c) => c.name === 'fn_mark_gdpr_completed').length, 0);
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.dataRemoved, true);
  assert.equal(res.body.loginRemoved, false);
});

for (const [name, options] of [['refuses', { markerError: true }], ['throws', { markerThrows: true }]]) {
  test(`the account is closed even when marking the request ${name}`, async () => {
    const { res, calls } = await invoke(options);
    assert.equal(res.statusCode, 200);
    assert.ok(calls.logs.some(([level]) => level === 'warn'));
  });
}

for (const [name, options, statusCode] of [
  ['method', { method: 'POST' }, 405],
  ['missing bearer', { noAuthorization: true }, 401],
  ['invalid session', { authError: true }, 401],
  ['missing user', { noUser: true }, 401],
  ['rate limit', { rateDenied: true }, 429],
  ['stale second factor', { mfaEnabled: true, mfaDenied: true }, 403],
]) {
  test(`${name} gate stops before anything is closed`, async () => {
    const { calls, res } = await invoke(options);
    assert.equal(calls.rpc.length, 0);
    assert.equal(calls.provider.length, 0);
    assert.equal(res.statusCode, statusCode);
  });
}

test('a fresh second factor lets the close through', async () => {
  const { calls, res } = await invoke({ mfaEnabled: true });
  assert.deepEqual(calls.provider, [[ACTOR, true]]);
  assert.equal(res.statusCode, 200);
});
