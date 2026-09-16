/**
 * POKER NEAR ME: MOBILE PHASE 3 UPGRADES STAY APPLIED.
 *
 * Phase 3 (2026-09-04) rebuilt Poker Near Me (pages/hub/poker-near-me/lobby.js
 * and [pnmTab].js) on the phase 0 foundation and the always-displayed
 * standard: no swipe navigation, no tab that unmounts content (every surface
 * is a stacked section and the tab rows are anchor jump lists), no hidden
 * horizontal rail, HubPageShell, the 8s load failsafe, the offline guard,
 * haptics, back-gesture sheets, no 100vh, no window.innerWidth render
 * decisions, no text under 12px anywhere on the route, a ResponsiveTable in
 * VenueCompare, and an eight-step tutorial registered for the whole prefix.
 * Each pin below is one of those, so a later edit cannot quietly undo it.
 *
 * Changelog: docs/changelog/2026-09-04-mobile-phase3-poker-near-me.md
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const EM_DASH = String.fromCharCode(0x2014);

const TAB_PAGE = 'pages/hub/poker-near-me/[pnmTab].js';
const LOBBY_PAGE = 'pages/hub/poker-near-me/lobby.js';
const PAGES = [TAB_PAGE, LOBBY_PAGE];
const CSS_FILES = [
  'src/styles/worlds/poker-near-me.css',
  'src/styles/worlds/poker-near-me-lobby.css',
  'styles/poker-near-me.css',
];
const TUTORIAL = 'src/tutorials/poker-near-me.js';
const COMPONENT_DIR = 'src/components/poker-near-me';
const STATE_PAGES = [
  'pages/hub/poker-near-me/in/index.js',
  'pages/hub/poker-near-me/in/[state]/index.js',
  'pages/hub/poker-near-me/in/[state]/[city].js',
];

function walk(dir) {
  const full = path.join(ROOT, dir);
  return fs.readdirSync(full).flatMap((entry) => {
    const rel = path.join(dir, entry);
    return fs.statSync(path.join(ROOT, rel)).isDirectory() ? walk(rel) : [rel];
  });
}

const COMPONENT_FILES = walk(COMPONENT_DIR).filter((f) => /\.(js|jsx)$/.test(f));
const ROUTE_FILES = [...PAGES, ...CSS_FILES, ...STATE_PAGES, ...COMPONENT_FILES];

// Source with comments removed: the files explain what they replaced, and a
// pin must judge the code, not the explanation.
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('both pages are built on the phase 0a foundation', () => {
  for (const page of PAGES) {
    const src = read(page);
    assert.match(src, /import HubPageShell from '\.\.\/\.\.\/\.\.\/src\/components\/ui\/HubPageShell'/, `${page} imports HubPageShell`);
    assert.match(src, /<HubPageShell\s+className="pnm"\s+maxWidth=\{1080\}/, `${page} renders the pnm shell`);
    assert.match(src, /useLoadFailsafe\(loading, setLoading\)/, `${page} has the 8s failsafe`);
    assert.match(src, /useInitialLoadRef\(\)/, `${page} keeps background refreshes off the skeleton`);
    assert.match(src, /useOnlineStatus\(\)/, `${page} reads the online flag`);
    assert.match(src, /OFFLINE_TOAST/, `${page} explains offline`);
    assert.match(src, /useHaptics\(\)/, `${page} has haptics`);
    assert.match(src, /useModalHistory\(/, `${page} wires the back gesture`);
    assert.match(src, /<PullToRefresh onRefresh=\{[a-zA-Z]+\} disabled=\{anySheetOpen\}>/, `${page} has pull to refresh`);
    assert.match(src, /TUTORIAL_WILL_OPEN_EVENT/, `${page} returns to the top when the tour opens`);
    assert.doesNotMatch(src, /100vh/, `${page}: no 100vh`);
    assert.doesNotMatch(src, /paddingBottom:\s*70/, `${page}: no page-owned bottom clearance`);
    assert.doesNotMatch(stripComments(src), /window\.innerWidth|matchMedia\(|isMobile/, `${page}: no viewport width decides a render`);
    assert.doesNotMatch(src, /scrollbarWidth:\s*'none'/, `${page}: no hidden scrollbar`);
    assert.doesNotMatch(src, /InteractiveTutorial|PNM_TAB_TUTORIALS|replayTutorial|requestPageTutorial|openPageTutorial/, `${page} never mounts or launches a tour itself`);
  }
});

test('the discovery page has no swipe navigation and no tab that hides content', () => {
  const src = stripComments(read(TAB_PAGE));
  assert.doesNotMatch(src, /onTouchStart|onTouchMove|onTouchEnd/, 'no touch handler on the page');
  assert.doesNotMatch(src, /useDiscoveryGestureController|handleTouchStart|handlePullStart/, 'the gesture controller is gone');
  assert.doesNotMatch(src, /const renderContent = /, 'no active-tab switch');
  assert.doesNotMatch(src, /role="tabpanel"|role="tablist"/, 'the anchor row is not a tab bar');
  assert.match(src, /PRIMARY_SECTIONS\.map\(\(tab\) => \(\s*<React\.Fragment key=\{tab\.key\}>\{stackedSections\[tab\.key\]\}/, 'every section renders in document order');
  for (const key of ['venues', 'events', 'live', 'map', 'saved', 'more']) {
    assert.match(src, new RegExp(`id=\\{sectionId\\('${key}'\\)\\}`), `section ${key} is on the page`);
  }
  for (const key of ['daily', 'tours', 'series', 'calendar']) {
    assert.match(src, new RegExp(`id=\\{sectionId\\('${key}'\\)\\}`), `events sub-surface ${key} is stacked`);
  }
  assert.match(src, /scrollToSurface\(/, 'a tab tap scrolls to its section');
  assert.match(src, /pushDiscoverySurface\(/, 'the URL still names the surface');
  assert.match(src, /sectionForSlug\(landingSlug\)/, 'a deep link lands on its section after paint');
  assert.match(src, /<LazyPanel/, 'heavy panels mount when scrolled near');
  const more = stripComments(read(`${COMPONENT_DIR}/MoreTabPanel.jsx`));
  assert.doesNotMatch(more, /activeMoreTab === '/, 'the More tools are stacked, not switched');
  for (const key of ['besttime', 'roadtrip', 'social', 'alerts', 'nearmenow', 'tripcost']) {
    assert.match(more, new RegExp(`id=\\{sectionId\\('${key}'\\)\\}`), `tool ${key} is stacked`);
  }
  const sections = read(`${COMPONENT_DIR}/pnmSections.js`);
  assert.match(sections, /--sp-header-height/, 'the anchor scroll offsets by the published header height');
  const lazy = read(`${COMPONENT_DIR}/LazyPanel.jsx`);
  assert.match(lazy, /IntersectionObserver/);
  assert.match(lazy, /rootMargin = '600px 0px'/);
  assert.match(lazy, /typeof window === 'undefined'/, 'LazyPanel is SSR-safe');
});

test('every mutation is guarded by the online check and the primary taps have a haptic', () => {
  const tab = read(TAB_PAGE);
  assert.match(tab, /const toggleFavorite = useCallback\([\s\S]*?if \(!requireOnline\(\)\) return;\s*haptic\('light'\);/, 'favourite is guarded and buzzes');
  assert.match(tab, /const updatePreference = useCallback\(\s*async \(key, value\) => \{\s*if \(!requireOnline\(\)\) return;/, 'preferences are guarded');
  assert.match(tab, /const refreshDiscovery = useCallback\(async \(\) => \{\s*if \(!requireOnline\(\)\) return;/, 'pull to refresh is guarded');
  assert.match(tab, /const activateTab = \(val\) => \{\s*haptic\('light'\);/, 'tab taps buzz');
  assert.match(tab, /const requestGpsLocation = \(\) => \{\s*haptic\('light'\);/, 'GPS buzzes');
  const lobby = read(LOBBY_PAGE);
  assert.match(lobby, /const handleToggleFavorite = useCallback\(async \(id, dataObj, type = 'venue'\) => \{\s*if \(!requireOnline\(\)\) return;\s*haptic\('light'\);/);
  assert.match(lobby, /const handlePodClick = useCallback\(\(podId\) => \{\s*playClickSound\(\);\s*haptic\('light'\);/);
  const card = read(`${COMPONENT_DIR}/VenueCard.js`);
  assert.match(card, /const handleCheckinOpen = \(e\) => \{[\s\S]*?if \(!requireOnlineNow\(toast\)\) return;\s*triggerHaptic\('light'\);/, 'check-in is guarded');
  assert.match(card, /const handleCheckinSubmit = async \(\) => \{[\s\S]*?if \(!requireOnlineNow\(toast\)\) return;/);
  const reviews = read(`${COMPONENT_DIR}/VenueReviews.jsx`);
  assert.match(reviews, /const submitReview = async \(\) => \{[\s\S]*?if \(!requireOnlineNow\(toast\)\) return;/, 'review post is guarded');
  assert.match(reviews, /const voteReview = async \(reviewId, action\) => \{\s*if \(!requireOnlineNow\(toast\)\) return;/, 'review vote is guarded');
  const report = read(`${COMPONENT_DIR}/ReportGameModal.jsx`);
  assert.match(report, /const handleSubmit = async \(e\) => \{\s*e\.preventDefault\(\);\s*if \(!requireOnlineNow\(toast\)\) return;/, 'report is guarded');
  const social = read(`${COMPONENT_DIR}/SocialLayer.jsx`);
  assert.match(social, /const copyInviteLink = async \(venueId\) => \{\s*if \(typeof requireOnline === 'function' && !requireOnline\(\)\) return;/, 'invite is guarded');
});

test('every overlay the pages open is a back-gesture sheet with a 44px close', () => {
  const sheets = {
    'src/components/poker-near-me/VenueReviews.jsx': [/useModalHistory\(!!isOpen, onClose\)/, /useScrimDismiss\(onClose\)/, /@media \(max-width: 600px\)/, /\.vr-handle \{ display: block; width: 44px; height: 4px;/, /\.vr-textarea \{ font-size: 16px; \}/],
    'src/components/poker-near-me/VenueCard.js': [/useModalHistory\(checkinModal, closeCheckin\)/, /useScrimDismiss\(closeCheckin\)/, /@media \(max-width: 600px\)/, /\.vc3-checkin-handle \{ display: block; width: 44px; height: 4px;/, /\.vc3-checkin-textarea \{ font-size: 16px; \}/],
    'src/components/poker-near-me/ReportGameModal.jsx': [/useModalHistory\(!!isOpen, onClose\)/, /useScrimDismiss\(onClose\)/, /@media \(max-width: 600px\)/, /\.rgm-handle \{ display: block; width: 44px; height: 4px;/, /width: 44, height: 44, minWidth: 44, minHeight: 44/],
    'src/components/poker-near-me/SocialLayer.jsx': [/useModalHistory\(!!inviteModal, closeInvite\)/, /useScrimDismiss\(closeInvite\)/, /<PokerNearMePanelShell[\s\S]*?role="dialog"[\s\S]*?aria-modal="true"/, /<PokerNearMeConsoleIcon name="close" \/>/],
    'src/components/poker-near-me/GlobalSearchOverlay.jsx': [/useModalHistory\(!!isOpen, onClose\)/, /safe-area-inset-top/],
  };
  for (const [file, pins] of Object.entries(sheets)) {
    const src = read(file);
    for (const pin of pins) assert.match(src, pin, `${file} ${pin}`);
  }
  const lobby = read(LOBBY_PAGE);
  for (const pin of [
    /useModalHistory\(showPanel && !!panelContent, closePanel\)/,
    /useModalHistory\(showVoiceSearch, closeVoiceSearch\)/,
    /useModalHistory\(showLoginPrompt, closeLoginPrompt\)/,
    /useModalHistory\(showEnablePopup, closeEnablePopup\)/,
    /useModalHistory\(showManualLocation, closeManualLocation\)/,
    /useScrimDismiss\(closeVoiceSearch\)/,
    /className="pnm-sheet-scrim"/,
    /className="sp-icon-btn pnm-sheet__close"/,
    /paddingTop: 'calc\(env\(safe-area-inset-top, 0px\) \+ 12px\)'/,
  ]) assert.match(lobby, pin, `lobby ${pin}`);
  assert.match(read(TAB_PAGE), /useModalHistory\(iframeModal\.isOpen, closeIframeModal\)/);
  const css = read('styles/poker-near-me.css');
  assert.match(css, /\.pnm-sheet__close \{[^}]*min-width: 44px;[^}]*min-height: 44px;/s);
  assert.match(css, /@media \(max-width: 600px\) \{\s*\.pnm-sheet-scrim \{ align-items: flex-end;/);
  const consoleToolsCss = read('src/styles/worlds/poker-near-me-console-tools.css');
  assert.match(consoleToolsCss, /\.sl-modal-close[\s\S]*?width: 44px;[\s\S]*?height: 44px;/, 'the painted close control keeps its 44px target');
  assert.match(consoleToolsCss, /@media \(max-width: 600px\) \{[\s\S]*?\.social-layer \.sl-modal-overlay \{[\s\S]*?align-items: end;/, 'the painted invite dialog remains a mobile bottom sheet');
  assert.match(consoleToolsCss, /@media \(max-width: 600px\) \{[\s\S]*?\.social-layer \.sl-invite-link-input \{[\s\S]*?font-size: 16px;/, 'the mobile invite field avoids browser zoom');
});

test('no rail, no snap, no hidden scrollbar, no label cull: everything wraps', () => {
  const world = read('src/styles/worlds/poker-near-me.css');
  const lobbyCss = read('src/styles/worlds/poker-near-me-lobby.css');
  const rootCss = read('styles/poker-near-me.css');
  for (const [name, css] of [['world', world], ['lobby', lobbyCss], ['root', rootCss]]) {
    assert.doesNotMatch(css, /scrollbar-width:\s*none/, `${name}: no hidden scrollbar`);
    assert.doesNotMatch(css, /scroll-snap/, `${name}: no snap`);
    assert.doesNotMatch(css, /::-webkit-scrollbar\s*\{\s*display:\s*none/, `${name}: no hidden webkit scrollbar`);
    assert.doesNotMatch(css, /overflow-x:\s*auto/, `${name}: nothing scrolls sideways`);
    assert.doesNotMatch(css, /flex:\s*0 0 \d+px/, `${name}: no rail basis`);
    assert.doesNotMatch(css, /overflow-x:\s*hidden\s*;(?![^}]*overflow-(x|y))/, `${name}: no bare overflow-x hidden`);
  }
  assert.doesNotMatch(world, /\.pnm-family-nav__label\s*\{\s*display:\s*none/, 'the family nav label is never culled');
  assert.match(world, /\.pnm-family-nav__rail \{[^}]*flex-wrap: wrap;/s, 'the family rail wraps');
  assert.match(world, /\.pnm-status-rail \{[^}]*flex-wrap: wrap;/s, 'the status rail wraps');
  assert.match(world, /\.pnm-family-nav \{[^}]*top: var\(--sp-header-height, 56px\);/s, 'sticky bars use the published header height');
  assert.match(world, /\.pnm-recent-rail__track \{[^}]*grid-template-columns: repeat\(auto-fill, minmax\(170px, 1fr\)\);/s);
  assert.match(rootCss, /\.pnm-top-tabs \{[^}]*flex-wrap: wrap;/s, 'the anchor row wraps');
  assert.match(rootCss, /\.pnm-sub-tabs \{[^}]*flex-wrap: wrap;/s, 'the sub-anchor rows wrap');
  assert.match(rootCss, /\.pnm-chip-strip \{[^}]*flex-wrap: wrap;/s);
  assert.match(rootCss, /\.pnm-page \{[^}]*touch-action: pan-y;/s, 'the page scrolls over the map');
  assert.match(rootCss, /\.map-tab-container \{[^}]*height: clamp\(320px, 55dvh, 520px\);/s, 'the map keeps a fixed height');
  assert.doesNotMatch(rootCss, /\.map-sidebar:hover/, 'no hover-revealed drawer');
  assert.match(lobbyCss, /\.pnm-lobby-page \{[^}]*touch-action: pan-y;/s);
  assert.doesNotMatch(lobbyCss, /height: 100vh|width: 100vw;\s*height/, 'the lobby is document flow');
  const nav = stripComments(read(`${COMPONENT_DIR}/PokerNearMeFamilyNav.jsx`));
  assert.doesNotMatch(nav, /scrollTo\(|scrollLeft/, 'the family nav no longer scrolls a rail');
  const daily = stripComments(read(`${COMPONENT_DIR}/DailyTournamentsPanel.jsx`));
  assert.doesNotMatch(daily, /overflowX: 'auto'|scrollbarWidth/, 'the day and state strips wrap');
  assert.match(daily, /flexWrap: 'wrap'/);
  const bttg = read(`${COMPONENT_DIR}/BestTimeToGoWidget.jsx`);
  assert.doesNotMatch(bttg, /overflow-x: auto/);
  assert.match(bttg, /\.bttg-hm-cells \{ display: grid; grid-template-columns: repeat\(8, minmax\(0, 1fr\)\);/, 'the hour strip is an 8-per-row grid');
  const heat = stripComments(read(`${COMPONENT_DIR}/PeakActivityHeatmap.jsx`));
  assert.doesNotMatch(heat, /overflowX: 'auto'|minWidth: 600/);
  assert.match(heat, /data-allow-small-target="true"/);
  assert.match(heat, /role="gridcell"/);
  const overlay = stripComments(read(`${COMPONENT_DIR}/lobby/LobbyOverlay.jsx`));
  assert.doesNotMatch(overlay, /overflowY: 'auto'|scrollbarWidth/, 'the lobby grid is not an inner scroller');
  assert.doesNotMatch(overlay, /InteractiveTutorial/);
  const lobbyPage = stripComments(read(LOBBY_PAGE));
  assert.doesNotMatch(lobbyPage, /overflowX: 'auto'/, 'the quick pod nav wraps');
});

test('the three stylesheets use only the 900 / 768 / 600 boundaries', () => {
  for (const file of CSS_FILES) {
    const css = read(file);
    const queries = [...css.matchAll(/@media\s*\(([^)]+)\)/g)].map((m) => m[1].trim());
    const widths = queries.filter((q) => /width/.test(q));
    for (const q of widths) {
      assert.match(q, /^(max-width: (900|768|600)px|min-width: (901|769|601)px)$/, `${file}: unexpected breakpoint ${q}`);
    }
    assert.ok(widths.length > 0, `${file} has width queries`);
  }
  for (const page of PAGES) {
    const widths = [...read(page).matchAll(/@media\s*\(([^)]+width[^)]*)\)/g)].map((m) => m[1].trim());
    for (const q of widths) assert.match(q, /^(max-width: (900|768|600)px|min-width: (901|769|601)px)$/, `${page}: unexpected breakpoint ${q}`);
  }
});

test('no text under 12px on the pages, the stylesheets, the components or the state pages', () => {
  const small = [
    /font-size:\s*(?:[0-9]|1[01])(?:\.[0-9]+)?px/,
    /font:\s*[^;]*\b(?:[0-9]|1[01])(?:\.[0-9]+)?px/,
    /fontSize:\s*(?:[0-9]|1[01])(?:\.[0-9]+)?\b(?!\s*:)/,
    /fontSize:\s*'(?:[0-9]|1[01])(?:\.[0-9]+)?px'/,
    /clamp\(\s*(?:[0-9]|1[01])(?:\.[0-9]+)?px[^)]*\)\s*(?:'|;|,)/,
    /font-size:\s*0?\.[0-6][0-9]*r?em/,
  ];
  const offences = ROUTE_FILES.flatMap((f) =>
    read(f).split('\n').map((line, i) => {
      // Padding clamps are not type; only judge a clamp that sets a font.
      const judged = /font/.test(line) ? small : small.slice(0, 4);
      return judged.some((re) => re.test(line)) ? `${f}:${i + 1}: ${line.trim()}` : null;
    }).filter(Boolean)
  );
  assert.deepEqual(offences, [], `text under 12px:\n${offences.join('\n')}`);
});

test('VenueCompare is a ResponsiveTable and no route component keeps a raw table', () => {
  assert.match(read(`${COMPONENT_DIR}/VenueCompare.jsx`), /<ResponsiveTable/);
  assert.doesNotMatch(read(`${COMPONENT_DIR}/VenueCompare.jsx`), /overflowX: 'auto'/);
  const raw = [...PAGES, ...COMPONENT_FILES].filter((f) => /<table\b/.test(stripComments(read(f))));
  assert.deepEqual(raw, [], `raw tables (use ResponsiveTable): ${raw.join(', ')}`);
});

test('the tutorial has eight steps, a prefix registration, and every target on the discovery page', () => {
  const tut = read(TUTORIAL);
  assert.match(tut, /pnm_tutorial_seen_v1/);
  assert.match(tut, /id: 'poker-near-me'/);
  assert.match(tut, /title: 'Poker Near Me'/);
  const stepsBlock = tut.slice(tut.indexOf('steps: ['), tut.lastIndexOf(']'));
  const ids = [...stepsBlock.matchAll(/^\s{4}\{\s*$/gm)];
  assert.equal(ids.length, 8, `expected 8 tutorial steps, found ${ids.length}`);
  assert.ok(!tut.includes(EM_DASH));
  assert.match(tut, /Modelled From Weeks Of Real Observed History/, 'live counts are worded per live-cash-games-policy.md');
  assert.match(tut, /Replay This Tour Any Time From Page Tutorial In The Hamburger Menu/);
  const registry = read('src/tutorials/index.js');
  assert.match(registry, /\{ prefix: '\/hub\/poker-near-me', tutorial: POKER_NEAR_ME_TUTORIAL \}/, 'registered as a PREFIX row (no exact: true)');
  const targets = [...tut.matchAll(/target: '([^']+)'/g)].flatMap((m) => m[1].split('|'));
  const tabDom = [TAB_PAGE, `${COMPONENT_DIR}/MoreTabPanel.jsx`].map(read).join('\n');
  for (const t of targets) assert.match(tabDom, new RegExp(`data-tutorial="${t}"`), `[pnmTab] has data-tutorial="${t}"`);
  // The lobby carries at least six of the eight through its hotspots.
  const lobbyDom = [LOBBY_PAGE, `${COMPONENT_DIR}/lobby/LobbyOverlay.jsx`].map(read).join('\n');
  const onLobby = ['venues', 'live', 'map', 'events', 'saved', 'social', 'nav'].filter((t) => new RegExp(`'${t}'|data-tutorial="${t}"`).test(lobbyDom));
  assert.ok(onLobby.length >= 6, `lobby carries at least six targets (found ${onLobby.join(', ')})`);
  assert.ok(!fs.existsSync(path.join(ROOT, `${COMPONENT_DIR}/InteractiveTutorial.jsx`)), 'the old per-tab walkthrough is retired');
  assert.ok(!fs.existsSync(path.join(ROOT, `${COMPONENT_DIR}/useDiscoveryGestureController.js`)), 'the swipe controller is retired');
  assert.doesNotMatch(read('src/config/hamburgerMenus.js'), /replayTutorial/, 'the menu has one tutorial row: Page Tutorial');
});

test('the budget row is converted and the law lists phase 3', () => {
  const budget = JSON.parse(read('scripts/ci/mobile-budget.json')).routes['/hub/poker-near-me'];
  assert.equal(budget.converted, true);
  assert.ok(budget.jsKb <= 850);
  assert.ok(budget.lcpMs <= 2500);
  // The pin MOVED with phase 4 (2026-09-09), it was not loosened: the list is
  // append-only and what this test cares about is that 3 is still in it, so
  // asserting the exact array would have to be re-edited by every later phase
  // for no gain. Phase 4's own test pins the full array as [1, 2, 3, 4].
  const law = read('__tests__/no-slide-to-see.law.test.mjs');
  const converted = JSON.parse(law.match(/const CONVERTED = (\[[^\]]*\]);/)[1]);
  assert.ok(converted.includes(3), `phase 3 is still in CONVERTED (${converted.join(', ')})`);
  assert.deepEqual(converted.slice(0, 3), [1, 2, 3], 'phases 1 to 3 lead the list, in order');
  assert.match(read('__tests__/page-tutorials.test.mjs'), /phase: 3,\s*route: '\/hub\/poker-near-me'/);
});

test('no em dashes or emoji in the touched files', () => {
  const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  for (const f of [...PAGES, TUTORIAL, `${COMPONENT_DIR}/LazyPanel.jsx`, `${COMPONENT_DIR}/pnmSections.js`, `${COMPONENT_DIR}/MoreTabPanel.jsx`]) {
    const src = read(f);
    assert.ok(!emoji.test(src), `${f} contains an emoji`);
  }
  for (const f of [TUTORIAL, `${COMPONENT_DIR}/LazyPanel.jsx`, `${COMPONENT_DIR}/pnmSections.js`]) {
    assert.ok(!read(f).includes(EM_DASH), `${f} contains an em dash`);
  }
});
