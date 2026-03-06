const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function check() {
    const envContent = fs.readFileSync('.env.local', 'utf8');
    const dbUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1];
    const dbKey = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1];

    const supabase = createClient(dbUrl, dbKey);

    const { data, error } = await supabase.from('clubs').select('id, name, club_id').ilike('name', '%shark%').limit(5);
    console.log(JSON.stringify(data, null, 2));
}

check();
