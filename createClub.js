const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function createClub() {
    const uid = '1ed711e3-33bb-40e5-ac06-7d3e67fe3484'; // johnnyd4485@yahoo.com

    // 1. Create a club
    const clubData = {
        name: 'Johnny D Poker Room',
        description: 'The exclusive room for Johnny D.',
        owner_id: uid,
        club_slug: 'johnny-d-poker-2',
        is_premium: true,
        subscription_status: 'active'
    };

    const { data: club, error: clubErr } = await supabase
        .from('clubs')
        .insert(clubData)
        .select()
        .single();

    if (clubErr) {
        if (clubErr.code === '23505') {
            console.log("Club slug already exists.");
        } else {
            console.error("Error creating club:", clubErr);
        }
    }

    const { data: existingClub, error: exErr } = await supabase.from('clubs').select('*').eq('owner_id', uid).limit(1).maybeSingle();
    const activeClub = club || existingClub;

    if (!activeClub) {
        console.log("No active club found for user, and creation failed.", exErr);
        return;
    }

    console.log("Club created/found:", activeClub.id);

    // 2. Add user as member with owner role
    const memberData = {
        club_id: activeClub.id,
        user_id: uid,
        role: 'owner',
        status: 'active'
    };

    const { error: memErr } = await supabase
        .from('club_members')
        .upsert(memberData, { onConflict: 'club_id,user_id' });

    if (memErr) {
        console.error("Error adding member:", memErr);
    } else {
        console.log("User added as owner to club.");
    }
}

createClub();
