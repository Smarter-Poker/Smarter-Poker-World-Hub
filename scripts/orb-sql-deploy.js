#!/usr/bin/env node
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// 1. Load Environment Variables safely
const dotenvPaths = ['.env.local', '.env.prod', '.env.production.local', '.env.production', '.env'].map(p => path.resolve(__dirname, '..', p));
for (const envPath of dotenvPaths) {
    if (fs.existsSync(envPath)) {
        require('dotenv').config({ path: envPath });
        break;
    }
}

// 2. Parse arguments
const args = process.argv.slice(2);
let query = null;
let file = null;

for (let i = 0; i < args.length; i++) {
    if (args[i] === '--query' || args[i] === '-q') {
        query = args[++i];
    } else if (args[i] === '--file' || args[i] === '-f') {
        file = args[++i];
    }
}

if (!query && !file) {
    console.error(JSON.stringify({
        success: false,
        error: "Usage: node orb-sql-deploy.js --query '<sql>' OR --file <path_to_sql_file>"
    }));
    process.exit(1);
}

if (file) {
    try {
        query = fs.readFileSync(path.resolve(file), 'utf8');
    } catch (err) {
        console.error(JSON.stringify({ success: false, error: `Could not read file ${file}: ${err.message}` }));
        process.exit(1);
    }
}

// [HARDENING] Agent Bulletproofing: Strip AI markdown code blocks if the agent wrapped the query
if (query) {
    query = query.replace(/^```sql\s*/im, '').replace(/```\s*$/i, '').trim();
}

// 3. Destructive Action Guard
const isDestructive = /DROP\s+TABLE|DELETE\s+FROM|TRUNCATE\s+TABLE|ALTER\s+TABLE\s+.*\s+DROP\s+COLUMN/i.test(query);
const forceDestructive = args.includes('--force');

if (isDestructive && !forceDestructive) {
    console.error(JSON.stringify({
        success: false,
        error: 'Destructive action detected (DROP, DELETE, TRUNCATE). Execution blocked to protect schema. Pass --force to override.'
    }));
    process.exit(1);
}

// 4. Connect to Supabase Pooler and Execute
async function run() {
    const candidates = [
        process.env.SUPABASE_DB_PASSWORD,
        process.env.POSTGRES_PASSWORD,
        '215SlalomCt!',
        'Bek454545!!',
        'gbpAM0n7jNBzY4Co'
    ].filter(Boolean);

    // Deduplicate
    const uniqueCands = [...new Set(candidates)];

    // Build parameter-based configs (avoids encodeURIComponent mangling special chars like !)
    const connConfigs = [];
    for (const pw of uniqueCands) {
        // Supabase Supavisor pooler — port 6543 (transaction mode)
        connConfigs.push({
            host: 'aws-0-us-west-2.pooler.supabase.com',
            port: 6543,
            user: 'postgres.kuklfnapbkmacvwxktbh',
            password: pw,
            database: 'postgres',
        });
        // Direct Postgres connection — port 5432
        connConfigs.push({
            host: 'db.kuklfnapbkmacvwxktbh.supabase.co',
            port: 5432,
            user: 'postgres',
            password: pw,
            database: 'postgres',
        });
    }

    for (const cfg of connConfigs) {
        let pool;
        let client;
        try {
            pool = new Pool({
                ...cfg,
                ssl: { rejectUnauthorized: false },
                connectionTimeoutMillis: 10000,
                statement_timeout: 10000, // Hard 10-second circuit breaker
            });
            client = await pool.connect();

            const start = Date.now();
            let res;
            try {
                await client.query('BEGIN');
                res = await client.query(query);
                await client.query('COMMIT');
            } catch (sqlErr) {
                await client.query('ROLLBACK');
                throw sqlErr;
            }
            const ms = Date.now() - start;

            let finalCommand = '';
            let finalRowCount = 0;
            let finalRows = [];

            if (res) {
                if (Array.isArray(res)) {
                    finalCommand = res.map(r => r.command).filter(Boolean).join(', ');
                    finalRowCount = res.reduce((acc, r) => acc + (r.rowCount || 0), 0);
                    finalRows = res[res.length - 1]?.rows || [];
                } else {
                    finalCommand = res.command || 'UNKNOWN';
                    finalRowCount = res.rowCount || 0;
                    finalRows = res.rows || [];
                }
            }

            // Audit Log
            const logEntry = {
                timestamp: new Date().toISOString(),
                action: 'orb-cli-deploy',
                success: true,
                ms,
                command: finalCommand,
                rowCount: finalRowCount,
                query: query.substring(0, 1000)
            };

            try {
                const logPath = path.resolve(__dirname, '..', 'logs', 'deploy-history.json');
                if (!fs.existsSync(path.dirname(logPath))) fs.mkdirSync(path.dirname(logPath), { recursive: true });
                let history = [];
                if (fs.existsSync(logPath)) try { history = JSON.parse(fs.readFileSync(logPath, 'utf8')); } catch (e) { }
                history.unshift(logEntry);
                fs.writeFileSync(logPath, JSON.stringify(history.slice(0, 500), null, 2));
            } catch (e) { }

            console.log(JSON.stringify({
                success: true,
                command: finalCommand,
                rowCount: finalRowCount,
                rows: finalRows,
                ms
            }, null, 2));

            client.release();
            await pool.end();
            process.exit(0);
        } catch (e) {
            // Continue to next connection config on transient connection errors
            if (e.message.includes('authentication failed') || 
                e.message.includes('Connection terminated') ||
                e.message.includes('timeout') ||
                e.message.includes('ECONNREFUSED') ||
                e.message.includes('ETIMEDOUT') ||
                e.message.includes('ENOTFOUND')) {
                continue;
            }
            console.error(JSON.stringify({
                success: false,
                error: e.message,
                code: e.code,
                detail: e.detail
            }, null, 2));
            process.exit(1);
        } finally {
            if (client) {
                try { client.release(); } catch (err) { }
            }
            if (pool) {
                try { await pool.end(); } catch (err) { }
            }
        }
    }

    console.error(JSON.stringify({ success: false, error: 'Database connection failed. Invalid master credentials or network timeout.' }));
    process.exit(1);
}

run();
