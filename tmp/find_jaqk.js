const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

async function findJAQK() {
    const res = await supabase.from('poker_venues').select('id, name, logo_url, city, state').ilike('name', '%JAQK%');
    console.table(res.data);
}

findJAQK();
