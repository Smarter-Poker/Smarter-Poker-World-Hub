import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const userId = '11111111-1111-4111-8111-111111111111';
const unionId = '22222222-2222-4222-8222-222222222222';
const otherUnion = '33333333-3333-4333-8333-333333333333';
const columns = 'id, union_id, club_id, club_name, reason, status, requested_at, reviewed_by, reviewed_at';

function compiled(path, dependencies, globals = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { fileName: path, compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require(name) {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
    return dependencies[name];
  }, ...globals }, { filename: path });
  return module.exports;
}

// Use the maintained Zod contract and actual handler. Only external I/O is modeled.
const contracts = compiled('../src/contracts/orb4_syndicate.ts', { zod: require('zod') });

function fixture(options = {}) {
  const queries = [], warnings = [];
  let reads = 0, authCalls = 0;
  const result = Object.hasOwn(options, 'result') ? options.result : { data: [], error: null };
  const db = { from(table) {
    const query = { table, filters: [] };
    queries.push(query);
    const chain = {
      select(value) { query.columns = value; return chain; },
      eq(key, value) { query.filters.push([key, value]); return chain; },
      async maybeSingle() {
        if (table === 'union_admins') return { data: options.admin === false ? null : { role: 'union_admin', permissions: {} }, error: null };
        assert.equal(table, 'unions');
        return { data: options.owner ? { id: unionId } : null, error: null };
      },
      async order(key, value) {
        assert.equal(table, 'union_leave_requests');
        query.order = [key, value]; reads++;
        if (options.rejection) throw options.rejection;
        return typeof result === 'function' ? result(reads) : result;
      },
    };
    return chain;
  } };
  const handler = compiled('../pages/api/club-arena/manage-union.js', {
    '../../../src/lib/serverAuth': { async getServerUserWithFallback() {
      authCalls++;
      return options.invalidAuth ? { user: null, error: new Error('expired') } : { user: { id: userId }, error: null };
    } },
    '../../../src/lib/supabaseServerClient': { createClient: () => db },
    '../../../src/lib/apiRateLimit': { LIMITS: { write: {} }, applyRateLimit(req, res) {
      if (options.rateLimited) { res.status(429).json({ success: false }); return false; }
      return true;
    } },
    '../../../src/contracts/orb4_syndicate': contracts,
    '../../../src/lib/club-arena/idempotency': {
      checkIdempotency() { assert.fail('A read must not acquire a mutation idempotency key'); },
      cacheResponse() { assert.fail('A read must not cache a mutation response'); },
    },
    '../../../src/lib/apiErrorHandler': { reportApiError(error) { warnings.push(error); } },
  }, {
    process: { env: { SUPABASE_SERVICE_ROLE_KEY: 'local-fixture-placeholder', NODE_ENV: 'production' } },
    console: { warn: (...args) => warnings.push(args) },
  }).default;
  return { queries, warnings, get reads() { return reads; }, get authCalls() { return authCalls; },
    async run(overrides = {}) {
      const req = { method: 'POST', headers: { authorization: 'Bearer local-fixture' }, body: { action: 'list_leave', unionId }, ...overrides };
      const res = { code: null, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = JSON.parse(JSON.stringify(body)); return this; } };
      await handler(req, res);
      return res;
    },
  };
}

test('successful empty leave list remains a known empty result with exact union/status/order', async () => {
  const f = fixture();
  const res = await f.run();
  assert.equal(res.code, 200);
  assert.deepEqual(res.body, { success: true, leaveRequests: [] });
  assert.deepEqual(f.queries[0].filters, [['union_id', unionId], ['user_id', userId]]);
  const read = f.queries[1];
  assert.deepEqual(JSON.parse(JSON.stringify(read)), { table: 'union_leave_requests', columns,
    filters: [['union_id', unionId], ['status', 'pending']], order: ['requested_at', { ascending: false }] });
});

test('success returns actual rows and a subsequent read can observe an external request', async () => {
  const row = { id: 'leave-1', union_id: unionId, status: 'pending', club_name: 'Test Club' };
  const f = fixture({ result: count => ({ data: count === 1 ? [] : [row], error: null }) });
  assert.deepEqual((await f.run()).body.leaveRequests, []);
  assert.deepEqual((await f.run()).body.leaveRequests, [row]);
  assert.equal(f.reads, 2);
});

for (const data of [null, [], [{ id: 'partial' }]]) {
  test(`database error cannot acknowledge an empty or partial leave list (${JSON.stringify(data)})`, async () => {
    const f = fixture({ result: { data, error: { message: 'private database failure', code: '57014' } } });
    const res = await f.run();
    assert.equal(res.code, 500);
    assert.deepEqual(res.body, { success: false, error: 'Union management failed' });
    assert.equal(f.reads, 1);
    assert.equal(f.warnings.length, 1);
  });
}

for (const data of [null, undefined, {}, 'not rows']) {
  test(`malformed successful transport cannot become a known empty list (${String(data)})`, async () => {
    const f = fixture({ result: { data, error: null } });
    const res = await f.run();
    assert.equal(res.code, 500);
    assert.deepEqual(res.body, { success: false, error: 'Union management failed' });
  });
}

test('thrown transport failure retains the existing non-sensitive error response', async () => {
  const f = fixture({ rejection: new Error('private network failure') });
  const res = await f.run();
  assert.equal(res.code, 500);
  assert.deepEqual(res.body, { success: false, error: 'Union management failed' });
});

test('existing owner fallback remains identity-bound; a foreign non-admin cannot read requests', async () => {
  const owner = fixture({ admin: false, owner: true });
  assert.equal((await owner.run()).code, 200);
  assert.deepEqual(owner.queries[1].filters, [['id', unionId], ['owner_id', userId]]);
  const foreign = fixture({ admin: false });
  assert.equal((await foreign.run({ body: { action: 'list_leave', unionId: otherUnion } })).code, 403);
  assert.deepEqual(foreign.queries[0].filters, [['union_id', otherUnion], ['user_id', userId]]);
  assert.equal(foreign.reads, 0);
});

test('method, auth, input validation and rate limits remain ahead of leave reads', async () => {
  for (const [options, request, status] of [
    [{}, { method: 'GET' }, 405], [{}, { headers: {} }, 401],
    [{ invalidAuth: true }, {}, 401], [{}, { body: { action: 'list_leave', unionId: 'bad' } }, 400],
    [{}, { body: { action: 'list_leave' } }, 400], [{ rateLimited: true }, {}, 429],
  ]) {
    const f = fixture(options);
    assert.equal((await f.run(request)).code, status);
    assert.equal(f.reads, 0);
    assert.equal(f.queries.length, 0);
  }
});
