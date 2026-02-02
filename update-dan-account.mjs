// Update Dan Bekavac's account with test values
// XP Level 55, XP 700,000, Diamonds 454,545

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function updateDanAccount() {
    const email = 'daniel@bekavactrading.com';

    console.log('🔍 Looking up user by email:', email);

    // Find the user in auth.users
    const { data: authData, error: authError } = await supabase.auth.admin.listUsers();

    if (authError) {
        console.error('❌ Error listing users:', authError);
        return;
    }

    const user = authData.users.find(u => u.email === email);

    if (!user) {
        console.error('❌ User not found with email:', email);
        console.log('Available users:', authData.users.map(u => u.email).slice(0, 10));
        return;
    }

    console.log('✅ Found user:', user.id, user.email);

    // Update profiles table with XP
    const { error: profileError } = await supabase
        .from('profiles')
        .update({
            xp_total: 700000,
            full_name: 'Dan Bekavac'
        })
        .eq('id', user.id);

    if (profileError) {
        console.error('❌ Error updating profile:', profileError);
    } else {
        console.log('✅ Profile updated: XP = 700,000');
    }

    // Update or insert diamond balance
    const { data: existingBalance, error: balanceCheckError } = await supabase
        .from('user_diamond_balance')
        .select('*')
        .eq('user_id', user.id)
        .single();

    if (existingBalance) {
        // Update existing balance
        const { error: updateError } = await supabase
            .from('user_diamond_balance')
            .update({
                balance: 454545,
                lifetime_earned: 454545
            })
            .eq('user_id', user.id);

        if (updateError) {
            console.error('❌ Error updating diamond balance:', updateError);
        } else {
            console.log('✅ Diamond balance updated: 454,545 diamonds');
        }
    } else {
        // Insert new balance
        const { error: insertError } = await supabase
            .from('user_diamond_balance')
            .insert({
                user_id: user.id,
                balance: 454545,
                lifetime_earned: 454545
            });

        if (insertError) {
            console.error('❌ Error inserting diamond balance:', insertError);
        } else {
            console.log('✅ Diamond balance created: 454,545 diamonds');
        }
    }

    // Verify the updates
    const { data: profile } = await supabase
        .from('profiles')
        .select('id, username, full_name, xp_total')
        .eq('id', user.id)
        .single();

    const { data: diamonds } = await supabase
        .from('user_diamond_balance')
        .select('balance, lifetime_earned')
        .eq('user_id', user.id)
        .single();

    console.log('\n📊 Final Account State:');
    console.log('  User ID:', user.id);
    console.log('  Email:', email);
    console.log('  Full Name:', profile?.full_name);
    console.log('  XP Total:', profile?.xp_total?.toLocaleString());
    console.log('  XP Level: 55 (calculated from 700,000 XP)');
    console.log('  Diamonds:', diamonds?.balance?.toLocaleString());
}

updateDanAccount().catch(console.error);
