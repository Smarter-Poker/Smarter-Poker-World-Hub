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

test('local watchdog follows the release runtime and never restarts owner-disabled Bravo live', async () => {
  const watchdog = await readFile(
    new URL('../scripts/scraper-watchdog.py', import.meta.url),
    'utf8',
  );
  assert.match(watchdog, /SMARTER_POKER_SCRAPER_ROOT/);
  assert.match(watchdog, /simulator-heartbeat\.json/);
  assert.match(watchdog, /com\.smarter-poker\.bravo-simulator/);
  assert.doesNotMatch(watchdog, /BRAVO_PLIST\s*=\s*['"]com\.smarter-poker\.bravo-daemon/);
  assert.doesNotMatch(watchdog, /bravo-logs['"]\s*\/\s*['"]heartbeat\.json/);
  assert.match(watchdog, /if job_loaded\(plist_label\):/);
  assert.match(watchdog, /respecting launchd throttle\/backoff/);
});

test('freshness invariant RPC is replayable, private, and wired to its watchdog', async () => {
  const [migration, watchdog] = await Promise.all([
    readFile(
      new URL(
        '../supabase/migrations/20260907015000_pnm_freshness_invariants_contract.sql',
        import.meta.url,
      ),
      'utf8',
    ),
    readFile(new URL('../scripts/pnm-freshness-watchdog.py', import.meta.url), 'utf8'),
  ]);

  assert.match(
    migration,
    /create\s+or\s+replace\s+function\s+public\.pnm_freshness_invariants\(\)/i,
  );
  assert.match(migration, /security\s+definer\s+set\s+search_path\s*=\s*public/i);
  assert.match(
    migration,
    /revoke\s+all\s+on\s+function\s+public\.pnm_freshness_invariants\(\)\s+from\s+public/i,
  );
  assert.match(
    migration,
    /revoke\s+all\s+on\s+function\s+public\.pnm_freshness_invariants\(\)\s+from\s+anon/i,
  );
  assert.match(
    migration,
    /revoke\s+all\s+on\s+function\s+public\.pnm_freshness_invariants\(\)\s+from\s+authenticated/i,
  );
  assert.match(
    migration,
    /grant\s+execute\s+on\s+function\s+public\.pnm_freshness_invariants\(\)\s+to\s+service_role/i,
  );
  assert.match(watchdog, /\/rest\/v1\/rpc\/pnm_freshness_invariants/);
});

test('series fallback rejects promotion copy and persists honest extraction quality', async () => {
  const [seriesScraper, seriesApi, truthContract, eventMigration, seriesMigration, quarantineMigration] = await Promise.all([
    readFile(new URL('../scripts/poker_series_scraper.py', import.meta.url), 'utf8'),
    readFile(new URL('../pages/api/poker/series.js', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/scraper_data_truth.py', import.meta.url), 'utf8'),
    readFile(
      new URL(
        '../supabase/migrations/20260906223000_poker_events_quality_contract.sql',
        import.meta.url,
      ),
      'utf8',
    ),
    readFile(
      new URL(
        '../supabase/migrations/20260906224000_poker_series_quality_contract.sql',
        import.meta.url,
      ),
      'utf8',
    ),
    readFile(
      new URL(
        '../supabase/migrations/20260906230000_poker_series_identity_quarantine.sql',
        import.meta.url,
      ),
      'utf8',
    ),
  ]);

  assert.match(seriesScraper, /from scraper_data_truth import is_poker_tournament_event_text/);
  assert.match(seriesScraper, /PA_SERIES_LISTING_URL/);
  assert.match(seriesScraper, /def extract_pa_series_listing/);
  assert.match(seriesScraper, /def pa_series_page_matches/);
  assert.match(seriesScraper, /source_identity_mismatch/);
  assert.match(seriesScraper, /pokeratlas_live_listing/);
  assert.match(seriesScraper, /def sb_ensure_series_parent/);
  assert.match(seriesScraper, /parent not verified/);
  assert.match(seriesScraper, /headers=\{\*\*SB_HDRS, "Prefer": "return=representation"\}/);
  assert.match(seriesScraper, /if not is_poker_tournament_event_text\(txt\): return/);
  assert.doesNotMatch(seriesScraper, /scraped_partial/);
  assert.match(seriesScraper, /"hendonmob":\s+\("scraped_inferred", "medium"\)/);
  assert.match(seriesScraper, /"cardplayer":\s+\("scraped_inferred", "medium"\)/);
  assert.match(truthContract, /_POKER_EVENT_PROMOTION_NOISE_RE/);
  assert.match(truthContract, /def is_poker_tournament_event_text/);
  assert.match(eventMigration, /check \(data_quality in \(/i);
  assert.match(eventMigration, /'scraped_inferred'/);
  assert.match(eventMigration, /'manual_research'/);
  assert.match(eventMigration, /validate constraint chk_poker_events_data_quality/i);
  assert.match(seriesMigration, /'scraped_inferred'/);
  assert.match(seriesMigration, /validate constraint chk_poker_series_data_quality/i);
  assert.match(seriesApi, /SERVABLE_EVENT_QUALITIES/);
  assert.equal((seriesApi.match(/\.in\('data_quality', SERVABLE_EVENT_QUALITIES\)/g) || []).length, 1);
  assert.match(seriesApi, /SERVABLE_SERIES_QUALITIES/);
  assert.equal((seriesApi.match(/\.in\('data_quality', SERVABLE_SERIES_QUALITIES\)/g) || []).length, 3);
  assert.equal((seriesApi.match(/!isServableSeriesParentEvidence\((?:ts|ps)\)/g) || []).length, 2);
  assert.match(seriesApi, /filter\(\s*row => isServableSeriesParentEvidence\(row\)/);
  assert.doesNotMatch(seriesApi, /filter\(isServableSeriesParentEvidence\)/);
  assert.match(seriesApi, /fetchPokerEventsForSeries/);
  assert.match(seriesApi, /if \(tsErr\) \{\s*throw tsErr;\s*\}/);
  assert.match(seriesApi, /if \(psErr\) \{\s*throw psErr;\s*\}/);
  assert.match(seriesApi, /Series catalog is temporarily unavailable/);
  assert.match(
    seriesApi,
    /source\.not\.in\.\(html_fallback,cardplayer,venue_subpage,venue_website,bravo_venue,source_url,pdf_fallback\),human_verified\.eq\.true/,
  );
  assert.doesNotMatch(seriesApi, /page < 5/);
  assert.match(quarantineMigration, /Kings Poker Room Series/);
  assert.match(quarantineMigration, /pnm_source_identity_quarantine_20260906/);
  assert.doesNotMatch(quarantineMigration, /delete\s+from\s+public\.poker_events/i);
});

test('parser artifact follow-up quarantines the exact audited rows without deleting history', async () => {
  const migration = await readFile(
    new URL(
      '../supabase/migrations/20260906235500_daily_and_series_parser_artifact_quarantine.sql',
      import.meta.url,
    ),
    'utf8',
  );

  // A clean database has none of these audited production runtime rows and
  // must replay as an intentional no-op. Only the exact original 79-row set
  // may be quarantined; a partial or expanded match still fails closed.
  assert.match(migration, /not\s+in\s*\(\s*0\s*,\s*79\s*\)\s+then/i);
  assert.doesNotMatch(migration, /artifact is missing/i);
  assert.match(migration, /17700ed6-8713-42f7-8194-2452f3461959/);
  assert.match(migration, /pnm_parser_artifact_quarantine_20260906_followup/);
  assert.match(migration, /set\s+is_active\s*=\s*false,\s+data_quality\s*=\s*'stale'/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.(?:venue_daily_tournaments|poker_events)/i);
});

test('public event text quarantine preserves rows and covers every audited fragment', async () => {
  const migration = await readFile(
    new URL(
      '../supabase/migrations/20260907022000_pnm_public_event_text_quarantine.sql',
      import.meta.url,
    ),
    'utf8',
  );

  for (const id of [
    '04b674e4-b5b2-413b-938e-da0420ccfab9',
    '051ea095-d9d5-4e5b-bb43-cf94cfe8d85e',
    '061df441-5b19-43b8-b678-2c2c2925a1a4',
    '0e25566b-f105-4c97-b03c-ed7c10fe080c',
    '7a1b58b5-a483-4de7-9b5a-1fdc3b373a98',
    '9ef50488-598f-40c4-a1a6-539ece5798ec',
    '10838483-6ea5-4fdf-8b43-3e6a7a20069c',
    '6e1b5eac-679d-43f7-9834-d1c5b0386153',
    '72546d3c-20ad-4038-b53a-7dd8c997edd9',
  ]) {
    assert.match(migration, new RegExp(id));
  }
  assert.match(migration, /pnm_public_text_quarantine_20260907/);
  assert.match(migration, /set data_quality = 'stale'/);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.(?:poker_events|tour_stop_events)/i);
});

test('daily schedule fallback cannot turn venue promotions into tournaments', async () => {
  const [dailyScraper, cleanupMigration, followupMigration, moheganMigration] = await Promise.all([
    readFile(new URL('../scripts/tournament-schedule-daemon.py', import.meta.url), 'utf8'),
    readFile(
      new URL(
        '../supabase/migrations/20260906225000_daily_tournament_runtime_cleanup.sql',
        import.meta.url,
      ),
      'utf8',
    ),
    readFile(
      new URL(
        '../supabase/migrations/20260906232000_daily_tournament_identity_quarantine_followup.sql',
        import.meta.url,
      ),
      'utf8',
    ),
    readFile(
      new URL(
        '../supabase/migrations/20260906233000_daily_tournament_mohegan_identity_quarantine.sql',
        import.meta.url,
      ),
      'utf8',
    ),
  ]);

  assert.match(dailyScraper, /is_poker_tournament_event_text/);
  assert.match(dailyScraper, /def is_generic_tournament_candidate/);
  assert.match(dailyScraper, /def pokeratlas_room_page_identity/);
  assert.match(dailyScraper, /def bravo_room_page_identity/);
  assert.match(dailyScraper, /room_name_identity_mismatch/);
  assert.match(dailyScraper, /GENERIC_BUYIN_EVIDENCE_RE/);
  assert.match(dailyScraper, /GENERIC_PROMOTION_NOISE_RE/);
  assert.match(dailyScraper, /PATCH RETRY/);
  assert.match(dailyScraper, /57014/);
  assert.match(dailyScraper, /def sb_get_checked/);
  assert.match(dailyScraper, /select=id,scrape_batch_id,last_scraped/);
  assert.match(dailyScraper, /id=in\.\(\{ids\}\)/);
  assert.match(dailyScraper, /def deactivate_past_events\(max_rows: int = 5000\)/);
  assert.match(dailyScraper, /def deactivate_stale_recurring_projections/);
  assert.match(dailyScraper, /source_errors/);
  assert.match(dailyScraper, /not args\.venue_ids and not args\.missing and not args\.batch/);
  assert.match(dailyScraper, /"is_recurring": bool\(day and not event_date\)/);
  assert.doesNotMatch(dailyScraper, /re\.split\(r"\(\?=\\\$\\d\)"/);
  assert.doesNotMatch(dailyScraper, /for line in html\.split\("\\n"\)/);
  assert.match(dailyScraper, /"records":result\["records"\]/);
  assert.match(cleanupMigration, /idx_vdt_active_event_date_id/);
  assert.match(cleanupMigration, /pnm_source_identity_quarantine_20260906/);
  assert.match(cleanupMigration, /pnm_promotion_copy_quarantine_20260906/);
  assert.match(cleanupMigration, /America\/Los_Angeles/);
  assert.doesNotMatch(cleanupMigration, /delete\s+from\s+public\.venue_daily_tournaments/i);
  assert.match(followupMigration, /golden-nugget-lv-las-vegas/);
  assert.match(followupMigration, /rivers-philadelphia/);
  assert.match(followupMigration, /pnm_source_identity_quarantine_20260906/);
  assert.doesNotMatch(followupMigration, /delete\s+from\s+public\.venue_daily_tournaments/i);
  assert.match(moheganMigration, /mohegan-sun-uncasville/);
  assert.match(moheganMigration, /34acccdc-5390-4f11-8fe2-21458733b8ab/);
  assert.doesNotMatch(moheganMigration, /delete\s+from\s+public\.venue_daily_tournaments/i);
});

test('tour readers exclude quarantined rows and the canary cleanup is auditable', async () => {
  const [tourApi, calendarApi, quarantineMigration, tourScraper] = await Promise.all([
    readFile(new URL('../pages/api/poker/tour-schedule.js', import.meta.url), 'utf8'),
    readFile(new URL('../pages/api/poker/events-calendar.js', import.meta.url), 'utf8'),
    readFile(
      new URL(
        '../supabase/migrations/20260906231000_tour_stop_quality_quarantine.sql',
        import.meta.url,
      ),
      'utf8',
    ),
    readFile(new URL('../scripts/tour_stealth_scraper.py', import.meta.url), 'utf8'),
  ]);

  assert.match(tourApi, /SERVABLE_TOUR_EVENT_QUALITIES/);
  assert.match(tourApi, /\.in\('data_quality', SERVABLE_TOUR_EVENT_QUALITIES\)/);
  assert.match(calendarApi, /SERVABLE_TOUR_EVENT_QUALITIES/);
  assert.match(calendarApi, /\.in\('data_quality', SERVABLE_TOUR_EVENT_QUALITIES\)/);
  assert.match(tourScraper, /Date-like copy in scripts, image alt text/);
  assert.match(tourScraper, /chip counts\?/i);
  assert.match(quarantineMigration, /CHIP COUNTS\/REDRAWS/);
  assert.match(quarantineMigration, /duplicate of manually researched Wynn Signature Series stop/);
  assert.doesNotMatch(quarantineMigration, /delete\s+from\s+public\.tour_stop_events/i);
});

test('daily readers bind requested days to one date and suppress stale recurrence', async () => {
  const [dailyApi, calendarApi, dataHelper, freshnessMigration, correctionMigration] = await Promise.all([
    readFile(new URL('../pages/api/poker/daily-tournaments.js', import.meta.url), 'utf8'),
    readFile(new URL('../pages/api/poker/events-calendar.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/poker-near-me/dailyTournamentData.mjs', import.meta.url), 'utf8'),
    readFile(
      new URL(
        '../supabase/migrations/20260906234000_daily_recurring_freshness_quarantine.sql',
        import.meta.url,
      ),
      'utf8',
    ),
    readFile(
      new URL(
        '../supabase/migrations/20260906235000_daily_projection_flag_correction.sql',
        import.meta.url,
      ),
      'utf8',
    ),
  ]);

  assert.match(dailyApi, /query = query\.eq\('event_date', targetDateStr\)/);
  assert.match(dailyApi, /\.or\('event_date\.is\.null,event_date\.eq\.1970-01-01'\)/);
  assert.match(dailyApi, /fetchAllDailyTournamentRows\(\(\) => buildTournamentQuery\('recurring'\)\)/);
  assert.match(dailyApi, /projectDailyTournamentDate\(row, targetDateStr\)/);
  assert.match(dataHelper, /event_date: targetDate, is_recurring: true/);
  assert.doesNotMatch(dailyApi, /event_date\.eq\.\$\{cleanExactDate\},day_of_week/);
  assert.match(dailyApi, /stale_recurring_schedules_suppressed/);
  assert.match(calendarApi, /isServableDailyTournamentRow\(t\)/);
  assert.match(calendarApi, /last_scraped,[^'\n]*is_recurring/);
  assert.match(dataHelper, /DAILY_RECURRING_MAX_AGE_MS/);
  assert.match(dataHelper, /Unknown or invalid verification timestamps therefore fail closed/);
  assert.match(freshnessMigration, /pnm_recurring_projection/);
  assert.match(freshnessMigration, /pnm_parser_artifact_quarantine_20260906/);
  assert.match(correctionMigration, /parent_tournament_id is null/);
  assert.match(freshnessMigration, /eventattendancemode/);
  assert.match(freshnessMigration, /wixui-rich-text__text/);
  assert.match(freshnessMigration, /em friday @ 7pm hold/);
  assert.doesNotMatch(freshnessMigration, /delete\s+from\s+public\.venue_daily_tournaments/i);
  assert.match(correctionMigration, /pnm_projection_classification_corrected_20260906/);
  assert.match(correctionMigration, /parent_tournament_id is null/);
  assert.match(correctionMigration, /- 'pnm_recurring_projection'/);
  assert.match(correctionMigration, /- 'pnm_recurring_freshness_quarantine_20260906'/);
  assert.doesNotMatch(correctionMigration, /set\s+is_active\s*=\s*true/i);
  assert.doesNotMatch(correctionMigration, /data_quality\s*=\s*'(?:scraped_verified|scraped_inferred|manual_research)'/i);
});
