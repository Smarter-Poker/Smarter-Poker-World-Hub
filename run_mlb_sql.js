require('dotenv').config({ path: '.env.vercel' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function run() {
    const supabase = createClient(
        process.env.MLB_SUPABASE_URL,
        process.env.MLB_SUPABASE_SERVICE_KEY,
        { auth: { persistSession: false } }
    );
    
    const sql = fs.readFileSync('supabase/migrations/20260618000004_mlb_status_rpc.sql', 'utf8');
    
    // Split on $$ to extract the function body, or simply send the entire query.
    // Actually, createClient doesn't support raw SQL execution without pg or a custom RPC.
    // The previous agent created an "exec_sql" RPC on the main database. Let's see if MLB database has exec_sql.
    const { data, error } = await supabase.rpc('exec_sql', { sql });
    
    if (error) {
        console.error('Error executing SQL via exec_sql:', error);
    } else {
        console.log('SQL Executed successfully:', data);
    }
}
run();
