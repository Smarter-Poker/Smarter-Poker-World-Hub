const { Client } = require('pg');
require('dotenv').config({ path: '.env.production.local' });
require('dotenv').config({ path: '.env.local' });
async function run() {
    const client = new Client({
        connectionString: `postgresql://postgres.kuklfnapbkmacvwxktbh:${process.env.SUPABASE_DB_PASSWORD}@aws-0-us-west-2.pooler.supabase.com:6543/postgres`
    });
    await client.connect();
    const res = await client.query("SELECT * FROM pg_policies WHERE tablename = 'promo_codes';");
    console.log(res.rows);
    await client.end();
}
run();
