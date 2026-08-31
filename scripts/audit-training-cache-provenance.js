#!/usr/bin/env node

/** Read-only lineage audit for every cached Training question. */

const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const { atomicJsonWrite } = require('./audit-solved-spots-warehouse.js');

const ROOT = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(ROOT, '.env.local'), quiet: true });

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
      ORDER BY game_id, level, question_id
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
    const result = {
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
      groups,
      samples: samples.rows,
    };
    const output = arg('output');
    if (output) atomicJsonWrite(path.resolve(output), result);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
