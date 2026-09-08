import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  acquireMigrationAdvisoryLock,
  analyzeMigrationFile,
  assertAppliedMigrationIntegrity,
  assertLedgerEntryMatches,
  assertNoAmbiguousClaims,
  assertSqlLexingAssumptions,
  assertUniqueMigrationIdentities,
  attestMigrationConnection,
  captureMigrationFiles,
  checksumSql,
  claimIndependentMigration,
  completeIndependentMigration,
  ensureMigrationLedger,
  explicitTransactionStatements,
  getAppliedMigrations,
  getMigrationClaims,
  insertMigrationLedgerEntry,
  markIndependentMigrationFailed,
  parseCanonicalMigrationName,
  planMigrationTransactions,
  releaseMigrationAdvisoryLock,
  topLevelSqlStatements,
  transactionProhibitedStatements,
} = require('../scripts/lib/sql-transaction-control.js');

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(testDir);
const runnerPath = join(repoRoot, 'scripts', 'antigravity_sql_push.js');

function file(name, sql = 'SELECT 1;', directory = '/migrations') {
  const identity = parseCanonicalMigrationName(name);
  return Object.freeze({
    filePath: join(directory, name),
    name,
    version: identity.version,
    checksum: checksumSql(sql),
    sql,
  });
}

test('canonical capture binds exact 14-digit name, immutable bytes, version, and SHA-256', () => {
  let onDiskSql = 'SELECT 1;';
  const captured = captureMigrationFiles(['/migrations/20260908120000_one.sql'], {
    readFile: () => onDiskSql,
  });
  onDiskSql = 'COMMIT;';
  assert.equal(captured[0].sql, 'SELECT 1;');
  assert.equal(captured[0].version, '20260908120000');
  assert.equal(captured[0].checksum, checksumSql('SELECT 1;'));
  assert.equal(captured[0].checksum.length, 64);
  assert.equal(Object.isFrozen(captured[0]), true);
  assert.throws(() => { captured[0].sql = onDiskSql; }, TypeError);

  for (const invalid of [
    '.template.sql',
    'ZZZZ_snapshot_home_games_schema.sql',
    '20260908_short.sql',
    '20260908120000_Uppercase.sql',
    '20260908120000_double__separator.sql',
    '202609081200001_too_many_digits.sql',
  ]) {
    assert.throws(
      () => parseCanonicalMigrationName(invalid),
      (error) => error?.code === 'SQL_RUNNER_NONCANONICAL_MIGRATION_NAME',
      invalid,
    );
  }
});

test('selected and repository-sibling version collisions fail before any database work', () => {
  const first = file('20260908120000_first.sql');
  const duplicate = file('20260908120000_second.sql');
  assert.throws(
    () => assertUniqueMigrationIdentities([first, duplicate], {
      readDirectory: () => [first.name, duplicate.name],
    }),
    (error) => error?.code === 'SQL_RUNNER_DUPLICATE_SELECTED_VERSION',
  );

  assert.throws(
    () => assertUniqueMigrationIdentities([first], {
      readDirectory: () => [first.name, duplicate.name],
    }),
    (error) => error?.code === 'SQL_RUNNER_DUPLICATE_SIBLING_VERSION'
      && /first\.sql/.test(error.message)
      && /second\.sql/.test(error.message),
  );
  assert.doesNotThrow(() => assertUniqueMigrationIdentities([first], {
    readDirectory: () => [first.name, '20260908120100_unrelated.sql'],
  }));
});

test('SQL lexer sees top-level controls while ignoring comments, identifiers, strings, and procedures', () => {
  assert.deepEqual(
    explicitTransactionStatements('BEGIN; SELECT 1; COMMIT; BEGIN TRANSACTION; COMMIT;'),
    ['BEGIN', 'COMMIT', 'BEGIN TRANSACTION', 'COMMIT'],
  );
  assert.deepEqual(explicitTransactionStatements(String.raw`
    -- BEGIN;
    /* COMMIT; */
    CREATE FUNCTION public.example() RETURNS void LANGUAGE plpgsql AS $body$
    BEGIN
      PERFORM 'ROLLBACK;';
    END;
    $body$;
    SELECT 'BEGIN; COMMIT;', "ROLLBACK";
  `), []);
  assert.deepEqual(explicitTransactionStatements(String.raw`SELECT E'it\'s data'; COMMIT;`), ['COMMIT']);
  assert.deepEqual(explicitTransactionStatements('SELECT 1; -- CR newline\rCOMMIT;'), ['COMMIT']);
  assert.deepEqual(explicitTransactionStatements("SELECT $é$'$é$; COMMIT;"), ['COMMIT']);
  assert.deepEqual(explicitTransactionStatements('SELECT 1 AS foo$bar$baz; COMMIT;'), ['COMMIT']);
  assert.throws(
    () => topLevelSqlStatements("SELECT 'unterminated"),
    (error) => error?.code === 'SQL_RUNNER_UNTERMINATED_SQL_TOKEN',
  );
  assert.throws(
    () => topLevelSqlStatements('SELECT 1; /* unterminated'),
    (error) => error?.code === 'SQL_RUNNER_UNTERMINATED_SQL_TOKEN',
  );
});

test('authored transaction plans accept only balanced BEGIN/COMMIT checkpoints', () => {
  const balanced = file(
    '20260908120000_balanced.sql',
    'BEGIN; SELECT 1; COMMIT; BEGIN TRANSACTION; SELECT 2; END WORK;',
  );
  const analysis = analyzeMigrationFile(balanced);
  assert.equal(analysis.checkpoints, 2);
  assert.equal(
    planMigrationTransactions([balanced]).mode,
    'migration-authored committed checkpoints (ambiguity journal required)',
  );

  const unsafe = [
    ['20260908120100_open.sql', 'BEGIN; SELECT 1;', 'SQL_RUNNER_UNCLOSED_AUTHORED_TRANSACTION'],
    ['20260908120200_nested.sql', 'BEGIN; BEGIN; COMMIT;', 'SQL_RUNNER_NESTED_AUTHORED_TRANSACTION'],
    ['20260908120300_unmatched.sql', 'SELECT 1; COMMIT;', 'SQL_RUNNER_UNMATCHED_TRANSACTION_TERMINATOR'],
    ['20260908120400_rollback.sql', 'BEGIN; SELECT 1; ROLLBACK;', 'SQL_RUNNER_ROLLBACK_CHECKPOINT_REFUSED'],
    ['20260908120500_abort.sql', 'BEGIN; ABORT WORK;', 'SQL_RUNNER_ROLLBACK_CHECKPOINT_REFUSED'],
    ['20260908120600_prepare.sql', "BEGIN; PREPARE TRANSACTION 'x';", 'SQL_RUNNER_PREPARED_TRANSACTION_REFUSED'],
  ];
  for (const [name, sql, code] of unsafe) {
    assert.throws(
      () => planMigrationTransactions([file(name, sql)]),
      (error) => error?.code === code,
      name,
    );
  }
});

test('transaction-prohibited SQL is classified and never hidden inside an implicit multi-statement query', () => {
  const patterns = [
    'CREATE INDEX CONCURRENTLY idx ON public.t (id);',
    'CREATE UNIQUE INDEX CONCURRENTLY idx ON public.t (id);',
    'DROP INDEX CONCURRENTLY public.idx;',
    'REINDEX INDEX CONCURRENTLY public.idx;',
    'VACUUM public.t;',
    'CLUSTER public.t USING idx;',
    'CREATE DATABASE unsafe;',
    "ALTER SYSTEM SET work_mem = '4MB';",
  ];
  for (const [index, sql] of patterns.entries()) {
    const candidate = file(`2026090813${String(index).padStart(4, '0')}_nontransactional.sql`, sql);
    assert.equal(transactionProhibitedStatements(sql).length, 1, sql);
    assert.equal(planMigrationTransactions([candidate]).useOuterTransaction, false, sql);
  }
  assert.throws(
    () => planMigrationTransactions([file(
      '20260908140000_implicit_transaction.sql',
      'SET statement_timeout = 0; CREATE INDEX CONCURRENTLY idx ON public.t (id);',
    )]),
    (error) => error?.code === 'SQL_RUNNER_NONTRANSACTIONAL_MULTI_STATEMENT_REFUSED',
  );
  assert.deepEqual(transactionProhibitedStatements(String.raw`
    -- CREATE INDEX CONCURRENTLY fake ON t (id);
    SELECT 'VACUUM';
  `), []);
});

test('the real PNM concurrent-index migration is recognized as one independent statement', () => {
  const name = '20260908023000_pnm_daily_tournaments_read_in_buy_in_order.sql';
  const sql = readFileSync(join(repoRoot, 'supabase', 'migrations', name), 'utf8');
  const candidate = file(name, sql, join(repoRoot, 'supabase', 'migrations'));
  const analysis = analyzeMigrationFile(candidate);
  assert.equal(analysis.statementCount, 1);
  assert.equal(analysis.prohibitedStatements.length, 1);
  assert.equal(planMigrationTransactions([candidate]).useOuterTransaction, false);
});

test('outer-atomic multi-file plans reject independently committed members unless explicitly requested', () => {
  const ordinary = file('20260908150000_ordinary.sql');
  const authored = file('20260908150100_authored.sql', 'BEGIN; SELECT 1; COMMIT;');
  const concurrent = file(
    '20260908150200_concurrent.sql',
    'CREATE INDEX CONCURRENTLY idx ON public.t (id);',
  );
  for (const independent of [authored, concurrent]) {
    assert.throws(
      () => planMigrationTransactions([ordinary, independent]),
      (error) => error?.code === 'SQL_RUNNER_NONATOMIC_BATCH_REFUSED'
        && error.message.includes(independent.name),
    );
  }
  const explicit = planMigrationTransactions([ordinary, authored, concurrent], { noTx: true });
  assert.equal(explicit.useOuterTransaction, false);
  assert.equal(explicit.mode, 'independent files (explicit --no-tx)');
  assert.equal(planMigrationTransactions([ordinary]).useOuterTransaction, true);
});

test('parser-critical connection assumptions require standard strings and UTF8 on every boundary', async () => {
  const supported = {
    query: async (sql) => {
      assert.match(sql, /standard_conforming_strings/);
      assert.match(sql, /client_encoding/);
      return { rows: [{ standard_conforming_strings: 'on', client_encoding: 'UTF8' }] };
    },
  };
  await assert.doesNotReject(() => assertSqlLexingAssumptions(supported));
  for (const row of [
    { standard_conforming_strings: 'off', client_encoding: 'UTF8' },
    { standard_conforming_strings: 'on', client_encoding: 'LATIN1' },
    {},
  ]) {
    const client = { query: async () => ({ rows: [row] }) };
    await assert.rejects(() => assertSqlLexingAssumptions(client), /SQL_RUNNER_/);
  }
});

test('connection attestation binds database owner, PostgreSQL 17, UTF8, TLS, and project application name', async () => {
  const validRow = {
    database_name: 'postgres',
    user_name: 'postgres',
    server_version_num: 170006,
    server_encoding: 'UTF8',
    client_encoding: 'UTF8',
    standard_conforming_strings: 'on',
    application_name: 'antigravity-sql-push:kuklfnapbkmacvwxktbh',
    datcollate: 'en_US.UTF-8',
    ssl: true,
  };
  const options = {
    expectedDatabase: 'postgres',
    expectedProjectRef: 'kuklfnapbkmacvwxktbh',
    expectedUser: 'postgres',
    frontendTlsVerified: true,
  };
  await assert.doesNotReject(() => attestMigrationConnection({
    query: async () => ({ rows: [validRow] }),
  }, options));

  const mutations = [
    ['database_name', 'wrong', 'SQL_RUNNER_WRONG_DATABASE'],
    ['user_name', 'authenticated', 'SQL_RUNNER_WRONG_DATABASE_USER'],
    ['server_version_num', 160010, 'SQL_RUNNER_WRONG_POSTGRES_MAJOR'],
    ['server_version_num', 180001, 'SQL_RUNNER_WRONG_POSTGRES_MAJOR'],
    ['server_encoding', 'LATIN1', 'SQL_RUNNER_WRONG_ENCODING'],
    ['client_encoding', 'LATIN1', 'SQL_RUNNER_WRONG_ENCODING'],
    ['standard_conforming_strings', 'off', 'SQL_RUNNER_UNSUPPORTED_STANDARD_CONFORMING_STRINGS'],
    ['datcollate', 'C', 'SQL_RUNNER_WRONG_DATABASE_COLLATION'],
    ['ssl', false, 'SQL_RUNNER_TLS_ATTESTATION_FAILED'],
    ['application_name', 'other-project', 'SQL_RUNNER_PROJECT_ATTESTATION_FAILED'],
  ];
  for (const [key, value, code] of mutations) {
    const client = { query: async () => ({ rows: [{ ...validRow, [key]: value }] }) };
    await assert.rejects(
      () => attestMigrationConnection(client, options),
      (error) => error?.code === code,
      `${key}=${value}`,
    );
  }
  await assert.rejects(
    () => attestMigrationConnection({ query: async () => ({ rows: [validRow] }) }, {
      ...options, frontendTlsVerified: false,
    }),
    (error) => error?.code === 'SQL_RUNNER_FRONTEND_TLS_ATTESTATION_FAILED',
  );
  await assert.doesNotReject(
    () => attestMigrationConnection({
      query: async () => ({ rows: [{ ...validRow, ssl: false }] }),
    }, { ...options, allowBackendTlsTermination: true }),
  );
});

test('session advisory lock fails fast on a concurrent runner and release is checked', async () => {
  const queries = [];
  const client = {
    query: async (sql, params) => {
      queries.push({ sql, params });
      if (sql.includes('pg_try_advisory_lock')) return { rows: [{ acquired: true }] };
      return { rows: [{ released: true }] };
    },
  };
  const lockName = await acquireMigrationAdvisoryLock(client, 'kuklfnapbkmacvwxktbh');
  await releaseMigrationAdvisoryLock(client, lockName);
  assert.equal(queries.length, 2);
  assert.equal(queries[0].params[0], lockName);
  await assert.rejects(
    () => acquireMigrationAdvisoryLock({ query: async () => ({ rows: [{ acquired: false }] }) }, 'kuklfnapbkmacvwxktbh'),
    (error) => error?.code === 'SQL_RUNNER_CONCURRENT_RUNNER_REFUSED',
  );
});

test('ledger bootstrap is fail-closed and applied reads retain exact identity data', async () => {
  let writes = 0;
  await assert.rejects(
    () => ensureMigrationLedger({
      query: async () => {
        writes += 1;
        throw Object.assign(new Error('denied'), { code: '42501' });
      },
    }),
    (error) => error?.code === '42501',
  );
  assert.equal(writes, 1);

  const canonicalShape = [
    ['version', 'text', 'text'],
    ['statements', 'ARRAY', '_text'],
    ['name', 'text', 'text'],
    ['created_by', 'text', 'text'],
    ['idempotency_key', 'text', 'text'],
    ['rollback', 'ARRAY', '_text'],
  ].map(([column_name, data_type, udt_name]) => ({ column_name, data_type, udt_name }));
  const bootstrapQueries = [];
  await ensureMigrationLedger({
    query: async (sql) => {
      bootstrapQueries.push(sql);
      if (sql.includes('information_schema.columns')) return { rows: canonicalShape };
      if (sql.includes('version_is_primary_key')) {
        return { rows: [{ version_is_primary_key: true, idempotency_key_is_unique: true }] };
      }
      return { rows: [] };
    },
  });
  assert.equal(bootstrapQueries.length, 3);
  assert.doesNotMatch(bootstrapQueries[2], /ALTER TABLE supabase_migrations\.schema_migrations/);
  assert.match(bootstrapQueries[2], /antigravity_migration_integrity/);
  assert.match(bootstrapQueries[2], /OWNER TO postgres/);
  assert.match(bootstrapQueries[2], /REVOKE ALL/);
  await assert.rejects(
    () => ensureMigrationLedger({ query: async (sql) => {
      if (sql.includes('information_schema.columns')) return { rows: canonicalShape };
      return { rows: [{ version_is_primary_key: true, idempotency_key_is_unique: false }] };
    } }),
    (error) => error?.code === 'SQL_RUNNER_CANONICAL_LEDGER_CONSTRAINT_MISMATCH',
  );
  await assert.rejects(
    () => ensureMigrationLedger({ query: async (sql) => ({
      rows: sql.includes('information_schema.columns')
        ? canonicalShape.filter((row) => row.column_name !== 'rollback')
        : [],
    }) }),
    (error) => error?.code === 'SQL_RUNNER_CANONICAL_LEDGER_SHAPE_MISMATCH',
  );

  const applied = await getAppliedMigrations({
    query: async (sql) => {
      if (sql.includes('schema_migrations')) {
        return { rows: [{
          version: '20260908160000',
          name: 'one',
          created_by: 'antigravity_sql_push:v4',
          idempotency_key: `sha256:${'a'.repeat(64)}`,
        }] };
      }
      return { rows: [{
        source_version: '20260908160000',
        source_name: '20260908160000_one.sql',
        checksum: 'a'.repeat(64),
        state: 'applied',
        canonical_version: '20260908160000',
      }] };
    },
  });
  assert.deepEqual(applied.integrityByVersion.get('20260908160000'), {
    source_version: '20260908160000',
    source_name: '20260908160000_one.sql',
    version: '20260908160000',
    name: '20260908160000_one.sql',
    checksum: 'a'.repeat(64),
    state: 'applied',
    canonical_version: '20260908160000',
  });
  for (const code of ['42501', '57014', '08006', 'XX001']) {
    await assert.rejects(
      () => getAppliedMigrations({ query: async () => { throw Object.assign(new Error('read failed'), { code }); } }),
      (error) => error?.code === code,
    );
  }
});

test('applied ledger entries require exact name and SHA-256, including force-style inspection', () => {
  const candidate = file('20260908160000_one.sql');
  const exact = {
    version: candidate.version,
    name: candidate.name,
    checksum: candidate.checksum,
    state: 'applied',
    canonical_version: candidate.version,
  };
  const canonical = {
    version: candidate.version,
    name: 'one',
    created_by: 'antigravity_sql_push:v4',
    idempotency_key: `sha256:${candidate.checksum}`,
  };
  assert.equal(assertLedgerEntryMatches(candidate, exact, canonical), true);
  assert.equal(assertLedgerEntryMatches(candidate, undefined), false);
  assert.doesNotThrow(() => assertAppliedMigrationIntegrity({
    integrityByVersion: new Map([[candidate.version, exact]]),
    canonicalByVersion: new Map([[candidate.version, canonical]]),
    canonicalByName: new Map([['one', [canonical]]]),
    canonicalBySemanticName: new Map([['one', [canonical]]]),
  }, [candidate]));
  for (const [entry, code] of [
    [{ ...exact, name: '20260908160000_other.sql' }, 'SQL_RUNNER_LEDGER_NAME_MISMATCH'],
    [{ ...exact, checksum: null }, 'SQL_RUNNER_LEDGER_CHECKSUM_MISSING'],
    [{ ...exact, checksum: 'b'.repeat(64) }, 'SQL_RUNNER_LEDGER_CHECKSUM_MISMATCH'],
  ]) {
    assert.throws(
      () => assertLedgerEntryMatches(candidate, entry, canonical),
      (error) => error?.code === code,
    );
  }
  assert.throws(() => assertAppliedMigrationIntegrity({
    integrityByVersion: new Map(),
    canonicalByVersion: new Map(),
    canonicalByName: new Map([['one', [{ version: 'generated', name: 'one' }]]]),
    canonicalBySemanticName: new Map([['one', [{ version: 'generated', name: 'one' }]]]),
  }, [candidate]), (error) => error?.code === 'SQL_RUNNER_EXTERNAL_LEDGER_MATCH_REQUIRES_ATTESTATION');
});

test('ledger insert cannot report success after an ON CONFLICT-style zero-row result', async () => {
  const candidate = file('20260908170000_one.sql');
  const calls = [];
  const success = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      return { rowCount: 1, rows: [{ version: candidate.version }] };
    },
  };
  await insertMigrationLedgerEntry(success, candidate);
  assert.doesNotMatch(calls[0].sql, /ON CONFLICT/i);
  assert.deepEqual(calls[0].params, [
    candidate.version,
    candidate.sql,
    'one',
    `sha256:${candidate.checksum}`,
  ]);
  assert.match(calls[1].sql, /antigravity_migration_integrity/);
  assert.deepEqual(calls[1].params, [candidate.version, candidate.name, candidate.checksum]);
  await assert.rejects(
    () => insertMigrationLedgerEntry({ query: async () => ({ rowCount: 0, rows: [] }) }, candidate),
    (error) => error?.code === 'SQL_RUNNER_LEDGER_INSERT_NOT_CONFIRMED',
  );
});

test('independent execution claims make crash and disconnect ambiguity durable and non-replayable', async () => {
  const candidate = file('20260908180000_checkpointed.sql', 'BEGIN; SELECT 1; COMMIT;');
  const claimRows = [{
    source_version: candidate.version,
    source_name: candidate.name,
    checksum: candidate.checksum,
    state: 'in_progress',
  }];
  const claims = await getMigrationClaims({ query: async () => ({ rows: claimRows }) }, [candidate.version]);
  assert.throws(
    () => assertNoAmbiguousClaims(claims, [candidate]),
    (error) => error?.code === 'SQL_RUNNER_AMBIGUOUS_PRIOR_ATTEMPT',
  );
  assert.throws(
    () => assertNoAmbiguousClaims(new Map([[candidate.version, {
      ...claimRows[0], checksum: 'b'.repeat(64),
    }]]), [candidate]),
    (error) => error?.code === 'SQL_RUNNER_CLAIM_IDENTITY_MISMATCH',
  );

  await assert.rejects(
    () => claimIndependentMigration({ query: async () => ({ rowCount: 0, rows: [] }) }, candidate),
    (error) => error?.code === 'SQL_RUNNER_CLAIM_CONFLICT',
  );
  await assert.rejects(
    () => markIndependentMigrationFailed({ query: async () => ({ rowCount: 0 }) }, candidate, '08006'),
    (error) => error?.code === 'SQL_RUNNER_CLAIM_FAILURE_MARK_FAILED',
  );
});

test('independent completion commits ledger and claim state together, and rolls both back on failure', async () => {
  const candidate = file('20260908190000_concurrent_index.sql', 'CREATE INDEX CONCURRENTLY idx ON t (id);');
  const calls = [];
  const client = {
    query: async (sql) => {
      calls.push(sql.trim());
      if (/^UPDATE/.test(sql.trim())) return { rowCount: 1 };
      if (/^INSERT/.test(sql.trim())) return { rowCount: 1, rows: [{ version: candidate.version }] };
      return { rowCount: null, rows: [] };
    },
  };
  await completeIndependentMigration(client, candidate);
  assert.equal(calls[0], 'BEGIN');
  assert.match(calls[1], /^INSERT INTO supabase_migrations\.schema_migrations/);
  assert.match(calls[2], /^UPDATE supabase_migrations\.antigravity_migration_integrity/);
  assert.equal(calls[3], 'COMMIT');

  const failedCalls = [];
  await assert.rejects(() => completeIndependentMigration({
    query: async (sql) => {
      failedCalls.push(sql.trim());
      if (/^INSERT/.test(sql.trim())) throw Object.assign(new Error('duplicate'), { code: '23505' });
      return { rows: [] };
    },
  }, candidate), (error) => error?.code === '23505');
  assert.deepEqual(failedCalls, ['BEGIN', failedCalls[1], 'ROLLBACK']);

  const ambiguousCommitCalls = [];
  await assert.rejects(() => completeIndependentMigration({
    query: async (sql) => {
      const normalized = sql.trim();
      ambiguousCommitCalls.push(normalized);
      if (normalized === 'COMMIT') throw Object.assign(new Error('socket lost'), { code: '08006' });
      if (/^INSERT/.test(normalized)) return { rowCount: 1, rows: [{}] };
      if (/^UPDATE/.test(normalized)) return { rowCount: 1 };
      return { rows: [] };
    },
  }, candidate), (error) => error?.code === '08006');
  assert.equal(ambiguousCommitCalls.at(-1), 'COMMIT');
  assert.equal(ambiguousCommitCalls.includes('ROLLBACK'), false, 'an ambiguous/dead COMMIT is never rolled back or retried blindly');
});

test('dry run performs the same immutable identity and transaction preflight without loading credentials', () => {
  const directory = mkdtempSync(join(tmpdir(), 'sql-runner-preflight-'));
  try {
    const safePath = join(directory, '20260908200000_safe.sql');
    writeFileSync(safePath, 'SELECT 1;', 'utf8');
    const result = spawnSync(process.execPath, [runnerPath, '--dry-run', safePath], {
      cwd: repoRoot,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        NODE_PATH: process.env.NODE_PATH,
      },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /runner-atomic single-file transaction/);
    assert.match(result.stdout, new RegExp(checksumSql('SELECT 1;')));
    assert.match(result.stdout, /No credentials loaded and no database connection made/);

    const unsafePath = join(directory, '20260908200100_unsafe.sql');
    writeFileSync(
      unsafePath,
      'SET statement_timeout = 0; CREATE INDEX CONCURRENTLY idx ON public.t (id);',
      'utf8',
    );
    const unsafe = spawnSync(process.execPath, [runnerPath, '--dry-run', unsafePath], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    assert.equal(unsafe.status, 1);
    assert.match(unsafe.stderr, /SQL_RUNNER_NONTRANSACTIONAL_MULTI_STATEMENT_REFUSED/);

    const template = join(directory, '.template.sql');
    writeFileSync(template, 'SELECT 1;', 'utf8');
    const directoryRun = spawnSync(process.execPath, [runnerPath, '--dry-run', directory], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    assert.equal(directoryRun.status, 1);
    assert.match(directoryRun.stderr, /SQL_RUNNER_NONCANONICAL_MIGRATION_NAME/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('runner source has no transaction-pooler fallback, TLS downgrade, blind SQL retry, or dead-client rollback loop', () => {
  const runner = readFileSync(runnerPath, 'utf8');
  assert.match(runner, /port === 6543[\s\S]*?SQL_RUNNER_TRANSACTION_POOLER_REFUSED/);
  assert.match(runner, /rejectUnauthorized: true/);
  assert.match(runner, /SUPABASE_DB_CA_CERT/);
  assert.match(runner, /80:70:25:AD:50:D4:ED:21/);
  assert.doesNotMatch(runner, /rejectUnauthorized:\s*false/);
  assert.doesNotMatch(runner, /MAX_SQL_RETRIES|TRANSIENT_CODES|canRetryMigrationFileAfterTransientFailure/);
  const executeSource = runner.slice(
    runner.indexOf('async function executeSqlFile'),
    runner.indexOf('function writeDeployLog'),
  );
  assert.doesNotMatch(executeSource, /for\s*\([^)]*attempt|ROLLBACK|fs\.readFileSync/);
  assert.match(runner, /acquireMigrationAdvisoryLock[\s\S]*?ensureMigrationLedger[\s\S]*?getAppliedMigrations/);
  assert.match(runner, /assertAppliedMigrationIntegrity[\s\S]*?pendingFiles/);
  assert.match(runner, /claimIndependentMigration[\s\S]*?executeSqlFile[\s\S]*?completeIndependentMigration/);
});

test('the Phase 6 checkpoint migration remains recognizable and canonical', () => {
  const name = '20260907202000_training_streak_out_of_order_completion.sql';
  const sql = readFileSync(join(repoRoot, 'supabase', 'migrations', name), 'utf8');
  const candidate = file(name, sql, join(repoRoot, 'supabase', 'migrations'));
  const analysis = analyzeMigrationFile(candidate);
  assert.equal(analysis.checkpoints, 3);
  assert.deepEqual(
    analysis.transactionStatements,
    ['BEGIN', 'COMMIT', 'BEGIN', 'COMMIT', 'BEGIN', 'COMMIT'],
  );
  assert.equal(planMigrationTransactions([candidate]).useOuterTransaction, false);
});

test('runner and helper remain syntactically valid CommonJS programs', () => {
  execFileSync(process.execPath, ['--check', runnerPath], { cwd: repoRoot });
  execFileSync(process.execPath, ['--check', join(repoRoot, 'scripts', 'lib', 'sql-transaction-control.js')], { cwd: repoRoot });
});
