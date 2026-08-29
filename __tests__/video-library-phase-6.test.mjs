import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const PAGE = read('../pages/hub/video-library.js');
const HISTORY = read('../src/services/videoWatchHistory.js');
const PREFS = read('../src/services/videoLibraryPreferences.js');
const REWARD = read('../src/lib/claimReward.js');
const WATCH_API = read('../pages/api/rewards/video-watch.js');
const FAVORITE_API = read('../pages/api/rewards/video-favorite.js');
const MIGRATION = read('../supabase/migrations/20260827000002_video_library_phase6_hardening.sql');
const GATE = read('../scripts/ci/check-migrations-applied.mjs');

test('watch credit is identity-bound, catalog-bound, elapsed-bound, and direct writes are retired', () => {
  assert.match(HISTORY, /p_expected_user_id: userId/);
  assert.match(MIGRATION, /v_user_id <> p_expected_user_id/);
  assert.match(MIGRATION, /FROM public\.video_library_videos/);
  assert.match(MIGRATION, /v_now - v_last_heartbeat >= interval '5 seconds'/);
  assert.match(MIGRATION, /LEAST\(GREATEST\(COALESCE\(p_additional_seconds, 0\), 0\), 20\)/);
  assert.match(MIGRATION, /watch_started_at = COALESCE/);
  assert.match(MIGRATION, /DROP POLICY IF EXISTS "Users can add to watch history"/);
  assert.match(MIGRATION, /DROP POLICY IF EXISTS "Users can update watch history"/);
});

test('resume position and cumulative watch credit use separate signals', () => {
  assert.match(PAGE, /onPlaybackInfo: handlePlaybackInfo/);
  assert.match(PAGE, /playerPositionRef\.current = currentTime/);
  assert.match(PAGE, /progressSeconds: playerPositionRef\.current/);
  assert.match(PAGE, /setInterval\([\s\S]*15000/);
  assert.match(HISTORY, /p_progress_seconds/);
});

test('watch reward retries are per-user and cache only terminal server outcomes', () => {
  assert.match(HISTORY, /const claimKey = `\$\{userId\}:\$\{videoId\}`/);
  assert.match(HISTORY, /rewardClaimsInFlight/);
  assert.match(HISTORY, /if \(result\?\.terminal\) terminalRewardClaims\.add/);
  assert.match(REWARD, /retryable: true/);
  assert.match(REWARD, /alreadyClaimed/);
});

test('reward APIs distinguish database failure from ineligibility and verify the catalog', () => {
  assert.match(WATCH_API, /if \(watchError\) throw watchError/);
  assert.match(WATCH_API, /if \(catalogError\) throw catalogError/);
  assert.match(WATCH_API, /watch_started_at/);
  assert.match(WATCH_API, /proof: 'server_timed_heartbeat'/);
  assert.match(FAVORITE_API, /if \(favoriteError\) throw favoriteError/);
  assert.match(FAVORITE_API, /Catalog video not found/);
});

test('preference changes are atomic patches and read failures remain observable', () => {
  assert.match(PREFS, /patch_video_library_preferences/);
  assert.match(PREFS, /throw error/);
  assert.doesNotMatch(PREFS, /hdQuality/);
  assert.match(MIGRATION, /COALESCE\(video_library_preferences, '\{\}'::jsonb\) \|\| p_patch/);
  assert.match(MIGRATION, /IF NOT FOUND/);
});

test('navigation, touch scrolling, and focused HUD controls cannot regress', () => {
  assert.match(PAGE, /if \(!router\.query\.type\) setSelectedType\('ALL'\)/);
  assert.match(PAGE, /handleOpenVideoRef\.current = handleOpenVideo/);
  assert.doesNotMatch(PAGE, /Touch-swipe for TikTok-style navigation — handled by dedicated overlay below/);
  assert.match(PAGE, /\.vl-hud:focus-within/);
  assert.match(PAGE, /onFocusCapture=\{vlRevealHud\}/);
});

test('migration verification fails when a declared RPC is absent', () => {
  assert.match(GATE, /if \(!fns\.has\(fn\.name\)\)/);
  assert.match(GATE, /failures\.push\(\[file, 'function', `\$\{fn\.name\}/);
  assert.doesNotMatch(GATE, /warnings\.push\(\[file, 'function'/);
});
