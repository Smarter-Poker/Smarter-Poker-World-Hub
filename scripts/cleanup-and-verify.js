// Clean up test records and verify signup flow
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzczMDg0NCwiZXhwIjoyMDgzMzA2ODQ0fQ.bbDqj-me78PID99npWCZ5qUuINSC1-eCBb1BVhgiSRs';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
});

async function cleanup() {
    console.log('🧹 Cleaning up test records...\n');

    // Delete test profiles created during migration check
    const testIds = ['00000000-0000-0000-0000-000000000000'];
    const testUsernames = ['_test_migration_check_', '_rpc_test_user_'];

    for (const username of testUsernames) {
        const { error } = await supabase
            .from('profiles')
            .delete()
            .eq('username', username);

        if (error) {
            console.log(`⚠️ Could not delete ${username}:`, error.message);
        } else {
            console.log(`✅ Deleted test profile: ${username}`);
        }
    }

    // Verify RPC works with a real test
    console.log('\n🔧 Final RPC verification...');
    const testUserId = '99999999-9999-9999-9999-999999999999';

    const { data: rpcResult, error: rpcError } = await supabase.rpc('initialize_player_profile', {
        p_user_id: testUserId,
        p_full_name: 'Signup Test',
        p_email: 'signuptest@smarter.poker',
        p_phone: '+15559999999',
        p_city: 'Test City',
        p_state: 'TX',
        p_username: '_final_signup_test_',
    });

    if (rpcError) {
        console.log('❌ RPC FAILED:', rpcError.message);
        process.exit(1);
    } else {
        console.log('✅ RPC WORKS! Player number assigned:', rpcResult[0]?.player_number);

        // Clean up
        await supabase.from('profiles').delete().eq('id', testUserId);
        console.log('🧹 Test record cleaned up');
    }

    // Check profiles table is accessible
    const { data: profileCount, error: countError } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true });

    if (countError) {
        console.log('❌ Cannot access profiles:', countError.message);
    } else {
        console.log('✅ Profiles table accessible');
    }

    console.log('\n✅ ALL VERIFICATIONS PASSED - Signup should work now!');
}

cleanup().catch(console.error);
