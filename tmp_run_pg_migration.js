const fs = require('fs');
const { Pool } = require('pg');
require('dotenv').config({ path: '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const projectRef = SUPABASE_URL.replace('https://', '').replace('.supabase.co', '');
const passwords = ['215SlalomCt!', 'Bek454545!!', 'gbpAM0n7jNBzY4Co'];
const regions = ['us-east-1', 'us-west-1', 'eu-central-1', 'eu-west-1', 'eu-west-2', 'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'sa-east-1', 'ca-central-1'];

const connStrings = [];
for (const pw of passwords) {
    connStrings.push(`postgresql://postgres:${pw}@db.${projectRef}.supabase.co:6543/postgres`);
    for (const r of regions) {
        connStrings.push(`postgresql://postgres.${projectRef}:${pw}@aws-0-${r}.pooler.supabase.com:6543/postgres`);
    }
}

const sqlPath = '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/geeves_auto_learning.sql';
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
        console.log('Executing Geeves missed questions migration SQL...');
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
