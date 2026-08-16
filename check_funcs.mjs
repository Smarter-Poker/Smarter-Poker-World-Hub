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
  const { rows } = await client.query(`
    SELECT p.proname 
    FROM pg_proc p 
    JOIN pg_namespace n ON n.oid = p.pronamespace 
    WHERE n.nspname = 'public' 
      AND p.prosecdef 
      AND has_function_privilege('anon', p.oid, 'EXECUTE') 
      AND p.prosrc ~* '\\m(insert|update|delete)\\M' 
      AND p.prosrc !~* 'auth\\.uid\\(\\)';
  `);
  console.log("Violating functions:");
  console.log(rows);
  await client.end();
}
run().catch(console.error);
