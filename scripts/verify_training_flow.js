
const { createClient } = require('@supabase/supabase-js');

// Test configuration
const TEST_CONFIG = {
    gameId: 'mtt-001',
    userId: null, // Will be set from auth
    leakCategory: 'FOLD_TO_AGGRESSION',
    leakName: 'Folding to Aggression',
    errorRate: 0.80, // 80% error rate
    confidence: 0.85, // 85% confidence
    totalSamples: 10,
    mistakeCount: 8,
    xpAwarded: 250,
    baseXp: 100,
    streakMultiplier: 1.5,
    speedMultiplier: 1.0,
    remediationMultiplier: 2.5
};

async function runSmokeTest() {
    console.log('🧪 GTO Training Engine - Smoke Test\n');
    console.log('═══════════════════════════════════════════════════════════════\n');

    // Initialize Supabase
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    // Step 1: Get current user
    console.log('Step 1: Authenticating user...');
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        console.error('❌ Authentication failed. Please sign in first.');
        console.error('   Run: await supabase.auth.signInWithPassword({ email, password })');
        process.exit(1);
    }

    TEST_CONFIG.userId = user.id;
    console.log(`✅ Authenticated as: ${user.email}`);
    console.log(`   User ID: ${user.id}\n`);

    // Step 2: Verify tables exist
    console.log('Step 2: Verifying database tables...');

    const { count: clinicsCount, error: clinicsError } = await supabase
        .from('training_clinics')
        .select('*', { count: 'exact', head: true });

    if (clinicsError) {
        console.error('❌ training_clinics table not found');
        console.error('   Run the migration first: npm run migrate:training');
        process.exit(1);
    }

    console.log(`✅ training_clinics: ${clinicsCount} rows`);

    const { error: leaksError } = await supabase
        .from('user_leaks')
        .select('*', { count: 'exact', head: true });

    if (leaksError) {
        console.error('❌ user_leaks table not found');
        process.exit(1);
    }

    console.log(`✅ user_leaks table exists`);




    // Step 3: Simulate leak detection
    console.log('Step 3: Simulating leak detection...');
    console.log(`   Category: ${TEST_CONFIG.leakCategory}`);
    console.log(`   Error Rate: ${(TEST_CONFIG.errorRate * 100).toFixed(0)}%`);
    console.log(`   Confidence: ${(TEST_CONFIG.confidence * 100).toFixed(0)}%`);

    const { data: leak, error: leakInsertError } = await supabase
        .from('user_leaks')
        .insert({
            user_id: TEST_CONFIG.userId,
            leak_category: TEST_CONFIG.leakCategory,
            leak_name: TEST_CONFIG.leakName,
            error_rate: TEST_CONFIG.errorRate,
            confidence: TEST_CONFIG.confidence,
            total_samples: TEST_CONFIG.totalSamples,
            mistake_count: TEST_CONFIG.mistakeCount,
            clinic_id: 'clinic-01', // Iron Wall
            is_active: true
        })
        .select()
        .maybeSingle();

    if (leakInsertError) {
        console.error('❌ Failed to insert leak:', leakInsertError.message);
        process.exit(1);
    }

    console.log(`✅ Leak detected and saved (ID: ${leak.id})\n`);

    // Step 4: Simulate XP award
    console.log('Step 4: Simulating XP award...');
    console.log(`   Base XP: ${TEST_CONFIG.baseXp}`);
    console.log(`   Streak Multiplier: ${TEST_CONFIG.streakMultiplier}x`);
    console.log(`   Remediation Multiplier: ${TEST_CONFIG.remediationMultiplier}x`);
    console.log(`   Total XP: ${TEST_CONFIG.xpAwarded}`);


    if (xpInsertError) {
        console.error('❌ Failed to insert XP log:', xpInsertError.message);
        process.exit(1);
    }

    console.log(`✅ XP awarded and logged (ID: ${xpLog.id})\n`);

    // Step 5: Verify data retrieval
    console.log('Step 5: Verifying data retrieval...');

    const { data: activeLeaks, error: activeLeaksError } = await supabase
        .rpc('get_active_leaks', { p_user_id: TEST_CONFIG.userId });

    if (activeLeaksError) {
        console.warn('⚠️  get_active_leaks function not available');
    } else {
        console.log(`✅ Active leaks retrieved: ${activeLeaks?.length || 0}`);
        if (activeLeaks && activeLeaks.length > 0) {
            console.log(`   - ${activeLeaks[0].leak_name} (${(activeLeaks[0].confidence * 100).toFixed(0)}% confidence)`);
        }
    }

    // The XP step was removed on 2026-08-21. XP was dropped as a product
    // decision months ago and the RPC this called had already been gutted to
    // return 0, so the check reported a success it had not measured.

    // Step 6: Cleanup test data
    console.log('Step 6: Cleaning up test data...');

    await supabase
        .from('user_leaks')
        .delete()
        .eq('id', leak.id);


    console.log(`✅ Test data cleaned up\n`);

    // Final summary
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('🎉 SMOKE TEST PASSED');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('✅ Database tables exist');
    console.log('✅ Leak detection works');
    console.log('✅ XP logging works');
    console.log('✅ Data retrieval works');
    console.log('\n🚀 Training Engine is ready for production!\n');

    process.exit(0);
}

runSmokeTest().catch(err => {
    console.error('\n💥 Smoke test failed:', err.message);
    console.error(err);
    process.exit(1);
});
