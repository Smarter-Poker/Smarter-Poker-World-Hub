import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildDailyTournamentSchema,
  buildLocationDirectorySchema,
  buildSeriesDirectorySchema,
  serializePokerJsonLd,
} from '../src/lib/poker-near-me/structuredData.js';
import { isPokerNearMePerformanceRoute } from '../src/lib/poker-near-me/activity.js';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('shared poker map runtime uses local executable modules and density-aware chunking', () => {
  const runtime = read('src/lib/poker-near-me/mapRuntime.js');
  assert.match(runtime, /await import\('leaflet'\)/);
  assert.match(runtime, /await import\('leaflet\.markercluster'\)/);
  assert.doesNotMatch(runtime, /createElement\('script'\)/);
  assert.match(runtime, /chunkedLoading: true/);
  assert.match(runtime, /maxClusterRadius: \(zoom\)/);
  assert.match(runtime, /removeOutsideVisibleBounds: true/);
  assert.match(runtime, /layer\.addLayers\(validMarkers\)/);
});

test('both shared map surfaces expose readiness telemetry and bulk marker insertion', () => {
  for (const file of [
    'src/components/poker-near-me/VenueMap.jsx',
    'src/components/poker-near-me/VenueMapPanel.jsx',
  ]) {
    const source = read(file);
    assert.match(source, /loadPokerMapRuntime/);
    assert.match(source, /createPokerClusterOptions/);
    assert.match(source, /addPokerMapLayers/);
    assert.match(source, /data-map-ready=/);
    assert.match(source, /data-map-marker-count=/);
    assert.match(source, /data-map-clustering=/);
    assert.match(source, /useId/);
  }
  const venueMap = read('src/components/poker-near-me/VenueMap.jsx');
  assert.doesNotMatch(venueMap, /unpkg\.com\/leaflet@1\.9\.4\/dist\/leaflet\.js/);
  assert.match(venueMap, /clusterTourStops = false/);
  assert.match(read('pages/hub/poker-series.js'), /clusterTourStops=\{true\}/);
  assert.doesNotMatch(read('pages/hub/poker-series.js'), /disableClustering=\{true\}/);
});

test('location hierarchy emits CollectionPage, breadcrumbs, and typed venue results', () => {
  const schema = buildLocationDirectorySchema({
    title: 'Poker Rooms in Austin, Texas',
    description: 'Verified poker rooms in Austin.',
    canonical: 'https://smarter.poker/hub/poker-near-me/in/texas/austin',
    stateCode: 'TX',
    stateName: 'Texas',
    city: 'Austin',
    resultCount: 1,
    fetchedAt: '2026-08-29T12:00:00.000Z',
    venues: [{ id: 7, name: 'Austin Card House', city: 'Austin', state: 'TX', address: '1 Main St' }],
  });
  const graph = schema['@graph'];
  assert.equal(graph[0]['@type'], 'CollectionPage');
  assert.equal(graph[1]['@type'], 'BreadcrumbList');
  assert.equal(graph[1].itemListElement[2].item, 'https://smarter.poker/hub/poker-near-me/in/texas');
  assert.equal(graph[2]['@type'], 'ItemList');
  assert.equal(graph[2].itemListElement[0].item['@type'], 'SportsActivityLocation');
  assert.equal(graph[2].itemListElement[0].item.address.addressLocality, 'Austin');
  assert.doesNotMatch(serializePokerJsonLd(schema), /</);

  const page = read('src/components/poker-near-me/PokerNearMeLocationPage.jsx');
  assert.match(page, /buildLocationDirectorySchema/);
  assert.match(page, /pnm-location-listing__section-head/);
  assert.match(page, /stateCanonical/);
});

test('series and daily directories publish canonical structured result lists', () => {
  const series = buildSeriesDirectorySchema([{ id: 42, series_name: 'Circuit Main Event' }], 301);
  assert.equal(series.url, 'https://smarter.poker/hub/poker-series');
  assert.equal(series.mainEntity.numberOfItems, 301);
  assert.equal(series.mainEntity.itemListElement[0].url, 'https://smarter.poker/hub/series/42');

  const daily = buildDailyTournamentSchema([{
    tournament_name: 'Friday Deep Stack',
    venue_id: 'home_game_group-id',
    is_home_game: true,
    home_group_slug: 'friday-poker',
    venue_name: 'Friday Poker Club',
    city: 'Austin',
    state: 'TX',
    buy_in: 80,
  }], '2026-08-29T12:00:00.000Z');
  const event = daily.mainEntity.itemListElement[0].item;
  assert.equal(event['@type'], 'SportsEvent');
  assert.equal(event.url, 'https://smarter.poker/hub/home-games/friday-poker');
  assert.equal(event.offers.price, 80);

  const seriesPage = read('pages/hub/poker-series.js');
  assert.match(seriesPage, /rel="canonical" href="https:\/\/smarter\.poker\/hub\/poker-series"/);
  assert.match(seriesPage, /buildSeriesDirectorySchema/);
  assert.match(read('pages/hub/daily-tournaments.js'), /buildDailyTournamentSchema/);
});

test('Core Web Vitals capture is limited to Poker Near Me route families', () => {
  assert.equal(isPokerNearMePerformanceRoute('/hub/poker-near-me/map'), true);
  assert.equal(isPokerNearMePerformanceRoute('/hub/venues/123'), true);
  assert.equal(isPokerNearMePerformanceRoute('/hub/series/5000042'), true);
  assert.equal(isPokerNearMePerformanceRoute('/hub/daily-tournaments'), true);
  assert.equal(isPokerNearMePerformanceRoute('/hub/training'), false);
  assert.equal(isPokerNearMePerformanceRoute('/hub/diamond-store'), false);

  const app = read('pages/_app.js');
  assert.match(app, /capturePokerNearMeVital/);
  assert.match(app, /isDiscoveryRoute/);
  const activity = read('src/lib/poker-near-me/activity.js');
  assert.match(activity, /metric_rating/);
  assert.match(activity, /needs-improvement/);
});
