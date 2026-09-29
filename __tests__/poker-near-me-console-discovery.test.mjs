import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

const surfaces = read('src/styles/worlds/poker-near-me-console-surfaces.css');
const dialogs = read('src/styles/worlds/poker-near-me-console-dialogs.css');
const nav = read('src/styles/worlds/poker-near-me-console-nav.css');
const navComponent = read('src/components/poker-near-me/PokerNearMeFamilyNav.jsx');
const eventsCalendar = read('pages/hub/events-calendar.js');
const dailyTournamentsPage = read('pages/hub/daily-tournaments.js');
const pnmTab = read('pages/hub/poker-near-me/[pnmTab].js');
const favorites = read('src/components/poker-near-me/FavoritesTabPanel.jsx');
const liveGames = read('src/components/poker-near-me/LiveGamesFeed.jsx');
const dailyTab = read('src/components/poker-near-me/DailyTournamentsTabPanel.jsx');

/* ------------------------------------------------------------------ *
 * 1. Generic form controls sit on painted art, not on flat CSS boxes.
 * ------------------------------------------------------------------ */

test('every discovery filter control is seated on approved painted art', () => {
  // The older discovery finish paints `.pnm-page :is(input, select, textarea)`
  // with a flat fill, a 1px seam and an inset shadow at specificity 0,3,1.
  // Each control below has to outrank that frame, or the filters go back to
  // being flat boxes on the five routes this restoration is about.
  for (const control of [
    '.ec-filter-select.ec-filter-select',
    '.daily-filter-input.daily-filter-input',
    '.sort-select.sort-select',
    '.pnm-filter-select.pnm-filter-select',
    '.sort-results-select.sort-results-select',
    '.tc-input.tc-input',
  ]) {
    assert.ok(
      surfaces.includes(`body.world-poker-near-me ${control}`),
      `${control} must be re-seated above the legacy generic input frame`,
    );
  }

  const wellBlock = surfaces.slice(surfaces.indexOf('.ec-filter-select.ec-filter-select'));
  assert.match(wellBlock, /painted-controls-v1\/button-secondary\.png/);
  assert.match(wellBlock, /painted-controls-v1\/search-well\.webp/);
  assert.match(wellBlock, /painted-controls-v1\/button-primary\.png/);
});

test('the painted control layer draws no chrome of its own', () => {
  const block = surfaces.slice(surfaces.indexOf('Painted discovery form controls'));
  assert.doesNotMatch(block, /(?:linear|radial|conic)-gradient\(/i, 'chrome comes from the artwork');
  assert.doesNotMatch(block, /box-shadow:(?!\s*none)/i, 'no CSS-built depth');
  assert.doesNotMatch(block, /border-radius:(?!\s*0)/i, 'no CSS-built corners');
  assert.doesNotMatch(block, /:hover/i, 'phones do not hover');
  assert.doesNotMatch(block, /backdrop-filter:(?!\s*none)/i, 'no glassmorphism');
  assert.doesNotMatch(block, /background-size:\s*100% 100%/i, 'painted art is never stretched');
});

test('a native select or date field keeps a 44px target and cannot zoom iOS', () => {
  const block = surfaces.slice(surfaces.indexOf('Painted discovery form controls'));
  assert.match(block, /min-height:\s*44px\s*!important/);
  assert.match(block, /font-size:\s*clamp\(16px, 1\.05vw, 18px\)\s*!important/, 'a 16px floor keeps iOS from zooming');
  assert.doesNotMatch(block, /font-size:[^;]*cqw/, 'these controls have no container ancestor, so cqw would resolve against the viewport');
  assert.match(block, /appearance:\s*auto/, 'a native select keeps its own affordance');
  assert.match(block, /:focus-visible/, 'keyboard focus is deliberate');
  assert.match(block, /:disabled/, 'the disabled state is deliberate');
});

/* ------------------------------------------------------------------ *
 * 2. Flat call-to-action buttons became painted plates.
 * ------------------------------------------------------------------ */

test('the saved tab empty and loading states are painted panels, not flat cards', () => {
  assert.match(favorites, /PokerNearMePanelShell/);
  assert.match(favorites, /PokerNearMeConsoleIcon name="saved"/);
  assert.match(favorites, /className="pnm-console-cta pnm-console-cta--primary"/);
  assert.match(favorites, /aria-busy="true"/);
  assert.match(favorites, /role="status"/);
  assert.match(favorites, /aria-live="polite"/);
  assert.doesNotMatch(favorites, /borderRadius/, 'no CSS-built corners in the saved states');
  assert.doesNotMatch(favorites, /boxShadow/, 'no CSS-built depth in the saved states');
  assert.doesNotMatch(favorites, /radial-gradient/, 'no gradients behind a painted panel');
  assert.doesNotMatch(favorites, /<svg/i, 'no flat vector icon families');
  assert.match(favorites, /setActiveTab\('venues'\)/, 'the explore handler is preserved');
});

test('the live games feed controls print on plates and keep their handlers', () => {
  assert.match(liveGames, /className="lgf-search-input"/);
  assert.match(liveGames, /className="lgf-search-clear"/);
  assert.match(liveGames, /className="pnm-console-cta pnm-console-cta--primary"/);
  const ctas = liveGames.match(/className="pnm-console-cta"/g) || [];
  assert.ok(ctas.length >= 4, `expected the flat feed buttons on plates, found ${ctas.length}`);
  assert.match(liveGames, /onClick=\{\(\) => fetchGlobalLiveData\(true\)\}/);
  assert.match(liveGames, /onClick=\{\(\) => toggleBreakdown\(venueSlug\)\}/);
  assert.match(liveGames, /onClick=\{\(\) => setLiveVisibleCount\(\(n\) => n \+ PAGE_SIZE_LIVE\)\}/);
  assert.match(liveGames, /aria-busy=\{isRefreshing\}/);
  assert.match(liveGames, /onChange=\{\(e\) => handleSearchInput\(e\.target\.value\)\}/);
  assert.match(liveGames, /onClick=\{handleClearSearch\}/);
  assert.match(liveGames, /aria-label="Search live venues"/);
  assert.match(liveGames, /aria-label="Clear search"/);
});

test('the daily tournaments card action is a painted plate', () => {
  assert.match(dailyTab, /className="action-btn primary pnm-console-cta pnm-console-cta--primary"/);
  assert.match(dailyTab, /href=\{t\.pokerAtlasUrl\}/, 'the outbound link is preserved');
  assert.match(dailyTab, /rel="noopener noreferrer"/);
});

/* ------------------------------------------------------------------ *
 * 3. The Discovery Deck.
 * ------------------------------------------------------------------ */

test('the family nav keeps ten routes, aria-current and a 44px plate', () => {
  const links = navComponent.match(/\{ label: '/g) || [];
  assert.equal(links.length, 10, 'the discovery deck carries ten routes');
  assert.match(navComponent, /aria-current=\{active \? 'page' : undefined\}/);
  assert.match(navComponent, /aria-label="Poker Near Me"/);
  assert.match(nav, /min-height:\s*44px/);
  assert.match(nav, /grid-template-columns:\s*repeat\(10, minmax\(0, 1fr\)\)/);
  assert.match(nav, /@media \(max-width: 480px\)[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(
    nav,
    /@media \(orientation: landscape\) and \(min-width: 700px\) and \(max-height: 520px\)[\s\S]*?grid-template-columns:\s*repeat\(10, minmax\(0, 1fr\)\)/,
    'a short landscape viewport keeps one physical row',
  );
});

test('the tenth plate is centred rather than left alone on its own row', () => {
  assert.match(
    surfaces,
    /\.pnm-console-family-nav__rail > :last-child:nth-child\(3n \+ 1\)\s*\{\s*grid-column: 2;/,
    'a lone last plate sits in the middle column of the three-column phone rail',
  );
});

test('the deck stops covering the results it sits above', () => {
  const phoneBlock = surfaces.slice(surfaces.indexOf('cannot spend 200px of itself on a sticky deck'));
  assert.match(phoneBlock, /\.pnm-console-family-nav,[\s\S]*?position: relative;/);
  assert.match(nav, /@media \(orientation: landscape\) and \(min-width: 700px\) and \(max-height: 520px\)[\s\S]*?position: relative;/);
});

/* ------------------------------------------------------------------ *
 * 4. Short landscape.
 * ------------------------------------------------------------------ */

test('a short landscape viewport returns the bottom navigation to document flow', () => {
  const block = surfaces.slice(surfaces.indexOf('A fixed footer consumes a third of a short landscape viewport'));
  assert.match(block, /\[data-global-bottom-nav='true'\][\s\S]*?position: relative !important/);
  assert.match(block, /\[data-bottom-nav-clearance='true'\][\s\S]*?display: none !important/);
});

test('nothing sticky is left pinned over the discovery canvas in short landscape', () => {
  assert.match(
    surfaces,
    /@media \(orientation: landscape\) and \(max-height: 520px\)[\s\S]*?\.pnm-top-tabs,[\s\S]*?position: relative !important/,
  );
});

/* ------------------------------------------------------------------ *
 * 5. Tab plates fill their grid cell so labels stay on the painted face.
 * ------------------------------------------------------------------ */

test('a tab plate fills its grid cell and never wraps its label off the face', () => {
  assert.match(
    surfaces,
    /body\.world-poker-near-me \.pnm-top-tab\.pnm-top-tab,\s*body\.world-poker-near-me \.pnm-sub-tab\.pnm-sub-tab \{\s*width: 100%;[\s\S]*?white-space: nowrap !important;/,
  );
  assert.match(surfaces, /\.pnm-top-tab\.pnm-top-tab,\s*body\.world-poker-near-me \.pnm-sub-tab\.pnm-sub-tab \{\s*min-width: 44px !important;/);
});

/* ------------------------------------------------------------------ *
 * 6. Dialogs.
 * ------------------------------------------------------------------ */

test('the dialog scrim is opaque and dialog fields cannot zoom iOS', () => {
  assert.match(dialogs, /\.pnm-console-dialog-overlay \{[\s\S]*?background: #000308;/, 'page text cannot ghost through the scrim');
  assert.doesNotMatch(dialogs, /background: rgb\(0 3 8 \/ 88%\)/);
  assert.match(dialogs, /font-size: max\(16px, 3\.4cqw\);/);
});

test('the dialog layer draws no frame of its own', () => {
  assert.doesNotMatch(dialogs, /(?:linear|radial|conic)-gradient\(/i);
  assert.doesNotMatch(dialogs, /:hover/i);
  assert.doesNotMatch(dialogs, /box-shadow:(?!\s*none)/i);
  assert.doesNotMatch(dialogs, /border-radius:(?!\s*0)/i);
});

test('every discovery dialog keeps the whole modal contract', () => {
  const DIALOGS = [
    'src/components/poker-near-me/CasinoActionDialog.jsx',
    'src/components/poker-near-me/modals/LocationEnablePopup.js',
    'src/components/poker-near-me/modals/LoginPromptModal.js',
    'src/components/poker-near-me/modals/ManualLocationModal.js',
  ];
  for (const path of DIALOGS) {
    const source = read(path);
    assert.match(source, /role="dialog"/, `${path} declares a dialog`);
    assert.match(source, /aria-modal="true"/, `${path} is modal`);
    assert.match(source, /aria-labelledby=/, `${path} names its own title`);
    assert.match(source, /'Escape'/, `${path} closes on Escape`);
    assert.match(source, /'Tab'/, `${path} traps Tab`);
    assert.match(source, /acquireScrollLock\(/, `${path} locks the page behind it`);
    assert.match(source, /focus\?\.\(\)/, `${path} returns focus`);
    assert.match(source, /onMouseDown=/, `${path} dismisses on the backdrop`);
    assert.ok(source.includes('pnm-console-dialog-overlay'), `${path} uses the painted overlay`);
    assert.match(source, /PokerNearMeConsole/, `${path} prints on the painted chassis`);
    assert.doesNotMatch(source, /<svg/i, `${path} draws no vector control`);
    assert.doesNotMatch(source, /borderRadius|boxShadow/, `${path} builds no chrome inline`);
  }
});

test('the confirm dialog paints two plates and a busy state', () => {
  const dialog = read('src/components/poker-near-me/CasinoActionDialog.jsx');
  assert.match(dialog, /plates=\{\{/);
  assert.match(dialog, /secondary: \{/);
  assert.match(dialog, /primary: \{/);
  assert.match(dialog, /aria-busy=\{busy\}/);
  assert.match(dialog, /disabled: busy \|\| confirmDisabled/);
  assert.match(dialog, /label: busy \? 'Working\.\.\.' : confirmLabel/);
});

/* ------------------------------------------------------------------ *
 * 7. Events Calendar hygiene.
 * ------------------------------------------------------------------ */

test('the malformed inline select arrow data uri is gone for good', () => {
  assert.doesNotMatch(eventsCalendar, /&quot;data:image\/svg/);
  assert.doesNotMatch(eventsCalendar, /data:image\/svg\+xml/);
  assert.doesNotMatch(dailyTournamentsPage, /&quot;data:image\/svg/);
});

/* ------------------------------------------------------------------ *
 * 8. Routes, redirects and indexing.
 * ------------------------------------------------------------------ */

test('every legacy discovery slug still redirects and keeps its query string', () => {
  assert.match(pnmTab, /const canonicalSlug = normalizeRouteSlug\(requestedSlug\) \|\| 'venues'/);
  assert.match(pnmTab, /if \(requestedSlug !== canonicalSlug\)/);
  assert.match(pnmTab, /const search = new URLSearchParams\(\)/);
  assert.match(pnmTab, /permanent: true/);
  assert.match(pnmTab, /noindex=\{!isPokerDiscoveryRouteIndexable\(canonicalSlug\)\}/);
  assert.match(pnmTab, /HubPageSummary/);

  const sections = read('src/components/poker-near-me/pnmSections.js');
  for (const [slug, key] of [
    ['live', 'live'],
    ['live-games', 'live'],
    ['daily', 'daily'],
    ['daily-tournaments', 'daily'],
    ['calendar', 'calendar'],
    ['events-calendar', 'calendar'],
    ['saved', 'saved'],
    ['alerts', 'alerts'],
  ]) {
    assert.match(
      sections,
      new RegExp(`'?${slug}'?:\\s*'${key}'`),
      `${slug} still resolves to the ${key} section`,
    );
  }
});
