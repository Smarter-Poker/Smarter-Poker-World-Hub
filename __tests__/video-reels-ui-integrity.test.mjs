import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const REELS_PAGE = read('../pages/hub/reels.js');
const REELS_COMPONENT = read('../src/components/social/Reels.jsx');
const REELS_CAROUSEL = read('../src/components/social/ReelsFeedCarousel.jsx');
const SHARED_COMPOSER = read('../src/components/social/SharedPostCreator.jsx');
const STORIES = read('../src/components/social/Stories.jsx');
const SOCIAL_PAGE = read('../pages/hub/social-media/index.js');
const SOCIAL_FEED_API = read('../pages/api/social/feed.js');
const FEED_CACHE = read('../src/lib/feedCache.js');
const REEL_RECOVERY = read('../src/components/reels/ReelPublicationRecoveryBanner.jsx');

function between(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0, `missing section start: ${start}`);
  assert.ok(to > from, `missing section end: ${end}`);
  return source.slice(from, to);
}

test('every Reel viewer sequences refreshes, appends, and comment loads', () => {
  for (const [name, source] of [
    ['standalone', REELS_PAGE],
    ['library viewer', REELS_COMPONENT],
    ['social carousel', REELS_CAROUSEL],
  ]) {
    assert.match(source, /createLatestRequestGuard/,
      `${name} must use the shared request-generation guard`);
    assert.match(source, /commentRequestGuardRef/,
      `${name} must invalidate comments when the active Reel changes`);
    assert.match(source, /commentRequest\.isCurrent\(\)/,
      `${name} must reject late comment results`);
  }

  for (const [name, source] of [
    ['standalone', REELS_PAGE],
    ['library viewer', REELS_COMPONENT],
  ]) {
    assert.match(source, /begin\(\{\s*append:\s*true\s*\}\)/,
      `${name} must put cursor appends in the same request generation as refreshes`);
  }

  assert.match(
    REELS_PAGE,
    /scope:\s*feedMode === 'following' \? 'following' : 'standalone'[\s\S]{0,200}accessToken:/,
    'following mode must be filtered by the authenticated server reader, not a truncated client window',
  );
});

test('full-screen viewers preserve bounded-scan cursors and expose continuation controls', () => {
  for (const source of [REELS_PAGE, REELS_COMPONENT]) {
    assert.match(source, /scanReelsContinuations/);
    assert.match(source, /Continue Finding Reels/);
    assert.doesNotMatch(
      source,
      /if \((?:allNewVideos|combined|fresh)\.length === 0\) \{\s*setHasMore\(false\)/,
    );
  }
  assert.match(REELS_COMPONENT, /continuationPaused/);
  assert.match(REELS_PAGE, /payload\.next_cursor[\s\S]*setLoadMoreError\('More Reels remain/);
});

test('the upload deep link remains reachable while the feed is loading, empty, or unavailable', () => {
  assert.match(REELS_PAGE, /router\.query\.upload !== '1'/);
  const loadingState = between(REELS_PAGE, 'if (loading) {', 'if (loadError && !reels.length) {');
  const errorState = between(REELS_PAGE, 'if (loadError && !reels.length) {', 'if (!reels.length) {');
  const emptyState = between(REELS_PAGE, 'if (!reels.length) {', 'const videoId =');
  for (const state of [loadingState, errorState, emptyState]) {
    assert.match(state, /\{uploadModal\}/);
  }
});

test('late comment mutations cannot restore a previous Reel over the active drawer', () => {
  for (const [name, source, deleteStart, deleteEnd] of [
    ['standalone', REELS_PAGE, 'const handleDeleteComment = async', 'const handleEditComment'],
    ['library viewer', REELS_COMPONENT, 'const handleDeleteComment = async', 'const handleEditComment'],
    ['social carousel', REELS_CAROUSEL, 'const handleDeleteComment = async', 'const handleEditComment'],
  ]) {
    assert.match(source, /activeCommentReelIdRef\.current\s*=\s*currentReel\?\.id\s*\|\|\s*null/,
      `${name} must synchronously track which Reel owns the comment drawer`);
    const deleteSection = between(source, deleteStart, deleteEnd);
    assert.match(deleteSection, /const reelId = currentReel\.id/,
      `${name} must capture the mutation target before awaiting persistence`);
    assert.match(deleteSection, /activeCommentReelIdRef\.current\s*!==\s*reelId/,
      `${name} must not roll an old comment back into a newly selected Reel`);
  }

  const openSection = between(
    REELS_COMPONENT,
    'const handleOpenComments = async',
    '// #6 Comment Pagination - Load More',
  );
  assert.match(openSection, /if \(!commentRequest\.isCurrent\(\) \|\| activeCommentReelIdRef\.current !== reelId\) return;[\s\S]*commentInputRef\.current\?\.focus/,
    'the library viewer must not focus a drawer invalidated while comments were loading');
});

test('Reel comments target social_reels directly and never manufacture proxy posts', () => {
  const submitSections = [
    between(REELS_PAGE, 'const submitComment = async', 'const handleCommentLike'),
    between(REELS_COMPONENT, 'const handleSubmitComment = async', 'const handleCommentLike'),
    between(REELS_CAROUSEL, 'const handleSubmitComment = async', 'const handleCommentLike'),
  ];

  for (const section of submitSections) {
    assert.doesNotMatch(section, /\.from\(['"]social_posts['"]\)/);
    assert.doesNotMatch(section, /proxy post/i);
    assert.match(section, /\.from\(['"]social_comments['"]\)\.insert\(payload\)/);
  }
});

test('Poker Reel featuring is explicit-public and restricted to one media item', () => {
  assert.match(SHARED_COMPOSER, /isSingleVideoDraft/);
  assert.match(SHARED_COMPOSER, /postVisibility === ['"]public['"]/);
  assert.match(SHARED_COMPOSER, /canFeaturePokerReel/);
  assert.match(SHARED_COMPOSER, /published publicly/i);

  const personalPost = between(SOCIAL_PAGE, 'const handlePost = async', '// ═══ PRIMARY SUCCESS');
  assert.match(personalPost, /pokerContentConfirmed[\s\S]*visibility !== ['"]public['"]/);
  assert.match(personalPost, /urls\.length !== 1/);
  assert.match(personalPost, /p_visibility:\s*['"]public['"]/);
});

test('Story creation remains one atomic write until Story-to-Reel publication is atomic', () => {
  const createSection = between(STORIES, 'const handleCreate = async', '// BUG FIX: mediaPreview');
  assert.match(createSection, /supabase\.rpc\(['"]fn_create_story['"]/);
  assert.doesNotMatch(createSection, /\.from\(['"]social_reels['"]\)/);
  assert.doesNotMatch(
    STORIES,
    /(?:setS|s)aveAsPokerReel|Story and Reel posted|Try again from Reels/,
  );
});

test('an ambiguous generic post RPC result cannot trigger a second direct insert', () => {
  const genericPublication = between(
    SOCIAL_PAGE,
    "supabase.rpc(\n          'fn_create_social_post'",
    '// ═══ PRIMARY SUCCESS',
  );
  assert.doesNotMatch(genericPublication, /\.from\(['"]social_posts['"]\)[\s\S]*\.insert\(/);
  assert.match(genericPublication, /could not be confirmed/i);
});

test('social feed filtering has a hard scan budget and exposes partial continuation', () => {
  assert.match(SOCIAL_FEED_API, /MAX_POST_SCAN_ROWS\s*=\s*[\d_]+/);
  const scan = between(SOCIAL_FEED_API, 'async function readSafePostWindow', 'export default async function handler');
  assert.match(scan, /scanned\s*<\s*MAX_POST_SCAN_ROWS/);
  assert.match(scan, /partial:\s*true/);
  assert.match(SOCIAL_FEED_API, /partial/);
});

test('new and legacy Reel shares resolve through the canonical deep-link route', () => {
  assert.match(REELS_CAROUSEL, /\/hub\/reels\?id=\$\{encodeURIComponent\(currentReel\.id\)\}/);
  assert.doesNotMatch(REELS_CAROUSEL, /\/hub\/social-media\?reel=/);
  assert.match(SOCIAL_PAGE, /router\.query\.reel/);
  assert.match(SOCIAL_PAGE, /\/hub\/reels\?id=/);
});

test('persistent feed and Story caches are viewer-scoped and bounded', () => {
  assert.match(FEED_CACHE, /FEED_CACHE_MAX_POSTS/);
  assert.match(FEED_CACHE, /STORIES_CACHE_MAX_ITEMS/);
  assert.match(FEED_CACHE, /storiesEntryKey\(viewerId\)/);
  assert.match(FEED_CACHE, /storiesLocalStorageKey\(viewerId\)/);
  assert.match(FEED_CACHE, /safePosts\.slice\(0, FEED_CACHE_MAX_POSTS\)/);
  assert.match(FEED_CACHE, /safeStories\.slice\(0, STORIES_CACHE_MAX_ITEMS\)/);
  assert.match(FEED_CACHE, /post\?\.playback_type\s*!==\s*['"]youtube_embed['"]/,
    'mutable YouTube availability and transition decisions must not persist in the social cache');
  assert.doesNotMatch(FEED_CACHE, /idb(?:Set|Delete)\([^;]+\.catch\(\(\)\s*=>\s*\{\s*\}\)/,
    'background IndexedDB writes must explicitly account for persistence failures');
});

test('retired generic upload UI stays unreachable and the mounted Reel recovery is owner-scoped', () => {
  for (const path of [
    '../src/components/social/UploadRecoveryBanner.jsx',
    '../src/components/social/views/SmarterPokerFeedView.jsx',
  ]) {
    assert.equal(existsSync(new URL(path, import.meta.url)), false,
      'main retired these unreachable generic consumers; do not restore an evidence-consuming path');
  }
  assert.doesNotMatch(SOCIAL_PAGE, /import[^;]*(?:UploadRecoveryBanner|SmarterPokerFeedView)/);
  assert.match(SOCIAL_PAGE, /<ReelPublicationRecoveryBanner[\s\S]*?user=\{user\}/);
  assert.match(REEL_RECOVERY, /checkDanglingIntent\(\{\s*userId:\s*scopedOwnerId\s*\}\)/);
  assert.match(REEL_RECOVERY, /committedUpload\.publicationKind\s*===\s*['"]poker_reel['"]/);
  assert.match(REEL_RECOVERY, /committedUpload\.userId\s*===\s*scopedOwnerId/);
  assert.match(REEL_RECOVERY, /ownerToken\.isCurrent\(\)/);
  assert.match(REEL_RECOVERY, /clearDanglingIntent\(\{\s*userId:\s*scopedOwnerId/);
});

// Realtime and focus revalidation (review fix, 23 Sep 2026). social_reels
// publishes every counter bump, the signed-in viewer's own view recording
// included; none of them may reload a viewer or swap its player.
const REALTIME_REFRESH = new URL('../src/lib/reelsRealtimeRefresh.mjs', import.meta.url);
const NO_ACTION = { refresh: false, remove: false };
const MOUNTED_EMBED = Object.freeze({
  id: '11111111-1111-4111-8111-111111111111',
  author_id: '00000000-0000-0000-0000-000000000001',
  video_url: 'https://www.youtube.com/watch?v=abcdefghijk',
  playback_type: 'youtube_embed',
  rights_status: 'embed_only',
  youtube_video_id: 'abcdefghijk',
  source_post_id: null,
  source_asset_id: '22222222-2222-4222-8222-222222222222',
  publication_key: 'video-library:22222222-2222-4222-8222-222222222222',
  canonical_asset_key: 'youtube:abcdefghijk',
  is_public: true,
  topic: 'poker',
});
const RAW_EMBED_ROW = Object.freeze({
  ...MOUNTED_EMBED,
  // The raw row keeps its stored URL form; the feed canonicalises it.
  video_url: 'https://youtu.be/abcdefghijk',
  original_youtube_url: 'https://youtube.com/watch?v=abcdefghijk',
  media_status: 'ready',
  is_deleted: false,
  source_type: 'video_library',
  origin_type: 'video_library',
  view_count: 10,
  like_count: 2,
  comment_count: 0,
  share_count: 0,
  updated_at: '2026-09-23T10:00:00.000Z',
});

test('realtime counter, like and view updates never refresh a Reel viewer', async () => {
  const { createReelRealtimeChangeFilter } = await import(REALTIME_REFRESH);
  const filter = createReelRealtimeChangeFilter();
  // The viewer's own view recording: first sighting of the mounted Reel.
  assert.deepEqual(
    filter.classify({ eventType: 'UPDATE', row: { ...RAW_EMBED_ROW, view_count: 11 }, stateReel: MOUNTED_EMBED }),
    NO_ACTION,
  );
  for (const bump of [
    { view_count: 12 },
    { like_count: 3 },
    { comment_count: 1 },
    { share_count: 4 },
    { updated_at: '2026-09-23T10:05:00.000Z', thumbnail_url: 'https://img.youtube.com/vi/abcdefghijk/0.jpg' },
  ]) {
    assert.deepEqual(
      filter.classify({ eventType: 'UPDATE', row: { ...RAW_EMBED_ROW, ...bump }, stateReel: MOUNTED_EMBED }),
      NO_ACTION,
      `counter-only update ${Object.keys(bump).join(',')} must not refresh`,
    );
  }
  // Other users' activity on Reels this viewer has not mounted.
  const processing = { ...RAW_EMBED_ROW, id: '33333333-3333-4333-8333-333333333333', media_status: 'processing' };
  assert.deepEqual(filter.classify({ eventType: 'UPDATE', row: processing }), NO_ACTION);
  assert.deepEqual(filter.classify({ eventType: 'UPDATE', row: { ...processing, like_count: 9 } }), NO_ACTION);
  const unseenListable = { ...RAW_EMBED_ROW, id: '44444444-4444-4444-8444-444444444444' };
  assert.deepEqual(filter.classify({ eventType: 'UPDATE', row: unseenListable }), { refresh: true, remove: false },
    'a listable row the viewer has never seen may have just become eligible');
  assert.deepEqual(filter.classify({ eventType: 'UPDATE', row: { ...unseenListable, view_count: 50 } }), NO_ACTION,
    'once seen, its counter bumps are ignored');
  // A partial payload is never read as a takedown.
  assert.deepEqual(
    createReelRealtimeChangeFilter().classify({
      eventType: 'UPDATE',
      row: { id: MOUNTED_EMBED.id, view_count: 13 },
      stateReel: MOUNTED_EMBED,
    }),
    NO_ACTION,
  );
});

test('playback-relevant realtime changes schedule a background refresh or fail closed', async () => {
  const { createReelRealtimeChangeFilter } = await import(REALTIME_REFRESH);
  const converted = createReelRealtimeChangeFilter();
  converted.classify({ eventType: 'UPDATE', row: RAW_EMBED_ROW, stateReel: MOUNTED_EMBED });
  assert.deepEqual(
    converted.classify({
      eventType: 'UPDATE',
      row: {
        ...RAW_EMBED_ROW,
        video_url: 'https://example.supabase.co/storage/v1/object/public/videos/converted.mp4',
        playback_type: 'native',
        rights_status: 'owned',
      },
      stateReel: MOUNTED_EMBED,
    }),
    { refresh: true, remove: false },
  );
  assert.deepEqual(
    createReelRealtimeChangeFilter().classify({
      eventType: 'UPDATE',
      row: { ...RAW_EMBED_ROW, youtube_video_id: 'zyxwvutsrqp' },
      stateReel: MOUNTED_EMBED,
    }),
    { refresh: true, remove: false },
    'a first sighting that changes playback identity refreshes',
  );
  for (const takedown of [
    { is_public: false },
    { is_deleted: true },
    { media_status: 'failed' },
    { topic: 'sports' },
    { rights_status: 'blocked' },
  ]) {
    assert.deepEqual(
      createReelRealtimeChangeFilter().classify({
        eventType: 'UPDATE',
        row: { ...RAW_EMBED_ROW, ...takedown },
        stateReel: MOUNTED_EMBED,
      }),
      { refresh: true, remove: true },
      `${Object.keys(takedown)[0]} must remove the mounted Reel`,
    );
  }
  const events = createReelRealtimeChangeFilter();
  assert.deepEqual(
    events.classify({ eventType: 'INSERT', row: { ...RAW_EMBED_ROW, id: '55555555-5555-4555-8555-555555555555' } }),
    { refresh: true, remove: false },
  );
  assert.deepEqual(
    events.classify({ eventType: 'INSERT', row: { ...RAW_EMBED_ROW, id: '66666666-6666-4666-8666-666666666666', media_status: 'processing' } }),
    NO_ACTION,
    'a row that cannot play yet waits for the update that makes it ready',
  );
  assert.deepEqual(
    events.classify({ eventType: 'DELETE', row: { id: MOUNTED_EMBED.id }, stateReel: MOUNTED_EMBED }),
    { refresh: false, remove: true },
  );
});

test('a background merge keeps the active Reel mounted and advances only past an ineligible one', async () => {
  const { mergeBackgroundReels } = await import(REALTIME_REFRESH);
  const reel = (id, extra = {}) => ({
    id,
    video_url: `https://cdn.test/${id}.mp4`,
    canonical_asset_key: `native:${id}`,
    playback_type: 'native',
    ...extra,
  });
  const [a, b, c, d] = ['a', 'b', 'c', 'd'].map(id => reel(id));
  const mounted = [a, b, c];
  const ids = result => result.reels.map(item => item.id).join(',');

  let result = mergeBackgroundReels({
    current: mounted,
    incoming: [{ ...a, like_count: 9 }, { ...b, view_count: 99 }, c],
    activeIndex: 1,
  });
  assert.equal(result.changed, false);
  assert.equal(result.reels, mounted, 'an unchanged refresh keeps the mounted array');
  assert.equal(result.activeIndex, 1);

  result = mergeBackgroundReels({ current: mounted, incoming: [d, a, b, c], activeIndex: 1 });
  assert.equal(ids(result), 'a,b,d,c', 'a new Reel queues behind the active Reel');
  assert.equal(result.activeIndex, 1);
  assert.equal(result.reels[1], b, 'the active Reel keeps its object identity');

  result = mergeBackgroundReels({ current: mounted, incoming: [a], activeIndex: 2 });
  assert.equal(result.changed, false, 'Reels beyond an incomplete window are not dropped');

  result = mergeBackgroundReels({ current: mounted, incoming: [a, c], activeIndex: 1, removeIds: ['b'] });
  assert.equal(ids(result), 'a,c');
  assert.equal(result.activeIndex, 1, 'the next surviving Reel becomes active');
  assert.equal(result.activeRemoved, true);

  result = mergeBackgroundReels({ current: mounted, incoming: [a, b], activeIndex: 2, windowComplete: true });
  assert.equal(ids(result), 'a,b');
  assert.equal(result.activeIndex, 1, 'the last Reel hands back to the previous one');

  result = mergeBackgroundReels({ current: mounted, activeIndex: 2, removeIds: ['a'] });
  assert.equal(ids(result), 'b,c');
  assert.equal(result.reels[result.activeIndex], c, 'removing an earlier Reel keeps the same Reel active');
  assert.equal(result.activeRemoved, false);

  result = mergeBackgroundReels({
    current: mounted,
    incoming: [a, { ...b, video_url: 'https://cdn.test/b-converted.mp4' }, c],
    activeIndex: 1,
  });
  assert.equal(result.activeIndex, 1);
  assert.equal(result.reels[1].video_url, 'https://cdn.test/b-converted.mp4');

  result = mergeBackgroundReels({
    current: mounted,
    incoming: [reel('dup', { canonical_asset_key: 'native:b' }), a, b, c],
    activeIndex: 0,
  });
  assert.equal(result.changed, false, 'a duplicate canonical asset is never added');
});

test('stale mounted Reels are removed only on an authoritative verdict', async () => {
  const { resolveStaleReels, MAX_STALE_REEL_CHECKS } = await import(REALTIME_REFRESH);
  const verdicts = await resolveStaleReels({
    ids: ['live', 'gone', 'offline', 'missing', 'live'],
    fetchDetail: async (id) => {
      if (id === 'live') return [{ id: 'live', video_url: 'https://cdn.test/live.mp4' }];
      if (id === 'gone') throw Object.assign(new Error('Gone'), { status: 410 });
      if (id === 'offline') throw Object.assign(new Error('Unavailable'), { status: 503 });
      return [];
    },
  });
  assert.deepEqual(verdicts.replacements.map(row => row.id), ['live']);
  assert.deepEqual(verdicts.removeIds, ['gone', 'missing']);
  const bounded = await resolveStaleReels({
    ids: Array.from({ length: MAX_STALE_REEL_CHECKS + 4 }, (_, index) => `reel-${index}`),
    fetchDetail: async () => [],
  });
  assert.equal(bounded.checkedIds.length, MAX_STALE_REEL_CHECKS);
  await assert.rejects(
    resolveStaleReels({
      ids: ['aborted'],
      fetchDetail: async () => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }); },
    }),
    { name: 'AbortError' },
  );
});

test('a background refresh queues behind a foreground load and never supersedes it', async () => {
  const { createReelsRefreshCoordinator } = await import(REALTIME_REFRESH);
  const { createLatestRequestGuard } = await import(new URL('../src/lib/latestRequestGuard.mjs', import.meta.url));
  const guard = createLatestRequestGuard();
  const coordinator = createReelsRefreshCoordinator(guard);

  const foreground = coordinator.begin({ background: false });
  assert.equal(coordinator.begin({ background: true }), null, 'queued, not started');
  assert.equal(foreground.isCurrent(), true, 'the foreground load was not aborted');
  assert.deepEqual(coordinator.settle(foreground), { current: true, flushQueued: true });

  const quiet = coordinator.begin({ background: true });
  assert.ok(quiet, 'a settled foreground load no longer blocks a background refresh');
  assert.deepEqual(coordinator.settle(quiet), { current: true, flushQueued: false });

  const inFlight = coordinator.begin({ background: true });
  const retry = coordinator.begin({ background: false });
  assert.equal(inFlight.isCurrent(), false, 'a foreground load supersedes a background refresh');
  assert.deepEqual(coordinator.settle(inFlight), { current: false, flushQueued: false });
  assert.deepEqual(coordinator.settle(retry), { current: true, flushQueued: false });

  const interrupted = coordinator.begin({ background: false });
  guard.abort();
  assert.equal(coordinator.isForegroundPending(), false, 'an account change releases the queue');
  assert.ok(coordinator.begin({ background: true }));
  assert.deepEqual(coordinator.settle(interrupted), { current: false, flushQueued: false });
});

test('Reel viewers route realtime and focus revalidation through the background refresh', () => {
  for (const [name, source] of [['standalone', REELS_PAGE], ['library viewer', REELS_COMPONENT]]) {
    const realtime = between(source, '// Realtime subscription', '.subscribe();');
    assert.doesNotMatch(realtime, /loadReels\s*\(/,
      `${name}: realtime handlers must never call the foreground loader`);
    assert.match(realtime, /realtimeFilter\.classify\(\{ eventType, row, stateReel \}\)/,
      `${name}: every social_reels event is classified before acting`);
    assert.match(realtime, /if \(!verdict\.refresh\) return;[\s\S]*scheduleBackgroundReelsRefresh\(\)/,
      `${name}: only playback-relevant changes schedule a refresh`);
    for (const event of ['INSERT', 'UPDATE', 'DELETE']) {
      assert.match(realtime, new RegExp(`handleReelChange\\('${event}'`), `${name}: ${event} is classified`);
    }

    const focus = between(source, 'const revalidateVisibleFeed = () => {', "window.removeEventListener('focus'");
    assert.doesNotMatch(focus, /loadReels\s*\(/, `${name}: focus must not run a foreground reload`);
    assert.match(focus, /document\.visibilityState === 'visible'\) scheduleBackgroundReelsRefresh\(\)/);

    const scheduler = between(source, 'const scheduleBackgroundReelsRefresh = useCallback(', '}, []);');
    assert.match(scheduler, /clearTimeout\(backgroundReelsRefreshTimerRef\.current\)/);
    assert.match(scheduler, /loadReelsRef\.current\?\.\(BACKGROUND_REELS_REFRESH\)/);
    assert.match(scheduler, /REELS_BACKGROUND_REFRESH_DELAY_MS/);

    const loader = between(source, 'const loadReels = useCallback(async (mode) => {', 'loadReelsRef.current = loadReels;');
    assert.match(loader, /const background = mode === BACKGROUND_REELS_REFRESH;/);
    assert.match(loader, /const reelsRequest = reelsRefreshCoordinatorRef\.current\.begin\(\{ background \}\);\s*if \(!reelsRequest\) return;/,
      `${name}: a background refresh never supersedes an unresolved foreground load`);
    assert.match(loader, /if \(!background\) \{\s*setLoading\(true\);/,
      `${name}: only a foreground load shows the loading console`);
    assert.match(loader, /reelsRefreshCoordinatorRef\.current\.settle\(reelsRequest\)[\s\S]*?if \(settled\.flushQueued\) scheduleBackgroundReelsRefresh\(\);/);
    assert.match(loader, /if \(background\) \{[\s\S]*?mergeBackgroundReels\(\{[\s\S]*?activeIndex: currentIndexRef\.current,/);
    assert.match(loader, /if \(settled\.current && !background\) setLoading\(false\);/);
    assert.match(source, /createReelsRefreshCoordinator\(reelsRequestGuardRef\.current\)/,
      `${name}: background and foreground loads share the one latest-request guard`);
    assert.match(loader, /if \(!reelsRequest\.isCurrent\(\)\) return;\s*if \(background\)/,
      `${name}: the latest-request guard still gates the background merge`);
  }
  assert.match(
    REELS_PAGE,
    /\}, \[activeReelId, activeReelVideoUrl, loading, preferences\.autoplay, preferences\.soundOnScroll, preferencesLoaded\]\);/,
    'the YouTube load effect is keyed on the active Reel, so a merge or appended page cannot restart it',
  );
  assert.match(REELS_PAGE, /if \(deepLinkAppliedRef\.current === router\.query\.id\) return;/,
    'a deep link is applied once, so a later merge cannot pull the viewer back');
});
