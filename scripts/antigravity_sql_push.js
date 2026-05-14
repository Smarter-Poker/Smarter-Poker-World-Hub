#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════
// antigravity_sql_push.js — Hardened Supabase SQL Migration Runner v3.0
// ═══════════════════════════════════════════════════════════════════════════════
//
// USAGE:
//   npm run db:push -- <path_to_sql_file_or_directory>
//   npm run db:push -- --dry-run supabase/migrations/
//   npm run db:push -- --status supabase/migrations/
//   npm run db:push -- --verbose --force supabase/migrations/
//
// FLAGS:
//   --dry-run     List files that would execute without connecting to DB
//   --status      Show applied vs pending migrations (requires DB connection)
//   --verbose     Print full SQL content before executing each file
//   --no-tx       Skip transaction wrapping (run each file independently)
//   --force       Re-run already-applied migrations (skip ledger check)
//
// EXIT CODES:
//   0 = all migrations applied (or nothing to do)
//   1 = fatal error (no files, connection failure, SQL error)
// ═══════════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// ── Load environment variables ──────────────────────────────────────────────
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
} catch (_) { }

// ── Parse CLI arguments ─────────────────────────────────────────────────────
const rawArgs = process.argv.slice(2);
const flags = {
    dryRun: rawArgs.includes('--dry-run'),
    verbose: rawArgs.includes('--verbose'),
    noTx: rawArgs.includes('--no-tx'),
    force: rawArgs.includes('--force'),
    status: rawArgs.includes('--status'),
};
const positionalArgs = rawArgs.filter(a => !a.startsWith('--'));

if (positionalArgs.length === 0) {
    console.error('Usage: npm run db:push -- [--dry-run|--status|--verbose|--no-tx|--force] <path>');
    process.exit(1);
}

// ── Resolve SQL files ───────────────────────────────────────────────────────
const targetPath = path.resolve(positionalArgs[0]);
let sqlFiles = [];
try {
    const stat = fs.statSync(targetPath);
    if (stat.isDirectory()) {
        sqlFiles = fs.readdirSync(targetPath)
            .filter(f => f.endsWith('.sql'))
            .map(f => path.join(targetPath, f))
            .sort();
    } else {
        sqlFiles = [targetPath];
    }
} catch (e) {
    console.error(`❌ Path not found: ${targetPath}`);
    process.exit(1);
}
if (sqlFiles.length === 0) {
    console.error(`❌ No .sql files found at ${targetPath}`);
    process.exit(1);
}

// ── Dry-run mode (no DB connection) ─────────────────────────────────────────
if (flags.dryRun) {
    console.log('\n═══════════════════════════════════════════════════');
    console.log('🔍 DRY RUN — No database connection will be made');
    console.log('═══════════════════════════════════════════════════');
    console.log(`   Found ${sqlFiles.length} SQL file(s):\n`);
    for (const f of sqlFiles) {
        const size = fs.statSync(f).size;
        console.log(`   📄 ${path.basename(f)}  (${(size / 1024).toFixed(1)} KB)`);
    }
    console.log('\n   To execute: remove --dry-run flag');
    console.log('═══════════════════════════════════════════════════');
    process.exit(0);
}

// ── Build connection strings ────────────────────────────────────────────────
const projectRef = process.env.SUPABASE_PROJECT_REF || 'kuklfnapbkmacvwxktbh';

function getPasswordCandidates() {
    const candidates = [];
    if (process.env.SUPABASE_DB_PASSWORD) candidates.push(process.env.SUPABASE_DB_PASSWORD);
    if (process.env.POSTGRES_PASSWORD) candidates.push(process.env.POSTGRES_PASSWORD);
    if (candidates.length === 0) {
        console.error('No database password configured. Set SUPABASE_DB_PASSWORD in .env.local');
        process.exit(1);
    }
    return [...new Set(candidates)];
}

const passwords = getPasswordCandidates();

// Build parameter-based configs (avoids encodeURIComponent mangling special chars like !)
const connConfigs = passwords.flatMap(pw => [
    // Supabase Supavisor pooler — port 6543 (transaction mode)
    {
        host: 'aws-0-us-east-1.pooler.supabase.com',
        port: 6543,
        user: `postgres.${projectRef}`,
        password: pw,
        database: 'postgres',
    },
    // Direct Postgres connection — port 5432
    {
        host: `db.${projectRef}.supabase.co`,
        port: 5432,
        user: 'postgres',
        password: pw,
        database: 'postgres',
    },
]);

// ── Connection with retry ───────────────────────────────────────────────────
const MAX_CONNECT_RETRIES = 3;
const CONNECT_RETRY_DELAY_MS = 2000;

async function connectWithRetry() {
    for (let attempt = 1; attempt <= MAX_CONNECT_RETRIES; attempt++) {
        for (const cfg of connConfigs) {
            let pool;
            try {
                pool = new Pool({
                    ...cfg,
                    ssl: { rejectUnauthorized: false },
                    connectionTimeoutMillis: 10000,
                    idleTimeoutMillis: 30000,
                    statement_timeout: 120000,
                    max: 1,
                });
                const client = await pool.connect();
                await client.query('SELECT 1');
                return { client, pool };
            } catch (e) {
                console.error('DB ERROR:', e.message);
                if (pool) { try { await pool.end(); } catch (_) {} } // prevent pool leak
                /* try next */
            }
        }
        if (attempt < MAX_CONNECT_RETRIES) {
            const delay = CONNECT_RETRY_DELAY_MS * attempt;
            console.log(`   ⏳ Connection attempt ${attempt}/${MAX_CONNECT_RETRIES} failed. Retrying in ${delay / 1000}s...`);
            await new Promise(r => setTimeout(r, delay));
        }
    }
    return null;
}

// ── Migration ledger ────────────────────────────────────────────────────────
async function ensureMigrationTable(client) {
    try {
        await client.query(`
            CREATE SCHEMA IF NOT EXISTS supabase_migrations;
            CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
                version text PRIMARY KEY,
                name text,
                inserted_at timestamptz DEFAULT now()
            );
        `);
    } catch (e) {
        if (flags.verbose) console.log(`   ⚠️  Could not ensure migration table: ${e.message}`);
    }
}

async function getAppliedVersions(client) {
    try {
        const { rows } = await client.query(
            'SELECT version FROM supabase_migrations.schema_migrations ORDER BY version'
        );
        return new Set(rows.map(r => r.version));
    } catch (e) {
        return new Set();
    }
}

function extractVersion(filename) {
    const match = path.basename(filename).match(/^(\d{8,14})/);
    return match ? match[1] : null;
}

async function recordMigration(client, sqlFile) {
    const version = extractVersion(sqlFile);
    if (!version) return;
    try {
        await client.query(
            `INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [version, path.basename(sqlFile)]
        );
        console.log(`   📝 Recorded: ${version}`);
    } catch (e) {
        if (flags.verbose) console.log(`   ⚠️  Could not record migration: ${e.message}`);
    }
}

// ── Execute SQL with retry ──────────────────────────────────────────────────
const MAX_SQL_RETRIES = 3;
const TRANSIENT_CODES = new Set(['08000', '08003', '08006', '57014', '40001', '40P01']);

async function executeSqlFile(client, sqlFile) {
    const sql = fs.readFileSync(sqlFile, 'utf-8');
    const basename = path.basename(sqlFile);

    if (flags.verbose) {
        console.log(`\n   ┌── SQL Content: ${basename} ──`);
        const preview = sql.substring(0, 2000).split('\n').join('\n   │ ');
        console.log(`   │ ${preview}`);
        if (sql.length > 2000) console.log(`   │ ... (${sql.length} chars total)`);
        console.log(`   └──────────────────────────────`);
    }

    for (let attempt = 1; attempt <= MAX_SQL_RETRIES; attempt++) {
        try {
            const start = Date.now();
            await client.query(sql);
            const elapsed = ((Date.now() - start) / 1000).toFixed(2);
            console.log(`   ✅ ${basename} deployed (${elapsed}s)`);
            return true;
        } catch (e) {
            if (TRANSIENT_CODES.has(e.code) && attempt < MAX_SQL_RETRIES) {
                const delay = 1000 * attempt;
                console.log(`   ⚠️  Transient error (${e.code}). Retry ${attempt}/${MAX_SQL_RETRIES} in ${delay / 1000}s...`);
                await new Promise(r => setTimeout(r, delay));
                continue;
            }
            console.error(`   ❌ SQL Error in ${basename}:`);
            console.error(`      Code:     ${e.code || 'N/A'}`);
            console.error(`      Message:  ${e.message}`);
            if (e.position) console.error(`      Position: char ${e.position}`);
            if (e.detail) console.error(`      Detail:   ${e.detail}`);
            if (e.hint) console.error(`      Hint:     ${e.hint}`);
            return false;
        }
    }
    return false;
}

// ── Deploy log ──────────────────────────────────────────────────────────────
function writeDeployLog(entry) {
    try {
        const logDir = path.resolve(__dirname, '..', 'logs');
        if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
        const logFile = path.join(logDir, 'deploy-history.json');
        let history = [];
        if (fs.existsSync(logFile)) {
            try { history = JSON.parse(fs.readFileSync(logFile, 'utf-8')); } catch (_) { history = []; }
        }
        history.push(entry);
        // Keep last 100 entries
        if (history.length > 100) history = history.slice(-100);
        fs.writeFileSync(logFile, JSON.stringify(history, null, 2));
        console.log(`   📋 Deploy log updated (${history.length} entries)`);
    } catch (e) {
        if (flags.verbose) console.log(`   ⚠️  Could not write deploy log: ${e.message}`);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════
async function run() {
    const totalStart = Date.now();

    console.log('\n═══════════════════════════════════════════════════');
    console.log('🤖 Anti-Gravity DB Push v3.0 — Hardened SQL Runner');
    console.log('═══════════════════════════════════════════════════');
    console.log(`   Files:   ${sqlFiles.length}`);
    console.log(`   Target:  db.${projectRef}.supabase.co:5432`);
    console.log(`   TX Mode: ${flags.noTx ? 'disabled' : 'enabled (multi-file)'}`);
    console.log(`   Ledger:  ${flags.force ? 'FORCE (skip check)' : 'enabled'}`);
    console.log('═══════════════════════════════════════════════════');

    // ── Connect ──
    console.log('\n🔌 Connecting to Postgres...');
    const conn = await connectWithRetry();
    if (!conn) {
        console.error('\n❌ CRITICAL: Could not connect to Postgres after all retries.');
        console.error('   Check credentials in .env.local or SUPABASE_DB_PASSWORD env var.');
        process.exit(1);
    }
    const { client, pool } = conn;
    console.log('   ✅ Connected to production database.\n');

    let successCount = 0;
    let skippedCount = 0;
    const appliedFiles = [];

    try {
        await ensureMigrationTable(client);
        const appliedVersions = await getAppliedVersions(client);

        // ── Status mode ──
        if (flags.status) {
            console.log('📊 MIGRATION STATUS\n');
            console.log(`   ${'File'.padEnd(55)} ${'Version'.padEnd(16)} Status`);
            console.log(`   ${'─'.repeat(55)} ${'─'.repeat(16)} ${'─'.repeat(10)}`);
            for (const f of sqlFiles) {
                const bn = path.basename(f);
                const ver = extractVersion(f);
                const applied = ver && appliedVersions.has(ver);
                const status = applied ? '✅ Applied' : '⏳ Pending';
                console.log(`   ${bn.padEnd(55)} ${(ver || 'N/A').padEnd(16)} ${status}`);
            }
            const pendingCount = sqlFiles.filter(f => {
                const v = extractVersion(f);
                return !v || !appliedVersions.has(v);
            }).length;
            console.log(`\n   Total: ${sqlFiles.length} | Applied: ${appliedVersions.size} | Pending: ${pendingCount}`);
            client.release();
            await pool.end();
            process.exit(0);
        }

        // ── Filter out already-applied migrations ──
        let filesToRun = sqlFiles;
        if (!flags.force) {
            filesToRun = sqlFiles.filter(f => {
                const ver = extractVersion(f);
                if (ver && appliedVersions.has(ver)) {
                    skippedCount++;
                    return false;
                }
                return true;
            });
            if (skippedCount > 0) {
                console.log(`   ⏭️  Skipping ${skippedCount} already-applied migration(s)`);
            }
        }

        if (filesToRun.length === 0) {
            console.log('\n   ℹ️  No pending migrations to apply.');
            client.release();
            await pool.end();
            writeDeployLog({
                timestamp: new Date().toISOString(),
                action: 'db:push',
                result: 'no-op',
                skipped: skippedCount,
                total: sqlFiles.length,
            });
            process.exit(0);
        }

        const useTransaction = filesToRun.length > 1 && !flags.noTx;

        // ── Begin transaction ──
        if (useTransaction) {
            console.log('\n🔒 BEGIN TRANSACTION\n');
            await client.query('BEGIN');
        }

        // ── Execute each file ──
        for (const sqlFile of filesToRun) {
            console.log(`\n▶️  Executing: ${path.basename(sqlFile)}`);
            const ok = await executeSqlFile(client, sqlFile);
            if (ok) {
                await recordMigration(client, sqlFile);
                appliedFiles.push(path.basename(sqlFile));
                successCount++;
            } else if (useTransaction) {
                console.error('\n🔙 ROLLBACK — failure in transactional batch.');
                await client.query('ROLLBACK').catch(() => { });
                break;
            }
        }

        // ── Commit ──
        if (useTransaction && successCount === filesToRun.length) {
            await client.query('COMMIT');
            console.log('\n🔓 COMMIT — all migrations applied atomically.');
        }
    } finally {
        try { client.release(); } catch (_) { }
        try { await pool.end(); } catch (_) { }
    }

    // ── Summary ──
    const totalElapsed = ((Date.now() - totalStart) / 1000).toFixed(2);
    const allPassed = successCount === (sqlFiles.length - skippedCount);

    writeDeployLog({
        timestamp: new Date().toISOString(),
        action: 'db:push',
        result: allPassed ? 'success' : 'partial',
        applied: appliedFiles,
        skipped: skippedCount,
        successCount,
        total: sqlFiles.length,
        duration: `${totalElapsed}s`,
    });

    console.log('\n═══════════════════════════════════════════════════');
    if (allPassed) {
        console.log(`🎉 ${successCount} migration(s) applied. ${skippedCount} skipped (already applied).`);
        console.log(`   Duration: ${totalElapsed}s`);
        console.log('═══════════════════════════════════════════════════');
        process.exit(0);
    } else {
        console.error(`⚠️  ${successCount}/${sqlFiles.length - skippedCount} applied. ${skippedCount} skipped.`);
        console.error(`   Duration: ${totalElapsed}s`);
        console.log('═══════════════════════════════════════════════════');
        process.exit(1);
    }
}

run().catch(e => {
    console.error('Fatal Error:', e.message);
    process.exit(1);
});
