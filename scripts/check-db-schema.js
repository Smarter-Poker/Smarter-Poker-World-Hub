const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzczMDg0NCwiZXhwIjoyMDgzMzA2ODQ0fQ.bbDqj-me78PID99npWCZ5qUuINSC1-eCBb1BVhgiSRs';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
});

async function runMigrations() {
    console.log('🚀 Running database migrations...\n');

    // Check current profile columns
    const { data: existingCols, error: colError } = await supabase
        .from('profiles')
        .select('*')
        .limit(1);

    if (colError) {
        console.log('⚠️ Error checking profiles:', colError.message);
    } else {
        console.log('✅ Current profile columns:', Object.keys(existingCols[0] || {}));
    }

    // Try adding missing columns by attempting inserts/updates
    // The service role bypasses RLS

    // Test by creating a test profile to see what columns work
    const testId = '00000000-0000-0000-0000-000000000000';

    // First, let's see what columns we can write to
    const testData = {
        id: testId,
        full_name: 'Test User',
        email: 'test@test.com',
        username: '_test_migration_check_',
        player_number: 99999,
        access_tier: 'Full_Access',
        streak_count: 0,
        streak_days: 0,
        email_verified: false,
        phone_verified: false,
        skill_tier: 'Newcomer',
    };

    console.log('\n📝 Testing column existence by attempting upsert...');

    const { data: insertResult, error: insertError } = await supabase
        .from('profiles')
        .upsert(testData, { onConflict: 'id' })
        .select();

    if (insertError) {
        console.log('❌ Insert test failed:', insertError.message);
        console.log('   Hint:', insertError.hint || 'none');
        console.log('   Details:', insertError.details || 'none');

        // Parse error to identify missing column
        const match = insertError.message.match(/column "(\w+)" of relation/);
        if (match) {
            console.log(`\n🔍 MISSING COLUMN FOUND: "${match[1]}"`);
        }
    } else {
        console.log('✅ Test insert succeeded!');

        // Clean up test record
        await supabase.from('profiles').delete().eq('id', testId);
        console.log('🧹 Test record cleaned up');
    }

    // Now verify the initialize_player_profile function
    console.log('\n🔧 Testing initialize_player_profile RPC...');

    const { data: rpcResult, error: rpcError } = await supabase.rpc('initialize_player_profile', {
        p_user_id: testId,
        p_full_name: 'RPC Test',
        p_email: 'rpctest@test.com',
        p_phone: '+15551234567',
        p_city: 'Test City',
        p_state: 'TX',
        p_username: '_rpc_test_user_',
    });

    if (rpcError) {
        console.log('❌ RPC test failed:', rpcError.message);
        console.log('   Hint:', rpcError.hint || 'none');

        // This tells us what columns are missing
        const colMatch = rpcError.message.match(/column "(\w+)"/);
        if (colMatch) {
            console.log(`\n🚨 RPC FAILS DUE TO MISSING COLUMN: "${colMatch[1]}"`);
        }
    } else {
        console.log('✅ RPC works! Result:', rpcResult);
        // Clean up
        await supabase.from('profiles').delete().eq('id', testId);
    }

    console.log('\n✅ Migration check complete');
}

runMigrations().catch(console.error);
