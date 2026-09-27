import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test-project.supabase.co';

const {
  canonicalReelKey,
  isUnclassifiedNativeCommunityReel,
} = await import('../src/lib/reelsFeedClient.js');
import {
  buildSocialFeedSequence,
  SOCIAL_FEED_REELS_KEY,
} from '../src/lib/socialFeedSequence.mjs';

const source = readFileSync(
  new URL('../src/components/social/ReelsFeedCarousel.jsx', import.meta.url),
  'utf8'
);
const socialPage = readFileSync(
  new URL('../pages/hub/social-media/index.js', import.meta.url),
  'utf8'
);

function between(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0, `missing section start: ${start}`);
  assert.ok(to > from, `missing section end: ${end}`);
  return source.slice(from, to);
}

function loadPureContinuationHelpers() {
  const helperSource = between(
    'function mergeCarouselReels',
    '// Individual Reel Card in the carousel'
  );
  return Function(
    'canonicalReelKey',
    `${helperSource}\nreturn { canonicalSupersededReelIds, mergeCarouselReels, readContinuationState };`
  )(canonicalReelKey);
}

function loadRealtimeCategoryHelper() {
  const helperSource = between(
    'const SOCIAL_REEL_CATEGORY_TOPICS',
    'function mergeCarouselReels'
  );
  return Function(
    'isUnclassifiedNativeCommunityReel',
    `${helperSource}\nreturn realtimeRowForCategory;`,
  )(isUnclassifiedNativeCommunityReel);
}

test('cursor metadata and merged Reel identity behave deterministically', () => {
  const { mergeCarouselReels, readContinuationState } = loadPureContinuationHelpers();
  const current = [
    { id: 'active', created_at: '2026-09-25T00:00:00.000Z', caption: 'Old' },
    { id: 'older', created_at: '2026-09-24T00:00:00.000Z' },
  ];
  const merged = mergeCarouselReels(current, [
    { id: 'new', created_at: '2026-09-26T00:00:00.000Z' },
    { id: 'active', created_at: '2026-09-25T00:00:00.000Z', caption: 'Fresh' },
  ]);

  assert.deepEqual(merged.map((reel) => reel.id), ['new', 'active', 'older']);
  assert.equal(merged.find((reel) => reel.id === 'active').caption, 'Fresh');
  assert.deepEqual(
    mergeCarouselReels(
      [{ id: 'aaaaaaaa', created_at: '2026-09-26T00:00:00.000Z' }],
      [{ id: 'bbbbbbbb', created_at: '2026-09-26T00:00:00.000Z' }]
    ).map((reel) => reel.id),
    ['bbbbbbbb', 'aaaaaaaa'],
    'equal timestamps retain the server cursor tie-break order'
  );
  assert.deepEqual(readContinuationState({ next_cursor: 'cursor-2', has_more: true }), {
    nextCursor: 'cursor-2',
    hasMore: true,
  });
  assert.deepEqual(readContinuationState({ next_cursor: null, has_more: true }), {
    nextCursor: null,
    hasMore: false,
  });
});

test('category realtime adaptation rejects explicit cross-category topic changes', () => {
  const realtimeRowForCategory = loadRealtimeCategoryHelper();

  assert.equal(realtimeRowForCategory({ topic: 'slots' }, 'casino-slots').topic, 'poker');
  assert.equal(
    realtimeRowForCategory({ topic: 'poker' }, 'casino-slots').topic,
    '__category_ineligible__'
  );
  assert.equal(
    realtimeRowForCategory({ topic: 'poker' }, 'sports').topic,
    '__category_ineligible__'
  );
  const ownerId = '11111111-1111-4111-8111-111111111111';
  const community = {
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    author_id: ownerId,
    video_url: `https://test-project.supabase.co/storage/v1/object/public/social-media/videos/${ownerId}/community.mp4`,
    source_post_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    source_asset_id: null,
    source_story_id: null,
    publication_key: null,
    canonical_asset_key: 'native:community',
    youtube_video_id: null,
    is_public: true,
    is_deleted: false,
    media_status: 'ready',
    origin_type: 'social_post',
    source_type: 'native',
    playback_type: 'native',
    rights_status: 'user_authorized',
    native_processing_requested: false,
    topic: 'unknown',
  };
  assert.equal(realtimeRowForCategory(community, 'for-you').topic, 'poker');
  assert.equal(
    realtimeRowForCategory(community, 'poker').topic,
    '__category_ineligible__',
  );
  assert.equal(
    realtimeRowForCategory({ ...community, rights_status: 'unknown' }, 'for-you').topic,
    '__category_ineligible__',
  );
  const partialCounter = { id: 'slot-1', view_count: 3 };
  assert.equal(realtimeRowForCategory(partialCounter, 'casino-slots'), partialCounter);
});

test('a refreshed canonical winner evicts a mounted loser with a different id', () => {
  const { canonicalSupersededReelIds } = loadPureContinuationHelpers();
  const mounted = [
    { id: 'old-winner', canonical_asset_key: 'youtube:abcdefghijk' },
    { id: 'stable', canonical_asset_key: 'native:stable' },
  ];

  assert.deepEqual(
    canonicalSupersededReelIds(mounted, [
      { id: 'new-winner', canonical_asset_key: 'youtube:abcdefghijk' },
      mounted[1],
    ]),
    ['old-winner']
  );
  assert.deepEqual(canonicalSupersededReelIds(mounted, mounted), []);
});

test('the Social Media viewer requests the next cursor within three loaded Reels', () => {
  const viewer = between('function ReelViewer(', '// Main Reels Feed Carousel component');
  const continuation = between('const loadMoreReels = useCallback', 'const requestNearEndContinuation');

  assert.match(source, /const REELS_NEAR_END_THRESHOLD = 3/);
  assert.match(
    viewer,
    /remainingLoadedReels <= REELS_NEAR_END_THRESHOLD[\s\S]*onNearEnd\?\.\(\)/
  );
  assert.match(continuation, /fetchPokerReels\(\{[\s\S]*cursor: pageCursor/);
  assert.match(continuation, /reelsCursorRef\.current = nextCursor/);
  assert.match(continuation, /setHasMore\(pageHasMore\)/);
});

test('continuation appends are sequenced and never erase the mounted window on failure', () => {
  const continuation = between('const loadMoreReels = useCallback', 'const requestNearEndContinuation');

  assert.match(continuation, /begin\(\{ append: true \}\)/);
  assert.match(continuation, /signal: reelsRequest\.signal/);
  assert.match(continuation, /if \(!reelsRequest\.isCurrent\(\)\) return/);
  assert.match(continuation, /reelsRequest\.finish\(\)/);
  assert.match(continuation, /setReels\(\(current\) => \{[\s\S]*mergeCarouselReels\(current, payload\.data\)/);
  assert.doesNotMatch(continuation, /setReels\(\[\]\)/);
});

test('the initial Social carousel scan crosses hidden pages and preserves a paused cursor', () => {
  const initialLoad = between('const loadReels = useCallback', 'const loadMoreReels = useCallback');
  const emptyState = between("if (reels.length === 0)", 'return (\n    <>');

  assert.match(initialLoad, /scanReelsContinuations\(\{/);
  assert.match(initialLoad, /fetchPage: \(pageCursor\) => fetchPokerReels\(\{/);
  assert.match(initialLoad, /cursor: pageCursor/);
  assert.match(initialLoad, /selectRows: \(rows\) => rows[\s\S]*!notInterested\.has\(reel\.id\)/);
  assert.match(initialLoad, /payload\.continuation_paused === true && nextCursor/);
  assert.match(initialLoad, /setContinuationError\(\{[\s\S]*cursor: nextCursor/);
  assert.match(emptyState, /'Retry More Reels'/);
  assert.match(emptyState, /onClick: retryContinuation/);
});

test('a failed cursor is blocked from automatic retry and exposed for explicit same-cursor retry', () => {
  const continuation = between('const loadMoreReels = useCallback', 'const requestNearEndContinuation');
  const retry = between('const retryContinuation = useCallback', '// Initial load + Realtime subscriptions');

  assert.match(
    continuation,
    /automatic && failedAutomaticCursorRef\.current === cursor/
  );
  assert.match(continuation, /failedAutomaticCursorRef\.current = cursor/);
  assert.match(continuation, /setContinuationError\(\{[\s\S]*cursor,[\s\S]*Current Reel Is Still Available/);
  assert.match(retry, /const failedCursor = failedContinuation\?\.cursor/);
  assert.match(retry, /loadMoreReels\(\{ automatic: false, cursor: failedCursor \}\)/);
  assert.match(source, /'Retry More Reels'/);
});

test('Realtime refreshes reconcile authoritatively and the viewer follows its active Reel id', () => {
  const initialLoad = between('const loadReels = useCallback', 'const loadMoreReels = useCallback');
  const realtime = between('// Initial load + Realtime subscriptions', 'const openViewer');
  const viewer = between('function ReelViewer(', '// Main Reels Feed Carousel component');

  assert.match(initialLoad, /const background = mode === BACKGROUND_REELS_REFRESH/);
  assert.match(initialLoad, /reelsRefreshCoordinatorRef\.current\.begin\(\{ background \}\)/);
  assert.match(initialLoad, /resolveStaleReels\(\{/);
  assert.match(initialLoad, /canonicalSupersededReelIds\(reelsRef\.current, allReels\)/);
  assert.match(initialLoad, /mergeBackgroundReels\(\{[\s\S]*removeIds: authoritativeRemoveIds[\s\S]*windowComplete/);
  assert.match(initialLoad, /reelsRefreshCoordinatorRef\.current\.settle\(reelsRequest\)/);
  assert.match(realtime, /realtimeFilter\.classify\(\{ eventType, row: categoryRow, stateReel \}\)/);
  assert.match(realtime, /if \(verdict\.remove\) removeMountedReels/);
  assert.match(realtime, /canonicalConflicts\.forEach\(\(reel\) => staleReelIdsRef\.current\.add\(reel\.id\)\)/);
  assert.match(realtime, /if \(!verdict\.refresh\) return/);
  assert.match(realtime, /handleReelChange\('INSERT'/);
  assert.match(realtime, /handleReelChange\('UPDATE'/);
  assert.match(realtime, /handleReelChange\('DELETE'/);
  assert.doesNotMatch(realtime, /setTimeout\(\(\) => loadReels\(true\)/);
  assert.match(viewer, /const reelsChanged = previousReelsRef\.current !== reels/);
  assert.match(viewer, /const newIndex = reels\.findIndex\(\(reel\) => reel\.id === activeReelIdRef\.current\)/);
  assert.match(viewer, /const fallbackIndex = Math\.min\(currentIndex, reels\.length - 1\)/);
  assert.match(viewer, /setCurrentIndex\(newIndex\);\s*return;/);
});

test('counter-only refreshes cannot abort or strand a cursor continuation', () => {
  const initialLoad = between('const loadReels = useCallback', 'const loadMoreReels = useCallback');
  const continuation = between('const loadMoreReels = useCallback', 'const requestNearEndContinuation');
  const realtime = between('// Initial load + Realtime subscriptions', 'const openViewer');

  assert.match(initialLoad, /if \(background && continuationInFlightRef\.current\) \{[\s\S]*queuedBackgroundRefreshRef\.current = true/);
  assert.match(continuation, /pendingContinuationRef\.current = \{ automatic, cursor \}/);
  assert.match(continuation, /queuedBackgroundRefreshRef\.current[\s\S]*scheduleBackgroundReelsRefresh\(\)/);
  assert.match(initialLoad, /pendingContinuationRef\.current[\s\S]*loadMoreReelsRef\.current\?\./);
  assert.match(source, /createReelRealtimeChangeFilter\(\)/);
  assert.match(realtime, /scheduleBackgroundReelsRefresh\(\)/);
});

test('the Social Media feed mounts one stable peer carousel in both populated and empty states', () => {
  assert.equal((socialPage.match(/<ReelsFeedCarousel\b/g) || []).length, 1,
    'one element definition must serve both mutually exclusive branches');
  assert.match(socialPage, /const inlineReelsCarousel = <ReelsFeedCarousel key=\{SOCIAL_FEED_REELS_KEY\}/);
  assert.match(socialPage, /buildSocialFeedSequence\(filteredPosts\)\.map\(\(item\) => \{/);
  assert.match(socialPage, /if \(item\.kind === 'reels'\) return inlineReelsCarousel/);
  assert.match(socialPage, /<PostCard\s+key=\{item\.key\}/);
  assert.doesNotMatch(socialPage, /<React\.Fragment key=\{p\.id\}>/);
  assert.match(
    socialPage,
    /posts\.filter\(\(p\) => !blockedUserIds\.has\(p\.authorId\)\)\.length === 0[\s\S]*\? \([\s\S]*\{inlineReelsCarousel\}[\s\S]*\) : \([\s\S]*buildSocialFeedSequence\(filteredPosts\)/,
    'empty and populated branches must share the one stable element definition',
  );
});

test('prepend and reorder preserve the carousel sibling key and insertion contract', () => {
  const posts = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));
  const cases = [
    posts,
    [{ id: 'new' }, ...posts],
    [posts[4], posts[1], posts[3], posts[0], posts[2]],
    posts.slice(0, 2),
    posts.slice(0, 1),
  ];

  for (const rows of cases) {
    const sequence = buildSocialFeedSequence(rows);
    const reels = sequence.filter((item) => item.kind === 'reels');
    assert.equal(reels.length, 1, `expected one carousel for ${rows.length} posts`);
    assert.equal(reels[0].key, SOCIAL_FEED_REELS_KEY);
    const reelsIndex = sequence.indexOf(reels[0]);
    const postsBefore = sequence
      .slice(0, reelsIndex)
      .filter((item) => item.kind === 'post').length;
    assert.equal(postsBefore, Math.min(3, rows.length));
    assert.equal(sequence.filter((item) => item.kind === 'trending-venues').length, 1);
    assert.equal(
      sequence.filter((item) => item.kind === 'share-streak-leaderboard').length,
      rows.length >= 5 ? 1 : 0,
    );
  }

  const before = buildSocialFeedSequence(posts).find((item) => item.kind === 'reels');
  const afterPrepend = buildSocialFeedSequence([{ id: 'new' }, ...posts])
    .find((item) => item.kind === 'reels');
  assert.equal(before.key, afterPrepend.key, 'the carousel key cannot inherit the third post id');
});

test('the Social Media rail exposes category-correct feeds and keeps Following authenticated', () => {
  const carousel = between(
    'export function ReelsFeedCarousel()',
    'function ReelsFeedConsoleStyles()'
  );
  const categorySwitch = between(
    'const selectCategory = useCallback',
    'const handleCategoryKeyDown = useCallback'
  );

  for (const category of ['for-you', 'poker', 'casino-slots', 'sports', 'following']) {
    assert.match(source, new RegExp(`id: '${category}'`));
  }
  assert.match(carousel, /activeCategory === 'following'/);
  assert.match(carousel, /following \? getAccessToken\(\) : null/);
  assert.doesNotMatch(carousel, /following \? await getAccessToken\(\) : null/);
  assert.match(carousel, /if \(following && !accessToken\)/);
  assert.match(carousel, /error\.code = 'REELS_AUTH_REQUIRED'/);
  assert.match(source, /error\?\.status === 401 \|\| error\?\.status === 403/);
  assert.match(carousel, /if \(activeCategory === 'following' && !ownerId\) return/);
  assert.equal(
    (carousel.match(/if \(activeCategoryRef\.current !== activeCategory\) return;/g) || []).length,
    2,
    'both initial and continuation loaders reject delayed callbacks from the previous category'
  );
  assert.match(carousel, /if \(followingUnavailable\) selectCategory\('for-you'\)/);
  assert.match(
    carousel,
    /scope: following \? 'following' : 'social-carousel',[\s\S]*category: activeCategory,[\s\S]*accessToken/
  );
  assert.match(carousel, /category\.requiresAccount && !ownerId/);
  assert.match(categorySwitch, /reelsRequestGuardRef\.current\.abort\(\)/);
  assert.match(categorySwitch, /clearTimeout\(reloadDebounceRef\.current\)/);
  assert.match(categorySwitch, /reelsCursorRef\.current = null/);
  assert.match(categorySwitch, /hasMoreRef\.current = false/);
  assert.match(categorySwitch, /setReels\(\[\]\)/);
  assert.match(categorySwitch, /activeCategoryRef\.current = nextCategory\.id/);
  assert.ok(
    categorySwitch.indexOf('reelsRequestGuardRef.current.abort()')
      < categorySwitch.indexOf('setActiveCategory(nextCategory.id)'),
    'the old category request is invalidated before the new category is committed'
  );
});

test('the category rail is keyboard complete, mobile-safe, and labels one active panel', () => {
  const carousel = between(
    'export function ReelsFeedCarousel()',
    'function ReelsFeedConsoleStyles()'
  );
  const styles = between(
    'function ReelsFeedConsoleStyles()',
    'export default ReelsFeedCarousel'
  );

  assert.match(carousel, /aria-label="Choose A Reel Feed"/);
  assert.match(carousel, /aria-orientation="horizontal"/);
  assert.match(source, /aria-selected=\{active\}/);
  assert.match(carousel, /aria-disabled=\{disabled \|\| undefined\}/);
  assert.match(carousel, /tabIndex=\{category\.id === focusedCategoryId \? 0 : -1\}/);
  assert.match(carousel, /onFocus=\{\(\) => setFocusedCategoryId\(category\.id\)\}/);
  assert.match(carousel, /event\.key === 'ArrowRight'/);
  assert.match(carousel, /event\.key === 'ArrowLeft'/);
  assert.match(carousel, /event\.key === 'Home'/);
  assert.match(carousel, /event\.key === 'End'/);
  assert.match(carousel, /aria-labelledby=\{`vlc-reel-category-\$\{selectedCategoryId\}`\}/);
  assert.match(
    carousel,
    /const browseAllReelsPath = `\/hub\/reels\?category=\$\{encodeURIComponent\(selectedCategoryId\)\}`;/
  );
  assert.equal(
    (carousel.match(/router\.push\(browseAllReelsPath\)/g) || []).length,
    3,
    'every error, empty, and populated Browse All Reels action preserves the active category'
  );
  assert.doesNotMatch(carousel, /router\.push\('\/hub\/reels'\)/);
  assert.match(styles, /\.vlc-reel-category-command \{[\s\S]*min-width: 44px;[\s\S]*min-height: 44px;/);
  assert.doesNotMatch(styles, /(?:linear|radial|conic)-gradient|:hover\b/);
});

test('Following authentication failures offer a real sign-in recovery instead of a retry loop', () => {
  const carousel = between(
    'export function ReelsFeedCarousel()',
    'function ReelsFeedConsoleStyles()'
  );
  assert.match(carousel, /followingAuthError = selectedCategoryId === 'following'/);
  assert.match(carousel, /label: 'Sign In Again'/);
  assert.match(carousel, /\/auth\/login\?redirect=\$\{encodeURIComponent\('\/hub\/reels\?category=following'\)\}/);
  assert.match(carousel, /authRequired: following && isReelsAuthError\(error\)/);
  assert.match(carousel, /if \(failedContinuation\?\.authRequired\)[\s\S]*\/auth\/login\?redirect=/);
  assert.match(carousel, /continuationError\.authRequired[\s\S]*'Sign In Again'/);
});

test('failed foreground refreshes preserve the mounted Reel window and expose recovery', () => {
  const carousel = between(
    'export function ReelsFeedCarousel()',
    'function ReelsFeedConsoleStyles()'
  );
  assert.match(carousel, /if \(reelsRef\.current\.length === 0\) setLoading\(true\)/);
  assert.match(carousel, /if \(reelsRef\.current\.length > 0\) \{[\s\S]*retryKind: 'refresh'[\s\S]*Your Current Reel Is Still Available/);
  assert.match(carousel, /failedContinuation\?\.retryKind === 'refresh'[\s\S]*loadReels\(\)/);
  assert.match(carousel, /if \(loadError && reels\.length === 0\)/);
  assert.match(carousel, /role="alert"[\s\S]*continuationError\.message[\s\S]*Retry Signal/);
});

test('mixed-source cards use channel attribution without poker-only fallback copy', () => {
  const card = between(
    'function ReelCard(',
    'function ReelViewer('
  );

  assert.match(card, /const creatorName = reelSourceName\(reel\)/);
  assert.match(source, /reel\?\.channel_name[\s\S]*reel\?\.profiles\?\.full_name/);
  assert.match(card, />Verified Video</);
  assert.doesNotMatch(card, /Poker Creator|Verified Poker Video|Poker reel preview/);
});
