const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

async function fixJAQK() {
    const jaqkRes = await supabase.from('poker_venues').select('id, name, logo_url').ilike('name', '%JAQK%');
    console.log("JAQK venues:", jaqkRes.data);
    
    // Merge waitlist history from bad -> good
    if (jaqkRes.data) {
        const bad = jaqkRes.data.find(v => !v.logo_url);
        const good = jaqkRes.data.find(v => v.logo_url);
        if (bad && good) {
             console.log(`Migrating data from ${bad.id} to ${good.id}`);
             
             // Migrate commander_waitlist_history
             const up1 = await supabase.from('commander_waitlist_history').update({ venue_id: good.id }).eq('venue_id', bad.id);
             console.log("Migrate commander_waitlist_history:", up1.error ? up1.error : "OK");
             
             // Migrate venues_checkins
             const up2 = await supabase.from('venue_checkins').update({ venue_id: good.id }).eq('venue_id', bad.id);
             console.log("Migrate venue_checkins:", up2.error ? up2.error : "OK");

             // Delete bad
             const del = await supabase.from('poker_venues').delete().eq('id', bad.id);
             console.log("Delete bad venue:", del.error ? del.error : "OK");
        }
    }
}

fixJAQK();
