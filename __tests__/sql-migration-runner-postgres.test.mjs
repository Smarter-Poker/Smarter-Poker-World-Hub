import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { Client } = require('pg');
const {
  acquireMigrationAdvisoryLock,
  assertAppliedMigrationIntegrity,
  assertNoAmbiguousClaims,
  attestMigrationConnection,
  claimIndependentMigration,
  completeIndependentMigration,
  ensureMigrationLedger,
  getAppliedMigrations,
  getMigrationClaims,
  insertMigrationLedgerEntry,
  parseCanonicalMigrationName,
  releaseMigrationAdvisoryLock,
  checksumSql,
} = require('../scripts/lib/sql-transaction-control.js');

function commandPath(name) {
  const pg17Candidates = [
    process.env.PG17_BINDIR && join(process.env.PG17_BINDIR, name),
    join('/opt/homebrew/opt/postgresql@17/bin', name),
    join('/usr/local/opt/postgresql@17/bin', name),
    join('/usr/lib/postgresql/17/bin', name),
  ].filter(Boolean);
  const pg17 = pg17Candidates.find((candidate) => existsSync(candidate));
  if (pg17) return pg17;
  try {
    return execFileSync('sh', ['-c', `command -v ${name}`], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return port;
}

function migration(name, sql) {
  const { version } = parseCanonicalMigrationName(name);
  return Object.freeze({ name, version, sql, checksum: checksumSql(sql), filePath: `/fixture/${name}` });
}

test('real PostgreSQL 17 preserves canonical ledger shape and enforces atomic/ambiguous runner states', async (t) => {
  const initdb = commandPath('initdb');
  const pgCtl = commandPath('pg_ctl');
  const postgres = commandPath('postgres');
  const createdb = commandPath('createdb');
  if (!initdb || !pgCtl || !postgres || !createdb) {
    t.skip('PostgreSQL server tools are unavailable');
    return;
  }
  const versionOutput = execFileSync(postgres, ['--version'], { encoding: 'utf8' });
  if (!/\b17\./.test(versionOutput)) {
    t.skip(`PostgreSQL 17 required, found ${versionOutput.trim()}`);
    return;
  }

  const root = mkdtempSync(join(tmpdir(), 'antigravity-runner-pg17-'));
  const data = join(root, 'data');
  const socket = join(root, 'socket');
  mkdirSync(socket);
  const port = await reservePort();
  let serverStarted = false;
  const clients = [];
  try {
    execFileSync(initdb, [
      '-D', data, '-U', 'postgres', '--locale=en_US.UTF-8', '--encoding=UTF8',
    ], { stdio: 'ignore' });
    execFileSync(pgCtl, [
      '-D', data,
      '-o', `-F -p ${port} -k ${socket} -c listen_addresses=''`,
      '-w', 'start',
    ], { stdio: 'ignore' });
    serverStarted = true;
    execFileSync(createdb, [
      '-h', socket, '-p', String(port), '-U', 'postgres', 'migration_runner',
    ], { stdio: 'ignore' });

    const connect = async () => {
      const client = new Client({
        host: socket,
        port,
        user: 'postgres',
        database: 'migration_runner',
        application_name: 'antigravity-sql-push:fixtureprojectref0000',
      });
      await client.connect();
      clients.push(client);
      return client;
    };
    const first = await connect();
    const second = await connect();
    const environment = await attestMigrationConnection(first, {
      expectedDatabase: 'migration_runner',
      expectedProjectRef: 'fixtureprojectref0000',
      expectedUser: 'postgres',
      // The disposable Unix socket has no TLS. Model the already verified
      // frontend and permitted session-pooler termination boundary here while
      // reading PG17, UTF8, and collation from the real server.
      frontendTlsVerified: true,
      allowBackendTlsTermination: true,
    });
    assert.equal(environment.server_version_num >= 170000 && environment.server_version_num < 180000, true);
    assert.equal(environment.server_encoding, 'UTF8');
    assert.equal(environment.datcollate, 'en_US.UTF-8');
    await first.query(`
      CREATE SCHEMA supabase_migrations;
      CREATE TABLE supabase_migrations.schema_migrations (
        version text PRIMARY KEY,
        statements text[],
        name text,
        created_by text,
        idempotency_key text UNIQUE,
        rollback text[]
      );
    `);
    await ensureMigrationLedger(first);
    await ensureMigrationLedger(first);

    const { rows: canonicalColumns } = await first.query(`
      SELECT column_name
        FROM information_schema.columns
       WHERE table_schema = 'supabase_migrations'
         AND table_name = 'schema_migrations'
       ORDER BY ordinal_position
    `);
    assert.deepEqual(
      canonicalColumns.map((row) => row.column_name),
      ['version', 'statements', 'name', 'created_by', 'idempotency_key', 'rollback'],
      'runner bootstrap must not ALTER the Supabase-owned ledger',
    );
    const { rows: privateMetadata } = await first.query(`
      SELECT c.relrowsecurity, r.rolname AS owner
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_catalog.pg_roles r ON r.oid = c.relowner
       WHERE n.nspname = 'supabase_migrations'
         AND c.relname = 'antigravity_migration_integrity'
    `);
    assert.deepEqual(privateMetadata, [{ relrowsecurity: true, owner: 'postgres' }]);

    const lockName = await acquireMigrationAdvisoryLock(first, 'fixture-project');
    await assert.rejects(
      () => acquireMigrationAdvisoryLock(second, 'fixture-project'),
      (error) => error?.code === 'SQL_RUNNER_CONCURRENT_RUNNER_REFUSED',
    );
    await releaseMigrationAdvisoryLock(first, lockName);

    const atomic = migration('20260908210000_atomic.sql', 'CREATE TABLE public.atomic_side_effect(id integer);');
    await first.query('BEGIN');
    await first.query(atomic.sql);
    await insertMigrationLedgerEntry(first, atomic);
    await first.query('ROLLBACK');
    const { rows: atomicRollback } = await first.query(`
      SELECT to_regclass('public.atomic_side_effect') IS NULL AS side_effect_rolled_back,
             NOT EXISTS (
               SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = $1
             ) AS canonical_rolled_back,
             NOT EXISTS (
               SELECT 1 FROM supabase_migrations.antigravity_migration_integrity
                WHERE source_version = $1
             ) AS integrity_rolled_back
    `, [atomic.version]);
    assert.deepEqual(atomicRollback, [{
      side_effect_rolled_back: true,
      canonical_rolled_back: true,
      integrity_rolled_back: true,
    }]);

    const ambiguous = migration(
      '20260908210100_ambiguous.sql',
      'BEGIN; CREATE TABLE public.ambiguous_side_effect(id integer); COMMIT;',
    );
    await claimIndependentMigration(first, ambiguous);
    await first.query(ambiguous.sql);
    const ambiguousClaims = await getMigrationClaims(second, [ambiguous.version]);
    assert.throws(
      () => assertNoAmbiguousClaims(ambiguousClaims, [ambiguous]),
      (error) => error?.code === 'SQL_RUNNER_AMBIGUOUS_PRIOR_ATTEMPT',
    );
    assert.equal((await second.query("SELECT to_regclass('public.ambiguous_side_effect') IS NOT NULL AS exists")).rows[0].exists, true);

    const completed = migration(
      '20260908210200_completed.sql',
      'CREATE TABLE public.completed_side_effect(id integer);',
    );
    await claimIndependentMigration(first, completed);
    await first.query(completed.sql);
    await completeIndependentMigration(first, completed);
    const state = await getAppliedMigrations(first);
    assert.doesNotThrow(() => assertAppliedMigrationIntegrity(state, [completed]));
    const canonical = state.canonicalByVersion.get(completed.version);
    assert.equal(canonical.name, 'completed');
    assert.equal(canonical.created_by, 'antigravity_sql_push:v4');
    assert.equal(canonical.idempotency_key, `sha256:${completed.checksum}`);
  } finally {
    await Promise.allSettled(clients.map((client) => client.end()));
    if (serverStarted) {
      try { execFileSync(pgCtl, ['-D', data, '-m', 'fast', '-w', 'stop'], { stdio: 'ignore' }); } catch {}
    }
    rmSync(root, { recursive: true, force: true });
  }
});
