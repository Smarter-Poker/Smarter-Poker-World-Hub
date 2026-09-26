import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

const YOUTUBE_MANAGER = read('../src/hooks/useYouTubeErrorManager.js');
const REELS_SERVER = read('../src/lib/server/reelsFeed.js');
const NEWS_REELS = read('../pages/api/news/reels.js');
const NEWS_VIDEOS = read('../pages/api/news/videos.js');
const REELS_COMPONENT = read('../src/components/social/Reels.jsx');
const REELS_CAROUSEL = read('../src/components/social/ReelsFeedCarousel.jsx');
const INTERACTION_HELPER = read('../src/lib/reelInteractionHydration.js');
const interactionModule = await import(
  `data:text/javascript;base64,${Buffer.from(INTERACTION_HELPER).toString('base64')}`
);

function createReporterHarness({ responses = [], tokens = [] } = {}) {
  const start = YOUTUBE_MANAGER.indexOf('const FAILURE_REPORT_CODES');
  const end = YOUTUBE_MANAGER.indexOf('// ── Main Hook', start);
  assert.ok(start >= 0 && end > start, 'reporter implementation must remain discoverable');

  const calls = [];
  let tokenIndex = 0;
  let responseIndex = 0;
  const context = {
    AbortController: undefined,
    Date,
    Map,
    Number,
    Object,
    Promise,
    Set,
    String,
    clearTimeout() {},
    getAccessToken() {
      const index = Math.min(tokenIndex, Math.max(0, tokens.length - 1));
      tokenIndex += 1;
      return tokens[index] || null;
    },
    setTimeout(callback) {
      queueMicrotask(callback);
      return 1;
    },
    async fetch(url, options) {
      calls.push({ url, options });
      const response = responses[responseIndex++];
      if (response instanceof Error) throw response;
      return response || { ok: false, status: 503 };
    },
  };
  context.globalThis = context;
  vm.runInNewContext(`${YOUTUBE_MANAGER.slice(start, end)}\n    globalThis.__reportFailure = reportFailureToServer;
    globalThis.__reportState = { failureReportInFlight, successfulFailureReports, failureReportCooldowns };
  `, context);
  return {
    calls,
    report: context.__reportFailure,
    state: context.__reportState,
    tokenReads: () => tokenIndex,
  };
}

test('embed-failure reporter rejects malformed IDs before allocating state or making requests', async () => {
  const harness = createReporterHarness({
    tokens: ['token'],
    responses: [{ ok: true, status: 202 }],
  });

  assert.equal(await harness.report('not-eleven!!', 150, 'test'), false);
  assert.equal(harness.calls.length, 0);
  assert.equal(harness.tokenReads(), 0);
  assert.equal(harness.state.failureReportInFlight.size, 0);
  assert.equal(harness.state.successfulFailureReports.size, 0);
  assert.equal(harness.state.failureReportCooldowns.size, 0);
  assert.match(YOUTUBE_MANAGER, /\^\[A-Za-z0-9_-\]\{11\}\$/);
  assert.match(YOUTUBE_MANAGER, /MAX_TRACKED_FAILURE_REPORTS/);
  assert.match(YOUTUBE_MANAGER, /failureReportInFlight\.size >= MAX_TRACKED_FAILURE_REPORTS/);
});

test('embed-failure reporter retries with fresh auth, requires 202, and remembers success', async () => {
  const harness = createReporterHarness({
    tokens: ['token-a', 'token-b', 'token-c'],
    responses: [
      { ok: false, status: 503 },
      new Error('offline'),
      { ok: true, status: 202 },
    ],
  });

  assert.equal(await harness.report('M7lc1UVf-VE', 150, 'Reels'), true);
  assert.equal(harness.calls.length, 3);
  assert.deepEqual(
    harness.calls.map(call => call.options.headers.Authorization),
    ['Bearer token-a', 'Bearer token-b', 'Bearer token-c'],
  );
  assert.equal(await harness.report('M7lc1UVf-VE', 150, 'Carousel'), true);
  assert.equal(harness.calls.length, 3, 'a successful report must dedupe across surfaces');

  const wrongSuccess = createReporterHarness({
    tokens: ['token-a', 'token-b', 'token-c'],
    responses: Array.from({ length: 3 }, () => ({ ok: true, status: 200 })),
  });
  assert.equal(await wrongSuccess.report('dQw4w9WgXcQ', 101, 'Reels'), false);
  assert.equal(wrongSuccess.calls.length, 3);
  assert.equal(wrongSuccess.state.failureReportCooldowns.size, 1);
  assert.equal(await wrongSuccess.report('dQw4w9WgXcQ', 101, 'Reels'), false);
  assert.equal(wrongSuccess.calls.length, 3, 'cooldown must suppress an immediate retry storm');
});

test('concurrent embed-failure calls share one in-flight request', async () => {
  // Both calls are made before the reporter's first await resumes.
  const harness = createReporterHarness({
    tokens: ['token'],
    responses: [{ ok: true, status: 202 }],
  });
  const first = harness.report('M7lc1UVf-VE', 100, 'Reels');
  const second = harness.report('M7lc1UVf-VE', 100, 'Carousel');
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.equal(harness.calls.length, 1);
});

test('news Reel read routes are rate-limited and no-store on every response path', () => {
  for (const [name, source] of [['reels', NEWS_REELS], ['videos', NEWS_VIDEOS]]) {
    assert.match(source, /import \{ applyRateLimit, LIMITS \} from ['"]\.\.\/\.\.\/\.\.\/src\/lib\/apiRateLimit['"]/);
    assert.match(source, /res\.setHeader\(['"]Cache-Control['"], ['"]no-store['"]\)[\s\S]*if \(req\.method !== ['"]GET['"]\)/,
      `${name} must set no-store before early responses`);
    assert.match(source, /if \(!applyRateLimit\(req, res, LIMITS\.read\)\) return/);
    assert.match(source, /res\.setHeader\(['"]Allow['"], ['"]GET['"]\)/);
  }
});

test('a pinned limit-one page emits and accepts an explicit start cursor', () => {
  const parseSource = REELS_SERVER.match(/function parseCursor\([\s\S]*?\n\}/)?.[0];
  const encodeSource = REELS_SERVER.match(/function encodeCursor\([\s\S]*?\n\}/)?.[0];
  assert.ok(parseSource && encodeSource);

  const context = {
    Buffer,
    Date,
    JSON,
    Math,
    Number,
    String,
    MAX_CURSOR_LENGTH: 1024,
    UUID_RE: /^[0-9a-f-]{36}$/i,
    CURSOR_TIMESTAMP_RE: /^\d{4}-\d{2}-\d{2}T[^\s]{1,40}$/,
    ReelsFeedInputError: class ReelsFeedInputError extends Error {},
  };
  context.globalThis = context;
  vm.runInNewContext(`${parseSource}\n${encodeSource}\n    globalThis.__parseCursor = parseCursor;
    globalThis.__encodeCursor = encodeCursor;
  `, context);

  const encoded = context.__encodeCursor({ sort: 'recent', start: true });
  assert.deepEqual({ ...context.__parseCursor(encoded, 'recent') }, { start: true });
  assert.throws(() => context.__parseCursor(encoded, 'popular'));
  assert.match(REELS_SERVER, /if \(!cursor \|\| cursor\.start === true\) return query/);
  assert.match(REELS_SERVER, /readDetail\(client, cursor \? '' : id, scope, sort, viewerId\)/);
  assert.match(REELS_SERVER, /encodeCursor\(\{ sort, start: true \}\)/);
});

test('interaction hydration chunks and scopes every query to loaded Reel IDs', async () => {
  const queried = [];
  class Query {
    constructor(table) {
      this.table = table;
      this.filters = [];
    }
    select() { return this; }
    eq(column, value) { this.filters.push(['eq', column, value]); return this; }
    in(column, values) { this.filters.push(['in', column, [...values]]); return this; }
    then(resolve, reject) {
      queried.push({ table: this.table, filters: this.filters });
      const postIds = this.filters.find(([, column]) => column === 'post_id')?.[2] || [];
      const followingIds = this.filters.find(([, column]) => column === 'following_id')?.[2] || [];
      const data = this.table === 'social_follows'
        ? followingIds.slice(0, 1).map(following_id => ({ following_id }))
        : this.table === 'social_likes'
        ? postIds.map((id, index) => ({ post_id: id, reaction_type: index % 2 ? 'dislike' : 'like' }))
        : [];
      return Promise.resolve({ data, error: null }).then(resolve, reject);
    }
  }
  const client = { from: table => new Query(table) };
  const reelIds = ['reel-a', 'reel-b', 'reel-c', 'reel-d', 'reel-e', 'reel-a'];

  const state = await interactionModule.loadReelInteractionState(
    client,
    'viewer-id',
    reelIds,
    {
      chunkSize: 2,
      loadSavedReels: async () => ['reel-a', 'reel-c', 'reel-e'].map(reel_id => ({ reel_id })),
    },
  );

  assert.equal(queried.length, 3);
  for (const query of queried) {
    const idFilter = query.filters.find(([, column]) => column === 'post_id');
    assert.ok(idFilter, `${query.table} must include its Reel target filter`);
    assert.ok(idFilter[2].length <= 2);
    assert.ok(idFilter[2].every(id => reelIds.includes(id)));
    assert.ok(query.filters.some(([kind, column, value]) => (
      kind === 'eq' && column === 'user_id' && value === 'viewer-id'
    )));
  }
  assert.deepEqual([...new Set(queried.map(query => query.table))], ['social_likes']);
  assert.deepEqual(Object.keys(state.liked).sort(), ['reel-a', 'reel-c', 'reel-e']);
  assert.deepEqual(Object.keys(state.disliked).sort(), ['reel-b', 'reel-d']);
  assert.deepEqual(Object.keys(state.saved).sort(), ['reel-a', 'reel-c', 'reel-e']);

  const aliasQueriesStart = queried.length;
  const aliased = await interactionModule.loadReelInteractionState(
    client,
    'viewer-id',
    [
      { id: 'canonical-a', source_post_id: 'legacy-post-a' },
      { id: 'canonical-b', source_post_id: null },
    ],
    {
      chunkSize: 2,
      loadSavedReels: async () => [{
        reel_id: 'canonical-a',
        saved_target_ids: ['eligible-duplicate-loser-id'],
      }],
    },
  );
  const aliasQueries = queried.slice(aliasQueriesStart);
  assert.ok(aliasQueries.every(query => query.table === 'social_likes'));
  assert.equal(aliased.saved['canonical-a'], true,
    'the canonical saved API must hydrate a historical loser bookmark on its winner');
  assert.deepEqual(
    aliased.savedTargets['canonical-a'],
    ['eligible-duplicate-loser-id'],
  );

  const followed = await interactionModule.loadReelFollowState(
    client,
    'viewer-id',
    ['author-a', 'author-b', 'author-c'],
    { chunkSize: 2 },
  );
  assert.deepEqual(Object.keys(followed).sort(), ['author-a', 'author-c']);
  const followQueries = queried.filter(query => query.table === 'social_follows');
  assert.equal(followQueries.length, 2);
  assert.ok(followQueries.every(query => query.filters.some(([, column]) => column === 'following_id')));

  for (const source of [REELS_COMPONENT, REELS_CAROUSEL]) {
    assert.match(source, /loadReelInteractionState\(supabase/);
    assert.match(source, /loadReelFollowState\(supabase/);
    assert.match(source, /normaliseReelIds\(reels\)/);
    assert.match(source, /normaliseReelAuthorIds\(reels\)/);
  }
  assert.doesNotMatch(INTERACTION_HELPER, /interaction_type['"],\s*['"]bookmark/);
  assert.doesNotMatch(INTERACTION_HELPER, /\.from\(['"]saved_reels['"]\)/);
  assert.match(INTERACTION_HELPER, /options\.loadSavedReels/);
  for (const source of [REELS_COMPONENT, REELS_CAROUSEL]) {
    assert.match(source, /loadSavedReels:[\s\S]*savedReelsService\.getSavedReels/);
    assert.match(source, /savedTargetsByReelRef\.current = new Map\(Object\.entries\(state\.savedTargets\)\)/);
    assert.match(source, /savedReelsService\.unsaveReel\([\s\S]*savedTargets\?\.length/);
  }
});
