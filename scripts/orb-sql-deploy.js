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
    const connStrings = uniqueCands.map(pw => `postgresql://postgres.kuklfnapbkmacvwxktbh:${encodeURIComponent(pw)}@aws-0-us-west-2.pooler.supabase.com:5432/postgres`);

    for (const cs of connStrings) {
        let pool;
        let client;
        try {
            pool = new Pool({
                connectionString: cs,
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

            // Audit Log
            const logEntry = {
                timestamp: new Date().toISOString(),
                action: 'orb-cli-deploy',
                success: true,
                ms,
                command: res.command,
                rowCount: res.rowCount,
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
                command: res.command,
                rowCount: res.rowCount,
                rows: res.rows || [],
                ms
            }, null, 2));

            client.release();
            await pool.end();
            process.exit(0);
        } catch (e) {
            if (e.message.includes('authentication failed')) continue;
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
