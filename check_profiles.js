import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzczMDg0NCwiZXhwIjoyMDgzMzA2ODQ0fQ.bbDqj-me78PID99npWCZ5qUuINSC1-eCBb1BVhgiSRs';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkProfiles() {
    console.log('Checking profiles for horse patterns...');
    
    // Check for profiles that might be bots/horses
    const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, bio, is_bot')
        .or('id.like.horse-%,id.like.player-%,is_bot.eq.true');

    if (error) {
        console.error('Error fetching profiles:', error);
        return;
    }

    console.log(`Found ${profiles.length} potential bot profiles.`);
    
    let needsUpdate = 0;
    
    for (const p of profiles) {
        console.log(`- ${p.display_name} (${p.username}) - id: ${p.id}, bot: ${p.is_bot}, bio: ${p.bio}`);
        if (p.is_bot || p.id.startsWith('horse-')) {
            needsUpdate++;
        }
    }
    
    console.log(`Total needing updates: ${needsUpdate}`);
}

checkProfiles().catch(console.error);
