import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const userId = 'af9aa869-f19d-47e0-89be-461473924d3e';

    // Check if he has any venues or subscriptions
    const { data: subs } = await supabase.from('commander_subscriptions').select('*').eq('owner_id', userId);
    console.log('Subscriptions:', subs);

    const { data: staff } = await supabase.from('commander_staff').select('*').eq('user_id', userId);
    console.log('Staff Roles:', staff);

    // If we need to create a venue, what does poker_venues need?
    const { data: venueEx } = await supabase.from('poker_venues').select('*').limit(1);
    console.log('Venue Example:', venueEx);
}
run();
