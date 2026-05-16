const { Client } = require('pg');
require('dotenv').config({ path: '.env.production.local' });
require('dotenv').config({ path: '.env.local' });
async function run() {
    const client = new Client({
        connectionString: `postgresql://postgres.kuklfnapbkmacvwxktbh:${process.env.SUPABASE_DB_PASSWORD}@aws-0-us-west-2.pooler.supabase.com:6543/postgres`
    });
    await client.connect();
    const res = await client.query(`
        SELECT prosrc 
        FROM pg_proc 
        WHERE proname = 'fn_get_or_create_conversation';
    `);
    console.log(res.rows[0].prosrc.substring(0, 500));
    await client.end();
}
run();
