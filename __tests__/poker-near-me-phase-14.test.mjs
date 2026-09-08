import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildPokerTourPopupHtml,
  buildPokerVenuePopupHtml,
  createPokerClusterIcon,
  createPokerPopupClickHandler,
  createPokerTourIcon,
  createPokerUserLocationIcon,
  createPokerVenueContentSignature,
  createPokerVenueGeographySignature,
  createPokerVenueIcon,
  isPokerTourStop,
  syncPokerMapKeyboardTargets,
} from '../src/components/poker-near-me/mapPresentation.js';
import { createPokerMapSession, createPokerMarkerLayer } from '../src/lib/poker-near-me/mapRuntime.js';

const root = new URL('../', import.meta.url);
const source = (path) => readFile(new URL(path, root), 'utf8');

function fakeLeaflet() {
  const controls = [];
  const maps = [];
  const layers = [];
  const L = {
    divIcon: (options) => ({ options }),
    map: (container, options) => {
      const panes = new Map();
      const map = {
        container,
        options,
        panes,
        _animatingZoom: true,
        stopCalls: 0,
        offCalls: 0,
        removeCalls: 0,
        createPane(name) { const pane = { style: {} }; panes.set(name, pane); return pane; },
        getPane(name) { return panes.get(name); },
        _stop() { this.stopCalls += 1; },
        off() { this.offCalls += 1; },
        remove() { this.removeCalls += 1; },
      };
      maps.push(map);
      return map;
    },
    tileLayer: (url, options) => ({
      url,
      options,
      addTo(map) { this.map = map; layers.push(this); return this; },
    }),
    control: {
      attribution: () => ({
        addAttribution(value) { this.value = value; return this; },
        addTo(map) { this.map = map; controls.push(this); return this; },
      }),
    },
    layerGroup: () => ({ kind: 'plain', addTo(map) { this.map = map; return this; } }),
    markerClusterGroup: (options) => ({ kind: 'cluster', options, addTo(map) { this.map = map; return this; } }),
  };
  return { L, controls, maps, layers };
}

test('shared presentation preserves primary and compact marker contracts', () => {
  const { L } = fakeLeaflet();
  const venue = { id: 'venue-1', name: 'Signal Casino & Resort', venue_type: 'casino', logo_url: 'https://images.example/venue.png' };
  const primary = createPokerVenueIcon(L, venue);
  const compact = createPokerVenueIcon(L, venue, { variant: 'compact' });
  assert.deepEqual(primary.options.iconSize, [44, 44]);
  assert.deepEqual(compact.options.iconSize, [44, 44]);
  assert.match(primary.options.html, /Signal/);
  assert.match(compact.options.className, /vmp-venue-marker/);

  const tour = { ...venue, venue_type: 'tour_stop', tour_code: 'WSOP', tour_name: 'World Series', is_running: true };
  assert.equal(isPokerTourStop(tour), true);
  assert.equal(isPokerTourStop(venue), false);
  assert.deepEqual(createPokerTourIcon(L, tour).options.iconSize, [52, 52]);
  assert.deepEqual(createPokerTourIcon(L, tour, { variant: 'compact' }).options.iconSize, [44, 74]);
  assert.deepEqual(createPokerUserLocationIcon(L).options.iconAnchor, [20, 40]);
});

test('shared clusters retain density tiers on both map surfaces', () => {
  const { L } = fakeLeaflet();
  const cluster = (count) => ({ getChildCount: () => count });
  assert.deepEqual(createPokerClusterIcon(L, cluster(125)).options.iconSize, [58, 58]);
  assert.deepEqual(createPokerClusterIcon(L, cluster(125), { variant: 'compact' }).options.iconSize, [54, 54]);
  assert.deepEqual(createPokerClusterIcon(L, cluster(4)).options.iconSize, [44, 44]);
  assert.deepEqual(createPokerClusterIcon(L, cluster(4), { variant: 'compact' }).options.iconSize, [44, 44]);
  assert.match(createPokerClusterIcon(L, cluster(125)).options.html, /data-pnm-cluster-count="125" aria-hidden="true"/);
});

test('shared map keyboard reconciliation labels clusters and excludes clipped targets', () => {
  function target(rect, count = null) {
    const attributes = new Map([['tabindex', '0']]);
    const countNode = count == null ? null : {
      getAttribute: (name) => (name === 'data-pnm-cluster-count' ? String(count) : null),
    };
    return {
      tabIndex: 0,
      getBoundingClientRect: () => rect,
      querySelector: () => countNode,
      getAttribute: (name) => attributes.get(name) ?? null,
      setAttribute(name, value) { attributes.set(name, String(value)); },
      attributes,
    };
  }

  const visible = target({ left: 10, right: 54, top: 10, bottom: 54 }, 12);
  const clipped = target({ left: -54, right: -10, top: 10, bottom: 54 });
  const container = {
    getBoundingClientRect: () => ({ left: 0, right: 390, top: 0, bottom: 844 }),
    querySelectorAll: (selector) => {
      assert.equal(selector, '.leaflet-marker-icon[tabindex]');
      return [visible, clipped];
    },
  };

  assert.deepEqual(syncPokerMapKeyboardTargets(container), { visible: 1, hidden: 1 });
  assert.equal(visible.tabIndex, 0);
  assert.equal(visible.attributes.get('aria-label'), 'Zoom to 12 poker locations');
  assert.equal(visible.attributes.get('title'), 'Zoom to 12 poker locations');
  assert.equal(clipped.tabIndex, -1);
});

test('popup builders escape external data and expose only same-origin detail paths', () => {
  const hostile = {
    id: 'id" onclick="bad',
    name: '<img src=x onerror=bad()>',
    venue_type: 'casino',
    latitude: 36.1,
    longitude: -115.1,
    city: 'Las <Vegas>',
    state: 'NV',
    detailUrl: 'https://malicious.example/path',
  };
  const venuePopup = buildPokerVenuePopupHtml(hostile);
  assert.doesNotMatch(venuePopup, /<img src=x onerror=bad\(\)>/);
  assert.match(venuePopup, /data-url="\/hub\/venues\//);
  assert.doesNotMatch(venuePopup, /data-url="https:/);

  const tourPopup = buildPokerTourPopupHtml({ ...hostile, venue_type: 'tour_stop', tour_code: 'WPT"><script>' });
  assert.doesNotMatch(tourPopup, /<script>/);
  assert.match(tourPopup, /data-url="\/hub\/tours\//);
});

test('marker signatures are deterministic and separate geography from live content', () => {
  const a = { id: 'a', name: 'A', latitude: 1, longitude: 2, live_data: { tables_running: 1 } };
  const b = { id: 'b', name: 'B', latitude: 3, longitude: 4, live_data: { tables_running: 2 } };
  assert.equal(createPokerVenueContentSignature([a, b]), createPokerVenueContentSignature([b, a]));
  assert.equal(createPokerVenueGeographySignature([a, b]), createPokerVenueGeographySignature([b, a]));
  const changed = { ...a, live_data: { tables_running: 3 } };
  assert.notEqual(createPokerVenueContentSignature([a, b]), createPokerVenueContentSignature([changed, b]));
  assert.equal(createPokerVenueGeographySignature([a, b]), createPokerVenueGeographySignature([changed, b]));

  const structuredHours = { ...a, hours: { monday: { open: '10:00', close: '02:00' } } };
  const changedHours = { ...a, hours: { monday: { open: '11:00', close: '02:00' } } };
  assert.notEqual(
    createPokerVenueContentSignature([structuredHours]),
    createPokerVenueContentSignature([changedHours]),
    'nested operating-hour changes must invalidate rendered popup content',
  );

  const orderedLiveData = { ...a, live_data: { tables_running: 2, games: ['NLH'] } };
  const reorderedLiveData = { ...a, live_data: { games: ['NLH'], tables_running: 2 } };
  assert.equal(
    createPokerVenueContentSignature([orderedLiveData]),
    createPokerVenueContentSignature([reorderedLiveData]),
    'equivalent realtime payloads must not rebuild markers because key order changed',
  );

  const cyclic = { ...a };
  cyclic.hours = cyclic;
  assert.doesNotThrow(() => createPokerVenueContentSignature([cyclic]));
});

test('shared popup delegation rejects non-relative navigation', () => {
  const opened = [];
  const handler = createPokerPopupClickHandler({ onOpenDetails: (...args) => opened.push(args) });
  const eventFor = (url) => ({
    preventDefault() {},
    target: {
      closest(selector) {
        if (selector !== '.fsp-trigger') return null;
        return { getAttribute: (name) => (name === 'data-url' ? url : 'Venue') };
      },
    },
  });
  handler(eventFor('https://malicious.example'));
  assert.deepEqual(opened, []);
  handler(eventFor('/hub/venues/venue-1'));
  assert.deepEqual(opened, [['/hub/venues/venue-1', 'Venue']]);
});

test('shared map sessions own tiles, attribution, clustering, and idempotent teardown', () => {
  const { L, maps, layers, controls } = fakeLeaflet();
  const session = createPokerMapSession({ L, container: { id: 'map' }, mapOptions: { zoom: 6 } });
  assert.equal(maps.length, 1);
  assert.equal(layers.length, 1);
  assert.match(layers[0].url, /World_Dark_Gray_Base/);
  assert.doesNotMatch(layers[0].url, /cartocdn/);
  assert.equal(layers[0].options.maxNativeZoom, 16);
  assert.match(controls[0].value, /Esri/);
  assert.equal(controls.length, 1);
  assert.equal(createPokerMarkerLayer({ L, map: session.map, clusteringAvailable: true }).clustering, 'available');
  assert.equal(createPokerMarkerLayer({ L, map: session.map, clusteringAvailable: false }).clustering, 'fallback');
  session.destroy();
  session.destroy();
  assert.equal(session.map._animatingZoom, false);
  assert.equal(session.map.stopCalls, 1);
  assert.equal(session.map.offCalls, 1);
  assert.equal(session.map.removeCalls, 1);
});

test('labeled map sessions layer the public reference service above the dark canvas', () => {
  const { L, layers } = fakeLeaflet();
  const session = createPokerMapSession({ L, container: { id: 'map' }, tileStyle: 'dark_all' });
  assert.equal(layers.length, 2);
  assert.match(layers[0].url, /World_Dark_Gray_Base/);
  assert.match(layers[1].url, /World_Dark_Gray_Reference/);
  assert.equal(layers[1].options.pane, 'pnmReferencePane');
  assert.equal(session.map.getPane('pnmReferencePane').style.zIndex, '350');
  assert.equal(session.map.getPane('pnmReferencePane').style.pointerEvents, 'none');
  assert.equal(session.referenceTiles, layers[1]);
});

test('provider attribution remains visible when optional product branding is disabled', () => {
  const { L, controls } = fakeLeaflet();
  createPokerMapSession({ L, container: { id: 'map' }, attribution: false });
  assert.equal(controls.length, 1);
  assert.match(controls[0].value, /Esri/);
  assert.doesNotMatch(controls[0].value, /Smarter\.Poker/);
});

test('shared maps measure mandatory provider attribution and keep HUD controls in one layout lane', async () => {
  const [styles, venueMap, mapSurface] = await Promise.all([
    source('src/styles/worlds/poker-near-me-machined.css'),
    source('src/components/poker-near-me/VenueMap.jsx'),
    source('src/components/poker-near-me/MapSurfaceFrame.jsx'),
  ]);
  assert.match(mapSurface, /new ResizeObserverClass\(scheduleMeasurement\)/);
  assert.match(mapSurface, /new window\.MutationObserver\(scheduleMeasurement\)/);
  assert.match(mapSurface, /stageRect\.bottom - attributionRect\.top/);
  assert.match(mapSurface, /--pnm-map-attribution-clearance/);
  assert.match(mapSurface, /dataset\.mapAttributionClearance/);
  assert.match(
    styles,
    /\.pnm-map-surface \.pnm-map-coverage--overlay\s*\{[^}]*bottom:\s*calc\(8px \+ var\(--pnm-map-attribution-clearance, 58px\)\)/s
  );
  assert.match(
    styles,
    /\.pnm-map-overlay-stack\s*\{[^}]*bottom:\s*calc\(8px \+ var\(--pnm-map-attribution-clearance, 58px\)\);[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*gap:\s*8px/s
  );
  assert.doesNotMatch(styles, /--pnm-map-mobile-attribution-reserve/);
  assert.match(styles, /\.pnm-map-overlay-stack\[data-legend-expanded='true'\] \.pnm-map-coverage\s*\{[^}]*display:\s*none/s);
  assert.match(venueMap, /className="pnm-map-overlay-stack"/);
  assert.match(venueMap, /matchMedia\('\(max-width: 768px\), \(max-height: 500px\)'\)/);
  assert.match(venueMap, /data-legend-expanded=\{mapReady && !legendCollapsed && !hideLegend \? 'true' : 'false'\}/);
  assert.ok(
    venueMap.indexOf('className="venue-map-legend venue-map-legend--coverage"')
      < venueMap.indexOf('<MapCoverageReadout'),
    'legend and coverage remain ordered in the shared map stack'
  );
});

test('tour API advertises only map artwork that ships in the public build', async () => {
  const api = await source('pages/api/poker/tours.js');
  const artworkPaths = [...api.matchAll(/:\s*'(\/images\/tours\/[^']+)'/g)].map((match) => match[1]);
  assert.ok(artworkPaths.length > 0);
  await Promise.all(artworkPaths.map((path) => readFile(new URL(`public${path}`, root))));
});

test('all Poker Near Me map consumers use the shared lifecycle and presentation modules', async () => {
  const [runtime, presentation, primary, panel, planner] = await Promise.all([
    source('src/lib/poker-near-me/mapRuntime.js'),
    source('src/components/poker-near-me/mapPresentation.js'),
    source('src/components/poker-near-me/VenueMap.jsx'),
    source('src/components/poker-near-me/VenueMapPanel.jsx'),
    source('src/components/poker-near-me/RoadTripPlanner.jsx'),
  ]);
  assert.match(runtime, /createPokerMapSession/);
  assert.match(runtime, /createPokerMarkerLayer/);
  for (const venueSurface of [primary, panel]) {
    assert.match(venueSurface, /createPokerVenueIcon/);
    assert.match(venueSurface, /createPokerTourIcon/);
    assert.match(venueSurface, /buildPokerVenuePopupHtml/);
    assert.match(venueSurface, /createPokerPopupClickHandler/);
    assert.doesNotMatch(venueSurface, /function createVenueIcon/);
    assert.doesNotMatch(venueSurface, /function createClusterIcon/);
    assert.doesNotMatch(venueSurface, /function buildTourPopupHtml/);
  }
  for (const consumer of [primary, panel, planner]) {
    assert.match(consumer, /createPokerMapSession/);
    assert.match(consumer, /data-map-foundation="shared-v3"/);
    assert.doesNotMatch(consumer, /L\.map\(/);
    assert.doesNotMatch(consumer, /L\.tileLayer\(/);
  }
  assert.match(primary, /if \(!isVenueMapEligible\(venue\)\) return false;/);
  assert.match(primary, /userMarkerRef\.current = null;/);
  assert.match(primary, /radiusCircleRef\.current = null;/);
  assert.match(presentation, /sameOriginPopupNavigation:\s*true/);
});
