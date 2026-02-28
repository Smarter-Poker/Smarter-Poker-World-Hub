// Run the announcements TV display migration
const fs = require('fs');
const envContent = fs.readFileSync('/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.env.local', 'utf8');
envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)="?(.*?)"?$/);
    if (match) process.env[match[1]] = match[2];
});
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runMigration() {
    console.log('Running announcements TV display migration...');
    console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL?.slice(0, 30) + '...');

    // Test 1: Check if venue_id column already exists
    const { data: testData, error: testError } = await supabase
        .from('commander_club_announcements')
        .select('id, venue_id')
        .limit(1);

    if (testError) {
        if (testError.message.includes('venue_id')) {
            console.log('venue_id column does NOT exist. Need to add it via Dashboard SQL Editor.');
        } else {
            console.log('Other error:', testError.message);
        }
    } else {
        console.log('venue_id column EXISTS. Checking other columns...');
    }

    // Test 2: Check priority column
    const { data: testPriority, error: priorityErr } = await supabase
        .from('commander_club_announcements')
        .select('id, priority')
        .limit(1);

    if (priorityErr) {
        console.log('priority column does NOT exist. Error:', priorityErr.message);
    } else {
        console.log('priority column EXISTS.');
    }

    // Test 3: Check expires_at column
    const { data: testExpires, error: expiresErr } = await supabase
        .from('commander_club_announcements')
        .select('id, expires_at')
        .limit(1);

    if (expiresErr) {
        console.log('expires_at column does NOT exist. Error:', expiresErr.message);
    } else {
        console.log('expires_at column EXISTS.');
    }

    // Test 4: Check type column
    const { data: testType, error: typeErr } = await supabase
        .from('commander_club_announcements')
        .select('id, type')
        .limit(1);

    if (typeErr) {
        console.log('type column does NOT exist. Error:', typeErr.message);
    } else {
        console.log('type column EXISTS.');
    }

    // Test 5: Try a full insert to see what happens
    console.log('\n--- Testing write ---');
    const { data: insertData, error: insertErr } = await supabase
        .from('commander_club_announcements')
        .insert({
            venue_id: 999999,
            title: '__TEST_MIGRATION__',
            message: 'Testing column existence',
            type: 'general',
            priority: 'normal',
        })
        .select()
        .single();

    if (insertErr) {
        console.log('Insert test FAILED:', insertErr.message);
        console.log('Full error:', JSON.stringify(insertErr, null, 2));
    } else {
        console.log('Insert test SUCCEEDED. Row:', JSON.stringify(insertData, null, 2));
        // Clean up test row
        const { error: delErr } = await supabase
            .from('commander_club_announcements')
            .delete()
            .eq('id', insertData.id);
        console.log(delErr ? 'Cleanup failed: ' + delErr.message : 'Test row cleaned up.');
    }
}

runMigration().catch(console.error);
