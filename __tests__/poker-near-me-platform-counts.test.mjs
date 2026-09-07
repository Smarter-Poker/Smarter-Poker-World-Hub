import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  buildCurrentActivityCountContract,
  buildDirectoryCountContract,
  buildPlatformCountEnvelope,
} from '../src/lib/poker-near-me/platformCounts.js';

const NOW = Date.parse('2026-09-06T12:00:00.000Z');
const read = (file) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

test('directory counts distinguish active, public, mapped, and held records', () => {
  const directory = buildDirectoryCountContract({
    catalogActive: 603,
    rawPublicRows: 483,
    publicOutput: 480,
    integritySummary: { mapped: 402, missing: 70, held: 8, duplicate_count: 3 },
    source: 'supabase',
    revision: 'supabase:test',
  });

  assert.equal(directory.catalog_active, 603);
  assert.equal(directory.raw_public_rows, 483);
  assert.equal(directory.public_playable, 480);
  assert.equal(directory.mapped_public, 402);
  assert.equal(directory.held_from_map, 78);
  assert.equal(directory.missing_coordinates, 70);
  assert.equal(directory.coordinate_conflicts, 8);
});

test('current table count excludes stale and unqualified catalog rows', () => {
  const rows = [
    {
      bravo_slug: 'alpha', game_name: 'NLH', tables_running: 4, source: 'bravo',
      scrape_batch_id: 'observed-a', scrape_timestamp: '2026-09-06T11:55:00.000Z',
    },
    {
      bravo_slug: 'beta', game_name: 'PLO', tables_running: 3, source: 'bravo',
      scrape_batch_id: 'sim-beta', scrape_timestamp: '2026-09-06T11:50:00.000Z',
    },
    {
      bravo_slug: 'stale', game_name: 'NLH', tables_running: 99, source: 'bravo',
      scrape_batch_id: 'observed-old', scrape_timestamp: '2026-09-06T06:00:00.000Z',
    },
    {
      bravo_slug: 'catalog', game_name: 'NLH', tables_running: 88, source: 'pokeratlas',
      scrape_batch_id: 'pa-catalog', scrape_timestamp: '2026-09-06T11:58:00.000Z',
    },
    {
      bravo_slug: 'catalog-retained', game_name: 'PLO', tables_running: 77, source: 'pokeratlas',
      scrape_batch_id: 'pa-catalog-older', scrape_timestamp: '2026-09-06T06:00:00.000Z',
    },
    {
      bravo_slug: 'expired-catalog', game_name: 'CTA', tables_running: 66, source: 'pokeratlas',
      observation_kind: 'catalog', data_quality: 'expired',
      scrape_batch_id: 'pa-expired', scrape_timestamp: '2026-09-06T11:59:00.000Z',
    },
    {
      bravo_slug: 'quality-stale', game_name: 'NLH', tables_running: 55, source: 'bravo',
      observation_kind: 'observed', data_quality: 'stale',
      scrape_batch_id: 'observed-stale', scrape_timestamp: '2026-09-06T11:59:00.000Z',
    },
  ];

  const current = buildCurrentActivityCountContract(rows, { now: NOW });
  assert.equal(current.observed, 4);
  assert.equal(current.estimated, 3);
  assert.equal(current.published, 7);
  assert.equal(current.data_mode, 'mixed');
  assert.equal(current.rows_fresh, 3);
  assert.equal(current.rows_retained, 4);
  assert.equal(current.rows_qualified, 2);
  assert.equal(current.rows_catalog, 2);
  assert.equal(current.catalog_venues, 2);
  assert.equal(current.rows_scanned, 7);
});

test('platform envelope rejects any non-reconciling totals', () => {
  assert.throws(() => buildPlatformCountEnvelope({
    directory: {
      public_playable: 10,
      mapped_public: 8,
      held_from_map: 1,
    },
    currentTables: { observed: 1, estimated: 1, published: 2 },
  }), /directory counts do not reconcile/i);

  assert.throws(() => buildPlatformCountEnvelope({
    directory: {
      public_playable: 10,
      mapped_public: 8,
      held_from_map: 2,
    },
    currentTables: { observed: 1, estimated: 1, published: 3 },
  }), /table counts do not reconcile/i);
});

test('platform count endpoint fully pages both directory and current activity', () => {
  const source = read('pages/api/poker/platform-counts.js');
  assert.match(source, /MAX_CONTRACT_ROWS = 50000/);
  assert.match(source, /fetchAllRows\(\(\) => buildPublicQuery\(\)\.order\('id'/);
  assert.match(source, /if \(publicRowsResult\.truncated\) throw new Error/);
  assert.match(source, /if \(result\.truncated\) throw new Error/);
  assert.match(source, /PNM_CATALOG_RETENTION_MAX_AGE_MS/);
  assert.doesNotMatch(source, /\.range\(0, 999\)/);
});

test('platform count fallback uses the exact public directory snapshot', () => {
  const source = read('pages/api/poker/platform-counts.js');
  const snapshot = JSON.parse(read('data/poker-venue-directory-snapshot.json'));

  assert.match(source, /buildSnapshotVenueDirectory/);
  assert.match(source, /directorySnapshotData\?\.venues/);
  assert.doesNotMatch(source, /all-venues\.json/);
  assert.equal(snapshot.metadata.public_count, snapshot.venues.length);
});

test('live tables fails closed instead of publishing a nationally sampled result', () => {
  const source = read('pages/api/poker/live-tables.js');
  assert.match(source, /const MAX_PAGES = 50/);
  assert.match(source, /Live table directory exceeded the safe query window/);
  assert.match(source, /Live table activity exceeded the safe query window/);
  assert.match(source, /return res\.status\(503\)/);
});
