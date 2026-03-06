require('dotenv').config({ path: '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.env.local' });
const { createClient } = require('@supabase/supabase-js');
const pg = require('pg');

async function runSQL() {
    const sql = `
        ALTER TABLE content_settings 
        ADD COLUMN IF NOT EXISTS grinder_max_tables integer DEFAULT 4,
        ADD COLUMN IF NOT EXISTS grinder_daily_hours integer DEFAULT 16,
        ADD COLUMN IF NOT EXISTS grinder_starting_chips integer DEFAULT 10000,
        ADD COLUMN IF NOT EXISTS grinder_ai_model text DEFAULT 'gpt-4o';
    `;

    console.log("Connecting to PostgreSQL...");
    const client = new pg.Client({
        connectionString: process.env.DATABASE_URL
    });

    try {
        await client.connect();
        await client.query(sql);
        console.log("Migration successful!");
    } catch (e) {
        console.error("Migration failed:", e);
    } finally {
        await client.end();
    }
}
runSQL();
