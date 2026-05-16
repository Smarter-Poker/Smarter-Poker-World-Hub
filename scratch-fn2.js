const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
    const { data } = await supabase.rpc('exec_sql', { sql: "SELECT prosrc FROM pg_proc WHERE proname = 'fn_get_or_create_conversation';" });
    console.log(data);
}
run();
