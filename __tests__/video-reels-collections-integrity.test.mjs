import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = path => {
  const url = new URL(path, import.meta.url);
  return existsSync(url) ? readFileSync(url, 'utf8') : '';
};

const SERVER = read('../src/lib/server/reelsFeed.js');
// The server reader imports the shared availability-freshness contract. The vm
// harnesses below strip that import, so they are handed the REAL exported
// values (never restated literals) from the import-free availability module.
const AVAILABILITY_SOURCE = readFileSync(
  new URL('../src/lib/videoLibraryAvailability.js', import.meta.url),
  'utf8',
);
const {
  VIDEO_LIBRARY_MAX_FUTURE_SKEW_MS,
  VIDEO_LIBRARY_VERIFICATION_MAX_AGE_MS,
} = await import(
  `data:text/javascript;base64,${Buffer.from(AVAILABILITY_SOURCE).toString('base64')}`
);
assert.equal(Number.isFinite(VIDEO_LIBRARY_VERIFICATION_MAX_AGE_MS), true);
assert.equal(Number.isFinite(VIDEO_LIBRARY_MAX_FUTURE_SKEW_MS), true);
const MINE_API = read('../pages/api/reels/mine.js');
const SAVED_API = read('../pages/api/reels/saved.js');
const SAVED_STATUS_API = read('../pages/api/reels/saved-status.js');
const MY_REELS = read('../pages/hub/reels/my-reels.js');
const SAVED_REELS = read('../pages/hub/reels/saved.js');
const COLLECTION_COMMAND_RAIL = read('../src/components/reels/ReelCollectionCommandRail.jsx');
const PREFERENCES = read('../src/services/preferences-service.js');

function loadEligibilityHarness() {
  const transformed = SERVER
    .replace(/import \{ createClient \} from '[^']+';\n/, '')
    .replace(/import \{[\s\S]*?\} from '\.\.\/videoLibraryAvailability';\n/, '')
    .replace(/export class /g, 'class ')
    .replace(/export async function /g, 'async function ')
    .replace(/export const /g, 'const ');
  const context = {
    BLOCKED_VIDEO_LIBRARY_IDS: [],
    VIDEO_LIBRARY_ALLOWED_TYPES: ['cash', 'tournament', 'slots'],
    VIDEO_LIBRARY_MAX_FUTURE_SKEW_MS,
    VIDEO_LIBRARY_VERIFICATION_MAX_AGE_MS,
    Buffer,
    Date,
    Error,
    JSON,
    Map,
    Math,
    Number,
    Object,
    Promise,
    Set,
    String,
    URL,
    console,
    process: {
      env: {
        NEXT_PUBLIC_SUPABASE_URL: 'https://test-project.supabase.co',
      },
    },
    createClient() {
      throw new Error('not used by the eligibility harness');
    },
  };
  context.globalThis = context;
  vm.runInNewContext(
    `${transformed}\n` +
      'globalThis.__normalizeEligibleRow = normalizeEligibleRow;',
    context,
  );
  return context.__normalizeEligibleRow;
}

function nativeRow(overrides = {}) {
  const authorId = overrides.author_id || '11111111-1111-4111-8111-111111111111';
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    author_id: authorId,
    caption: 'Poker hand review',
    video_url: `https://test-project.supabase.co/storage/v1/object/public/social-media/reels/${authorId}/clip.mp4`,
    thumbnail_url: null,
    view_count: 0,
    like_count: 0,
    comment_count: 0,
    share_count: 0,
    created_at: '2026-09-06T12:00:00.000Z',
    updated_at: null,
    is_public: true,
    is_deleted: false,
    source_type: 'user_upload',
    source_post_id: null,
    source_story_id: null,
    youtube_video_id: null,
    media_status: 'ready',
    original_youtube_url: null,
    origin_type: 'user_upload',
    playback_type: 'native',
    topic: 'poker',
    rights_status: 'user_authorized',
    source_asset_id: null,
    canonical_asset_key: 'native:owned-clip',
    publication_key: 'user-reel:owned-clip',
    native_processing_requested: false,
    ...overrides,
  };
}

function emptyContext() {
  const ownerId = '11111111-1111-4111-8111-111111111111';
  const nativeUrl = `https://test-project.supabase.co/storage/v1/object/public/social-media/reels/${ownerId}/clip.mp4`;
  return {
    assetById: new Map(),
    assetByYoutube: new Map(),
    verificationByYoutube: new Map(),
    failedYoutubeIds: new Set(),
    livePostIds: new Set(),
    postById: new Map(),
    verifiedNativeObjects: new Set([`${ownerId}\n${nativeUrl}`]),
  };
}

function loadCollectionReaderHarness(client, { scanChunkSize = 240 } = {}) {
  const transformed = SERVER
    .replace(/import \{ createClient \} from '[^']+';\n/, '')
    .replace(/import \{[\s\S]*?\} from '\.\.\/videoLibraryAvailability';\n/, '')
    .replace('const SCAN_CHUNK_SIZE = 240;', `const SCAN_CHUNK_SIZE = ${scanChunkSize};`)
    .replace(/export class /g, 'class ')
    .replace(/export async function /g, 'async function ')
    .replace(/export const /g, 'const ');
  const context = {
    BLOCKED_VIDEO_LIBRARY_IDS: [],
    VIDEO_LIBRARY_ALLOWED_TYPES: ['cash', 'tournament', 'slots'],
    VIDEO_LIBRARY_MAX_FUTURE_SKEW_MS,
    VIDEO_LIBRARY_VERIFICATION_MAX_AGE_MS,
    Buffer,
    Date,
    Error,
    JSON,
    Map,
    Math,
    Number,
    Object,
    Promise,
    Set,
    String,
    URL,
    console,
    process: {
      env: {
        NEXT_PUBLIC_SUPABASE_URL: 'https://test-project.supabase.co',
      },
    },
    createClient() {
      return client;
    },
  };
  context.globalThis = context;
  vm.runInNewContext(
    `${transformed}\n` +
      'globalThis.__readOwned = readOwnedPokerReels;' +
      'globalThis.__readSaved = readSavedPokerReels;' +
      'globalThis.__readSavedForIds = readSavedPokerReelsForIds;' +
      'globalThis.__readFeed = readPokerReelsFeed;' +
      'globalThis.__readPublic = readPublicReelById;',
    context,
  );
  return {
    readOwned: context.__readOwned,
    readSaved: context.__readSaved,
    readSavedForIds: context.__readSavedForIds,
    readFeed: context.__readFeed,
    readPublic: context.__readPublic,
  };
}

function createMemoryClient(tables, { validNativeStorage = true } = {}) {
  const queryLog = [];
  class Query {
    constructor(table) {
      this.table = table;
      this.predicates = [];
      this.orders = [];
      this.maxRows = null;
      this.rangeBounds = null;
    }
    select() { return this; }
    eq(column, value) {
      this.predicates.push(row => row?.[column] === value);
      return this;
    }
    not(column, operator, value) {
      if (operator === 'is' && value === null) {
        this.predicates.push(row => row?.[column] != null);
      }
      return this;
    }
    in(column, values) {
      const allowed = new Set(values);
      this.predicates.push(row => allowed.has(row?.[column]));
      return this;
    }
    or(expression) {
      const directMatch = expression.match(/^id\.eq\.([^,]+),source_post_id\.eq\.([^,]+)$/);
      if (directMatch) {
        const [, reelId, sourcePostId] = directMatch;
        this.predicates.push(row => row?.id === reelId || row?.source_post_id === sourcePostId);
        return this;
      }
      const match = expression.match(
        /^(\w+)\.lt\.([^,]+),and\(\1\.eq\.([^,]+),id\.lt\.([^)]+)\)$/,
      );
      if (!match) throw new Error(`Unsupported memory-client OR filter: ${expression}`);
      const [, column, lessThan, equalTo, idLessThan] = match;
      this.predicates.push(row => (
        String(row?.[column]) < lessThan
        || (String(row?.[column]) === equalTo && String(row?.id) < idLessThan)
      ));
      return this;
    }
    order(column, { ascending = true } = {}) {
      this.orders.push({ column, ascending });
      return this;
    }
    limit(value) {
      this.maxRows = value;
      return this;
    }
    range(start, end) {
      this.rangeBounds = [start, end];
      return this;
    }
    async execute() {
      queryLog.push(this.table);
      let rows = [...(tables[this.table] || [])]
        .filter(row => this.predicates.every(predicate => predicate(row)));
      if (this.orders.length) {
        rows.sort((left, right) => {
          for (const { column, ascending } of this.orders) {
            const order = String(left?.[column]).localeCompare(String(right?.[column]));
            if (order !== 0) return ascending ? order : -order;
          }
          return 0;
        });
      }
      if (this.rangeBounds) {
        rows = rows.slice(this.rangeBounds[0], this.rangeBounds[1] + 1);
      } else if (this.maxRows != null) {
        rows = rows.slice(0, this.maxRows);
      }
      return { data: rows, error: null };
    }
    then(resolve, reject) {
      return this.execute().then(resolve, reject);
    }
  }
  return {
    queryLog,
    from: table => new Query(table),
    async rpc(name, args) {
      if (name !== 'fn_filter_valid_user_video_storage_urls') {
        throw new Error(`Unsupported memory-client RPC: ${name}`);
      }
      return { data: validNativeStorage ? args.p_candidates : [], error: null };
    },
  };
}

function loadSavedService(fetchImpl) {
  const transformed = PREFERENCES
    .replace(/^import[^\n]*\n/gm, '')
    .replace(/export const /g, 'const ');
  const context = {
    Array,
    Error,
    JSON,
    Map,
    Math,
    Number,
    Set,
    String,
    URLSearchParams,
    console: { warn() {} },
    fetch: fetchImpl,
    getAccessToken: () => 'verified-token',
    localStorage: { getItem: () => null, setItem() {} },
    supabase: {},
  };
  context.globalThis = context;
  vm.runInNewContext(
    `${transformed}\nglobalThis.__savedReelsService = savedReelsService;`,
    context,
  );
  return context.__savedReelsService;
}

function loadApiHandler(source, { readerName, reader, user }) {
  const transformed = source
    .replace(/^import(?:[\s\S]*?)from\s+['"][^'"]+['"];\s*/gm, '')
    .replace('export default async function handler', 'async function handler');
  const context = {
    Array,
    Error,
    process: {
      env: {
        NEXT_PUBLIC_SUPABASE_URL: 'https://test-project.supabase.co',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
      },
    },
    console: { warn() {} },
    createClient() {
      return { auth: {} };
    },
    async getServerUserWithFallback() {
      return user
        ? { user, error: null }
        : { user: null, error: 'No token' };
    },
    applyRateLimit() {
      return true;
    },
    LIMITS: { read: {} },
    reportApiError() {},
    ReelsFeedInputError: class ReelsFeedInputError extends Error {},
    [readerName]: reader,
  };
  context.globalThis = context;
  vm.runInNewContext(
    transformed + '\nglobalThis.__handler = handler;',
    context,
  );
  return context.__handler;
}

function mockResponse() {
  return {
    headers: {},
    statusCode: null,
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(value) {
      this.statusCode = value;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
  };
}

test('authenticated Reel collections expose bounded, private no-store APIs', () => {
  for (const [name, source, reader] of [
    ['mine', MINE_API, 'readOwnedPokerReels'],
    ['saved', SAVED_API, 'readSavedPokerReels'],
  ]) {
    assert.ok(source, `/api/reels/${name} must exist`);
    assert.match(source, /getServerUserWithFallback/);
    assert.match(source, /Authentication required/);
    assert.match(source, /Cache-Control['"],\s*['"]private, no-store, max-age=0/);
    assert.match(source, /Vary['"],\s*['"]Accept-Encoding, Authorization/);
    assert.match(source, new RegExp(reader));
    assert.doesNotMatch(source, /req\.query\.(?:user|userId|user_id)/);
  }
  assert.match(SERVER, /const MAX_OWNED_SCAN_ROWS\s*=\s*\d[\d_]*/);
  assert.match(SERVER, /const MAX_SAVED_SCAN_ROWS\s*=\s*\d[\d_]*/);
  assert.match(SERVER, /scanned < MAX_OWNED_SCAN_ROWS/);
  assert.match(SERVER, /scanned < MAX_SAVED_SCAN_ROWS/);
  assert.match(SERVER, /COLLECTION_SCAN_CHUNK_SIZE/);
  assert.match(SERVER, /parseCollectionCursor\(options\.cursor, ['"]owned['"]\)/);
  assert.match(SERVER, /parseCollectionCursor\(options\.cursor, ['"]saved['"]\)/);
  assert.ok(SAVED_STATUS_API, '/api/reels/saved-status must exist');
  assert.match(SAVED_STATUS_API, /req\.method !== ['"]POST['"]/);
  assert.match(SAVED_STATUS_API, /getServerUserWithFallback/);
  assert.match(SAVED_STATUS_API, /Cache-Control['"],\s*['"]private, no-store, max-age=0/);
  assert.match(SAVED_STATUS_API, /readSavedPokerReelsForIds/);
  assert.doesNotMatch(SAVED_STATUS_API, /req\.body\.(?:user|userId|user_id)/);
});

test('collection cursors are typed, keyset-based, and reject cross-page replay', () => {
  const parseSource = SERVER.match(/function parseCollectionCursor\([\s\S]*?\n\}/)?.[0];
  const positionSource = SERVER.match(/function collectionCursorForRow\([\s\S]*?\n\}/)?.[0];
  const encodeSource = SERVER.match(/function encodeCursor\([\s\S]*?\n\}/)?.[0];
  assert.ok(parseSource && positionSource && encodeSource);
  const context = {
    Buffer,
    Date,
    JSON,
    Number,
    String,
    MAX_CURSOR_LENGTH: 1024,
    UUID_RE: /^[0-9a-f-]{36}$/i,
    COLLECTION_CURSOR_TIMESTAMP_RE: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/,
    ReelsFeedInputError: class ReelsFeedInputError extends Error {},
  };
  context.globalThis = context;
  vm.runInNewContext(
    `${parseSource}\n${positionSource}\n${encodeSource}\n` +
      'globalThis.__parse = parseCollectionCursor;' +
      'globalThis.__position = collectionCursorForRow;' +
      'globalThis.__encode = encodeCursor;',
    context,
  );
  const row = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    created_at: '2026-09-06T12:00:00.000Z',
  };
  const cursor = context.__encode(context.__position(row, 'owned', 'created_at'));
  assert.deepEqual(
    { ...context.__parse(cursor, 'owned') },
    { id: row.id, at: row.created_at },
  );
  assert.throws(() => context.__parse(cursor, 'saved'));
  assert.throws(() => context.__parse('not-base64', 'owned'));
  assert.match(SERVER, /\$\{timestampColumn\}\.lt\.\$\{cursor\.at\}/);
  assert.match(SERVER, /applyCollectionCursorFilter\(query, cursor, ['"]created_at['"]\)/);
  assert.match(SERVER, /applyCollectionCursorFilter\(query, cursor, ['"]saved_at['"]\)/);
  assert.match(SERVER, /saved_at['"],\s*\{ ascending: false \}/);
});

test('collection readers keep slots and sports across My Reels, Saved, and saved-status', async () => {
  const ownerId = '11111111-1111-4111-8111-111111111111';
  const reelA = nativeRow({
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    author_id: ownerId,
    caption: 'A',
    topic: 'slots',
    canonical_asset_key: 'native:a',
    source_post_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    created_at: '2026-09-06T13:00:00.000Z',
  });
  const reelB = nativeRow({
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    author_id: ownerId,
    caption: 'B',
    topic: 'sports',
    canonical_asset_key: 'native:b',
    created_at: '2026-09-06T12:00:00.000Z',
  });
  const tables = {
    social_reels: [reelA, reelB],
    social_posts: [{
      id: reelA.source_post_id,
      author_id: ownerId,
      visibility: 'public',
      audience_mode: 'public',
      audience_list: [],
      is_deleted: false,
    }],
    saved_reels: [
      {
        id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        user_id: ownerId,
        reel_id: reelA.source_post_id,
        source_type: 'post',
        saved_at: '2026-09-06T15:00:00.000Z',
      },
      {
        id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        user_id: ownerId,
        reel_id: reelA.id,
        source_type: 'reel',
        saved_at: '2026-09-06T14:00:00.000Z',
      },
      {
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        user_id: ownerId,
        reel_id: reelB.id,
        source_type: 'reel',
        saved_at: '2026-09-06T13:00:00.000Z',
      },
    ],
    profiles: [{ id: ownerId, username: 'owner', full_name: 'Owner', avatar_url: null }],
    social_follows: [{ follower_id: ownerId, following_id: ownerId }],
    video_library_videos: [],
    youtube_embed_failures: [],
  };
  const client = createMemoryClient(tables);
  const { readOwned, readSaved, readSavedForIds, readFeed } = loadCollectionReaderHarness(client);

  const ownedFirst = await readOwned({ client, userId: ownerId, limit: 1 });
  const ownedSecond = await readOwned({
    client,
    userId: ownerId,
    limit: 1,
    cursor: ownedFirst.nextCursor,
  });
  assert.deepEqual([...ownedFirst.data].map(row => row.id), [reelA.id]);
  assert.equal(ownedFirst.hasMore, true);
  assert.ok(ownedFirst.nextCursor);
  assert.deepEqual([...ownedSecond.data].map(row => row.id), [reelB.id]);
  assert.equal(ownedSecond.hasMore, false);
  assert.equal(ownedSecond.nextCursor, null);

  const savedFirst = await readSaved({ client, userId: ownerId, limit: 1 });
  const savedSecond = await readSaved({
    client,
    userId: ownerId,
    limit: 1,
    cursor: savedFirst.nextCursor,
  });
  assert.deepEqual([...savedFirst.data].map(row => row.reel_id), [reelA.id]);
  assert.deepEqual(
    [...savedFirst.data[0].saved_target_ids].sort(),
    [reelA.id, reelA.source_post_id].sort(),
  );
  assert.equal(savedFirst.hasMore, true);
  assert.deepEqual([...savedSecond.data].map(row => row.reel_id), [reelB.id]);
  assert.equal(savedSecond.hasMore, false);
  assert.equal(savedSecond.nextCursor, null);

  const targeted = await readSavedForIds({
    client,
    userId: ownerId,
    reelIds: [reelA.id],
  });
  assert.deepEqual([...targeted].map(row => row.reel_id), [reelA.id]);
  assert.deepEqual(
    [...targeted[0].saved_target_ids].sort(),
    [reelA.id, reelA.source_post_id].sort(),
  );
  await assert.rejects(
    readSavedForIds({ client, userId: ownerId, reelIds: ['not-a-uuid'] }),
    /Invalid saved-Reels status request/,
  );
  await assert.rejects(
    readSavedForIds({
      client,
      userId: ownerId,
      reelIds: Array.from({ length: 101 }, () => reelA.id),
    }),
    /Invalid saved-Reels status request/,
  );

  const followQueriesBefore = client.queryLog.filter(table => table === 'social_follows').length;
  const following = await readFeed({
    client,
    viewerId: ownerId,
    scope: 'following',
    sort: 'recent',
    limit: 2,
  });
  const followQueriesAfter = client.queryLog.filter(table => table === 'social_follows').length;
  assert.deepEqual([...following.data].map(row => row.id), [reelA.id, reelB.id]);
  assert.ok(
    followQueriesAfter - followQueriesBefore <= 2,
    'one candidate page must use at most two bounded follow-membership queries',
  );
});

test('Following scans sparse global pages and keeps only followed canonical winners', async () => {
  const viewerId = '11111111-1111-4111-8111-111111111111';
  const followedAuthor = '22222222-2222-4222-8222-222222222222';
  const unfollowedAuthor = '33333333-3333-4333-8333-333333333333';
  const row = (id, author_id, canonical_asset_key, created_at) => nativeRow({
    id,
    author_id,
    canonical_asset_key,
    publication_key: `user-reel:${id}`,
    video_url: `https://test-project.supabase.co/storage/v1/object/public/social-media/reels/${author_id}/${id}.mp4`,
    created_at,
  });
  const unfollowedDecoyA = row(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6',
    unfollowedAuthor,
    'native:unfollowed-decoy-a',
    '2026-09-06T17:00:00.000Z',
  );
  const unfollowedDecoyB = row(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7',
    unfollowedAuthor,
    'native:unfollowed-decoy-b',
    '2026-09-06T16:00:00.000Z',
  );
  const followedLoser = row(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    followedAuthor,
    'native:unfollowed-winner',
    '2026-09-06T15:00:00.000Z',
  );
  const unfollowedWinner = row(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    unfollowedAuthor,
    'native:unfollowed-winner',
    '2026-09-06T14:00:00.000Z',
  );
  const unfollowedLoser = row(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
    unfollowedAuthor,
    'native:followed-winner',
    '2026-09-06T13:00:00.000Z',
  );
  const followedWinner = row(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',
    followedAuthor,
    'native:followed-winner',
    '2026-09-06T12:00:00.000Z',
  );
  const sparseFollowed = row(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5',
    followedAuthor,
    'native:sparse-followed',
    '2026-09-06T11:00:00.000Z',
  );
  const client = createMemoryClient({
    social_reels: [
      unfollowedDecoyA,
      unfollowedDecoyB,
      followedLoser,
      unfollowedWinner,
      unfollowedLoser,
      followedWinner,
      sparseFollowed,
    ],
    social_posts: [],
    saved_reels: [],
    profiles: [
      { id: followedAuthor, username: 'followed', full_name: 'Followed', avatar_url: null },
      { id: unfollowedAuthor, username: 'unfollowed', full_name: 'Unfollowed', avatar_url: null },
    ],
    social_follows: [{ follower_id: viewerId, following_id: followedAuthor }],
    video_library_videos: [],
    youtube_embed_failures: [],
  });
  const { readFeed } = loadCollectionReaderHarness(client, { scanChunkSize: 2 });
  const following = await readFeed({
    client,
    category: 'following',
    viewerId,
    scope: 'following',
    sort: 'recent',
    limit: 10,
  });

  assert.deepEqual(
    [...following.data].map(item => item.id),
    [followedWinner.id, sparseFollowed.id],
    'a followed loser must not replace an unfollowed canonical winner, while sparse followed winners remain reachable',
  );
  assert.equal(following.hasMore, false);
  assert.equal(following.nextCursor, null);
  assert.deepEqual(
    client.queryLog.slice(0, 3),
    ['social_reels', 'social_follows', 'social_reels'],
    'an unrelated-only chunk must advance the global cursor without starting expensive eligibility hydration',
  );
  assert.ok(
    client.queryLog.filter(table => table === 'social_follows').length >= 3,
    'the proof must cross multiple bounded global keyset chunks',
  );
});

test('Following keeps persisted zero-version horse authors and hydrates their ordinary profiles', async () => {
  const viewerId = '11111111-1111-4111-8111-111111111111';
  const horseAuthorId = '00000000-0000-0000-0000-000000000028';
  const youtubeId = 'dQw4w9WgXcQ';
  const checkedAt = new Date().toISOString();
  const horseReel = nativeRow({
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    author_id: horseAuthorId,
    caption: 'Maintained horse sports clip',
    video_url: `https://www.youtube.com/watch?v=${youtubeId}`,
    original_youtube_url: `https://www.youtube.com/watch?v=${youtubeId}`,
    youtube_video_id: youtubeId,
    source_type: 'horse',
    origin_type: 'horse',
    playback_type: 'youtube_embed',
    topic: 'sports',
    rights_status: 'embed_only',
    canonical_asset_key: `youtube:${youtubeId}`,
    publication_key: `horse:${youtubeId}`,
    created_at: checkedAt,
  });
  const tables = {
    social_reels: [horseReel],
    social_posts: [],
    saved_reels: [],
    profiles: [{
      id: horseAuthorId,
      username: 'maintained-horse-player',
      full_name: 'Maintained Horse Player',
      avatar_url: null,
    }],
    social_follows: [{ follower_id: viewerId, following_id: horseAuthorId }],
    video_library_videos: [{
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      youtube_video_id: youtubeId,
      type: 'cash',
      url: `https://www.youtube.com/watch?v=${youtubeId}`,
      availability_status: 'verified',
      embeddable: true,
      availability_checked_at: checkedAt,
    }],
    youtube_embed_failures: [],
  };
  const client = createMemoryClient(tables);
  const { readFeed } = loadCollectionReaderHarness(client);
  const following = await readFeed({
    client,
    category: 'following',
    viewerId,
    scope: 'following',
    sort: 'recent',
    limit: 10,
  });

  assert.deepEqual([...following.data].map(row => row.id), [horseReel.id]);
  assert.equal(following.data[0].author_id, horseAuthorId);
  assert.equal(following.data[0].profiles.id, horseAuthorId);
  assert.equal(following.data[0].profiles.username, 'maintained-horse-player');
  assert.equal(Object.hasOwn(following.data[0].profiles, 'is_horse'), false);
});

test('public server readers admit only storage-proven unknown native uploads and preserve old aliases', async () => {
  const ownerId = '11111111-1111-4111-8111-111111111111';
  const postId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const canonicalAssetKey = 'native:historical-community-upload';
  const winner = nativeRow({
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    author_id: ownerId,
    source_type: 'native',
    source_post_id: postId,
    origin_type: 'social_post',
    topic: 'unknown',
    canonical_asset_key: canonicalAssetKey,
    publication_key: null,
    created_at: '2026-05-08T12:00:00.000Z',
  });
  const loser = {
    ...winner,
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    created_at: '2026-05-08T12:00:01.000Z',
  };
  const sourcePost = {
    id: postId,
    author_id: ownerId,
    content_type: 'video',
    media_urls: [winner.video_url],
    visibility: 'public',
    audience_mode: null,
    audience_list: null,
    is_flagged: false,
    is_deleted: false,
    metadata: {},
    origin_type: 'legacy',
    playback_type: 'native',
    topic: 'unknown',
    rights_status: 'user_authorized',
    source_asset_id: null,
    youtube_video_id: null,
    canonical_asset_key: canonicalAssetKey,
    publication_key: null,
  };
  const tablesForPost = post => ({
    social_reels: [loser, winner],
    social_posts: [post],
    profiles: [{ id: ownerId, username: 'owner', full_name: 'Owner', avatar_url: null }],
    social_follows: [{ follower_id: ownerId, following_id: ownerId }],
    video_library_videos: [],
    youtube_embed_failures: [],
  });

  const client = createMemoryClient(tablesForPost(sourcePost));
  const { readFeed, readPublic } = loadCollectionReaderHarness(client);
  const forYou = await readFeed({ client, category: 'for-you', scope: 'all', limit: 10 });
  assert.deepEqual([...forYou.data].map(row => row.id), [winner.id]);
  assert.equal(forYou.data[0].topic, 'unknown');

  for (const directId of [winner.id, loser.id, postId]) {
    const detail = await readPublic({ client, id: directId, category: 'for-you' });
    assert.equal(detail.detailStatus, 'found');
    assert.equal(detail.data.id, winner.id, `alias ${directId} must resolve the oldest winner`);
  }

  for (const category of ['poker', 'casino-slots', 'sports']) {
    const strictFeed = await readFeed({ client, category, scope: 'all', limit: 10 });
    assert.deepEqual([...strictFeed.data], [], `${category} must remain topic strict`);
  }
  const following = await readFeed({
    client,
    category: 'following',
    scope: 'following',
    viewerId: ownerId,
    limit: 10,
  });
  assert.deepEqual([...following.data], [], 'Following must never admit an unknown topic');

  const hostilePosts = [
    { ...sourcePost, visibility: 'private' },
    { ...sourcePost, is_flagged: true },
    { ...sourcePost, author_id: '22222222-2222-4222-8222-222222222222' },
    { ...sourcePost, media_urls: ['https://test-project.supabase.co/storage/v1/object/public/social-media/videos/11111111-1111-4111-8111-111111111111/other.mp4'] },
    { ...sourcePost, source_asset_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' },
    { ...sourcePost, youtube_video_id: 'M7lc1UVf-VE' },
    { ...sourcePost, publication_key: 'managed:forged' },
  ];
  for (const hostilePost of hostilePosts) {
    const hostileClient = createMemoryClient(tablesForPost(hostilePost));
    const hostileReader = loadCollectionReaderHarness(hostileClient).readPublic;
    const detail = await hostileReader({
      client: hostileClient,
      id: winner.id,
      category: 'for-you',
    });
    assert.equal(detail.detailStatus, 'unavailable');
    assert.equal(detail.data, null);
  }

  const missingStorageClient = createMemoryClient(
    tablesForPost(sourcePost),
    { validNativeStorage: false },
  );
  const missingStorageReader = loadCollectionReaderHarness(missingStorageClient).readPublic;
  const missingStorage = await missingStorageReader({
    client: missingStorageClient,
    id: winner.id,
    category: 'for-you',
  });
  assert.equal(missingStorage.detailStatus, 'unavailable');
  assert.equal(missingStorage.data, null);
});

test('collection APIs fail closed and use only the verified token owner', async () => {
  const verifiedUser = { id: '11111111-1111-4111-8111-111111111111' };
  for (const [source, readerName] of [
    [MINE_API, 'readOwnedPokerReels'],
    [SAVED_API, 'readSavedPokerReels'],
  ]) {
    let readerCalls = 0;
    const unauthenticated = loadApiHandler(source, {
      readerName,
      user: null,
      async reader() {
        readerCalls += 1;
        return { data: [], hasMore: false, partial: false };
      },
    });
    const unauthorizedResponse = mockResponse();
    await unauthenticated(
      { method: 'GET', query: { user_id: verifiedUser.id }, headers: {} },
      unauthorizedResponse,
    );
    assert.equal(unauthorizedResponse.statusCode, 401);
    assert.equal(readerCalls, 0);
    assert.equal(unauthorizedResponse.headers['Cache-Control'], 'private, no-store, max-age=0');
    assert.equal(unauthorizedResponse.headers.Vary, 'Accept-Encoding, Authorization');

    let optionsSeen = null;
    const authenticated = loadApiHandler(source, {
      readerName,
      user: verifiedUser,
      async reader(options) {
        optionsSeen = options;
        return { data: [], hasMore: true, nextCursor: 'next-page', partial: false };
      },
    });
    const authenticatedResponse = mockResponse();
    await authenticated(
      {
        method: 'GET',
        query: {
          limit: '17',
          cursor: 'current-page',
          user_id: '22222222-2222-4222-8222-222222222222',
        },
        headers: { authorization: 'Bearer verified-token' },
      },
      authenticatedResponse,
    );
    assert.equal(authenticatedResponse.statusCode, 200);
    assert.equal(optionsSeen.userId, verifiedUser.id);
    assert.equal(optionsSeen.limit, '17');
    assert.equal(optionsSeen.cursor, 'current-page');
    assert.equal(authenticatedResponse.body.has_more, true);
    assert.equal(authenticatedResponse.body.next_cursor, 'next-page');
  }
});

test('saved-status API scopes a bounded ID request to the verified token owner', async () => {
  const verifiedUser = { id: '11111111-1111-4111-8111-111111111111' };
  const reelId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  let optionsSeen = null;
  const handler = loadApiHandler(SAVED_STATUS_API, {
    readerName: 'readSavedPokerReelsForIds',
    user: verifiedUser,
    async reader(options) {
      optionsSeen = options;
      return [{ reel_id: reelId }];
    },
  });
  const response = mockResponse();
  await handler({
    method: 'POST',
    query: {},
    headers: { authorization: 'Bearer verified-token' },
    body: {
      reel_ids: [reelId],
      user_id: '22222222-2222-4222-8222-222222222222',
    },
  }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(optionsSeen.userId, verifiedUser.id);
  assert.deepEqual(optionsSeen.reelIds, [reelId]);
  assert.deepEqual(response.body.data, [{ reel_id: reelId }]);
});

test('saved-Reels client exhausts cursor pages and chunks targeted status reads sequentially', async () => {
  const requests = [];
  const pageService = loadSavedService(async (url, options) => {
    requests.push({ url, options });
    const secondPage = url.includes('cursor=cursor-two');
    return {
      ok: true,
      status: 200,
      async json() {
        return secondPage
          ? {
              success: true,
              data: [{ reel_id: 'reel-b', user_id: 'viewer-id' }],
              has_more: false,
            }
          : {
              success: true,
              data: [{ reel_id: 'reel-a', user_id: 'viewer-id' }],
              has_more: true,
              next_cursor: 'cursor-two',
            };
      },
    };
  });
  const allRows = await pageService.getSavedReels('viewer-id');
  assert.deepEqual([...allRows].map(row => row.reel_id), ['reel-a', 'reel-b']);
  assert.equal(requests.length, 2);
  assert.match(requests[1].url, /cursor=cursor-two/);
  assert.equal(requests[0].options.cache, 'no-store');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer verified-token');

  const statusRequests = [];
  const statusService = loadSavedService(async (url, options) => {
    statusRequests.push({ url, options });
    const body = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          success: true,
          data: [{ reel_id: body.reel_ids[0], user_id: 'viewer-id' }],
        };
      },
    };
  });
  const ids = Array.from({ length: 201 }, (_, index) => (
    `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`
  ));
  const targetedRows = await statusService.getSavedReelsForIds('viewer-id', ids);
  assert.equal(statusRequests.length, 3);
  assert.deepEqual(
    statusRequests.map(request => JSON.parse(request.options.body).reel_ids.length),
    [100, 100, 1],
  );
  assert.ok(statusRequests.every(request => request.url === '/api/reels/saved-status'));
  assert.ok(statusRequests.every(request => request.options.method === 'POST'));
  assert.equal(targetedRows.length, 3);

  const crossedAccountService = loadSavedService(async () => ({
    ok: true,
    status: 200,
    async json() {
      return {
        success: true,
        data: [{ reel_id: 'reel-from-a', user_id: 'account-a' }],
        has_more: false,
      };
    },
  }));
  await assert.rejects(
    crossedAccountService.getSavedReelsPage('account-b'),
    /response owner mismatch/,
  );
});

test('collection views use canonical APIs and latest-request cancellation', () => {
  for (const [label, category] of [
    ['For You', 'for-you'],
    ['Poker', 'poker'],
    ['Casino And Slots', 'casino-slots'],
    ['Sports', 'sports'],
    ['Following', 'following'],
  ]) {
    assert.match(
      COLLECTION_COMMAND_RAIL,
      new RegExp(`href: '/hub/reels\\?category=${category}', label: '${label}'`),
    );
  }
  assert.match(COLLECTION_COMMAND_RAIL, /categoryForReelsRoute\(router\.query\)/);
  assert.doesNotMatch(COLLECTION_COMMAND_RAIL, /href: ['"]\/hub\/reels['"], label: ['"]All Reels['"]/);
  assert.match(MY_REELS, /<ReelCollectionCommandRail \/>/);
  assert.match(SAVED_REELS, /<ReelCollectionCommandRail \/>/);
  assert.match(MY_REELS, /router\.push\('\/hub\/reels\?category=for-you'\)/);
  assert.match(SAVED_REELS, /\/hub\/reels\?category=for-you/);
  assert.match(MY_REELS, /\/auth\/login\?redirect=\$\{encodeURIComponent\('\/hub\/reels\/my-reels'\)\}/);
  assert.match(SAVED_REELS, /\/auth\/login\?redirect=\$\{encodeURIComponent\('\/hub\/reels\/saved'\)\}/);
  assert.doesNotMatch(MY_REELS, /href=['"]\/login['"]/);
  assert.doesNotMatch(SAVED_REELS, /href=['"]\/login['"]/);
  assert.match(MY_REELS, /const POKER_REEL_UPLOAD_PATH = '\/hub\/reels\?category=poker&upload=1'/);
  assert.match(MY_REELS, /authUser && getAccessToken\(\)[\s\S]*POKER_REEL_UPLOAD_PATH[\s\S]*\/auth\/login\?redirect=\$\{encodeURIComponent\(POKER_REEL_UPLOAD_PATH\)\}/);
  assert.match(MY_REELS, /href=\{POKER_REEL_UPLOAD_PATH\}/);
  assert.match(MY_REELS, /!token[\s\S]*setReauthRequired\(true\)/);
  assert.match(MY_REELS, /\[401, 403\]\.includes\(loadError\?\.status\)[\s\S]*setReauthRequired\(true\)/);
  assert.match(SAVED_REELS, /\[401, 403\]\.includes\(loadError\?\.status\)[\s\S]*setReauthRequired\(true\)/);
  assert.match(MY_REELS, /reauthRequired \? <CollectionState[\s\S]*Sign In Again/);
  assert.match(SAVED_REELS, /reauthRequired \? <CollectionState[\s\S]*Sign In Again/);
  assert.match(MY_REELS, /\/api\/reels\/mine\?\$\{params\.toString\(\)\}/);
  assert.doesNotMatch(MY_REELS, /\.from\(['"]social_reels['"]\)/);
  assert.match(MY_REELS, /createLatestRequestGuard/);
  assert.match(MY_REELS, /begin\(\{ append: appendRequest \}\)/);
  assert.match(MY_REELS, /accountScopeRef\.current\.capture\(user\?\.id\)/);
  assert.match(MY_REELS, /ownerRequest\.isCurrent\(\)/);
  assert.match(MY_REELS, /collectionOwnerIdRef\.current !== \(user\?\.id \|\| null\)/);
  assert.match(MY_REELS, /if \(accountChanged\) \{[\s\S]{0,220}setReels\(\[\]\)[\s\S]{0,220}nextCursorRef\.current = null/);
  assert.match(MY_REELS, /row\?\.author_id !== ownerRequest\.ownerId/);
  assert.match(MY_REELS, /authUserRef\.current = next[\s\S]{0,180}requestGuardRef\.current\.abort\(\)/);
  assert.match(MY_REELS, /params\.set\(['"]cursor['"], cursor\)/);
  assert.match(MY_REELS, /payload\.next_cursor/);
  assert.match(MY_REELS, /Load More Reels/);
  assert.match(MY_REELS, /if \(!reel\.is_public\)[\s\S]*<article className="vlc-reel-record"/);
  assert.match(MY_REELS, /Only You Can See This Reel/);
  assert.match(SAVED_REELS, /createLatestRequestGuard/);
  assert.match(SAVED_REELS, /begin\(\{ append: appendRequest \}\)/);
  assert.match(SAVED_REELS, /accountScopeRef\.current\.capture\(authUser\?\.id\)/);
  assert.match(SAVED_REELS, /ownerRequest\.isCurrent\(\)/);
  assert.match(SAVED_REELS, /collectionOwnerIdRef\.current !== \(authUser\?\.id \|\| null\)/);
  assert.match(SAVED_REELS, /if \(accountChanged\) \{[\s\S]{0,220}setSavedReels\(\[\]\)[\s\S]{0,220}nextCursorRef\.current = null/);
  assert.match(SAVED_REELS, /item\?\.user_id !== ownerRequest\.ownerId/);
  assert.match(SAVED_REELS, /authUserRef\.current = next[\s\S]{0,180}requestGuardRef\.current\.abort\(\)/);
  assert.match(SAVED_REELS, /getSavedReelsPage\(authUser\.id,\s*\{/);
  assert.match(SAVED_REELS, /cursor,/);
  assert.match(SAVED_REELS, /Load More Saved Reels/);
  const unsave = SAVED_REELS.match(/const unsaveReel = async[\s\S]*?\n    \};/)?.[0] || '';
  assert.match(unsave, /accountScopeRef\.current\.capture\(user\?\.id\)/);
  assert.match(unsave, /!ownerRequest\.ownerId \|\| !ownerRequest\.isCurrent\(\)/);
  assert.match(unsave, /savedReelsService\.unsaveReel\([\s\S]*ownerRequest\.ownerId/);
  assert.match(unsave, /current\.some\(item => item\.id === removed\.id\)/);
  assert.doesNotMatch(unsave, /setSavedReels\(previous\)/,
    'one failed removal must not restore a stale snapshot over other successful removals');

  assert.match(PREFERENCES, /fetchSavedReelsPage/);
  assert.match(PREFERENCES, /if \(!token\)[\s\S]*error\.status = 401/);
  assert.match(PREFERENCES, /error\.status = response\.status/);
  assert.match(PREFERENCES, /\/api\/reels\/saved\?\$\{params\.toString\(\)\}/);
  assert.match(PREFERENCES, /Authorization:\s*`Bearer \$\{token\}`/);
  assert.match(PREFERENCES, /params\.set\(['"]cursor['"], cursor\)/);
  assert.match(PREFERENCES, /for \(let pageNumber = 0; pageNumber < safeMaxPages/);
  assert.match(PREFERENCES, /seenCursors\.has\(page\.nextCursor\)/);
  assert.match(PREFERENCES, /getSavedReelsForIds\(userId, reelIds/);
  assert.match(PREFERENCES, /fetch\(['"]\/api\/reels\/saved-status['"]/);
  assert.match(PREFERENCES, /row\?\.user_id !== userId/);
  assert.match(PREFERENCES, /reel_ids: ids\.slice\(index, index \+ MAX_SAVED_REELS_PAGE_LIMIT\)/);
  assert.doesNotMatch(PREFERENCES, /fetch\([^\n]*user_id=/);
  assert.match(SERVER, /reel_id:\s*winner\.id/);
  assert.match(SERVER, /saved_target_ids:\s*savedTargetIds/);
  assert.match(PREFERENCES, /Array\.isArray\(reelId\)[\s\S]*?\.in\(['"]reel_id['"],\s*targetIds\)/);
  assert.match(SAVED_REELS, /removed\?\.saved_target_ids\s*\|\|\s*removed\?\.saved_target_id/);
});

test('canonical collection eligibility rejects deleted, private, and stale targets', () => {
  const normalize = loadEligibilityHarness();
  const ownerId = '11111111-1111-4111-8111-111111111111';
  const context = emptyContext();

  assert.ok(normalize(nativeRow(), context, 'all'));
  assert.equal(
    normalize(nativeRow(), { ...context, verifiedNativeObjects: new Set() }, 'all'),
    null,
    'a URL-shaped native row must fail closed without live Storage object proof',
  );
  assert.equal(normalize(nativeRow({ is_deleted: true }), context, 'all'), null);
  assert.equal(normalize(nativeRow({ is_public: false }), context, 'all'), null);
  assert.ok(normalize(
    nativeRow({ is_public: false }),
    context,
    'all',
    { allowOwnerPrivate: true, ownerId },
  ));
  assert.equal(normalize(
    nativeRow({ is_public: false, author_id: '22222222-2222-4222-8222-222222222222' }),
    context,
    'all',
    { allowOwnerPrivate: true, ownerId },
  ), null);

  const postId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const deletedPostContext = emptyContext();
  deletedPostContext.postById.set(postId, {
    id: postId,
    author_id: ownerId,
    visibility: 'public',
    is_deleted: true,
  });
  assert.equal(normalize(
    nativeRow({ source_post_id: postId }),
    deletedPostContext,
    'all',
    { allowOwnerPrivate: true, ownerId },
  ), null);

  const privatePostContext = emptyContext();
  privatePostContext.postById.set(postId, {
    id: postId,
    author_id: ownerId,
    visibility: 'private',
    is_deleted: false,
  });
  const ownerPrivateSource = normalize(
    nativeRow({ is_public: false, source_post_id: postId }),
    privatePostContext,
    'all',
    { allowOwnerPrivate: true, ownerId },
  );
  assert.ok(ownerPrivateSource);
  assert.equal(ownerPrivateSource.is_public, false);
  const ownerPublicReelWithPrivateSource = normalize(
    nativeRow({ is_public: true, source_post_id: postId }),
    privatePostContext,
    'all',
    { allowOwnerPrivate: true, ownerId },
  );
  assert.ok(ownerPublicReelWithPrivateSource);
  assert.equal(
    ownerPublicReelWithPrivateSource.is_public,
    false,
    'a private source post must suppress the public deep link even when the Reel bit is stale',
  );
  assert.equal(
    normalize(nativeRow({ source_post_id: postId }), privatePostContext, 'all'),
    null,
    'saved/public readers must reject a target whose source post became private',
  );

  const staleAudienceContext = emptyContext();
  staleAudienceContext.postById.set(postId, {
    id: postId,
    author_id: ownerId,
    visibility: 'public',
    audience_mode: 'friends',
    audience_list: [],
    is_deleted: false,
  });
  assert.equal(
    normalize(nativeRow({ source_post_id: postId }), staleAudienceContext, 'all'),
    null,
    'a stale public visibility bit must not bypass a non-public audience mode',
  );
  const ownerAudienceSource = normalize(
    nativeRow({ is_public: false, source_post_id: postId }),
    staleAudienceContext,
    'all',
    { allowOwnerPrivate: true, ownerId },
  );
  assert.ok(ownerAudienceSource, 'the verified author may still read their own private collection');
  assert.equal(ownerAudienceSource.is_public, false);

  const youtubeId = 'M7lc1UVf-VE';
  const staleAssetId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const staleContext = emptyContext();
  const staleAsset = {
    id: staleAssetId,
    youtube_video_id: youtubeId,
    type: 'cash',
    availability_status: 'verified',
    embeddable: true,
    availability_checked_at: '2020-01-01T00:00:00.000Z',
  };
  staleContext.assetById.set(staleAssetId, staleAsset);
  staleContext.assetByYoutube.set(youtubeId, staleAsset);
  assert.equal(normalize(nativeRow({
    video_url: `https://www.youtube.com/watch?v=${youtubeId}`,
    original_youtube_url: `https://www.youtube.com/watch?v=${youtubeId}`,
    youtube_video_id: youtubeId,
    playback_type: 'youtube_embed',
    rights_status: 'embed_only',
    origin_type: 'video_library',
    source_type: 'video_library',
    source_asset_id: staleAssetId,
    canonical_asset_key: `youtube:${youtubeId}`,
    publication_key: `video-library:${staleAssetId}`,
  }), staleContext, 'all'), null);

  const transitionExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const transitionalManaged = normalize(nativeRow({
    video_url: `https://www.youtube.com/watch?v=${youtubeId}`,
    original_youtube_url: `https://www.youtube.com/watch?v=${youtubeId}`,
    youtube_video_id: youtubeId,
    playback_type: 'youtube_embed',
    rights_status: 'embed_only',
    origin_type: 'video_library',
    source_type: 'video_library',
    source_asset_id: staleAssetId,
    canonical_asset_key: `youtube:${youtubeId}`,
    publication_key: `video-library:${staleAssetId}`,
    legacy_transition_eligible: true,
    legacy_transition_expires_at: transitionExpiry,
  }), staleContext, 'all');
  assert.ok(transitionalManaged,
    'exact managed lineage may use the immutable transition while fresh proof is being established');

  const outsideLibraryLegacy = nativeRow({
    video_url: `https://www.youtube.com/watch?v=${youtubeId}`,
    original_youtube_url: `https://www.youtube.com/watch?v=${youtubeId}`,
    youtube_video_id: youtubeId,
    playback_type: 'youtube_embed',
    rights_status: 'embed_only',
    origin_type: 'legacy',
    source_type: 'youtube',
    source_asset_id: null,
    canonical_asset_key: `youtube:${youtubeId}`,
    publication_key: null,
    legacy_transition_eligible: true,
    legacy_transition_expires_at: transitionExpiry,
  });
  const transitional = normalize(outsideLibraryLegacy, staleContext, 'all');
  assert.ok(transitional, 'a live database-computed transition may bridge stale positive proof');
  assert.equal(transitional.legacy_transition_eligible, true);
  assert.equal(transitional.legacy_transition_expires_at, transitionExpiry);
  assert.equal(normalize({
    ...outsideLibraryLegacy,
    legacy_transition_expires_at: new Date(Date.now() - 1_000).toISOString(),
  }, staleContext, 'all'), null);
  assert.equal(normalize({
    ...outsideLibraryLegacy,
    legacy_transition_expires_at: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString(),
  }, staleContext, 'all'), null);

  const blockedContext = emptyContext();
  blockedContext.assetByYoutube.set(youtubeId, staleAsset);
  blockedContext.failedYoutubeIds.add(youtubeId);
  blockedContext.verificationByYoutube.set(youtubeId, {
    video_id: youtubeId,
    verification_status: 'confirmed',
    resolved: false,
    last_verified_at: new Date().toISOString(),
  });
  assert.equal(normalize(outsideLibraryLegacy, blockedContext, 'all'), null,
    'a confirmed block must immediately override the transition snapshot');
});

test('saved collection resolves targets in bounded batches, never per saved row', () => {
  const contextLoader = SERVER.match(
    /async function loadSavedTargetContext[\s\S]*?(?=\nasync function resolveSavedCollectionChunk)/,
  )?.[0] || '';
  const resolver = SERVER.match(
    /async function resolveSavedCollectionChunk[\s\S]*?(?=\nasync function attachSavedReelItems)/,
  )?.[0] || '';
  assert.match(contextLoader, /readAllByValues/);
  assert.match(contextLoader, /source_type/);
  assert.match(contextLoader, /fetchCanonicalGroupRows/);
  assert.match(contextLoader, /aliasesByKey/);
  assert.match(resolver, /savedTargetIds/);
  assert.match(resolver, /representative\?\.id !== saved\.id/);
  assert.doesNotMatch(`${contextLoader}\n${resolver}`, /for \(const saved[^)]*\)[\s\S]*client\.from/);
});
