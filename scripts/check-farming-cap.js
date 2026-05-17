const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Load environment variables
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
            console.log('Loaded env from:', envPath);
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
        console.log('Connected to DB. Checking fn_check_anti_farming_gift_cap overloads...');
        const res = await client.query(`
            SELECT 
                p.proname as function_name,
                pg_catalog.pg_get_function_identity_arguments(p.oid) as arguments,
                pg_catalog.pg_get_functiondef(p.oid) as definition
            FROM pg_catalog.pg_proc p
            JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public'
              AND p.proname = 'fn_check_anti_farming_gift_cap';
        `);

        console.log(`Found ${res.rows.length} overloads:\n`);
        for (const row of res.rows) {
            console.log(`Function: ${row.function_name}`);
            console.log(`Arguments: ${row.arguments}`);
            console.log(`Definition:\n${row.definition}\n`);
            console.log('-'.repeat(80));
        }

        // Also check if there are compilation errors in the trigger by testing the deduct_diamonds RPC
        console.log('\nTesting a dummy deduct_diamonds call to see if it throws a trigger compilation error...');
        try {
            const testDeduct = await client.query(`
                SELECT * FROM public.deduct_diamonds(
                    '47965354-0e56-43ef-931c-ddaab82af765', -- dummy user ID (Kingfish or random)
                    1,
                    'Test deduct',
                    'live_gift_sent',
                    'test_ref_id',
                    '{"recipient_id": "47965354-0e56-43ef-931c-ddaab82af765"}'::jsonb
                );
            `);
            console.log('Result of dummy deduct:', testDeduct.rows);
        } catch (err) {
            console.error('Dummy deduct failed! Error:', err.message);
            console.error('Error stack:', err);
        }
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch(console.error);
