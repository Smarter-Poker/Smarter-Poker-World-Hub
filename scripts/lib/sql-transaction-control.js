'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const CANONICAL_MIGRATION_NAME = /^(\d{14})_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/;
const MIGRATION_LOCK_NAMESPACE = 'smarter-poker:antigravity-sql-push:v4';

function runnerError(code, message) {
    const error = new Error(`${code}: ${message}`);
    error.code = code;
    return error;
}

function parseCanonicalMigrationName(name) {
    const basename = path.basename(name);
    const match = basename.match(CANONICAL_MIGRATION_NAME);
    if (!match) {
        throw runnerError(
            'SQL_RUNNER_NONCANONICAL_MIGRATION_NAME',
            `${basename} must use the canonical 14-digit form YYYYMMDDHHMMSS_lowercase_name.sql`,
        );
    }
    return Object.freeze({ name: basename, version: match[1] });
}

function checksumSql(sql) {
    return crypto.createHash('sha256').update(sql, 'utf8').digest('hex');
}

function captureMigrationFiles(filePaths, {
    readFile = (filePath) => fs.readFileSync(filePath, 'utf8'),
    getName = (filePath) => path.basename(filePath),
} = {}) {
    return filePaths.map((filePath) => {
        const identity = parseCanonicalMigrationName(getName(filePath));
        const sql = readFile(filePath);
        return Object.freeze({
            filePath,
            name: identity.name,
            version: identity.version,
            checksum: checksumSql(sql),
            sql,
        });
    });
}

/**
 * Validate both the selected set and every selected file's directory. This is
 * intentionally narrower than trying to rehabilitate all historical names in
 * a legacy migration directory: an unrelated legacy collision must not hide a
 * collision for the migration the operator is about to execute.
 */
function assertUniqueMigrationIdentities(files, {
    readDirectory = (directory) => fs.readdirSync(directory),
    getDirectory = (file) => path.dirname(file.filePath),
} = {}) {
    const selected = new Map();
    for (const file of files) {
        const prior = selected.get(file.version);
        if (prior) {
            throw runnerError(
                'SQL_RUNNER_DUPLICATE_SELECTED_VERSION',
                `${file.version} is shared by ${prior.name} and ${file.name}`,
            );
        }
        selected.set(file.version, file);
    }

    const checked = new Set();
    for (const file of files) {
        const directory = getDirectory(file);
        const key = `${directory}\0${file.version}`;
        if (checked.has(key)) continue;
        checked.add(key);
        const siblings = readDirectory(directory)
            .filter((name) => name.endsWith('.sql') && name.startsWith(file.version));
        if (siblings.length !== 1 || siblings[0] !== file.name) {
            throw runnerError(
                'SQL_RUNNER_DUPLICATE_SIBLING_VERSION',
                `${file.version} must identify exactly ${file.name}; sibling matches: ${siblings.join(', ') || '(none)'}`,
            );
        }
    }
    return files;
}

/**
 * Return PostgreSQL top-level statements with comments and quoted payloads
 * erased. The output is for classification only; captured source bytes remain
 * the sole bytes sent to PostgreSQL.
 */
function topLevelSqlStatements(sql) {
    const statements = [];
    let statement = '';
    let index = 0;
    let state = 'normal';
    let dollarTag = null;
    let blockDepth = 0;
    let escapeString = false;
    const flushStatement = () => {
        const normalized = statement.trim().replace(/\s+/g, ' ');
        if (normalized) statements.push(normalized);
        statement = '';
    };

    while (index < sql.length) {
        const char = sql[index];
        const next = sql[index + 1];
        if (state === 'line-comment') {
            if (char === '\n' || char === '\r') {
                state = 'normal';
                statement += ' ';
            }
            index += 1;
            continue;
        }
        if (state === 'block-comment') {
            if (char === '/' && next === '*') {
                blockDepth += 1;
                index += 2;
            } else if (char === '*' && next === '/') {
                blockDepth -= 1;
                index += 2;
                if (blockDepth === 0) {
                    state = 'normal';
                    statement += ' ';
                }
            } else {
                index += 1;
            }
            continue;
        }
        if (state === 'single-quote') {
            if (char === "'" && next === "'") index += 2;
            else if (escapeString && char === '\\' && index + 1 < sql.length) index += 2;
            else if (char === "'") {
                state = 'normal';
                statement += ' value ';
                escapeString = false;
                index += 1;
            } else index += 1;
            continue;
        }
        if (state === 'double-quote') {
            if (char === '"' && next === '"') index += 2;
            else if (char === '"') {
                state = 'normal';
                statement += ' identifier ';
                index += 1;
            } else index += 1;
            continue;
        }
        if (state === 'dollar-quote') {
            if (sql.startsWith(dollarTag, index)) {
                index += dollarTag.length;
                state = 'normal';
                statement += ' value ';
            } else index += 1;
            continue;
        }
        if (char === '-' && next === '-') {
            state = 'line-comment';
            index += 2;
            continue;
        }
        if (char === '/' && next === '*') {
            state = 'block-comment';
            blockDepth = 1;
            index += 2;
            continue;
        }
        if (char === "'") {
            const prior = sql[index - 1];
            const beforePrior = sql[index - 2];
            escapeString = (prior === 'E' || prior === 'e')
                && (beforePrior === undefined
                    || !/[A-Za-z0-9_$\u0080-\u{10FFFF}]/u.test(beforePrior));
            state = 'single-quote';
            index += 1;
            continue;
        }
        if (char === '"') {
            state = 'double-quote';
            index += 1;
            continue;
        }
        if (char === '$') {
            const prior = sql[index - 1];
            const hasDollarQuoteBoundary = prior === undefined
                || !/[A-Za-z0-9_$\u0080-\u{10FFFF}]/u.test(prior);
            const match = hasDollarQuoteBoundary
                ? sql.slice(index).match(/^\$[A-Za-z_\u0080-\u{10FFFF}][A-Za-z0-9_\u0080-\u{10FFFF}]*\$|^\$\$/u)
                : null;
            if (match) {
                dollarTag = match[0];
                state = 'dollar-quote';
                index += dollarTag.length;
                statement += ' value ';
                continue;
            }
        }
        if (char === ';') {
            flushStatement();
            index += 1;
            continue;
        }
        statement += char;
        index += 1;
    }

    if (state !== 'normal' && state !== 'line-comment') {
        throw runnerError(
            'SQL_RUNNER_UNTERMINATED_SQL_TOKEN',
            `SQL ended inside ${state}; transaction classification is not trustworthy`,
        );
    }
    if (statement.trim()) flushStatement();
    return statements;
}

function isTransactionControl(statement) {
    return /^(?:begin(?:\s+(?:work|transaction))?\b|start\s+transaction\b|commit\b|end(?:\s+(?:work|transaction))?\b|rollback\b|abort(?:\s+(?:work|transaction))?\b|prepare\s+transaction\b)/i.test(statement);
}

function explicitTransactionStatements(sql) {
    return topLevelSqlStatements(sql).filter(isTransactionControl);
}

function transactionProhibitedStatements(sql) {
    return topLevelSqlStatements(sql).filter((statement) => (
        /^create\s+(?:unique\s+)?index\s+concurrently\b/i.test(statement)
        || /^drop\s+index\s+concurrently\b/i.test(statement)
        || /^reindex\b[\s\S]*\bconcurrently\b/i.test(statement)
        || /^vacuum\b/i.test(statement)
        || /^cluster\b/i.test(statement)
        || /^(?:create|drop)\s+database\b/i.test(statement)
        || /^(?:create|drop)\s+tablespace\b/i.test(statement)
        || /^alter\s+system\b/i.test(statement)
        || /^(?:create|drop)\s+subscription\b/i.test(statement)
        || /^call\b/i.test(statement)
    ));
}

function analyzeAuthoredTransactions(name, controls) {
    let inTransaction = false;
    let checkpoints = 0;
    for (const control of controls) {
        if (/^prepare\s+transaction\b/i.test(control)) {
            throw runnerError(
                'SQL_RUNNER_PREPARED_TRANSACTION_REFUSED',
                `${name} uses PREPARE TRANSACTION, which the runner cannot resolve safely`,
            );
        }
        if (/^(?:rollback|abort)\b/i.test(control)) {
            throw runnerError(
                'SQL_RUNNER_ROLLBACK_CHECKPOINT_REFUSED',
                `${name} contains ${control}; a discarded or partially replayed migration cannot be certified`,
            );
        }
        if (/^(?:begin(?:\s+(?:work|transaction))?|start\s+transaction)\b/i.test(control)) {
            if (inTransaction) {
                throw runnerError(
                    'SQL_RUNNER_NESTED_AUTHORED_TRANSACTION',
                    `${name} begins a transaction before its prior transaction commits`,
                );
            }
            inTransaction = true;
            continue;
        }
        if (/^(?:commit|end)(?:\s+(?:work|transaction))?\b/i.test(control)) {
            if (!inTransaction) {
                throw runnerError(
                    'SQL_RUNNER_UNMATCHED_TRANSACTION_TERMINATOR',
                    `${name} contains ${control} without a matching BEGIN`,
                );
            }
            inTransaction = false;
            checkpoints += 1;
        }
    }
    if (inTransaction) {
        throw runnerError(
            'SQL_RUNNER_UNCLOSED_AUTHORED_TRANSACTION',
            `${name} ends with an open transaction`,
        );
    }
    return checkpoints;
}

function analyzeMigrationFile(file) {
    const statements = topLevelSqlStatements(file.sql);
    const transactionStatements = statements.filter(isTransactionControl);
    const prohibitedStatements = transactionProhibitedStatements(file.sql);
    const checkpoints = analyzeAuthoredTransactions(file.name, transactionStatements);
    if (transactionStatements.length > 0 && prohibitedStatements.length > 0) {
        throw runnerError(
            'SQL_RUNNER_MIXED_TRANSACTION_MODES_REFUSED',
            `${file.name} mixes authored transaction control with transaction-prohibited SQL`,
        );
    }
    if (prohibitedStatements.length > 0 && statements.length !== 1) {
        throw runnerError(
            'SQL_RUNNER_NONTRANSACTIONAL_MULTI_STATEMENT_REFUSED',
            `${file.name} contains transaction-prohibited SQL plus other statements; one simple-query call would create an implicit transaction`,
        );
    }
    return Object.freeze({
        name: file.name,
        transactionStatements,
        prohibitedStatements,
        statementCount: statements.length,
        checkpoints,
    });
}

function planMigrationTransactions(files, { noTx = false } = {}) {
    const normalized = files.map(analyzeMigrationFile);
    const authored = normalized.filter((file) => file.transactionStatements.length > 0);
    const nonTransactional = normalized.filter((file) => file.prohibitedStatements.length > 0);
    if (!noTx && normalized.length > 1 && (authored.length > 0 || nonTransactional.length > 0)) {
        const unsafe = [...authored, ...nonTransactional]
            .map((file) => file.name)
            .filter((name, index, names) => names.indexOf(name) === index);
        throw runnerError(
            'SQL_RUNNER_NONATOMIC_BATCH_REFUSED',
            `an outer-atomic batch cannot include independently committed files (${unsafe.join(', ')}); apply individually or explicitly accept checkpoints with --no-tx`,
        );
    }
    if (noTx) {
        return Object.freeze({
            useOuterTransaction: false,
            mode: 'independent files (explicit --no-tx)',
            authored,
            nonTransactional,
            analyses: normalized,
        });
    }
    if (authored.length === 1) {
        return Object.freeze({
            useOuterTransaction: false,
            mode: 'migration-authored committed checkpoints (ambiguity journal required)',
            authored,
            nonTransactional,
            analyses: normalized,
        });
    }
    if (nonTransactional.length === 1) {
        return Object.freeze({
            useOuterTransaction: false,
            mode: 'single transaction-prohibited statement (ambiguity journal required)',
            authored,
            nonTransactional,
            analyses: normalized,
        });
    }
    return Object.freeze({
        useOuterTransaction: true,
        mode: normalized.length > 1
            ? 'runner-atomic multi-file transaction'
            : 'runner-atomic single-file transaction',
        authored,
        nonTransactional,
        analyses: normalized,
    });
}

async function assertSqlLexingAssumptions(client) {
    const { rows } = await client.query(`
        SELECT
            current_setting('standard_conforming_strings') AS standard_conforming_strings,
            current_setting('client_encoding') AS client_encoding
    `);
    const row = rows?.[0] || {};
    if (row.standard_conforming_strings !== 'on') {
        throw runnerError(
            'SQL_RUNNER_UNSUPPORTED_STANDARD_CONFORMING_STRINGS',
            'transaction-control scanning requires standard_conforming_strings=on',
        );
    }
    if (String(row.client_encoding || '').toUpperCase() !== 'UTF8') {
        throw runnerError(
            'SQL_RUNNER_UNSUPPORTED_CLIENT_ENCODING',
            `captured UTF-8 source requires client_encoding=UTF8 (received ${row.client_encoding || 'unknown'})`,
        );
    }
}

async function attestMigrationConnection(client, {
    expectedDatabase,
    expectedProjectRef,
    expectedUser = 'postgres',
    frontendTlsVerified = false,
    allowBackendTlsTermination = false,
} = {}) {
    const { rows } = await client.query(`
        SELECT
            current_database() AS database_name,
            current_user AS user_name,
            current_setting('server_version_num')::integer AS server_version_num,
            current_setting('server_encoding') AS server_encoding,
            current_setting('client_encoding') AS client_encoding,
            current_setting('standard_conforming_strings') AS standard_conforming_strings,
            current_setting('application_name') AS application_name,
            (SELECT datcollate
               FROM pg_catalog.pg_database
              WHERE datname = current_database()) AS datcollate,
            COALESCE((
                SELECT ssl FROM pg_catalog.pg_stat_ssl WHERE pid = pg_backend_pid()
            ), false) AS ssl
    `);
    const row = rows?.[0];
    if (!row) throw runnerError('SQL_RUNNER_CONNECTION_ATTESTATION_EMPTY', 'database returned no attestation row');
    if (row.database_name !== expectedDatabase) {
        throw runnerError('SQL_RUNNER_WRONG_DATABASE', `expected ${expectedDatabase}, received ${row.database_name}`);
    }
    if (row.user_name !== expectedUser) {
        throw runnerError('SQL_RUNNER_WRONG_DATABASE_USER', `expected ${expectedUser}, received ${row.user_name}`);
    }
    if (row.server_version_num < 170000 || row.server_version_num >= 180000) {
        throw runnerError('SQL_RUNNER_WRONG_POSTGRES_MAJOR', `PostgreSQL 17 is required; received server_version_num=${row.server_version_num}`);
    }
    if (String(row.server_encoding).toUpperCase() !== 'UTF8'
        || String(row.client_encoding).toUpperCase() !== 'UTF8') {
        throw runnerError(
            'SQL_RUNNER_WRONG_ENCODING',
            `server/client encodings must both be UTF8; received ${row.server_encoding}/${row.client_encoding}`,
        );
    }
    if (row.datcollate !== 'en_US.UTF-8') {
        throw runnerError(
            'SQL_RUNNER_WRONG_DATABASE_COLLATION',
            `database collation must match production en_US.UTF-8 (received ${row.datcollate || 'unknown'})`,
        );
    }
    if (row.standard_conforming_strings !== 'on') {
        throw runnerError('SQL_RUNNER_UNSUPPORTED_STANDARD_CONFORMING_STRINGS', 'standard_conforming_strings must be on');
    }
    if (frontendTlsVerified !== true) {
        throw runnerError('SQL_RUNNER_FRONTEND_TLS_ATTESTATION_FAILED', 'the client-facing PostgreSQL socket is not authenticated TLS');
    }
    if (row.ssl !== true && !allowBackendTlsTermination) {
        throw runnerError('SQL_RUNNER_TLS_ATTESTATION_FAILED', 'the direct PostgreSQL backend session is not encrypted');
    }
    const expectedApplicationName = `antigravity-sql-push:${expectedProjectRef}`;
    if (row.application_name !== expectedApplicationName) {
        throw runnerError(
            'SQL_RUNNER_PROJECT_ATTESTATION_FAILED',
            `expected application_name=${expectedApplicationName}, received ${row.application_name}`,
        );
    }
    return Object.freeze(row);
}

async function acquireMigrationAdvisoryLock(client, projectRef) {
    const lockName = `${MIGRATION_LOCK_NAMESPACE}:${projectRef}`;
    const { rows } = await client.query(
        'SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired',
        [lockName],
    );
    if (rows?.[0]?.acquired !== true) {
        throw runnerError(
            'SQL_RUNNER_CONCURRENT_RUNNER_REFUSED',
            `another migration runner holds the ${projectRef} session lock`,
        );
    }
    return lockName;
}

async function releaseMigrationAdvisoryLock(client, lockName) {
    const { rows } = await client.query(
        'SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS released',
        [lockName],
    );
    if (rows?.[0]?.released !== true) {
        throw runnerError('SQL_RUNNER_LOCK_RELEASE_FAILED', `session lock ${lockName} was not held`);
    }
}

async function ensureMigrationLedger(client) {
    const { rows } = await client.query(`
        SELECT column_name, data_type, udt_name
          FROM information_schema.columns
         WHERE table_schema = 'supabase_migrations'
           AND table_name = 'schema_migrations'
         ORDER BY ordinal_position
    `);
    const actual = new Map(rows.map((row) => [row.column_name, row]));
    const required = new Map([
        ['version', ['text', 'text']],
        ['statements', ['ARRAY', '_text']],
        ['name', ['text', 'text']],
        ['created_by', ['text', 'text']],
        ['idempotency_key', ['text', 'text']],
        ['rollback', ['ARRAY', '_text']],
    ]);
    for (const [column, [dataType, udtName]] of required) {
        const present = actual.get(column);
        if (!present || present.data_type !== dataType || present.udt_name !== udtName) {
            throw runnerError(
                'SQL_RUNNER_CANONICAL_LEDGER_SHAPE_MISMATCH',
                `supabase_migrations.schema_migrations must retain ${column} ${dataType}/${udtName}; the runner never alters this Supabase-owned table`,
            );
        }
    }
    if (actual.has('checksum')) {
        throw runnerError(
            'SQL_RUNNER_CANONICAL_LEDGER_REPURPOSED',
            'checksum must live in the runner-owned integrity ledger, not Supabase schema_migrations',
        );
    }
    const { rows: constraintRows } = await client.query(`
        SELECT
          EXISTS (
            SELECT 1
              FROM pg_catalog.pg_index i
              JOIN pg_catalog.pg_class t ON t.oid = i.indrelid
              JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace
              JOIN pg_catalog.pg_attribute a
                ON a.attrelid = t.oid AND a.attname = 'version'
             WHERE n.nspname = 'supabase_migrations'
               AND t.relname = 'schema_migrations'
               AND i.indisprimary
               AND i.indnkeyatts = 1
               AND i.indkey[0] = a.attnum
          ) AS version_is_primary_key,
          EXISTS (
            SELECT 1
              FROM pg_catalog.pg_index i
              JOIN pg_catalog.pg_class t ON t.oid = i.indrelid
              JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace
              JOIN pg_catalog.pg_attribute a
                ON a.attrelid = t.oid AND a.attname = 'idempotency_key'
             WHERE n.nspname = 'supabase_migrations'
               AND t.relname = 'schema_migrations'
               AND i.indisunique
               AND i.indnkeyatts = 1
               AND i.indkey[0] = a.attnum
          ) AS idempotency_key_is_unique
    `);
    if (constraintRows?.[0]?.version_is_primary_key !== true
        || constraintRows?.[0]?.idempotency_key_is_unique !== true) {
        throw runnerError(
            'SQL_RUNNER_CANONICAL_LEDGER_CONSTRAINT_MISMATCH',
            'schema_migrations requires a version primary key and a unique idempotency_key before runner writes',
        );
    }

    await client.query(`
        CREATE TABLE IF NOT EXISTS supabase_migrations.antigravity_migration_integrity (
            source_version text PRIMARY KEY,
            source_name text NOT NULL,
            checksum text NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
            state text NOT NULL CHECK (state IN ('in_progress', 'failed', 'applied')),
            started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
            completed_at timestamptz,
            error_code text,
            canonical_version text REFERENCES supabase_migrations.schema_migrations(version)
        );
        ALTER TABLE supabase_migrations.antigravity_migration_integrity ENABLE ROW LEVEL SECURITY;
        ALTER TABLE supabase_migrations.antigravity_migration_integrity OWNER TO postgres;
        REVOKE ALL ON TABLE supabase_migrations.antigravity_migration_integrity FROM PUBLIC;
        DO $acl$
        DECLARE role_name text;
        BEGIN
          FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
            IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = role_name) THEN
              EXECUTE format(
                'REVOKE ALL ON TABLE supabase_migrations.antigravity_migration_integrity FROM %I',
                role_name
              );
            END IF;
          END LOOP;
        END
        $acl$;
    `);
}

async function getAppliedMigrations(client) {
    const [canonicalResult, integrityResult] = await Promise.all([
        client.query(`
            SELECT version, name, created_by, idempotency_key
              FROM supabase_migrations.schema_migrations
             ORDER BY version
        `),
        client.query(`
            SELECT source_version, source_name, checksum, state, started_at,
                   completed_at, error_code, canonical_version
              FROM supabase_migrations.antigravity_migration_integrity
             ORDER BY source_version
        `),
    ]);
    const canonicalByVersion = new Map(canonicalResult.rows.map((row) => [String(row.version), Object.freeze(row)]));
    const canonicalByName = new Map();
    for (const row of canonicalResult.rows) {
        if (!row.name) continue;
        const rowsForName = canonicalByName.get(row.name) || [];
        rowsForName.push(Object.freeze(row));
        canonicalByName.set(row.name, rowsForName);
    }
    const canonicalBySemanticName = new Map();
    for (const row of canonicalResult.rows) {
        if (!row.name) continue;
        const semanticName = normalizeMigrationSemanticName(row.name);
        const rowsForName = canonicalBySemanticName.get(semanticName) || [];
        rowsForName.push(Object.freeze(row));
        canonicalBySemanticName.set(semanticName, rowsForName);
    }
    const integrityByVersion = new Map(integrityResult.rows.map((row) => [
        String(row.source_version),
        Object.freeze({ ...row, version: String(row.source_version), name: row.source_name }),
    ]));
    return Object.freeze({
        canonicalByVersion,
        canonicalByName,
        canonicalBySemanticName,
        integrityByVersion,
    });
}

function normalizeMigrationSemanticName(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/^\d{14}_?/, '')
        .replace(/\.sql$/, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .replace(/_+/g, '_');
}

function migrationSemanticName(file) {
    return normalizeMigrationSemanticName(file.name);
}

function assertLedgerEntryMatches(file, entry, canonicalEntry) {
    if (!entry) return false;
    if (entry.name !== file.name) {
        throw runnerError(
            'SQL_RUNNER_LEDGER_NAME_MISMATCH',
            `${file.version} is recorded as ${entry.name || '(unnamed)'}, not ${file.name}`,
        );
    }
    if (!entry.checksum) {
        throw runnerError(
            'SQL_RUNNER_LEDGER_CHECKSUM_MISSING',
            `${file.version}/${file.name} predates cryptographic runner attestation; do not assume the current bytes were applied`,
        );
    }
    if (String(entry.checksum).toLowerCase() !== file.checksum) {
        throw runnerError(
            'SQL_RUNNER_LEDGER_CHECKSUM_MISMATCH',
            `${file.version}/${file.name} checksum differs from the applied ledger entry`,
        );
    }
    if (entry.state !== 'applied') {
        throw runnerError(
            'SQL_RUNNER_AMBIGUOUS_PRIOR_ATTEMPT',
            `${file.version}/${file.name} has durable integrity state=${entry.state}; inspect postconditions before replay`,
        );
    }
    if (entry.canonical_version !== file.version || !canonicalEntry) {
        throw runnerError(
            'SQL_RUNNER_CANONICAL_LEDGER_LINK_MISSING',
            `${file.version}/${file.name} lacks its exact Supabase canonical-ledger link`,
        );
    }
    if (canonicalEntry.name !== migrationSemanticName(file)
        || canonicalEntry.created_by !== 'antigravity_sql_push:v4'
        || canonicalEntry.idempotency_key !== `sha256:${file.checksum}`) {
        throw runnerError(
            'SQL_RUNNER_CANONICAL_LEDGER_IDENTITY_MISMATCH',
            `${file.version}/${file.name} does not match its canonical Supabase ledger metadata`,
        );
    }
    return true;
}

function assertAppliedMigrationIntegrity(appliedMigrations, files) {
    for (const file of files) {
        const entry = appliedMigrations.integrityByVersion.get(file.version);
        const canonicalEntry = appliedMigrations.canonicalByVersion.get(file.version);
        if (entry) {
            assertLedgerEntryMatches(file, entry, canonicalEntry);
            continue;
        }
        const semanticMatches = appliedMigrations.canonicalBySemanticName.get(migrationSemanticName(file)) || [];
        if (canonicalEntry || semanticMatches.length > 0) {
            const matches = [canonicalEntry, ...semanticMatches]
                .filter(Boolean)
                .map((row) => `${row.version}/${row.name}`)
                .filter((value, index, values) => values.indexOf(value) === index);
            throw runnerError(
                'SQL_RUNNER_EXTERNAL_LEDGER_MATCH_REQUIRES_ATTESTATION',
                `${file.name} appears in the Supabase-owned ledger (${matches.join(', ')}) without a runner checksum; do not replay or auto-adopt it`,
            );
        }
    }
}

async function getMigrationClaims(client, versions) {
    if (versions.length === 0) return new Map();
    const { rows } = await client.query(
        `SELECT source_version, source_name, checksum, state, started_at, completed_at, error_code,
                canonical_version
           FROM supabase_migrations.antigravity_migration_integrity
          WHERE source_version = ANY($1::text[])
          ORDER BY source_version`,
        [versions],
    );
    return new Map(rows.map((row) => [String(row.source_version), Object.freeze({
        ...row,
        version: String(row.source_version),
        name: row.source_name,
    })]));
}

function assertNoAmbiguousClaims(claims, pendingFiles) {
    for (const file of pendingFiles) {
        const claim = claims.get(file.version);
        if (!claim) continue;
        if (claim.name !== file.name || claim.checksum !== file.checksum) {
            throw runnerError(
                'SQL_RUNNER_CLAIM_IDENTITY_MISMATCH',
                `${file.version} has a claim for different source bytes (${claim.name})`,
            );
        }
        throw runnerError(
            'SQL_RUNNER_AMBIGUOUS_PRIOR_ATTEMPT',
            `${file.version}/${file.name} has durable claim state=${claim.state}; inspect migration postconditions before any replay`,
        );
    }
}

async function claimIndependentMigration(client, file) {
    const result = await client.query(
        `INSERT INTO supabase_migrations.antigravity_migration_integrity
            (source_version, source_name, checksum, state)
         VALUES ($1, $2, $3, 'in_progress')
         ON CONFLICT DO NOTHING
         RETURNING source_version`,
        [file.version, file.name, file.checksum],
    );
    if (result.rowCount !== 1) {
        throw runnerError(
            'SQL_RUNNER_CLAIM_CONFLICT',
            `${file.version}/${file.name} could not acquire a durable execution claim`,
        );
    }
}

async function markIndependentMigrationFailed(client, file, errorCode) {
    const result = await client.query(
        `UPDATE supabase_migrations.antigravity_migration_integrity
            SET state = 'failed', completed_at = clock_timestamp(), error_code = $4
          WHERE source_version = $1 AND source_name = $2 AND checksum = $3 AND state = 'in_progress'`,
        [file.version, file.name, file.checksum, errorCode || null],
    );
    if (result.rowCount !== 1) {
        throw runnerError(
            'SQL_RUNNER_CLAIM_FAILURE_MARK_FAILED',
            `${file.version}/${file.name} no longer has its expected in-progress claim`,
        );
    }
}

async function insertMigrationLedgerEntry(client, file) {
    const result = await client.query(
        `INSERT INTO supabase_migrations.schema_migrations
            (version, statements, name, created_by, idempotency_key, rollback)
         VALUES ($1, ARRAY[$2]::text[], $3, 'antigravity_sql_push:v4', $4, ARRAY[]::text[])
         RETURNING version`,
        [file.version, file.sql, migrationSemanticName(file), `sha256:${file.checksum}`],
    );
    if (result.rowCount !== 1) {
        throw runnerError(
            'SQL_RUNNER_LEDGER_INSERT_NOT_CONFIRMED',
            `${file.version}/${file.name} did not produce exactly one ledger row`,
        );
    }
    const integrity = await client.query(
        `INSERT INTO supabase_migrations.antigravity_migration_integrity
            (source_version, source_name, checksum, state, completed_at, canonical_version)
         VALUES ($1, $2, $3, 'applied', clock_timestamp(), $1)
         RETURNING source_version`,
        [file.version, file.name, file.checksum],
    );
    if (integrity.rowCount !== 1) {
        throw runnerError(
            'SQL_RUNNER_INTEGRITY_INSERT_NOT_CONFIRMED',
            `${file.version}/${file.name} did not produce exactly one private integrity row`,
        );
    }
}

async function completeIndependentMigration(client, file) {
    await client.query('BEGIN');
    let commitAttempted = false;
    try {
        const canonical = await client.query(
            `INSERT INTO supabase_migrations.schema_migrations
                (version, statements, name, created_by, idempotency_key, rollback)
             VALUES ($1, ARRAY[$2]::text[], $3, 'antigravity_sql_push:v4', $4, ARRAY[]::text[])
             RETURNING version`,
            [file.version, file.sql, migrationSemanticName(file), `sha256:${file.checksum}`],
        );
        if (canonical.rowCount !== 1) {
            throw runnerError(
                'SQL_RUNNER_LEDGER_INSERT_NOT_CONFIRMED',
                `${file.version}/${file.name} did not produce exactly one canonical ledger row`,
            );
        }
        const result = await client.query(
            `UPDATE supabase_migrations.antigravity_migration_integrity
                SET state = 'applied', completed_at = clock_timestamp(), error_code = NULL,
                    canonical_version = $1
              WHERE source_version = $1 AND source_name = $2 AND checksum = $3 AND state = 'in_progress'`,
            [file.version, file.name, file.checksum],
        );
        if (result.rowCount !== 1) {
            throw runnerError(
                'SQL_RUNNER_CLAIM_COMPLETION_NOT_CONFIRMED',
                `${file.version}/${file.name} did not complete its exact in-progress claim`,
            );
        }
        commitAttempted = true;
        await client.query('COMMIT');
    } catch (error) {
        if (!commitAttempted && !String(error?.code || '').startsWith('08')) {
            await client.query('ROLLBACK').catch(() => {});
        }
        throw error;
    }
}

module.exports = {
    CANONICAL_MIGRATION_NAME,
    MIGRATION_LOCK_NAMESPACE,
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
    migrationSemanticName,
    normalizeMigrationSemanticName,
    parseCanonicalMigrationName,
    planMigrationTransactions,
    releaseMigrationAdvisoryLock,
    topLevelSqlStatements,
    transactionProhibitedStatements,
};
