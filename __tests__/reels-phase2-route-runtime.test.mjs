import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import * as socialPostShape from '../src/lib/socialPostShape.js';
import * as homeGamePostAccess from '../src/lib/home-games/socialPostAccessServer.mjs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

function response() {
  return {
    headers: {}, statusCode: 200, body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
  };
}

function synthetic(context, exports) {
  return new vm.SyntheticModule(Object.keys(exports), function initialize() {
    for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
  }, { context });
}

async function loadRoute(path, dependencies, routeSource = read(path)) {
  const context = vm.createContext({
    console: { warn() {} },
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture' } },
  });
  const route = new vm.SourceTextModule(routeSource, { context });
  await route.link(specifier => {
    const exports = dependencies[specifier];
    if (!exports) throw new Error(`Unexpected import ${specifier} from ${path}`);
    return synthetic(context, exports);
  });
  await route.evaluate();
  return route.namespace.default;
}

function queryResult(result, calls) {
  const query = {
    select(value) { calls?.push(['select', value]); return query; },
    eq(key, value) { calls?.push(['eq', key, value]); return query; },
    or(value) { calls?.push(['or', value]); return query; },
    order(key, value) { calls?.push(['order', key, value]); return query; },
    limit(value) { calls?.push(['limit', value]); return query; },
    in(key, value) { calls?.push(['in', key, value]); return query; },
    then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
  };
  return query;
}

function commonDependencies(client, auth, gates = {}) {
  return {
    '../../../src/lib/supabaseServerClient': { createClient: () => client },
    '../../../src/lib/serverAuth': { getServerUserWithFallback: auth },
    '../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: { read: {}, write: {} } },
    '../../../src/lib/socialPostShape': { ...socialPostShape },
    '../../../src/lib/home-games/socialPostAccessServer.mjs': { ...homeGamePostAccess },
    './feed': {
      POST_SELECT: 'fixture-select',
      isPublicAudiencePost: gates.isPublicAudiencePost || (post => post.visibility === 'public'),
      managedVideoPostIsEligible: gates.managedVideoPostIsEligible || (() => true),
      nativeVideoIsReady: gates.nativeVideoIsReady || (() => true),
      readManagedEligibilityContext: gates.readManagedEligibilityContext || (async () => ({})),
    },
  };
}

test('Saved Posts rejects stale authentication before reading bookmark data', async () => {
  let reads = 0;
  const client = { from() { reads += 1; throw new Error('database must not be read'); } };
  const handler = await loadRoute('pages/api/social/saved-posts.js', commonDependencies(
    client,
    async () => ({ user: null, error: 'expired' }),
  ));
  const res = response();
  await handler({ method: 'GET', headers: {}, query: {} }, res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.success, false);
  assert.equal(reads, 0);
  assert.equal(res.headers['Cache-Control'], 'private, no-store, max-age=0');
});

test('Saved Posts preserves bookmark order and removes privacy or availability failures', async () => {
  const calls = [];
  const posts = [
    { id: 'a', author_id: 'other', visibility: 'public' },
    { id: 'b', author_id: 'viewer', visibility: 'private' },
    { id: 'c', author_id: 'other', visibility: 'public' },
  ];
  const client = { from(table) {
    if (table === 'social_interactions') return queryResult({ data: [
      { post_id: 'b', created_at: '2026-01-03' },
      { post_id: 'a', created_at: '2026-01-02' },
      { post_id: 'c', created_at: '2026-01-01' },
    ], error: null }, calls);
    if (table === 'social_posts') return queryResult({ data: posts, error: null }, calls);
    throw new Error(`Unexpected table ${table}`);
  } };
  const handler = await loadRoute('pages/api/social/saved-posts.js', commonDependencies(
    client,
    async () => ({ user: { id: 'viewer' }, error: null }),
    { managedVideoPostIsEligible: post => post.id !== 'c' },
  ));
  const res = response();
  await handler({ method: 'GET', headers: {}, query: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.data.map(post => post.id), ['b', 'a']);
  assert.ok(calls.some(call => call[0] === 'limit' && call[1] === 500));
});

test('Profile Videos validates the persisted author and lets only the verified owner see private rows', async () => {
  const authorId = '00000000-0000-0000-0000-000000000123';
  const posts = [
    { id: 'public', author_id: authorId, visibility: 'public' },
    { id: 'private', author_id: authorId, visibility: 'private' },
    { id: 'blocked', author_id: authorId, visibility: 'public' },
  ];
  const client = { from: () => queryResult({ data: posts, error: null }) };
  const dependencies = commonDependencies(
    client,
    async () => ({ user: { id: authorId }, error: null }),
    { managedVideoPostIsEligible: post => post.id !== 'blocked' },
  );
  const handler = await loadRoute('pages/api/social/profile-videos.js', dependencies);
  const invalid = response();
  await handler({ method: 'GET', headers: {}, query: { author_id: 'not-a-uuid' } }, invalid);
  assert.equal(invalid.statusCode, 400);

  const owner = response();
  await handler({ method: 'GET', headers: {}, query: { author_id: authorId } }, owner);
  assert.deepEqual(owner.body.data.map(post => post.id), ['public', 'private']);
});

test('saved/profile mirrors inherit current Home Game privacy and fail closed on unavailable authority', async () => {
  const authorId = '00000000-0000-4000-8000-000000000123';
  const pageId = '00000000-0000-4000-8000-000000000456';
  const posts = [
    { id: 'mirror', author_id: authorId, visibility: 'public', metadata: { source_page_id: pageId, page_type: 'home_game' } },
    { id: 'generic', author_id: authorId, visibility: 'public' },
    { id: 'orphan-home', author_id: authorId, visibility: 'public', metadata: { page_type: 'home_game' } },
  ];
  for (const path of ['pages/api/social/saved-posts.js', 'pages/api/social/profile-videos.js']) {
    for (const decision of ['private', 'unlisted', 'inactive', 'missing', 'unavailable', 'public']) {
      const client = { from(table) {
        if (table === 'social_interactions') return queryResult({ data: posts.map(post => ({ post_id: post.id })), error: null });
        if (table === 'social_posts') return queryResult({ data: posts, error: null });
        if (table === 'social_pages') return queryResult({ data: [{ id: pageId, page_type: 'home_game', is_public: decision !== 'unlisted', linked_entity_type: 'home_group', linked_entity_id: 'group' }], error: null });
        if (table === 'commander_home_groups') return queryResult({ data: decision === 'missing' ? [] : [{ id: 'group', is_active: decision !== 'inactive', is_private: decision === 'private' }], error: decision === 'unavailable' ? { message: 'Unavailable authority' } : null });
        throw new Error(`Unexpected privacy table ${table}`);
      } };
      const routeSource = process.env.HG_MIRROR_BEFORE === '1'
        ? execFileSync('git', ['show', `HEAD:${path}`], { encoding: 'utf8' }) : read(path);
      const handler = await loadRoute(path, commonDependencies(client, async () => ({ user: { id: authorId }, error: null })), routeSource);
      const res = response();
      await handler({ method: 'GET', headers: {}, query: { author_id: authorId } }, res);
      assert.equal(res.statusCode, decision === 'unavailable' ? 503 : 200, `${path} ${decision}`);
      if (decision === 'unavailable') assert.equal(res.body.data, undefined);
      else assert.deepEqual(res.body.data.map(post => post.id), decision === 'public' ? ['mirror', 'generic'] : ['generic'], `${path} ${decision}`);
    }
  }
});

test('public profile Reel handler forwards validated collection inputs and fails closed', async () => {
  let received;
  const context = vm.createContext({ console: { warn() {} } });
  const route = new vm.SourceTextModule(read('pages/api/reels/profile.js'), { context });
  await route.link(specifier => {
    if (specifier.endsWith('/apiRateLimit')) return synthetic(context, { applyRateLimit: () => true, LIMITS: { read: {} } });
    if (specifier.endsWith('/apiErrorHandler')) return synthetic(context, { reportApiError() {} });
    if (specifier.endsWith('/server/reelsFeed')) return synthetic(context, {
      ReelsFeedInputError: class ReelsFeedInputError extends Error {},
      readPublicProfileReels: async input => {
        received = input;
        return { data: [{ id: 'winner' }], hasMore: false, nextCursor: null, partial: false };
      },
    });
    throw new Error(`Unexpected import ${specifier}`);
  });
  await route.evaluate();
  const res = response();
  await route.namespace.default({ method: 'GET', query: { author_id: ['author', 'ignored'], limit: '30' } }, res);
  assert.deepEqual({ ...received }, { authorId: 'author', limit: '30', cursor: undefined });
  assert.deepEqual(res.body.data, [{ id: 'winner' }]);
  assert.equal(res.headers['Cache-Control'], 'no-store');
});

test('Reel removal rejects unauthenticated callers before reading the target', async () => {
  let reads = 0;
  const client = {
    from() { reads += 1; throw new Error('target must not be read'); },
  };
  const handler = await loadRoute('pages/api/reels/remove.js', commonDependencies(
    client,
    async () => ({ user: null, error: 'expired' }),
  ));
  const res = response();
  await handler({ method: 'POST', headers: {}, body: { reel_id: '00000000-0000-0000-0000-000000000123' } }, res);
  assert.equal(res.statusCode, 401);
  assert.equal(reads, 0);
});

test('Reel removal refuses foreign ownership and invokes the atomic owner RPC for a verified owner', async () => {
  const reelId = '00000000-0000-0000-0000-000000000123';
  const ownerId = '00000000-0000-0000-0000-000000000456';
  const rpcCalls = [];
  let targetOwner = 'someone-else';
  const client = {
    from(table) {
      assert.equal(table, 'social_reels');
      return queryResult({ data: [{ id: reelId, author_id: targetOwner }], error: null });
    },
    async rpc(name, input) {
      rpcCalls.push([name, input]);
      return { data: { removed: 2 }, error: null };
    },
  };
  const handler = await loadRoute('pages/api/reels/remove.js', commonDependencies(
    client,
    async () => ({ user: { id: ownerId }, error: null }),
  ));

  const forbidden = response();
  await handler({ method: 'POST', headers: {}, body: { reel_id: reelId } }, forbidden);
  assert.equal(forbidden.statusCode, 403);
  assert.equal(rpcCalls.length, 0);

  targetOwner = ownerId;
  const removed = response();
  await handler({ method: 'POST', headers: {}, body: { reel_id: reelId } }, removed);
  assert.equal(removed.statusCode, 200);
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0][0], 'remove_owned_social_reel');
  assert.deepEqual({ ...rpcCalls[0][1] }, { p_reel_id: reelId, p_owner_id: ownerId });
  assert.equal(removed.body.removed, 2);
});
