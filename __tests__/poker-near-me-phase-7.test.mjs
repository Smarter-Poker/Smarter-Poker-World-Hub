import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { appendPokerMapBounds, isVenueWithinPokerMapBounds, parsePokerMapBounds } from '../src/lib/poker-near-me/mapBounds.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Leaflet styles, controls, images, and licenses are served locally', async () => {
  const runtime = await read('src/lib/poker-near-me/mapRuntime.js');
  assert.doesNotMatch(runtime, /unpkg\.com|cdn\.jsdelivr\.net/);
  assert.match(runtime, /styleSource: 'local-public'/);
  for (const asset of [
    'public/vendor/leaflet/leaflet.css',
    'public/vendor/leaflet/MarkerCluster.css',
    'public/vendor/leaflet/MarkerCluster.Default.css',
    'public/vendor/leaflet/images/marker-icon.png',
    'public/vendor/leaflet/images/marker-shadow.png',
    'public/vendor/leaflet/LEAFLET-LICENSE.txt',
    'public/vendor/leaflet/MARKERCLUSTER-LICENSE.txt',
  ]) {
    assert.ok((await stat(new URL(`../${asset}`, import.meta.url))).size > 0, `${asset} should be non-empty`);
  }
});

test('map bounds reject malformed queries and support ordinary and date-line viewports', () => {
  assert.equal(parsePokerMapBounds({ north: '40' }).error, 'north, south, east, and west must be provided together');
  assert.equal(parsePokerMapBounds({ north: ['40'], south: '30', east: '-90', west: '-110' }).error, 'Map bounds must be scalar values');
  assert.match(parsePokerMapBounds({ north: '30', south: '40', east: '-90', west: '-110' }).error, /north must be greater/);

  const ordinary = parsePokerMapBounds({ north: '40', south: '30', east: '-90', west: '-110' }).bounds;
  assert.equal(isVenueWithinPokerMapBounds({ latitude: 36.1, longitude: -100 }, ordinary), true);
  assert.equal(isVenueWithinPokerMapBounds({ latitude: 41, longitude: -100 }, ordinary), false);
  assert.equal(isVenueWithinPokerMapBounds({ latitude: null, longitude: -100 }, ordinary), false);

  const dateline = parsePokerMapBounds({ north: '50', south: '10', east: '-170', west: '170' }).bounds;
  assert.equal(isVenueWithinPokerMapBounds({ latitude: 20, longitude: 175 }, dateline), true);
  assert.equal(isVenueWithinPokerMapBounds({ latitude: 20, longitude: -175 }, dateline), true);
  assert.equal(isVenueWithinPokerMapBounds({ latitude: 20, longitude: 0 }, dateline), false);

  const params = appendPokerMapBounds(new URLSearchParams(), ordinary);
  assert.deepEqual([...params.keys()], ['north', 'south', 'east', 'west']);
});

test('public venue API applies viewport filtering before expensive detail enrichment', async () => {
  const api = await read('pages/api/poker/venues.js');
  const filterIndex = api.indexOf('if (viewportBounds)', api.indexOf('let venues = []'));
  const paginationIndex = api.indexOf("q = q.order('trust_score', { ascending: false, nullsFirst: false }).range(offset, offset + maxResults - 1)");
  const enrichmentIndex = api.indexOf('// --- Single venue by ID');
  assert.ok(filterIndex > 0 && filterIndex < paginationIndex && paginationIndex < enrichmentIndex);
  assert.match(api, /q\.gte\('latitude', viewportBounds\.south\)/);
  assert.match(api, /isVenueWithinPokerMapBounds\(venue, viewportBounds\)/);
  assert.match(api, /viewport: viewportBounds/);
  assert.match(api, /viewport: requestViewportBounds/);
});

test('shared maps expose live coverage telemetry and the lobby wires area search', async () => {
  const [map, panel, coverage, lobby, styles] = await Promise.all([
    read('src/components/poker-near-me/VenueMap.jsx'),
    read('src/components/poker-near-me/VenueMapPanel.jsx'),
    read('src/components/poker-near-me/MapCoverageReadout.jsx'),
    read('pages/hub/poker-near-me/lobby.js'),
    read('src/styles/worlds/poker-near-me.css'),
  ]);
  for (const source of [map, panel]) {
    assert.match(source, /data-map-visible-count/);
    assert.match(source, /data-map-style-source="local"/);
    assert.match(source, /map_runtime_ready/);
    assert.match(source, /<MapCoverageReadout/);
  }
  assert.match(coverage, /Search this area/);
  assert.match(coverage, /min-height|data-map-area-scoped/);
  assert.match(panel, /map_area_searched/);
  assert.match(panel, /appendPokerMapBounds/);
  assert.match(lobby, /enableViewportSearch/);
  assert.match(lobby, /viewportState=/);
  assert.match(styles, /\.tours-map-container[^}]+flex-shrink:\s*0/s);
});

test('map performance payload remains bounded and privacy-safe', async () => {
  const activity = await read('src/lib/poker-near-me/activity.js');
  assert.match(activity, /duration_ms:/);
  assert.match(activity, /marker_count:/);
  assert.match(activity, /visible_count:/);
  assert.match(activity, /zoom_level:/);
  assert.match(activity, /runtime_source:/);
  assert.doesNotMatch(activity, /\blatitude\b|\blongitude\b/);
});
