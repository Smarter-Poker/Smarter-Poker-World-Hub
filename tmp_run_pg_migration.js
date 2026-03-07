const fs = require('fs');
const { Pool } = require('pg');
require('dotenv').config({ path: '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const projectRef = SUPABASE_URL.replace('https://', '').replace('.supabase.co', '');
const DB_PASSWORD = 'Bek454545!!';

const connStrings = [
    `postgresql://postgres:${DB_PASSWORD}@db.${projectRef}.supabase.co:5432/postgres`,
    `postgresql://postgres.${projectRef}:${DB_PASSWORD}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`
];

const sqlPath = '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/supabase/migrations/20260307_multi_day_tournaments.sql';
const sql = fs.readFileSync(sqlPath, 'utf-8');

async function tryConnect(connStr) {
    const pool = new Pool({
        connectionString: connStr,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 10000
    });
    const client = await pool.connect();
    return { client, pool };
}

async function run() {
    let client, pool;

    for (const cs of connStrings) {
        const masked = cs.substring(0, 30) + '...';
        try {
            console.log(`Trying connection ${masked} ...`);
            ({ client, pool } = await tryConnect(cs));
            console.log('CONNECTED successfully to Postgres!');
            break;
        } catch (e) {
            console.log(`  Failed: ${e.message.substring(0, 80)}`);
        }
    }

    if (!client) {
        console.log('\n⚠️  Could not connect to Postgres directly with password Bek454545!!');
        process.exit(1);
    }

    try {
        console.log('Executing multi-day tournament migration SQL...');
        await client.query(sql);
        console.log('Migration successfully applied via direct PostgreSQL connection.');
    } catch (e) {
        console.error('SQL Execution Error:', e.message);
        client.release();
        await pool.end();
        process.exit(1);
    }

    client.release();
    await pool.end();
}

run().catch(e => {
    console.error('Fatal Error:', e.message);
    process.exit(1);
});
