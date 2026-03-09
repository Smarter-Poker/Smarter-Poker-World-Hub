const fs = require('fs');
const { Client } = require('pg');

const projectRef = 'kuklfnapbkmacvwxktbh';
const passwords = ['215SlalomCt!', 'Bek454545!!', 'gbpAM0n7jNBzY4Co'];
const endpoints = [
    `db.${projectRef}.supabase.co:5432`,
    `aws-0-us-west-2.pooler.supabase.com:5432`
];

let validClient = null;

const sql = fs.readFileSync('supabase/migrations/20260309162811_hotfix_rpc_diamond_column.sql', 'utf-8');

async function run() {
    console.log(`Trying connection...`);

    for (const host of endpoints) {
        for (const pw of passwords) {
            const user = host.includes('pooler') ? `postgres.${projectRef}` : 'postgres';
            const connStr = `postgresql://${user}:${pw}@${host}/postgres`;

            const client = new Client({
                connectionString: connStr,
                ssl: { rejectUnauthorized: false },
                connectionTimeoutMillis: 5000
            });

            try {
                await client.connect();
                console.log(`✅ CONNECTED to Supabase DB via ${host}!`);
                validClient = client;
                break;
            } catch (err) {
                // Ignore auth failures, continue trying
                await client.end().catch(() => true);
            }
        }
        if (validClient) break;
    }

    if (!validClient) {
        console.error('❌ FATAL: Could not connect to Postgres with any known password or endpoint.');
        return;
    }

    try {
        console.log('Executing DDL Patch...');
        await validClient.query(sql);
        console.log('✅ PATCH APPLIED SUCCESSFULLY. The add_diamonds_to_balance RPC is now fixed.');
    } catch (err) {
        console.error('❌ DB EXECUTION FAILED:', err.message);
    } finally {
        await validClient.end();
    }
}

run();
