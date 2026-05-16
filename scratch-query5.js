const { Client } = require('pg');
require('dotenv').config({ path: '.env.production.local' });
require('dotenv').config({ path: '.env.local' });
async function run() {
    const client = new Client({
        connectionString: `postgresql://postgres.kuklfnapbkmacvwxktbh:${process.env.SUPABASE_DB_PASSWORD}@aws-0-us-west-2.pooler.supabase.com:6543/postgres`
    });
    await client.connect();
    const res = await client.query(`
        SELECT
            tc.table_schema, 
            tc.constraint_name, 
            tc.table_name, 
            kcu.column_name, 
            ccu.table_schema AS foreign_table_schema,
            ccu.table_name AS foreign_table_name,
            ccu.column_name AS foreign_column_name 
        FROM 
            information_schema.table_constraints AS tc 
            JOIN information_schema.key_column_usage AS kcu
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
              ON ccu.constraint_name = tc.constraint_name
              AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_name = 'live_help_tickets_conversation_id_fkey';
    `);
    console.log(res.rows);
    await client.end();
}
run();
