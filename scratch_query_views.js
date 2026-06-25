require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
async function run() {
    const supabase = createClient(
        process.env.MLB_SUPABASE_URL,
        process.env.MLB_SUPABASE_SERVICE_KEY,
        { auth: { persistSession: false } }
    );
    const sql = `
        SELECT viewname, definition 
        FROM pg_views 
        WHERE schemaname = 'public' 
          AND viewname LIKE 'v_mlb_%';
    `;
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
    if (error) {
        console.error('Error with exec_sql (trying sql_string):', error);
        const { data: d2, error: e2 } = await supabase.rpc('exec_sql', { sql_string: sql });
        if(e2) {
             const { data: d3, error: e3 } = await supabase.rpc('exec_sql', { query: sql });
             if(e3) {
                  const { data: d4, error: e4 } = await supabase.rpc('exec_sql', { sql });
                  console.log(e4 ? e4 : d4);
             } else console.log(d3);
        } else console.log(d2);
    } else {
        console.log(JSON.stringify(data, null, 2));
    }
}
run();
