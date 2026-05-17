const { Client } = require('pg');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

const dotenvPaths = [
    path.resolve(__dirname, '..', '.env.local'),
    path.resolve(__dirname, '..', '.env.prod'),
    path.resolve(__dirname, '..', '.env.production.local'),
];
for (const envPath of dotenvPaths) {
    if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath });
    }
}

const password = process.env.SUPABASE_DB_PASSWORD;
if (!password) {
    console.error('No password found!');
    process.exit(1);
}

const connectionString = `postgresql://postgres:${encodeURIComponent(password)}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`;

async function main() {
    const client = new Client({ connectionString });
    await client.connect();
    console.log('Connected to DB.');

    const res = await client.query(`
        select 
            p.proname,
            pg_get_functiondef(p.oid) as def
        from pg_proc p
        join pg_namespace n on p.pronamespace = n.oid
        where n.nspname = 'public' and p.proname = 'fn_check_anti_farming_gift_cap';
    `);

    for (const row of res.rows) {
        console.log(`=========================================`);
        console.log(`Function: ${row.proname}`);
        console.log(`=========================================`);
        console.log(row.def);
        console.log(`\n\n`);
    }

    await client.end();
}

main().catch(console.error);
