const { Client } = require('pg');
require('dotenv').config({ path: '.env.production.local' });
require('dotenv').config({ path: '.env.local' });
async function run() {
    const client = new Client({
        connectionString: `postgresql://postgres.kuklfnapbkmacvwxktbh:${process.env.SUPABASE_DB_PASSWORD}@aws-0-us-west-2.pooler.supabase.com:6543/postgres`
    });
    await client.connect();
    
    // 1. Check live_help_tickets schema (all columns)
    const schemaRes = await client.query(`SELECT column_name, data_type, is_nullable, column_default 
        FROM information_schema.columns 
        WHERE table_name = 'live_help_tickets' AND table_schema = 'public'
        ORDER BY ordinal_position;`);
    console.log('=== LIVE_HELP_TICKETS SCHEMA ===');
    console.log(schemaRes.rows);
    
    // 2. Check if table has RLS enabled
    const rlsRes = await client.query(`SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'live_help_tickets';`);
    console.log('\n=== RLS ENABLED ===');
    console.log(rlsRes.rows);
    
    // 3. Check fn_submit_bug_report_to_admin permissions
    const fnPermsRes = await client.query(`SELECT proname, prosecdef, provolatile FROM pg_proc WHERE proname = 'fn_submit_bug_report_to_admin';`);
    console.log('\n=== FN PERMISSIONS ===');
    console.log(fnPermsRes.rows);
    
    // 4. Check fn_send_message signature
    const fnSendRes = await client.query(`SELECT prosrc FROM pg_proc WHERE proname = 'fn_send_message' LIMIT 1;`);
    console.log('\n=== FN_SEND_MESSAGE (first 600 chars) ===');
    console.log(fnSendRes.rows[0]?.prosrc?.substring(0, 600));
    
    // 5. Check fn_get_or_create_conversation security
    const fnConvRes = await client.query(`SELECT prosecdef FROM pg_proc WHERE proname = 'fn_get_or_create_conversation';`);
    console.log('\n=== FN_GET_OR_CREATE_CONVERSATION SECURITY DEFINER ===');
    console.log(fnConvRes.rows);
    
    // 6. Check if there are any tickets without conversation_id 
    const missingConvRes = await client.query(`SELECT COUNT(*) FROM public.live_help_tickets WHERE conversation_id IS NULL;`);
    console.log('\n=== TICKETS WITHOUT CONVERSATION_ID ===');
    console.log(missingConvRes.rows);
    
    // 7. Check Supabase messenger - does the cid deep link work?
    const convRes = await client.query(`SELECT id FROM public.social_conversations ORDER BY created_at DESC LIMIT 3;`);
    console.log('\n=== RECENT SOCIAL_CONVERSATIONS IDs ===');
    console.log(convRes.rows);

    await client.end();
}
run();
