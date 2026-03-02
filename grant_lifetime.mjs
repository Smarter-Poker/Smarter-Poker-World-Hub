import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const userId = 'af9aa869-f19d-47e0-89be-461473924d3e';

    console.log('1. Updating Smarter.Poker Profile to Lifetime VIP');
    const { data: profileObj, error: pErr } = await supabase
        .from('profiles')
        .update({
            is_vip: true,
            vip_level: 'lifetime',
            vip_tier: 'lifetime',
            access_tier: 'Full_Access',
            vip_expires_at: null
        })
        .eq('id', userId)
        .select();
    if (pErr) console.error('Profile update error:', pErr);
    else console.log('Profile updated successfully:', profileObj[0].id);

    console.log('2. Updating Club Commander Subscriptions to Lifetime Free');
    // Set all their subscriptions to active, 0 monthly price, and no trial end date
    const { data: subs, error: sErr } = await supabase
        .from('commander_subscriptions')
        .update({
            status: 'active',
            monthly_price: 0,
            trial_ends_at: null,
            next_billing_date: new Date('2099-12-31').toISOString() // practically lifetime
        })
        .eq('owner_id', userId)
        .select();

    if (sErr) console.error('Subscriptions update error:', sErr);
    else console.log('Subscriptions updated successfully:', subs.length, 'records');
}
run();
