import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const PAGE = read('../pages/hub/video-library.js');
const CSS = read('../src/styles/worlds/video-library.css');
const REELS = read('../src/components/social/Reels.jsx');
const TRAINING_LOG = read('../pages/api/training/log-request.js');
const COMMAND_RAIL = read('../src/components/video-library/VideoLibraryCommandRail.jsx');

test('Reels keeps every hook above conditional render exits', () => {
  const progressHook = REELS.indexOf('const updateProgressRef = useRef(null)');
  const cleanupHook = REELS.indexOf('// Cleanup RAF + interaction timers');
  const loadingExit = REELS.indexOf('if (loading) {', progressHook);

  assert.ok(progressHook > 0, 'progress hook must exist');
  assert.ok(cleanupHook > progressHook, 'timer cleanup must follow the progress hook');
  assert.ok(loadingExit > cleanupHook, 'no loading early return may precede the final hooks');
  assert.equal(REELS.indexOf('const updateProgressRef = useRef(null)', progressHook + 1), -1);
});

test('a Reels failure is contained inside the Video Library modal', () => {
  assert.match(PAGE, /class VideoLibraryReelsBoundary extends Component/);
  assert.match(PAGE, /<VideoLibraryReelsBoundary onClose=/);
  assert.match(PAGE, /<ReelsViewer onClose=/);
  assert.match(CSS, /\.vl-reels-fallback/);
});

test('Favorites, Watch Later, History, and Playlists are first-class command-rail views', () => {
  assert.match(PAGE, /const LIBRARY_VIEW_OPTIONS = \[/);
  assert.match(PAGE, /id: 'favorites'/);
  assert.match(PAGE, /id: 'watchlater'/);
  assert.match(PAGE, /id: 'history'/);
  assert.match(PAGE, /id: 'playlists'/);
  assert.match(COMMAND_RAIL, /data-filter-group="library"/);
  assert.match(COMMAND_RAIL, /onLibrary\(view\.id, event\.currentTarget\)/);
  assert.match(COMMAND_RAIL, /aria-label={`\$\{view\.label\}, \$\{count\}/);
});

test('command-rail selection and shareable query state cannot drift apart', () => {
  assert.match(PAGE, /replaceNavigationQuery\(\{ type: type === 'ALL' \? null : type, filter: null \}\)/);
  assert.match(PAGE, /replaceNavigationQuery\(\{ type: null, filter \}\)/);
  assert.match(PAGE, /source: source === 'ALL' \? null : source,[\s\S]*type: selectedType === 'ALL' \? null : selectedType/);
  assert.match(COMMAND_RAIL, /selectedType === view\.id && libraryFilter === 'ALL'/);
  // PIN MOVED (mobile phase 9, 2026-09-14). These three pinned the RAILS:
  // refs on the command row and the creator row so keepRailButtonInView
  // could scroll the chosen control into a sideways strip. The always-
  // displayed standard forbids the strip; both rows wrap, so the chosen
  // control is on screen by construction and a keyboard choice lands focus.
  assert.doesNotMatch(PAGE, /keepRailButtonInView/);
  assert.doesNotMatch(PAGE, /filterRailRef|sourceRailRef/);
  assert.match(PAGE, /button\?\.focus\?\.\(\);/);
});

test('personal subviews receive distinct responsive identity and signed-out guidance', () => {
  assert.match(PAGE, /const LIBRARY_VIEW_META =/);
  assert.match(PAGE, /className="vl-subview-banner"/);
  assert.match(PAGE, /Sign In To Sync/);
  assert.match(PAGE, /Favorites Need Your Profile/);
  assert.match(PAGE, /History Needs Your Profile/);
  assert.match(CSS, /\.vl-subview-banner/);
  // PIN MOVED (mobile phase 9): the phone block is at the standard's 768px.
  assert.match(CSS, /@media \(max-width: 768px\)[\s\S]*\.vl-subview-banner/);
});

test('mobile cards and supporting sheets keep compact, touch-safe geometry', () => {
  assert.match(CSS, /aspect-ratio: 16 \/ 10 !important/);
  assert.match(CSS, /\.vl-playlist-overlay[\s\S]*backdrop-filter: blur\(14px\)/);
  assert.match(CSS, /\.vl-playlist-dialog[\s\S]*border-radius: 0 !important/);
  assert.match(CSS, /\.vl-playlist-create input,[\s\S]*min-height: 44px/);
  assert.match(CSS, /\.vl-share-button \{[\s\S]*min-height: 44px/);
});

test('runtime warnings and failed training analytics writes remain observable', () => {
  assert.match(PAGE, /fetchpriority=\{index === 0 \? 'high' : 'auto'\}/);
  assert.doesNotMatch(PAGE, /fetchPriority=/);
  assert.match(TRAINING_LOG, /status\(503\)\.json\(\{ ok: false/);
  assert.doesNotMatch(TRAINING_LOG, /status\(200\)\.json\(\{ ok: true, warn:/);
  assert.match(TRAINING_LOG, /applyRateLimit\(req, res, LIMITS\.write\)/);
  assert.match(TRAINING_LOG, /status\(413\)\.json\(\{ error: 'Request body too large' \}\)/);
  assert.match(PAGE, /import \{ getAccessToken \} from '..\/..\/src\/lib\/authUtils'/);
  assert.match(PAGE, /Authorization: `Bearer \$\{analyticsToken\}`/);
});
