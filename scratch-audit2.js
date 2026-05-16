const { Client } = require('pg');
require('dotenv').config({ path: '.env.production.local' });
require('dotenv').config({ path: '.env.local' });
async function run() {
    const client = new Client({
        connectionString: `postgresql://postgres.kuklfnapbkmacvwxktbh:${process.env.SUPABASE_DB_PASSWORD}@aws-0-us-west-2.pooler.supabase.com:6543/postgres`
    });
    await client.connect();
    
    // 1. Check fn_send_message - is it SECURITY DEFINER?
    const fnSendSecRes = await client.query(`SELECT proname, prosecdef FROM pg_proc WHERE proname = 'fn_send_message';`);
    console.log('=== FN_SEND_MESSAGE SECURITY DEFINER ===');
    console.log(fnSendSecRes.rows);
    
    // 2. Check full source of fn_submit_bug_report_to_admin
    const fnSubmitRes = await client.query(`SELECT prosrc FROM pg_proc WHERE proname = 'fn_submit_bug_report_to_admin';`);
    console.log('\n=== FN_SUBMIT_BUG_REPORT_TO_ADMIN FULL SOURCE ===');
    console.log(fnSubmitRes.rows[0]?.prosrc);
    
    // 3. Check if updated_at trigger exists on live_help_tickets
    const triggerRes = await client.query(`
        SELECT trigger_name FROM information_schema.triggers 
        WHERE event_object_table = 'live_help_tickets';
    `);
    console.log('\n=== TRIGGERS ON LIVE_HELP_TICKETS ===');
    console.log(triggerRes.rows);
    
    // 4. Check all RLS policies on live_help_tickets
    const rlsRes = await client.query(`SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE tablename = 'live_help_tickets';`);
    console.log('\n=== ALL RLS POLICIES ON LIVE_HELP_TICKETS ===');
    console.log(rlsRes.rows);

    // 5. Check the user_id NOT NULL constraint — blocks anonymous reports
    const nullableRes = await client.query(`SELECT column_name, is_nullable FROM information_schema.columns 
        WHERE table_name = 'live_help_tickets' AND column_name = 'user_id';`);
    console.log('\n=== USER_ID NULLABLE? ===');
    console.log(nullableRes.rows);
    
    // 6. Check the rate limit module
    await client.end();
}
run();
