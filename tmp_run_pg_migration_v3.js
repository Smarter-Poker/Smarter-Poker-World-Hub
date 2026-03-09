const fs = require('fs');
const { Pool } = require('pg');

const passwords = ['215SlalomCt!', 'Bek454545!!', 'gbpAM0n7jNBzY4Co'];
const projectRef = 'kuklfnapbkmacvwxktbh';

const connStrings = passwords.map(pw => `postgresql://postgres:${pw}@db.${projectRef}.supabase.co:5432/postgres`);

const sqlPath = '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/supabase/migrations/20260308_geeves_missed_questions.sql';
const sql = fs.readFileSync(sqlPath, 'utf-8');

async function tryConnect(connStr) {
    const pool = new Pool({
        connectionString: connStr,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000
    });
    const client = await pool.connect();
    return { client, pool };
}

async function run() {
    let client, pool;

    for (const cs of connStrings) {
        const masked = cs.substring(0, 30) + '...';
        try {
            console.log(`Trying port 5432 connection ${masked} ...`);
            ({ client, pool } = await tryConnect(cs));
            console.log('CONNECTED successfully to native Postgres (5432)!');
            break;
        } catch (e) {
            console.log(`  Failed: ${e.message}`);
        }
    }

    if (!client) {
        console.log('\n⚠️  Could not connect to Postgres natively.');
        process.exit(1);
    }

    try {
        console.log('Executing Geeves SQL Migration...');
        await client.query(sql);
        console.log('Migration successfully applied.');
        
        try {
             await client.query(`INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('20260308101010') ON CONFLICT DO NOTHING;`);
        } catch (err) {}
        
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
