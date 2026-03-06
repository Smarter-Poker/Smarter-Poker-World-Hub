import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const email = 'johnnyd4485@yahoo.com';
    console.log('=== UPGRADE JOHNNYD4485@YAHOO.COM ===\n');

    // ─── Step 1: Locate User ─────────────────────────────────────────
    console.log('1. Looking up user profile...');
    const { data: profile, error: lookupErr } = await supabase
        .from('profiles')
        .select('id, email, player_number, is_vip, vip_level, vip_tier, access_tier, vip_expires_at')
        .ilike('email', email)
        .single();

    if (lookupErr || !profile) {
        console.error('❌ Profile not found for', email, lookupErr);
        return;
    }
    console.log('   Found user:', profile.id);
    console.log('   Current VIP status:', { is_vip: profile.is_vip, vip_level: profile.vip_level, vip_tier: profile.vip_tier, access_tier: profile.access_tier });

    // ─── Step 2: Grant Lifetime VIP ──────────────────────────────────
    console.log('\n2. Granting Lifetime VIP on profiles...');
    const { data: updatedProfile, error: vipErr } = await supabase
        .from('profiles')
        .update({
            is_vip: true,
            vip_level: 'lifetime',
            vip_tier: 'lifetime',
            access_tier: 'Full_Access',
            vip_expires_at: null
        })
        .eq('id', profile.id)
        .select('id, is_vip, vip_level, vip_tier, access_tier, vip_expires_at');

    if (vipErr) console.error('❌ VIP Grant Error:', vipErr);
    else console.log('   ✅ VIP updated:', updatedProfile[0]);

    // ─── Step 3: Check existing Commander Subscriptions ──────────────
    console.log('\n3. Checking existing Commander Subscriptions...');
    const { data: existingSubs, error: subLookupErr } = await supabase
        .from('commander_subscriptions')
        .select('id, owner_id, venue_id, tier, status, monthly_price, trial_ends_at, next_billing_date')
        .eq('owner_id', profile.id);

    if (subLookupErr) {
        console.error('❌ Subscription lookup error:', subLookupErr);
    } else {
        console.log('   Found', existingSubs.length, 'subscription(s)');
        existingSubs.forEach((s, i) => {
            console.log(`   Sub ${i + 1}:`, { id: s.id, tier: s.tier, status: s.status, venue_id: s.venue_id, monthly_price: s.monthly_price });
        });
    }

    // ─── Step 4: Upgrade Commander Subscriptions to Club + Lifetime ──
    if (existingSubs && existingSubs.length > 0) {
        console.log('\n4. Upgrading Commander Subscriptions to Club tier + Lifetime Free...');
        const { data: updatedSubs, error: subErr } = await supabase
            .from('commander_subscriptions')
            .update({
                status: 'active',
                tier: 'club',
                monthly_price: 0,
                trial_ends_at: null,
                next_billing_date: '2099-12-31T00:00:00.000Z'
            })
            .eq('owner_id', profile.id)
            .select('id, tier, status, monthly_price, trial_ends_at, next_billing_date, venue_id');

        if (subErr) console.error('❌ Subscription upgrade error:', subErr);
        else {
            console.log('   ✅ Subscription(s) upgraded:');
            updatedSubs.forEach((s, i) => {
                console.log(`   Sub ${i + 1}:`, s);
            });
        }
    } else {
        console.log('\n4. ⚠️  No commander_subscriptions found for this user.');
        console.log('   They may not have registered a venue yet. VIP was still granted.');
    }

    console.log('\n=== UPGRADE COMPLETE ===');
    console.log('User:', email);
    console.log('UUID:', profile.id);
    console.log('VIP: Lifetime');
    console.log('Commander: Club tier, $0/month, no expiry');
}

run();
