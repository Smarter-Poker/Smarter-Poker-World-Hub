const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data, error } = await supabase.rpc('get_tables_hack');
    if (error) {
        console.log("RPC failed, trying raw query via select on information_schema");
        const { data: d2, error: e2 } = await supabase
            .from('information_schema.tables')
            .select('*')
            .eq('table_schema', 'public')
            .limit(100);
        console.log(e2 ? e2.message : d2.map(t => t.table_name));
    } else {
        console.log(data);
    }
}
check();
