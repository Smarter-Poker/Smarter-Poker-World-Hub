#!/usr/bin/env node

/**
 * Capture read-only database evidence about solved_spots_gold writers.
 *
 * PostgreSQL cannot attribute historical PostgREST calls to a physical solver
 * host, but pg_stat_statements can prove the role, statement shape, call count,
 * and reset boundary. The output deliberately excludes credentials and bound
 * payload values.
 */

const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const ROOT = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(ROOT, '.env.local'), quiet: true });

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find((value) => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function databaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!url || !password) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_DB_PASSWORD are required.');
  const projectRef = new URL(url).hostname.split('.')[0];
  return {
    host: `db.${projectRef}.supabase.co`,
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password,
    ssl: { rejectUnauthorized: false },
    application_name: 'training_solver_writer_read_only_audit',
  };
}

async function main() {
  const output = path.resolve(arg(
    'output',
    path.join(ROOT, '.agent/audits/2026-08-31-training-solver-writer-provenance.json'),
  ));
  const client = new Client(databaseConfig());
  await client.connect();
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout = '30s'");

    const columns = await client.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'solved_spots_gold'
        ORDER BY ordinal_position
      `);
    const triggers = await client.query(`
        SELECT t.tgname, pg_get_triggerdef(t.oid) AS trigger_definition,
               p.proname AS function_name
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_proc p ON p.oid = t.tgfoid
        WHERE n.nspname = 'public' AND c.relname = 'solved_spots_gold'
          AND NOT t.tgisinternal
        ORDER BY t.tgname
      `);
    const cronJobs = await client.query(`
        SELECT jobid, schedule, active, command
        FROM cron.job
        WHERE command ILIKE '%solved_spots%' OR command ILIKE '%solver%'
        ORDER BY jobid
      `);
    const tableStats = await client.query(`
        SELECT n_tup_ins, n_tup_upd, n_tup_del, n_live_tup,
               last_vacuum, last_autovacuum, last_analyze, last_autoanalyze
        FROM pg_stat_user_tables
        WHERE schemaname = 'public' AND relname = 'solved_spots_gold'
      `);
    const statementInfo = await client.query(
      'SELECT stats_reset FROM extensions.pg_stat_statements_info',
    );
    const writers = await client.query(`
        SELECT r.rolname, s.calls, s.rows, s.total_exec_time, s.mean_exec_time,
               CASE
                 WHEN s.query LIKE 'WITH pgrst_source AS (INSERT INTO %' THEN 'postgrest_insert'
                 WHEN s.query LIKE 'WITH pgrst_source AS (UPDATE %' THEN 'postgrest_update'
                 ELSE 'other_write'
               END AS statement_kind,
               (s.query ILIKE '%strategy_matrix_v2%') AS writes_strategy_matrix_v2,
               (s.query ILIKE '%solved_v2_at%') AS writes_solved_v2_at
        FROM extensions.pg_stat_statements s
        JOIN pg_roles r ON r.oid = s.userid
        WHERE s.query ILIKE '%solved_spots_gold%'
          AND (s.query ILIKE '%INSERT INTO%' OR s.query ILIKE '%UPDATE%')
        ORDER BY s.calls DESC
      `);

    await client.query('COMMIT');
    const names = columns.rows.map((row) => row.column_name);
    const requiredProvenanceColumns = [
      'solver_version',
      'solver_binary_checksum',
      'machine_id',
      'pipeline_commit',
      'manifest_version',
      'manifest_checksum',
      'source_artifact_checksum',
      'quality_status',
      'audited_at',
    ];
    const result = {
      schemaVersion: 2,
      capturedAt: new Date().toISOString(),
      readOnly: true,
      table: 'public.solved_spots_gold',
      columns: columns.rows,
      missingProvenanceColumns: requiredProvenanceColumns.filter((column) => !names.includes(column)),
      triggers: triggers.rows,
      matchingCronJobs: cronJobs.rows,
      tableStats: tableStats.rows[0] || null,
      statementStatsResetAt: statementInfo.rows[0]?.stats_reset || null,
      historicalWriterStatements: writers.rows.map((row) => ({
        ...row,
        calls: Number(row.calls),
        rows: Number(row.rows),
        total_exec_time: Number(row.total_exec_time),
        mean_exec_time: Number(row.mean_exec_time),
      })),
    };
    const gateInstalled = result.missingProvenanceColumns.length === 0
      && result.triggers.some((trigger) => trigger.tgname === 'solved_spots_gold_require_provenance');
    result.provenanceWriteGateInstalled = gateInstalled;
    result.conclusion = gateInstalled
      ? 'Historical writes remain unattributed, but production now rejects every new or materially changed solver artifact without the complete validated v2 provenance seal.'
      : 'Historical legacy PostgREST writes cannot be attributed to M1 or M2, and the production provenance write gate is incomplete.';
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify({ success: true, output, writerStatements: result.historicalWriterStatements.length }));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = { databaseConfig };
