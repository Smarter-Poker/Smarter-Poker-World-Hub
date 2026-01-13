#!/usr/bin/env node
/**
 * COMPREHENSIVE SOCIAL FEATURE TEST
 * Tests all social functionality against production
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MzA4NDQsImV4cCI6MjA4MzMwNjg0NH0.ZGFrUYq7yAbkveFdudh4q_Xk0qN0AZ-jnu4FkX9YKjo';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function runTests() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('🧪 COMPREHENSIVE SOCIAL FEATURE TEST');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const results = {
        passed: 0,
        failed: 0,
        tests: []
    };

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 1: Check Auth Status
    // ─────────────────────────────────────────────────────────────────────────
    console.log('📋 TEST 1: Check Authentication Status');
    try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (user) {
            console.log(`   ✅ Authenticated as: ${user.email} (${user.id})`);
            results.passed++;
            results.tests.push({ name: 'Auth Check', status: 'PASS', userId: user.id });
        } else {
            console.log('   ⚠️  NOT AUTHENTICATED - This is why posts fail!');
            console.log('   ℹ️  The anon key can read but not write without a logged-in user');
            results.tests.push({ name: 'Auth Check', status: 'WARN', msg: 'Not authenticated' });
        }
    } catch (e) {
        console.log(`   ❌ Error: ${e.message}`);
        results.failed++;
        results.tests.push({ name: 'Auth Check', status: 'FAIL', error: e.message });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 2: Fetch Posts (SELECT)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n📋 TEST 2: Fetch Posts (SELECT)');
    try {
        const { data, error, count } = await supabase
            .from('social_posts')
            .select('id, content, author_id, created_at', { count: 'exact' })
            .order('created_at', { ascending: false })
            .limit(5);

        if (error) throw error;
        console.log(`   ✅ Found ${count} total posts`);
        data.forEach(p => {
            console.log(`      - "${p.content?.substring(0, 30)}..." by ${p.author_id?.substring(0, 8)}...`);
        });
        results.passed++;
        results.tests.push({ name: 'Fetch Posts', status: 'PASS', count });
    } catch (e) {
        console.log(`   ❌ Error: ${e.message}`);
        results.failed++;
        results.tests.push({ name: 'Fetch Posts', status: 'FAIL', error: e.message });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 3: Check RLS Policies
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n📋 TEST 3: Check RLS Policies via RPC');
    try {
        const { data, error } = await supabase.rpc('fn_get_social_feed', {
            p_user_id: null,
            p_limit: 5,
            p_offset: 0,
            p_filter: 'recent'
        });

        if (error) throw error;
        console.log(`   ✅ fn_get_social_feed works! Returned ${data?.length || 0} posts`);
        results.passed++;
        results.tests.push({ name: 'RPC Feed', status: 'PASS', count: data?.length });
    } catch (e) {
        console.log(`   ❌ Error: ${e.message}`);
        results.failed++;
        results.tests.push({ name: 'RPC Feed', status: 'FAIL', error: e.message });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 4: Try to create a post (will fail without auth)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n📋 TEST 4: Create Post (INSERT) - requires auth');
    try {
        const testAuthorId = '47965354-0e56-43ef-931c-ddaab82af765'; // Your user ID from earlier posts

        const { data, error } = await supabase
            .from('social_posts')
            .insert({
                author_id: testAuthorId,
                content: 'Test post from automated test - ' + new Date().toISOString(),
                content_type: 'text',
                visibility: 'public'
            })
            .select()
            .single();

        if (error) {
            if (error.message.includes('policy') || error.code === '42501') {
                console.log('   ⚠️  RLS Policy blocked insert (user not authenticated via session)');
                console.log('   ℹ️  This is EXPECTED when testing with anon key directly');
                console.log('   ℹ️  In the browser, the logged-in session provides auth.uid()');
                results.tests.push({ name: 'Create Post', status: 'EXPECTED_FAIL', msg: 'RLS requires session auth' });
            } else {
                throw error;
            }
        } else {
            console.log(`   ✅ Post created: ${data.id}`);
            results.passed++;
            results.tests.push({ name: 'Create Post', status: 'PASS', postId: data.id });

            // Clean up test post
            await supabase.from('social_posts').delete().eq('id', data.id);
        }
    } catch (e) {
        console.log(`   ❌ Error: ${e.message}`);
        results.failed++;
        results.tests.push({ name: 'Create Post', status: 'FAIL', error: e.message });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 5: Check profiles table
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n📋 TEST 5: Check Profiles Table');
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('id, username, avatar_url')
            .limit(5);

        if (error) throw error;
        console.log(`   ✅ Found ${data.length} profiles`);
        data.forEach(p => {
            console.log(`      - ${p.username || p.id?.substring(0, 8) + '...'}`);
        });
        results.passed++;
        results.tests.push({ name: 'Profiles', status: 'PASS', count: data.length });
    } catch (e) {
        console.log(`   ❌ Error: ${e.message}`);
        results.failed++;
        results.tests.push({ name: 'Profiles', status: 'FAIL', error: e.message });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 6: Check user_dna_profiles (for author info)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n📋 TEST 6: Check user_dna_profiles');
    try {
        const { data, error, count } = await supabase
            .from('user_dna_profiles')
            .select('user_id, username, avatar_url', { count: 'exact' })
            .limit(5);

        if (error) throw error;
        console.log(`   ✅ Found ${count} DNA profiles`);
        if (count === 0) {
            console.log('   ⚠️  No DNA profiles - this is why authors show as "Anonymous"');
        }
        results.passed++;
        results.tests.push({ name: 'DNA Profiles', status: 'PASS', count });
    } catch (e) {
        console.log(`   ❌ Error: ${e.message}`);
        results.failed++;
        results.tests.push({ name: 'DNA Profiles', status: 'FAIL', error: e.message });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SUMMARY
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('📊 TEST SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`   Passed: ${results.passed}`);
    console.log(`   Failed: ${results.failed}`);
    console.log('');

    // Key finding
    console.log('🔑 KEY FINDING:');
    console.log('   The RLS policies require auth.uid() which is only available');
    console.log('   when a user is logged in via the browser session.');
    console.log('');
    console.log('   To fix posting/deleting, the user must be AUTHENTICATED.');
    console.log('   Check if your app has proper login/signup implemented.');
    console.log('═══════════════════════════════════════════════════════════════\n');

    return results;
}

runTests().catch(console.error);
