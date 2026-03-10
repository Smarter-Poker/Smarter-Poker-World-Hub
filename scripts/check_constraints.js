const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

// Supabase Connection String format
const connectionString = `postgres://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.kuklfnapbkmacvwxktbh.supabase.co:5432/postgres`;

const pool = new Pool({
    connectionString,
});

async function inspectConstraints() {
    try {
        const res = await pool.query(`
      SELECT pg_get_constraintdef(c.oid) AS constraint_definition
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      JOIN pg_class t ON t.oid = c.conrelid
      WHERE t.relname = 'tournament_registrations'
      AND c.contype = 'c';
    `);
        console.log("Constraints on tournament_registrations:");
        console.log(res.rows);
    } catch (err) {
        console.error("Error executing query:", err);
    } finally {
        pool.end();
    }
}

inspectConstraints();
