import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const PAGE = readFileSync(new URL('../pages/hub/video-library.js', import.meta.url), 'utf8');
const DATA = readFileSync(new URL('../src/data/videoLibraryData.js', import.meta.url), 'utf8');
const HISTORY = readFileSync(new URL('../src/services/videoWatchHistory.js', import.meta.url), 'utf8');
const FAVORITES = readFileSync(new URL('../src/services/videoFavorites.js', import.meta.url), 'utf8');
const LATER = readFileSync(new URL('../src/services/videoWatchLater.js', import.meta.url), 'utf8');
const PREFS = readFileSync(new URL('../src/services/videoLibraryPreferences.js', import.meta.url), 'utf8');
const MENU = readFileSync(new URL('../src/config/hamburgerMenus.js', import.meta.url), 'utf8');
const REWARD = readFileSync(new URL('../src/lib/claimReward.js', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../src/styles/worlds/video-library.css', import.meta.url), 'utf8');
const YOUTUBE_HOOK = readFileSync(new URL('../src/hooks/useYouTubeErrorManager.js', import.meta.url), 'utf8');
const PLAYLISTS = readFileSync(new URL('../src/services/videoPlaylists.js', import.meta.url), 'utf8');
const MIGRATION = readFileSync(new URL('../supabase/migrations/20260827000001_video_library_phase5_reliability.sql', import.meta.url), 'utf8');
const HARDENING = readFileSync(new URL('../supabase/migrations/20260827000002_video_library_phase6_hardening.sql', import.meta.url), 'utf8');
const CATALOG_API = readFileSync(new URL('../pages/api/video-library/catalog.js', import.meta.url), 'utf8');

test('the playable fallback catalog canonicalizes IDs and rejects placeholder embeds', () => {
  assert.match(PAGE, /STATIC_VIDEO_ALIASES/);
  assert.match(PAGE, /\.filter\(video => video\.videoId && !String\(video\.videoId\)\.startsWith\('FAKE'\)\)/);
  assert.match(PAGE, /legacyId: video\.id, id: video\.videoId/);
  assert.match(CATALOG_API, /id: row\.youtube_video_id/);
  assert.match(PAGE, /legacyId: STATIC_VIDEO_CANONICAL_ALIASES\.get\(video\.videoId\)/);
  assert.ok((DATA.match(/videoId: 'FAKE/g) || []).length > 0, 'guard must exercise real legacy placeholders');
});

test('legacy persisted aliases remain visible and removable after canonicalization', () => {
  assert.match(PAGE, /canonicalStoredVideoId/);
  assert.match(PAGE, /new Set\(favoriteResult\.value\.map\(item => canonicalStoredVideoId\(item\.video_id\)\)\)/);
  assert.match(PAGE, /canonicalProgress = new Map/);
  assert.match(FAVORITES, /\.in\('video_id', videoIds\)/);
  assert.match(LATER, /\.in\('video_id', videoIds\)/);
  assert.match(HISTORY, /removeFromWatchHistory\(userId, videoId, aliases = \[\]\)/);
});

test('watch sessions are player-state driven, resumable, and atomically persisted', () => {
  assert.match(PAGE, /onStateChange: handlePlayerStateChange/);
  assert.match(PAGE, /state === 0 \|\| state === 2 \|\| state === 3 \|\| state === 5/);
  assert.match(PAGE, /start=\$\{selectedVideoResumeSeconds\}/);
  assert.match(PAGE, /durationSeconds: parseDuration\(video\.duration\)/);
  assert.match(HISTORY, /rpc\('record_video_watch_session'/);
  assert.match(MIGRATION, /ON CONFLICT \(user_id, video_id\) DO UPDATE/);
  assert.match(HARDENING, /pg_advisory_xact_lock/);
  assert.match(HARDENING, /watch_duration_seconds = CASE/);
});

test('reward claims return structured outcomes and retry until terminal', () => {
  assert.match(REWARD, /terminal: Boolean\(data\.claimed \|\| data\.alreadyClaimed\)/);
  assert.equal((HISTORY.match(/'\/api\/rewards\/video-watch'/g) || []).length, 1);
  assert.match(HISTORY, /terminalRewardClaims/);
  assert.match(HISTORY, /if \(result\?\.terminal\)/);
  assert.match(HISTORY, /Number\(result\?\.watch_duration_seconds \|\| 0\) >= 300/);
});

test('favorite and Watch Later controls use rollback-capable handlers', () => {
  assert.match(PAGE, /void toggleFavorite\(selectedVideo\)/);
  assert.match(PAGE, /void toggleWatchLater\(selectedVideo\)/);
  assert.match(PAGE, /Favorite was not saved\. Try again\./);
  assert.match(PAGE, /Watch Later was not updated\. Try again\./);
  assert.doesNotMatch(PAGE, /removeVideoFavorite\(userId, videoId\)\.catch\(\(\) => \{\}\)/);
});

test('mark-unwatched persists and clears every local watch-state projection', () => {
  assert.match(PAGE, /handleMarkUnwatched\(video\)/);
  assert.match(PAGE, /await removeFromWatchHistory/);
  assert.match(PAGE, /next\.delete\(videoId\)/);
  assert.match(PAGE, /prev\.filter\(item => item\.video_id !== videoId\)/);
});

test('action feedback reports actual outcome and clipboard failures never claim success', () => {
  assert.match(PAGE, /copyTextToClipboard/);
  assert.match(PAGE, /Link could not be copied\. Try again\./);
  assert.match(PAGE, /shareToast\.message/);
  assert.match(PAGE, /vl-action-notice--\$\{shareToast\.tone\}/);
  assert.match(CSS, /\.vl-action-notice--error/);
  assert.match(CSS, /\.vl-action-notice--info/);
});

test('deep links, auth switches, and pagination remounts are guarded', () => {
  assert.match(PAGE, /Array\.isArray\(router\.query\.filter\)/);
  assert.match(PAGE, /openedQueryVideoRef\.current !== requestedVideoId/);
  assert.match(PAGE, /clearUserLibrary\(\)/);
  assert.match(PAGE, /Promise\.allSettled/);
  assert.match(PAGE, /sessionUserId: userId/);
  assert.match(PAGE, /Some saved library data could not be refreshed/);
  assert.match(PLAYLISTS, /Error fetching playlists:[\s\S]*throw error/);
  assert.match(PAGE, /\[displayedCount, videos\.length,/);
  assert.doesNotMatch(PAGE, /dbLoaded/);
  assert.match(PAGE, /catalogSearchQuery, sortMode, libraryFilter/);
});

test('supported player settings are wired and the false HD control is retired', () => {
  assert.match(PAGE, /autoplay=\$\{preferences\.autoplay === false \? 0 : 1\}/);
  assert.match(PAGE, /cc_load_policy=\$\{preferences\.captions \? 1 : 0\}/);
  assert.doesNotMatch(MENU, /createMenuItem\.toggle\('HD Quality'/);
  assert.match(PREFS, /patch_video_library_preferences/);
  assert.match(HARDENING, /video_library_preferences =/);
});

test('desktop actions, playlist wiring, touch controls, and safe-area layout remain reachable', () => {
  assert.match(PAGE, /onMouseMove=\{!isTouchDevice \? vlRevealHud : undefined\}/);
  assert.match(PAGE, /setShowPlaylistModal\(selectedVideo\)/);
  assert.match(PAGE, /aria-labelledby="vl-playlist-title"/);
  assert.match(PAGE, /ref=\{playlistDialogRef\}/);
  assert.match(PAGE, /ref=\{ttsDialogRef\} role="dialog"/);
  assert.match(PAGE, /containDialogFocus/);
  assert.match(PAGE, /ref=\{reelsDialogRef\}/);
  assert.match(PAGE, /e\.metaKey \|\| e\.ctrlKey \|\| e\.altKey/);
  assert.match(YOUTUBE_HOOK, /e\.source !== iframeRef\.current\.contentWindow/);
  assert.match(PAGE, /top: 0, bottom: 64/);
  assert.match(PAGE, /<BottomNavBar theme="dark"/);
  assert.ok((CSS.match(/env\(safe-area-inset-bottom/g) || []).length >= 2);
});
