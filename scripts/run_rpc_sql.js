const fs = require('fs');
const envFile = fs.readFileSync('.env.local', 'utf8');
const env = envFile.split('\n').reduce((acc, line) => {
    if (line && line.includes('=')) {
        const [key, ...val] = line.split('=');
        acc[key.trim()] = val.join('=').trim().replace(/^"|"$/g, '');
    }
    return acc;
}, {});

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    const sql = fs.readFileSync('supabase/migrations/20260501000000_add_messenger_last_message_trigger.sql', 'utf8');
    const { data, error } = await supabase.rpc('run_sql', { p_sql: sql });
    console.log(data, error);
}

main();
