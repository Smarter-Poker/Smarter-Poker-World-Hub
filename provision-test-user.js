const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function provisionUser() {
    const email = 'johndonnahue4485@yahoo.com';
    console.log(`Provisioning ${email}...`);

    const { data: profile } = await supabase.from('profiles').select('id').eq('email', email).single();
    if (!profile) return console.log('User not found!');

    await supabase.from('profiles').update({
        is_vip: true,
        vip_level: 'lifetime',
        vip_tier: 'lifetime',
        access_tier: 'Full_Access',
        vip_expires_at: null
    }).eq('id', profile.id);

    let { data: venue } = await supabase.from('poker_venues').select('*').eq('claimed_by', profile.id).single();

    if (!venue) {
        console.log('Creating venue...');
        const { data: newVenue, error: venueErr } = await supabase.from('poker_venues').insert({
            claimed_by: profile.id,
            is_claimed: true,
            name: 'E2E Test Poker Room',
            venue_type: 'club',
            city: 'Las Vegas',
            state: 'NV',
            is_active: true,
            commander_enabled: true
        }).select().single();
        if (venueErr) console.error('Error creating venue:', venueErr);
        venue = newVenue;
    }

    const { data: sub } = await supabase.from('commander_subscriptions').select('*').eq('owner_id', profile.id).single();

    if (!sub && venue) {
        console.log('Creating Commander Subscription...');
        const { error: subErr } = await supabase.from('commander_subscriptions').insert({
            owner_id: profile.id,
            venue_id: venue.id,
            status: 'active',
            tier: 'club',
            monthly_price: 0,
            trial_ends_at: '2099-12-31T23:59:59+00:00',
            next_billing_date: '2099-12-31T00:00:00+00:00',
            billing_name: 'John Donnahue',
            billing_email: email
        });
        if (subErr) console.error('Error creating sub:', subErr);
    } else if (sub) {
        console.log('Updating existing Commander Subscription...');
        await supabase.from('commander_subscriptions').update({
            status: 'active',
            tier: 'club',
            monthly_price: 0,
            trial_ends_at: '2099-12-31T23:59:59+00:00',
            next_billing_date: '2099-12-31T00:00:00+00:00'
        }).eq('id', sub.id);
    }

    console.log("✅ Provisioning complete!");
}

provisionUser();
