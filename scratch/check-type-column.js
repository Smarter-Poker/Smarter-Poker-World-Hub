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
        const res = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_schema = 'public' 
              AND table_name = 'diamond_transactions';
        `);
        console.log(res.rows);
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch(console.error);
