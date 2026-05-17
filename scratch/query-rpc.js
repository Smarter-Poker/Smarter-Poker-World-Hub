const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const dotenvPaths = [
    path.resolve(__dirname, '..', '.env.local'),
    path.resolve(__dirname, '..', '.env.prod'),
    path.resolve(__dirname, '..', '.env.production.local'),
];
try {
    const dotenv = require('dotenv');
    for (const envPath of dotenvPaths) {
        if (fs.existsSync(envPath)) {
            dotenv.config({ path: envPath });
        }
    }
} catch (_) {}

const projectRef = process.env.SUPABASE_PROJECT_REF || 'kuklfnapbkmacvwxktbh';
const pw = process.env.SUPABASE_DB_PASSWORD || process.env.POSTGRES_PASSWORD;

if (!pw) {
    console.error('No password found!');
    process.exit(1);
}

const pool = new Pool({
    host: 'aws-0-us-west-2.pooler.supabase.com',
    port: 6543,
    user: `postgres.${projectRef}`,
    password: pw,
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
});

async function main() {
    const client = await pool.connect();
    try {
        console.log("--- 1. Overload Check ---");
        const res = await client.query(`
            SELECT pg_get_function_arguments(p.oid) AS args, pg_get_function_result(p.oid) AS result
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'fn_check_anti_farming_gift_cap';
        `);
        console.log(res.rows);
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch(console.error);
