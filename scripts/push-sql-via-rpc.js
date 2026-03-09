require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applySql() {
    const sql = fs.readFileSync('supabase/migrations/hotfix_rpc_diamond_column.sql', 'utf8');

    // Actually, standard Supabase Data API doesn't allow raw DDL via REST unless 
    // we have the `exec_sql` RPC or the `postgres` driver. 
    // Let's check if the generic `exec_sql` RPC exists first.
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
        console.error("exec_sql failed:", error.message);
    } else {
        console.log("SQL executed successfully via RPC.", data);
    }
}

applySql();
