import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildPokerTourPopupHtml,
  buildPokerVenuePopupHtml,
  createPokerClusterIcon,
  createPokerTourIcon,
  createPokerUserLocationIcon,
  createPokerVenueIcon,
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
