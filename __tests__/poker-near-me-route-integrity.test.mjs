import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  POKER_SERIES_ROUTE_ID_OFFSET,
  fromPokerSeriesRouteId,
  isPokerSeriesRouteId,
  isServableSeriesParentEvidence,
  reconcileTournamentSeriesEvidence,
  toPokerSeriesRouteId,
} from '../src/lib/poker-near-me/seriesRouteIdentity.mjs';
import {
  fetchAllHomeGameDirectoryRows,
  fetchHomeGameGroupsInChunks,
  homeGameDirectoryUnavailable,
} from '../src/lib/home-games/geoDirectoryServer.mjs';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('poker_series route identity is stable, namespaced, and reversible', () => {
  assert.equal(POKER_SERIES_ROUTE_ID_OFFSET, 5_000_000);
  assert.equal(toPokerSeriesRouteId(759), 5_000_759);
  assert.equal(fromPokerSeriesRouteId(5_000_759), 759);
  assert.equal(isPokerSeriesRouteId(5_000_759), true);
  assert.equal(isPokerSeriesRouteId(759), false);
  assert.equal(fromPokerSeriesRouteId(POKER_SERIES_ROUTE_ID_OFFSET), null);
  assert.equal(toPokerSeriesRouteId(0), null);
  assert.equal(toPokerSeriesRouteId('not-an-id'), null);
});

test('duplicate series metadata reconciles only newer exact-source evidence', () => {
  const primary = {
    id: 470,
    source_table: 'tournament_series',
    series_uid: 'pa_exact-series-2026',
    name: 'Exact Series',
    venue_name: 'Exact Casino',
    start_date: '2026-03-06',
    end_date: '2026-04-07',
    main_event_buyin: 3500,
    source_url: 'https://www.pokeratlas.com/poker-tournament-series/exact-series-2026',
    scrape_html_hash: 'a'.repeat(64),
    scrape_timestamp: '2026-03-29T03:32:37Z',
  };
  const newer = {
    id: 692,
    series_uid: primary.series_uid,
    series_name: 'Exact Series',
    venue_name: 'Exact Casino',
    start_date: '2026-03-06',
    end_date: '2026-04-16',
    main_event_buyin: 3500,
    source_url: primary.source_url,
    scrape_url: primary.source_url,
    scrape_html_hash: 'b'.repeat(64),
    scrape_timestamp: '2026-08-25T11:26:29Z',
    scrape_batch_id: 'batch-2',
    scrape_confidence: 'high',
  };

  const reconciled = reconcileTournamentSeriesEvidence(primary, newer);
  assert.equal(reconciled.id, 470);
  assert.equal(reconciled.source_table, 'tournament_series');
  assert.equal(reconciled.end_date, '2026-04-16');
  assert.equal(reconciled.metadata_source_table, 'poker_series');
  assert.equal(reconciled.metadata_source_id, 692);

  assert.equal(
    reconcileTournamentSeriesEvidence(primary, {
      ...newer,
      source_url: 'https://example.com/a-different-series',
    }),
    primary,
  );
  assert.equal(
    reconcileTournamentSeriesEvidence(primary, {
      ...newer,
      scrape_html_hash: '0'.repeat(64),
    }),
    primary,
  );
  assert.equal(
    reconcileTournamentSeriesEvidence(primary, {
      ...newer,
      scrape_timestamp: '2026-03-01T00:00:00Z',
    }),
    primary,
  );
});

test('series reconciliation never erases fields with an incomplete candidate', () => {
  const sourceUrl = 'https://www.pokeratlas.com/poker-tournament-series/exact-series-2026';
  const primary = {
    id: 1,
    series_uid: 'exact',
    venue_name: 'Verified Venue',
    start_date: '2026-04-01',
    end_date: '2026-04-10',
    source_url: sourceUrl,
    scrape_html_hash: 'a'.repeat(64),
    scrape_timestamp: '2026-04-01T00:00:00Z',
  };
  const reconciled = reconcileTournamentSeriesEvidence(primary, {
    id: 2,
    series_uid: 'exact',
    venue_name: '',
    start_date: null,
    end_date: null,
    source_url: sourceUrl,
    scrape_html_hash: 'b'.repeat(64),
    scrape_timestamp: '2026-04-02T00:00:00Z',
  });
  assert.equal(reconciled.venue_name, 'Verified Venue');
  assert.equal(reconciled.start_date, '2026-04-01');
  assert.equal(reconciled.end_date, '2026-04-10');
});

test('public series parents require source-bound evidence, not a quality label alone', () => {
  const row = {
    data_quality: 'scraped_verified',
    is_suppressed: false,
    source_url: 'https://www.pokeratlas.com/poker-tournament-series/exact',
    scrape_html_hash: 'a'.repeat(64),
    scrape_timestamp: '2026-04-01T00:00:00Z',
    scrape_batch_id: 'batch-1',
  };
  const now = Date.parse('2026-04-02T00:00:00Z');
  assert.equal(isServableSeriesParentEvidence(row, now), true);
  assert.equal(isServableSeriesParentEvidence({ ...row, scrape_html_hash: '0'.repeat(64) }, now), false);
  assert.equal(isServableSeriesParentEvidence({ ...row, source_url: '' }, now), false);
  assert.equal(isServableSeriesParentEvidence({
    ...row,
    source_url: '',
    scrape_url: 'https://www.pokeratlas.com/poker-tournament-series/fallback',
  }, now), true);
  assert.equal(isServableSeriesParentEvidence({
    ...row,
    source_url: '   ',
    scrape_url: 'https://www.pokeratlas.com/poker-tournament-series/fallback',
  }, now), false);
  for (const source_url of ['http://:', 'http://%', 'http://[x]']) {
    assert.equal(isServableSeriesParentEvidence({ ...row, source_url }, now), false);
  }
  assert.equal(isServableSeriesParentEvidence({ ...row, scrape_batch_id: null }, now), false);
  assert.equal(isServableSeriesParentEvidence({ ...row, is_suppressed: true }, now), false);
  assert.equal(isServableSeriesParentEvidence({
    ...row,
    data_quality: 'manual_research',
    scrape_html_hash: 'phase7b-manual-research',
    scrape_batch_id: null,
  }, now), true);
});

test('every poker_series route producer uses the shared identity helper', () => {
  const seriesApi = read('pages/api/poker/series.js');
  const calendarApi = read('pages/api/poker/events-calendar.js');
  const sitemap = read('pages/sitemap.xml.js');
  const seriesPage = read('pages/hub/poker-series.js');

  assert.match(seriesApi, /fromPokerSeriesRouteId\(numericId\)/);
  assert.match(seriesApi, /id: toPokerSeriesRouteId\(ps\.id\)/);
  assert.match(seriesApi, /reconcileTournamentSeriesEvidence\(existing, ps\)/);
  assert.match(seriesApi, /reconcileTournamentSeriesEvidence\(singleSeries, psTwin\)/);
  assert.match(seriesApi, /filter\(\s*row => isServableSeriesParentEvidence\(row\)/);
  assert.match(seriesApi, /if \(reconciled !== existing\)/);
  assert.match(seriesApi, /s\.total_events = rows\.length/);
  assert.match(seriesApi, /\.map\(decodeSeriesPayload\)/);
  assert.match(seriesApi, /const events = singleSeries\.source_table \? null : loadEventsForSeries\(singleSeries\)/);
  assert.match(seriesApi, /seriesData = merged/);
  assert.doesNotMatch(seriesApi, /if \(seriesSource === 'static_bundle'\)/);
  assert.match(calendarApi, /series_id: toPokerSeriesRouteId\(s\.id\)/);
  assert.match(calendarApi, /source_event_id: s\.id/);
  assert.match(sitemap, /addSeries\(toPokerSeriesRouteId\(row\.id\)\)/);
  assert.match(sitemap, /select: SITEMAP_SERIES_EVIDENCE_COLUMNS/);
  assert.match(sitemap, /\.filter\(row => isServableSeriesParentEvidence\(row\)\)/);
  assert.match(seriesPage, /id: toPokerSeriesRouteId\(ps\.id\)/);
  assert.match(seriesPage, /filter\(\s*row => isServableSeriesParentEvidence\(row\)/);
  assert.match(seriesPage, /reconcileTournamentSeriesEvidence\(existing, rawPs\)/);
  assert.match(seriesPage, /if \(reconciled !== existing\)/);

  const previewSource = seriesPage.slice(
    seriesPage.indexOf('function buildSeriesPreview'),
    seriesPage.indexOf('export async function getStaticProps'),
  );
  assert.doesNotMatch(previewSource, /events_count|event_count|total_events/);

  for (const source of [seriesApi, sitemap, seriesPage]) {
    assert.doesNotMatch(source, /(?:SSR_)?POKER_SERIES_ID_OFFSET\s*=/);
    assert.doesNotMatch(source, /filter\(isServableSeriesParentEvidence\)/);
  }
});

test('series results, Home Games calendar privacy, and empty source reads fail closed', () => {
  const resultsApi = read('pages/api/poker/results.js');
  const calendarApi = read('pages/api/poker/events-calendar.js');
  const seriesApi = read('pages/api/poker/series.js');
  const tourApi = read('pages/api/poker/tour-schedule.js');

  assert.match(resultsApi, /fromPokerSeriesRouteId\(seriesIdNum\) \|\| seriesIdNum/);
  assert.match(resultsApi, /\.eq\('series_id', databaseSeriesId\)/);

  assert.match(calendarApi, /publicDistanceToGroup\(/);
  assert.match(calendarApi, /\.in\('status', \['scheduled', 'confirmed'\]\)/);
  const homeCalendarPath = calendarApi.slice(
    calendarApi.indexOf('SOURCE 4: Home Games'),
    calendarApi.indexOf('let allEvents ='),
  );
  assert.doesNotMatch(homeCalendarPath, /neighborhood:\s*hg\.neighborhood/);
  assert.doesNotMatch(homeCalendarPath, /distanceMi = Math\.round\(haversineMi/);

  assert.match(seriesApi, /A complete zero-row read is authoritative/);
  assert.match(seriesApi, /Series catalog is temporarily unavailable/);
  assert.doesNotMatch(seriesApi, /source:\s*'static_bundle',[\s\S]{0,180}warnings:\s*\['database_query_failed'\]/);
  assert.match(tourApi, /events = \[\];/);
  assert.match(tourApi, /Tour schedule is temporarily unavailable/);
  assert.doesNotMatch(tourApi, /return returnRegistryFallback/);
});

test('directory pagination discards partial rows when a later page fails', async () => {
  const calls = [];
  const failure = new Error('second page unavailable');
  const result = await fetchAllHomeGameDirectoryRows(async (from, to) => {
    calls.push([from, to]);
    if (from === 0) return { data: [{ id: 1 }, { id: 2 }], error: null };
    return { data: null, error: failure };
  }, { pageSize: 2, maxRows: 10 });

  assert.deepEqual(calls, [[0, 1], [2, 3]]);
  assert.equal(result.complete, false);
  assert.equal(result.error, failure);
  assert.deepEqual(result.rows, []);
});

test('directory pagination verifies the row ceiling with a sentinel read', async () => {
  const calls = [];
  const records = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
  const result = await fetchAllHomeGameDirectoryRows(async (from, to) => {
    calls.push([from, to]);
    return { data: records.slice(from, to + 1), error: null };
  }, { pageSize: 2, maxRows: 4 });

  assert.deepEqual(calls, [[0, 1], [2, 3], [4, 4]]);
  assert.equal(result.complete, true);
  assert.equal(result.error, null);
  assert.deepEqual(result.rows, records);
});

test('directory enrichment discards partial groups when a later chunk fails', async () => {
  const failure = new Error('second group chunk unavailable');
  const result = await fetchHomeGameGroupsInChunks(
    ['a', 'b', 'c'],
    async (ids) => ids.includes('c')
      ? { data: null, error: failure }
      : { data: ids.map(id => ({ id })), error: null },
    { chunkSize: 2 },
  );

  assert.equal(result.complete, false);
  assert.equal(result.error, failure);
  assert.deepEqual(result.rows, []);
});

test('directory outage responses are explicit 503 recovery pages', () => {
  const headers = new Map();
  const res = {
    statusCode: 200,
    setHeader(name, value) { headers.set(name, value); },
  };
  const result = homeGameDirectoryUnavailable(res, { games: [] });

  assert.equal(res.statusCode, 503);
  assert.equal(headers.get('Retry-After'), '60');
  assert.equal(headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(result, { props: { games: [], directoryUnavailable: true } });
});

test('all Home Games geo loaders fail closed and render recovery copy', () => {
  const routes = [
    'pages/hub/home-games/in/index.js',
    'pages/hub/home-games/in/[state]/index.js',
    'pages/hub/home-games/in/[state]/[city].js',
  ];

  for (const route of routes) {
    const source = read(route);
    assert.match(source, /fetchAllHomeGameDirectoryRows/);
    assert.match(source, /fetchHomeGameGroupsInChunks/);
    assert.match(source, /homeGameDirectoryUnavailable\(res, unavailableProps\)/);
    assert.match(source, /\.order\('id', \{ ascending: true \}\)/);
    assert.match(source, /\.range\(from, to\)/);
    assert.match(source, /directoryUnavailable/);
    assert.match(source, /Directory Data Could Not Be Verified/);
  }

  const city = read('pages/hub/home-games/in/[state]/[city].js');
  assert.ok(
    city.indexOf('if (groupResult.error || !groupResult.complete)')
      < city.indexOf('if (games.length === 0) return { notFound: true }'),
    'city route must handle enrichment failure before deciding a genuine 404',
  );
});
