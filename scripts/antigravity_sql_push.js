#!/usr/bin/env node
// Hardened, fail-closed Supabase SQL migration runner.
//
// Usage:
//   npm run db:push -- <canonical_migration.sql>
//   npm run db:push -- --dry-run <canonical_migration.sql>
//   npm run db:push -- --status <canonical_migration.sql>
//
// A directory is accepted only when every selected SQL file has a canonical,
// unique 14-digit migration identity and the resulting transaction plan is
// safe. Historical mixed-format directories should be inspected with purpose-
// built inventory tooling, not executed wholesale.

'use strict';

const fs = require('fs');
const path = require('path');
const { X509Certificate } = require('crypto');
const { Pool } = require('pg');
const {
    acquireMigrationAdvisoryLock,
    assertAppliedMigrationIntegrity,
    assertNoAmbiguousClaims,
    assertSqlLexingAssumptions,
    assertUniqueMigrationIdentities,
    attestMigrationConnection,
    captureMigrationFiles,
    claimIndependentMigration,
    completeIndependentMigration,
    ensureMigrationLedger,
    getAppliedMigrations,
    getMigrationClaims,
    insertMigrationLedgerEntry,
    markIndependentMigrationFailed,
    planMigrationTransactions,
    releaseMigrationAdvisoryLock,
} = require('./lib/sql-transaction-control');

function loadEnvironment() {
    const dotenvPaths = [
        path.resolve(__dirname, '..', '.env.local'),
        path.resolve(__dirname, '..', '.env.prod'),
        path.resolve(__dirname, '..', '.env.production.local'),
        path.resolve(__dirname, '..', '.env.production'),
    ];
    try {
        const dotenv = require('dotenv');
        for (const envPath of dotenvPaths) {
            if (fs.existsSync(envPath)) {
                dotenv.config({ path: envPath });
                break;
            }
        }
    } catch (_) {}
}

const rawArgs = process.argv.slice(2);
const flags = Object.freeze({
    dryRun: rawArgs.includes('--dry-run'),
    verbose: rawArgs.includes('--verbose'),
    noTx: rawArgs.includes('--no-tx'),
    force: rawArgs.includes('--force'),
    status: rawArgs.includes('--status'),
});
const knownFlags = new Set(['--dry-run', '--verbose', '--no-tx', '--force', '--status']);
const unknownFlags = rawArgs.filter((arg) => arg.startsWith('--') && !knownFlags.has(arg));
const positionalArgs = rawArgs.filter((arg) => !arg.startsWith('--'));

if (unknownFlags.length > 0 || positionalArgs.length !== 1) {
    console.error('Usage: npm run db:push -- [--dry-run|--status|--verbose|--no-tx|--force] <canonical SQL file or safe directory>');
    if (unknownFlags.length > 0) console.error(`Unknown flags: ${unknownFlags.join(', ')}`);
    process.exit(1);
}

function resolveSqlFiles(targetPath) {
    let stat;
    try {
        stat = fs.statSync(targetPath);
    } catch {
        throw Object.assign(new Error(`Path not found: ${targetPath}`), { code: 'SQL_RUNNER_PATH_NOT_FOUND' });
    }
    const files = stat.isDirectory()
        ? fs.readdirSync(targetPath)
            .filter((name) => name.endsWith('.sql'))
            .map((name) => path.join(targetPath, name))
            .sort()
        : [targetPath];
    if (files.length === 0) {
        throw Object.assign(new Error(`No SQL files found at ${targetPath}`), { code: 'SQL_RUNNER_NO_FILES' });
    }
    return files;
}

function preflightMigrationFiles(sqlFiles) {
    const files = captureMigrationFiles(sqlFiles);
    assertUniqueMigrationIdentities(files);
    // Analyze every selected file now, before credentials or a network
    // connection are touched. Execution consumes these exact captured bytes.
    const transactionPlan = planMigrationTransactions(files, { noTx: flags.noTx });
    return Object.freeze({ files: Object.freeze(files), transactionPlan });
}

function projectRefFromUrl(value) {
    if (!value) return null;
    try {
        const url = new URL(value);
        const match = url.hostname.match(/^([a-z0-9]+)\.supabase\.co$/i);
        return url.protocol === 'https:' && match ? match[1] : null;
    } catch {
        return null;
    }
}

function resolveProjectRef(env = process.env) {
    const explicit = env.SUPABASE_PROJECT_REF || null;
    const fromUrl = projectRefFromUrl(env.NEXT_PUBLIC_SUPABASE_URL)
        || projectRefFromUrl(env.VITE_SUPABASE_URL);
    if (explicit && fromUrl && explicit !== fromUrl) {
        throw Object.assign(
            new Error(`SUPABASE_PROJECT_REF=${explicit} disagrees with the configured Supabase URL (${fromUrl})`),
            { code: 'SQL_RUNNER_PROJECT_REF_MISMATCH' },
        );
    }
    const projectRef = explicit || fromUrl;
    if (!projectRef || !/^[a-z0-9]{20}$/i.test(projectRef)) {
        throw Object.assign(
            new Error('Set SUPABASE_PROJECT_REF (or a matching NEXT_PUBLIC_SUPABASE_URL) explicitly before a database migration'),
            { code: 'SQL_RUNNER_PROJECT_REF_REQUIRED' },
        );
    }
    return projectRef;
}

function getPasswordCandidates(env = process.env) {
    const candidates = [env.SUPABASE_DB_PASSWORD, env.POSTGRES_PASSWORD].filter(Boolean);
    if (candidates.length === 0) {
        throw Object.assign(
            new Error('Set SUPABASE_DB_PASSWORD before a database migration'),
            { code: 'SQL_RUNNER_PASSWORD_REQUIRED' },
        );
    }
    return [...new Set(candidates)];
}

function buildConnectionTarget(projectRef, env = process.env) {
    const directHost = `db.${projectRef}.supabase.co`;
    const host = env.SUPABASE_DB_HOST || directHost;
    const port = Number(env.SUPABASE_DB_PORT || 5432);
    const isDirect = host === directHost;
    const isSessionPooler = host.endsWith('.pooler.supabase.com') && port === 5432;
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw Object.assign(new Error(`Invalid SUPABASE_DB_PORT: ${env.SUPABASE_DB_PORT}`), { code: 'SQL_RUNNER_INVALID_PORT' });
    }
    if (port === 6543) {
        throw Object.assign(
            new Error('Supavisor transaction-mode port 6543 cannot preserve a session advisory lock; use direct or session-mode port 5432'),
            { code: 'SQL_RUNNER_TRANSACTION_POOLER_REFUSED' },
        );
    }
    if (!isDirect && !isSessionPooler) {
        throw Object.assign(
            new Error(`Migration endpoint ${host}:${port} cannot be bound to project ${projectRef}; use ${directHost}:5432 or an explicit Supabase session pooler on 5432`),
            { code: 'SQL_RUNNER_UNATTESTABLE_ENDPOINT' },
        );
    }
    const expectedLogin = isSessionPooler ? `postgres.${projectRef}` : 'postgres';
    const user = env.SUPABASE_DB_USER || expectedLogin;
    if (user !== expectedLogin) {
        throw Object.assign(
            new Error(`Expected database login ${expectedLogin} for ${host}, received ${user}`),
            { code: 'SQL_RUNNER_UNATTESTABLE_LOGIN' },
        );
    }
    const database = env.SUPABASE_DB_NAME || 'postgres';
    const caPath = env.SUPABASE_DB_CA_CERT;
    if (!caPath) {
        throw Object.assign(
            new Error('Set SUPABASE_DB_CA_CERT to the local Supabase Root 2021 CA PEM path'),
            { code: 'SQL_RUNNER_CA_CERT_REQUIRED' },
        );
    }
    let ca;
    try {
        const resolvedCaPath = fs.realpathSync(caPath);
        const stat = fs.statSync(resolvedCaPath);
        if (!stat.isFile()) throw new Error('path is not a regular file');
        if ((stat.mode & 0o077) !== 0) throw new Error('file must not be group/world accessible (use mode 0600)');
        ca = fs.readFileSync(resolvedCaPath, 'utf8');
        const certificate = new X509Certificate(ca);
        const expectedFingerprint = '80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA';
        if (certificate.fingerprint256.toUpperCase() !== expectedFingerprint) {
            throw new Error(`unexpected SHA-256 fingerprint ${certificate.fingerprint256}`);
        }
        if (Date.parse(certificate.validTo) <= Date.now()) throw new Error(`certificate expired ${certificate.validTo}`);
    } catch (error) {
        throw Object.assign(
            new Error(`SUPABASE_DB_CA_CERT could not be validated as the pinned Supabase Root 2021 CA: ${error.message}`),
            { code: 'SQL_RUNNER_CA_CERT_INVALID' },
        );
    }
    return Object.freeze({
        host,
        port,
        user,
        database,
        expectedCurrentUser: env.SUPABASE_DB_EXPECTED_CURRENT_USER || 'postgres',
        endpointKind: isDirect ? 'direct' : 'session-pooler',
        ssl: { rejectUnauthorized: true, ca },
        application_name: `antigravity-sql-push:${projectRef}`,
    });
}

const MAX_CONNECT_RETRIES = 3;
const CONNECT_RETRY_DELAY_MS = 2_000;

async function connectWithRetry(target, passwords) {
    for (let attempt = 1; attempt <= MAX_CONNECT_RETRIES; attempt += 1) {
        for (const password of passwords) {
            let pool;
            try {
                pool = new Pool({
                    host: target.host,
                    port: target.port,
                    user: target.user,
                    password,
                    database: target.database,
                    ssl: target.ssl,
                    application_name: target.application_name,
                    connectionTimeoutMillis: 10_000,
                    idleTimeoutMillis: 30_000,
                    statement_timeout: 120_000,
                    max: 1,
                });
                const client = await pool.connect();
                await client.query('SELECT 1');
                return { client, pool };
            } catch (error) {
                console.error(`   Connection attempt to ${target.host}:${target.port} failed: ${error.message}`);
                if (pool) await pool.end().catch(() => {});
            }
        }
        if (attempt < MAX_CONNECT_RETRIES) {
            const delay = CONNECT_RETRY_DELAY_MS * attempt;
            console.log(`   Retrying verified endpoint in ${delay / 1000}s (${attempt}/${MAX_CONNECT_RETRIES})...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }
    return null;
}

async function executeSqlFile(client, file) {
    if (flags.verbose) {
        console.log(`\n   ┌── Captured SQL: ${file.name} (${file.checksum}) ──`);
        const preview = file.sql.substring(0, 2_000).split('\n').join('\n   │ ');
        console.log(`   │ ${preview}`);
        if (file.sql.length > 2_000) console.log(`   │ ... (${file.sql.length} chars total)`);
        console.log('   └──────────────────────────────');
    }
    // A prior migration can mutate session GUCs. Re-attest parser-critical
    // values at the exact query boundary. SQL execution is never blindly
    // retried: a disconnect can make COMMIT outcome unknowable.
    await assertSqlLexingAssumptions(client);
    const startedAt = Date.now();
    try {
        await client.query(file.sql);
    } catch (error) {
        console.error(`   SQL failed in ${file.name}: ${error.code || 'N/A'} ${error.message}`);
        if (error.detail) console.error(`   Detail: ${error.detail}`);
        if (error.hint) console.error(`   Hint: ${error.hint}`);
        throw error;
    }
    console.log(`   ✅ ${file.name} executed once (${((Date.now() - startedAt) / 1000).toFixed(2)}s)`);
}

function writeDeployLog(entry) {
    try {
        const logDir = path.resolve(__dirname, '..', 'logs');
        if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
        const logFile = path.join(logDir, 'deploy-history.json');
        let history = [];
        if (fs.existsSync(logFile)) {
            try { history = JSON.parse(fs.readFileSync(logFile, 'utf8')); } catch (_) { history = []; }
        }
        history.push(entry);
        if (history.length > 100) history = history.slice(-100);
        fs.writeFileSync(logFile, JSON.stringify(history, null, 2));
        console.log(`   Deploy log updated (${history.length} entries)`);
    } catch (error) {
        if (flags.verbose) console.log(`   Could not write deploy log: ${error.message}`);
    }
}

function printPreflight(files, transactionPlan, { dryRun = false } = {}) {
    console.log('\n═══════════════════════════════════════════════════');
    console.log(dryRun ? '🔍 DRY RUN — local preflight only' : '🤖 Anti-Gravity DB Push v4.0');
    console.log('═══════════════════════════════════════════════════');
    console.log(`   Files:   ${files.length}`);
    console.log(`   TX Plan: ${transactionPlan.mode}`);
    console.log(`   Ledger:  ${flags.force ? 'force requested (integrity still mandatory)' : 'verified name + SHA-256'}`);
    for (const file of files) {
        console.log(`   ${file.version}  ${file.checksum}  ${file.name}`);
    }
    console.log('═══════════════════════════════════════════════════');
}

async function run() {
    const totalStart = Date.now();
    const targetPath = path.resolve(positionalArgs[0]);
    const sqlFiles = resolveSqlFiles(targetPath);
    const preflight = preflightMigrationFiles(sqlFiles);
    printPreflight(preflight.files, preflight.transactionPlan, { dryRun: flags.dryRun });

    if (flags.dryRun) {
        console.log('   No credentials loaded and no database connection made.');
        return;
    }

    loadEnvironment();
    const projectRef = resolveProjectRef();
    const target = buildConnectionTarget(projectRef);
    const passwords = getPasswordCandidates();
    console.log(`\n🔌 Connecting to ${target.endpointKind} ${target.host}:${target.port}/${target.database}...`);
    const connection = await connectWithRetry(target, passwords);
    if (!connection) {
        throw Object.assign(new Error('Could not establish a verified PostgreSQL connection'), { code: 'SQL_RUNNER_CONNECT_FAILED' });
    }

    const { client, pool } = connection;
    let lockName = null;
    let transactionOpen = false;
    let commitAttempted = false;
    let transactionMode = preflight.transactionPlan.mode;
    let skippedCount = 0;
    const appliedFiles = [];

    try {
        const tlsStream = client.connection?.stream;
        const frontendTlsVerified = tlsStream?.encrypted === true && tlsStream?.authorized === true;
        if (!frontendTlsVerified) {
            throw Object.assign(
                new Error('node-postgres did not expose an authorized TLS socket for the migration session'),
                { code: 'SQL_RUNNER_FRONTEND_TLS_ATTESTATION_FAILED' },
            );
        }
        const attestation = await attestMigrationConnection(client, {
            expectedDatabase: target.database,
            expectedProjectRef: projectRef,
            expectedUser: target.expectedCurrentUser,
            frontendTlsVerified,
            allowBackendTlsTermination: target.endpointKind === 'session-pooler',
        });
        console.log(`   ✅ Attested ${target.host}:${target.port}/${attestation.database_name} as ${attestation.user_name}; PostgreSQL 17, UTF8, TLS`);

        // A session advisory lock is safe on a direct or session-mode endpoint.
        // It is deliberately acquired before ledger bootstrap/read so two
        // cooperating runners can never compute the same pending set.
        lockName = await acquireMigrationAdvisoryLock(client, projectRef);
        await ensureMigrationLedger(client);
        const appliedMigrations = await getAppliedMigrations(client);
        assertAppliedMigrationIntegrity(appliedMigrations, preflight.files);

        const pendingFiles = preflight.files.filter(
            (file) => !appliedMigrations.integrityByVersion.has(file.version),
        );
        skippedCount = preflight.files.length - pendingFiles.length;
        const claims = await getMigrationClaims(client, pendingFiles.map((file) => file.version));
        assertNoAmbiguousClaims(claims, pendingFiles);

        if (flags.status) {
            console.log('\n📊 MIGRATION STATUS');
            for (const file of preflight.files) {
                console.log(`   ${appliedMigrations.integrityByVersion.has(file.version) ? '✅ Applied' : '⏳ Pending'}  ${file.version}  ${file.name}`);
            }
            console.log(`   Selected: ${preflight.files.length} | Applied: ${skippedCount} | Pending: ${pendingFiles.length}`);
            return;
        }

        if (flags.force && skippedCount > 0) {
            throw Object.assign(
                new Error('--force cannot erase ledger history or safely replay an already-applied migration; create a new canonical migration'),
                { code: 'SQL_RUNNER_FORCE_REPLAY_REFUSED' },
            );
        }
        if (pendingFiles.length === 0) {
            console.log('\n   No pending migrations to apply.');
            writeDeployLog({
                timestamp: new Date().toISOString(),
                action: 'db:push',
                result: 'no-op',
                selected: preflight.files.map((file) => ({ name: file.name, checksum: file.checksum })),
            });
            return;
        }

        // Filtering applied files can change whether an outer transaction is
        // legal, but source bytes and per-file analysis are identical to dry run.
        const transactionPlan = planMigrationTransactions(pendingFiles, { noTx: flags.noTx });
        transactionMode = transactionPlan.mode;
        console.log(`\n   Locked pending-set transaction plan: ${transactionMode}`);

        if (transactionPlan.useOuterTransaction) {
            await client.query('BEGIN');
            transactionOpen = true;
            for (const file of pendingFiles) {
                console.log(`\n▶️  Executing: ${file.name}`);
                await executeSqlFile(client, file);
                await insertMigrationLedgerEntry(client, file);
                appliedFiles.push(file.name);
                console.log(`   📝 Ledgered ${file.version} with exact name + SHA-256`);
            }
            commitAttempted = true;
            await client.query('COMMIT');
            transactionOpen = false;
            console.log('\n🔓 COMMIT — migration SQL and ledger rows committed atomically.');
        } else {
            for (const file of pendingFiles) {
                console.log(`\n▶️  Claiming independent execution: ${file.name}`);
                await claimIndependentMigration(client, file);
                try {
                    await executeSqlFile(client, file);
                } catch (error) {
                    // A durable failed/ambiguous claim prevents blind replay.
                    // If the connection died, the original in_progress claim
                    // remains and provides the same fail-closed boundary.
                    await markIndependentMigrationFailed(client, file, error.code).catch(() => {});
                    throw error;
                }
                await completeIndependentMigration(client, file);
                appliedFiles.push(file.name);
                console.log(`   📝 Completed durable claim + exact ledger identity for ${file.version}`);
            }
        }

        const totalElapsed = ((Date.now() - totalStart) / 1000).toFixed(2);
        writeDeployLog({
            timestamp: new Date().toISOString(),
            action: 'db:push',
            result: 'success',
            projectRef,
            endpoint: `${target.host}:${target.port}/${target.database}`,
            applied: pendingFiles.map((file) => ({ name: file.name, checksum: file.checksum })),
            skipped: skippedCount,
            transactionMode,
            duration: `${totalElapsed}s`,
        });
        console.log(`\n🎉 ${appliedFiles.length} migration(s) applied; ${skippedCount} already applied (${totalElapsed}s).`);
    } catch (error) {
        if (transactionOpen && !commitAttempted && !String(error?.code || '').startsWith('08')) {
            console.error('\n🔙 ROLLBACK — runner-owned SQL and ledger writes did not commit.');
            await client.query('ROLLBACK').catch(() => {});
            transactionOpen = false;
        }
        throw error;
    } finally {
        if (lockName) {
            await releaseMigrationAdvisoryLock(client, lockName).catch((error) => {
                // A severed connection releases its session locks server-side.
                console.error(`   Advisory-lock release could not be confirmed: ${error.message}`);
            });
        }
        try { client.release(); } catch (_) {}
        await pool.end().catch(() => {});
    }
}

run().catch((error) => {
    console.error(`Fatal Error [${error.code || 'N/A'}]: ${error.message}`);
    process.exitCode = 1;
});
