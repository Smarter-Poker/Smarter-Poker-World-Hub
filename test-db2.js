const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.env.local', 'utf8');
const pUrl = envFile.match(/NEXT_PUBLIC_SUPABASE_URL=([^\n]+)/)[1];
const pKey = envFile.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=([^\n]+)/)[1];

const supabase = createClient(pUrl.trim(), pKey.trim());

async function test() {
    const { data: v, error: e1 } = await supabase.from('db_venues').select('id, name').ilike('name', '%Victoria%');
    console.log(v);
}
test();
