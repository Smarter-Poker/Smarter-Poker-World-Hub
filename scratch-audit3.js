const { Client } = require('pg');
require('dotenv').config({ path: '.env.production.local' });
require('dotenv').config({ path: '.env.local' });
async function run() {
    const client = new Client({
        connectionString: `postgresql://postgres.kuklfnapbkmacvwxktbh:${process.env.SUPABASE_DB_PASSWORD}@aws-0-us-west-2.pooler.supabase.com:6543/postgres`
    });
    await client.connect();
    
    // Check fn_get_or_create_conversation full source - critical for security definer gap
    const fnRes = await client.query(`SELECT prosrc, prosecdef FROM pg_proc WHERE proname = 'fn_get_or_create_conversation';`);
    console.log('=== FN_GET_OR_CREATE_CONVERSATION FULL SOURCE ===');
    console.log(fnRes.rows[0]?.prosrc);
    console.log('\n=== SECURITY DEFINER:', fnRes.rows[0]?.prosecdef);

    // Check if priority has a check constraint
    const constraintRes = await client.query(`
        SELECT c.conname, pg_get_constraintdef(c.oid) 
        FROM pg_constraint c JOIN pg_class t ON c.conrelid = t.oid
        WHERE t.relname = 'live_help_tickets';
    `);
    console.log('\n=== ALL CONSTRAINTS ON LIVE_HELP_TICKETS ===');
    console.log(constraintRes.rows);

    // Check if there is an index for performance on created_at
    const indexRes = await client.query(`
        SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'live_help_tickets';
    `);
    console.log('\n=== INDEXES ON LIVE_HELP_TICKETS ===');
    console.log(indexRes.rows);

    await client.end();
}
run();
