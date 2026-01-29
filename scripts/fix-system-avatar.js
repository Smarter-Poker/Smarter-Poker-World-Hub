#!/usr/bin/env node

/**
 * Fix System Account Avatar
 * Updates the SmarterPokerOfficial system account to have the correct avatar
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const SYSTEM_UUID = '00000000-0000-0000-0000-000000000001';

async function fixSystemAvatar() {
    console.log('🔧 Fixing system account avatar...\n');

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Check current state
    const { data: before, error: fetchError } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url')
        .eq('id', SYSTEM_UUID)
        .single();

    if (fetchError) {
        console.error('❌ Error fetching system account:', fetchError.message);
        process.exit(1);
    }

    console.log('📋 Current state:');
    console.log(`   Username: ${before.username}`);
    console.log(`   Full Name: ${before.full_name}`);
    console.log(`   Avatar URL: ${before.avatar_url || '(not set)'}\n`);

    // Update avatar
    const { data: after, error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: '/smarter-poker-logo.png' })
        .eq('id', SYSTEM_UUID)
        .select()
        .single();

    if (updateError) {
        console.error('❌ Error updating avatar:', updateError.message);
        process.exit(1);
    }

    console.log('✅ Avatar updated successfully!\n');
    console.log('📋 New state:');
    console.log(`   Username: ${after.username}`);
    console.log(`   Full Name: ${after.full_name}`);
    console.log(`   Avatar URL: ${after.avatar_url}\n`);

    console.log('🎉 Done! The SmarterPokerOfficial account now has the correct avatar.');
    console.log('   Refresh the social-media page to see the changes.');
}

fixSystemAvatar().catch(console.error);
