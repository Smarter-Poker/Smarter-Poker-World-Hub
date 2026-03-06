require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function test() {
    // get a random user who has gigs
    const { data: users } = await supabase.from('toke_gigs').select('user_id').limit(1);
    const userId = users[0].user_id;
    console.log("Testing fetchGigs for user:", userId);
    
    // Now simulate fetchGigs logic
    const { data, error } = await supabase
        .from('toke_gigs')
        .select('*')
        .eq('user_id', userId)
        .neq('status', 'deleted')
        .order('start_date', { ascending: false });

    if (error) { console.error("Error fetching gigs:", error); return; }
    console.log("Gigs count:", data?.length);

    if (data && data.length > 0) {
        const gigIds = data.map(g => g.id);
        const [{ data: downs, error: dErr }, { data: exps, error: eErr }] = await Promise.all([
            supabase.from('toke_downs').select('*').in('gig_id', gigIds),
            supabase.from('toke_expenses').select('*').in('gig_id', gigIds)
        ]);
        if (dErr) console.error("Downs error:", dErr);
        if (eErr) console.error("Exps error:", eErr);
        console.log("Downs:", downs?.length, "Exps:", exps?.length);
    }
}
test();
