import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  PNM_TRUTH_CONTRACT_VERSION,
  activityRowBasis,
  activityRowWins,
  aggregateCurrentActivity,
  historicalCoverage,
  isCurrentActivityRow,
  isExpiredActivityRow,
  isModeledActivityRow,
  isQualifiedObservedActivityRow,
  latestActivityRowsByVenueAndBasis,
  sameTrendSnapshotContract,
} from '../src/lib/poker-near-me/dataTruth.js';

const row = (overrides = {}) => ({
  venue_name: 'Test Room',
  bravo_slug: 'test-room',
  game_name: '1/3 NLH',
  tables_running: 1,
  source: 'bravo',
  data_quality: 'scraped_verified',
  scrape_batch_id: 'bravo-1',
  scrape_timestamp: '2026-09-06T10:00:00.000Z',
  ...overrides,
});

test('simulator provenance is detected even when its legacy source says bravo', () => {
  assert.equal(isModeledActivityRow(row({ scrape_batch_id: 'sim-123' })), true);
  assert.equal(isModeledActivityRow(row({ source: 'smarter_model' })), true);
  assert.equal(isModeledActivityRow(row({ data_quality: 'modeled_estimate' })), true);
  assert.equal(isQualifiedObservedActivityRow(row()), true);
  assert.equal(isQualifiedObservedActivityRow(row({ source: 'pokeratlas' })), false);
});

test('explicit catalog rows never inherit observed authority from their source label', () => {
  const row = {
    source: 'bravo',
    observation_kind: 'catalog',
    data_quality: 'catalog_only',
    tables_running: 12,
  };
  assert.equal(activityRowBasis(row), 'catalog');
});

test('expired rows are audit-only and explicit stale quality is never current', () => {
  const expiredCatalog = row({
    source: 'pokeratlas',
    observation_kind: 'catalog',
    data_quality: 'expired',
  });
  const staleObserved = row({ data_quality: 'stale' });
  const freshness = {
    now: Date.parse('2026-09-06T12:00:00.000Z'),
    maxCurrentAgeMs: 3 * 60 * 60 * 1000,
  };

  assert.equal(isExpiredActivityRow(expiredCatalog), true);
  assert.equal(activityRowBasis(expiredCatalog), 'unqualified');
  assert.equal(isCurrentActivityRow(staleObserved, freshness), false);
});

test('newer modeled batches cannot suppress an observed venue snapshot', () => {
  const rows = [
    row({ scrape_batch_id: 'bravo-1', scrape_timestamp: '2026-09-06T09:00:00.000Z' }),
    row({ scrape_batch_id: 'sim-2', scrape_timestamp: '2026-09-06T10:00:00.000Z', tables_running: 4 }),
  ];
  const latest = latestActivityRowsByVenueAndBasis(rows);
  assert.equal(latest.length, 2);
  const aggregate = aggregateCurrentActivity(rows);
  assert.equal(aggregate.publishedTables, 1);
  assert.equal(aggregate.observedTables, 1);
  assert.equal(aggregate.estimatedTables, 0);
  assert.equal(aggregate.dataMode, 'live');
});

test('legacy batchless snapshots keep the newest row for every game', () => {
  const rows = [
    row({ game_name: '1/3 NLH', scrape_batch_id: null, scrape_timestamp: '2026-09-06T10:00:02.000Z' }),
    row({ game_name: '2/5 NLH', scrape_batch_id: null, scrape_timestamp: '2026-09-06T10:00:01.000Z', tables_running: 2 }),
    row({ game_name: '2/5 NLH', scrape_batch_id: null, scrape_timestamp: '2026-09-06T09:00:00.000Z', tables_running: 8 }),
  ];
  const latest = latestActivityRowsByVenueAndBasis(rows);
  assert.equal(latest.length, 2);
  const aggregate = aggregateCurrentActivity(rows);
  assert.deepEqual(aggregate.counts, { '1/3 NLH': 1, '2/5 NLH': 2 });
});

test('estimated games supplement but never replace observed games', () => {
  const rows = [
    row({ tables_running: 0 }),
    row({ game_name: '1/3 NLH', scrape_batch_id: 'sim-1', tables_running: 3 }),
    row({ game_name: '2/2 PLO', scrape_batch_id: 'sim-1', tables_running: 2 }),
  ];
  const aggregate = aggregateCurrentActivity(rows, (value) => value);
  assert.deepEqual(aggregate.counts, { '1/3 NLH': 0, '2/2 PLO': 2 });
  assert.equal(aggregate.observedTables, 0);
  assert.equal(aggregate.estimatedTables, 2);
  assert.equal(aggregate.dataMode, 'mixed');
  assert.equal(aggregate.liveCountKnown, true);
});

test('an older observation replaces a newer estimate for the same game', () => {
  const observed = row({ scrape_timestamp: '2026-09-06T09:00:00.000Z' });
  const estimate = row({
    scrape_batch_id: 'sim-2',
    scrape_timestamp: '2026-09-06T10:00:00.000Z',
    tables_running: 4,
  });
  assert.equal(activityRowWins(estimate, observed), true);
  assert.equal(activityRowWins(observed, estimate), false);
});

test('a stale observation cannot suppress a fresh saved-data estimate', () => {
  const now = Date.parse('2026-09-06T12:00:00.000Z');
  const staleObservation = row({ scrape_timestamp: '2026-09-06T08:00:00.000Z' });
  const freshEstimate = row({
    scrape_batch_id: 'sim-fresh',
    scrape_timestamp: '2026-09-06T11:30:00.000Z',
    tables_running: 4,
  });
  const freshness = { now, maxCurrentAgeMs: 3 * 60 * 60 * 1000 };

  assert.equal(activityRowWins(staleObservation, freshEstimate, freshness), true);
  assert.equal(activityRowWins(freshEstimate, staleObservation, freshness), false);
});

test('freshness is evaluated per game so one current game cannot revive another stale count', () => {
  const now = Date.parse('2026-09-06T12:00:00.000Z');
  const freshness = { now, maxCurrentAgeMs: 3 * 60 * 60 * 1000 };
  const staleObservedGame = row({
    game_name: '2/5 NLH',
    scrape_timestamp: '2026-09-06T08:00:00.000Z',
    tables_running: 6,
  });
  const freshModeledGame = row({
    game_name: '1/3 NLH',
    scrape_batch_id: 'sim-fresh',
    scrape_timestamp: '2026-09-06T11:30:00.000Z',
    tables_running: 2,
  });

  assert.equal(isCurrentActivityRow(staleObservedGame, freshness), false);
  assert.equal(isCurrentActivityRow(freshModeledGame, freshness), true);
  assert.equal(isCurrentActivityRow(row({
    scrape_timestamp: '2026-09-06T12:05:00.000Z',
  }), freshness), false);
});

test('fresh catalog identity remains visible when same-game count evidence is stale', () => {
  const now = Date.parse('2026-09-06T12:00:00.000Z');
  const staleObservation = row({ scrape_timestamp: '2026-09-06T08:00:00.000Z' });
  const catalog = row({
    source: 'pokeratlas',
    observation_kind: 'catalog',
    data_quality: 'catalog_verified',
    scrape_batch_id: 'pa-current',
    scrape_timestamp: '2026-09-06T11:45:00.000Z',
    tables_running: null,
  });
  const freshness = { now, maxCurrentAgeMs: 3 * 60 * 60 * 1000 };

  assert.equal(activityRowWins(staleObservation, catalog, freshness), true);
  assert.equal(activityRowWins(catalog, staleObservation, freshness), false);
});

test('zero, modeled, and unqualified history cannot create predictions', () => {
  const history = [
    row({ tables_running: undefined, tables: 0, snapshot_time: '2026-09-01T10:00:00Z' }),
    row({ tables_running: undefined, tables: 4, source: 'pokeratlas', snapshot_time: '2026-09-02T10:00:00Z' }),
    row({ tables_running: undefined, tables: 4, source: 'smarter_model', snapshot_time: '2026-09-03T10:00:00Z' }),
  ];
  assert.deepEqual(historicalCoverage(history), {
    qualifiedRows: [], dataPoints: 0, observedDays: 0, sufficientForPrediction: false,
  });
});

test('historical predictions require positive observations across seven days', () => {
  const history = Array.from({ length: 7 }, (_, day) => row({
    tables_running: undefined,
    tables: day + 1,
    snapshot_time: `2026-08-${String(day + 1).padStart(2, '0')}T22:00:00Z`,
  }));
  const coverage = historicalCoverage(history);
  assert.equal(coverage.dataPoints, 7);
  assert.equal(coverage.observedDays, 7);
  assert.equal(coverage.sufficientForPrediction, true);
});

test('trend snapshots compare only under the current truth contract', () => {
  assert.equal(sameTrendSnapshotContract({
    contract_version: PNM_TRUTH_CONTRACT_VERSION,
    counts: { NLH: 2 },
    basis_by_game: { NLH: 'observed' },
  }), true);
  assert.equal(sameTrendSnapshotContract({ counts: { NLH: 2 } }), false);
});

test('trend endpoint bounds future rows and never infers zero from prior-only games', async () => {
  const source = await readFile(new URL('../pages/api/poker/game-trends.js', import.meta.url), 'utf8');
  assert.match(source, /\.lte\('scrape_timestamp', responseNowIso\)/);
  assert.match(source, /basis === 'catalog' \|\| isCurrentActivityRow\(row/);
  assert.match(source, /maxCurrentAgeMs: MAX_AGE_MS/);
  assert.match(source, /previousAge <= MAX_SNAPSHOT_AGE_MS/);
  assert.match(source, /new Set\(Object\.keys\(current\.counts\)\)/);
  assert.doesNotMatch(source, /\.\.\.Object\.keys\(previousCounts\)/);
});

test('Bravo persistence is idempotent, provenance-stamped, and output-confirmed', async () => {
  const source = await readFile(new URL('../scripts/bravo-live-daemon.py', import.meta.url), 'utf8');
  assert.match(source, /stable_live_row_id\('bravo', batch_id/);
  assert.match(source, /'observation_kind': OBSERVATION_OBSERVED/);
  assert.match(source, /resolution=merge-duplicates,return=representation/);
  assert.match(source, /fully_persisted_venue_ids\(/);
  assert.match(source, /classify_persisted_run\(/);
  assert.match(source, /if not data\.get\('authenticated_markup'\) or not data\.get\('live_section_found'\)/);
  assert.match(source, /all_authenticated_venue_live_tables_confirmed_empty/);
});

test('PokerAtlas rejects CTA identities and non-US discovery spillover', async () => {
  const [daemon, discovery, migration] = await Promise.all([
    readFile(new URL('../scripts/pokeratlas-live-daemon.py', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/discover_pokeratlas_slugs.py', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260906220000_pnm_scraper_data_truth.sql', import.meta.url), 'utf8'),
  ]);
  assert.match(daemon, /is_noise_venue_label\(name\)/);
  assert.match(daemon, /_map_region_slug\(raw\) in NON_US_POKERATLAS_REGION_SLUGS/);
  assert.match(daemon, /slug in NON_US_POKERATLAS_VENUE_SLUGS/);
  assert.match(daemon, /fallback_venue_slug=slug/);
  assert.match(daemon, /stable_live_row_id\('pokeratlas', batch_id/);
  assert.match(daemon, /returned_ids == expected_ids/);
  assert.match(daemon, /SWEEP_STATE_CONTRACT_VERSION = 2/);
  assert.match(daemon, /sweep_batch_id/);
  assert.match(daemon, /map_fingerprint/);
  assert.match(daemon, /scrape_batch_id\.is\.null/);
  assert.match(discovery, /slug\.isdigit\(\)/);
  assert.match(discovery, /NON_US_POKERATLAS_REGION_SLUGS/);
  assert.match(migration, /a PokerAtlas navigation artifact remains publishable/);

  const legacyQualityPreflight = migration.indexOf('unexpected data_quality checks');
  const legacyQualityDrop = migration.indexOf(
    'drop constraint if exists venue_live_tables_data_quality_check'
  );
  const modeledQualityBackfill = migration.indexOf("set data_quality = 'simulated'");
  assert.ok(legacyQualityPreflight > 0, 'legacy quality constraints must be inventoried');
  assert.ok(legacyQualityDrop > 0, 'legacy quality constraints must be located');
  assert.ok(
    legacyQualityPreflight < legacyQualityDrop,
    'unexpected quality constraints must abort before named constraints are removed'
  );
  assert.ok(
    legacyQualityDrop < modeledQualityBackfill,
    'legacy quality constraints must be removed before honest modeled/catalog backfills'
  );
});

test('Bravo cleanup is verified and cannot delete modeled simulator rows', async () => {
  const source = await readFile(new URL('../scripts/bravo-live-daemon.py', import.meta.url), 'utf8');
  assert.match(source, /observation_kind=eq\.observed/);
  assert.match(source, /sb_has_rows\('venue_live_tables', stale_query\) is False/);
  assert.match(source, /fcntl\.LOCK_EX \| fcntl\.LOCK_NB/);
});

test('scraper metric truth constraint rejects dishonest success and inconsistent counts', async () => {
  const migration = await readFile(
    new URL('../supabase/migrations/20260906220000_pnm_scraper_data_truth.sql', import.meta.url),
    'utf8'
  );
  const constraint = migration.match(
    /add constraint scraper_metrics_record_counts_check([\s\S]*?)\) not valid;/
  );

  assert.ok(constraint, 'expected scraper metric count constraint');
  assert.match(constraint[1], /records_attempted = records_saved \+ records_rejected/);
  assert.match(
    constraint[1],
    /run_status = 'success'[\s\S]*records_saved = records_attempted[\s\S]*records_rejected = 0[\s\S]*errors = 0/
  );
  assert.match(
    constraint[1],
    /run_status = 'partial'[\s\S]*records_saved > 0[\s\S]*records_rejected > 0 or errors > 0/
  );
  assert.match(
    constraint[1],
    /run_status = 'failed'[\s\S]*records_saved = 0[\s\S]*errors > 0/
  );
  assert.match(constraint[1], /nullif\(btrim\(status_reason\), ''\) is not null/);
});
