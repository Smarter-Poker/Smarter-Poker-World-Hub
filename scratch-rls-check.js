const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
    const { data } = await supabase.rpc('exec_sql', { sql: "SELECT * FROM pg_policies WHERE tablename = 'live_help_tickets';" });
    console.log(data);
}
run();
