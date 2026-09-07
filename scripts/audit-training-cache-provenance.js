#!/usr/bin/env node

/** Read-only lineage audit for every cached Training question. */

const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const { atomicJsonWrite } = require('./audit-solved-spots-warehouse.js');

const ROOT = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(ROOT, '.env.local'), quiet: true });

const SOURCE_CLASSIFICATIONS = [
  'SOLVER_EXACT',
  'SOLVER_AGGREGATED',
  'SOLVER_DERIVED_RESPONSE',
  'CHART_AUDITED',
  'MODEL_DISTILLED',
  'CURATED',
  'HEURISTIC',
  'LEGACY_UNVERIFIED',
];

function databaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!url || !password) throw new Error('Supabase database environment is required.');
  return {
    host: `db.${new URL(url).hostname.split('.')[0]}.supabase.co`,
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password,
    ssl: { rejectUnauthorized: false },
    application_name: 'training_cache_provenance_read_only_audit',
  };
}

function arg(name, fallback = null) {
  const prefix = `--${name}=`;
  const found = process.argv.find((value) => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function expectedPioGames() {
  const games = new Map();
  const source = fs.readFileSync(path.join(ROOT, 'src/services/PIOQueryService.js'), 'utf8');
  const start = source.indexOf('const configs = {');
  const end = source.indexOf('return configs[gameId]', start);
  if (start < 0 || end < 0) throw new Error('Unable to locate Training PioSOLVER configs.');
  for (const match of source.slice(start, end).matchAll(/'([^']+)':\s*\{([^{}]*)\}/g)) {
    const gameId = match[1];
    const config = match[2];
    if (!/sourceOfTruth:\s*'PioSOLVER'/.test(config)) continue;
    games.set(gameId, {
      family: config.match(/pioGameType:\s*'([^']+)'/)?.[1] || null,
      stack: Number(config.match(/pioStackDepth:\s*(\d+)/)?.[1]),
      forcedStreet: config.match(/pioStreet:\s*'([^']+)'/)?.[1] || null,
    });
  }
  return games;
}

async function main() {
  const client = new Client(databaseConfig());
    await client.connect();
  try {
    await client.query('SET default_transaction_read_only = on');
    await client.query("SET statement_timeout = '180s'");
    const phaseThreeColumns = [
      'canonical_policy', 'source_classification', 'quality_status', 'scenario_hash',
      'exact_node', 'public_action_history', 'policy_version', 'solver_version',
      'solver_binary_checksum', 'manifest_version', 'manifest_checksum',
      'source_checksum', 'pipeline_commit', 'machine_id', 'source_created_at',
      'source_audited_at', 'generator_version', 'lineage', 'content_checksum',
      'policy_checksum', 'served_count', 'answered_count', 'correct_count',
      'completed_count',
    ];
    const cacheColumns = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'training_question_cache'
        AND column_name = ANY($1::text[])
    `, [phaseThreeColumns]);
    const missingPhaseThreeColumns = phaseThreeColumns.filter(
      (column) => !cacheColumns.rows.some((row) => row.column_name === column),
    );
    if (missingPhaseThreeColumns.length > 0) {
      throw new Error(`Phase 3 cache contract is not installed: ${missingPhaseThreeColumns.join(', ')}`);
    }
    const provenanceColumns = [
      'quality_status', 'solver_version', 'solver_binary_checksum', 'machine_id', 'pipeline_commit',
      'manifest_version', 'manifest_checksum', 'source_artifact_checksum', 'audited_at',
    ];
    const existingColumns = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'solved_spots_gold'
        AND column_name = ANY($1::text[])
    `, [provenanceColumns]);
    const hasProvenanceColumns = existingColumns.rows.length === provenanceColumns.length;
    const provenanceAggregate = hasProvenanceColumns
      ? `bool_or(strategy_matrix_v2 IS NOT NULL AND quality_status = 'validated'
          AND solver_version IS NOT NULL
          AND solver_binary_checksum ~ '^[0-9a-f]{64}$'
          AND machine_id IN ('M1', 'M2')
          AND pipeline_commit ~ '^[0-9a-f]{40}$'
          AND manifest_version IS NOT NULL
          AND manifest_checksum ~ '^[0-9a-f]{64}$'
          AND source_artifact_checksum ~ '^[0-9a-f]{64}$'
          AND audited_at IS NOT NULL) AS provenance_complete_v2`
      : 'false AS provenance_complete_v2';
    const summary = await client.query(`
      WITH cache AS (
        SELECT question_id, game_id, engine_type, level, question_data,
          nullif(question_data #>> '{scenario,scenarioHash}', '') AS scenario_hash,
          coalesce(nullif(question_data ->> 'source', ''), '<missing>') AS question_source
        FROM public.training_question_cache
        WHERE quality_status IN ('active', 'active_fallback')
      ), cache_hashes AS (
        SELECT DISTINCT scenario_hash FROM cache WHERE scenario_hash IS NOT NULL
      ), warehouse AS (
        SELECT s.scenario_hash,
          bool_or(s.strategy_matrix_v2 IS NOT NULL) AS has_v2,
          bool_or(s.strategy_matrix IS NOT NULL) AS has_legacy,
          ${provenanceAggregate}
        FROM public.solved_spots_gold s
        JOIN cache_hashes h ON h.scenario_hash = s.scenario_hash
        GROUP BY s.scenario_hash
      ), joined AS (
        SELECT c.*,
          s.scenario_hash IS NOT NULL AS warehouse_match,
          coalesce(s.has_v2, false) AS has_v2,
          coalesce(s.has_legacy, false) AS has_legacy,
          coalesce(s.provenance_complete_v2, false) AS provenance_complete_v2
        FROM cache c
        LEFT JOIN warehouse s ON s.scenario_hash = c.scenario_hash
      )
      SELECT engine_type, question_source,
        count(*)::bigint AS rows,
        count(*) FILTER (WHERE scenario_hash IS NULL)::bigint AS missing_scenario_hash,
        count(*) FILTER (WHERE scenario_hash IS NOT NULL AND NOT warehouse_match)::bigint AS missing_warehouse_row,
        count(*) FILTER (WHERE has_v2)::bigint AS v2_rows,
        count(*) FILTER (WHERE has_legacy AND NOT has_v2)::bigint AS legacy_rows,
        count(*) FILTER (WHERE provenance_complete_v2)::bigint AS provenance_complete_v2_rows
      FROM joined
      GROUP BY engine_type, question_source
      ORDER BY engine_type, question_source
    `);
    const samples = await client.query(`
      SELECT question_id, game_id, engine_type, level,
        question_data ->> 'source' AS source,
        question_data #>> '{scenario,scenarioHash}' AS scenario_hash,
        question_data #>> '{scenario,street}' AS street,
        question_data #>> '{scenario,gameType}' AS game_type
      FROM public.training_question_cache
      WHERE quality_status IN ('active', 'active_fallback')
      ORDER BY game_id, level, question_id
      LIMIT 12
    `);
    const pioMetadata = await client.query(`
      SELECT question_id, game_id, level,
        question_data ->> 'source' AS source,
        question_data #>> '{scenario,scenarioHash}' AS scenario_hash,
        question_data #>> '{scenario,street}' AS street,
        question_data #>> '{scenario,gameType}' AS game_type,
        question_data #>> '{scenario,stackDepth}' AS stack_depth,
        question_data #>> '{scenario,spotType}' AS spot_type,
        question_data #>> '{scenario,nodeType}' AS node_type,
        question_data #>> '{scenario,heroPosition}' AS hero_position
      FROM public.training_question_cache
      WHERE engine_type = 'PIO'
        AND quality_status IN ('active', 'active_fallback')
      ORDER BY game_id, level, question_id
    `);
    const truthSummary = await client.query(`
      SELECT source_classification, quality_status,
        count(*)::bigint AS rows,
        count(*) FILTER (WHERE NOT public.fn_training_cache_row_is_valid(
          source_classification, question_data, canonical_policy, scenario_hash,
          exact_node, public_action_history, policy_version, solver_version,
          solver_binary_checksum, manifest_checksum, source_checksum,
          pipeline_commit, machine_id
        ))::bigint AS invalid_rows,
        count(*) FILTER (WHERE content_checksum <> encode(
          extensions.digest(question_data::text, 'sha256'), 'hex'
        ))::bigint AS content_checksum_drift,
        count(*) FILTER (WHERE policy_checksum <> encode(
          extensions.digest(canonical_policy::text, 'sha256'), 'hex'
        ))::bigint AS policy_checksum_drift
      FROM public.training_question_cache
      GROUP BY source_classification, quality_status
      ORDER BY source_classification, quality_status
    `);
    const artifactDrift = await client.query(`
      SELECT
        count(*) FILTER (WHERE c.source_classification IN (
          'SOLVER_EXACT', 'SOLVER_AGGREGATED', 'SOLVER_DERIVED_RESPONSE'
        ) AND NOT EXISTS (
          SELECT 1 FROM public.solved_spots_gold s
          WHERE s.scenario_hash = c.scenario_hash
            AND s.source_artifact_checksum = c.source_checksum
        ))::bigint AS missing_solver_artifact,
        count(*) FILTER (WHERE c.source_classification = 'CHART_AUDITED'
          AND NOT EXISTS (
            SELECT 1 FROM public.memory_charts_gold m
            WHERE m.chart_id::text = c.canonical_policy #>> '{sourceArtifact,artifactId}'
          ))::bigint AS missing_chart_artifact
      FROM public.training_question_cache c
      WHERE c.quality_status IN ('active', 'active_fallback')
    `);
    const counterAudit = await client.query(`
      WITH event_counts AS (
        SELECT question_id,
          count(*) FILTER (WHERE event_type = 'served')::bigint AS served,
          count(*) FILTER (WHERE event_type = 'answered')::bigint AS answered,
          count(*) FILTER (WHERE event_type = 'answered' AND is_correct)::bigint AS correct,
          count(*) FILTER (WHERE event_type = 'completed')::bigint AS completed
        FROM public.training_question_events
        GROUP BY question_id
      )
      SELECT
        count(*) FILTER (WHERE c.served_count <> coalesce(e.served, 0))::bigint AS served_drift,
        count(*) FILTER (WHERE c.answered_count <> coalesce(e.answered, 0))::bigint AS answered_drift,
        count(*) FILTER (WHERE c.correct_count <> coalesce(e.correct, 0))::bigint AS correct_drift,
        count(*) FILTER (WHERE c.completed_count <> coalesce(e.completed, 0))::bigint AS completed_drift,
        coalesce(sum(c.served_count), 0)::bigint AS served_count,
        coalesce(sum(c.answered_count), 0)::bigint AS answered_count,
        coalesce(sum(c.correct_count), 0)::bigint AS correct_count,
        coalesce(sum(c.completed_count), 0)::bigint AS completed_count
      FROM public.training_question_cache c
      LEFT JOIN event_counts e ON e.question_id = c.question_id
      WHERE c.quality_status IN ('active', 'active_fallback')
    `);
    const quarantineAudit = await client.query(`
      SELECT
        count(DISTINCT c.id) FILTER (
          WHERE c.quality_status IN ('quarantined', 'drifted')
        )::bigint AS cache_rows,
        count(DISTINCT q.question_id)::bigint AS snapshot_rows,
        count(DISTINCT c.id) FILTER (
          WHERE c.quality_status IN ('quarantined', 'drifted')
            AND q.question_id IS NULL
        )::bigint AS missing_snapshots
      FROM public.training_question_cache c
      LEFT JOIN public.training_question_cache_quarantine q
        ON q.question_id = c.question_id
    `);
    const latestDriftAudit = await client.query(`
      SELECT run_date, status, metrics, findings, started_at, completed_at
      FROM public.training_cache_audit_runs
      ORDER BY run_date DESC
      LIMIT 1
    `);
    const groups = summary.rows.map((row) => ({
      ...row,
      rows: Number(row.rows),
      missing_scenario_hash: Number(row.missing_scenario_hash),
      missing_warehouse_row: Number(row.missing_warehouse_row),
      v2_rows: Number(row.v2_rows),
      legacy_rows: Number(row.legacy_rows),
      provenance_complete_v2_rows: Number(row.provenance_complete_v2_rows),
    }));
    const expected = expectedPioGames();
    const mismatchReasons = {};
    const byGame = new Map();
    let exactContractRows = 0;
    let rowsWithSubjectMetadata = 0;
    for (const row of pioMetadata.rows) {
      const contract = expected.get(row.game_id);
      const reasons = [];
      const localPreflop = String(row.source || '').toLowerCase() === 'local_solver_ranges';
      if (!contract) reasons.push('game_not_in_pio_runtime_contract');
      if (contract && !localPreflop && row.game_type !== contract.family) reasons.push('family_mismatch');
      if (contract && Number(row.stack_depth) !== contract.stack) reasons.push('stack_mismatch');
      if (contract?.forcedStreet && row.street !== contract.forcedStreet) reasons.push('forced_street_mismatch');
      if (localPreflop && contract?.forcedStreet !== 'preflop') reasons.push('unexpected_local_preflop_source');
      if (!row.scenario_hash && !localPreflop) reasons.push('missing_scenario_hash');
      if (row.spot_type || row.node_type) rowsWithSubjectMetadata += 1;
      if (reasons.length === 0) exactContractRows += 1;
      reasons.forEach((reason) => { mismatchReasons[reason] = (mismatchReasons[reason] || 0) + 1; });
      if (!byGame.has(row.game_id)) byGame.set(row.game_id, {
        rows: 0,
        exactContractRows: 0,
        levelsWithExactRows: [],
        mismatchReasons: {},
      });
      const game = byGame.get(row.game_id);
      game.rows += 1;
      if (reasons.length === 0) {
        game.exactContractRows += 1;
        if (!game.levelsWithExactRows.includes(Number(row.level))) {
          game.levelsWithExactRows.push(Number(row.level));
          game.levelsWithExactRows.sort((a, b) => a - b);
        }
      }
      reasons.forEach((reason) => { game.mismatchReasons[reason] = (game.mismatchReasons[reason] || 0) + 1; });
    }
    const truthGroups = truthSummary.rows.map((row) => ({
      ...row,
      rows: Number(row.rows),
      invalid_rows: Number(row.invalid_rows),
      content_checksum_drift: Number(row.content_checksum_drift),
      policy_checksum_drift: Number(row.policy_checksum_drift),
    }));
    const artifact = Object.fromEntries(Object.entries(artifactDrift.rows[0] || {})
      .map(([key, value]) => [key, Number(value)]));
    const counters = Object.fromEntries(Object.entries(counterAudit.rows[0] || {})
      .map(([key, value]) => [key, Number(value)]));
    const quarantine = Object.fromEntries(Object.entries(quarantineAudit.rows[0] || {})
      .map(([key, value]) => [key, Number(value)]));
    const activeClassCounts = Object.fromEntries(SOURCE_CLASSIFICATIONS.map((value) => [value, 0]));
    for (const group of truthGroups) {
      if (['active', 'active_fallback'].includes(group.quality_status)) {
        activeClassCounts[group.source_classification] += group.rows;
      }
    }
    const failures = [];
    for (const group of truthGroups.filter((row) => (
      ['active', 'active_fallback'].includes(row.quality_status)
    ))) {
      if (group.invalid_rows > 0) failures.push(`${group.invalid_rows} invalid ${group.source_classification} rows`);
      if (group.content_checksum_drift > 0) failures.push(`${group.content_checksum_drift} content checksum drifts`);
      if (group.policy_checksum_drift > 0) failures.push(`${group.policy_checksum_drift} policy checksum drifts`);
    }
    for (const [name, count] of Object.entries(artifact)) {
      if (count > 0) failures.push(`${count} rows have ${name.replaceAll('_', ' ')}`);
    }
    for (const [name, count] of Object.entries(counters).filter(([name]) => name.endsWith('_drift'))) {
      if (count > 0) failures.push(`${count} rows have ${name.replaceAll('_', ' ')}`);
    }
    if (quarantine.missing_snapshots > 0) {
      failures.push(`${quarantine.missing_snapshots} quarantined rows have no recovery snapshot`);
    }
    const result = {
      schemaVersion: 2,
      success: failures.length === 0,
      readOnly: true,
      checkedAt: new Date().toISOString(),
      warehouseProvenanceColumnsPresent: hasProvenanceColumns,
      totals: {
        rows: groups.reduce((sum, group) => sum + group.rows, 0),
        missingScenarioHash: groups.reduce((sum, group) => sum + group.missing_scenario_hash, 0),
        missingWarehouseRow: groups.reduce((sum, group) => sum + group.missing_warehouse_row, 0),
        v2Rows: groups.reduce((sum, group) => sum + group.v2_rows, 0),
        legacyRows: groups.reduce((sum, group) => sum + group.legacy_rows, 0),
        provenanceCompleteV2Rows: groups.reduce((sum, group) => sum + group.provenance_complete_v2_rows, 0),
        pioRows: pioMetadata.rows.length,
        exactPioContractRows: exactContractRows,
        pioContractMismatchRows: pioMetadata.rows.length - exactContractRows,
        pioRowsWithSubjectMetadata: rowsWithSubjectMetadata,
      },
      pioContractAudit: {
        expectedGames: expected.size,
        gamesWithExactRows: [...byGame.values()].filter((game) => game.exactContractRows > 0).length,
        gamesWithoutExactRows: [...expected.keys()].filter((gameId) => !byGame.get(gameId)?.exactContractRows),
        exactGameLevelCells: [...byGame.values()].reduce((sum, game) => sum + game.levelsWithExactRows.length, 0),
        mismatchReasons,
        games: Object.fromEntries([...byGame.entries()].sort()),
      },
      cacheTruthAudit: {
        taxonomy: SOURCE_CLASSIFICATIONS,
        activeClassCounts,
        groups: truthGroups,
        artifacts: artifact,
        counters,
        quarantine,
        latestDailyAudit: latestDriftAudit.rows[0] || null,
        failures,
      },
      groups,
      samples: samples.rows,
    };
    const output = arg('output');
    if (output) atomicJsonWrite(path.resolve(output), result);
    console.log(JSON.stringify(result, null, 2));
    if (!result.success) process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
