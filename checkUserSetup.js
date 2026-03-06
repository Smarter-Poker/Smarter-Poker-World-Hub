const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function setup() {
    const emails = ['johndonnahue4485@yahoo.com', 'johnnyd4485@yahoo.com'];

    let userProfile = null;
    for (const email of emails) {
        const { data } = await supabase.from('profiles').select('*').ilike('email', email).maybeSingle();
        if (data) {
            userProfile = data;
            break;
        }
    }

    if (!userProfile) {
        console.log("User not found in profiles for either email. Please create the user or sign up first.");
        return;
    }

    console.log("Found profile:", userProfile.email, userProfile.id);
    console.log("VIP status:", userProfile.is_vip, "Level:", userProfile.vip_level);
    console.log("Access tier:", userProfile.access_tier, "Role:", userProfile.role);

    // Check clubs
    const { data: clubs } = await supabase.from('clubs').select('*').eq('owner_id', userProfile.id);
    console.log("Owned Clubs:", clubs?.length || 0);
    if (clubs && clubs.length > 0) {
        console.log("Club ID:", clubs[0].id, "Name:", clubs[0].name);
    }
}

setup();
