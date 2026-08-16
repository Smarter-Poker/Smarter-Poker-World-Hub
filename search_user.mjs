import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.production.local' });

const client = new Client({
  host: 'db.kuklfnapbkmacvwxktbh.supabase.co',
  port: 5432,
  user: 'postgres',
  password: process.env.SUPABASE_DB_PASSWORD,
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  const { rows: tables } = await client.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND data_type IN ('text', 'character varying');
  `);
  
  for (const table of tables) {
    try {
      const { rows } = await client.query(`
        SELECT * FROM public."${table.table_name}"
        WHERE "${table.column_name}" ILIKE '%dapper%'
      `);
      if (rows.length > 0) {
        console.log(`Found in ${table.table_name} column ${table.column_name}:`);
        console.log(rows);
      }
    } catch (e) {
      // Ignore errors for unqueryable tables/columns
    }
  }
  console.log("Done searching all text columns in public schema.");
  await client.end();
}
run().catch(console.error);
