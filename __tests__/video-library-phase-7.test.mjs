import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const PAGE = read('../pages/hub/video-library.js');
const CSS = read('../src/styles/worlds/video-library.css');
const REELS = read('../src/components/social/Reels.jsx');
const TRAINING_LOG = read('../pages/api/training/log-request.js');
const COMMAND_RAIL = read('../src/components/video-library/VideoLibraryCommandRail.jsx');
const THUMBNAIL = read('../src/components/video-library/VideoThumbnail.jsx');

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
  assert.match(COMMAND_RAIL, /aria-label=\{view\.id === 'recommended' \? view\.label : `\$\{view\.label\}, \$\{count\}/);
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
  // OWNER UPDATE (YouTube layout, 2026-10-11): the stylesheet is mobile first,
  // so the banner's phone styling is the base rule, and signing in is a button.
  assert.match(PAGE, /<button[\s\S]{0,200}auth\/login\?redirect=[\s\S]{0,120}Sign In To Sync/);
});

test('mobile cards and supporting sheets keep 16:9 media and touch-safe geometry', () => {
  // OWNER UPDATE (YouTube layout, 2026-10-11): the scan rows became YouTube
  // cards and the consoles became plain sheets. Touch targets stay 44px.
  assert.match(CSS, /aspect-ratio: 16 \/ 9/);
  assert.match(CSS, /\.vl-playlist-overlay,[\s\S]*position: fixed/);
  assert.match(CSS, /\.vl-playlist-create input \{[\s\S]*min-height: 44px/);
  assert.match(CSS, /\.vl-card-menu-button \{[\s\S]*height: 44px/);
  assert.match(CSS, /\.vl-hud button \{[\s\S]*min-height: 44px/);
});

test('runtime warnings and failed training analytics writes remain observable', () => {
  // Phase 1 (2026-10-12): the first card's image keeps its high fetch
  // priority through the shared VideoThumbnail element.
  assert.match(THUMBNAIL, /fetchpriority=\{priority \? 'high' : 'auto'\}/);
  assert.match(PAGE, /<VideoThumbnail video=\{video\} priority=\{index === 0\} \/>/);
  assert.doesNotMatch(PAGE, /fetchPriority=/);
  assert.match(TRAINING_LOG, /status\(503\)\.json\(\{ ok: false/);
  assert.doesNotMatch(TRAINING_LOG, /status\(200\)\.json\(\{ ok: true, warn:/);
  assert.match(TRAINING_LOG, /applyRateLimit\(req, res, LIMITS\.write\)/);
  assert.match(TRAINING_LOG, /status\(413\)\.json\(\{ error: 'Request body too large' \}\)/);
  assert.match(PAGE, /import \{ getAccessToken \} from '..\/..\/src\/lib\/authUtils'/);
  assert.match(PAGE, /Authorization: `Bearer \$\{analyticsToken\}`/);
});

test('library refresh is explicit and progress writes preserve catalog dependency identity', async () => {
  assert.doesNotMatch(PAGE, /PullToRefresh|refreshOnVisible|addEventListener\('focus', refreshUserLibrary/);
  assert.match(PAGE, /onClick=\{\(\) => void refreshLibrary\(\)\}>Refresh Library/);
  // Execute the actual selected-membership hook from the page through unrelated
  // saved-state updates, rather than recreating its identity rules in a mock.
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const React = require('react');
  const { act, create } = require('react-test-renderer');
  const start = PAGE.indexOf('    const personalIdsKey = ');
  const end = PAGE.indexOf('\n', PAGE.indexOf('const personalIdsForFilter = ', start));
  const select = new Function('useMemo', 'libraryFilter', 'favorites', 'watchLater', 'watchedVideos', 'playlistVideoIds', `${PAGE.slice(start, end)}\nreturn personalIdsForFilter;`);
  let result, root;
  const defaults = { libraryFilter: 'ALL', favorites: new Set(['favorite']), watchLater: new Set(), watchedVideos: new Set(), playlistVideoIds: new Set() };
  function Probe(props) { result = select(React.useMemo, props.libraryFilter, props.favorites, props.watchLater, props.watchedVideos, props.playlistVideoIds); return null; }
  act(() => { root = create(React.createElement(Probe, defaults)); });
  const browseIds = result;
  act(() => root.update(React.createElement(Probe, { ...defaults, watchedVideos: new Set(['just-watched']) })));
  assert.equal(result, browseIds, 'watch progress cannot refetch All Videos');
  act(() => root.update(React.createElement(Probe, { ...defaults, libraryFilter: 'favorites' })));
  const favoritesIds = result;
  act(() => root.update(React.createElement(Probe, { ...defaults, libraryFilter: 'favorites', favorites: new Set(['favorite']), watchedVideos: new Set(['another']) })));
  assert.equal(result, favoritesIds, 'equal membership cannot restart a request');
  act(() => root.update(React.createElement(Probe, { ...defaults, libraryFilter: 'favorites', favorites: new Set(['favorite', 'new']) })));
  assert.notEqual(result, favoritesIds, 'changed filter membership still loads its actual catalog');
  assert.deepEqual(result, ['favorite', 'new']);
  act(() => root.unmount());
});

test('premium media recovers through missing sizes and descriptions stop at full words', async () => {
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url), React = require('react');
  const { act, create } = require('react-test-renderer'), ts = require('typescript');
  const curation = await import('../src/lib/videoLibraryCuration.mjs');
  const playback = await import('../src/lib/videoLibraryPlayback.mjs');
  const load = path => {
    const code = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, allowJs: true } }).outputText;
    const module = { exports: {} };
    new Function('require', 'module', 'exports', code)(name => name.includes('Curation') ? curation : name.includes('Playback') ? playback : require(name), module, module.exports);
    return module.exports;
  };
  const Thumbnail = load('../src/components/video-library/VideoThumbnail.jsx').default;
  let root;
  act(() => { root = create(React.createElement(Thumbnail, { video: { videoId: 'abcdefghijk' } })); });
  const props = root.root.findByType('img').props;
  const classes = new Set(), image = { src: props.src, naturalWidth: 120, hidden: false, getAttribute() { return this.src; }, parentElement: { classList: { add: v => classes.add(v), remove: v => classes.delete(v) } } };
  assert.match(image.src, /maxresdefault/);
  props.onLoad({ type: 'load', currentTarget: image });
  assert.match(image.src, /sddefault/, 'HTTP 200 placeholders fall back');
  for (let index = 0; index < 4; index++) props.onError({ type: 'error', currentTarget: image });
  assert.equal(image.hidden, true);
  assert.ok(classes.has('vl-media-failed'));
  image.naturalWidth = 1280;
  props.onLoad({ type: 'load', currentTarget: image });
  assert.equal(image.hidden, false);
  assert.ok(!classes.has('vl-media-failed'));
  act(() => root.unmount());
  const Description = load('../src/components/video-library/WatchPlaybackTools.jsx').WatchDescription;
  const words = Array.from({ length: 60 }, (_, i) => `WholeWord${i}`);
  act(() => { root = create(React.createElement(Description, { text: words.join(' ') })); });
  assert.equal(root.root.findByType('p').children.join(''), words.slice(0, 45).join(' '));
  act(() => root.root.findByType('button').props.onClick());
  assert.equal(root.root.findByType('p').children.join(''), words.join(' '));
  act(() => root.unmount());
  assert.doesNotMatch(CSS, /text-overflow:\s*ellipsis|line-clamp:/);
  assert.match(CSS, /\.vl-source-logo-media img \{[^}]*object-fit: contain/);
});
