import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PNM_TRUTH_CONTRACT_VERSION,
  activityRowBasis,
  activityRowWins,
  aggregateCurrentActivity,
  historicalCoverage,
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
  assert.equal(activityRowBasis(row), 'unqualified');
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
  assert.equal(aggregate.dataMode, 'estimated');
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
