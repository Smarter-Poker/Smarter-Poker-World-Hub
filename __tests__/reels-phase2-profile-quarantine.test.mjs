import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createReelRealtimeChangeFilter,
  reelTopicsForCategory,
} from '../src/lib/reelsRealtimeRefresh.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const PROFILE = read('pages/hub/user/[username].js');
const PROFILE_API = read('pages/api/reels/profile.js');
const SERVER = read('src/lib/server/reelsFeed.js');
const FULL_PAGE = read('pages/hub/reels.js');
const EMBEDDED = read('src/components/social/Reels.jsx');
const PROFILE_VIDEOS_API = read('pages/api/social/profile-videos.js');
const SAVED_POSTS_API = read('pages/api/social/saved-posts.js');
const SAVED_POSTS_PAGE = read('pages/hub/saved-posts.js');
const SOCIAL_FEED_API = read('pages/api/social/feed.js');

test('profile Reels use a canonical no-store endpoint while owners retain My Reels', () => {
  const profileBatch = PROFILE.match(/const contentPromises = \[[\s\S]*?Promise\.all\(contentPromises\)/)?.[0] || '';
  assert.match(profileBatch, /\/api\/reels\/profile\?author_id=/);
  assert.match(profileBatch, /\/api\/reels\/mine\?limit=30/);
  assert.match(profileBatch, /cache: 'no-store'/);
  assert.doesNotMatch(profileBatch, /\.from\(['"]social_reels['"]\)/);

  assert.match(PROFILE_API, /readPublicProfileReels/);
  assert.match(PROFILE_API, /Cache-Control', 'no-store'/);
  assert.match(SERVER, /export async function readPublicProfileReels/);
  assert.match(SERVER, /const eligible = await eligibleRows/);
  assert.match(SERVER, /const winnerByKey = await canonicalWinners/);
});

test('realtime eligibility is category-aware without treating valid slots or sports as takedowns', () => {
  const slots = createReelRealtimeChangeFilter();
  assert.deepEqual(slots.classify({
    eventType: 'INSERT',
    row: { id: 'slot', is_public: true, is_deleted: false, media_status: 'ready', topic: 'slots' },
    allowedTopics: reelTopicsForCategory('casino-slots'),
  }), { refresh: true, remove: false });

  const sports = createReelRealtimeChangeFilter();
  assert.deepEqual(sports.classify({
    eventType: 'UPDATE',
    row: { id: 'sport', is_public: false, is_deleted: false, media_status: 'ready', topic: 'sports' },
    stateReel: { id: 'sport', is_public: true, topic: 'sports' },
    allowedTopics: reelTopicsForCategory('sports'),
  }), { refresh: true, remove: true });
});

test('public viewers subscribe to takedowns on full-page and embedded Reel viewers', () => {
  assert.doesNotMatch(FULL_PAGE, /useEffect\(\(\) => \{\s*if \(!user\?\.id\) return;\s*const realtimeFilter/);
  assert.match(FULL_PAGE, /reels:\$\{user\?\.id \|\| 'public'\}/);
  assert.match(FULL_PAGE, /allowedTopics: reelTopicsForCategory/);

  assert.doesNotMatch(EMBEDDED, /useEffect\(\(\) => \{\s*if \(!currentUserId\) return;\s*const realtimeFilter/);
  assert.match(EMBEDDED, /reels-viewer:\$\{currentUserId \|\| 'public'\}/);
});

test('profile Videos and Saved Posts share the authoritative Social video gate', () => {
  for (const source of [PROFILE_VIDEOS_API, SAVED_POSTS_API]) {
    assert.match(source, /readManagedEligibilityContext/);
    assert.match(source, /managedVideoPostIsEligible/);
    assert.match(source, /nativeVideoIsReady/);
    assert.match(source, /isPublicAudiencePost/);
    assert.match(source, /private, no-store, max-age=0/);
  }
  assert.match(PROFILE, /\/api\/social\/profile-videos\?author_id=/);
  assert.match(SAVED_POSTS_PAGE, /fetch\('\/api\/social\/saved-posts'/);
  const savedLoader = SAVED_POSTS_PAGE.match(/const loadSavedPosts[\s\S]*?\}, \[\]\);/)?.[0] || '';
  assert.doesNotMatch(savedLoader, /\.from\(['"]social_posts['"]\)/);
  assert.doesNotMatch(savedLoader, /\.from\(['"]social_interactions['"]\)/);
  assert.match(savedLoader, /requestRef\.current\?\.abort\(\)/);
  assert.match(savedLoader, /signal: controller\.signal/);
  assert.match(savedLoader, /response\.status === 401[\s\S]*setCurrentUser\(null\)/);
  assert.match(savedLoader, /throw new Error\(payload\?\.error/);
  assert.match(SAVED_POSTS_PAGE, /window\.addEventListener\('focus', revalidate\)/);
  assert.match(SAVED_POSTS_PAGE, /document\.addEventListener\('visibilitychange', revalidate\)/);
  assert.match(SAVED_POSTS_PAGE, /role="alert"[\s\S]*Try Again/);
});

test('privacy and stale managed availability fail closed while ordinary posts remain eligible', () => {
  assert.match(SOCIAL_FEED_API, /post\.is_deleted === true \|\| post\.visibility === 'private'/);
  assert.match(SOCIAL_FEED_API, /effectiveAudience === 'public'/);
  assert.match(SOCIAL_FEED_API, /nowMs - checkedAt <= VERIFY_MAX_AGE_MS/);
  assert.match(SOCIAL_FEED_API, /context\.failedYoutubeIds\.has\(youtubeId\)/);
  assert.match(SOCIAL_FEED_API, /if \(post\?\.content_type !== 'video'\) return !managed/);
});
