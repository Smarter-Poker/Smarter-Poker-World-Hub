import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { haversineMiles } from '../src/components/poker-near-me/pnm-utils.js';
import {
  attachPokerPopupViewportGuard,
  buildPokerRouteStopPopupHtml,
  buildPokerTourPopupHtml,
  buildPokerUserLocationPopupHtml,
  buildPokerVenueLocationPopupHtml,
  buildPokerVenuePopupHtml,
  createPokerClusterIcon,
  createPokerRouteStopIcon,
  createPokerTourIcon,
  createPokerUserLocationIcon,
  createPokerVenueIcon,
  POKER_MAP_LEGEND_ITEMS,
  POKER_VENUE_TYPE_COLORS,
} from '../src/components/poker-near-me/mapPresentation.js';

const root = new URL('../', import.meta.url);
const source = (path) => readFile(new URL(path, root), 'utf8');

test('saved map filters have real pressed controls and reset restores the same map/list feed', async () => {
  const require = createRequire(import.meta.url); const React = require('react'); const ts = require('typescript');
  const { renderToStaticMarkup } = require('react-dom/server');
  const text = await source('src/components/poker-near-me/MapTabPanel.jsx');
  const code = ts.transpileModule(text, { compilerOptions: { esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  let mapped;
  const Map = props => { mapped = props.venues; return React.createElement('div', { 'data-map-list-ids': props.venues.map(v => v.id).join(',') }, props.mapControls); };
  new Function('require', 'module', 'exports', code)(name => {
    if (name === 'react') return { ...React, useMemo: fn => fn() };
    if (name === 'next/dynamic') return () => Map;
    if (name === './VenueMap') return { MapErrorBoundary: props => props.children };
    if (name === './PokerNearMeConsole') return { PokerNearMeConsoleIcon: () => null };
    return require(name);
  }, module, module.exports);
  const keys = ['cashGames', 'tournaments', 'is24Hours', 'lowStakes', 'topRated'];
  let flags = Object.fromEntries(keys.map(key => [key, false]));
  const page = await source('pages/hub/poker-near-me/[pnmTab].js');
  const restoreStart = page.indexOf('  useEffect(() => {', page.indexOf('const mapFiltersPersistSkipRef'));
  const restore = page.slice(restoreStart + '  useEffect(() => {'.length, page.indexOf('  }, []);', restoreStart));
  new Function('localStorage', 'setMapFilters', restore)({ getItem: () => JSON.stringify({ ...flags, topRated: true }) }, value => { flags = value; });
  const venues = [
    { id: 'high', trust_score: 5, games_offered: ['NLH'], stakes_cash: ['1/2'], has_tournaments: true, hours: '24/7' },
    { id: 'low', trust_score: 1, games_offered: [], stakes_cash: ['5/10'], has_tournaments: false, hours: '9-5' },
  ];
  const render = () => module.exports.default({ allVenuesForMap: venues, mapFilters: flags, setMapFilters: update => { flags = typeof update === 'function' ? update(flags) : update; }, filters: { radius: 50 }, setFilters() {} });
  const buttons = tree => {
    const found = []; const walk = node => { if (!node || typeof node !== 'object') return; if (node.type === 'button') found.push(node); React.Children.forEach(node.props?.children, walk); }; walk(tree); return found;
  };
  let tree = render(); let html = renderToStaticMarkup(tree);
  assert.deepEqual(mapped.map(v => v.id), ['high']);
  assert.match(html, /<details[^>]*pnm-map-filter-disclosure/); assert.match(html, /Map Filters[^<]*1 Active/);
  assert.equal(buttons(tree).filter(button => 'aria-pressed' in button.props).length, 5);
  const rated = buttons(tree).find(button => button.props.children === 'Top Rated');
  assert.ok(rated); assert.equal(rated.props['aria-pressed'], true); rated.props.onClick();
  html = renderToStaticMarkup(render()); assert.deepEqual(mapped.map(v => v.id), ['high', 'low']);
  for (const key of keys) flags[key] = true;
  tree = render(); const reset = buttons(tree).find(button => button.props.children === 'Reset Map Filters');
  assert.ok(reset); reset.props.onClick(); renderToStaticMarkup(render());
  assert.ok(keys.every(key => flags[key] === false)); assert.deepEqual(mapped.map(v => v.id), ['high', 'low']);
  for (const [key, label] of [['cashGames', 'Cash Games'], ['tournaments', 'Tournaments'], ['is24Hours', 'Open 24 Hours'], ['lowStakes', 'Low Stakes'], ['topRated', 'Top Rated']]) {
    const button = buttons(render()).find(item => item.props.children === label);
    assert.ok(button); assert.equal(button.props.type, 'button'); button.props.onClick();
    assert.equal(flags[key], true); assert.equal(keys.filter(item => flags[item]).length, 1);
    renderToStaticMarkup(render()); assert.deepEqual(mapped.map(v => v.id), ['high']);
    buttons(render()).find(item => item.props.children === label).props.onClick();
    renderToStaticMarkup(render()); assert.deepEqual(mapped.map(v => v.id), ['high', 'low']);
  }
  const css = await source('src/styles/worlds/poker-near-me-console-map.css');
  assert.match(css, /pnm-map-filter-disclosure[\s\S]*min-height:\s*44px/);
  assert.match(css, /pnm-map-filter-options button\[aria-pressed='true'\]/);
});

test('actual general Clear Filters also resets every persisted map flag', async () => {
  const page = await source('pages/hub/poker-near-me/[pnmTab].js');
  const start = page.indexOf('  const clearFilters = useCallback(');
  const callback = page.slice(start, page.indexOf('  // Loading skeleton component', start));
  let mapFlags = { cashGames: true, tournaments: true, is24Hours: true, lowStakes: true, topRated: true };
  const names = [...new Set([...callback.matchAll(/\b(set[A-Z]\w*)\(/g)].map(match => match[1]))];
  // Include the required setter independently so its absence really fails the old source.
  const scope = Object.fromEntries(names.map(name => [name, () => {}]));
  Object.assign(scope, { useCallback: fn => fn, setMapFilters: value => { mapFlags = value; }, clearPersistedLocation() {}, getCurrentDay: () => 'Monday', INITIAL_VISIBLE: 20 });
  new Function(...Object.keys(scope), `${callback}; return clearFilters;`)(...Object.values(scope))();
  assert.deepEqual(mapFlags, { cashGames: false, tournaments: false, is24Hours: false, lowStakes: false, topRated: false });
});

test('the real map frame opens map-first without a modal or redundant frame and retains one map', async () => {
  const require = createRequire(import.meta.url);
  const React = require('react');
  const ts = require('typescript');
  const { renderToStaticMarkup } = require('react-dom/server');
  const readCandidate = (filename) => process.env.PNM_MAP_LAYOUT_REV
    ? execFileSync('git', ['show', `${process.env.PNM_MAP_LAYOUT_REV}:${filename}`], { encoding: 'utf8' })
    : readFileSync(new URL(filename, root), 'utf8');
  const modules = new Map();
  function load(filename) {
    if (modules.has(filename)) return modules.get(filename).exports;
    const module = { exports: {} };
    modules.set(filename, module);
    const code = ts.transpileModule(readCandidate(filename), { compilerOptions: {
      esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    } }).outputText;
    new Function('require', 'module', 'exports', code)((name) => {
      if (!name.startsWith('.')) return require(name);
      const base = path.posix.normalize(path.posix.join(path.posix.dirname(filename), name));
      const found = [base, base + '.js', base + '.jsx'].find((candidate) => existsSync(new URL(candidate, root)));
      assert.ok(found, `actual dependency ${name} exists`);
      return load(found);
    }, module, module.exports);
    return module.exports;
  }
  const Frame = load('src/components/poker-near-me/MapSurfaceFrame.jsx').default;
  const html = renderToStaticMarkup(React.createElement(Frame, { title: 'National Poker Map' },
    React.createElement('div', { 'data-real-map-subtree': 'one' }, 'Mapped venue data')));
  assert.match(html, /data-pnm-map-layout="viewport"/);
  assert.match(html, /role="region"/);
  assert.match(html, /data-map-fullscreen="false"/);
  assert.match(html, /Expand National Poker Map to fullscreen/);
  assert.doesNotMatch(html, /aria-modal="true"|role="dialog"|pnm-map-surface__foot/);
  assert.equal((html.match(/data-real-map-subtree="one"/g) || []).length, 1);

  const css = require('postcss').parse(readCandidate('src/styles/worlds/poker-near-me-console-map.css'));
  const declarations = (selector) => {
    const found = css.nodes.find((node) => node.type === 'rule' && node.selector === selector);
    assert.ok(found, `${selector} has an authoritative rule`);
    return Object.fromEntries(found.nodes.filter((node) => node.type === 'decl').map((node) => [node.prop, node.value]));
  };
  const surface = declarations('body.world-poker-near-me .pnm-map-surface');
  assert.equal(surface.width, '100%');
  assert.equal(surface['max-width'], 'none');
  assert.equal(surface.height, 'calc(100dvh - var(--pnm-map-page-chrome, 112px))');
  assert.equal(surface.transition, 'none');
  assert.equal(surface.animation, 'none');
  const header = declarations('body.world-poker-near-me .pnm-map-surface__header');
  assert.equal(header.display, 'flex');
  assert.equal(header['min-height'], '56px');
  assert.equal(header.background, '#020406');
  assert.equal(header['flex-wrap'], 'nowrap');
  const controls = declarations("body.world-poker-near-me .pnm-map-surface[data-pnm-map-layout='viewport'] .pnm-map-surface__controls");
  assert.equal(controls.width, 'max-content', 'legacy mobile 100% grid cannot consume the title');
  assert.equal(controls['flex-wrap'], 'nowrap');
  const children = declarations('body.world-poker-near-me .pnm-map-surface__controls > *');
  assert.equal(children.width, 'auto', 'legacy 100% children cannot overlap siblings');
  assert.equal(children['min-width'], '44px');
  const fullscreen = declarations('body.world-poker-near-me .pnm-map-surface--fullscreen .pnm-map-surface__header');
  assert.equal(fullscreen['min-height'], '56px', 'legacy 112px fullscreen head is retired');
  const mobile = css.nodes.find((node) => node.type === 'atrule' && node.name === 'media' && node.params === '(max-width: 600px)');
  const mobileButton = mobile.nodes.find((node) => node.type === 'rule' && node.selector === "body.world-poker-near-me .pnm-map-surface[data-pnm-map-layout='viewport'] .pnm-map-surface__fullscreen-control");
  assert.ok(mobileButton);
  assert.ok(mobileButton.nodes.some((node) => node.prop === 'width' && node.value === '44px' && node.important), 'fullscreen cannot inherit a 100% mobile hitbox');
  const viewport = declarations('body.world-poker-near-me .pnm-map-surface__viewport');
  assert.equal(viewport.flex, '1 1 0');
  assert.equal(viewport.padding, '0');
  assert.equal(viewport['min-height'], '0');
  const picker = declarations('body.world-poker-near-me .pnm-map-surface .pnm-location-picker.pnm-map-stage');
  assert.equal(picker.display, 'flex', 'auto-height Leaflet pane has a definite flex parent');
  assert.equal(picker['flex-direction'], 'column');
  const pickerMap = declarations('body.world-poker-near-me .pnm-map-surface .pnm-location-picker__map');
  assert.equal(pickerMap.flex, '1 1 0');
  assert.equal(pickerMap.height, 'auto');
  assert.equal(pickerMap['min-height'], '0');
});

test('map-bearing results keep discovery before subordinate content without losing alternatives', async () => {
  const venue = await source('pages/hub/venues/[id].js');
  const planner = await source('src/components/poker-near-me/RoadTripPlanner.jsx');
  const calendar = await source('pages/hub/events-calendar.js');
  const search = await source('src/components/poker-near-me/GlobalSearchOverlay.jsx');
  for (const file of ['home-games', 'poker-series', 'poker-tours']) {
    const page = await source(`pages/hub/${file}.js`);
    assert.match(page, /pnm-map-directory/);
    assert.match(page, /<details className="pnm-map-directory-filters">/);
    assert.ok(page.indexOf('<details className="pnm-map-directory-filters">') < page.indexOf('<VenueMap'));
  }
  assert.ok(venue.indexOf('<MapSurfaceFrame') < venue.indexOf('<DeepRouteSignalDeck'));
  assert.ok(planner.indexOf('<MapSurfaceFrame') < planner.indexOf('className="rtp-stats-bar"'));
  assert.ok(search.indexOf('className="pnm-global-search-map gso-map"') < search.indexOf('className="gso-summary"'));
  assert.match(search, /mapTitle=\{nameMatchFallback \? 'Closest Published Name Matches' : missingFilterCoverage > 0 \? 'Published Matches, Coverage Incomplete'/);
  assert.match(calendar, /\[viewMode, setViewMode\] = useState\('map'\)/);
  assert.match(calendar, /<details className="ec-map-filter-disclosure">/);
  assert.match(calendar, /\['map', 'list', 'calendar'\]\.map/);
  for (const mode of ['map', 'list', 'calendar']) assert.ok(calendar.includes(`viewMode === '${mode}'`));
});

test('an obsolete viewport response cannot replace current filters or Show All', async () => {
  const panel = await source('src/components/poker-near-me/VenueMapPanel.jsx');
  const body = panel.slice(panel.indexOf('async function searchCurrentMapArea()'), panel.indexOf('function resetMapArea()'));
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const writes = [];
  const abortRef = { current: null };
  const deps = {
    viewportBoundsRef: { current: { north: 40, south: 30, east: -70, west: -90 } },
    enableViewportSearch: true, areaSearchBusy: false, viewportAbortRef: abortRef,
    mountedRef: { current: true }, viewportState: '', AbortController,
    appendPokerMapBounds: p => p, URLSearchParams, fetch: () => pending,
    baseVenuesRef: { current: [] }, isVenueWithinPokerMapBounds: () => true,
    summarizeVenueIntegrity: () => ({}), setViewportVenues: v => writes.push(v),
    setAreaSearchAvailable: () => {}, setAreaSearchBusy: () => {}, setAreaSearchError: () => {},
    capturePokerNearMeEvent: () => {}, mapInstanceRef: { current: null }, clusteringAvailable: false,
  };
  const run = new Function(...Object.keys(deps), `${body}; return searchCurrentMapArea();`);
  const result = run(...Object.values(deps));
  abortRef.current.abort();
  abortRef.current = null; // Show All/filter reset takes ownership away.
  finish({ ok: true, json: async () => ({ success: true, data: [{ id: 'stale' }] }) });
  await result;
  assert.deepEqual(writes, [], 'an abort-ignoring transport still cannot publish obsolete results');
  deps.fetch = async () => ({ ok: true, json: async () => ({ success: true, data: [{ id: 'current' }] }) });
  await run(...Object.values(deps));
  assert.deepEqual(writes, [[{ id: 'current' }]], 'the current owned response remains usable');
  assert.match(panel, /\[baseGeoSignature, viewportState, radiusMiles, userLocation\]/);
});

test('absent radius preserves result framing while Any resets without GPS', async () => {
  const mapSource = await source('src/components/poker-near-me/VenueMap.jsx');
  const start = mapSource.indexOf('// ═══ DYNAMIC RADIUS ZOOM');
  const effect = mapSource.slice(start);
  const body = effect.slice(effect.indexOf('useEffect(() => {') + 'useEffect(() => {'.length, effect.indexOf('}, [radiusMiles'));
  const calls = [];
  const map = { removeLayer: () => {}, fitBounds: () => calls.push('national'), setView: () => calls.push('radius') };
  const L = { latLng: (...v) => v, latLngBounds: (...v) => v, circle: () => ({ addTo: () => ({}) }) };
  const run = new Function('radiusMiles', 'userLocation', 'centerLocation', 'mapReady', 'mapInstanceRef', 'radiusCircleRef', 'window', 'radiusToZoom', body);
  run(undefined, { lat: 40, lng: -74 }, null, true, { current: map }, { current: null }, { L }, () => 10);
  assert.deepEqual(calls, [], 'no radius is not an instruction to replace result bounds');
  run('Any', null, null, true, { current: map }, { current: null }, { L }, () => 10);
  assert.deepEqual(calls, ['national'], 'nationwide discovery must work with denied/unavailable GPS');
  for (const radius of [25, 50, 100, 150, 200, 250, 500]) {
    calls.length = 0;
    run(radius, { lat: 40, lng: -74 }, null, true, { current: map }, { current: null }, { L }, () => 10);
    assert.deepEqual(calls, ['radius'], `${radius} miles remains an actual radius`);
  }
  calls.length = 0;
  run('invalid', { lat: 40, lng: -74 }, null, true, { current: map }, { current: null }, { L }, () => 10);
  assert.deepEqual(calls, []);
});

test('map dossiers use the same spherical distance as discovery without mutating rows', async () => {
  const map = await source('src/components/poker-near-me/VenueMap.jsx');
  const start = map.indexOf('const distanceMap = new Map();');
  const end = map.indexOf('// Update visible count', start);
  const measure = new Function('validVenues', 'userLocation', 'haversineMiles', `${map.slice(start, end)} return distanceMap;`);
  const venues = [{ id: 1, latitude: 34.0522, longitude: -118.2437 }];
  const before = JSON.stringify(venues);
  const distances = measure(venues, { lat: 40.7128, lng: -74.006 }, haversineMiles);
  assert.equal(distances.get(1), haversineMiles(40.7128, -74.006, 34.0522, -118.2437));
  assert.equal(JSON.stringify(venues), before);
});

test('map failures have direct list alternatives and unknown GPS remains requestable', async () => {
  const [map, panel, tab] = await Promise.all([
    source('src/components/poker-near-me/VenueMap.jsx'), source('src/components/poker-near-me/VenueMapPanel.jsx'), source('src/components/poker-near-me/MapTabPanel.jsx'),
  ]);
  for (const text of [map, panel, tab]) assert.match(text, /href="\/hub\/poker-near-me\/venues"/);
  assert.match(tab, /\{requestGpsLocation && \(/);
  assert.match(tab, /'Use my location'/);
  assert.doesNotMatch(tab, /mapTitle="Live poker map"/);
});

test('the lobby map state selector keeps a named 44px route-owned target', async () => {
  const lobby = await source('pages/hub/poker-near-me/lobby.js');
  assert.match(lobby, /<select\s+className="pnm-lobby-map-state-select"\s+aria-label="Filter Map By State"/);
  assert.match(lobby, /style=\{\{[^}]*minWidth: 100, minHeight: 44, boxSizing: 'border-box'/);
  assert.match(lobby, /value=\{mapStateFilter\}[\s\S]*?setFilters\(prev => \(\{ \.\.\.prev, mapState: e\.target\.value \}\)\)/);
});

function fakeLeaflet() {
  return { divIcon: (options) => ({ options }) };
}

test('shared map frame removes ornamental rails while preserving its one-map fullscreen lifecycle', async () => {
  const frame = await source('src/components/poker-near-me/MapSurfaceFrame.jsx');

  assert.match(frame, /PokerNearMeConsoleIcon/);
  assert.match(frame, /name=\{expanded \? 'close' : 'fullscreen'\}/);
  assert.match(frame, /data-pnm-map-console="map-first-v2"/);
  assert.match(frame, /data-pnm-map-layout="viewport"/);
  assert.doesNotMatch(frame, /pnm-map-surface__foot/);
  assert.doesNotMatch(frame, /function ExpandIcon|<svg/);

  assert.match(frame, /useAccessibleDialog/);
  assert.match(frame, /pnm:close-map-fullscreen/);
  assert.match(frame, /window\.dispatchEvent\(new Event\('resize'\)\)/);
  assert.match(frame, /onLayoutChange\?\.\(expanded\)/);
  assert.match(frame, /--pnm-map-attribution-clearance/);
  assert.equal((frame.match(/\{children\}/g) || []).length, 1, 'the Leaflet subtree stays mounted exactly once');
});

test('venue, tour, cluster and location markers use complete painted assets without CSS-built frames', () => {
  const L = fakeLeaflet();
  const venue = {
    id: 'venue-1',
    name: 'Signal Casino & Resort',
    venue_type: 'casino',
    logo_url: 'https://images.example/venue.png',
  };
  const tour = {
    ...venue,
    venue_type: 'tour_stop',
    tour_code: 'WPT',
    tour_name: 'World Poker Tour',
    stop_name: 'Signal Championship',
    is_running: true,
  };

  const primary = createPokerVenueIcon(L, venue);
  const compact = createPokerVenueIcon(L, venue, { variant: 'compact' });
  const primaryTour = createPokerTourIcon(L, tour);
  const compactTour = createPokerTourIcon(L, tour, { variant: 'compact' });
  const cluster = createPokerClusterIcon(L, { getChildCount: () => 125 });
  const location = createPokerUserLocationIcon(L);

  assert.deepEqual(primary.options.iconSize, [44, 44]);
  assert.deepEqual(compact.options.iconSize, [44, 44]);
  assert.deepEqual(primaryTour.options.iconSize, [52, 52]);
  assert.deepEqual(compactTour.options.iconSize, [44, 74]);
  assert.deepEqual(cluster.options.iconSize, [58, 58]);
  assert.deepEqual(location.options.iconSize, [40, 40]);
  assert.deepEqual(location.options.iconAnchor, [20, 40]);

  for (const html of [
    primary.options.html,
    compact.options.html,
    primaryTour.options.html,
    compactTour.options.html,
    cluster.options.html,
    location.options.html,
  ]) {
    assert.match(html, /pnm-painted-/);
    assert.doesNotMatch(html, /linear-gradient|radial-gradient|border-radius|box-shadow|<svg/i);
  }
  assert.match(cluster.options.html, /data-pnm-cluster-count="125" aria-hidden="true"/);
  assert.match(primaryTour.options.html, /data-pnm-tour-live="true"/);
});

test('every actual cluster density tier keeps a physical 44px target under fractional Leaflet placement', () => {
  const L = fakeLeaflet();
  // Published Chromium readback: nominal 44px became 43.99993896484375px
  // after translated area-search placement. Keep the real gate, not a tolerance.
  const placementLoss = 1 / 16384;
  for (const variant of ['compact', 'standard']) {
    for (const count of [1, 6, 9, 10, 13, 19, 20, 28, 49, 50, 99, 100, 125]) {
      const icon = createPokerClusterIcon(L, { getChildCount: () => count }, { variant });
      for (const dimension of icon.options.iconSize) {
        assert.ok(dimension - placementLoss >= 44, `${variant} cluster ${count} stays usable after actual fractional placement`);
      }
      assert.match(icon.options.html, new RegExp(`--pnm-cluster-size:${icon.options.iconSize[0]}px`), 'painted artwork and pointer target share their geometry');
    }
  }
});

test('painted map dossiers keep truth labels and delegated actions as live HTML', () => {
  const venue = {
    id: 'venue-1',
    name: 'Signal Casino',
    venue_type: 'casino',
    latitude: 36.1,
    longitude: -115.1,
    city: 'Las Vegas',
    state: 'NV',
    trust_score: 4.8,
    phone: '+1 702 555 0100',
    live_data: {
      games: [{ game: '1/3 NLH', tables_running: 3, is_simulated: true }],
      tables_running: 3,
      data_mode: 'estimated',
      is_simulated: true,
    },
  };
  const popup = buildPokerVenuePopupHtml(venue);
  const tourPopup = buildPokerTourPopupHtml({
    ...venue,
    venue_type: 'tour_stop',
    tour_code: 'WPT',
    tour_name: 'World Poker Tour',
    stop_name: 'Signal Championship',
    dates: 'October 10–18',
    is_running: false,
  });

  for (const html of [popup, tourPopup]) {
    assert.match(html, /data-pnm-console="painted-panel-v1"/);
    assert.match(html, /pnm-map-dossier__head/);
    assert.match(html, /pnm-map-dossier__foot/);
    assert.match(html, /fsp-trigger/);
    assert.match(html, /directions-trigger/);
    assert.doesNotMatch(html, /linear-gradient|radial-gradient|border-radius|box-shadow/i);
  }
  assert.match(popup, /data-cash-truth="modeled"/);
  assert.match(popup, /approx\. 3/);
  assert.match(tourPopup, />UPCOMING</);
});

test('painted map stylesheet is globally wired, native-ratio, responsive and free of drawn surface effects', async () => {
  const [styles, app] = await Promise.all([
    source('src/styles/worlds/poker-near-me-console-map.css'),
    source('pages/_app.js'),
  ]);

  assert.match(app, /poker-near-me-console-map\.css/);
  assert.doesNotMatch(styles, /painted-chassis-v1\/(?:top-flat\.webp|mid\.png|bottom-foot\.png)/);
  assert.match(styles, /painted-controls-v1\/utility-well\.webp/);
  assert.match(styles, /painted-controls-v1\/search-well\.webp/);
  assert.match(styles, /painted-panels-v1\/panel-head\.png/);
  assert.match(styles, /height:\s*calc\(100dvh - var\(--pnm-map-page-chrome, 112px\)\)/);
  assert.match(styles, /aspect-ratio:\s*1829\s*\/\s*313/);
  assert.match(styles, /\.pnm-map-surface--fullscreen\s*\{[^}]*position:\s*fixed\s*!important;[^}]*width:\s*100vw\s*!important;[^}]*height:\s*100dvh\s*!important/s);
  assert.match(styles, /@media \(max-width: 600px\)/);
  assert.match(styles, /@media \(max-height: 500px\) and \(orientation: landscape\)/);
  assert.match(
    styles,
    /@media \(max-width: 768px\), \(max-height: 500px\)[\s\S]*?\.pnm-map-overlay-stack\[data-legend-expanded='true'\] \.pnm-map-coverage\s*\{[^}]*display:\s*none\s*!important;/,
  );
  assert.match(styles, /min-height:\s*44px/g);

  assert.doesNotMatch(styles, /(?:linear|radial|conic)-gradient/i);
  assert.doesNotMatch(styles, /:hover/);
  for (const match of styles.matchAll(/(?:box|text)-shadow:\s*([^;]+)/gi)) {
    assert.match(match[1].trim(), /^none(?:\s*!important)?$/i);
  }
  for (const match of styles.matchAll(/border-radius:\s*([^;]+)/gi)) {
    assert.match(match[1].trim(), /^0(?:\s*!important)?$/i);
  }
});

test('road-trip markers and popups print on the shared painted map presentation', async () => {
  const planner = await source('src/components/poker-near-me/RoadTripPlanner.jsx');
  for (const helper of [
    'createPokerRouteStopIcon',
    'buildPokerRouteStopPopupHtml',
    'createPokerVenueIcon',
    'createPokerTourIcon',
    'buildPokerVenuePopupHtml',
    'buildPokerTourPopupHtml',
    'createPokerClusterIcon',
    'createPokerPopupClickHandler',
    'attachPokerPopupViewportGuard',
    'syncPokerMapKeyboardTargets',
    'createPokerMarkerLayer',
    'addPokerMapLayers',
  ]) {
    assert.match(planner, new RegExp(`\\b${helper}\\(`), `planner must call ${helper}`);
  }
  // No marker or popup markup is authored inside the planner any more.
  assert.doesNotMatch(planner, /L\.divIcon\(/);
  assert.doesNotMatch(planner, /style="|border-radius|box-shadow|<b style/i);
  assert.doesNotMatch(planner, /escapeHtml|const esc = /);
  // Popup actions are delegated and cleaned up with the map session.
  assert.match(planner, /mapContainer\.addEventListener\('click', popupClickHandler\)/);
  assert.match(planner, /mapContainer\.removeEventListener\('click', popupClickHandler\)/);
  assert.match(planner, /detachPopupGuard\(\);/);
  assert.match(planner, /map\.on\('moveend zoomend resize', scheduleKeyboardTargetSync\)/);
  // Corridor, dates, saved trips and telemetry-free data paths are untouched.
  assert.match(planner, /venues\.filter\(v => isVenueNearRoute\(v, geoStops, corridorMi\)\)/);
  assert.match(planner, /validateTravelDateRange\(dateRange\)/);
  assert.match(planner, /filterSeriesForRoute\(/);
  assert.match(planner, /localStorage\.setItem\('pnm_saved_trips'/);
  assert.match(planner, /sessionStorage\.setItem\(tripDraftKey\(\)/);
  assert.match(planner, /pnm_trip_draft_v2:\$\{getAuthUser\(\)\.id\}/);
  assert.match(planner, /const TRIP_DRAFT_KEY = 'pnm_trip_draft_v1'/);
});

test('road-trip form controls sit in painted wells and plates without frames on frames', async () => {
  const planner = await source('src/components/poker-near-me/RoadTripPlanner.jsx');
  const styles = await source('src/styles/worlds/poker-near-me-console-map.css');

  const wells = planner.match(/<span className="rtp-well[^"]*">/g) || [];
  assert.ok(wells.length >= 5, 'origin, waypoint, destination and both dates print inside wells');
  assert.match(planner, /<span className="rtp-well rtp-well--date">\s*<input type="date" aria-label="Trip start date"/);
  assert.match(planner, /<span className="rtp-well rtp-well--date">\s*<input type="date" aria-label="Trip end date"/);
  assert.doesNotMatch(planner, /className="rtp-dot/);
  assert.doesNotMatch(planner, /→/);
  // Plates carry live labels only; an icon holder on a plate is a frame on a frame.
  assert.match(planner, /<button type="button" className="rtp-calculate-btn" onClick=\{calculateRoute\} disabled=\{calculating\} aria-busy=\{calculating\}>\s*\{calculating \? 'Calculating\.\.\.' : 'Plan My Trip'\}\s*<\/button>/);
  for (const plate of ['rtp-result-action--save', 'rtp-result-action--share', 'rtp-result-action--route']) {
    const block = planner.slice(planner.indexOf(plate), planner.indexOf('</button>', planner.indexOf(plate)));
    assert.doesNotMatch(block, /PokerNearMeConsoleIcon/, `${plate} prints its label only`);
  }

  assert.match(styles, /\.road-trip-planner \.rtp-well, \.pnm-map-well\) \{[^}]*aspect-ratio:\s*1829 \/ 313;[^}]*search-well\.webp'\) center \/ contain no-repeat/s);
  assert.match(styles, /input\[type='date'\]::-webkit-calendar-picker-indicator \{[^}]*icon-calendar\.png/s);
  assert.match(styles, /:is\(\.rtp-add-waypoint, \.rtp-chip, \.rtp-calculate-btn\) \{[^}]*min-height:\s*44px !important;[^}]*aspect-ratio:\s*348 \/ 114;[^}]*button-secondary\.png/s);
  assert.match(styles, /:is\(\.rtp-chip\.active, \.rtp-calculate-btn\) \{[^}]*button-primary\.png/s);
  assert.match(styles, /font:\s*600 16px\/1\.2 var\(--font-inter\)/, 'fields stay at 16px so iOS never zooms');
});

test('route stops, user location and venue location dossiers are painted and escape live data', () => {
  const L = fakeLeaflet();
  const hostile = '<img src=x onerror=alert(1)>';
  const stops = [{ name: `Dallas ${hostile}` }, { name: 'Tulsa, OK' }, { name: 'Houston, TX' }];

  const origin = createPokerRouteStopIcon(L, stops[0], 0, 3);
  const waypoint = createPokerRouteStopIcon(L, stops[1], 1, 3);
  const destination = createPokerRouteStopIcon(L, stops[2], 2, 3);
  for (const icon of [origin, waypoint, destination]) {
    assert.deepEqual(icon.options.iconSize, [44, 44]);
    assert.deepEqual(icon.options.iconAnchor, [22, 22]);
    assert.match(icon.options.html, /pnm-painted-marker__machine/);
    assert.doesNotMatch(icon.options.html, /linear-gradient|radial-gradient|border-radius|box-shadow|<svg/i);
  }
  assert.match(origin.options.html, /data-pnm-route-role="origin"[\s\S]*>1</);
  assert.match(waypoint.options.html, /data-pnm-route-role="waypoint"[\s\S]*>2</);
  assert.match(destination.options.html, /data-pnm-route-role="destination"[\s\S]*>3</);
  assert.doesNotMatch(origin.options.html, /<img src=x/);

  const stopPopup = buildPokerRouteStopPopupHtml(stops[0], 0, 3);
  assert.match(stopPopup, /data-pnm-console="painted-panel-v1"/);
  assert.match(stopPopup, /Trip Start · Stop 1 Of 3/);
  assert.doesNotMatch(stopPopup, /<img src=x/);
  assert.match(buildPokerRouteStopPopupHtml(stops[1], 1, 3), /Waypoint · Stop 2 Of 3/);
  assert.match(buildPokerRouteStopPopupHtml(stops[2], 2, 3), /Destination · Stop 3 Of 3/);

  const here = buildPokerUserLocationPopupHtml({ title: 'You Are Here', detail: 'Your Current Location' });
  assert.match(here, /pnm-map-dossier__location-machine/);
  assert.doesNotMatch(here, /style="(?!--pnm-map-accent)/);
  const place = buildPokerVenueLocationPopupHtml({ name: hostile, city: 'Reno', state: 'NV' });
  assert.match(place, /data-pnm-console="painted-panel-v1"/);
  assert.doesNotMatch(place, /<img src=x/);
});

test('saved rooms, legend and tour status tell the truth without drawn chrome', () => {
  const L = fakeLeaflet();
  const venue = { id: 'v', name: 'Signal Casino', venue_type: 'poker_club' };
  const plain = createPokerVenueIcon(L, venue);
  const saved = createPokerVenueIcon(L, venue, { saved: true });
  assert.deepEqual(saved.options.iconSize, plain.options.iconSize);
  assert.deepEqual(saved.options.iconAnchor, plain.options.iconAnchor);
  assert.match(saved.options.html, /pnm-painted-marker--saved[\s\S]*data-pnm-saved="true"[\s\S]*pnm-painted-marker__saved/);
  assert.doesNotMatch(saved.options.html, /border-radius|box-shadow|markerPulse/);

  assert.deepEqual(
    POKER_MAP_LEGEND_ITEMS.map((item) => [item.type, item.color]),
    [
      ['casino', POKER_VENUE_TYPE_COLORS.casino.fill],
      ['poker_club', POKER_VENUE_TYPE_COLORS.poker_club.fill],
      ['tour_stop', POKER_VENUE_TYPE_COLORS.tour_stop.fill],
      ['charity', POKER_VENUE_TYPE_COLORS.charity.fill],
      ['home_game', POKER_VENUE_TYPE_COLORS.home_game.fill],
    ],
  );

  const running = buildPokerTourPopupHtml({ tour_code: 'WPT', tour_name: 'World Poker Tour', is_running: true });
  assert.match(running, />IN PROGRESS</);
  assert.doesNotMatch(running, /LIVE NOW/);
});

test('popup viewport guard prints a clipped dossier inside the visible map', () => {
  const listeners = {};
  const container = { getBoundingClientRect: () => ({ top: 100, bottom: 700, left: 0, right: 400, width: 400, height: 600 }) };
  const map = {
    on(names, fn) { for (const name of names.split(' ')) (listeners[name] ||= []).push(fn); },
    off(names, fn) { for (const name of names.split(' ')) listeners[name] = (listeners[name] || []).filter((f) => f !== fn); },
    getContainer: () => container,
  };
  let rect = { top: 40, bottom: 240, left: -30, right: 270, width: 300, height: 200 };
  const classes = new Set();
  const element = {
    dataset: {},
    style: {},
    classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)), remove: (c) => classes.delete(c) },
    getBoundingClientRect: () => rect,
  };
  const popup = { getElement: () => element, isOpen: () => true };
  const previousWindow = globalThis.window;
  globalThis.window = { requestAnimationFrame: (fn) => { fn(); return 1; }, cancelAnimationFrame() {} };
  try {
    const detach = attachPokerPopupViewportGuard(map);
    listeners.popupopen.forEach((fn) => fn({ popup }));
    assert.equal(element.style.marginBottom, '-256px', 'no room above: the dossier prints below its pin');
    assert.ok(classes.has('pnm-popup--below'));
    assert.equal(element.style.marginLeft, '36px', 'clipped left edge is nudged back inside');

    // A later settled move re-measures from natural geometry and releases the flip.
    rect = { top: 400 + 256, bottom: 600 + 256, left: 40 + 36, right: 340 + 36, width: 300, height: 200 };
    listeners.moveend.forEach((fn) => fn());
    assert.equal(element.style.marginBottom, '');
    assert.equal(element.style.marginLeft, '');
    assert.ok(!classes.has('pnm-popup--below'));

    detach();
    assert.equal((listeners.popupopen || []).length, 0);
    assert.equal((listeners.moveend || []).length, 0);
  } finally {
    globalThis.window = previousWindow;
  }
});

test('map frame restores focus and exact scroll, holds page geometry and fits its title', async () => {
  const frame = await source('src/components/poker-near-me/MapSurfaceFrame.jsx');
  assert.match(frame, /scrollRestoreRef\.current = \{\s*left: window\.scrollX,\s*top: window\.scrollY,\s*surfaceTop: rect \? rect\.top : null,\s*scroller: findScrollParent\(dialogRef\.current\),\s*\}/);
  assert.match(frame, /if \(delta\) scroller\.scrollTop \+= delta;/);
  assert.match(frame, /Math\.max\(0, window\.scrollY \+ delta\)/);
  assert.match(frame, /window\.scrollTo\(\{ left, top, behavior: 'instant' \}\)/);
  assert.match(frame, /className="pnm-map-surface__placeholder"/);
  assert.match(frame, /usePnmConsoleFitText\(title, 1\.02, 0\.7\)/);
  assert.match(frame, /onClick=\{toggleFullscreen\}/);
  assert.match(frame, /onLayoutChange\?\.\(expanded\)/);
});

test('every map consumer drops generic vector, glass and card chrome', async () => {
  const files = {
    venueMap: 'src/components/poker-near-me/VenueMap.jsx',
    panel: 'src/components/poker-near-me/VenueMapPanel.jsx',
    tab: 'src/components/poker-near-me/MapTabPanel.jsx',
    coverage: 'src/components/poker-near-me/MapCoverageReadout.jsx',
    preference: 'src/components/poker-near-me/MapPreferenceChooser.jsx',
    picker: 'src/components/maps/LeafletLocationPicker.jsx',
    planner: 'src/components/poker-near-me/RoadTripPlanner.jsx',
  };
  const sources = Object.fromEntries(await Promise.all(
    Object.entries(files).map(async ([key, path]) => [key, await source(path)]),
  ));
  for (const [key, text] of Object.entries(sources)) {
    assert.doesNotMatch(text, /<svg\b|innerHTML = '<svg/i, `${key} cannot draw vector icons`);
    assert.doesNotMatch(text, /linear-gradient|radial-gradient|backdrop-filter|blur\(/i, `${key} cannot fake glass or gradients`);
    assert.doesNotMatch(text, /borderRadius|boxShadow|border-radius:\s*[1-9]|box-shadow:\s*(?!none)/i, `${key} cannot draw cards`);
    assert.doesNotMatch(text, /onMouseEnter|onMouseLeave|:hover/, `${key} cannot rely on hover`);
    assert.doesNotMatch(text, /<style>\{/, `${key} cannot carry a private stylesheet`);
  }
  assert.match(sources.venueMap, /buildPokerUserLocationPopupHtml\(/);
  assert.match(sources.panel, /buildPokerUserLocationPopupHtml\(/);
  assert.match(sources.venueMap, /POKER_MAP_LEGEND_ITEMS\.map/);
  assert.match(sources.venueMap, /createPokerVenueIcon\(L, venue, \{ overrideColor: normalizedUniformColor, saved: true \}\)/);
  assert.match(sources.coverage, /<aside[\s\S]*aria-label="Map coverage status"/);
  assert.doesNotMatch(sources.coverage, /PokerNearMePanelShell/);
  assert.match(sources.coverage, /'Map Coverage'/);
  assert.doesNotMatch(sources.coverage, /Live coverage/);
  assert.match(sources.tab, /<PokerNearMeConsoleIcon name="location" \/>/);
  assert.match(sources.preference, /<PokerNearMeConsoleIcon name="directions" \/>/);
  assert.match(sources.picker, /pnm-painted-picker-pin/);
  assert.match(sources.picker, /className="pnm-map-well"/);
});

test('popup viewport guard keeps dossiers clear of the zoom rail and lets the HUD step aside', () => {
  const listeners = {};
  const box = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
  const zoomRail = { getBoundingClientRect: () => box(10, 110, 44, 88) };
  const hud = { getBoundingClientRect: () => box(14, 500, 400, 150) };
  const surface = {
    dataset: {},
    querySelectorAll: (selector) => (selector.includes('leaflet-control-zoom') ? [zoomRail] : [hud]),
  };
  const container = {
    closest: (selector) => (selector === '.pnm-map-surface' ? surface : null),
    getBoundingClientRect: () => box(0, 100, 1000, 600),
  };
  const map = {
    on(names, fn) { for (const name of names.split(' ')) (listeners[name] ||= []).push(fn); },
    off(names, fn) { for (const name of names.split(' ')) listeners[name] = (listeners[name] || []).filter((f) => f !== fn); },
    getContainer: () => container,
  };
  // A dossier opened beside the zoom rail and low enough to cover the HUD.
  let rect = box(20, 420, 300, 200);
  const element = {
    dataset: {},
    style: {},
    classList: { toggle() {}, remove() {} },
    getBoundingClientRect: () => rect,
  };
  const popup = { getElement: () => element, isOpen: () => true };
  const previousWindow = globalThis.window;
  globalThis.window = { requestAnimationFrame: (fn) => { fn(); return 1; }, cancelAnimationFrame() {} };
  try {
    const detach = attachPokerPopupViewportGuard(map);
    listeners.popupopen.forEach((fn) => fn({ popup }));
    assert.equal(element.style.marginLeft, '', 'the rail sits above this dossier, so it stays put');
    assert.equal(surface.dataset.pnmPopupCovering, 'true', 'the HUD steps aside for the open dossier');

    // Re-opened level with the zoom rail: moved to its right, clear of the HUD.
    rect = box(20, 120, 300, 200);
    listeners.popupopen.forEach((fn) => fn({ popup }));
    assert.equal(element.style.marginLeft, '40px');
    assert.equal(surface.dataset.pnmPopupCovering, undefined);

    listeners.popupclose.forEach((fn) => fn({ popup }));
    detach();
    assert.equal(surface.dataset.pnmPopupCovering, undefined);
  } finally {
    globalThis.window = previousWindow;
  }
});

test('compact map command lines retain touch, popup and fullscreen stacking safeguards', async () => {
  const styles = await source('src/styles/worlds/poker-near-me-console-map.css');
  assert.match(styles, /\.pnm-map-surface__header \{[^}]*display:\s*flex;[^}]*min-height:\s*56px;/);
  assert.match(styles, /\.pnm-map-surface__fullscreen-control \{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/);
  assert.doesNotMatch(styles, /top-flat\.webp|bottom-foot\.png|19\.7cqw|62\.36%/);
  assert.match(styles, /@media \(max-height: 500px\) and \(orientation: landscape\) \{[\s\S]*?\.pnm-map-overlay-stack \{[^}]*left:\s*64px !important;/);
  assert.match(styles, /padding: 0 calc\(var\(--rtp-plate-w\) \* 0\.11\) !important;/);
  assert.match(styles, /padding: 0 calc\(var\(--pnm-marker-label-width, 140px\) \* 0\.08\) !important;/);
  assert.match(styles, /\[data-pnm-popup-covering='true'\] :is\([\s\S]*?\) \{\s*visibility: hidden;/);
  assert.match(styles, /:is\(\.pnc-panel__body, \.pnc__body\):has\(\.pnm-map-surface--fullscreen\) \{\s*z-index: auto !important;/);
});
test('map controls use layout flow instead of overlapping plate coordinates', async () => {
  const styles = await source('src/styles/worlds/poker-near-me-console-map.css');
  const header = styles.match(/\.pnm-map-surface__header \{([^}]*)\}/)[1];
  const identity = styles.match(/\.pnm-map-surface__identity \{([^}]*)\}/)[1];
  const controls = styles.match(/\.pnm-map-surface__controls \{([^}]*)\}/)[1];
  assert.match(header, /display:\s*flex/);
  assert.match(identity, /min-width:\s*0;/);
  assert.match(identity, /width:\s*auto !important;/);
  assert.match(identity, /flex:\s*1 1 0;/);
  assert.match(controls, /flex:\s*0 0 auto/);
  assert.doesNotMatch(identity + controls, /position:\s*absolute|top:|right:|left:|transform:/);
  assert.match(styles, /@media \(max-width: 600px\)[\s\S]*?\.pnm-map-radius-control \{ width: 54px !important;/);
});
test('fullscreen retains the compact command line and real viewport rather than a second map', async () => {
  const styles = await source('src/styles/worlds/poker-near-me-console-map.css');
  const frame = await source('src/components/poker-near-me/MapSurfaceFrame.jsx');
  assert.match(styles, /--fullscreen \{[^}]*height:\s*100dvh !important;[^}]*min-height:\s*0 !important;/);
  assert.match(styles, /--fullscreen \.pnm-map-surface__header \{\s*min-height: 56px !important;\s*padding-top: max\(6px, env\(safe-area-inset-top, 0px\)\);/);
  assert.match(frame, /\{expanded \? 'Exit Full Screen' : 'Full Screen'\}/);
  assert.equal((frame.match(/\{children\}/g) || []).length, 1);
});
test('short landscape keeps a usable map without oversized decorative rails', async () => {
  const styles = await source('src/styles/worlds/poker-near-me-console-map.css');
  const block = styles.slice(styles.indexOf('@media (max-height: 500px) and (orientation: landscape) {'));
  assert.match(block, /\.pnm-map-surface \{ min-height: 240px;/);
  assert.doesNotMatch(styles, /painted-chassis-v1\/(?:top-flat|mid|bottom-foot)/);
});
test('trip result plates declare a painted width the longest label fits inside', async () => {
  const styles = await source('src/styles/worlds/poker-near-me-console-map.css');
  const planner = await source('src/components/poker-near-me/RoadTripPlanner.jsx');
  // A `contain` plate at a 44px row height can only paint 44 x 348/114 = 134px,
  // and "Start Full Route (N Stops)" measured 150px at 1440. The plate declares
  // its own width so the art keeps its ratio and the label lands in the face.
  assert.match(styles, /\.rtp-result-action \{\s*--rtp-plate-w:\s*min\(100%, 248px\);[\s\S]*?aspect-ratio:\s*348 \/ 114;[\s\S]*?padding: 0 calc\(var\(--rtp-plate-w\) \* 0\.11\) !important;/);
  assert.match(styles, /\.rtp-result-action--route \{[^}]*button-primary\.png/);
  assert.match(styles, /\.rtp-well--date \{\s*max-width:\s*240px;/);
  // Every class the planner prints resolves to a painted rule.
  for (const hook of ['rtp-result-action--route', 'rtp-well--date']) {
    assert.ok(planner.includes(hook), `${hook} is still printed`);
    assert.ok(styles.includes(`.${hook}`), `${hook} resolves to a rule`);
  }
});

test('a map given no centre and no radius frames the rows it was handed', async () => {
  const venueMap = await source('src/components/poker-near-me/VenueMap.jsx');
  // The global search overlay passes neither centerLocation nor radiusMiles, so
  // the national opening bounds stayed in force and one city answered with the
  // whole country. The fit is gated on a geography signature so it runs once per
  // result set and never fights a pan the viewer made.
  assert.match(venueMap, /createPokerVenueGeographySignature/);
  assert.match(venueMap, /const fittedGeographyRef = useRef\(null\);/);
  assert.match(venueMap, /if \(!centerLocation && !radiusMiles && validVenues\.length > 0\s*\n\s*&& geographySignature !== fittedGeographyRef\.current\) \{/);
  assert.match(venueMap, /fitBounds\(resultBounds, \{ padding: \[34, 34\], maxZoom: 12 \}\)/);
  assert.match(venueMap, /fittedGeographyRef\.current = null;/, 'a new map session forgets the frame it set');
  // A caller that owns its own view keeps it.
  assert.match(venueMap, /const center = centerLocation \|\| userLocation;/);
});
