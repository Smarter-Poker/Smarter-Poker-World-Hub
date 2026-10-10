import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homeGameJoinOutcome, createHomeGameJoinOperation } from '../src/lib/home-games/joinOutcome.mjs';
import * as followPrivacy from '../src/lib/home-games/socialFollowPrivacy.mjs';
const require = createRequire(import.meta.url);
const ts = require('typescript');

async function loadGroupProxy(fetcher) {
  const source = await readFile(new URL('../pages/api/commander/home-games/groups/[id].js', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'fetch', compiled)(name => {
    if (name.endsWith('apiRateLimit')) return { applyRateLimit: () => true, LIMITS: { read: {}, write: {} } };
    throw new Error(`Unexpected group proxy dependency ${name}`);
  }, module, module.exports, fetcher);
  return module.exports.default;
}

function responseRecorder() {
  return { statusCode: 200, headers: {}, setHeader(name, value) { this.headers[name] = value; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, send(body) { this.body = body; return this; } };
}

test('join only confirms approved or pending canonical membership', () => {
  assert.equal(homeGameJoinOutcome({ success: true, status: 'approved' }).state, 'joined');
  assert.equal(homeGameJoinOutcome({ membership: { status: 'pending' } }).state, 'pending');
  assert.equal(homeGameJoinOutcome({ data: { status: 'approved' } }).state, 'joined');
  for (const status of ['banned', 'declined']) assert.equal(homeGameJoinOutcome({ success: true, status }).state, 'error');
  for (const payload of [{}, null, { success: true }, { status: 'unknown' }]) assert.equal(homeGameJoinOutcome(payload).state, 'unknown');
  assert.equal(homeGameJoinOutcome({ success: false, status: 'approved', error: 'BANNED' }).state, 'error');
});

test('join suppresses synchronous duplicate writes and preserves operation after unknown acknowledgment', async () => {
  let generated = 0;
  const operation = createHomeGameJoinOperation(() => `owned-${++generated}`);
  const keys = [];
  let release;
  const pending = operation.run('CODE', async key => { keys.push(key); await new Promise(resolve => { release = resolve; }); throw new Error('ack lost'); });
  assert.equal(await operation.run('CODE', () => { assert.fail('duplicate write'); }), null);
  release();
  await assert.rejects(pending, /ack lost/);
  await operation.run('CODE', key => { keys.push(key); return homeGameJoinOutcome({ status: 'pending' }); });
  await operation.run('OTHER', key => { keys.push(key); return homeGameJoinOutcome({ status: 'approved' }); });
  assert.deepEqual(keys, ['owned-1', 'owned-1', 'owned-2']);
});

test('invite page actually wires guarded operation, canonical outcome and unknown readback state', async () => {
  const source = await readFile(new URL('../pages/hub/commander/home-games/join.js', import.meta.url), 'utf8');
  assert.match(source, /joinOperation\.current\.run\(codeToUse/);
  assert.match(source, /'X-Idempotency-Key': idempotencyKey/);
  assert.match(source, /homeGameJoinOutcome\(data\)/);
  assert.match(source, /state === 'unknown'/);
  assert.match(source, /Review My Home Games/);
  const detail = await readFile(new URL('../pages/hub/commander/home-games/[id].js', import.meta.url), 'utf8');
  assert.match(detail, /joinOperation\.current\.run\(String\(id\)/);
  assert.match(detail, /homeGameJoinOutcome\(data\)/);
});

test('actual creation response branch preserves unknown operation and only confirms a UUID group', async () => {
  const source = await readFile(new URL('../pages/hub/commander/home-games/create.js', import.meta.url), 'utf8');
  const start = source.indexOf('      let res;', source.indexOf('async function handleSubmit'));
  const end = source.indexOf('        setCreatedGroup(data.group);', start) + '        setCreatedGroup(data.group);'.length;
  assert.ok(start > 0 && end > start);
  const branch = source.slice(start, end) + '\n} else { setStep(4); }';
  const run = async ({ status = 200, payload = {}, network = false, parse = false }) => {
    const observed = { steps: [], groups: [], operation: { current: 'original-operation' } };
    const evaluate = new Function('fetch', 'submissionTokenRef', 'setStep', 'makeToken', 'setCreatedGroup', 'console',
      `return (async () => { const token = 'fixture'; const payload = {}; ${branch} })();`);
    await evaluate(async () => {
      if (network) throw new Error('lost acknowledgment');
      return { status, ok: status >= 200 && status < 300, json: async () => { if (parse) throw new Error('bad JSON'); return payload; } };
    }, observed.operation, step => observed.steps.push(step), () => 'replacement-operation', group => observed.groups.push(group), { log() {}, error() {} });
    return observed;
  };
  for (const fixture of [{ payload: null }, { payload: {} }, { payload: { group: { id: 'not-a-uuid' } } }, { status: 500 }, { status: 409 }, { status: 429 }, { network: true }, { parse: true }]) {
    const result = await run(fixture);
    assert.deepEqual(result.steps, [4]);
    assert.deepEqual(result.groups, []);
    assert.equal(result.operation.current, 'original-operation');
  }
  const confirmed = await run({ payload: { group: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } } });
  assert.equal(confirmed.groups.length, 1);
  assert.equal(confirmed.operation.current, 'replacement-operation');
  await assert.rejects(run({ status: 403, payload: { error: 'Forbidden' } }), /Forbidden/);
});

test('group filesystem route preserves canonical GET/PUT/PATCH/DELETE contracts and auth isolation', async () => {
  const calls = [];
  const canonical = JSON.stringify({ group: { id: 'owned-group', name: 'Owned Qualification', owner_id: 'host', contact_phone: null }, my_membership: { status: 'approved' } });
  const handler = await loadGroupProxy(async (url, options) => {
    calls.push({ url, options });
    return { status: 200, headers: new Headers({ 'content-type': 'application/json', 'retry-after': '60' }), text: async () => canonical };
  });
  for (const method of ['GET', 'PUT', 'PATCH', 'DELETE']) {
    const res = responseRecorder();
    await handler({ method, query: { id: 'owned-group' }, headers: { authorization: 'Bearer owned-fixture', cookie: 'never-forward', 'x-staff-session': 'never-forward', 'x-idempotency-key': 'owned-operation' }, body: { contact_phone: null } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body, canonical);
    assert.equal(res.headers['Cache-Control'], 'private, no-store');
    assert.equal(res.headers['retry-after'], '60');
    const call = calls.at(-1);
    assert.equal(call.options.method, method);
    assert.equal(call.url, 'https://commander.smarter.poker/api/home-games/groups/owned-group');
    assert.equal(call.options.headers.Authorization, 'Bearer owned-fixture');
    assert.equal(call.options.headers['X-Idempotency-Key'], 'owned-operation');
    assert.equal(call.options.headers.cookie, undefined);
    assert.equal(call.options.headers['x-staff-session'], undefined);
    assert.equal(call.options.redirect, 'error');
  }
});

test('group proxy preserves upstream denial, rejects unsafe paths/methods and fails unavailable without fake success', async () => {
  let calls = 0;
  const denied = await loadGroupProxy(async () => { calls++; return { status: 403, headers: new Headers(), text: async () => '{"error":"private"}' }; });
  for (const id of [undefined, ['owned-group'], '../private', 'owned/group']) {
    const res = responseRecorder();
    await denied({ method: 'GET', query: { id }, headers: {} }, res);
    assert.equal(res.statusCode, 400);
  }
  const methodRes = responseRecorder();
  await denied({ method: 'POST', query: { id: 'owned-group' }, headers: {} }, methodRes);
  assert.equal(methodRes.statusCode, 405);
  assert.equal(calls, 0);
  const deniedRes = responseRecorder();
  await denied({ method: 'GET', query: { id: 'owned-group' }, headers: {} }, deniedRes);
  assert.equal(deniedRes.statusCode, 403);
  assert.equal(deniedRes.body, '{"error":"private"}');
  const unavailable = await loadGroupProxy(async () => { throw new Error('private provider diagnostic'); });
  const unavailableRes = responseRecorder();
  await unavailable({ method: 'GET', query: { id: 'owned-group' }, headers: {} }, unavailableRes);
  assert.equal(unavailableRes.statusCode, 502);
  assert.equal(unavailableRes.body.success, false);
  assert.doesNotMatch(JSON.stringify(unavailableRes.body), /private provider diagnostic/);
});

test('Home Game follows use current group and canonical membership, not social roles', async () => {
  const page = { id: 'page', page_type: 'home_game', linked_entity_id: 'group', is_public: true, metadata: { exact_address: 'Private address' }, name: 'Owned' };
  function client(status, isPrivate = false, fail = false) {
    return { from(table) { return { select() { return this; }, eq() { return this; }, async maybeSingle() {
      return { data: table === 'commander_home_groups' ? { id: 'group', owner_id: 'host', is_active: true, is_private: isPrivate } : { status, role: 'admin' }, error: fail ? new Error('database unavailable') : null };
    } }; } };
  }
  assert.equal((await followPrivacy.homeGameFollowContext(client('banned'), page, 'member')).denied, true);
  assert.equal((await followPrivacy.homeGameFollowContext(client('pending'), page, 'member')).staff, false);
  assert.equal((await followPrivacy.homeGameFollowContext(client('approved', true), page, 'member')).public, false);
  assert.equal((await followPrivacy.homeGameFollowContext(client('approved', true), page, 'member')).approved, true);
  assert.equal((await followPrivacy.homeGameFollowContext(client('approved'), page, 'member')).staff, true);
  await assert.rejects(followPrivacy.homeGameFollowContext(client('approved', false, true), page, 'member'), /unavailable/);
  assert.equal(followPrivacy.publicHomeGameFollowPage(page).metadata, undefined);
  const generic = { page_type: 'club', metadata: { original: true } };
  assert.equal(followPrivacy.publicHomeGameFollowPage(generic), generic);
});

test('actual follow route prevents cross-user preferences and private-parent follow disclosure', async () => {
  const source = await readFile(new URL('../pages/api/social/pages/follow.js', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  let writes = 0;
  const page = { id: 'page', owner_id: 'host', page_type: 'home_game', linked_entity_type: 'home_group', linked_entity_id: 'group', is_public: true };
  const client = { from(table) {
    const filters = {};
    const query = { select() { return this; }, eq(key, value) { filters[key] = value; return this; }, in() { return this; }, limit() { return this; }, order() { return this; }, update() { writes++; return this; },
      async maybeSingle() { return result(true); }, then(resolve, reject) { return Promise.resolve(result(false)).then(resolve, reject); } };
    function result(single) {
      const row = table === 'social_pages' ? page : table === 'commander_home_groups' ? { id: 'group', owner_id: 'host', is_active: true, is_private: true } : table === 'commander_home_members' ? { status: 'pending', role: 'admin' } : { page_id: 'page', user_id: 'member', status: 'approved' };
      return { data: single ? row : [row], error: null };
    }
    return query;
  } };
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://owned-fixture.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'owned-fixture-placeholder';
  try {
    const module = { exports: {} };
    new Function('require', 'module', 'exports', compiled)(name => {
      if (name.endsWith('supabaseServerClient')) return { createClient: () => client };
      if (name.endsWith('auth-middleware')) return { requireAuth: async () => ({ id: 'member' }), optionalAuth: async () => ({ id: 'member' }) };
      if (name.endsWith('apiErrorHandler')) return { reportApiError: () => {} };
      if (name.endsWith('apiRateLimit')) return { applyRateLimit: () => true, LIMITS: { read: {}, write: {} } };
      if (name.endsWith('socialFollowPrivacy.mjs')) return followPrivacy;
      throw new Error(`Unexpected follow dependency ${name}`);
    }, module, module.exports);
    const preference = responseRecorder();
    await module.exports.default({ method: 'PUT', body: { page_id: 'page', follower_id: 'other', notify: false }, headers: {} }, preference);
    assert.equal(preference.statusCode, 403);
    assert.equal(writes, 0);
    const follows = responseRecorder();
    await module.exports.default({ method: 'GET', query: { user_id: 'other' }, headers: {} }, follows);
    assert.equal(follows.statusCode, 200);
    assert.deepEqual(follows.body.data, []);
    const approve = responseRecorder();
    await module.exports.default({ method: 'POST', body: { page_id: 'page', follower_id: 'other', action: 'approve' }, headers: {} }, approve);
    assert.equal(approve.statusCode, 403);
    assert.equal(writes, 0);
  } finally {
    if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
  }
});

test('native report API binds actual post/group/author/JWT and enforces canonical approved access', async () => {
  const source = await readFile(new URL('../pages/api/home-games/reports.js', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const ids = { group: '00000000-0000-4000-8000-000000000001', post: '00000000-0000-4000-8000-000000000002', report: '00000000-0000-4000-8000-000000000003' };
  async function run({ memberStatus = 'approved', author = 'author', postAvailable = true, insertError = null, auth = true, reasonText = 'Qualification concern' } = {}) {
    const inserts = [];
    const client = { from(table) {
      const query = { select() { return this; }, eq() { return this; }, async maybeSingle() {
        return { data: table === 'commander_home_posts' ? (postAvailable ? { id: ids.post, group_id: ids.group, author_id: author } : null) : table === 'commander_home_groups' ? { id: ids.group, owner_id: 'host', is_active: true } : { status: memberStatus }, error: null };
      }, async insert(row) { inserts.push(row); return { error: insertError }; } };
      return query;
    } };
    const module = { exports: {} };
    new Function('require', 'module', 'exports', compiled)(name => {
      assert.ok(name.endsWith('rpcBridge'));
      return { LIMITS: { write: {} }, bridgeRequest: async () => auth ? { ok: true, user: { id: 'reporter' }, supabase: client } : { ok: false, status: 401, body: { success: false } } };
    }, module, module.exports);
    const response = responseRecorder();
    await module.exports.default({ method: 'POST', body: { group_id: ids.group, post_id: ids.post, report_id: ids.report, reporter_id: 'forged-user', content_author_id: 'forged-author', status: 'resolved', reason_text: reasonText }, headers: {} }, response);
    return { response, inserts };
  }
  const success = await run();
  assert.equal(success.response.statusCode, 201);
  assert.deepEqual(success.inserts[0], { id: ids.report, reporter_id: 'reporter', reported_type: 'post', reported_id: ids.post, content_author_id: 'author', reason_category: 'other', reason_text: 'Qualification concern', status: 'pending' });
  for (const memberStatus of ['pending', 'declined', 'banned']) {
    const result = await run({ memberStatus });
    assert.equal(result.response.statusCode, 403);
    assert.equal(result.inserts.length, 0);
  }
  for (const [options, expected] of [[{ author: 'reporter' }, 400], [{ postAvailable: false }, 404], [{ auth: false }, 401], [{ reasonText: 'x' }, 400]]) {
    const result = await run(options);
    assert.equal(result.response.statusCode, expected);
    assert.equal(result.inserts.length, 0);
  }
  assert.equal((await run({ insertError: { code: '23505' } })).response.statusCode, 409);
  assert.equal((await run({ insertError: { code: 'provider-failure', message: 'private diagnostic' } })).response.statusCode, 503);
});

test('native report action uses painted accessible dialog and truthful persisted/unknown outcomes', async () => {
  const source = await readFile(new URL('../pages/hub/commander/home-games/[id].js', import.meta.url), 'utf8');
  assert.match(source, /fetch\('\/api\/home-games\/reports'/);
  assert.match(source, /post_id: reportTarget\.id, report_id: operation\.id/);
  assert.match(source, /response\.status === 201 && data\.success === true && data\.report_id === operation\.id/);
  assert.match(source, /operation\.unknown = true/);
  assert.match(source, /<CasinoActionDialog open=\{Boolean\(reportTarget\)\}/);
  assert.match(source, /filter\(post => post\.is_hidden !== true\)/);
  const identityEffect = source.slice(source.indexOf('// Get current user ID'), source.indexOf('// Fetch group data'));
  assert.doesNotMatch(identityEffect, /if \(!router\.isReady\) return/,
    'a once-only identity effect must not permanently bail before router hydration');
});
