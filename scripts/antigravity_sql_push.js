#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════
// antigravity_sql_push.js — Hardened Supabase SQL Migration Runner v2.0
// ═══════════════════════════════════════════════════════════════════════════════
//
// USAGE:
//   npm run db:push <path_to_sql_file_or_directory>
//   npm run db:push -- --dry-run supabase/migrations/
//   npm run db:push -- --verbose supabase/migrations/20260309_hotfix.sql
//
// FLAGS:
//   --dry-run     List files that would execute without connecting to DB
//   --verbose     Print full SQL content before executing each file
//   --no-tx       Skip transaction wrapping (run each file independently)
//
// EXIT CODES:
//   0 = all migrations applied successfully
//   1 = fatal error (no files, connection failure, SQL error)
// ═══════════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// ── Load environment variables ──────────────────────────────────────────────
// Try multiple .env files in priority order
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
} catch (_) {
    // dotenv not installed — rely on process.env
}

// ── Parse CLI arguments ─────────────────────────────────────────────────────
const rawArgs = process.argv.slice(2);
const flags = {
    dryRun: rawArgs.includes('--dry-run'),
    verbose: rawArgs.includes('--verbose'),
    noTx: rawArgs.includes('--no-tx'),
};
const positionalArgs = rawArgs.filter(a => !a.startsWith('--'));

if (positionalArgs.length === 0) {
    console.error('Usage: npm run db:push [--dry-run] [--verbose] [--no-tx] <path_to_sql_file_or_directory>');
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
            .sort(); // Alphabetical order = timestamp order
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

// ── Dry-run mode ────────────────────────────────────────────────────────────
if (flags.dryRun) {
    console.log('');
    console.log('═══════════════════════════════════════════════════');
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
// Priority: env vars → hardcoded fallbacks (for backward compat)
const projectRef = process.env.SUPABASE_PROJECT_REF || 'kuklfnapbkmacvwxktbh';

function getPasswordCandidates() {
    const candidates = [];
    // 1. Env vars (highest priority)
    if (process.env.SUPABASE_DB_PASSWORD) candidates.push(process.env.SUPABASE_DB_PASSWORD);
    if (process.env.POSTGRES_PASSWORD) candidates.push(process.env.POSTGRES_PASSWORD);
    // 2. Hardcoded fallbacks (legacy compat, to be removed once env is standard)
    candidates.push('215SlalomCt!', 'Bek454545!!', 'gbpAM0n7jNBzY4Co');
    // Deduplicate
    return [...new Set(candidates)];
}

const passwords = getPasswordCandidates();
const connStrings = passwords.map(pw =>
    `postgresql://postgres:${encodeURIComponent(pw)}@db.${projectRef}.supabase.co:5432/postgres`
);

// ── Connection with retry ───────────────────────────────────────────────────
const MAX_CONNECT_RETRIES = 3;
const CONNECT_RETRY_DELAY_MS = 2000;

async function connectWithRetry() {
    for (let attempt = 1; attempt <= MAX_CONNECT_RETRIES; attempt++) {
        for (const cs of connStrings) {
            try {
                const pool = new Pool({
                    connectionString: cs,
                    ssl: { rejectUnauthorized: false },
                    connectionTimeoutMillis: 10000,
                    idleTimeoutMillis: 30000,
                    statement_timeout: 120000, // 2 min per statement
                    max: 1,                    // Single connection — we don't need more
                });
                const client = await pool.connect();
                // Verify the connection is alive
                await client.query('SELECT 1');
                return { client, pool };
            } catch (e) {
                // Silently try next password
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

// ── Execute a single SQL file with retry ────────────────────────────────────
const MAX_SQL_RETRIES = 3;
const TRANSIENT_CODES = new Set([
    '08000', // connection_exception
    '08003', // connection_does_not_exist
    '08006', // connection_failure
    '57014', // query_canceled (timeout)
    '40001', // serialization_failure
    '40P01', // deadlock_detected
]);

async function executeSqlFile(client, sqlFile) {
    const sql = fs.readFileSync(sqlFile, 'utf-8');
    const basename = path.basename(sqlFile);

    if (flags.verbose) {
        console.log(`\n   ┌── SQL Content: ${basename} ──`);
        console.log(`   │ ${sql.substring(0, 2000).split('\n').join('\n   │ ')}`);
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
            const isTransient = TRANSIENT_CODES.has(e.code);
            if (isTransient && attempt < MAX_SQL_RETRIES) {
                const delay = 1000 * attempt;
                console.log(`   ⚠️  Transient error (${e.code}) on ${basename}. Retry ${attempt}/${MAX_SQL_RETRIES} in ${delay / 1000}s...`);
                await new Promise(r => setTimeout(r, delay));
                continue;
            }
            // Fatal or out of retries
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

// ── Record migration version ────────────────────────────────────────────────
async function recordMigration(client, sqlFile) {
    const versionMatch = path.basename(sqlFile).match(/^(\d{8,14})/);
    if (!versionMatch) return;
    const version = versionMatch[1];
    try {
        // Ensure the schema_migrations table exists (safe no-op if it does)
        await client.query(`
            CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
                version text PRIMARY KEY,
                inserted_at timestamptz DEFAULT now()
            );
        `);
        await client.query(
            `INSERT INTO supabase_migrations.schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING`,
            [version]
        );
        console.log(`   📝 Migration history synced: ${version}`);
    } catch (e) {
        // Non-fatal — schema may not have the supabase_migrations schema
        if (flags.verbose) {
            console.log(`   ⚠️  Could not record migration version: ${e.message}`);
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════
async function run() {
    const totalStart = Date.now();

    console.log('');
    console.log('═══════════════════════════════════════════════════');
    console.log('🤖 Anti-Gravity DB Push v2.0 — Hardened SQL Runner');
    console.log('═══════════════════════════════════════════════════');
    console.log(`   Files:   ${sqlFiles.length}`);
    console.log(`   Target:  db.${projectRef}.supabase.co:5432`);
    console.log(`   TX Mode: ${flags.noTx ? 'disabled' : 'enabled (multi-file)'}`);
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
    const useTransaction = sqlFiles.length > 1 && !flags.noTx;

    try {
        // ── Begin transaction for multi-file runs ──
        if (useTransaction) {
            console.log('🔒 BEGIN TRANSACTION (multi-file atomic deploy)\n');
            await client.query('BEGIN');
        }

        // ── Execute each file ──
        for (const sqlFile of sqlFiles) {
            console.log(`\n▶️  Executing: ${path.basename(sqlFile)}`);
            const ok = await executeSqlFile(client, sqlFile);
            if (ok) {
                await recordMigration(client, sqlFile);
                successCount++;
            } else if (useTransaction) {
                // In transaction mode, one failure rolls back everything
                console.error('\n🔙 ROLLBACK — failure in transactional batch.');
                await client.query('ROLLBACK').catch(() => { });
                break;
            }
        }

        // ── Commit if all passed ──
        if (useTransaction && successCount === sqlFiles.length) {
            await client.query('COMMIT');
            console.log('\n🔓 COMMIT — all migrations applied atomically.');
        }
    } finally {
        // ── Always clean up ──
        try { client.release(); } catch (_) { }
        try { await pool.end(); } catch (_) { }
    }

    // ── Summary ──
    const totalElapsed = ((Date.now() - totalStart) / 1000).toFixed(2);
    console.log('');
    console.log('═══════════════════════════════════════════════════');
    if (successCount === sqlFiles.length) {
        console.log(`🎉 All ${successCount} SQL migration(s) applied successfully.`);
        console.log(`   Duration: ${totalElapsed}s`);
        console.log('═══════════════════════════════════════════════════');
        process.exit(0);
    } else {
        console.error(`⚠️  Finished with errors: ${successCount}/${sqlFiles.length} applied.`);
        console.error(`   Duration: ${totalElapsed}s`);
        console.log('═══════════════════════════════════════════════════');
        process.exit(1);
    }
}

run().catch(e => {
    console.error('Fatal Error:', e.message);
    process.exit(1);
});
