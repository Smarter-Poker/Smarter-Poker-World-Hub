require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const { Client } = require('pg');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const projectRef = SUPABASE_URL.replace('https://', '').replace('.supabase.co', '');
const DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD || process.env.SUPABASE_SERVICE_ROLE_KEY;

// Direct connection string to Supabase postgres
const connStr = `postgresql://postgres.${projectRef}:${DB_PASSWORD}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;
console.log(`Trying connection to project: ${projectRef}...`);

const sql = fs.readFileSync('supabase/migrations/hotfix_rpc_diamond_column.sql', 'utf-8');

async function run() {
    const client = new Client({
        connectionString: connStr,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 10000
    });

    try {
        await client.connect();
        console.log('CONNECTED to Supabase DB!');

        console.log('Executing DDL Patch...');
        await client.query(sql);
        console.log('✅ PATCH APPLIED SUCCESSFULLY. The add_diamonds_to_balance RPC is now fixed.');

    } catch (err) {
        console.error('❌ DB EXECUTION FAILED:', err.message);
    } finally {
        await client.end();
    }
}

run();
