// Seed diamond balances for all users
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const STARTING_DIAMONDS = 100;

async function initDiamonds() {
    console.log('🔧 Initializing diamond balances...');

    // Get all profiles
    const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id');

    if (profileError) {
        console.error('Error fetching profiles:', profileError.message);
        return;
    }

    console.log(`Found ${profiles.length} profiles`);

    // Get existing diamond records
    const { data: existingDiamonds } = await supabase
        .from('user_diamonds')
        .select('user_id');

    const existingUserIds = new Set((existingDiamonds || []).map(d => d.user_id));
    console.log(`Existing diamond records: ${existingUserIds.size}`);

    // Filter to users without diamonds
    const usersNeedingDiamonds = profiles.filter(p => !existingUserIds.has(p.id));
    console.log(`Users needing diamonds: ${usersNeedingDiamonds.length}`);

    if (usersNeedingDiamonds.length === 0) {
        console.log('✅ All users already have diamonds');
        return;
    }

    // Insert diamond records
    const records = usersNeedingDiamonds.map(p => ({
        user_id: p.id,
        balance: STARTING_DIAMONDS,
        lifetime_earned: STARTING_DIAMONDS,
        lifetime_spent: 0
    }));

    const { error } = await supabase
        .from('user_diamonds')
        .upsert(records, { onConflict: 'user_id' });

    if (error) {
        console.error('Error inserting diamonds:', error.message);
    } else {
        console.log(`✅ Seeded ${records.length} users with ${STARTING_DIAMONDS} diamonds each`);
        console.log(`Total diamonds distributed: ${records.length * STARTING_DIAMONDS}`);
    }
}

initDiamonds().catch(console.error);
