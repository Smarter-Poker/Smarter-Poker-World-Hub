/**
 * Phase 1 foundation of the /horses operator console.
 *
 * Unit tests (real code, fake I/O) for:
 *   - permissions vocabulary and role mapping
 *   - validate.js (uuid, int, money2dp, paging, searchTerm, ...)
 *   - apiEnvelope.js (error scrubbing never echoes database text)
 *   - operatorAuth.requireOperator (401/403/503 paths, service-role refusal)
 *   - operatorAudit.buildAuditRow (one shape, always stamped)
 *   - operatorRoute.withOperatorRoute (405, rate limit, auth, durable, envelope, scrub)
 *   - paged.js (range math, totals, fetchAll truncation)
 *
 * Nothing here touches Supabase, Sentry or the network: every dependency the
 * modules reach for is injected.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PERMISSIONS,
  ALL_PERMISSIONS,
  LEGACY_ADMIN_ROLES,
  permissionsForRole,
  hasPermission,
  isOperatorRole,
  isKnownPermission,
} from '../src/lib/horses/permissions.js';
import * as v from '../src/lib/horses/validate.js';
import { scrubError, ApiError, badRequest, looksLikeDatabaseError, requestIdOf } from '../src/lib/horses/apiEnvelope.js';
import { requireOperator } from '../src/lib/horses/operatorAuth.js';
import { buildAuditRow, isValidAuditAction, auditOperatorAction } from '../src/lib/horses/operatorAudit.js';
import { withOperatorRoute } from '../src/lib/horses/operatorRoute.js';
import { paging, runPaged, pagedResult, fetchAll } from '../src/lib/horses/paged.js';

// ---------------------------------------------------------------- helpers

function fakeRes() {
  const res = {
    statusCode: null,
    body: null,
    headers: {},
    headersSent: false,
    writableEnded: false,
    setHeader(k, val) {
      this.headers[k.toLowerCase()] = val;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      this.headersSent = true;
      this.writableEnded = true;
      return this;
    },
  };
  return res;
}

function fakeReq({ method = 'GET', token = 'x'.repeat(40), headers = {}, query = {}, body = {} } = {}) {
  return {
    method,
    url: '/api/horses/test',
    headers: { authorization: token ? 'Bearer ' + token : undefined, 'user-agent': 'node-test', ...headers },
    query,
    body,
    socket: { remoteAddress: '127.0.0.1' },
  };
}

/** A tiny query builder that records the calls the libs make. */
function fakeDb({ profile = { id: 'u1', role: 'admin' }, profileError = null, rpcError = null, insertError = null } = {}) {
  const calls = { rpc: [], inserts: [] };
  const db = {
    calls,
    from(table) {
      const chain = {
        _table: table,
        select() {
          return chain;
        },
        eq() {
          return chain;
        },
        order() {
          return chain;
        },
        async maybeSingle() {
          return { data: profile, error: profileError };
        },
        async insert(row) {
          calls.inserts.push({ table, row });
          return { error: insertError };
        },
      };
      return chain;
    },
    async rpc(name, args) {
      calls.rpc.push({ name, args });
      return { data: true, error: rpcError };
    },
  };
  return db;
}

const okVerifier = async () => ({ user: { id: 'u1', email: 'op@example.com' }, error: null });
const badVerifier = async () => ({ user: null, error: 'Invalid token' });

// ---------------------------------------------------------------- permissions

test('legacy roles hold every permission in Phase 1 (behaviour unchanged)', () => {
  for (const role of LEGACY_ADMIN_ROLES) {
    assert.deepEqual(permissionsForRole(role), ALL_PERMISSIONS);
    assert.ok(isOperatorRole(role));
  }
  assert.deepEqual(permissionsForRole('player'), []);
  assert.deepEqual(permissionsForRole(null), []);
  assert.equal(isOperatorRole('player'), false);
});

test('hasPermission refuses unknown vocabulary even for a superset holder', () => {
  const perms = permissionsForRole('god');
  assert.ok(hasPermission(perms, PERMISSIONS.MONEY_WRITE));
  assert.equal(hasPermission(perms, 'money.mint_everything'), false);
  assert.equal(isKnownPermission('sql.execute'), true);
  assert.equal(isKnownPermission(''), false);
});

// ---------------------------------------------------------------- validate

test('uuid accepts every RFC 4122 layout including v7 and lower-cases', () => {
  assert.equal(v.uuid('018F5C2E-1A2B-7C3D-8E4F-0123456789AB'), '018f5c2e-1a2b-7c3d-8e4f-0123456789ab');
  assert.equal(v.uuid('not-a-uuid'), null);
  assert.equal(v.uuid(42), null);
  assert.deepEqual(v.uuidList(['11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111']), [
    '11111111-1111-1111-1111-111111111111',
  ]);
  assert.equal(v.uuidList(['11111111-1111-1111-1111-111111111111', 'x']), null);
  assert.equal(v.uuidList([]), null);
});

test('int rejects NaN, floats, exponent notation and out-of-range values', () => {
  assert.equal(v.int('abc', { fallback: 7 }), 7);
  assert.equal(v.int('1e3'), null);
  assert.equal(v.int('2.5'), null);
  assert.equal(v.int('30', { min: 1, max: 365 }), 30);
  assert.equal(v.int('366', { min: 1, max: 365 }), null);
  assert.equal(v.int(undefined, { fallback: 5 }), 5);
});

test('money2dp parses from the string, so 0.07 and 1.15 are accepted and 3 dp is refused', () => {
  assert.equal(v.money2dp('0.07'), 0.07);
  assert.equal(v.money2dp(1.15), 1.15);
  assert.equal(v.money2dp('0.29'), 0.29);
  assert.equal(v.money2dp('100'), 100);
  assert.equal(v.money2dp('1.005'), null);
  assert.equal(v.money2dp('-5'), null);
  assert.equal(v.money2dp('0'), null);
  assert.equal(v.money2dp('0', { allowZero: true }), 0);
  assert.equal(v.money2dp('1e3'), null);
  assert.equal(v.money2dp('abc'), null);
  assert.equal(v.money2dp('5000000', { max: 1_000_000 }), null);
});

test('paging clamps and computes the PostgREST range end', () => {
  assert.deepEqual(v.paging({}), { limit: 50, offset: 0, rangeEnd: 49 });
  assert.deepEqual(v.paging({ limit: '5000', offset: '10' }, { max: 200 }), { limit: 200, offset: 10, rangeEnd: 209 });
  assert.deepEqual(v.paging({ limit: 'x', offset: '-4' }), { limit: 50, offset: 0, rangeEnd: 49 });
});

test('searchTerm strips PostgREST filter grammar and enumOf/text/bool behave', () => {
  assert.equal(v.searchTerm("dan%'),or(role.eq.god"), 'dan or role eq god');
  assert.equal(v.searchTerm('   '), null);
  assert.equal(v.enumOf('approve', ['approve', 'cancel']), 'approve');
  assert.equal(v.enumOf('delete', ['approve', 'cancel']), null);
  assert.equal(v.text('  hi  ', { min: 2 }), 'hi');
  assert.equal(v.text('x', { min: 2 }), null);
  assert.equal(v.bool('true'), true);
  assert.equal(v.bool('nope', { fallback: false }), false);
  assert.equal(v.isoDate('2026-09-02'), '2026-09-02T00:00:00.000Z');
  assert.equal(v.isoDate('yesterday'), null);
  assert.deepEqual(v.pick({ a: 1, b: 2, c: 3 }, ['a', 'c', 'z']), { a: 1, c: 3 });
});

// ---------------------------------------------------------------- envelope

test('scrubError never echoes database text and passes ApiError through', () => {
  const pg = scrubError(new Error('relation "public.secret_table" does not exist'));
  assert.equal(pg.status, 500);
  assert.equal(pg.message, 'Request failed');
  const pgrst = scrubError(new Error('PGRST116: The result contains 0 rows'));
  assert.equal(pgrst.message, 'Request failed');
  const dup = scrubError(new Error('duplicate key value violates unique constraint "ux_thing"'));
  assert.equal(dup.message, 'Request failed');
  const api = scrubError(badRequest('Amount Must Be Positive'));
  assert.deepEqual(api, { status: 400, code: 'bad_request', message: 'Amount Must Be Positive' });
  const custom = scrubError(new ApiError(409, 'Already Resolved', 'already_resolved'));
  assert.equal(custom.status, 409);
  assert.equal(custom.code, 'already_resolved');
  assert.ok(looksLikeDatabaseError('column "user_id" does not exist'));
  assert.equal(looksLikeDatabaseError('Amount Must Be Positive'), false);
});

test('requestIdOf prefers the Vercel id and mints one otherwise', () => {
  assert.equal(requestIdOf({ headers: { 'x-vercel-id': 'iad1::abc' } }), 'iad1::abc');
  assert.match(requestIdOf({ headers: {} }), /^local-/);
});

// ---------------------------------------------------------------- operatorAuth

test('requireOperator: 503 when the service-role client cannot be built (no anon fallback)', async () => {
  const res = fakeRes();
  const op = await requireOperator(fakeReq(), res, {
    permission: PERMISSIONS.CONSOLE_READ,
    deps: {
      getServerUserWithFallback: okVerifier,
      getDb: async () => {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for the operator console');
      },
    },
  });
  assert.equal(op, null);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, 'service_role_missing');
});

test('requireOperator: 401 without a bearer token and on a rejected token', async () => {
  const db = fakeDb();
  let res = fakeRes();
  assert.equal(
    await requireOperator(fakeReq({ token: null }), res, {
      permission: PERMISSIONS.CONSOLE_READ,
      deps: { getServerUserWithFallback: okVerifier, getDb: async () => db },
    }),
    null
  );
  assert.equal(res.statusCode, 401);
  res = fakeRes();
  assert.equal(
    await requireOperator(fakeReq(), res, {
      permission: PERMISSIONS.CONSOLE_READ,
      deps: { getServerUserWithFallback: badVerifier, getDb: async () => db },
    }),
    null
  );
  assert.equal(res.statusCode, 401);
});

test('requireOperator: 403 for a non-operator role, 200 context for an admin, 500 for a made-up permission', async () => {
  let res = fakeRes();
  const player = fakeDb({ profile: { id: 'u1', role: 'player' } });
  assert.equal(
    await requireOperator(fakeReq(), res, {
      permission: PERMISSIONS.MONEY_WRITE,
      deps: { getServerUserWithFallback: okVerifier, getDb: async () => player },
    }),
    null
  );
  assert.equal(res.statusCode, 403);

  res = fakeRes();
  const admin = fakeDb({ profile: { id: 'u1', role: 'admin', username: 'dan' } });
  const op = await requireOperator(fakeReq(), res, {
    permission: PERMISSIONS.MONEY_WRITE,
    deps: { getServerUserWithFallback: okVerifier, getDb: async () => admin },
  });
  assert.ok(op);
  assert.equal(op.role, 'admin');
  assert.equal(op.db, admin);
  assert.ok(op.permissions.includes(PERMISSIONS.MONEY_WRITE));
  assert.equal(res.statusCode, null);

  res = fakeRes();
  assert.equal(
    await requireOperator(fakeReq(), res, {
      permission: 'not.a.permission',
      deps: { getServerUserWithFallback: okVerifier, getDb: async () => admin },
    }),
    null
  );
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.code, 'route_misconfigured');
});

/**
 * H-1 (re-verification 2026-09-03). `profiles.role` is free text this feature
 * does not own. An account whose profile says 'owner' and whose only grant is
 * read_only used to reach the console holding every permission, because the
 * JS resolver seeded its legacy set from the full matrix. It holds exactly
 * what the grant says.
 */
test('requireOperator: a named key in profiles.role contributes nothing, only the grant does', async () => {
  const { _resetOperatorCachesForTests } = await import('../src/lib/horses/operatorAuth.js');
  const { permissionsForRole: forRole, orderPermissions } = await import('../src/lib/horses/permissions.js');
  const dbFor = (profileRole, grantedRole) => {
    const calls = { rpc: [] };
    return {
      calls,
      from(table) {
        const chain = {
          select: () => chain,
          eq: () => chain,
          async maybeSingle() {
            if (table === 'profiles') return { data: { id: 'u1', role: profileRole }, error: null };
            if (table === 'ca_operator_policy') return { data: { id: true, enforce_named_roles: false }, error: null };
            return { data: null, error: null };
          },
        };
        return chain;
      },
      async rpc(name, args) {
        calls.rpc.push({ name, args });
        return {
          data: { role: profileRole, roles: [grantedRole], permissions: forRole(grantedRole), source: 'granted' },
          error: null,
        };
      },
    };
  };

  _resetOperatorCachesForTests();
  let res = fakeRes();
  const owner = dbFor('owner', 'read_only');
  const op = await requireOperator(fakeReq(), res, {
    permission: PERMISSIONS.CONSOLE_READ,
    deps: { getServerUserWithFallback: okVerifier, getDb: async () => owner },
  });
  assert.ok(op, 'the grant admits the account');
  assert.deepEqual(op.permissions, orderPermissions(forRole('read_only')), 'exactly the grant, nothing from the profile string');
  assert.equal(op.permissions.includes(PERMISSIONS.ADMIN_MANAGE), false);
  assert.equal(op.permissions.includes(PERMISSIONS.SQL_EXECUTE), false);
  assert.deepEqual(op.grantedRoles, ['read_only']);

  _resetOperatorCachesForTests();
  res = fakeRes();
  assert.equal(
    await requireOperator(fakeReq(), res, {
      permission: PERMISSIONS.MONEY_WRITE,
      deps: { getServerUserWithFallback: okVerifier, getDb: async () => dbFor('owner', 'read_only') },
    }),
    null
  );
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'permission_denied');

  // profiles.role 'finance' + a support grant: no money.write.
  _resetOperatorCachesForTests();
  res = fakeRes();
  assert.equal(
    await requireOperator(fakeReq(), res, {
      permission: PERMISSIONS.MONEY_WRITE,
      deps: { getServerUserWithFallback: okVerifier, getDb: async () => dbFor('finance', 'support') },
    }),
    null
  );
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'permission_denied');
  _resetOperatorCachesForTests();
});

test('requireOperator: 503 (not 403) when the profile read itself fails', async () => {
  const res = fakeRes();
  const db = fakeDb({ profile: null, profileError: { message: 'connection reset' } });
  assert.equal(
    await requireOperator(fakeReq(), res, {
      permission: PERMISSIONS.CONSOLE_READ,
      deps: { getServerUserWithFallback: okVerifier, getDb: async () => db },
    }),
    null
  );
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, 'role_lookup_failed');
});

// ---------------------------------------------------------------- operatorAudit

test('buildAuditRow stamps actor, role, ip, user agent, request id and before/after', () => {
  const op = { user: { id: 'u1' }, role: 'admin', requestId: 'req-1', db: fakeDb() };
  const req = fakeReq({ headers: { 'x-real-ip': '10.0.0.9', 'x-forwarded-for': '1.1.1.1, 2.2.2.2' } });
  const row = buildAuditRow(op, req, {
    action: 'horse.set_active',
    targetType: 'content_author',
    targetId: 12,
    before: { is_active: false },
    after: { is_active: true },
    details: { source: 'stable' },
  });
  assert.equal(row.admin_user_id, 'u1');
  assert.equal(row.actor_role, 'admin');
  assert.equal(row.ip_address, '10.0.0.9');
  assert.equal(row.user_agent, 'node-test');
  assert.equal(row.request_id, 'req-1');
  assert.equal(row.target_id, '12');
  assert.deepEqual(row.before_state, { is_active: false });
  assert.deepEqual(row.after_state, { is_active: true });
  assert.throws(() => buildAuditRow(op, req, { action: 'SetActive' }), /Invalid audit action/);
  assert.ok(isValidAuditAction('cashout.approve'));
  assert.equal(isValidAuditAction('cashout'), false);
});

test('auditOperatorAction uses the RPC, falls back to insert, and never throws', async () => {
  const ok = fakeDb();
  let r = await auditOperatorAction({ user: { id: 'u1' }, role: 'admin', db: ok }, fakeReq(), { action: 'a.b' });
  assert.equal(r.ok, true);
  assert.equal(ok.calls.rpc[0].name, 'fn_log_admin_action');
  assert.equal(ok.calls.inserts.length, 0);

  const rpcDown = fakeDb({ rpcError: { message: 'function does not exist' } });
  r = await auditOperatorAction({ user: { id: 'u1' }, role: 'admin', db: rpcDown }, fakeReq(), { action: 'a.b' });
  assert.equal(r.ok, true);
  assert.equal(rpcDown.calls.inserts[0].table, 'admin_audit_log');

  const allDown = fakeDb({ rpcError: { message: 'x' }, insertError: { message: 'y' } });
  r = await auditOperatorAction({ user: { id: 'u1' }, role: 'admin', db: allDown }, fakeReq(), { action: 'a.b' });
  assert.equal(r.ok, false);

  r = await auditOperatorAction({ user: { id: 'u1' }, role: 'admin' }, fakeReq(), { action: 'a.b' });
  assert.equal(r.ok, false);
});

// ---------------------------------------------------------------- operatorRoute

function routeDeps({ limitOk = true, durableOk = true, profile = { id: 'u1', role: 'admin' } } = {}) {
  const db = fakeDb({ profile });
  const calls = { durable: [], reported: [] };
  const deps = {
    LIMITS: { read: { max: 120 }, write: { max: 30 }, financial: { max: 20 }, default: { max: 60 } },
    applyRateLimit(req, res, cfg) {
      calls.limitCfg = cfg;
      if (!limitOk) {
        res.status(429).json({ success: false, error: 'Too many requests' });
        return false;
      }
      return true;
    },
    async applyDurableRateLimit(dbArg, res, opts) {
      calls.durable.push(opts);
      if (!durableOk) {
        res.status(429).json({ success: false, error: 'Too many requests' });
        return false;
      }
      return true;
    },
    reportApiError(err, req, extra) {
      calls.reported.push({ message: err?.message, extra });
    },
    requireOperator: (req, res, opts) =>
      requireOperator(req, res, { ...opts, deps: { getServerUserWithFallback: okVerifier, getDb: async () => db } }),
  };
  return { deps, db, calls };
}

test('withOperatorRoute: 405 with Allow header for a method outside the allowlist', async () => {
  const { deps } = routeDeps();
  const route = withOperatorRoute({ name: 't', methods: ['POST'], permission: PERMISSIONS.CONSOLE_READ }, async () => ({}), deps);
  const res = fakeRes();
  await route(fakeReq({ method: 'GET' }), res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, 'POST');
});

test('withOperatorRoute: rate limit runs before auth and picks the per-method LIMITS key', async () => {
  const { deps, calls } = routeDeps({ limitOk: false });
  const route = withOperatorRoute(
    { name: 't', methods: ['GET', 'POST'], permission: PERMISSIONS.CONSOLE_READ, limit: { GET: 'read', POST: 'financial' } },
    async () => ({}),
    deps
  );
  const res = fakeRes();
  await route(fakeReq({ method: 'POST' }), res);
  assert.equal(res.statusCode, 429);
  assert.deepEqual(calls.limitCfg, { max: 20 });
});

test('withOperatorRoute: success envelope carries success, payload and requestId', async () => {
  const { deps } = routeDeps();
  const route = withOperatorRoute(
    { name: 't', methods: ['GET'], permission: PERMISSIONS.CONSOLE_READ },
    async ({ op, query }) => ({ role: op.role, q: query.q }),
    deps
  );
  const res = fakeRes();
  await route(fakeReq({ headers: { 'x-vercel-id': 'v1' }, query: { q: 'hi' } }), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true, role: 'admin', q: 'hi', requestId: 'v1' });
});

test('withOperatorRoute: per-method permission is enforced', async () => {
  const { deps } = routeDeps({ profile: { id: 'u1', role: 'player' } });
  const route = withOperatorRoute(
    { name: 't', methods: ['GET', 'POST'], permission: { GET: PERMISSIONS.MONEY_READ, POST: PERMISSIONS.MONEY_WRITE } },
    async () => ({}),
    deps
  );
  const res = fakeRes();
  await route(fakeReq({ method: 'POST' }), res);
  assert.equal(res.statusCode, 403);
});

test('withOperatorRoute: durable limiter is keyed on route, method and operator id', async () => {
  const { deps, calls } = routeDeps();
  const route = withOperatorRoute(
    { name: 'horses.mint', methods: ['POST'], permission: PERMISSIONS.MONEY_WRITE, durable: { POST: { max: 20, windowSeconds: 60 } } },
    async () => ({ minted: true }),
    deps
  );
  const res = fakeRes();
  await route(fakeReq({ method: 'POST' }), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls.durable[0], { key: 'horses.mint:POST:u1', max: 20, windowSeconds: 60 });

  const blocked = routeDeps({ durableOk: false });
  const route2 = withOperatorRoute(
    { name: 'horses.mint', methods: ['POST'], permission: PERMISSIONS.MONEY_WRITE, durable: { max: 1, windowSeconds: 60 } },
    async () => ({ minted: true }),
    blocked.deps
  );
  const res2 = fakeRes();
  await route2(fakeReq({ method: 'POST' }), res2);
  assert.equal(res2.statusCode, 429);
});

test('withOperatorRoute: an ApiError keeps its status and safe message; a database throw is scrubbed, logged and reported', async () => {
  const { deps, calls } = routeDeps();
  const bad = withOperatorRoute(
    { name: 't', methods: ['POST'], permission: PERMISSIONS.CONSOLE_READ },
    async () => {
      throw badRequest('Reason Must Be At Least 10 Characters');
    },
    deps
  );
  let res = fakeRes();
  await bad(fakeReq({ method: 'POST' }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'Reason Must Be At Least 10 Characters');
  assert.equal(calls.reported.length, 0);

  const boom = withOperatorRoute(
    { name: 't', methods: ['POST'], permission: PERMISSIONS.CONSOLE_READ },
    async () => {
      throw new Error('relation "public.ca_mint_ledger" does not exist');
    },
    deps
  );
  res = fakeRes();
  const origError = console.error;
  console.error = () => {};
  try {
    await boom(fakeReq({ method: 'POST' }), res);
  } finally {
    console.error = origError;
  }
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.error, 'Request failed');
  assert.doesNotMatch(JSON.stringify(res.body), /ca_mint_ledger/);
  assert.equal(calls.reported.length, 1);
});

test('withOperatorRoute: a handler that writes its own response is left alone', async () => {
  const { deps } = routeDeps();
  const route = withOperatorRoute(
    { name: 't', methods: ['GET'], permission: PERMISSIONS.CONSOLE_READ },
    async ({ res }) => {
      res.status(204).json({ custom: true });
    },
    deps
  );
  const res = fakeRes();
  await route(fakeReq(), res);
  assert.equal(res.statusCode, 204);
  assert.deepEqual(res.body, { custom: true });
});

// ---------------------------------------------------------------- paged

test('runPaged/pagedResult apply the range and compute hasMore from the exact count', async () => {
  const page = paging({ limit: '2', offset: '2' });
  const q = {
    async range(a, b) {
      return { data: [{ id: 3 }, { id: 4 }], count: 5, error: null, a, b };
    },
  };
  const r = await runPaged(q, page);
  const out = pagedResult(r, page, { note: 'x' });
  assert.deepEqual(out, { rows: [{ id: 3 }, { id: 4 }], total: 5, limit: 2, offset: 2, hasMore: true, note: 'x' });
  const last = pagedResult({ data: [{ id: 5 }], count: 5 }, paging({ limit: '2', offset: '4' }));
  assert.equal(last.hasMore, false);
});

test('fetchAll walks pages and reports truncation at maxRows', async () => {
  const pages = [Array.from({ length: 3 }, (_, i) => ({ i })), Array.from({ length: 3 }, (_, i) => ({ i: i + 3 })), [{ i: 6 }]];
  let n = 0;
  const build = () => ({
    async range() {
      return { data: pages[n++] || [], error: null };
    },
  });
  const all = await fetchAll(build, { size: 3 });
  assert.equal(all.rows.length, 7);
  assert.equal(all.truncated, false);
  n = 0;
  const capped = await fetchAll(build, { size: 3, maxRows: 3 });
  assert.equal(capped.rows.length, 3);
  assert.equal(capped.truncated, true);
});
