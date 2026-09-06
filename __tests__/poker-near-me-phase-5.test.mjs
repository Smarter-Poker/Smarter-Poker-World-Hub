import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('series ISR payload is ranked, compact, and capped below the Next page-data threshold', () => {
  const source = read('pages/hub/poker-series.js');
  assert.match(source, /SSR_SERIES_PREVIEW_LIMIT = 160/);
  assert.match(source, /buildSeriesPreview/);
  assert.match(source, /\.slice\(0, SSR_SERIES_PREVIEW_LIMIT\)/);
  assert.match(source, /initialSeriesMeta/);
  assert.match(source, /previewCount/);
  assert.match(source, /totalCount/);
  assert.match(source, /SSR_POKER_SERIES_ID_OFFSET/);
  assert.doesNotMatch(source, /supabase\.from\('poker_series'\)\.select\('\*'\)/);
});

test('series client sync rejects invalid responses and exposes cached recovery', () => {
  const source = read('pages/hub/poker-series.js');
  assert.match(source, /if \(!response\.ok \|\| payload\?\.success === false\)/);
  assert.match(source, /data-source-state=\{syncState\}/);
  assert.match(source, /role="status"/);
  assert.match(source, /<time dateTime=\{lastSuccessfulSync\}>/);
  assert.match(source, /onClick=\{\(\) => refreshSeries\(\)\}/);
  assert.match(source, /refreshSeriesRef\.current\(\)/);
});

test('daily schedules use complete paged queries, state-first filtering, and truthful provenance', () => {
  const api = read('pages/api/poker/daily-tournaments.js');
  assert.match(api, /from\('poker_venues'\)/);
  assert.match(api, /query\.in\('venue_id', stateVenueIds\)/);
  assert.match(api, /fetchAllDailyTournamentRows\(buildTournamentQuery\)/);
  assert.match(api, /order\('id', \{ ascending: true \}\)/);
  assert.match(api, /rowsScanned: dbTournaments\.length/);
  assert.doesNotMatch(api, /fetchCeiling/);
  assert.match(api, /schedule_query_timeout/);
  assert.match(api, /degraded: sourceWarnings\.length > 0/);
  assert.match(api, /generatedAt: new Date\(\)\.toISOString\(\)/);

  const page = read('pages/hub/daily-tournaments.js');
  assert.match(page, /data-source-state=\{scheduleState\}/);
  assert.match(page, /Partial live coverage/);
  assert.match(page, /if \(!r\.ok\) throw new Error/);
  assert.match(page, /homeGameUrl\(t\)/);
});

test('unified calendar exhausts every source deterministically and fails closed', () => {
  const api = read('pages/api/poker/events-calendar.js');
  assert.match(api, /fetchAllRows\(buildVenueQuery/);
  assert.match(api, /fetchAllRows\(buildDailyQuery/);
  assert.match(api, /fetchAllRows\(buildSeriesQuery/);
  assert.match(api, /fetchAllRows\(buildTourQuery/);
  assert.match(api, /fetchAllRows\(buildHomeGameQuery/);
  assert.match(api, /CALENDAR_SOURCE_MAX_ROWS = 50000/);
  assert.match(api, /\.order\('id', \{ ascending: true \}\)/);
  assert.match(api, /date must be a valid YYYY-MM-DD date/);
  assert.match(api, /calMonth must be a valid YYYY-MM month/);
  assert.doesNotMatch(api, /for \(let page = 0; page < 10/);
});

test('series and tournament media use a resilient shared identity mark', () => {
  const component = read('src/components/poker-near-me/PokerIdentityMark.jsx');
  assert.match(component, /data-media-state=\{showImage \? 'image' : 'fallback'\}/);
  assert.match(component, /onError=\{\(\) => setImageFailed\(true\)\}/);
  assert.match(component, /pnm-identity-mark__halo/);
  for (const file of [
    'pages/hub/poker-series.js',
    'pages/hub/daily-tournaments.js',
    'pages/hub/series/[id].js',
  ]) {
    assert.match(read(file), /PokerIdentityMark/);
  }
});

test('series API reports source and freshness metadata without changing data shape', () => {
  const source = read('pages/api/poker/series.js');
  assert.match(source, /Array\.isArray\(seriesJson\) \? seriesJson/);
  assert.match(source, /Object\.values\(seriesSourceRegistry \|\| \{\}\)/);
  assert.match(source, /primaryBundledSeries\.length > 0 \? primaryBundledSeries : registryBundledSeries/);
  assert.doesNotMatch(source, /mapSeriesToApi\(seriesJson\.series_2026 \|\| \[\]\)/);
  assert.match(source, /lastUpdated: sourceLastUpdated/);
  assert.match(source, /source: seriesSource/);
  assert.match(source, /warnings: sourceWarnings/);
  assert.match(source, /data: limited/);
  assert.match(source, /total,/);
});
