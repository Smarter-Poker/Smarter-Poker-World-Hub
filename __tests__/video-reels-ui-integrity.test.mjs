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
