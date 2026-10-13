import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/*
 * OWNER UPDATE (Video Library, 2026-10-11) — supersedes the painted-console
 * pins that used to live in this file.
 *
 * Dan: "THIS NEEDS TO LOOK MORE LIKE YOUTUBE, AND IT CURRENTLY LOOKS LIKE SHIT
 * AND IS A HOT MESS ... REMOVE THE UN NECESSARY FRAMES AND OPTIMIZE THIS WHOLE
 * PAGE FOR MOBILE, INSPIRED BY YOUTUBE LAYOUT AND FUNCTIONALITY."
 *
 * The spade-console artwork no longer wraps the library, the rail, or any
 * dialog on this page. These tests pin the YouTube layout so the frames and
 * the old scan rows cannot quietly return.
 */

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const PAGE = read('../pages/hub/video-library.js');
const RAIL = read('../src/components/video-library/VideoLibraryCommandRail.jsx');
const CSS = read('../src/styles/worlds/video-library.css');
const SEARCH = read('../src/components/video-library/BrowseSearch.jsx');
const CARDS = read('../src/lib/videoLibraryCards.js');

test('no decorative console frame wraps the page, the rail or any dialog', () => {
  assert.doesNotMatch(PAGE, /VideoLibraryConsole|ConsoleCopy|ConsolePlateButton/);
  assert.doesNotMatch(RAIL, /VideoLibraryConsole|ConsoleDataRow/);
  assert.doesNotMatch(CSS, /spade-console|vl-command-console|vl-library-console/);
  assert.doesNotMatch(PAGE, /metal-frame|video-card-metal|sp-icon-btn|YouTubeErrorOverlay/);
});

test('the browse page is search, one chip row, round channels, then the feed', () => {
  assert.match(PAGE, /<BrowseSearch[\s\S]*inputRef=\{searchInputRef\}/);
  assert.match(SEARCH, /aria-label="Search The Poker Video Library"/);
  assert.match(CSS, /@media \(min-width: 1100px\)[\s\S]*\.vl-topbar > \.vl-chip-rail[\s\S]*grid-column: 1/);
  assert.match(PAGE, /<VideoLibraryCommandRail[\s\S]*className={`vl-source-pills/);
  assert.match(RAIL, /<nav className="vl-chip-rail"/);
  assert.match(RAIL, /data-filter-group="type"[\s\S]*data-filter-group="sort"[\s\S]*data-filter-group="library"/);
  // The chip row is the one sideways scroller and keeps its scrollbar visible.
  assert.match(CSS, /\.vl-type-toggle-row \{[\s\S]*flex-wrap: nowrap[\s\S]*overflow-x: auto[\s\S]*scrollbar-width: thin/);
  assert.match(CSS, /\.vl-filter-button \{[\s\S]*min-height: 44px/);
  assert.match(CSS, /\.vl-source-logo-media \{[\s\S]*border-radius: 50%/);
});

test('feed cards are YouTube cards: full-width 16:9 media, avatar, title, one meta line, menu', () => {
  assert.match(PAGE, /<VideoThumbnail video=\{video\} priority=\{index === 0\} \/>/);
  assert.match(PAGE, /className={`vl-video-card/);
  assert.match(PAGE, /<ChannelAvatar video=\{video\} channel=\{channel\} \/>/);
  assert.match(PAGE, /className="vl-card-meta">\{getVideoMetaLine\(video\)\}/);
  assert.match(PAGE, /className="vl-card-menu-button"[\s\S]{0,300}setCardMenuVideo\(video\)/);
  assert.match(CSS, /\.vl-video-grid \{[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(CSS, /\.vl-video-thumb[\s\S]*aspect-ratio: 16 \/ 9/);
  assert.match(CSS, /\.vl-card-info \{[\s\S]*grid-template-columns: 36px minmax\(0, 1fr\) 44px/);
  assert.match(CSS, /\.vl-card-info \{[\s\S]*pointer-events: none/);
  assert.match(CSS, /\.vl-card-menu-button \{[\s\S]*pointer-events: auto/);
  assert.match(CSS, /\.vl-media-failed::after \{[\s\S]*Preview unavailable/);
  // Columns grow with the screen, phone first.
  assert.match(CSS, /@media \(min-width: 600px\)[\s\S]*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(CSS, /@media \(min-width: 1000px\)[\s\S]*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(CSS, /@media \(min-width: 1400px\)[\s\S]*repeat\(4, minmax\(0, 1fr\)\)/);
});

test('a creator line never shows a raw database id', () => {
  // Phase 2 (2026-10-12): the card copy moved to a module the watch pages share.
  assert.match(CARDS, /const UUID_LIKE = /);
  assert.match(CARDS, /export function getVideoChannel\(video\)/);
  assert.match(CARDS, /find\(value => value && !UUID_LIKE\.test\(value\)\)/);
  assert.match(PAGE, /from '\.\.\/\.\.\/src\/lib\/videoLibraryCards'/);
  assert.doesNotMatch(PAGE, /\{video\.source\.replace\('_', ' '\)\}/);
  assert.doesNotMatch(PAGE, /\{selectedVideo\.source\.replace\('_', ' '\)\}/);
});

test('the watch page pins the player above the details, Up Next beside it on desktop', () => {
  assert.match(PAGE, /className="vl-watch-player"/);
  assert.match(CSS, /\.vl-watch-player \{[\s\S]*position: sticky/);
  assert.match(CSS, /\.vl-player-stage \{[\s\S]*aspect-ratio: 16 \/ 9/);
  assert.match(CSS, /\.vl-watch \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) 400px/);
  // Actions wrap to a second line instead of sliding sideways.
  assert.match(CSS, /\.vl-hud \{[\s\S]*flex-wrap: wrap/);
});

test('loading, empty, sync-error, playback-error, playlist, and training states remain wired', () => {
  assert.match(PAGE, /className="vl-video-skeleton"/);
  assert.match(PAGE, /className="vl-empty-state"/);
  assert.match(PAGE, /className="vl-sync-panel is-error"/);
  assert.match(PAGE, /className="vl-youtube-error" role="alert"/);
  assert.match(PAGE, /aria-labelledby="vl-playlist-title"/);
  assert.match(PAGE, /aria-labelledby="vl-tts-title"/);
  assert.match(PAGE, /onClick=\{handleCloseVideo\}>Close Viewer<\/button>/);
  assert.match(PAGE, /Open On YouTube/);
});

test('account-scoped mutations invalidate stale completions and stale local filters', () => {
  assert.match(PAGE, /ownerScopeRef\.current\.activate\(userId\)/);
  assert.match(PAGE, /pendingVideoActionsRef\.current\.clear\(\)/);
  assert.match(PAGE, /watchStartTimeRef\.current = null/);
  assert.match(PAGE, /libraryStateOwnerId === \(userId \|\| null\)/);
  assert.ok((PAGE.match(/ownerScopeRef\.current\.commit\(ownerToken/g) || []).length >= 8);
  assert.ok((PAGE.match(/ownerScopeRef\.current\.isCurrent\(ownerToken\)/g) || []).length >= 18);
  for (const mutation of [
    'updateVideoLibraryPreferences',
    'addVideoFavorite',
    'addToWatchLater',
    'removeFromWatchHistory',
    'getRecentlyWatched',
    'addVideoToPlaylist',
  ]) {
    assert.match(PAGE, new RegExp(`ownerToken[\\s\\S]{0,2600}${mutation}`), `${mutation} must capture an owner token before dispatch`);
  }
  assert.match(PAGE, /Old localStorage values from retired filters fail closed/);
  assert.match(PAGE, /\['ALL', 'cash', 'tournament', 'slots', 'sports'\]\.includes\(filters\.selectedType\)/);
  assert.doesNotMatch(PAGE, /catch\s*\([^)]*\)\s*=>\s*\{\s*\}/);
});

test('the 375px budget holds: no text under 12px and every control is a 44px target', () => {
  // Global Footer E2E measures this on the live build (e2e/mobile-budget.spec.ts).
  for (const size of CSS.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) {
    assert.ok(Number(size[1]) >= 12, `font-size ${size[1]}px is under the 12px floor`);
  }
  assert.match(CSS, /\.vl-card-menu-button \{[\s\S]*width: 44px;[\s\S]*height: 44px/);
});

test('no emoji or decorative glyphs ship in the page source', () => {
  assert.doesNotMatch(`${PAGE}\n${RAIL}`, /[▶★☆◆◇●○◀▲▼☰✕×🔊🎤⏸⏯]/u);
  assert.doesNotMatch(PAGE, /<svg\b/i);
});
