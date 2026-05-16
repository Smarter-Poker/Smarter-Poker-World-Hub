const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
    const { data, error } = await supabase.rpc('exec_sql', { p_sql: "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'live_help_tickets';" });
    console.log(data || error);
}
run();
