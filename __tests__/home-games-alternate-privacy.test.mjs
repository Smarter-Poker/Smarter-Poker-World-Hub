import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { homeGamePostAccess } from '../src/lib/home-games/socialPostAccessServer.mjs';
import { publicHomeGameSettings, publicHomeGroupsByLinkedPages } from '../src/lib/home-games/publicVenueProjection.mjs';
import { homeGameSocialWriteAccess } from '../src/lib/home-games/socialPrivacyServer.mjs';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = process.env.HG_PRIVACY_BEFORE === '1'
  ? execFileSync('git', ['show', 'HEAD:pages/api/social/pages/engage.js'], { encoding: 'utf8' })
  : fs.readFileSync(new URL('../pages/api/social/pages/engage.js', import.meta.url), 'utf8');

function fixture({ privateGroup = true, active = true, member = null, generic = false, error = null, listed = true } = {}) {
  const reads = [];
  const rows = {
    social_page_posts: [{ id: 'private-post', page_id: 'home-page' }, { id: 'public-post', page_id: 'public-page' }],
    social_pages: [{ id: 'home-page', page_type: generic ? 'club' : 'home_game', linked_entity_type: generic ? 'club' : 'home_group', linked_entity_id: 'group', is_public: listed }, { id: 'public-page', page_type: 'club' }],
    commander_home_groups: [{ id: 'group', owner_id: 'host', is_active: active, is_private: privateGroup }],
    commander_home_members: member ? [{ group_id: 'group', user_id: 'viewer', status: member, role: 'member' }] : [],
    social_page_post_comments: [{ id: 'secret-comment', post_id: 'private-post', user_id: 'viewer', content: 'Protected comment' }],
  };
  return {
    reads,
    from(table) {
      reads.push(table);
      const filters = [];
      const q = {
        select() { return q; }, eq(key, value) { filters.push(row => row[key] === value); return q; },
        neq(key, value) { filters.push(row => row[key] !== value); return q; },
        insert() { return q; }, update() { return q; }, delete() { return q; },
        order() { return q; }, limit() { return q; }, in() { return q; },
        maybeSingle() { return Promise.resolve(result(true)); },
        then(resolve, reject) { return Promise.resolve(result(false)).then(resolve, reject); },
      };
      const result = single => {
        const matched = (rows[table] || []).filter(row => filters.every(predicate => predicate(row)));
        return { data: single ? matched[0] || null : matched, error: table === 'commander_home_groups' ? error : null };
      };
      return q;
    },
  };
}

function load(sb, userId = null, routeSource = source) {
  const module = { exports: {} };
  const mocks = {
    '../../../../src/lib/supabaseServerClient': { createClient: () => sb },
    '../../../../src/lib/serverAuth': { getServerUserWithFallback: async () => ({ user: userId ? { id: userId } : null }) },
    '../../../../src/lib/auth-middleware': { requireAuth: async () => userId ? { id: userId } : null },
    '../../../../src/lib/apiErrorHandler': { reportApiError() {} },
    '../../../../src/lib/apiRateLimit': { LIMITS: {}, applyRateLimit: () => true },
    '../../../../src/lib/home-games/socialPostAccessServer.mjs': { homeGamePostAccess },
  };
  const code = ts.transpileModule(routeSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const previous = [process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY];
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://privacy-fixture.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-key-not-a-secret';
  new Function('require', 'module', 'exports', 'fetch', code)(name => mocks[name] || (() => { throw Error(`Unexpected import ${name}`); })(), module, module.exports, async () => ({ ok: true }));
  for (const [index, key] of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].entries()) {
    if (previous[index] === undefined) delete process.env[key];
    else process.env[key] = previous[index];
  }
  return module.exports.default;
}

async function run(handler, method = 'GET', body = {}) {
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.statusCode = n; return this; }, json(value) { this.body = value; return this; } };
  await handler({ method, headers: {}, query: { post_id: 'private-post' }, body }, res);
  return res;
}

test('anonymous comments cannot bypass a private, inactive or unlisted Home Game parent', async () => {
  for (const options of [{}, { privateGroup: false, active: false }, { privateGroup: false, listed: false }]) {
    const sb = fixture(options);
    const result = await run(load(sb));
    assert.equal(result.statusCode, 403);
    assert.equal(sb.reads.includes('social_page_post_comments'), false);
  }
});

test('approved members retain private comment reads, pending and banned members do not', async () => {
  for (const member of ['approved', 'pending', 'banned']) {
    const result = await run(load(fixture({ member }), 'viewer'));
    assert.equal(result.statusCode, member === 'approved' ? 200 : 403);
  }
});

test('public Home Game comments and unrelated generic page behavior remain readable', async () => {
  assert.equal((await run(load(fixture({ privateGroup: false })))).statusCode, 200);
  assert.equal((await run(load(fixture({ generic: true })))).statusCode, 200);
});

test('comment-like uses the actual comment parent, not an unrelated claimed public post', async () => {
  const result = await run(load(fixture(), 'viewer'), 'POST', { action: 'like_comment', post_id: 'public-post', comment_id: 'secret-comment' });
  assert.equal(result.statusCode, 403);
});

test('public group strangers cannot bypass canonical membership for engagement writes', async () => {
  for (const action of ['like', 'comment', 'bookmark']) {
    const result = await run(load(fixture({ privateGroup: false }), 'viewer'), 'POST', { action, post_id: 'private-post', content: 'test' });
    assert.equal(result.statusCode, 403);
  }
});

test('unavailable group decision fails closed, rather than returning private comments', async () => {
  const result = await run(load(fixture({ error: { message: 'Unavailable' } })));
  assert.equal(result.statusCode, 500);
  assert.equal(result.body.data, undefined);
});

test('public venue settings project only published schedule fields, never arbitrary host JSON', () => {
  const projected = publicHomeGameSettings({
    invitation_token: 'Never Publish', full_address: 'Private Residence', schedule_summary: 'Saturday',
    tables: [{ game_type: 'NLH', stakes: '1/2', access_code: 'Private' }],
    tournaments: [{ name: 'Weekly', buy_in: 20, scheduled_date: '2026-11-14', private_notes: 'Private' }],
  });
  assert.deepEqual(projected, {
    schedule_summary: 'Saturday', tables: [{ game_type: 'NLH', stakes: '1/2' }],
    tournaments: [{ name: 'Weekly', buy_in: 20, scheduled_date: '2026-11-14' }],
  });
  assert.deepEqual(publicHomeGameSettings({ schedule_summary: { full_address: 'Secret' } }), {});
  assert.deepEqual(publicHomeGroupsByLinkedPages([{ id: 'a' }, { id: 'b' }, { id: 'c' }], [
    { linked_entity_id: 'a', is_public: true }, { linked_entity_id: 'a', is_public: false },
    { linked_entity_id: 'b', is_public: true },
  ]), [{ id: 'b' }, { id: 'c' }]);
});

test('actual venue UUID branch withholds private/unlisted groups and projects eligible settings', async () => {
  const venueSource = process.env.HG_PRIVACY_BEFORE === '1'
    ? execFileSync('git', ['show', 'HEAD:pages/api/poker/venues.js'], { encoding: 'utf8' })
    : fs.readFileSync(new URL('../pages/api/poker/venues.js', import.meta.url), 'utf8');
  const start = venueSource.indexOf('                  const { data: homeGroup');
  const end = venueSource.indexOf('              } else if (!isNaN(numericId)', start);
  assert.ok(start > 0 && end > start);
  // Execute the actual UUID branch in isolation, preserving its DB predicates,
  // response decisions and complete public projection. No rewritten adapter.
  const execute = new Function('sb', 'req', 'res', 'id', 'jitterCoord', 'publicHomeGameSettings', 'venues',
    `return (async () => { ${venueSource.slice(start, end)}; return venues; })();`);
  for (const [isPrivate, listed, expected] of [[true, true, 404], [false, false, 404], [false, true, 200]]) {
    const group = { id: 'group', is_active: true, is_private: isPrivate, settings: { full_address: 'Secret', tables: [{ game_type: 'NLH', stakes: '1/2' }] } };
    const sb = { from(table) {
      const filters = [];
      const rows = table === 'commander_home_groups' ? [group] : [{ id: 'page', linked_entity_type: 'home_group', linked_entity_id: 'group', is_public: listed }];
      const q = { select() { return q; }, eq(key, value) { filters.push(row => row[key] === value); return q; }, async maybeSingle() { return { data: rows.find(row => filters.every(filter => filter(row))) || null, error: null }; } };
      return q;
    } };
    const res = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; } };
    const value = await execute(sb, {}, res, 'group', () => ({ lat: 10, lng: 20 }), publicHomeGameSettings, []);
    assert.equal(res.statusCode || 200, expected);
    if (expected === 200) {
      assert.equal(value.length, 1);
      assert.equal(value[0].settings.full_address, undefined);
      assert.equal(value[0].latitude, 10);
    }
  }
  assert.match(venueSource, /if \(!id && \(!effectiveType \|\| \['home_game', 'home_games'\]\.includes\(effectiveType\)\)\)[\s\S]*?Cache-Control/, 'revocable mixed lists do not enter the public CDN cache');
  assert.match(venueSource.slice(venueSource.indexOf('// Phase 41: Native UUID lookup'), end), /Cache-Control.*no-store/, 'eligible UUID detail cannot be cached after privacy revocation');
});

const GROUP_ID = '00000000-0000-4000-8000-000000000001';
const REPORT_ID = '00000000-0000-4000-8000-000000000002';
const NATIVE_POST_ID = '00000000-0000-4000-8000-000000000003';

function moderationFixture({ memberStatus = 'approved', role = 'co_host', foreign = false, severity = 'other', unknownAck = false, hidden = false } = {}) {
  let writes = 0;
  const report = { id: REPORT_ID, reported_type: 'post', reported_id: NATIVE_POST_ID, status: 'pending', content_author_id: 'writer', reason_category: severity };
  const post = { id: NATIVE_POST_ID, group_id: foreign ? 'foreign-group' : GROUP_ID, is_hidden: hidden };
  const tables = {
    commander_home_groups: [{ id: GROUP_ID, owner_id: 'host', is_active: true, is_private: true }],
    commander_home_members: [{ group_id: GROUP_ID, user_id: 'member', role, status: memberStatus }],
    commander_home_content_reports: [report], commander_home_posts: [post],
  };
  const client = {
    get writes() { return writes; }, report, post,
    async rpc(name, args) {
      assert.equal(name, 'list_home_group_reports_for_host');
      assert.equal(args.p_group_id, GROUP_ID);
      return { data: { success: true, reports: [report], total: 1 }, error: null };
    },
    from(table) {
      const predicates = [];
      let updates = null;
      const q = {
        select() { return q; }, eq(k, v) { predicates.push(row => row[k] === v); return q; },
        is(k, v) { predicates.push(row => row[k] === v); return q; },
        in(k, values) { predicates.push(row => values.includes(row[k])); return q; },
        update(value) { updates = value; return q; },
        async maybeSingle() { return result(true); },
        then(resolve, reject) { return Promise.resolve(result(false)).then(resolve, reject); },
      };
      function result(single) {
        const rows = (tables[table] || []).filter(row => predicates.every(predicate => predicate(row)));
        if (updates && rows.length) {
          writes += 1;
          for (const row of rows) Object.assign(row, updates);
          if (unknownAck) return { data: null, error: { message: 'Acknowledgment lost' } };
        }
        return { data: single ? rows[0] || null : rows, error: null };
      }
      return q;
    },
  };
  return client;
}

function loadModeration(client, userId) {
  const route = fs.readFileSync(new URL('../pages/api/commander/home-games/groups/[id]/posts.js', import.meta.url), 'utf8');
  const mocks = {
    '../../../../../../src/lib/supabaseServerClient': { createClient: () => client },
    '../../../../../../src/lib/serverAuth': { getServerUserWithFallback: async () => ({ user: userId ? { id: userId } : null, error: null }) },
    '../../../../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: {} },
    '../../../../../../src/lib/home-games/socialPrivacyServer.mjs': { homeGameSocialWriteAccess },
  };
  const code = ts.transpileModule(route, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', 'process', code)(name => mocks[name], mod, mod.exports,
    { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-key', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture-public-key' } });
  return mod.exports.default;
}

async function runModeration(client, userId = 'host', method = 'PATCH') {
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; } };
  await loadModeration(client, userId)({ method, headers: { authorization: 'Bearer synthetic-fixture-token' }, query: { id: GROUP_ID }, body: { report_id: REPORT_ID, action: 'hide' } }, res);
  return res;
}

test('native host moderation hides the reported post once without resolving the report', async () => {
  const sb = moderationFixture();
  const hidden = await runModeration(sb);
  assert.equal(hidden.statusCode, 200);
  assert.equal(hidden.body.post_id, NATIVE_POST_ID);
  assert.equal(hidden.body.report_id, REPORT_ID);
  assert.equal(hidden.body.awaiting_review, true);
  assert.equal(sb.report.status, 'pending');
  assert.equal(sb.post.is_hidden, true);
  assert.equal((await runModeration(sb)).statusCode, 200);
  assert.equal(sb.writes, 1, 'duplicate hide does not repeat mutation');
  const queue = await runModeration(sb, 'host', 'GET');
  assert.equal(queue.body.reports.length, 1);
  assert.equal(queue.body.reports[0].is_hidden, true, 'hidden content remains pending review, not falsely resolved');
});

test('native moderation hides a visible legacy NULL preimage exactly once', async () => {
  const sb = moderationFixture({ hidden: null });
  const hidden = await runModeration(sb);
  assert.equal(hidden.statusCode, 200);
  assert.equal(sb.post.is_hidden, true);
  assert.equal(sb.report.status, 'pending');
  assert.equal((await runModeration(sb)).statusCode, 200);
  assert.equal(sb.writes, 1);
});

test('native moderation requires canonical approved staff and excludes foreign/high-severity targets', async () => {
  assert.equal((await runModeration(moderationFixture(), null)).statusCode, 401);
  for (const memberStatus of ['pending', 'banned']) {
    const sb = moderationFixture({ memberStatus });
    assert.equal((await runModeration(sb, 'member')).statusCode, 403);
    assert.equal(sb.writes, 0);
  }
  assert.equal((await runModeration(moderationFixture(), 'member')).statusCode, 200, 'approved co-host can hide');
  for (const [options, expected] of [[{ foreign: true }, 404], [{ severity: 'illegal' }, 403], [{ role: 'member' }, 403]]) {
    const sb = moderationFixture(options);
    assert.equal((await runModeration(sb, options.role ? 'member' : 'host')).statusCode, expected);
    assert.equal(sb.writes, 0);
  }
});

test('an unconfirmed native hide fails honestly then recovers by persisted readback without duplicate mutation', async () => {
  const sb = moderationFixture({ unknownAck: true });
  assert.equal((await runModeration(sb)).statusCode, 503);
  assert.equal(sb.post.is_hidden, true);
  assert.equal((await runModeration(sb)).statusCode, 200);
  assert.equal(sb.writes, 1);
});

function loadNativeReader({ privateGroup = false, listed = true, active = true, member = null, userId = null, unavailable = false, forward = null } = {}) {
  const reads = [];
  const tables = {
    social_pages: [{ page_type: 'home_game', linked_entity_id: GROUP_ID, is_public: listed }],
    commander_home_groups: [{ id: GROUP_ID, owner_id: 'host', is_active: active, is_private: privateGroup }],
    commander_home_members: member ? [{ group_id: GROUP_ID, user_id: userId, role: 'member', status: member }] : [],
    commander_home_posts: [
      { id: 'public', group_id: GROUP_ID, is_published: true, is_hidden: false, visible_to: 'public' },
      { id: 'members', group_id: GROUP_ID, is_published: true, is_hidden: false, visible_to: 'members' },
      { id: 'hidden', group_id: GROUP_ID, is_published: true, is_hidden: true, visible_to: 'public' },
      { id: 'draft', group_id: GROUP_ID, is_published: false, is_hidden: false, visible_to: 'public' },
      { id: 'foreign', group_id: 'foreign', is_published: true, is_hidden: false, visible_to: 'public' },
    ],
  };
  let clientNumber = 0;
  const createClient = () => {
    const caller = clientNumber++ > 0;
    return { from(table) {
      reads.push({ table, caller });
      const predicates = [];
      const q = {
        select() { return q; }, eq(k, v) { predicates.push(row => row[k] === v); return q; },
        or(value) { assert.equal(value, 'is_hidden.is.null,is_hidden.eq.false'); predicates.push(row => row.is_hidden !== true); return q; },
        order() { return q; }, range() { return q; }, limit() { return q; },
        async maybeSingle() { return result(true); },
        then(resolve, reject) { return Promise.resolve(result(false)).then(resolve, reject); },
      };
      function result(single) {
        const rows = (tables[table] || []).filter(row => predicates.every(fn => fn(row)));
        return { data: single ? rows[0] || null : rows, count: rows.length, error: unavailable && table === 'commander_home_groups' ? { message: 'Unavailable' } : null };
      }
      return q;
    } };
  };
  const mocks = {
    '../../../../../src/lib/supabaseServerClient': { createClient },
    '../../../../../src/lib/serverAuth': { getServerUserWithFallback: async () => ({ user: userId ? { id: userId } : null, error: null }) },
    '../../../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: {} },
    '../../../../../src/lib/home-games/socialPrivacyServer.mjs': { homeGameSocialWriteAccess },
  };
  const route = fs.readFileSync(new URL('../pages/api/commander/home-games/[id]/posts.js', import.meta.url), 'utf8');
  const code = ts.transpileModule(route, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', 'process', 'fetch', code)(name => mocks[name], mod, mod.exports,
    { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-key', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture-public-key' } }, forward || (async () => { throw new Error('Unexpected network'); }));
  return { handler: mod.exports.default, reads };
}

async function runNative(options = {}, method = 'GET', body = {}) {
  const loaded = loadNativeReader(options);
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.statusCode = n; return this; }, json(value) { this.body = value; return this; }, send(value) { this.body = value; return this; } };
  await loaded.handler({ method, headers: options.userId ? { authorization: 'Bearer fixture', 'x-idempotency-key': 'stable-fixture-key' } : {}, query: { id: GROUP_ID }, body }, res);
  return { ...res, reads: loaded.reads };
}

test('native post reader preserves approved-only access and caller-scoped hidden/published filters', async () => {
  assert.equal((await runNative()).statusCode, 401, 'anonymous access is not newly exposed');
  const memberRead = await runNative({ member: 'approved', userId: 'viewer' });
  assert.equal(memberRead.statusCode, 200);
  assert.deepEqual(memberRead.body.data.posts.map(row => row.id), ['public', 'members']);
  assert.equal(memberRead.reads.find(row => row.table === 'commander_home_posts').caller, true, 'post rows are still caller RLS scoped');
  assert.match(memberRead.headers['Cache-Control'], /no-store/);
  for (const options of [{ privateGroup: true, userId: 'viewer' }, { userId: 'viewer' }, { active: false, member: 'approved', userId: 'viewer' }]) {
    const denied = await runNative(options);
    assert.equal(denied.statusCode, 403);
    assert.equal(denied.reads.some(row => row.table === 'commander_home_posts'), false);
  }
  for (const member of ['approved', 'pending', 'banned']) {
    const read = await runNative({ privateGroup: true, member, userId: 'viewer' });
    assert.equal(read.statusCode, member === 'approved' ? 200 : 403);
    if (member === 'approved') assert.deepEqual(read.body.data.posts.map(row => row.id), ['public', 'members']);
  }
  assert.equal((await runNative({ privateGroup: true, listed: false, userId: 'host' })).statusCode, 200);
  assert.equal((await runNative({ unavailable: true, userId: 'viewer' })).statusCode, 503);
});

test('native post creation forwards the original canonical contract without manufacturing success or retrying writes', async () => {
  let calls = 0;
  const body = { content: 'Preserved content', visible_to: 'members' };
  const forward = async (url, options) => {
    calls += 1;
    assert.equal(url, `https://commander.smarter.poker/api/home-games/${GROUP_ID}/posts`);
    assert.equal(options.headers.Authorization, 'Bearer fixture');
    assert.equal(options.headers['X-Idempotency-Key'], 'stable-fixture-key');
    assert.deepEqual(JSON.parse(options.body), body);
    return { status: 409, text: async () => '{"success":false,"error":"canonical refusal"}', headers: new Map([['content-type', 'application/json']]) };
  };
  const response = await runNative({ userId: 'viewer', forward }, 'POST', body);
  assert.equal(response.statusCode, 409);
  assert.equal(calls, 1);
  assert.equal(response.reads.length, 0, 'canonical creation does not introduce a new local write');
  calls = 0;
  const failed = await runNative({ userId: 'viewer', forward: async () => { calls += 1; throw new Error('Acknowledgment lost'); } }, 'POST', body);
  assert.equal(failed.statusCode, 502);
  assert.equal(calls, 1);
  assert.match(failed.body.error, /unconfirmed/);
});

test('actual moderation continuation retains rows on failure, advances empty slices, deduplicates and guards concurrent loads', async () => {
  const dashboard = fs.readFileSync(new URL('../pages/hub/home-games/[slug]/dashboard.js', import.meta.url), 'utf8');
  const start = dashboard.indexOf('  const load = useCallback(async (append = false)', dashboard.indexOf('function ModerationTab'));
  const end = dashboard.indexOf('  }, [token, group?.id]);', start) + '  }, [token, group?.id]);'.length;
  assert.ok(start > 0 && end > start, 'execute the maintained callback, not a replacement implementation');
  const state = { reports: [], hasMore: false, err: '', loading: false, loadingMore: false };
  const nextOffset = { current: 0 }, loadInFlight = { current: false }, loadGeneration = { current: 1 };
  const requests = [];
  let release;
  const answers = [
    { reports: [{ id: 'a', content: 'first' }], next_offset: 50, has_more: true },
    { reports: [], next_offset: 100, has_more: true },
    new Error('Unavailable'),
    { reports: [{ id: 'a', content: 'updated' }, { id: 'b' }], next_offset: 150, has_more: false },
  ];
  const apiFetch = async url => {
    requests.push(url);
    if (requests.length === 1) await new Promise(resolve => { release = resolve; });
    const answer = answers.shift();
    if (answer instanceof Error) throw answer;
    return answer;
  };
  const setters = ['reports', 'hasMore', 'loadingMore', 'loading', 'err'].map(key => value => { state[key] = typeof value === 'function' ? value(state[key]) : value; });
  const load = new Function('useCallback', 'token', 'group', 'apiFetch', 'nextOffset', 'loadInFlight', 'loadGeneration', 'setReports', 'setHasMore', 'setLoadingMore', 'setLoading', 'setErr', `${dashboard.slice(start, end)}; return load;`)(fn => fn, 'fixture-token', { id: GROUP_ID }, apiFetch, nextOffset, loadInFlight, loadGeneration, ...setters);
  const first = load();
  await load(true);
  assert.equal(requests.length, 1, 'the ref blocks a second request before React can rerender');
  release(); await first;
  await load(true);
  assert.equal(nextOffset.current, 100, 'empty filtered slice still advances the authoritative raw offset');
  assert.equal(state.hasMore, true);
  await load(true);
  assert.equal(state.err, 'Unavailable');
  assert.deepEqual(state.reports, [{ id: 'a', content: 'first' }]);
  assert.equal(nextOffset.current, 100, 'failure preserves retry position');
  await load(true);
  assert.deepEqual(state.reports, [{ id: 'a', content: 'updated' }, { id: 'b' }]);
  assert.equal(state.hasMore, false);
  assert.deepEqual(requests.map(url => Number(new URL(url, 'https://fixture.invalid').searchParams.get('offset'))), [0, 50, 100, 100]);
  assert.equal(loadInFlight.current, false);
  assert.equal(state.loadingMore, false);
  assert.match(dashboard, /hasMore \? 'No Pending Items In This Slice\. More Reports Are Available\.'/);
  assert.match(dashboard, /onClick=\{\(\) => load\(hasMore\)\}[^\n]*minHeight: 44/);
});
