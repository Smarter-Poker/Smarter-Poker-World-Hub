import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
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

function fakeLeaflet() {
  return { divIcon: (options) => ({ options }) };
}

test('shared map frame uses the painted console while preserving its one-map fullscreen lifecycle', async () => {
  const frame = await source('src/components/poker-near-me/MapSurfaceFrame.jsx');

  assert.match(frame, /PokerNearMeConsoleIcon/);
  assert.match(frame, /name=\{expanded \? 'close' : 'fullscreen'\}/);
  assert.match(frame, /data-pnm-map-console="painted-chassis-v1"/);
  assert.match(frame, /pnm-map-surface__foot/);
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
  assert.match(styles, /painted-chassis-v1\/top-flat\.png/);
  assert.match(styles, /painted-chassis-v1\/mid\.png/);
  assert.match(styles, /painted-chassis-v1\/bottom-foot\.png/);
  assert.match(styles, /painted-controls-v1\/utility-well\.png/);
  assert.match(styles, /painted-controls-v1\/search-well\.png/);
  assert.match(styles, /painted-panels-v1\/panel-head\.png/);
  assert.match(styles, /aspect-ratio:\s*1000\s*\/\s*348/);
  assert.match(styles, /aspect-ratio:\s*1829\s*\/\s*313/);
  assert.match(styles, /\.pnm-map-surface--fullscreen\s*\{[^}]*position:\s*fixed\s*!important;[^}]*width:\s*100vw\s*!important;[^}]*height:\s*100dvh\s*!important/s);
  assert.match(styles, /@media \(max-width: 600px\)/);
  assert.match(styles, /@media \(max-height: 500px\) and \(orientation: landscape\)/);
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
  assert.match(planner, /sessionStorage\.setItem\(TRIP_DRAFT_KEY/);
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

  assert.match(styles, /\.road-trip-planner \.rtp-well, \.pnm-map-well\) \{[^}]*aspect-ratio:\s*1829 \/ 313;[^}]*search-well\.png'\) center \/ contain no-repeat/s);
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
  assert.match(sources.coverage, /<PokerNearMePanelShell[\s\S]*as="aside"/);
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

test('map headers keep every control on a painted face at every width', async () => {
  const styles = await source('src/styles/worlds/poker-near-me-console-map.css');
  // Desktop/tablet: the fullscreen control is centred in the painted pill slot.
  assert.match(styles, /@media \(min-width: 601px\) and \(min-height: 501px\) \{[\s\S]*?\.pnm-map-surface__controls \{[^}]*top:\s*62\.36%;[^}]*right:\s*13%;/);
  assert.match(styles, /\.pnm-map-surface__fullscreen-control \{[^}]*width:\s*19\.7cqw;[^}]*min-width:\s*44px;/);
  // Phones: capped panel head with the rail layer clipped below the cap.
  assert.match(styles, /@media \(max-width: 600px\) and \(min-height: 501px\) \{[\s\S]*?panel-head\.png'\),\s*url\('\/images\/pnm-console\/painted-chassis-v1\/mid\.png'\) !important;[\s\S]*?background-clip:\s*border-box, content-box !important;/);
  // Short landscape: the HUD stack clears the 44px zoom rail.
  assert.match(styles, /@media \(max-height: 500px\) and \(orientation: landscape\) \{[\s\S]*?\.pnm-map-overlay-stack \{[^}]*left:\s*64px !important;/);
  // Percentage insets on plates never resolve against the row.
  assert.match(styles, /padding: 0 calc\(var\(--rtp-plate-w\) \* 0\.11\) !important;/);
  assert.match(styles, /padding: 0 calc\(var\(--pnm-marker-label-width, 140px\) \* 0\.08\) !important;/);
  // An open dossier is never hidden under the HUD, and fullscreen escapes panel stacking.
  assert.match(styles, /\[data-pnm-popup-covering='true'\] :is\([\s\S]*?\) \{\s*visibility: hidden;/);
  assert.match(styles, /:is\(\.pnc-panel__body, \.pnc__body\):has\(\.pnm-map-surface--fullscreen\) \{\s*z-index: auto !important;/);
});
