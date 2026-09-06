import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  activityRowBasis,
  activityRowWins,
  aggregateCurrentActivity,
  latestActivityRowsByVenueAndBasis,
} from '../src/lib/poker-near-me/dataTruth.js';
import {
  buildLiveCashGameEntry,
  cashGameCountLabel,
  expireCachedLiveCashGameEntry,
} from '../src/lib/poker-near-me/liveCashGameData.js';
import {
  buildScraperMetricBucket,
  classifyScraperMetricOutcome,
  normalizeScraperRunStatus,
} from '../src/lib/poker-near-me/scraperMetrics.js';
import {
  authorizePokerOpsRead,
  requestHasPokerOpsSecret,
  sanitizePublicScraperHealth,
} from '../src/lib/poker-near-me/opsReadAuth.js';

const catalogRow = (overrides = {}) => ({
  bravo_slug: 'pa-test-room',
  venue_name: 'Test Room',
  game_name: '1/3 NLH',
  tables_running: 12,
  players_waiting: 8,
  source: 'pokeratlas',
  observation_kind: 'catalog',
  data_quality: 'catalog_verified',
  scrape_batch_id: 'pa-catalog-1',
  scrape_timestamp: '2026-09-06T10:00:00.000Z',
  ...overrides,
});

test('PokerAtlas rows remain catalog evidence and cannot publish a table count', () => {
  const legacy = catalogRow({ observation_kind: null, data_quality: 'scraped_verified' });
  assert.equal(activityRowBasis(catalogRow()), 'catalog');
  assert.equal(activityRowBasis(legacy), 'catalog');

  const selected = latestActivityRowsByVenueAndBasis([catalogRow()]);
  assert.equal(selected.length, 1);
  assert.equal(activityRowBasis(selected[0]), 'catalog');

  const aggregate = aggregateCurrentActivity([catalogRow()]);
  assert.deepEqual(aggregate.counts, {});
  assert.equal(aggregate.observedTables, 0);
  assert.equal(aggregate.estimatedTables, 0);
  assert.equal(aggregate.publishedTables, 0);
  assert.equal(aggregate.catalogRows, 1);
  assert.equal(aggregate.catalogGameCount, 1);
  assert.equal(aggregate.catalogVenueCount, 1);
  assert.equal(aggregate.liveCountKnown, false);
  assert.equal(aggregate.dataMode, 'catalog');
});

test('observed and modeled evidence outrank catalog without converting it to either', () => {
  const modeled = catalogRow({
    source: 'bravo',
    observation_kind: 'modeled',
    data_quality: 'simulated',
    scrape_batch_id: 'sim-2',
    tables_running: 3,
  });
  const observed = catalogRow({
    source: 'bravo',
    observation_kind: 'observed',
    data_quality: 'scraped_verified',
    scrape_batch_id: 'bravo-1',
    tables_running: 2,
  });

  assert.equal(activityRowWins(catalogRow(), modeled), true);
  assert.equal(activityRowWins(modeled, catalogRow()), false);
  assert.equal(activityRowWins(modeled, observed), true);

  const aggregate = aggregateCurrentActivity([
    catalogRow(),
    modeled,
    observed,
    catalogRow({ bravo_slug: 'pa-other', venue_name: 'Other Room', game_name: '2/5 PLO' }),
  ]);
  assert.deepEqual(aggregate.counts, { '1/3 NLH': 2 });
  assert.equal(aggregate.observedTables, 2);
  assert.equal(aggregate.estimatedTables, 0);
  assert.equal(aggregate.catalogGameCount, 2);
});

test('a zero-table observation remains a known live observation, not catalog or none', () => {
  const aggregate = aggregateCurrentActivity([
    catalogRow(),
    catalogRow({
      source: 'bravo',
      observation_kind: 'observed',
      data_quality: 'scraped_verified',
      scrape_batch_id: 'bravo-zero',
      tables_running: 0,
      players_waiting: 0,
    }),
  ]);

  assert.equal(aggregate.observedTables, 0);
  assert.equal(aggregate.liveCountKnown, true);
  assert.equal(aggregate.dataMode, 'live');
  assert.equal(aggregate.catalogGameCount, 1);
});

test('shared cash-game adapter preserves an unknown catalog count', () => {
  const entry = buildLiveCashGameEntry({
    bravo_slug: 'pa-test-room',
    venue_name: 'Test Room',
    data_mode: 'catalog',
    live_count_known: false,
    tables_running_total: null,
    games: [{
      game: '1/3 NLH',
      source: 'pokeratlas',
      observation_kind: 'catalog',
      tables_running: null,
      players_waiting: null,
      live_count_known: false,
    }],
  });

  assert.equal(entry.tables_running, null);
  assert.equal(entry.players_waiting, null);
  assert.equal(entry.live_count_known, false);
  assert.equal(entry.data_mode, 'catalog');
  assert.equal(cashGameCountLabel(entry), 'Games Listed, Live Count Unknown');
});

test('stale observed data stays distinct from catalog identity', () => {
  const entry = buildLiveCashGameEntry({
    bravo_slug: 'stale-observed-room',
    venue_name: 'Stale Observed Room',
    data_mode: 'none',
    live_count_known: false,
    is_stale: true,
    tables_running_total: null,
    games: [{
      game: '2/5 NLH',
      source: 'bravo',
      observation_kind: 'observed',
      tables_running: 0,
      players_waiting: 0,
      live_count_known: false,
      is_stale: true,
    }],
  });

  assert.equal(entry.data_mode, 'none');
  assert.equal(entry.has_catalog_data, false);
  assert.equal(cashGameCountLabel(entry), 'Live Count Unavailable');
});

test('modeled spelling variants remain count-bearing estimates', () => {
  const entry = buildLiveCashGameEntry({
    games: [{
      game: '1/3 NLH',
      observation_kind: 'modeled',
      tables_running: 2,
      players_waiting: 1,
    }],
  });

  assert.equal(entry.tables_running, 2);
  assert.equal(entry.tables_running_simulated, 2);
  assert.equal(entry.data_mode, 'estimated');
});

test('a zero-table observed game remains a known live zero in shared adapters', () => {
  const entry = buildLiveCashGameEntry({
    games: [{
      game: '1/3 NLH',
      observation_kind: 'observed',
      tables_running: 0,
      players_waiting: 0,
    }],
  });

  assert.equal(entry.live_count_known, true);
  assert.equal(entry.tables_running, 0);
  assert.equal(entry.data_mode, 'live');
  assert.equal(cashGameCountLabel(entry), 'Live Now: 0 Tables');
});

test('shared adapters do not revive a stale game beside a fresh game', () => {
  const entry = buildLiveCashGameEntry({
    games: [{
      game: '2/5 NLH',
      observation_kind: 'observed',
      tables_running: 6,
      players_waiting: 4,
      live_count_known: false,
      is_stale: true,
    }, {
      game: '1/3 NLH',
      observation_kind: 'modeled',
      tables_running: 2,
      players_waiting: 1,
    }],
  });

  assert.equal(entry.tables_running, 2);
  assert.equal(entry.players_waiting, 1);
  assert.equal(entry.tables_running_observed, 0);
  assert.equal(entry.tables_running_simulated, 2);
  assert.equal(entry.data_mode, 'estimated');
});

test('client fallback keeps identity but expires cached live counts', () => {
  const seenAt = Date.parse('2026-09-06T12:00:00Z');
  const stale = expireCachedLiveCashGameEntry({
    venue_name: 'Cached Room',
    data_mode: 'live',
    live_count_known: true,
    last_updated: '2026-09-06T08:00:00Z',
    tables_running_total: 4,
    totalTables: 4,
    totalWait: 3,
    games: [{
      game: '1/3 NLH',
      observation_kind: 'observed',
      tables_running: 4,
      players_waiting: 3,
    }],
  }, seenAt);

  assert.equal(stale.venue_name, 'Cached Room');
  assert.equal(stale.data_mode, 'none');
  assert.equal(stale.live_count_known, false);
  assert.equal(stale.tables_running_total, null);
  assert.equal(stale.totalTables, null);
  assert.equal(stale.games[0].tables_running, 0);
  assert.equal(stale.games[0].last_known_tables_running, 4);
  assert.equal(stale.games[0].is_stale, true);
});

test('metrics summary recognizes progress and maintenance as healthy checkpoints', () => {
  const bucket = buildScraperMetricBucket([
    { cycle_start: '2026-09-06T10:20:00Z', run_status: 'maintenance', records_attempted: 0, records_saved: 0, records_rejected: 0, errors: 0, status_reason: 'completed_sweep_cleanup_confirmed' },
    { cycle_start: '2026-09-06T10:00:00Z', run_status: 'success', records_attempted: 20, records_saved: 20, records_rejected: 0, errors: 0, duration_seconds: 5 },
    { cycle_start: '2026-09-06T10:10:00Z', run_status: 'progress', records_attempted: 0, records_saved: 0, records_rejected: 0, errors: 0, status_reason: 'sweep_checkpoint_advanced_without_catalog_rows' },
  ]);

  assert.equal(bucket.summary.cycles, 3);
  assert.equal(bucket.summary.successful_cycles, 1);
  assert.equal(bucket.summary.progress_cycles, 1);
  assert.equal(bucket.summary.maintenance_cycles, 1);
  assert.equal(bucket.summary.healthy_checkpoint_cycles, 2);
  assert.equal(bucket.summary.current_status, 'maintenance');
  assert.equal(bucket.summary.current_effective_status, 'maintenance');
  assert.equal(bucket.summary.current_status_healthy, true);
  assert.equal(bucket.summary.requires_attention, false);
  assert.deepEqual(bucket.history.map((row) => row.run_status), ['success', 'progress', 'maintenance']);
  assert.equal(normalizeScraperRunStatus('unexpected'), 'legacy');
});

test('metrics never render a contradictory success as healthy', () => {
  const dishonest = {
    cycle_start: '2026-09-06T10:00:00Z',
    run_status: 'success',
    records_attempted: 4,
    records_saved: 5,
    records_rejected: 0,
    errors: 0,
  };
  assert.deepEqual(classifyScraperMetricOutcome(dishonest), {
    status: 'partial',
    consistent: false,
    reason: 'Attempted records do not equal saved plus rejected records.',
  });
  const bucket = buildScraperMetricBucket([dishonest]);
  assert.equal(bucket.summary.current_status, 'success');
  assert.equal(bucket.summary.current_effective_status, 'partial');
  assert.equal(bucket.summary.current_status_healthy, false);
  assert.equal(bucket.summary.requires_attention, true);
  assert.equal(bucket.summary.inconsistent_cycles, 1);
  assert.equal(bucket.history[0].effective_status, 'partial');
});

test('a failed metric cannot claim partially persisted output', () => {
  assert.deepEqual(classifyScraperMetricOutcome({
    run_status: 'failed',
    records_attempted: 2,
    records_saved: 1,
    records_rejected: 1,
    errors: 1,
  }), {
    status: 'failed',
    consistent: false,
    reason: 'Failed output must save no records and report at least one error.',
  });
});

test('operations secrets fail closed when not configured and accept configured headers only', () => {
  assert.equal(requestHasPokerOpsSecret({ headers: {} }, {}), false);
  assert.equal(requestHasPokerOpsSecret({ headers: { authorization: 'Bearer undefined' } }, {}), false);
  assert.equal(requestHasPokerOpsSecret({ headers: { 'x-cron-secret': '' } }, { CRON_SECRET: '' }), false);
  assert.equal(requestHasPokerOpsSecret(
    { headers: { authorization: 'Bearer cron-secret-value' } },
    { CRON_SECRET: 'cron-secret-value' },
  ), true);
  assert.equal(requestHasPokerOpsSecret(
    { headers: { 'x-admin-secret': 'admin-secret-value' } },
    { ADMIN_ROUTE_SECRET: 'admin-secret-value' },
  ), true);
  assert.equal(requestHasPokerOpsSecret(
    { headers: { 'x-admin-secret': 'wrong-secret' } },
    { ADMIN_ROUTE_SECRET: 'admin-secret-value' },
  ), false);
});

test('operations detail authorization accepts canonical admin flags or roles only', async () => {
  const mockSupabase = (profile) => ({
    auth: {
      getClaims: async (token) => token === 'valid-jwt-for-ops-read'
        ? { data: { claims: { sub: 'user-1', role: 'authenticated' } }, error: null }
        : { data: { claims: null }, error: new Error('invalid') },
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: profile, error: null }),
        }),
      }),
    }),
  });

  assert.equal((await authorizePokerOpsRead(
    { headers: { authorization: 'Bearer valid-jwt-for-ops-read' } },
    mockSupabase({ is_admin: true, role: 'member' }),
    {},
  )).authorized, true);
  assert.equal((await authorizePokerOpsRead(
    { headers: { authorization: 'Bearer valid-jwt-for-ops-read' } },
    mockSupabase({ is_admin: false, role: 'superadmin' }),
    {},
  )).authorized, true);
  assert.equal((await authorizePokerOpsRead(
    { headers: { authorization: 'Bearer valid-jwt-for-ops-read' } },
    mockSupabase({ is_admin: false, role: 'member' }),
    {},
  )).authorized, false);
  assert.equal((await authorizePokerOpsRead(
    { headers: { authorization: 'Bearer expired-jwt-for-ops-read' } },
    mockSupabase({ is_admin: true, role: 'admin' }),
    {},
  )).authorized, false);
});

test('public scraper health response exposes status and freshness only', () => {
  const publicHealth = sanitizePublicScraperHealth({
    status: 'warning',
    checked_at: '2026-09-06T12:00:00.000Z',
    issues: ['private reason'],
    alert_history: [{ id: 'alert-1', message: 'private message' }],
    scrapers: {
      pokeratlas: {
        status: 'healthy',
        minutes_ago: 4,
        cycle_minutes_ago: 2,
        batch_id: 'private-batch',
        status_reason: 'private-reason',
        records: 350,
        records_saved: 350,
      },
    },
  });
  assert.deepEqual(publicHealth, {
    status: 'warning',
    checked_at: '2026-09-06T12:00:00.000Z',
    scrapers: { pokeratlas: { status: 'healthy', minutes_ago: 2 } },
  });
  assert.doesNotMatch(JSON.stringify(publicHealth), /private|batch|records|alert|reason/);
});

test('live and monitoring APIs expose the catalog and checkpoint contracts', async () => {
  const [api, healthApi, metricsApi, dashboard, liveFeed] = await Promise.all([
    readFile(new URL('../pages/api/poker/live-tables.js', import.meta.url), 'utf8'),
    readFile(new URL('../pages/api/poker/scraper-health.js', import.meta.url), 'utf8'),
    readFile(new URL('../pages/api/poker/scraper-metrics.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/poker-near-me/ScraperHealthDashboard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/poker-near-me/LiveGamesFeed.jsx', import.meta.url), 'utf8'),
  ]);
  assert.match(api, /tables_running: isCatalog \? null/);
  assert.match(api, /live_count_known: !isCatalog/);
  assert.match(api, /total_tables_catalog: null/);
  assert.match(api, /catalog_game_count: catalogGameCount/);
  assert.match(api, /maxCurrentAgeMs: STALE_THRESHOLD_MS/);
  assert.match(api, /const currentActivityGames = vd\.games\.filter/);
  assert.match(api, /game\.live_count_known !== false/);
  assert.match(api, /has_stale_activity/);
  assert.match(api, /_hasCurrentObserved/);
  assert.match(api, /_hasCurrentEstimated/);
  assert.match(api, /vd\._hasRealData\s*\? \(vd\._hasSimulatedData \? 'mixed' : 'live'\)/);
  assert.match(api, /vd\.last_updated = vd\.data_mode === 'catalog'/);
  assert.match(api, /vd\.last_activity_updated/);
  assert.match(api, /vd\.last_catalog_updated/);
  assert.match(healthApi, /\['valid_empty', 'progress', 'maintenance'\]/);
  assert.match(healthApi, /key: 'bravo_simulator'/);
  assert.match(healthApi, /metricSource: 'bravo-simulator'/);
  assert.match(healthApi, /\.lte\('scrape_timestamp', nowIso\)/);
  assert.match(healthApi, /\.lte\('cycle_start', nowIso\)/);
  assert.match(healthApi, /tablesRunning = isCatalogSource\s*\? null/);
  assert.match(healthApi, /authorizePokerOpsRead\(req, supabase\)/);
  assert.match(healthApi, /sanitizePublicScraperHealth\(detailedPayload\)/);
  assert.match(healthApi, /Cache-Control', 'private, no-store'/);
  assert.match(metricsApi, /fetchSourceMetrics\('bravo-simulator'\)/);
  assert.match(metricsApi, /\.lte\('cycle_start', nowIso\)/);
  assert.match(metricsApi, /bravo_simulator: buildScraperMetricBucket/);
  assert.match(metricsApi, /authorizePokerOpsRead\(req, supabase\)/);
  assert.match(metricsApi, /status\(401\)\.json\(\{ error: 'Authorization required' \}\)/);
  assert.match(metricsApi, /Cache-Control', 'private, no-store'/);
  assert.match(dashboard, /progress_cycles/);
  assert.match(dashboard, /maintenance_cycles/);
  assert.match(dashboard, /StatusBadge status=\{s\.current_effective_status \|\| s\.current_status/);
  assert.match(dashboard, /table: 'scraper_metrics'/);
  assert.match(dashboard, /Saved-Data Model Engine/);
  assert.match(dashboard, /getFreshAccessToken/);
  assert.match(dashboard, /Authorization: `Bearer \$\{token\}`/);
  assert.match(liveFeed, /\.filter\(v => v\.games_offered && v\.games_offered\.length > 0\)/);
  assert.doesNotMatch(liveFeed, /games_offered\.length > 0 && v\.poker_tables > 0/);
});
