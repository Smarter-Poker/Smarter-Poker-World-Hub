require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applySql() {
    const filePath = process.argv[2];
    if (!filePath) {
        console.error("Usage: node push-sql-via-rpc.js <path_to_sql_file>");
        process.exit(1);
    }
    
    console.log(`Executing SQL from ${filePath} via exec_sql RPC...`);
    const sql = fs.readFileSync(path.resolve(filePath), 'utf8');

    // Actually, standard Supabase Data API doesn't allow raw DDL via REST unless 
    // we have the `exec_sql` RPC or the `postgres` driver. 
    // Let's check if the generic `exec_sql` RPC exists first.
    const { data, error } = await supabase.rpc('exec_sql', { query: sql });

    if (error) {
        console.error("exec_sql failed:", error);
    } else {
        console.log("SQL executed successfully via RPC.", data);
    }
}

applySql();
