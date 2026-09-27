import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const REELS_PAGE = read('../pages/hub/reels.js');
const REELS_COMPONENT = read('../src/components/social/Reels.jsx');
const REELS_CAROUSEL = read('../src/components/social/ReelsFeedCarousel.jsx');
const SHARED_COMPOSER = read('../src/components/social/SharedPostCreator.jsx');
const STORIES = read('../src/components/social/Stories.jsx');
const SOCIAL_PAGE = read('../pages/hub/social-media/index.js');
const SOCIAL_FEED_API = read('../pages/api/social/feed.js');
const SHARE_REEL_API = read('../pages/api/social/share-reel-to-feed.js');
const FEED_CACHE = read('../src/lib/feedCache.js');
const REEL_RECOVERY = read('../src/components/reels/ReelPublicationRecoveryBanner.jsx');
const REELS_SERVER = read('../src/lib/server/reelsFeed.js');
const RESPONSIBLE_GAMING_NOTICE = read('../src/components/social/ReelResponsibleGamingNotice.jsx');
const MY_REELS = read('../pages/hub/reels/my-reels.js');
const SAVED_REELS = read('../pages/hub/reels/saved.js');
const UPLOAD_REEL_MODAL = read('../src/components/reels/UploadReelModal.jsx');
const APP_SHELL = read('../pages/_app.js');

function between(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0, `missing section start: ${start}`);
  assert.ok(to > from, `missing section end: ${end}`);
  return source.slice(from, to);
}

function loadShareReelRoute({
  reel = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    topic: 'slots',
    caption: 'Canonical Casino Reel',
    thumbnail_url: 'https://img.youtube.com/vi/M7lc1UVf-VE/maxresdefault.jpg',
    source_name: 'Verified Slot Channel',
  },
  insertError = null,
  recoveredPostId = null,
} = {}) {
  const transformed = SHARE_REEL_API
    .replace(/^import(?:[\s\S]*?)from\s+['"][^'"]+['"];\s*/gm, '')
    .replace('export default async function handler', 'async function handler');
  assert.doesNotMatch(transformed, /^\s*import\s/m);

  const calls = { inserts: [], reads: [], keyReads: 0 };
  const supabase = {
    from(table) {
      assert.equal(table, 'social_posts');
      const state = { filters: [] };
      const query = {
        select() { return query; },
        eq(column, value) { state.filters.push(['eq', column, value]); return query; },
        in(column, values) { state.filters.push(['in', column, [...values]]); return query; },
        limit() { return query; },
        insert(payload) {
          calls.inserts.push(JSON.parse(JSON.stringify(payload)));
          return {
            select() {
              return {
                async maybeSingle() {
                  return insertError
                    ? { data: null, error: insertError }
                    : { data: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }, error: null };
                },
              };
            },
          };
        },
        then(resolve, reject) {
          const isKeyRead = state.filters.some(
            filter => filter[0] === 'eq' && filter[1] === 'metadata->>publication_key',
          );
          if (isKeyRead) calls.keyReads += 1;
          calls.reads.push(JSON.parse(JSON.stringify(state.filters)));
          const data = isKeyRead && calls.keyReads > 1 && recoveredPostId
            ? [{ id: recoveredPostId }]
            : [];
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };

  const context = {
    URLSearchParams,
    process: {
      env: {
        NEXT_PUBLIC_SUPABASE_URL: 'https://test-project.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-test',
      },
    },
    console: { warn() {} },
    createClient() { return supabase; },
    applyRateLimit() { return true; },
    LIMITS: { write: {} },
    async getServerUserWithFallback() {
      return { user: { id: '11111111-1111-4111-8111-111111111111' } };
    },
    async readPublicReelById() { return { data: reel }; },
    buildReelPath(value) {
      const category = value.topic === 'slots' ? 'casino-slots' : 'poker';
      return `/hub/reels?id=${encodeURIComponent(value.id)}&category=${category}`;
    },
  };
  context.globalThis = context;
  vm.runInNewContext(`${transformed}\nglobalThis.__handler = handler;`, context);

  async function request(body) {
    const response = {
      statusCode: 200,
      body: null,
      status(value) { this.statusCode = value; return this; },
      json(value) { this.body = JSON.parse(JSON.stringify(value)); return this; },
    };
    await context.__handler({ method: 'POST', body, headers: {} }, response);
    return response;
  }

  return { calls, request };
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
  for (const source of [REELS_PAGE, REELS_COMPONENT, REELS_CAROUSEL]) {
    assert.match(source, /buildReelPath\(currentReel\)/);
  }
  assert.match(REELS_PAGE, /categoryForReelsRoute,/);
  assert.match(REELS_CAROUSEL, /fetch\('\/api\/social\/share-reel-to-feed'/);
  assert.doesNotMatch(REELS_CAROUSEL, /\.from\('social_posts'\)[\s\S]{0,500}\.insert\(/);
  assert.match(SHARE_REEL_API, /readPublicReelById\(\{[\s\S]*category: 'for-you'/);
  assert.match(SHARE_REEL_API, /\.eq\('metadata->>publication_key', publicationKey\)/);
  assert.match(SHARE_REEL_API, /const reelLinks = \[reelLink, legacyReelLink\]/);
  assert.match(SHARE_REEL_API, /\.in\('link_url', reelLinks\)/);
  assert.match(SHARE_REEL_API, /content_type: 'link'/);
  assert.match(SHARE_REEL_API, /media_urls: \[\]/);
  assert.match(SHARE_REEL_API, /publication_key: publicationKey/);
  assert.match(SHARE_REEL_API, /error\.code === '23505'[\s\S]*findExistingShare/);
  assert.doesNotMatch(SHARE_REEL_API, /media_urls: \[reel\.video_url\]/);
  assert.doesNotMatch(SHARE_REEL_API, /const \{ reel_id, video_url, caption/);
  assert.doesNotMatch(REELS_CAROUSEL, /\/hub\/social-media\?reel=/);
  assert.match(SOCIAL_PAGE, /router\.query\.reel/);
  assert.match(SOCIAL_PAGE, /\/hub\/reels\?id=/);
  assert.match(SOCIAL_PAGE, /function sharedReelPathForPost/);
  assert.match(SOCIAL_PAGE, /router\.push\(sharedReelPath\)/);
  assert.match(SOCIAL_PAGE, /shared_reel_channel_name/);
  assert.match(SOCIAL_PAGE, /const inlineReelsCarousel = <ReelsFeedCarousel key="reels-carousel"/);
  assert.match(SOCIAL_PAGE, /\{inlineReelsCarousel\}[\s\S]*Welcome To Smarter\.Poker/);
});

test('sharing stores one canonical Reel reference and ignores hostile media fields', async () => {
  const harness = loadShareReelRoute();
  const response = await harness.request({
    reel_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    user_description: 'Worth Watching',
    video_url: 'https://attacker.invalid/video.mp4',
    caption: 'Attacker Caption',
  });

  assert.equal(response.statusCode, 200);
  assert.equal(harness.calls.inserts.length, 1);
  const inserted = harness.calls.inserts[0];
  assert.equal(inserted.content_type, 'link');
  assert.deepEqual(inserted.media_urls, []);
  assert.equal(inserted.link_url,
    'https://smarter.poker/hub/reels?id=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa&category=casino-slots');
  assert.equal(inserted.metadata.shared_reel_id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  assert.equal(inserted.metadata.shared_reel_topic, 'slots');
  assert.equal(inserted.metadata.shared_reel_channel_name, 'Verified Slot Channel');
  assert.match(SHARE_REEL_API, /reel\.source_name \|\| reel\.channel_name \|\| null/);
  assert.equal(inserted.metadata.publication_key,
    'reel-share:11111111-1111-4111-8111-111111111111:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  assert.doesNotMatch(JSON.stringify(inserted), /attacker\.invalid|Attacker Caption/);
});

test('a simultaneous Reel share converges on the database publication key', async () => {
  const harness = loadShareReelRoute({
    insertError: { code: '23505', message: 'duplicate key value violates unique constraint' },
    recoveredPostId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  });
  const response = await harness.request({
    reel_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    success: true,
    already_shared: true,
    postId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  });
  assert.equal(harness.calls.inserts.length, 1);
  assert.equal(harness.calls.keyReads, 2, 'the 23505 loser must read back the durable winner');
});

test('an unavailable Reel cannot be shared into the social feed', async () => {
  const harness = loadShareReelRoute({ reel: null });
  const response = await harness.request({
    reel_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  });

  assert.equal(response.statusCode, 404);
  assert.equal(harness.calls.inserts.length, 0);
});

test('every Reel surface keeps one active player and preserves YouTube controls', () => {
  for (const [name, source] of [
    ['standalone', REELS_PAGE],
    ['library viewer', REELS_COMPONENT],
    ['social carousel', REELS_CAROUSEL],
  ]) {
    assert.equal((source.match(/<iframe\b/g) || []).length, 1,
      `${name} must own exactly one iframe implementation`);
    assert.match(source, /controls=1/);
    assert.match(source, /widget_referrer=/);
    assert.match(source, /referrerPolicy="strict-origin-when-cross-origin"/);
    assert.doesNotMatch(source, /controls=0|modestbranding=1|disablekb=1|showinfo=0|fs=0/);
  }

  assert.match(REELS_COMPONENT, /\{isActive && videoId \? \(/);
  assert.match(REELS_COMPONENT, /\) : isActive && reel\.video_url \? \(/);
  assert.doesNotMatch(REELS_PAGE, /<iframe[^>]+preload/i,
    'the standalone reader may prefetch posters but cannot mount a second player');
  assert.match(REELS_CAROUSEL, /Array\.from\(\{ length: 1 \}/,
    'the social viewer may warm only the immediately next Reel');
  assert.doesNotMatch(REELS_CAROUSEL, /Array\.from\(\{ length: (?:[2-9]|\d{2,}) \}/,
    'the social viewer cannot fan out native media preloads');
  assert.match(REELS_PAGE, /const nextReel = reels\[currentIndex \+ 1\]/,
    'the full-page viewer may warm only the immediately next Reel');
  assert.doesNotMatch(REELS_PAGE, /reels\.slice\(currentIndex \+ 1, currentIndex \+ (?:[3-9]|\d{2,})\)/,
    'the full-page viewer cannot fan out a mobile media-resource window');
  assert.match(
    REELS_CAROUSEL,
    /const loadedReel = reelsRef\.current\[currentIndexRef\.current\][\s\S]*!isYouTubeUrl\(loadedReel\?\.video_url\)[\s\S]*sendYTCmd\('pauseVideo'\)[\s\S]*return;/,
    'an iframe that finishes loading behind a native Reel must pause after its API bridge is ready',
  );
  assert.match(
    REELS_CAROUSEL,
    /const latestReel = reelsRef\.current\[currentIndexRef\.current\][\s\S]*!isYouTubeUrl\(latestReel\?\.video_url\)[\s\S]*sendYTCmd\('pauseVideo'\)[\s\S]*return;/,
    'delayed autoplay retries must re-check the active Reel before they can play or unmute',
  );
});

test('third-party Reels expose accurate source attribution with a neutral fallback', () => {
  assert.match(REELS_SERVER, /'source_id',[\s\S]*'source_name'/);
  assert.match(REELS_SERVER, /sourceNameFromMetadata\(sourcePost\?\.metadata\)/);
  assert.match(REELS_SERVER, /source_attribution_url: sourceAttributionUrl/);
  assert.match(REELS_SERVER, /row\.source_name[\s\S]*Original YouTube Source/);
  for (const source of [REELS_PAGE, REELS_COMPONENT, REELS_CAROUSEL]) {
    assert.match(source, /View Original On/);
    assert.match(source, /channel_name/);
  }
});

test('the mixed embedded viewer keeps loading and empty copy category-neutral', () => {
  assert.match(REELS_COMPONENT, /verifying playable Reel footage/);
  assert.match(REELS_COMPONENT, /subtitle="Verified Reel Video"/);
  assert.doesNotMatch(REELS_COMPONENT, /playable poker footage|Verified Poker Video/i);
  assert.match(REELS_COMPONENT, /href="\/hub\/reels\?category=for-you"/);
  assert.doesNotMatch(REELS_COMPONENT, /href="\/hub\/reels"/);
});

test('slots Reels carry the responsible-gaming console notice on every viewer', () => {
  assert.match(RESPONSIBLE_GAMING_NOTICE, /topic[\s\S]*!== 'slots'/);
  assert.match(RESPONSIBLE_GAMING_NOTICE, /Set Limits, Take Breaks/);
  assert.match(RESPONSIBLE_GAMING_NOTICE, /\/hub\/commander\/responsible-gaming/);
  for (const source of [REELS_PAGE, REELS_COMPONENT, REELS_CAROUSEL]) {
    assert.match(source, /<ReelResponsibleGamingNotice topic=/);
  }
});

test('following deep links authenticate and mixed collections avoid poker-only copy', () => {
  assert.match(REELS_PAGE, /feedModeForReelsRoute,/);
  assert.equal((REELS_PAGE.match(/feedModeForReelsRoute\(router\.query\)/g) || []).length, 4,
    'both initial and continuation reads and their auth-error paths derive Following from the category');
  assert.match(
    REELS_PAGE,
    /`\/auth\/login\?redirect=\$\{encodeURIComponent\([\s\S]*router\.asPath \|\| '\/hub\/reels\?category=following'/,
  );
  assert.doesNotMatch(REELS_PAGE, /router\.push\('\/login'\)/);
  assert.match(REELS_PAGE, /followingReauthRequired/);
  assert.match(REELS_PAGE, /feedMode === 'following' && !followingAccessToken[\s\S]*setFollowingReauthRequired\(true\)/);
  assert.match(REELS_PAGE, /\[401, 403\]\.includes\(e\?\.status\)[\s\S]*setFollowingReauthRequired\(true\)/);
  assert.doesNotMatch(MY_REELS, /Eligible Poker Clips|Poker Clips/);
  assert.doesNotMatch(SAVED_REELS, /Saved Poker Reels|Poker Clips/);
  assert.match(REELS_PAGE, /const reelsNavigationHeader = \([\s\S]*commandMenuItems=\{menuConfig\.menuItems\}/);
  assert.equal(
    (REELS_PAGE.match(/\{reelsNavigationHeader\}/g) || []).length,
    3,
    'loading, error, and empty states retain the canonical Reel category navigation',
  );
  assert.match(REELS_PAGE, /\{showOverlay && reelsNavigationHeader\}/);
});

test('poker uploads leave every origin category through one canonical published-Reel path', () => {
  assert.match(REELS_PAGE, /const POKER_REEL_UPLOAD_PATH = '\/hub\/reels\?category=poker&upload=1'/);
  assert.match(REELS_PAGE, /const liveAuthUser = getAuthUser\(\);[\s\S]*!liveAuthUser\?\.id[\s\S]*liveAuthUser\.id !== user\?\.id[\s\S]*!getAccessToken\(\)/);
  assert.match(REELS_PAGE, /router\.query\.upload !== '1' \|\| !authResolved[\s\S]*getAuthUser\(\)\?\.id !== user\.id \|\| !getAccessToken\(\)[\s\S]*router\.replace\(`\/auth\/login\?redirect=\$\{encodeURIComponent\(POKER_REEL_UPLOAD_PATH\)\}`\)/);
  assert.match(REELS_PAGE, /const openPublishedPokerReel = useCallback\(\(publication\) => \{[\s\S]*buildReelPath\(\{[\s\S]*publication\?\.socialReelId,[\s\S]*topic: 'poker'/);
  assert.match(REELS_PAGE, /publishedReelPath === '\/hub\/reels'[\s\S]*'\/hub\/reels\?category=poker'/);
  assert.match(REELS_PAGE, /onSuccess=\{\(publication\) => \{[\s\S]*openPublishedPokerReel\(publication\)/);
  assert.equal(
    (REELS_PAGE.match(/onRecovered=\{openPublishedPokerReel\}/g) || []).length,
    4,
    'every loading, error, empty, and loaded recovery banner opens the recovered Poker Reel',
  );
  assert.match(UPLOAD_REEL_MODAL, /onSuccess\?\.\(publicationResult\.publication\)/);
  assert.match(UPLOAD_REEL_MODAL, /Your Reel Is Live\. Open Poker Reels To Watch It\./);
  assert.match(UPLOAD_REEL_MODAL, /window\.top\.location\.href = publishedReelPath === '\/hub\/reels'/);
  assert.match(UPLOAD_REEL_MODAL, /window\.top\.location\.href = '\/hub\/reels\?category=poker'/);
  assert.doesNotMatch(UPLOAD_REEL_MODAL, /Open Poker Reels To Watch It\.[\s\S]{0,180}\/hub\/social-media/);
});

test('legacy routes canonicalize without dropping detail, feed, or upload state and reset viewer index', () => {
  assert.match(REELS_PAGE, /const canonicalCategory = categoryForReelsRoute\(router\.query\)/);
  assert.match(REELS_PAGE, /query: \{ \.\.\.router\.query, category: canonicalCategory \}/);
  assert.match(REELS_PAGE, /\{ shallow: true \}/);
  assert.match(REELS_PAGE, /const routeNamespace = `\$\{routeCategory\}:\$\{feedMode\}`/);
  assert.match(REELS_PAGE, /reelsRouteNamespaceRef\.current !== routeNamespace[\s\S]*currentIndexRef\.current = 0;[\s\S]*setCurrentIndex\(0\)/);
  assert.match(REELS_PAGE, /console\.warn\('Load reels error:', e\);[\s\S]*setReels\(\[\]\);[\s\S]*currentIndexRef\.current = 0;[\s\S]*setCurrentIndex\(0\)/);
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

test('a failed foreground channel switch retains the mounted Reel and exposes a retry', () => {
  const loader = between(
    REELS_PAGE,
    'const loadReels = useCallback(async (mode) => {',
    'loadReelsRef.current = loadReels;',
  );
  assert.match(loader, /const routeNamespaceChanged = reelsRouteNamespaceRef\.current !== routeNamespace;/);
  assert.match(
    loader,
    /if \(!background && routeNamespaceChanged\) \{[\s\S]*reelsRouteNamespaceRef\.current = routeNamespace;[\s\S]*setCurrentIndex\(0\);/,
  );
  assert.match(
    loader,
    /if \(reelsRef\.current\.length > 0\) \{\s*setLoadError\('network'\);\s*return;\s*\}\s*setReels\(\[\]\)/,
  );
  assert.match(REELS_PAGE, /New Reels Could Not Be Loaded\. Showing Your Current Reel\./);
  assert.match(REELS_PAGE, /aria-label="Retry Reel channel"/);
  assert.match(
    APP_SHELL,
    /const pageErrorBoundaryKey = resolvedPath === '\/hub\/reels'[\s\S]*?\? resolvedPath[\s\S]*?: router\.asPath;/,
  );
  assert.match(APP_SHELL, /<PageErrorBoundary key=\{pageErrorBoundaryKey\}>/);
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
    assert.match(loader, /if \(!reelsRequest\.isCurrent\(\)\) return;[\s\S]*?if \(background\)/,
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
