import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test-project.supabase.co';

const CLIENT_SOURCE = readFileSync(
  new URL('../src/lib/reelsFeedClient.js', import.meta.url),
  'utf8',
);
const SERVER_SOURCE = readFileSync(
  new URL('../src/lib/server/reelsFeed.js', import.meta.url),
  'utf8',
);
const API_SOURCE = readFileSync(
  new URL('../pages/api/reels/feed.js', import.meta.url),
  'utf8',
);
const REELS_PAGE_SOURCE = readFileSync(
  new URL('../pages/hub/reels.js', import.meta.url),
  'utf8',
);
const HAMBURGER_MENU_SOURCE = readFileSync(
  new URL('../src/config/hamburgerMenus.js', import.meta.url),
  'utf8',
);

const {
  availableReelsPathForQuery,
  buildReelPath,
  categoryForReelsRoute,
  feedModeForReelsRoute,
  fetchPokerReels,
  isPlayablePokerReel,
  isPlayableReel,
  isUnclassifiedNativeCommunityReel,
  normalizeReelsCategory,
  reelCategoryForTopic,
  sanitizeReels,
} = await import(
  `data:text/javascript;base64,${Buffer.from(CLIENT_SOURCE).toString('base64')}`
);

function verifiedYouTubeReel(overrides = {}) {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    author_id: '11111111-1111-4111-8111-111111111111',
    video_url: 'https://www.youtube.com/watch?v=M7lc1UVf-VE',
    youtube_video_id: 'M7lc1UVf-VE',
    canonical_asset_key: 'youtube:M7lc1UVf-VE',
    topic: 'poker',
    media_status: 'ready',
    playback_type: 'youtube_embed',
    rights_status: 'embed_only',
    verification_status: 'resolved',
    last_verified_at: new Date().toISOString(),
    ...overrides,
  };
}

function unclassifiedNativeCommunityReel(overrides = {}) {
  const authorId = '11111111-1111-4111-8111-111111111111';
  return {
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    author_id: authorId,
    video_url: `https://test-project.supabase.co/storage/v1/object/public/social-media/videos/${authorId}/community.mp4`,
    youtube_video_id: null,
    source_asset_id: null,
    source_story_id: null,
    source_post_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    publication_key: null,
    canonical_asset_key: 'native:community',
    topic: 'unknown',
    is_public: true,
    is_deleted: false,
    media_status: 'ready',
    origin_type: 'social_post',
    source_type: 'native',
    playback_type: 'native',
    rights_status: 'user_authorized',
    native_processing_requested: false,
    ...overrides,
  };
}

test('the client keeps category boundaries while For You admits every approved topic', () => {
  const poker = verifiedYouTubeReel();
  const slots = verifiedYouTubeReel({
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    topic: 'slots',
    video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    youtube_video_id: 'dQw4w9WgXcQ',
    canonical_asset_key: 'youtube:dQw4w9WgXcQ',
  });
  const sports = verifiedYouTubeReel({
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    topic: 'sports',
    video_url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
    youtube_video_id: 'aqz-KE-bpKQ',
    canonical_asset_key: 'youtube:aqz-KE-bpKQ',
  });

  assert.equal(isPlayablePokerReel(poker), true);
  assert.equal(isPlayablePokerReel(slots), false);
  assert.equal(isPlayablePokerReel(sports), false);
  assert.equal(isPlayableReel(slots, { category: 'casino-slots' }), true);
  assert.equal(isPlayableReel(slots, { category: 'sports' }), false);
  assert.equal(isPlayableReel(sports, { category: 'sports' }), true);
  assert.deepEqual(
    sanitizeReels([poker, slots, sports], { category: 'for-you' }).map(row => row.id),
    [poker.id, slots.id, sports.id],
  );
  assert.equal(
    sanitizeReels([{ ...sports, topic: 'unknown' }], { category: 'for-you' }).length,
    0,
  );

  const community = unclassifiedNativeCommunityReel();
  assert.equal(isUnclassifiedNativeCommunityReel(community), true);
  assert.equal(isPlayableReel(community, { category: 'for-you' }), true);
  assert.equal(isPlayableReel(community, { category: 'poker' }), false);
  assert.equal(isPlayableReel(community, { category: 'casino-slots' }), false);
  assert.equal(isPlayableReel(community, { category: 'sports' }), false);
  assert.equal(isPlayableReel(community, { category: 'following' }), false);
  assert.equal(
    isPlayableReel(community, { category: 'poker', directId: community.id }),
    true,
    'an exact old Reel bookmark remains a direct-detail exception',
  );
  assert.equal(
    isPlayableReel(community, { category: 'sports', directId: community.source_post_id }),
    true,
    'an exact old source-post bookmark resolves the same canonical detail',
  );
  assert.equal(
    isPlayableReel(community, { category: 'following', directId: community.id }),
    false,
    'Following never admits an unclassified row',
  );
  for (const hostile of [
    { ...community, origin_type: 'horse' },
    { ...community, rights_status: 'unknown' },
    { ...community, source_post_id: null },
    { ...community, publication_key: 'forged' },
    { ...community, youtube_video_id: 'M7lc1UVf-VE' },
    { ...community, is_public: false },
    { ...community, video_url: 'https://attacker.example/community.mp4' },
  ]) {
    assert.equal(isPlayableReel(hostile, { category: 'for-you' }), false);
  }
});

test('canonical Reel links preserve category and old bookmarks can fall back to For You', () => {
  assert.equal(reelCategoryForTopic('cash'), 'poker');
  assert.equal(reelCategoryForTopic('tournament'), 'poker');
  assert.equal(reelCategoryForTopic('slots'), 'casino-slots');
  assert.equal(reelCategoryForTopic('sports'), 'sports');
  assert.equal(reelCategoryForTopic('unknown'), 'for-you');
  assert.equal(
    buildReelPath({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', topic: 'slots' }),
    '/hub/reels?id=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb&category=casino-slots',
  );
  assert.equal(
    buildReelPath({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', topic: 'sports' }),
    '/hub/reels?id=cccccccc-cccc-4ccc-8ccc-cccccccccccc&category=sports',
  );
  assert.equal(
    buildReelPath({ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', topic: 'unknown' }),
    '/hub/reels?id=dddddddd-dddd-4ddd-8ddd-dddddddddddd&category=for-you',
  );
  assert.equal(buildReelPath({ id: 'not-a-uuid', topic: 'sports' }), '/hub/reels');
  assert.match(HAMBURGER_MENU_SOURCE, /'For You', '\/hub\/reels\?category=for-you'/);
  assert.match(HAMBURGER_MENU_SOURCE, /'Poker', '\/hub\/reels\?category=poker'/);
  assert.match(HAMBURGER_MENU_SOURCE, /'Casino And Slots', '\/hub\/reels\?category=casino-slots'/);
  assert.match(HAMBURGER_MENU_SOURCE, /'Sports', '\/hub\/reels\?category=sports'/);
  assert.match(HAMBURGER_MENU_SOURCE, /'Following', '\/hub\/reels\?category=following'/);
  assert.match(HAMBURGER_MENU_SOURCE, /'Trending', '\/hub\/reels\?category=for-you&feed=trending'/);
  const reelId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  assert.equal(categoryForReelsRoute({ id: reelId }), 'for-you');
  assert.equal(categoryForReelsRoute({ id: reelId, feed: 'following' }), 'following');
  assert.equal(feedModeForReelsRoute({ id: reelId, feed: 'following' }), 'following');
  assert.equal(
    availableReelsPathForQuery({ id: reelId, feed: 'following' }),
    '/hub/reels?category=following&feed=following',
  );
  assert.equal(
    availableReelsPathForQuery({ id: reelId, category: 'sports' }),
    '/hub/reels?category=sports',
  );
  assert.equal(
    availableReelsPathForQuery({ id: reelId, category: 'casino-slots', feed: 'following' }),
    '/hub/reels?category=casino-slots',
    'an explicit category cannot be relabeled by a conflicting legacy feed mode',
  );
  assert.equal(
    availableReelsPathForQuery({ id: reelId, category: 'for-you', feed: 'trending' }),
    '/hub/reels?category=for-you&feed=trending',
  );
  assert.match(REELS_PAGE_SOURCE, /router\.replace\(availableReelsPathForQuery\(router\.query\)\)/);
});

test('the social carousel requests For You and filters a hostile mixed response locally', async () => {
  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    requests.push(String(url));
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: [
          verifiedYouTubeReel({ topic: 'sports' }),
          unclassifiedNativeCommunityReel(),
          verifiedYouTubeReel({ id: 'bad', topic: 'unknown' }),
        ],
        next_cursor: 'next-page',
      }),
    };
  };
  try {
    const result = await fetchPokerReels({ scope: 'social-carousel' });
    assert.match(requests[0], /[?&]category=for-you(?:&|$)/);
    assert.doesNotMatch(requests[0], /[?&]scope=/);
    assert.equal(result.category, 'for-you');
    assert.deepEqual(result.data.map(row => row.topic), ['sports', 'unknown']);
    assert.equal(result.next_cursor, 'next-page');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Following is authenticated scope rather than an unguarded public alias', async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl = '';
  globalThis.fetch = async url => {
    requestUrl = String(url);
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: [], next_cursor: null }),
    };
  };
  try {
    await fetchPokerReels({ category: 'following', accessToken: 'test-token' });
    assert.match(requestUrl, /[?&]category=following(?:&|$)/);
    assert.match(requestUrl, /[?&]scope=following(?:&|$)/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('the server owns the allowlist and applies it before pagination', () => {
  assert.match(SERVER_SOURCE, /'casino-slots': Object\.freeze\(\['slots'\]\)/);
  assert.match(SERVER_SOURCE, /sports: Object\.freeze\(\['sports'\]\)/);
  assert.match(SERVER_SOURCE, /'for-you': Object\.freeze\(\['poker', 'cash', 'tournament', 'slots', 'sports'\]\)/);
  assert.match(SERVER_SOURCE, /topic === 'slots'[\s\S]*'Casino And Slots Reel'[\s\S]*topic === 'sports'[\s\S]*'Sports Reel'[\s\S]*topic === 'unknown'[\s\S]*'Community Reel'/);
  assert.match(SERVER_SOURCE, /function normaliseCategory\(value, scope = 'all'\)/);
  assert.match(SERVER_SOURCE, /throw new ReelsFeedInputError\('Invalid Reels category'\)/);
  assert.match(SERVER_SOURCE, /\.in\('topic', candidateTopicsForCategory\([\s\S]*category/);
  assert.match(SERVER_SOURCE, /normalizeEligibleRow[\s\S]*unknownNativeUpload[\s\S]*isUnknownNativeUploadShape/);
  assert.match(SERVER_SOURCE, /allowUnknownNativeUpload: scope !== 'following'/);
  assert.match(API_SOURCE, /if \(category === 'following'\) scope = 'following'/);
  assert.match(API_SOURCE, /category:\s*result\.category/);
  assert.equal(normalizeReelsCategory('not-a-category'), 'poker');
});

test('canonical duplicate lookups retain the requested non-poker category', () => {
  assert.match(
    SERVER_SOURCE,
    /applyPublicReadyFilters\([\s\S]*query,[\s\S]*options\.category/,
    'related canonical rows must use the same category as the candidate page',
  );
  assert.match(
    SERVER_SOURCE,
    /fetchCanonicalGroupRows\(client, candidateRawRows, options\)/,
    'canonical winner selection must forward category options to its related-row lookup',
  );
});
