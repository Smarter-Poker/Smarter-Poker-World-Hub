import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const readJson = (path) => JSON.parse(read(path));

test('Poker Near Me shared navigation preserves stable discovery routes', () => {
  const nav = read('src/components/poker-near-me/PokerNearMeFamilyNav.jsx');
  [
    '/hub/poker-near-me/lobby',
    '/hub/poker-near-me/venues',
    '/hub/poker-near-me/live-games',
    '/hub/poker-near-me/map',
    '/hub/events-calendar',
    '/hub/poker-tours',
    '/hub/home-games',
    '/hub/poker-near-me/saved',
  ].forEach((route) => assert.match(nav, new RegExp(route.replaceAll('/', '\\/'))));
  assert.match(nav, /aria-current=\{active \? 'page'/);
  assert.match(nav, /aria-label="Poker Near Me"/);
});

test('Poker Near Me shared navigation uses complete painted plates without CSS-drawn chrome', () => {
  const nav = read('src/components/poker-near-me/PokerNearMeFamilyNav.jsx');
  const css = read('src/styles/worlds/poker-near-me-console-nav.css');
  const app = read('pages/_app.js');
  const navImport = "import '../src/styles/worlds/poker-near-me-console-nav.css';";

  assert.match(nav, /data-pnm-console-surface="family-navigation-v1"/);
  assert.match(css, /button-secondary\.png/);
  assert.match(css, /button-primary\.png/);
  assert.match(css, /background-size:\s*contain/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /grid-template-columns:\s*repeat\(10, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*?repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 480px\)[\s\S]*?repeat\(3, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(css, /(?:linear|radial|conic)-gradient|border(?:-radius)?\s*:|box-shadow\s*:|backdrop-filter\s*:|:hover/i);
  assert.doesNotMatch(css, /text-transform:\s*uppercase/i);
  assert.ok(app.indexOf(navImport) > app.indexOf("import '../src/styles/worlds/poker-near-me-console.css';"));
  for (const asset of ['button-primary.png', 'button-secondary.png']) {
    assert.equal(
      existsSync(new URL(`../public/images/pnm-console/painted-controls-v1/${asset}`, import.meta.url)),
      true,
      `${asset} must exist`
    );
  }
});

test('Poker Near Me shared navigation stays one compact row in short landscape', () => {
  const css = read('src/styles/worlds/poker-near-me-console-nav.css');

  assert.match(
    css,
    /@media \(orientation: landscape\) and \(min-width: 700px\) and \(max-height: 520px\)[\s\S]*?\.pnm-console-family-nav,[\s\S]*?position:\s*relative;[\s\S]*?top:\s*auto;[\s\S]*?padding:\s*4px/
  );
  assert.match(
    css,
    /@media \(orientation: landscape\) and \(min-width: 700px\) and \(max-height: 520px\)[\s\S]*?\.pnm-console-family-nav__label\s*\{[\s\S]*?display:\s*none;[\s\S]*?\.pnm-console-family-nav__rail\s*\{[\s\S]*?repeat\(10, minmax\(0, 1fr\)\)/
  );
});

test('shared Poker Near Me result cards use the three-slice painted console contract', () => {
  const cardPaths = [
    'src/components/poker-near-me/VenueCard.js',
    'src/components/poker-near-me/TourCard.js',
    'src/components/poker-near-me/RichTourCard.jsx',
    'src/components/poker-near-me/NewSeriesVenueCard.jsx',
    'src/components/poker-near-me/SeriesCard.js',
    'src/components/poker-near-me/PokerTourCard.jsx',
  ];
  const css = read('src/styles/worlds/poker-near-me-console-cards.css');

  for (const path of cardPaths) {
    const card = read(path);
    assert.match(card, /PokerNearMePanelShell/, `${path} must inherit the painted panel shell`);
    assert.match(card, /pnm-console-card/, `${path} must opt into the shared result-card layout`);
    assert.doesNotMatch(card, /<svg\b|(?:linear|radial|conic)-gradient/, `${path} must not draw generic vector or gradient chrome`);
    assert.doesNotMatch(card, /className="[^"]*(?:entity-card|tour-card-premium|vc3-card)(?:\s|")/, `${path} must not inherit the retired generic card chassis`);
  }

  for (const slice of ['panel-head.png', 'panel-mid.png', 'panel-foot.png']) {
    assert.match(css, new RegExp(slice.replace('.', '\\.')));
    assert.equal(
      existsSync(new URL(`../public/images/pnm-console/painted-panels-v1/${slice}`, import.meta.url)),
      true,
      `${slice} must exist`
    );
  }
  assert.match(css, /panel-mid\.png[^;]*repeat-y/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /@media \(max-width: 600px\)[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(css, /@media \(orientation: landscape\) and \(max-height: 520px\)/);
  assert.doesNotMatch(css, /(?:linear|radial|conic)-gradient|(?:^|[;{\s])border(?:-radius)?\s*:|box-shadow\s*:|backdrop-filter\s*:|:hover/im);

  const venue = read(cardPaths[0]);
  assert.match(venue, /PokerNearMeConsoleIcon name="phone"/);
  assert.match(venue, /PokerNearMeConsoleIcon name="directions"/);
  assert.match(venue, /PokerNearMeConsoleIcon name="calendar"/);
  assert.match(venue, /createPortal/);
  assert.match(venue, /useModalHistory\(checkinModal, closeCheckin\)/);

  const featuredSeries = read(cardPaths[3]);
  assert.doesNotMatch(featuredSeries, /frame-bolt|neon-strip/);

  const venuesPanel = read('src/components/poker-near-me/VenuesTabPanel.jsx');
  assert.match(venuesPanel, /className=\{'venue-card-wrapper' \+ \(isHighlighted \? ' venue-card-highlighted' : ''\)\}/);
  assert.match(venuesPanel, /<RichTourCard/);
  assert.doesNotMatch(venuesPanel, /style=\{\{\s*border:\s*'1\.5px solid #ef4444'[\s\S]*?boxShadow:/);
});

test('all primary Poker Near Me page families render the shared navigation', () => {
  [
    'pages/hub/home-games.js',
    'pages/hub/poker-tours.js',
    'pages/hub/poker-series.js',
    'pages/hub/events-calendar.js',
    'pages/hub/daily-tournaments.js',
    'pages/hub/venues/[id].js',
  ].forEach((path) => {
    const page = read(path);
    assert.match(page, /PokerNearMeFamilyNav/);
    assert.match(page, /<PokerNearMeFamilyNav \/>/);
  });

  for (const path of [
    'pages/hub/poker-near-me/[pnmTab].js',
    'pages/hub/poker-near-me/lobby.js',
  ]) {
    const page = read(path);
    assert.match(page, /PokerNearMeFamilyNav/);
    assert.match(page, /<PokerNearMeFamilyNav \/>/);
  }
  assert.match(read('pages/hub/poker-near-me/[pnmTab].js'), /className="pnm-top-tabs"/);
});

test('casino realism theme covers the full route family and mobile audit target', () => {
  const provider = read('src/components/WorldThemeProvider.js');
  [
    '/hub/poker-near-me',
    '/hub/venues',
    '/hub/home-games',
    '/hub/poker-tours',
    '/hub/poker-series',
    '/hub/tours',
    '/hub/series',
    '/hub/events-calendar',
    '/hub/daily-tournaments',
  ].forEach((route) => assert.match(provider, new RegExp(route.replaceAll('/', '\\/'))));

  const theme = read('src/styles/worlds/poker-near-me.css');
  assert.match(theme, /--pnm-blue: #2fa8ff/);
  assert.match(theme, /--pnm-gold: #c8a45d/);
  // Mobile phase 3 moved the phone audit block from 700px to 768px: the
  // mobile standard allows exactly three boundaries (900 / 768 / 600) and
  // 700 was a fourth. The block itself (background position, family nav
  // padding, 44px controls, one-column grids) is unchanged.
  assert.match(theme, /@media \(max-width: 768px\)/);
  assert.doesNotMatch(theme, /@media \(max-width: 700px\)/);
  assert.match(theme, /overflow-x: hidden/);
  assert.match(theme, /min-height: 44px/);
});

test('public venue and home-game routes resolve to the Poker Near Me command world', () => {
  const registry = readJson('src/config/world-footer-navigation.json');
  const pokerNearMe = registry.worlds.find((world) => world.id === 'poker-near-me');
  const myClubs = registry.worlds.find((world) => world.id === 'my-clubs');

  assert.ok(pokerNearMe, 'Poker Near Me world must exist');
  assert.ok(myClubs, 'My Clubs world must exist');
  for (const prefix of ['/hub/poker-near-me', '/hub/venues', '/hub/home-games']) {
    assert.ok(
      pokerNearMe.routePrefixes.includes(prefix),
      `${prefix} must inherit the Poker Near Me command menu and footer`
    );
    assert.equal(
      myClubs.routePrefixes.includes(prefix),
      false,
      `${prefix} cannot have ambiguous command-world ownership`
    );
  }

  const allPrefixes = registry.worlds.flatMap((world) => world.routePrefixes);
  assert.equal(new Set(allPrefixes).size, allPrefixes.length, 'world route prefixes must be unique');
});

test('the project-bound cinematic environment asset is present and optimized', () => {
  const asset = new URL('../public/images/pnm-redesign/casino-command-map-v1.webp', import.meta.url);
  assert.equal(existsSync(asset), true);
  assert.ok(statSync(asset).size > 100_000, 'asset should retain enough detail for a cinematic hero');
  assert.ok(statSync(asset).size < 400_000, 'asset should stay within a practical web delivery budget');

  const canvas = read('src/components/poker-near-me/lobby/LobbyCanvas.jsx');
  assert.match(canvas, /casino-command-map-v1\.webp/);
});

test('Poker Near Me command surfaces keep continuous edges and full touch targets', () => {
  const style = read('src/styles/worlds/poker-near-me-machined.css');
  assert.match(
    style,
    /body\.world-poker-near-me \.sp-drawer::after,[\s\S]*?\.sp-world-command-trigger::after\s*\{[\s\S]*?content:\s*none !important;/
  );
  assert.match(
    style,
    /\.tours-search-clear, \.tour-fav-btn, \.tc-stepper button\)\s*\{[\s\S]*?width:\s*44px !important;[\s\S]*?min-width:\s*44px !important;[\s\S]*?height:\s*44px !important;[\s\S]*?min-height:\s*44px !important;/
  );
  assert.match(
    style,
    /\[data-pnm-secondary-foundation='interaction-v1'\] \.cmd-panel\s*\{[\s\S]*?border:\s*1px solid[\s\S]*?border-radius:\s*3px !important;/
  );
  assert.match(
    style,
    /\[data-pnm-secondary-foundation='interaction-v1'\] \.cmd-panel::before\s*\{[\s\S]*?content:\s*none !important;/
  );
  assert.match(style, /\.sort-results-label, \.results-showing, \.vc3-empty-state,[\s\S]*?color:\s*#8fa0b2 !important;/);
  assert.match(style, /\.pnm-tab-badge\s*\{[\s\S]*?background:\s*#b4232b !important;/);
  assert.match(style, /\.pnm-page \.primary-btn\s*\{[\s\S]*?background:\s*#12648c !important;/);
});

test('the final command-surface cascade upgrades headers, search, and filters across the family', () => {
  const app = read('pages/_app.js');
  const command = read('src/styles/worlds/poker-near-me-command-surfaces.css');
  const machinedImport = "import '../src/styles/worlds/poker-near-me-machined.css';";
  const commandImport = "import '../src/styles/worlds/poker-near-me-command-surfaces.css';";

  assert.ok(app.indexOf(machinedImport) >= 0, 'the machined foundation must be loaded');
  assert.ok(
    app.indexOf(commandImport) > app.indexOf(machinedImport),
    'the command-surface corrections must be the final Poker Near Me cascade layer'
  );
  assert.match(command, /body\.world-poker-near-me \.pnm-family-nav__rail\s*\{/);
  assert.match(command, /\.lobby-search-wrap,[\s\S]*?\.tours-search-wrap[\s\S]*?border-radius:\s*3px !important;/);
  assert.match(command, /\.pnm-filter-bar, \.pnm-top-filters, \.ec-filter-bar[\s\S]*?border-radius:\s*3px !important;/);
  assert.match(command, /\[data-pnm-home-games='true'\][\s\S]*?\.cmd-home-games-search-row/);
  assert.match(command, /@media \(max-width:\s*480px\)[\s\S]*?font-size:\s*16px !important;/);
  assert.doesNotMatch(command, /backdrop-filter:\s*blur/i);
  assert.doesNotMatch(command, /border-radius:\s*(?:[7-9]|[1-9][0-9])px/i);
});

test('stacked discovery deep links stay anchored while lazy panels hydrate', () => {
  const page = read('pages/hub/poker-near-me/[pnmTab].js');
  assert.match(page, /new ResizeObserver\(\(\) =>/);
  assert.match(page, /\[0, 140, 360, 760, 1400, 2400, 3800, 5600\]/);
  assert.match(page, /window\.addEventListener\('wheel', cleanup/);
  assert.match(page, /window\.addEventListener\('touchstart', cleanup/);
  assert.match(page, /window\.setTimeout\(cleanup, 6400\)/);
});

test('tournament alerts keep stable defaults and receive venue coordinates without render loops', () => {
  const alerts = read('src/components/poker-near-me/TournamentAlerts.jsx');
  const more = read('src/components/poker-near-me/MoreTabPanel.jsx');

  assert.match(alerts, /const EMPTY_LIST = Object\.freeze\(\[\]\)/);
  assert.match(alerts, /dailyTournaments = EMPTY_LIST[\s\S]*?venues = EMPTY_LIST/);
  assert.match(alerts, /setMatches\(previous => previous\.length === 0 \? previous : EMPTY_LIST\)/);
  assert.match(alerts, /previous\.every\(\(item, index\) => item === matched\[index\]\)/);
  assert.match(more, /<TournamentAlerts[\s\S]*?venues=\{effectiveVenues\}[\s\S]*?userLocation=\{userLocation\}/);
});

test('every Poker Near Me map inherits one accessible fullscreen command surface', () => {
  const frame = read('src/components/poker-near-me/MapSurfaceFrame.jsx');
  const venueMap = read('src/components/poker-near-me/VenueMap.jsx');
  const venueMapPanel = read('src/components/poker-near-me/VenueMapPanel.jsx');
  const venueDetail = read('pages/hub/venues/[id].js');
  const locationPicker = read('src/components/maps/LeafletLocationPicker.jsx');
  const roadTrip = read('src/components/poker-near-me/RoadTripPlanner.jsx');
  const globalSearch = read('src/components/poker-near-me/GlobalSearchOverlay.jsx');
  const homeGames = read('pages/hub/home-games.js');
  const venuesPanel = read('src/components/poker-near-me/VenuesTabPanel.jsx');
  const finish = read('src/styles/worlds/poker-near-me-machined.css');

  assert.match(frame, /useAccessibleDialog/);
  assert.match(frame, /data-map-fullscreen-control="true"/);
  assert.match(frame, /aria-expanded=\{expanded\}/);
  assert.match(frame, /pnm:close-map-fullscreen/);
  assert.match(frame, /window\.dispatchEvent\(new Event\('resize'\)\)/);
  assert.match(venueMap, /<MapSurfaceFrame/);
  assert.match(venueMapPanel, /<MapSurfaceFrame/);
  for (const sharedVenueMap of [venueMap, venueMapPanel]) {
    assert.match(sharedVenueMap, /syncPokerMapKeyboardTargets/);
    assert.match(sharedVenueMap, /map\.on\('moveend zoomend resize', scheduleKeyboardTargetSync\)/);
    assert.match(sharedVenueMap, /new MutationObserver\(scheduleKeyboardTargetSync\)/);
  }
  assert.match(venueDetail, /<MapSurfaceFrame[\s\S]*?data-map-foundation="shared-v3"/);
  assert.match(venueDetail, /loadPokerMapRuntime\(\)/);
  assert.doesNotMatch(venueDetail, /setTimeout\(check, 200\)/);
  assert.match(locationPicker, /<MapSurfaceFrame[\s\S]*?data-map-foundation="shared-v3"/);
  assert.match(locationPicker, /loadPokerMapRuntime\(\)/);
  assert.match(locationPicker, /createPokerMapSession\(\{/);
  assert.match(locationPicker, /resetPokerMapRuntime\(\)/);
  assert.match(locationPicker, /data-map-style-source="local"/);
  assert.doesNotMatch(locationPicker, /unpkg\.com\/leaflet|data-leaflet-js|leafletLoadPromise/);
  assert.match(roadTrip, /<MapSurfaceFrame[\s\S]*?data-map-foundation="shared-v3"/);
  assert.match(globalSearch, /dispatchEvent\(new Event\('pnm:close-map-fullscreen'\)\)/);
  assert.doesNotMatch(homeGames, /mapFullscreen|hg-map-fullscreen/);
  assert.doesNotMatch(venuesPanel, /mapFullscreen|map-preview-fullscreen/);
  assert.match(finish, /\.pnm-map-surface--fullscreen\s*\{[\s\S]*?position:\s*fixed !important;[\s\S]*?height:\s*100dvh !important;/);
  assert.match(finish, /\.lobby-panel-page\):has\(\.pnm-map-surface--fullscreen\)[\s\S]*?transform:\s*none !important;/);
  assert.match(finish, /\.lobby-panel-page:has\(\.pnm-map-surface--fullscreen\)\s*\{[\s\S]*?animation:\s*none !important;/);
  assert.match(finish, /\.pnm-map-surface__fullscreen-control\s*\{[\s\S]*?min-height:\s*44px;/);
  assert.match(finish, /\.pnm-map-surface--primary \.pnm-map-surface__viewport\s*\{[\s\S]*?66vh/);
});

test('map preference and home-game location controls are fully keyboard operable', () => {
  const preference = read('src/components/poker-near-me/MapPreferenceChooser.jsx');
  const locationPicker = read('src/components/maps/LeafletLocationPicker.jsx');

  assert.match(preference, /useAccessibleDialog\(\{[\s\S]*?open: isOpen,[\s\S]*?lockScroll: false,[\s\S]*?isolateBackground: false/);
  assert.match(preference, /ref=\{dialogRef\}[\s\S]*?role="menu"/);
  assert.match(preference, /initialFocusRef\.current = node/);
  for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End']) {
    assert.match(preference, new RegExp(`event\\.key === '${key}'`));
  }

  assert.match(locationPicker, /aria-label="Search for a home game location"/);
  assert.match(locationPicker, /aria-label="City"[\s\S]*?aria-label="State"/);
  assert.match(locationPicker, /iconSize: \[44, 44\]/);
  assert.match(locationPicker, /iconAnchor: \[22, 44\]/);
  assert.match(locationPicker, /title: 'Approximate home game location'/);
  assert.match(locationPicker, /markerElement\?\.setAttribute\('aria-label', markerLabel\)/);
  assert.match(locationPicker, /markerElement\?\.addEventListener\('keydown', handleMarkerKeyDown\)/);
  assert.match(locationPicker, /ArrowUp: \[1, 0\][\s\S]*?ArrowRight: \[0, 1\]/);
});

test('map fullscreen and location dialogs transfer one accessible interaction owner at a time', () => {
  const primary = read('pages/hub/poker-near-me/[pnmTab].js');
  const lobby = read('pages/hub/poker-near-me/lobby.js');
  const lobbyController = read('src/components/poker-near-me/lobby/useLobbyInteractionController.js');
  const homeGames = read('pages/hub/home-games.js');
  const dialogHook = read('src/hooks/useAccessibleDialog.js');
  const venueDetail = read('pages/hub/venues/[id].js');

  assert.equal(
    (primary.match(/dispatchEvent\(new Event\('pnm:close-map-fullscreen'\)\);[\s\S]{0,160}?setShowLocationModal\(true\)/g) || []).length,
    3,
    'unsupported, high-accuracy denial, and fallback failure must all retire fullscreen first'
  );
  assert.match(lobby, /const openManualLocation = useCallback\(\(\) => \{[\s\S]*?pnm:close-map-fullscreen[\s\S]*?setShowManualLocation\(true\)/);
  assert.match(lobby, /const openEnableLocation = useCallback\(\(\) => \{[\s\S]*?pnm:close-map-fullscreen[\s\S]*?setShowEnablePopup\(true\)/);
  assert.doesNotMatch(lobby, /onKeyDown=\{handlePanelKeyDown\}/);
  assert.match(lobbyController, /useAccessibleDialog\(\{[\s\S]*?open: showPanel,[\s\S]*?onClose: onPanelClose/);
  assert.doesNotMatch(lobbyController, /addEventListener\(['"]keydown/);

  assert.match(dialogHook, /const DIALOG_STACK_KEY = '__spAccessibleDialogStack'/);
  assert.match(dialogHook, /event\.defaultPrevented \|\| !isTopDialog\(\)/);
  assert.match(dialogHook, /event\.stopImmediatePropagation\?\.\(\)/);
  assert.match(dialogHook, /sibling\.setAttribute\('inert', ''\)/);
  assert.match(dialogHook, /sibling\.setAttribute\('aria-hidden', 'true'\)/);
  assert.match(dialogHook, /acquireScrollLock\('PokerNearMeAccessibleDialog'\)/);

  assert.match(homeGames, /localStorage\.getItem\('pnm_location_prompt_dismissed'\) === '1'/);
  assert.doesNotMatch(homeGames, /setTimeout\(\(\) => requestGpsLocation\(\),\s*600\)/);

  assert.match(venueDetail, /iconSize: \[44, 44\]/);
  assert.match(venueDetail, /keyboard: true,[\s\S]*?title: venue\.name[\s\S]*?bindPopup\(popup\)/);
  assert.match(venueDetail, /venueMarkerElement\.setAttribute\([\s\S]*?'aria-label',[\s\S]*?Press Enter to show map details/);
});

test('ordinary discovery pins preserve fullscreen while explicit profile actions close it', () => {
  const page = read('pages/hub/poker-near-me/[pnmTab].js');
  const venueMap = read('src/components/poker-near-me/VenueMap.jsx');
  const selectionHandler = page.match(/const onMapVenueClick = useCallback\([\s\S]*?\n\s*\);/);

  assert.ok(selectionHandler, 'the discovery pin-selection handler must exist');
  assert.doesNotMatch(selectionHandler[0], /pnm:close-map-fullscreen/);
  assert.match(
    venueMap,
    /onOpenDetails: \(path, title\) => \{[\s\S]*?dispatchEvent\(new Event\('pnm:close-map-fullscreen'\)\)[\s\S]*?onOpenIframeModalRef/
  );
});

test('Home Games location denial hands modal ownership off from the fullscreen map', () => {
  const homeGames = read('pages/hub/home-games.js');
  const locationModal = read('src/components/ui/LocationEnableModal.jsx');

  assert.match(
    homeGames,
    /if \(err && err\.code === 1\) \{[\s\S]*?dispatchEvent\(new Event\('pnm:close-map-fullscreen'\)\);[\s\S]*?setShowLocationModal\(true\)/
  );
  assert.match(locationModal, /import useAccessibleDialog from '\.\.\/\.\.\/hooks\/useAccessibleDialog'/);
  assert.match(locationModal, /const \{ dialogRef, initialFocusRef \} = useAccessibleDialog\(\{/);
  assert.match(locationModal, /ref=\{dialogRef\}[\s\S]*?role="dialog"/);
  assert.match(locationModal, /ref=\{initialFocusRef\}[\s\S]*?aria-label="Close"/);
  assert.doesNotMatch(locationModal, /document\.addEventListener\('keydown'/);
});

test('global search detail is a nested accessible dialog that isolates the search surface', () => {
  const search = read('src/components/poker-near-me/GlobalSearchOverlay.jsx');

  assert.match(search, /function DetailModal[\s\S]*?useAccessibleDialog\(\{[\s\S]*?open: Boolean\(item\)/);
  assert.match(search, /ref=\{dialogRef\}[\s\S]*?role="dialog"[\s\S]*?aria-labelledby="gso-detail-title"/);
  assert.match(search, /ref=\{initialFocusRef\}[\s\S]*?aria-label="Close details"/);
  assert.match(search, /className="gso-search-surface"[\s\S]*?aria-hidden=\{detailItem \? 'true' : undefined\}[\s\S]*?inert=\{detailItem \? '' : undefined\}/);
});

test('Home Games page CSS is hydration-stable', () => {
  const homeGames = read('pages/hub/home-games.js');
  assert.match(homeGames, /<style dangerouslySetInnerHTML=\{\{ __html: `/);
  assert.doesNotMatch(homeGames, /<style>\{`\s*\.hg-page\s*\{/);
});

test('Home Games geo and host-dashboard routes declare the machined secondary foundation', () => {
  [
    'pages/hub/home-games/in/index.js',
    'pages/hub/home-games/in/[state]/index.js',
    'pages/hub/home-games/in/[state]/[city].js',
  ].forEach((path) => {
    const page = read(path);
    assert.match(page, /className="pnm-home-geo-page /, `${path} needs the geo foundation class`);
    assert.match(page, /data-pnm-realism="machined-v2"/);
    assert.match(page, /data-pnm-secondary-foundation="interaction-v1"/);
    assert.match(page, /if \(!url \|\| !key\)/, `${path} must fail safely without runtime credentials`);
  });

  const dashboard = read('pages/hub/home-games/[slug]/dashboard.js');
  assert.match(dashboard, /className="hgd-main"[\s\S]*?data-pnm-realism="machined-v2"/);
  assert.match(dashboard, /data-pnm-secondary-foundation="interaction-v1"/);
  assert.doesNotMatch(dashboard, /fontSize:\s*(?:10|11)\b/);
  assert.doesNotMatch(dashboard, /borderRadius:\s*(?:8|10|12|14)\b/);
  assert.match(dashboard, /minHeight:\s*44/);

  const style = read('src/styles/worlds/poker-near-me-machined.css');
  assert.match(style, /body\.world-poker-near-me main\.pnm-home-geo-page[\s\S]*?background-image:[\s\S]*?location-command-grid-v1\.webp/);
  assert.match(style, /\.pnm-home-geo-page :is\([\s\S]*?min-height:\s*44px/);
  assert.match(style, /\.hgd-page :is\([\s\S]*?\[style\*='border-radius:50%'\][\s\S]*?\[style\*='border-radius: 50%'\][\s\S]*?border-radius:\s*50%/);
  assert.match(style, /\.hgd-page \[style\*='border-radius'\]:not\([\s\S]*?\[style\*='border-radius:50%'\][\s\S]*?:not\([\s\S]*?\[style\*='border-radius: 50%'\][\s\S]*?border-radius:\s*3px/);
  assert.match(style, /\.pnm-deep-deck__status\[data-tone='neutral'\][\s\S]*?box-shadow:\s*none/);
});

test('legacy invite-code home game route inherits PNM and exposes only truthful controls', () => {
  const page = read('pages/home-game/[code].js');
  const provider = read('src/components/WorldThemeProvider.js');
  const registry = readJson('src/config/world-footer-navigation.json');
  const pokerNearMe = registry.worlds.find((world) => world.id === 'poker-near-me');

  assert.match(provider, /'\/home-game':\s*'poker-near-me'/);
  assert.ok(pokerNearMe.routePrefixes.includes('/home-game'));
  assert.match(page, /UniversalHeader/);
  assert.match(page, /PokerNearMeFamilyNav/);
  assert.match(page, /DeepRouteSignalDeck/);
  assert.match(page, /data-pnm-realism="machined-v2"/);
  assert.match(page, /data-pnm-secondary-foundation="interaction-v1"/);
  assert.match(page, /sharePublicHomeGame/);
  assert.match(page, /onClick=\{handleShare\}/);
  assert.match(page, /onClick=\{handleCopy\}/);
  assert.match(page, /function handleTabKeyDown\(event, index\)/);
  assert.match(page, /onKeyDown=\{\(event\) => handleTabKeyDown\(event, index\)\}/);
  assert.match(page, /Likes Read-Only/);
  assert.match(page, /disabled[\s\S]*?aria-disabled="true"/);
  assert.match(page, /Comments Are Managed Inside The Protected Club Commander Group/);
  assert.doesNotMatch(page, /placeholder="Write A Comment/);
  assert.doesNotMatch(page, /<Send\b/);
  assert.match(page, /if \(!code \|\| !group\?\.id \|\| group\.is_private\)/);
  assert.match(page, /Private Discussion Is Available In Club Commander/);
  assert.match(page, /Open Private Discussion/);

  const style = read('src/styles/worlds/poker-near-me-machined.css');
  assert.match(style, /\.home-game-code-page button\[aria-label\][\s\S]*?min-width:\s*44px/);
  assert.match(style, /\.home-game-code-page \.pnm-deep-deck__breadcrumbs a[\s\S]*?min-height:\s*44px/);
  assert.match(style, /\.home-game-code-page footer a[\s\S]*?min-height:\s*44px/);
});

test('tour directory map never invents headquarters, trust, or shifted stop locations', () => {
  const page = read('pages/hub/poker-tours.js');
  assert.match(page, /const stop = stopInfo\?\.activeStop;\s*if \(!stop\) return;/);
  assert.match(page, /const venueMatch = findVenueCoords\(stop\);\s*\n\s*if \(!venueMatch\) return;/);
  assert.match(page, /latitude:\s*venueMatch\.latitude/);
  assert.match(page, /longitude:\s*venueMatch\.longitude/);
  assert.match(page, /trust_score:\s*null/);
  assert.doesNotMatch(page, /isMock/);
  assert.doesNotMatch(page, /39\.8283/);
  assert.doesNotMatch(page, /currentShift|shiftPattern|tour\.latitude|tour\.longitude/);
  assert.doesNotMatch(page, /trust_score:\s*5/);
  assert.doesNotMatch(page, /api\/notifications\/send|handleTrackTour|onTrackTour/);
});

test('live feed cards expose detail interactions only for resolvable venue ids', () => {
  const feed = read('src/components/poker-near-me/LiveGamesFeed.jsx');
  assert.match(feed, /const detailId = resolveVenueDetailId\(v\.id\)/);
  assert.match(feed, /const canNavigateToDetail = Boolean\(detailId && \(openVenueModal \|\| router\)\)/);
  assert.match(feed, /data-detail-state=\{detailId \? 'resolved' : 'unavailable'\}/);
  assert.match(feed, /cursor:\s*canNavigateToDetail \? 'pointer' : 'default'/);
  assert.match(feed, /onClick=\{canNavigateToDetail \? openVenueDetail : undefined\}/);
  assert.match(feed, /role=\{canNavigateToDetail \? 'link' : undefined\}/);
  assert.match(feed, /\{user && detailId && \(/);
  assert.match(feed, /data-detail-unavailable="true"/);
  assert.match(feed, /Directory Profile Unavailable/);
  assert.doesNotMatch(feed, /cursor:\s*router \? 'pointer' : 'default'/);
});

test('sitemap publishes paginated series and tour detail route contracts', () => {
  const sitemap = read('pages/sitemap.xml.js');
  assert.match(sitemap, /tour-source-registry\.json/);
  assert.match(sitemap, /seriesRouteIdentity\.mjs/);
  assert.match(sitemap, /addSeries\(toPokerSeriesRouteId\(row\.id\)\)/);
  assert.match(sitemap, /async function buildPokerEventDetailUrls\(\)/);
  assert.match(sitemap, /`\/hub\/series\/\$\{id\}`/);
  assert.match(sitemap, /`\/hub\/tours\/\$\{encodeURIComponent\(code\)\}`/);
  assert.match(sitemap, /table:\s*'tournament_series'/);
  assert.match(sitemap, /table:\s*'poker_series'/);
  assert.match(sitemap, /table:\s*'tour_source_registry'/);
  assert.match(sitemap, /\.range\(from, from \+ SITEMAP_DB_PAGE_SIZE - 1\)/);
  assert.match(sitemap, /is_suppressed\.is\.null,is_suppressed\.eq\.false/);
  assert.match(sitemap, /\.eq\('is_active', true\)/);
  assert.match(sitemap, /\.\.\.pokerEventDetailUrls/);
});

test('sitemap never invents series detail ids from source-registry positions', () => {
  const sitemap = read('pages/sitemap.xml.js');
  const bundle = readJson('data/poker-tour-series-2026.json');

  assert.deepEqual(bundle, [], 'fixture documents the empty-bundle failure case');
  assert.doesNotMatch(sitemap, /series_source_registry\.json|seriesSourceRegistry/);
  assert.doesNotMatch(sitemap, /Object\.values\([^)]*series[^)]*registry/i);
  assert.match(sitemap, /const bundledSeries = Array\.isArray\(bundledSeriesData\)/);
  assert.match(sitemap, /bundledSeries\.forEach\(\(series, index\) =>/);
  assert.match(sitemap, /If the bundle is empty, add no fallback/);
});

test('Poker Near Me and Home Games actions never fall back to browser-native dialogs', () => {
  const actionFiles = [
    'pages/hub/poker-tours.js',
    'src/components/poker-series/TourCard.js',
    'src/hooks/useTrackedTours.js',
    'pages/hub/home-games/[slug]/dashboard.js',
    'pages/hub/venues/[id].js',
    'src/components/poker-near-me/RoadTripPlanner.jsx',
    'src/components/home-games/HomeGamesSeatReservation.jsx',
    'src/components/home-games/TournamentList.jsx',
    'pages/hub/commander/home-games/[id]/manage.js',
    'pages/hub/commander/home-games/[id]/roster.js',
  ];
  const nativeDialogCall = /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/;
  actionFiles.forEach((path) => {
    assert.doesNotMatch(read(path), nativeDialogCall, `${path} must use the casino interaction system`);
  });

  const dialog = read('src/components/poker-near-me/CasinoActionDialog.jsx');
  const dialogCss = read('src/styles/worlds/poker-near-me-console-dialogs.css');
  assert.match(dialog, /role="dialog"/);
  assert.match(dialog, /aria-modal="true"/);
  assert.match(dialog, /event\.key === 'Escape'/);
  assert.match(dialog, /event\.key === 'Tab'/);
  assert.match(dialog, /<PokerNearMeConsole/);
  assert.match(dialog, /crest=\{destructive \? 'diamond' : 'flat'\}/);
  assert.match(dialog, /secondary:\s*\{[\s\S]*?buttonRef:\s*cancelRef/);
  assert.match(dialog, /primary:\s*\{[\s\S]*?disabled:\s*busy \|\| confirmDisabled/);
  assert.match(dialogCss, /min-height:\s*44px/);
  assert.doesNotMatch(dialog, /<svg|style=|<style jsx|clip-path|::before|::after/);
  assert.doesNotMatch(dialogCss, /(?:linear|radial|conic)-gradient|(?:^|[;{\s])border(?:-radius)?\s*:|box-shadow\s*:|backdrop-filter\s*:|:hover/im);

  const tourCard = read('src/components/poker-series/TourCard.js');
  const trackedTours = read('src/hooks/useTrackedTours.js');
  assert.match(tourCard, /CasinoActionDialog/);
  assert.match(tourCard, /actionNotice/);
  assert.match(trackedTours, /setActionNotice/);

  for (const path of actionFiles.slice(-4)) {
    assert.match(read(path), /CasinoActionDialog/);
  }
});

test('linked Club Commander Home Games routes inherit continuous machined framing', () => {
  const commanderRoutes = [
    'pages/hub/commander/home-games/index.js',
    'pages/hub/commander/home-games/create.js',
    'pages/hub/commander/home-games/join.js',
    'pages/hub/commander/home-games/[id].js',
    'pages/hub/commander/home-games/[id]/manage.js',
    'pages/hub/commander/home-games/[id]/roster.js',
  ];
  commanderRoutes.forEach((path) => {
    const page = read(path);
    assert.match(page, /data-pnm-home-games="true"/, `${path} needs the scoped Home Games foundation`);
    assert.match(page, /data-pnm-realism="machined-v2"/);
    assert.match(page, /data-pnm-secondary-foundation="interaction-v1"/);
  });

  [
    'src/components/home-games/HostRosterPickerModal.jsx',
    'src/components/home-games/HostCreateTableModal.jsx',
    'src/components/home-games/TournamentEditModal.jsx',
  ].forEach((path) => {
    assert.match(read(path), /data-pnm-home-games="true"/, `${path} needs continuous modal framing`);
  });

  const style = read('src/styles/worlds/poker-near-me-machined.css');
  assert.match(style, /\.cmd-page\[data-pnm-home-games='true'\][\s\S]*?location-command-grid-v1\.webp/);
  assert.match(style, /\[data-pnm-home-games='true'\] :is\([\s\S]*?\.cmd-panel[\s\S]*?border:\s*1px solid/);
  assert.match(style, /\[data-pnm-home-games='true'\] \.cmd-panel::before,[\s\S]*?content:\s*none !important;[\s\S]*?display:\s*none !important;/);
  assert.match(style, /\[data-pnm-home-games='true'\] :is\(button, a, input, select, textarea,[\s\S]*?min-height:\s*44px/);
  assert.match(style, /\[data-pnm-home-games='true'\]\[role='dialog'\] > :is\(div, form\)[\s\S]*?background-image:\s*none !important/);
});

test('Commander Home Games inherits the PNM body theme without changing footer ownership', () => {
  const provider = read('src/components/WorldThemeProvider.js');
  const shell = read('src/components/commander/CommanderPageShell.jsx');
  const style = read('src/styles/worlds/poker-near-me-machined.css');
  const scrollLock = read('src/lib/scrollLock.js');
  const registry = readJson('src/config/world-footer-navigation.json');

  assert.match(provider, /'\/hub\/commander\/home-games':\s*'poker-near-me'/);
  assert.match(shell, /className="commander-page-shell__menu-trigger"/);
  assert.match(style, /body\.world-poker-near-me \.commander-page-shell__menu-trigger[\s\S]*?width:\s*44px[\s\S]*?height:\s*44px[\s\S]*?border-radius:\s*3px[\s\S]*?background:\s*#060b10[\s\S]*?backdrop-filter:\s*none/);
  const hamburger = read('src/components/ui/HamburgerMenu.jsx');
  assert.match(hamburger, /data-direction=\{direction\}/);
  assert.match(hamburger, /borderRight:\s*direction === 'left'/);
  assert.match(hamburger, /borderLeft:\s*direction === 'right'/);
  assert.match(style, /\.sp-drawer\[data-direction='right'\][\s\S]*?border-left:\s*1px solid/);
  assert.match(style, /\.sp-drawer\[data-direction='left'\][\s\S]*?border-right:\s*1px solid/);
  assert.match(scrollLock, /document\.documentElement\.style\.overflow = 'hidden'/);
  assert.match(scrollLock, /document\.documentElement\?\.style\?\.removeProperty\('overflow'\)/);
  assert.equal(
    registry.worlds.some((world) => world.routePrefixes.includes('/hub/commander/home-games')),
    false,
    'Commander footer ownership remains outside the Poker Near Me footer registry'
  );
});

test('Home Games data-entry overlays share complete keyboard dialog behavior', () => {
  const hook = read('src/hooks/useAccessibleDialog.js');
  assert.match(hook, /acquireScrollLock\('PokerNearMeAccessibleDialog'\)/);
  assert.doesNotMatch(hook, /document\.body\.style\.overflow/);
  assert.match(hook, /event\.key === 'Escape'/);
  assert.match(hook, /event\.key !== 'Tab'/);
  assert.match(hook, /previouslyFocused\.focus/);
  assert.match(hook, /initialFocusRef/);

  const worldTheme = read('src/styles/worlds/poker-near-me.css');
  assert.match(worldTheme, /overflow-x:\s*clip !important/);
  assert.match(worldTheme, /body\.world-poker-near-me\[style\*='overflow: hidden'\][\s\S]*?overflow:\s*clip !important/);

  const overlays = [
    ['pages/hub/commander/home-games/index.js', 2],
    ['pages/hub/commander/home-games/[id].js', 2],
    ['pages/hub/commander/home-games/[id]/manage.js', 1],
    ['src/components/home-games/HostCreateTableModal.jsx', 1],
    ['src/components/home-games/HostRosterPickerModal.jsx', 1],
    ['src/components/home-games/TournamentEditModal.jsx', 1],
  ];
  for (const [path, minimumUses] of overlays) {
    const source = read(path);
    assert.match(source, /useAccessibleDialog/, `${path} must use the shared focus contract`);
    assert.ok(
      (source.match(/role="dialog"/g) || []).length >= minimumUses,
      `${path} needs a named role=dialog for every release-scoped overlay`
    );
    assert.ok(
      (source.match(/aria-labelledby=/g) || []).length >= minimumUses,
      `${path} needs an accessible dialog name for every release-scoped overlay`
    );
    assert.match(source, /initialFocusRef/, `${path} needs deterministic initial focus`);
  }

  const detail = read('pages/hub/commander/home-games/[id].js');
  assert.match(detail, /aria-label="Close RSVP dialog"/);
  assert.match(detail, /aria-label="Close share dialog"/);
  assert.match(detail, /aria-label=\{copied \? 'Club code copied' : 'Copy club code'\}/);
});

test('Commander Home Games icon actions expose names and explicit button behavior', () => {
  const manage = read('pages/hub/commander/home-games/[id]/manage.js');
  assert.match(manage, /aria-label=\{`Message \$\{memberName\}`\}/);
  assert.match(manage, /aria-label=\{`Approve \$\{memberName\}`\}/);
  assert.match(manage, /aria-label=\{`Decline \$\{memberName\}`\}/);
  assert.match(manage, /aria-label=\{`Remove \$\{memberName\}`\}/);
  assert.match(manage, /aria-label=\{`Back to \$\{group\?\.name \|\| 'home game'\}`\}/);
  assert.match(manage, /aria-label=\{`Delete game scheduled for \$\{eventDate\.toLocaleDateString/);
});

test('PNM mobile controls wrap inside the 390px viewport and retain readable labels', () => {
  const style = read('src/styles/worlds/poker-near-me-machined.css');
  const commander = read('pages/hub/commander/home-games/index.js');
  const series = read('pages/hub/poker-series.js');
  const tours = read('pages/hub/poker-tours.js');
  const daily = read('pages/hub/daily-tournaments.js');
  const calendar = read('pages/hub/events-calendar.js');
  const roster = read('src/components/home-games/HostRosterPickerModal.jsx');
  const tertiarySources = [
    read('pages/hub/venues/[id].js'),
    read('pages/hub/series/[id].js'),
    read('pages/hub/tours/[code].js'),
    read('pages/hub/home-games/[slug].js'),
    read('src/components/poker-series/TourCard.js'),
  ];

  assert.match(commander, /cmd-home-games-header-row/);
  assert.match(commander, /cmd-home-games-header-actions/);
  assert.match(commander, /cmd-home-games-search-row/);
  assert.match(style, /@media \(max-width: 480px\)[\s\S]*?\.cmd-home-games-header-row[\s\S]*?flex-direction:\s*column/);
  assert.match(style, /\.cmd-home-games-header-actions[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);

  assert.match(series, /@media \(max-width: 768px\)[\s\S]*?\.pnm-top-filters-inner[\s\S]*?flex-wrap:\s*wrap;[\s\S]*?overflow-x:\s*visible/);
  assert.match(tours, /\.tours-results-actions\s*\{[\s\S]*?flex-direction:\s*column;[\s\S]*?align-items:\s*stretch/);
  assert.match(daily, /@media \(max-width: 768px\)[\s\S]*?\.day-tabs[\s\S]*?grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)[\s\S]*?overflow-x:\s*visible/);
  assert.doesNotMatch(calendar, /overflow-x:\s*(?:auto|scroll)/, 'calendar filters and day tabs already wrap and must not create nested scrollers');

  for (const source of [series, tours, daily, calendar, ...tertiarySources]) {
    assert.doesNotMatch(source, /font-size:\s*(?:9|10|11)px/, 'visible PNM support text must be at least 12px');
    assert.doesNotMatch(source, /fontSize:\s*(?:9|10|11)\b/, 'visible inline PNM support text must be at least 12px');
  }
  assert.doesNotMatch(roster, /text-\[(?:9|10|11)px\]/);

  assert.match(style, /\[data-pnm-home-games='true'\]\[role='dialog'\]\s*\{[\s\S]*?z-index:\s*12000 !important/);
  assert.match(style, /input:is\(\[type='checkbox'\], \[type='radio'\]\)[\s\S]*?height:\s*20px !important/);
  assert.match(style, /\[class\*='text-\[#64748B\]'\][\s\S]*?\[class\*='text-\[#4A5E78\]'\][\s\S]*?color:\s*#9aa8b5 !important/);
  assert.match(style, /\[data-pnm-home-games='true'\] :is\(input, textarea\)::placeholder[\s\S]*?color:\s*#9aa8b5 !important/);
  const commanderPanelSelector = style.match(
    /\[data-pnm-home-games='true'\] :is\(([^)]*)\)\s*\{\s*border:/,
  );
  assert.ok(commanderPanelSelector, 'Commander panel framing selector must exist');
  assert.doesNotMatch(commanderPanelSelector[1], /role='dialog'/, 'modal scrims cannot inherit panel paint');
  assert.match(style, /\[style\*='border-radius: 50%'\][\s\S]*?border-radius:\s*50% !important/);
  assert.match(commander, /<label htmlFor="home-games-join-code"/);

  assert.match(calendar, /\.ec-filter-label[\s\S]*?color:\s*#aeb9c8/);
  assert.match(calendar, /\.ec-smart-agg-note[\s\S]*?color:\s*#d9b35c/);
  assert.match(series, /\.sidebar-tab-count[\s\S]*?color:\s*#9aa8b5/);
});

test('small support labels use stable AA colors instead of translucent low-contrast text', () => {
  const calendar = read('pages/hub/events-calendar.js');
  const daily = read('pages/hub/daily-tournaments.js');
  const tours = read('pages/hub/poker-tours.js');
  const series = read('pages/hub/poker-series.js');

  assert.match(calendar, /\.ev-stop-name[^}]*color:\s*#9aa8b5/);
  assert.match(calendar, /\.ev-event-count[^}]*color:\s*#c4a7f7/);
  assert.match(calendar, /\.ev-buyin-range[^}]*color:\s*#c4a7f7/);
  assert.match(calendar, /\.ev-recurrence[^}]*color:\s*#d9b35c/);
  assert.match(calendar, /\.ec-dot-more[^}]*color:\s*#aeb9c8/);
  assert.match(calendar, /\.ec-error-detail[^}]*color:\s*#aeb9c8/);
  assert.match(calendar, /\.ec-date-count[^}]*color:\s*#aeb9c8/);
  assert.match(calendar, /\.loc-popular-label[^}]*color:\s*#aeb9c8/);
  assert.match(calendar, /\.ec-search-input::placeholder[^}]*color:\s*#9aa8b5/);
  assert.match(calendar, /\.loc-input::placeholder[^}]*color:\s*#9aa8b5/);
  assert.match(daily, /\.cal-wd[^}]*color:\s*#aeb9c8/);
  assert.match(daily, /\.dt-search-input::placeholder[^}]*color:\s*#9aa8b5/);
  assert.match(daily, /\.dt-source-state time[^}]*color:\s*#aeb9c8/);
  assert.match(tours, /\.sidebar-tab-count[^}]*color:\s*#9aa8b5/);
  assert.match(series, /\.tours-search-bar-input::placeholder[^}]*color:\s*#9aa8b5/);
  assert.match(series, /\.pnm-source-state time[^}]*color:\s*#aeb9c8/);
  [tours, series].forEach((page) => {
    assert.match(page, /\.sidebar-clear-btn[^}]*color:\s*#ff8a8f/);
    assert.match(page, /\.tours-clear-all-btn[^}]*color:\s*#ff8a8f/);
    assert.match(page, /\.tours-results-sort[^}]*color:\s*#9aa8b5/);
    assert.match(page, /\.tours-empty p[^}]*color:\s*#9aa8b5/);
    assert.match(page, /\.tour-stop-location[^}]*color:\s*#9aa8b5/);
    assert.match(page, /\.tour-series-header[^}]*color:\s*#9aa8b5/);
    assert.match(page, /\.tour-series-more[^}]*color:\s*#9aa8b5/);
    assert.match(page, /\.tour-card-established[^}]*color:\s*#9aa8b5/);
  });
});

test('Poker Tours result selects have explicit accessible names', () => {
  const tours = read('pages/hub/poker-tours.js');
  for (const [id, label] of [
    ['tour-buyin-filter', 'Filter tours by buy-in'],
    ['tour-region-filter', 'Filter tours by region'],
    ['tour-sort-order', 'Sort poker tours'],
  ]) {
    assert.match(tours, new RegExp(`<label htmlFor="${id}">`));
    assert.match(tours, new RegExp(`<select id="${id}" aria-label="${label}"`));
  }
});
