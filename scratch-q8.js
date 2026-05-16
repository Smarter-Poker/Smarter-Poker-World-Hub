const { Client } = require('pg');
require('dotenv').config({ path: '.env.production.local' });
require('dotenv').config({ path: '.env.local' });
async function run() {
    const client = new Client({
        connectionString: `postgresql://postgres.kuklfnapbkmacvwxktbh:${process.env.SUPABASE_DB_PASSWORD}@aws-0-us-west-2.pooler.supabase.com:6543/postgres`
    });
    await client.connect();
    const res = await client.query(`
        SELECT proname, pg_get_function_arguments(oid) as args, prosecdef
        FROM pg_proc WHERE proname = 'fn_get_or_create_conversation';
    `);
    console.log(res.rows);
    await client.end();
}
run();
