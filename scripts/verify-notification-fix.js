#!/usr/bin/env node
/**
 * Verify Notification Verbiage Fix
 */
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verify() {
    console.log('🔍 Verifying notification verbiage fix...\n');

    // 1. Check friend request notifications
    const { data: friendReqs } = await supabase
        .from('notifications')
        .select('title, message, type, created_at')
        .eq('type', 'friend_request')
        .order('created_at', { ascending: false })
        .limit(10);

    console.log('📋 Recent Friend Request Notifications:');
    console.log('='.repeat(60));
    (friendReqs || []).forEach((n, i) => {
        const fullText = `${n.title} ${n.message}`;
        const isBroken = n.message?.toLowerCase().includes('accept') ||
            n.message?.toLowerCase().includes('become friends') ||
            !n.message;
        console.log(`${i + 1}. "${fullText}"`);
        console.log(`   ${isBroken ? '❌ BROKEN' : '✅ GOOD'}`);
    });

    // 2. Check for any remaining broken text
    const { data: broken, count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact' })
        .eq('type', 'friend_request')
        .or('message.ilike.%accept%,message.ilike.%become friends%');

    console.log('\n📊 Summary:');
    console.log(`   Total friend requests with broken text: ${count || broken?.length || 0}`);

    // 3. Check overall notification health
    const { data: stats } = await supabase
        .from('notifications')
        .select('type')
        .limit(500);

    const byType = (stats || []).reduce((acc, n) => {
        acc[n.type] = (acc[n.type] || 0) + 1;
        return acc;
    }, {});

    console.log('\n   Notification breakdown:');
    Object.entries(byType).forEach(([type, count]) => {
        console.log(`   - ${type}: ${count}`);
    });

    console.log('\n✅ Verification complete!');
}

verify().catch(e => console.error('Error:', e));
