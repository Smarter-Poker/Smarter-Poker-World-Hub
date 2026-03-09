const fs = require('fs');
const { Client } = require('pg');
// IPv4 Pooler string for bypass
const connStr = 'postgresql://postgres.kuklfnapbkmacvwxktbh:gbpAM0n7jNBzY4Co@aws-0-us-east-1.pooler.supabase.com:6543/postgres';
const sql = fs.readFileSync('supabase/migrations/20260309162811_hotfix_rpc_diamond_column.sql', 'utf-8');

async function run() {
    console.log(`Trying direct IPv6 connection to Supabase...`);
    const client = new Client({
        connectionString: connStr,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 15000
    });

    try {
        await client.connect();
        console.log('CONNECTED to Supabase DB natively!');

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
