const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkMember() {
    const { data: profile } = await supabase.from('profiles').select('id').eq('email', 'johndonnahue4485@yahoo.com').single();
    const { data: venue } = await supabase.from('poker_venues').select('id').eq('claimed_by', profile.id).single();

    const { data: members, error } = await supabase
        .from('club_members')
        .select('*, profiles(id, email)')
        .eq('club_id', venue.id);

    console.log("Total members in club:", members?.length ?? 0);
    if (members && members.length > 0) {
        console.log("Members data:", JSON.stringify(members, null, 2));
    } else if (error) {
        console.log("Error fetching members:", error);
    }
}
checkMember();
