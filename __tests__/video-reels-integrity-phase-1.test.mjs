import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const TEST_STORAGE_HOST = 'test-project.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${TEST_STORAGE_HOST}`;

const read = path => {
  const url = new URL(path, import.meta.url);
  return existsSync(url) ? readFileSync(url, 'utf8') : '';
};

const MIGRATION_PATH = '../supabase/migrations/20260906235959_video_reels_integrity_foundation.sql';
const MIGRATION = read(MIGRATION_PATH);
const STORAGE_PROOF_MIGRATION = read('../supabase/migrations/20260907000000_video_reels_batch_storage_proof.sql');
const BRIDGE = read('../scripts/video_library_to_reels.py');
const REELS_COMPONENT = read('../src/components/social/Reels.jsx');
const REELS_PAGE = read('../pages/hub/reels.js');
const FEED_CAROUSEL = read('../src/components/social/ReelsFeedCarousel.jsx');
const NEWS_REELS_API = read('../pages/api/news/reels.js');
const REELS_FEED_API = read('../pages/api/reels/feed.js');
const REELS_FEED_SERVER = read('../src/lib/server/reelsFeed.js');
const REELS_CLIENT = read('../src/lib/reelsFeedClient.js');
const VIDEO_CATALOG_API = read('../pages/api/video-library/catalog.js');
const VIDEO_AVAILABILITY = read('../src/lib/videoLibraryAvailability.js');
const FEED_CACHE = read('../src/lib/feedCache.js');
const VIDEO_CLIPPER = read('../src/content-engine/pipeline/VideoClipper.js');
const YOUTUBE_FAILURE_API = read('../pages/api/youtube/report-embed-failure.js');
const YOUTUBE_ERROR_MANAGER = read('../src/hooks/useYouTubeErrorManager.js');
const YOUTUBE_PIPELINE_RECOVERY = read('../pages/api/cron/yt-pipeline-recovery.js');
const SOCIAL_FEED_API = read('../pages/api/social/feed.js');
const SOCIAL_FEED_PAGE = read('../pages/hub/social-media/index.js');
const UPLOAD_REEL_MODAL = read('../src/components/reels/UploadReelModal.jsx');
const USER_REEL_PUBLICATION_RECOVERY = read('../src/lib/userReelPublicationRecovery.mjs');
const STORIES = read('../src/components/social/Stories.jsx');
const SOCIAL_HELPERS = read('../src/lib/socialHelpers.js');
const clientModule = await import(`data:text/javascript;base64,${Buffer.from(REELS_CLIENT).toString('base64')}`);
const {
  canonicalReelKey,
  fetchPokerReels,
  isPlayablePokerReel,
  mergePokerReels,
  retirePokerReelsCache,
  sanitizePokerReels,
} = clientModule;
const feedCacheModule = await import(`data:text/javascript;base64,${Buffer.from(FEED_CACHE).toString('base64')}`);

test('phase-one migration separates provenance, playback, topic, rights, and identity', () => {
  assert.equal(Boolean(MIGRATION), true, `${MIGRATION_PATH} must exist`);
  for (const column of [
    'origin_type',
    'playback_type',
    'topic',
    'rights_status',
    'source_asset_id',
    'canonical_asset_key',
  ]) {
    assert.match(MIGRATION, new RegExp(`ADD COLUMN IF NOT EXISTS ${column}`, 'i'));
  }
  assert.match(MIGRATION, /CREATE UNIQUE INDEX IF NOT EXISTS uq_social_reels_video_library_canonical/i);
});

test('third-party YouTube is embed-only and never enters the native transcode queue', () => {
  assert.match(MIGRATION, /CREATE OR REPLACE FUNCTION (public\.)?fn_social_reels_yt_intercept/i);
  const interceptFunction = MIGRATION.match(
    /CREATE OR REPLACE FUNCTION (?:public\.)?fn_social_reels_yt_intercept\(\)[\s\S]*?\$function\$;/i,
  )?.[0] || '';
  assert.match(interceptFunction, /rights_status[\s\S]*embed_only/i);
  assert.match(interceptFunction, /playback_type[\s\S]*youtube_embed/i);
  assert.match(interceptFunction, /v_service_role[\s\S]*v_native_enabled[\s\S]*native_processing_requested[\s\S]*owned[\s\S]*licensed/i);

  const queueFunction = MIGRATION.match(
    /CREATE OR REPLACE FUNCTION (?:public\.)?fn_social_reels_yt_queue_job\(\)[\s\S]*?\$(?:fn|function)\$;/i,
  )?.[0] || '';
  assert.match(queueFunction, /rights_status[\s\S]*(owned|licensed)/i);
  assert.match(queueFunction, /media_status[\s\S]*queued/i);
  assert.match(MIGRATION, /status\s*=\s*'cancelled'/i);

  const downloadMethod = VIDEO_CLIPPER.match(
    /async downloadVideo\(url, options = \{\}\)[\s\S]*?\n    \}/,
  )?.[0] || '';
  assert.match(downloadMethod, /rightsStatus[\s\S]*owned[\s\S]*licensed[\s\S]*rights_clearance_required/);
  assert.match(VIDEO_CLIPPER, /async processVideo[\s\S]*rights_clearance_required[\s\S]*this\.downloadVideo/);
  assert.match(VIDEO_CLIPPER, /async uploadAndCreateReel[\s\S]*rights_clearance_required[\s\S]*readFileSync/);
  assert.doesNotMatch(VIDEO_CLIPPER, /SUPABASE_SERVICE_ROLE_KEY\s*\|\|/);
  assert.match(VIDEO_CLIPPER, /Reel creation failed[\s\S]*\.remove\(\[storagePath\]\)/);
  assert.match(VIDEO_CLIPPER, /success:\s*results\.length === clips\.length/);
  assert.match(interceptFunction, /v_provenance_yt_id[\s\S]*owned[\s\S]*licensed[\s\S]*canonical_asset_key\s*:=\s*'youtube:'/i);
});

test('legacy recovery cannot revive a YouTube download after rights are absent or revoked', () => {
  assert.match(YOUTUBE_PIPELINE_RECOVERY, /NATIVE_PROCESSING_RIGHTS\s*=\s*\[['"]owned['"],\s*['"]licensed['"]\]/);
  const candidateQuery = YOUTUBE_PIPELINE_RECOVERY.match(
    /const \{ data: candidates[\s\S]*?\.limit\(REQUEUE_CAP\);/,
  )?.[0] || '';
  assert.match(candidateQuery, /\.eq\(['"]source_type['"],\s*['"]youtube['"]\)/);
  assert.match(candidateQuery, /\.in\(['"]rights_status['"],\s*NATIVE_PROCESSING_RIGHTS\)/);
  assert.match(YOUTUBE_PIPELINE_RECOVERY, /\.from\(['"]social_reels['"]\)[\s\S]*?\.in\(['"]rights_status['"],\s*NATIVE_PROCESSING_RIGHTS\)[\s\S]*?\.eq\(['"]native_processing_requested['"],\s*true\)/);
  assert.match(YOUTUBE_PIPELINE_RECOVERY, /isRecoveryCandidateAuthorized\(candidate, reelsById\.get\(candidate\.reel_id\)\)/);
  for (const identityField of [
    'user_id',
    'source_url',
    'origin_type',
    'source_asset_id',
    'canonical_asset_key',
    'original_youtube_url',
    'source_post_id',
  ]) {
    assert.match(YOUTUBE_PIPELINE_RECOVERY, new RegExp(identityField));
  }
  assert.match(YOUTUBE_PIPELINE_RECOVERY, /requeueFailedJobs\(admin, slice, a\)/);
  assert.match(YOUTUBE_PIPELINE_RECOVERY, /async function requeueFailedJobs[\s\S]*?\.update\(\{[\s\S]*?status:\s*['"]queued['"]/);
  assert.match(YOUTUBE_PIPELINE_RECOVERY, /\.eq\(['"]status['"],\s*['"]failed['"]\)/);
  assert.match(YOUTUBE_PIPELINE_RECOVERY, /\.eq\(['"]attempts['"],\s*attempts\)/);
  assert.match(YOUTUBE_PIPELINE_RECOVERY, /liveCanonicalKeys[\s\S]*seenCanonicalKeys/);
  assert.match(YOUTUBE_PIPELINE_RECOVERY, /currentControl = await loadNativeControl\(admin\)/);
  assert.doesNotMatch(YOUTUBE_PIPELINE_RECOVERY, /is_public\s*:/);

  const retryPatterns = YOUTUBE_PIPELINE_RECOVERY.match(
    /const RECOVERABLE_PATTERNS = \[[\s\S]*?\n\];/,
  )?.[0] || '';
  assert.match(retryPatterns, /yt-dlp_exit_/);
  assert.doesNotMatch(retryPatterns, /cookie|sign in|authentication|proof.token|pot.provider/i);
});

test('publication is atomic, kill-switched, race-safe, and service-role only', () => {
  assert.match(MIGRATION, /CREATE TABLE IF NOT EXISTS public\.video_reels_pipeline_controls/i);
  assert.match(MIGRATION, /video_library_reel_publication/i);
  assert.match(MIGRATION, /CREATE OR REPLACE FUNCTION public\.publish_video_library_reel/i);
  assert.match(MIGRATION, /pg_advisory_xact_lock/i);
  assert.match(MIGRATION, /FROM public\.video_library_videos/i);
  assert.match(MIGRATION, /type\s+NOT\s+IN\s*\(\s*'cash'\s*,\s*'tournament'\s*\)/i);
  assert.match(MIGRATION, /INSERT INTO public\.social_posts/i);
  assert.match(MIGRATION, /source_post_id/i);
  assert.match(MIGRATION, /REVOKE ALL ON FUNCTION public\.publish_video_library_reel[\s\S]*FROM PUBLIC/i);
  assert.match(MIGRATION, /GRANT EXECUTE ON FUNCTION public\.publish_video_library_reel[\s\S]*TO service_role/i);
});

test('bridge fails closed without the database-pinned publisher and uses the atomic RPC', () => {
  assert.match(BRIDGE, /video_reels_pipeline_config/);
  assert.match(BRIDGE, /video_library_publisher_profile_id/);
  assert.match(BRIDGE, /raise RuntimeError\([\s\S]*publisher configuration is missing/i);
  assert.doesNotMatch(BRIDGE, /falling back to alphabetical lookup/i);
  assert.match(BRIDGE, /publish_video_library_reel/);
  assert.match(BRIDGE, /_rpc\(/);
  assert.doesNotMatch(BRIDGE, /_insert\(\s*['"]social_reels['"]/);
  assert.match(BRIDGE, /POKER_VIDEO_TYPES\s*=\s*\{\s*['"]cash['"]\s*,\s*['"]tournament['"]\s*\}/);
  assert.match(BRIDGE, /verify_youtube_video_scrapling\(vid_id\)/);
});

test('all public reel surfaces request canonical fields and exclude unsafe or off-topic rows', () => {
  for (const [name, source] of [
    ['Reels component', REELS_COMPONENT],
    ['Reels page', REELS_PAGE],
    ['feed carousel', FEED_CAROUSEL],
  ]) {
    assert.match(source, /fetchPokerReels/, `${name} must use the canonical feed client`);
  }
  assert.match(NEWS_REELS_API, /readPokerReelsFeed/);
  assert.match(REELS_FEED_API, /readPokerReelsFeed/);
  for (const field of ['origin_type', 'canonical_asset_key', 'media_status', 'topic', 'rights_status']) {
    assert.match(REELS_FEED_SERVER, new RegExp(field), `server feed must enforce ${field}`);
  }
});

test('hostile stale payloads are rejected and canonical duplicates remain singular', () => {
  const base = {
    id: 'reel-a',
    author_id: '11111111-1111-4111-8111-111111111111',
    video_url: 'https://www.youtube.com/watch?v=M7lc1UVf-VE',
    youtube_video_id: 'M7lc1UVf-VE',
    canonical_asset_key: 'youtube:M7lc1UVf-VE',
    topic: 'poker',
    media_status: 'ready',
    playback_type: 'youtube_embed',
    rights_status: 'embed_only',
    availability_status: 'verified',
    embeddable: true,
    availability_checked_at: new Date().toISOString(),
  };
  assert.equal(isPlayablePokerReel(base), true);
  assert.equal(isPlayablePokerReel({ ...base, id: 'slot', topic: 'slots' }), false);
  assert.equal(isPlayablePokerReel({ ...base, id: 'sport', topic: 'sports' }), false);
  assert.equal(isPlayablePokerReel({ ...base, id: 'blocked', rights_status: 'blocked' }), false);
  assert.equal(isPlayablePokerReel({ ...base, id: 'restricted', rights_status: 'restricted' }), false);
  assert.equal(isPlayablePokerReel({ ...base, id: 'queued', media_status: 'queued' }), false);
  assert.equal(isPlayablePokerReel({ ...base, id: 'webpage', playback_type: 'external_embed' }), false);
  assert.equal(isPlayablePokerReel({
    ...base,
    id: 'forged-youtube-companion',
    video_url: 'https://example.com/not-youtube.mp4',
  }), false);
  assert.equal(isPlayablePokerReel({
    ...base,
    id: 'query-string-host-spoof',
    video_url: 'https://attacker.example/payload.mp4?v=M7lc1UVf-VE',
  }), false);
  assert.equal(isPlayablePokerReel({
    ...base,
    id: 'path-host-spoof',
    video_url: 'https://evil.example/youtube.com/watch?v=M7lc1UVf-VE',
  }), false);
  assert.equal(isPlayablePokerReel({
    ...base,
    id: 'youtube-subdomain-spoof',
    video_url: 'https://attacker.youtube.com/watch?v=M7lc1UVf-VE',
  }), false);
  assert.equal(isPlayablePokerReel({
    ...base,
    id: 'mismatched-youtube-companion',
    video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  }), false);
  assert.equal(isPlayablePokerReel({
    ...base,
    id: 'native-without-rights',
    video_url: `https://${TEST_STORAGE_HOST}/storage/v1/object/public/reels/demo.mp4`,
    youtube_video_id: null,
    canonical_asset_key: `url:https://${TEST_STORAGE_HOST}/storage/v1/object/public/reels/demo.mp4`,
    playback_type: 'native',
    rights_status: 'unknown',
  }), false);
  assert.equal(isPlayablePokerReel({
    ...base,
    id: 'owned-native-rendition',
    video_url: `https://${TEST_STORAGE_HOST}/storage/v1/object/public/social-media/reels/11111111-1111-4111-8111-111111111111/clip.mp4`,
    playback_type: 'native',
    rights_status: 'owned',
  }), true);
  assert.equal(isPlayablePokerReel({
    ...base,
    id: 'user-native-borrowed-youtube-id',
    video_url: `https://${TEST_STORAGE_HOST}/storage/v1/object/public/social-media/reels/11111111-1111-4111-8111-111111111111/clip.mp4`,
    playback_type: 'native',
    rights_status: 'user_authorized',
  }), false);
  assert.equal(isPlayablePokerReel({
    ...base,
    id: 'host-spoof',
    video_url: 'https://attacker.supabase.co/storage/v1/object/public/social-media/reels/11111111-1111-4111-8111-111111111111/clip.mp4',
    youtube_video_id: null,
    canonical_asset_key: 'native:spoof',
    playback_type: 'native',
    rights_status: 'owned',
  }), false);
  assert.equal(isPlayablePokerReel({
    ...base,
    id: 'cross-author-storage-spoof',
    author_id: '22222222-2222-4222-8222-222222222222',
    video_url: `https://${TEST_STORAGE_HOST}/storage/v1/object/public/social-media/reels/11111111-1111-4111-8111-111111111111/clip.mp4`,
    youtube_video_id: null,
    canonical_asset_key: 'native:cross-author',
    playback_type: 'native',
    rights_status: 'user_authorized',
  }), false);
  assert.equal(isPlayablePokerReel({
    ...base,
    id: 'non-native-canonical',
    video_url: `https://${TEST_STORAGE_HOST}/storage/v1/object/public/social-media/reels/11111111-1111-4111-8111-111111111111/clip.mp4`,
    youtube_video_id: null,
    canonical_asset_key: 'external:spoof',
    playback_type: 'native',
    rights_status: 'user_authorized',
  }), false);
  assert.equal(isPlayablePokerReel({
    ...base,
    id: 'nested-native-path',
    video_url: `https://${TEST_STORAGE_HOST}/storage/v1/object/public/social-media/reels/11111111-1111-4111-8111-111111111111/nested/clip.mp4`,
    youtube_video_id: null,
    canonical_asset_key: 'native:nested',
    playback_type: 'native',
    rights_status: 'user_authorized',
  }), false);
  assert.equal(canonicalReelKey(base), 'youtube:M7lc1UVf-VE');

  const rows = sanitizePokerReels([
    base,
    { ...base, id: 'same-video', video_url: 'https://youtu.be/M7lc1UVf-VE' },
    { ...base, id: 'slot', topic: 'slots', canonical_asset_key: 'youtube:slot0000000' },
  ]);
  assert.deepEqual(rows.map(row => row.id), ['reel-a']);
  assert.deepEqual(mergePokerReels([base], [{ ...base, id: 'duplicate' }]).map(row => row.id), ['reel-a']);
});

test('legacy transition evidence is accepted only from the live server response and cannot be forged or extended', async () => {
  const now = Date.now();
  const transitionExpiry = new Date(now + 60 * 60 * 1000).toISOString();
  const staleLegacy = {
    id: 'legacy-transition-row',
    author_id: '11111111-1111-4111-8111-111111111111',
    video_url: 'https://www.youtube.com/watch?v=M7lc1UVf-VE',
    youtube_video_id: 'M7lc1UVf-VE',
    canonical_asset_key: 'youtube:M7lc1UVf-VE',
    topic: 'poker',
    media_status: 'ready',
    playback_type: 'youtube_embed',
    rights_status: 'embed_only',
    availability_status: null,
    embeddable: null,
    availability_checked_at: '2020-01-01T00:00:00.000Z',
    verification_status: null,
    last_verified_at: null,
    origin_type: 'video_library',
    source_type: 'video_library',
    source_asset_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    publication_key: 'video-library:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    legacy_transition_eligible: true,
    legacy_transition_expires_at: transitionExpiry,
  };

  assert.equal(
    isPlayablePokerReel(staleLegacy),
    false,
    'a local/stale object cannot self-assert the database-computed transition flag',
  );

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ success: true, data: [staleLegacy], next_cursor: null }),
  });
  try {
    const payload = await fetchPokerReels();
    assert.deepEqual(payload.data.map(row => row.id), ['legacy-transition-row']);
    const trusted = payload.data[0];
    assert.equal(isPlayablePokerReel({ ...trusted }), true,
      'normal UI decoration may clone a server-verified row without losing its bounded evidence');
    assert.equal(isPlayablePokerReel({
      ...trusted,
      legacy_transition_expires_at: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
    }), false, 'client state cannot extend a server-recorded expiry');
    assert.equal(isPlayablePokerReel({ ...trusted, legacy_transition_eligible: 'true' }), false,
      'truthy strings are not transition evidence');
    assert.equal(isPlayablePokerReel({ ...trusted, rights_status: 'blocked' }), false,
      'a block still wins over valid transition evidence');
  } finally {
    globalThis.fetch = originalFetch;
  }

  for (const [id, expiry] of [
    ['expired-transition', new Date(now - 1_000).toISOString()],
    ['overlong-transition', new Date(now + (8 * 24 * 60 * 60 * 1000)).toISOString()],
  ]) {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: [{ ...staleLegacy, id, legacy_transition_expires_at: expiry }],
      }),
    });
    try {
      const payload = await fetchPokerReels();
      assert.deepEqual(payload.data, [], `${id} must fail closed`);
    } finally {
      globalThis.fetch = originalFetch;
    }
  }

  assert.match(REELS_FEED_SERVER, /legacy_transition_eligible/);
  assert.match(REELS_FEED_SERVER, /legacy_transition_expires_at/);
  assert.match(REELS_FEED_SERVER, /LEGACY_TRANSITION_MAX_REMAINING_MS/);
  assert.match(SOCIAL_FEED_API, /legacy_transition_eligible/);
  assert.match(SOCIAL_FEED_API, /legacy_transition_expires_at/);
});

test('the Video Library viewer requests the managed-library-only server scope', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  globalThis.fetch = async url => {
    requestedUrl = String(url);
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: [], next_cursor: null }),
    };
  };
  try {
    await fetchPokerReels({ scope: 'library-viewer' });
    assert.match(requestedUrl, /[?&]scope=library(?:&|$)/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('malformed and old localStorage Reel caches are retired and never hydrated', () => {
  const values = new Map([
    ['sp:reels:poker:v1:broken', '{definitely-not-json'],
    ['sp:reels:poker:v1:old', JSON.stringify({ version: 0, rows: [{ topic: 'slots' }] })],
    ['unrelated', 'preserved'],
  ]);
  const removed = [];
  globalThis.window = {
    localStorage: {
      get length() { return values.size; },
      key: index => [...values.keys()][index] ?? null,
      removeItem: key => { removed.push(key); values.delete(key); },
    },
  };
  try {
    retirePokerReelsCache();
    assert.deepEqual(removed.sort(), ['sp:reels:poker:v1:broken', 'sp:reels:poker:v1:old']);
    assert.equal(values.get('unrelated'), 'preserved');
  } finally {
    delete globalThis.window;
  }
});

test('social feed caches are viewer-scoped and never persist interaction truth', async () => {
  const values = new Map();
  globalThis.localStorage = {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
  const viewerA = '11111111-1111-4111-8111-111111111111';
  const viewerB = '22222222-2222-4222-8222-222222222222';
  try {
    await feedCacheModule.feedCache.setPosts([
      { id: 'community', isLiked: true, isBookmarked: true, reactions: ['love'] },
      { id: 'managed', origin_type: 'video_library', isLiked: true },
    ], viewerA);
    const ownCache = await feedCacheModule.feedCache.getPosts(viewerA);
    const otherCache = await feedCacheModule.feedCache.getPosts(viewerB);
    assert.deepEqual(ownCache.posts.map(post => post.id), ['community']);
    assert.equal(ownCache.posts[0].isLiked, false);
    assert.equal(ownCache.posts[0].isBookmarked, false);
    assert.equal(ownCache.posts[0]._interactionStateVerified, false);
    assert.equal(otherCache, null);
    assert.equal(values.has(`sp-feed-cache:${viewerA}`), true);
    assert.equal(values.has(`sp-feed-cache:${viewerB}`), false);

    await feedCacheModule.feedCache.setStories(
      Array.from({ length: 75 }, (_, index) => ({ id: `story-${index}` })),
      viewerA,
    );
    const ownStories = await feedCacheModule.feedCache.getStories(viewerA);
    const otherStories = await feedCacheModule.feedCache.getStories(viewerB);
    assert.equal(ownStories.length, 50);
    assert.equal(otherStories, null);
    assert.equal(values.has(`sp-stories-cache:${viewerA}`), true);
    assert.equal(values.has(`sp-stories-cache:${viewerB}`), false);
  } finally {
    delete globalThis.localStorage;
  }
});

test('clients abort stale requests, refuse cache seeding, revalidate on focus, and resolve old post IDs server-side', () => {
  for (const source of [REELS_COMPONENT, REELS_PAGE, FEED_CAROUSEL]) {
    assert.match(source, /createLatestRequestGuard/);
    assert.doesNotMatch(source, /readPokerReelsCache/);
    assert.match(source, /reelsRequest\.isCurrent\(\)/);
    assert.match(source, /visibilitychange/);
  }
  assert.match(REELS_PAGE, /id:\s*initialId/);
  assert.match(REELS_PAGE, /router\.query\.id/);
  assert.match(REELS_PAGE, /initialId && \[400, 404, 410\]\.includes\(e\?\.status\)/);
  assert.match(REELS_PAGE, /Video Unavailable/);
  assert.match(REELS_PAGE, /Browse Available Reels/);
  assert.match(REELS_FEED_SERVER, /source_post_id/);
  assert.match(REELS_FEED_SERVER, /canonical_asset_key/);
  assert.match(REELS_PAGE, /!loadMoreError/);
  assert.match(REELS_PAGE, /Retry More Reels/);
});

test('Following Reels use authenticated, bounded candidate checks with keyset continuation', () => {
  assert.match(REELS_FEED_API, /getServerUserWithFallback/);
  assert.match(REELS_FEED_API, /scope === 'following'/);
  assert.match(REELS_FEED_API, /viewerId/);
  assert.match(REELS_FEED_API, /Authentication required/);
  assert.match(REELS_FEED_SERVER, /readFollowedCandidateAuthorIds/);
  assert.match(REELS_FEED_SERVER, /\.in\('following_id', authorChunk\)/);
  assert.match(REELS_FEED_SERVER, /followedWinnerAuthors\.has\(winner\.author_id\)/);
  assert.match(REELS_FEED_SERVER, /scanCursor = lastScannedCursor/);
  assert.doesNotMatch(REELS_FEED_SERVER, /MAX_FOLLOWING_AUTHORS/);
  assert.doesNotMatch(REELS_FEED_SERVER, /\.in\('author_id', authorChunk\)/);
  assert.match(REELS_CLIENT, /scope === 'following'[\s\S]*params\.set\('scope', 'following'\)/);
  assert.match(REELS_CLIENT, /Authorization:\s*`Bearer \$\{accessToken\}`/);
  assert.match(REELS_PAGE, /scope:\s*feedMode === 'following' \? 'following' : 'standalone'/);
  assert.doesNotMatch(
    REELS_PAGE,
    /deduped\s*=\s*deduped\.filter\(reel => followedIds\.has/,
    'Following must not filter only the first global client window',
  );
});

test('embed failure reports are authenticated telemetry until server verification confirms them', () => {
  assert.match(YOUTUBE_FAILURE_API, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(YOUTUBE_FAILURE_API, /\|\|\s*process\.env\.NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  assert.match(YOUTUBE_FAILURE_API, /getServerUserWithFallback/);
  assert.match(YOUTUBE_FAILURE_API, /\^\[A-Za-z0-9_-\]\{11\}\$/);
  assert.match(YOUTUBE_FAILURE_API, /100[\s\S]*101[\s\S]*150/);
  assert.doesNotMatch(YOUTUBE_FAILURE_API, /KNOWN_CODES\s*=\s*\[2,\s*5/);
  assert.match(YOUTUBE_FAILURE_API, /record_youtube_embed_failure_report/);
  assert.match(YOUTUBE_FAILURE_API, /video_library_videos/);
  assert.match(YOUTUBE_FAILURE_API, /social_reels/);
  assert.doesNotMatch(YOUTUBE_FAILURE_API, /\.from\(['"]youtube_embed_failures['"]\)[\s\S]*\.upsert\(/);
  assert.match(YOUTUBE_ERROR_MANAGER, /getAccessToken/);
  assert.match(YOUTUBE_ERROR_MANAGER, /Authorization:\s*`Bearer \$\{accessToken\}`/);
  assert.match(MIGRATION, /verification_status[\s\S]*pending[\s\S]*confirmed/i);
  assert.match(MIGRATION, /record_youtube_embed_failure_report/i);
  assert.match(MIGRATION, /record_youtube_embed_failure_verdict/i);
});

test('the main social feed fail-closes every unsafe video without breaking filtered pagination', () => {
  assert.doesNotMatch(SOCIAL_FEED_API, /SUPABASE_SERVICE_ROLE_KEY\s*\|\|/);
  for (const field of [
    'origin_type',
    'playback_type',
    'topic',
    'rights_status',
    'source_asset_id',
    'canonical_asset_key',
    'publication_key',
  ]) {
    assert.match(SOCIAL_FEED_API, new RegExp(field));
  }
  assert.match(SOCIAL_FEED_API, /audience_mode/);
  assert.match(SOCIAL_FEED_API, /audience_list/);
  assert.match(SOCIAL_FEED_API, /if \(!isPublicAudiencePost\(post\)\) continue/);
  assert.match(
    SOCIAL_FEED_API,
    /post\.audience_mode[\s\S]*post\.visibility !== 'public'[\s\S]*effectiveAudience === 'public'/,
  );
  assert.match(SOCIAL_FEED_API, /availability_status/);
  assert.match(SOCIAL_FEED_API, /availability_checked_at/);
  assert.match(
    SOCIAL_FEED_API,
    /!legacyTransitionEligible\s*&&\s*\(asset\.availability_status !== 'verified' \|\| asset\.embeddable !== true\)/,
    'the social feed must honor the same bounded server transition as the canonical Reel feed',
  );
  assert.match(SOCIAL_FEED_API, /if \(legacyTransitionEligible\) return true;/);
  assert.match(SOCIAL_FEED_API, /playbackYoutubeId\s*!==\s*youtubeId/);
  assert.match(SOCIAL_FEED_API, /if \(!managed\) return true/);
  assert.match(SOCIAL_FEED_API, /isTrustedNativeUrl\(playbackUrl, post\?\.author_id\)/);
  assert.match(SOCIAL_FEED_API, /fn_filter_valid_user_video_storage_urls/);
  assert.match(SOCIAL_FEED_API, /context\.verifiedNativeObjects\?\.has\(nativeKey\)/);
  assert.match(REELS_FEED_SERVER, /fn_filter_valid_user_video_storage_urls/);
  assert.match(REELS_FEED_SERVER, /context\.verifiedNativeObjects\?\.has\(nativeKey\)/);
  assert.match(STORAGE_PROOF_MIGRATION, /fn_is_user_video_storage_url/);
  assert.match(STORAGE_PROOF_MIGRATION, /archived|delete-marker/i);
  assert.match(STORAGE_PROOF_MIGRATION, /REVOKE ALL[\s\S]*PUBLIC, anon, authenticated/);
  assert.match(STORAGE_PROOF_MIGRATION, /GRANT EXECUTE[\s\S]*service_role/);
  assert.match(SOCIAL_FEED_API, /Generic\/external embeds fail closed/);
  assert.match(SOCIAL_FEED_API, /https:\/\/www\.youtube\.com\/watch\?v=/);
  assert.match(SOCIAL_FEED_API, /row\.verification_status === 'confirmed' && row\.resolved === false/);
  assert.match(SOCIAL_FEED_API, /nextOffset/);
  assert.match(SOCIAL_FEED_PAGE, /nextOffset/);
  assert.match(
    SOCIAL_FEED_PAGE,
    /partial === true && hasMore === true && rawContinuation > offset[\s\S]*loadFeedRef\.current\?\.\(rawContinuation, append\)/,
  );
  assert.match(
    SOCIAL_FEED_PAGE,
    /A network drop invalidates the whole authorization-bearing snapshot[\s\S]*setPosts\(\[\]\)/,
    'a mid-flight failure must purge the entire snapshot awaiting renewed authorization proof',
  );
  assert.match(SOCIAL_FEED_PAGE, /await feedCache\.invalidatePosts\(authUser\?\.id \|\| null\)/);
  assert.doesNotMatch(SOCIAL_FEED_PAGE, /feedCache\.(?:getPosts|setPosts)\(/,
    'authorization-bearing feed rows must never render from persistent cache');
  assert.match(
    SOCIAL_FEED_PAGE,
    /updatedPost\.content_type === 'video'[\s\S]*loadFeedRef\.current\?\.\(0, false\)/,
    'Realtime video mutations must be re-read through the canonical service gate',
  );
  assert.match(SOCIAL_FEED_API, /no-store/);
  for (const source of [SOCIAL_FEED_API, REELS_FEED_SERVER, REELS_CLIENT]) {
    assert.doesNotMatch(source, /endsWith\(['"]\.youtube(?:-nocookie)?\.com['"]\)/);
    assert.match(source, /music\.youtube\.com/);
  }
});

test('every user-video insertion declares safe poker-native provenance and authorization', () => {
  assert.match(UPLOAD_REEL_MODAL, /import \{[\s\S]*retryUserReelPublication[\s\S]*\} from ['"]\.\.\/\.\.\/lib\/userReelPublicationRecovery\.mjs['"]/);
  assert.match(UPLOAD_REEL_MODAL, /await retryUserReelPublication\(\{/);
  assert.match(USER_REEL_PUBLICATION_RECOVERY, /supabase\.rpc\(['"]publish_user_video_reel['"]/);
  assert.match(USER_REEL_PUBLICATION_RECOVERY, /p_topic_confirmed:\s*true/);
  assert.doesNotMatch(UPLOAD_REEL_MODAL, /\.from\(['"]social_reels['"]\)[\s\S]{0,120}\.insert\(/);
  assert.match(SOCIAL_FEED_PAGE, /buildUserVideoProvenance/,
    'the social page must use the shared provenance contract');
  assert.match(SOCIAL_FEED_PAGE, /poker/,
    'the social page must require explicit poker confirmation');
  assert.doesNotMatch(STORIES, /buildUserVideoProvenance|(?:setS|s)aveAsPokerReel/,
    'Stories must remain a single-write feature until Story-to-Reel publication is atomic');
  assert.match(SOCIAL_HELPERS, /origin_type/);
  assert.match(SOCIAL_HELPERS, /playback_type[\s\S]*native/);
  assert.match(SOCIAL_HELPERS, /rights_status[\s\S]*user_authorized/);
  assert.match(SOCIAL_HELPERS, /canonical_asset_key/);
  assert.match(SOCIAL_HELPERS, /confirmedTopic[\s\S]*unknown/);
  assert.match(MIGRATION, /CREATE OR REPLACE FUNCTION public\.publish_user_video_reel/);
  assert.match(MIGRATION, /auth\.uid\(\)/);
  assert.match(MIGRATION, /JOIN storage\.objects/i);
  assert.match(MIGRATION, /parsed_object\.bucket_id\s*=\s*'social-media'/i);
  assert.equal(
    MIGRATION.includes("('^reels/' || p_author_id::text || '/[^/]+$')"),
    true,
    'the storage proof must require exactly one file below reels/<owner>/',
  );
  assert.match(SOCIAL_FEED_PAGE, /publish_user_video_reel/);
  assert.doesNotMatch(SOCIAL_FEED_PAGE, /\.from\(['"]social_reels['"]\)[\s\S]{0,120}\.insert\(/);
});

test('migration preserves legacy links while backfilling the new contract', () => {
  assert.match(MIGRATION, /UPDATE public\.social_reels/i);
  assert.match(MIGRATION, /source_type\s*=\s*'video_library'/i);
  assert.match(MIGRATION, /canonical_asset_key/i);
  assert.doesNotMatch(MIGRATION, /DELETE\s+FROM\s+public\.social_reels/i);
  assert.doesNotMatch(MIGRATION, /DROP\s+COLUMN/i);
});

test('the Video Library itself fails closed on stale or ineligible availability', () => {
  assert.match(VIDEO_CATALOG_API, /availability_status/);
  assert.match(VIDEO_CATALOG_API, /video_library_public_catalog/);
  assert.match(MIGRATION, /CREATE OR REPLACE VIEW public\.video_library_public_catalog[\s\S]*fn_is_video_library_asset_eligible/i);
  assert.doesNotMatch(VIDEO_CATALOG_API, /from\(['"]youtube_embed_failures['"]\)/);
  assert.match(VIDEO_CATALOG_API, /nextOffset\s*=\s*offset\s*\+\s*rawRowCount/);
  assert.match(VIDEO_CATALOG_API, /availability_checked_at/);
  assert.match(MIGRATION, /youtube_embed_failures[\s\S]*verification_status\s*=\s*'confirmed'/);
  assert.doesNotMatch(VIDEO_CATALOG_API, /SUPABASE_SERVICE_ROLE_KEY\s*\|\|/);
  assert.match(VIDEO_AVAILABILITY, /availabilityStatus/);
  assert.match(VIDEO_AVAILABILITY, /embeddable/);
});
