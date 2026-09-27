import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const PAGE = read('../pages/hub/video-library.js');
const RAIL = read('../src/components/video-library/VideoLibraryCommandRail.jsx');
const CSS = read('../src/styles/worlds/video-library.css');
const CONSOLE = read('../src/components/video-library/console/VideoLibraryConsole.jsx');
const CONSOLE_CSS = read('../src/components/video-library/console/VideoLibraryConsole.module.css');

const VISUAL_SOURCE = `${PAGE}\n${RAIL}\n${CSS}`;

test('desktop and mobile use the approved painted console hierarchy', () => {
  assert.match(PAGE, /<VideoLibraryConsole[\s\S]*titleAs="h1"/);
  assert.match(PAGE, /<VideoLibraryCommandRail[\s\S]*mode="desktop"/);
  assert.match(PAGE, /<VideoLibraryConsole[\s\S]*<VideoLibraryCommandRail[\s\S]*mode="mobile"/);
  assert.match(RAIL, /<VideoLibraryConsole[\s\S]*className="vl-command-console"/);
  assert.match(RAIL, /if \(mode === 'mobile'\)[\s\S]*<nav className="vl-command-rail-mobile"/);
  assert.match(CSS, /@media \(max-width: 768px\)[\s\S]*\.vl-command-rail \{[\s\S]*display: none/);
  assert.match(CSS, /@media \(max-width: 768px\)[\s\S]*\.vl-command-rail-mobile \{[\s\S]*display: block/);
});

test('the chassis is sourced only from the approved master artwork slices', () => {
  assert.match(CONSOLE_CSS, /spade-console-v1\/top\.png/);
  assert.match(CONSOLE_CSS, /spade-console-v1\/mid\.png/);
  assert.match(CONSOLE_CSS, /spade-console-v1\/bottom-foot\.png/);
  assert.match(CONSOLE_CSS, /spade-console-v1\/bottom-plates\.png/);
  assert.match(CONSOLE, /useFitText/);
  assert.match(CONSOLE, /ConsolePlateButton/);
  assert.match(CONSOLE, /ConsoleDataRow/);
});

test('reachable Video Library UI contains no generic constructed visual language', () => {
  assert.doesNotMatch(VISUAL_SOURCE, /linear-gradient|radial-gradient/i);
  assert.doesNotMatch(VISUAL_SOURCE, /border-radius|borderRadius/);
  assert.doesNotMatch(VISUAL_SOURCE, /box-shadow|boxShadow/);
  assert.doesNotMatch(VISUAL_SOURCE, /:hover/);
  assert.doesNotMatch(VISUAL_SOURCE, /<svg\b/i);
  assert.doesNotMatch(VISUAL_SOURCE, /[▶★☆◆◇●○◀▲▼☰✕×🔊🎤⏸⏯]/u);
  assert.doesNotMatch(PAGE, /metal-frame|video-card-metal|sp-icon-btn|YouTubeErrorOverlay/);
  assert.doesNotMatch(PAGE, /style=\{\{(?!\s*'--vl-progress')/);
});

test('real media remains primary while cards render as engraved scan rows', () => {
  assert.match(PAGE, /src=\{getThumbnail\(video\.videoId\)\}/);
  assert.match(PAGE, /src=\{source\.logo\}/);
  assert.match(PAGE, /className={`vl-video-card/);
  assert.match(CSS, /\.vl-video-grid \{[\s\S]*flex-direction: column/);
  assert.match(CSS, /\.vl-video-card \{[\s\S]*grid-template-columns:[\s\S]*border-block-end: 1px solid var\(--vl-rule\)/);
  assert.match(CSS, /\.vl-card-info \{[\s\S]*pointer-events: none/);
  assert.match(CSS, /\.vl-card-meta button \{[\s\S]*pointer-events: auto/);
  assert.match(CSS, /\.vl-media-failed::after \{[\s\S]*Preview unavailable/);
});

test('375 and 393 layouts expose a swipeable command rail without hiding its scroll affordance', () => {
  assert.match(CSS, /@media \(max-width: 393px\)/);
  assert.match(CSS, /@media \(max-width: 375px\)/);
  assert.match(CSS, /\.vl-type-toggle-row--mobile \{[\s\S]*overflow-x: auto[\s\S]*flex-wrap: nowrap/);
  assert.match(CSS, /\.vl-type-toggle-row--mobile \{[\s\S]*scrollbar-width: thin/);
  assert.match(CSS, /\.vl-type-toggle-row--mobile \.vl-filter-button \{[\s\S]*flex: 0 0 auto[\s\S]*min-width: max-content[\s\S]*white-space: nowrap/);
  assert.doesNotMatch(CSS, /\.vl-type-toggle-row--mobile\s*\{[^}]*grid-template-columns/);
  assert.doesNotMatch(CSS, /scroll-snap-type: x mandatory/);
  assert.doesNotMatch(CSS, /\.vl-type-toggle-row--mobile::\-webkit-scrollbar\s*\{\s*display:\s*none/);
  assert.match(CSS, /grid-template-columns: minmax\(108px, 41%\) minmax\(0, 1fr\)/);
  assert.match(CSS, /grid-template-columns: minmax\(102px, 40%\) minmax\(0, 1fr\)/);
});

test('late desktop shell rules cannot override the 375 and 393 edge treatment', () => {
  assert.match(CSS, /@media \(min-width: 769px\) \{[\s\S]*\.video-library-page \{[^}]*padding: 20px/);
  assert.match(CSS, /@media \(max-width: 393px\) \{[\s\S]*\.video-library-page \{[^}]*padding-inline: 3px/);
  assert.match(CSS, /@media \(max-width: 393px\) \{[\s\S]*\.vl-header-area \{[^}]*margin-inline: -3px/);
});

test('loading, empty, sync-error, playback-error, playlist, and training states remain wired', () => {
  assert.match(PAGE, /className="vl-video-skeleton"/);
  assert.match(PAGE, /className="vl-empty-state"/);
  assert.match(PAGE, /className="vl-sync-panel is-error"/);
  assert.match(PAGE, /className="vl-youtube-error" role="alert"/);
  assert.match(PAGE, /aria-labelledby="vl-playlist-title"/);
  assert.match(PAGE, /aria-labelledby="vl-tts-title"/);
  assert.match(PAGE, /secondary: \{ label: 'Close Viewer', onClick: handleCloseVideo \}/);
  assert.match(PAGE, /primary: \{[\s\S]*label: 'Open On YouTube'[\s\S]*onClick:/);
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
  assert.match(PAGE, /\['ALL', 'cash', 'tournament', 'slots'\]\.includes\(filters\.selectedType\)/);
  assert.doesNotMatch(PAGE, /catch\s*\([^)]*\)\s*=>\s*\{\s*\}/);
});
