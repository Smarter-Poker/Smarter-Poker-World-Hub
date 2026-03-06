require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const sql = `
ALTER TABLE content_settings 
ADD COLUMN IF NOT EXISTS grinder_max_tables integer DEFAULT 4,
ADD COLUMN IF NOT EXISTS grinder_daily_hours integer DEFAULT 16,
ADD COLUMN IF NOT EXISTS grinder_starting_chips integer DEFAULT 10000,
ADD COLUMN IF NOT EXISTS grinder_ai_model text DEFAULT 'gpt-4o';
`;

async function runRpc() {
    const { data, error } = await supabase.rpc('exec_sql', { sql });
    console.log("RPC Error:", error);
    console.log("RPC Data:", data);
}
runRpc();
