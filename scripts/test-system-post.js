#!/usr/bin/env node

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TEST SYSTEM POST — Verification Script
 * 
 * Tests the system account posting functionality by creating a
 * "Welcome to Daily Strategy" test post.
 * 
 * Usage:
 *   node scripts/test-system-post.js
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

// System account UUID
const SYSTEM_ACCOUNT_UUID = '00000000-0000-0000-0000-000000000001';

// Initialize Supabase client with SERVICE ROLE key
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
);

async function testSystemPost() {
    try {
        console.log('🧪 Testing System Account Posting...\n');

        // Step 1: Verify system account exists
        console.log('Step 1: Verifying system account...');
        const { data: systemAccount, error: accountError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', SYSTEM_ACCOUNT_UUID)
            .single();

        if (accountError || !systemAccount) {
            console.error('❌ System account not found!');
            console.error('   Run the database migration first: 20260117_system_account_setup.sql');
            throw new Error(accountError?.message || 'System account missing');
        }

        console.log('✅ System account found:');
        console.log(`   UUID: ${systemAccount.id}`);
        console.log(`   Username: ${systemAccount.username}`);
        console.log(`   Full Name: ${systemAccount.full_name}`);
        console.log('');

        // Step 2: Create test post
        console.log('Step 2: Creating test post...');
        const testContent = `🎉 Welcome to Daily Strategy!

Your daily dose of poker wisdom starts now. Every day, the Smarter.Poker system will deliver:

✅ GTO strategy insights
✅ Tournament tips and tactics  
✅ Training challenges
✅ Poker math breakdowns
✅ Hand reading techniques

Stay sharp. Stay profitable. 💎`;

        const { data: post, error: postError } = await supabase
            .from('social_posts')
            .insert({
                author_id: SYSTEM_ACCOUNT_UUID,
                content: testContent,
                content_type: 'announcement',
                visibility: 'public',
                created_at: new Date().toISOString()
            })
            .select()
            .single();

        if (postError) {
            console.error('❌ Failed to create post!');
            console.error(`   Error: ${postError.message}`);
            throw postError;
        }

        console.log('✅ Test post created:');
        console.log(`   Post ID: ${post.id}`);
        console.log(`   Author ID: ${post.author_id}`);
        console.log(`   Created: ${post.created_at}`);
        console.log('');

        // Step 3: Verify post appears in feed
        console.log('Step 3: Verifying post appears in social feed...');
        const { data: feedPosts, error: feedError } = await supabase
            .rpc('fn_get_social_feed', {
                p_user_id: null,
                p_limit: 10,
                p_offset: 0,
                p_filter: 'recent'
            });

        if (feedError) {
            console.error('❌ Failed to fetch social feed!');
            console.error(`   Error: ${feedError.message}`);
            throw feedError;
        }

        const systemPost = feedPosts.find(p => p.post_id === post.id);

        if (!systemPost) {
            console.error('❌ Post not found in social feed!');
            throw new Error('Post not visible in feed');
        }

        console.log('✅ Post verified in social feed:');
        console.log(`   Author: ${systemPost.author_username}`);
        console.log(`   Content: ${systemPost.content.substring(0, 50)}...`);
        console.log('');

        // Success summary
        console.log('═══════════════════════════════════════════════════════════');
        console.log('🎉 ALL TESTS PASSED!');
        console.log('═══════════════════════════════════════════════════════════');
        console.log('✅ System account exists and is configured correctly');
        console.log('✅ System can create posts via service role');
        console.log('✅ Posts appear in the social feed for all users');
        console.log('');
        console.log('Next steps:');
        console.log('1. Check the social feed UI at /hub/social-media');
        console.log('2. Run daily-content-generator.js to publish daily content');
        console.log('3. Set up cron job for automated daily posting');
        console.log('═══════════════════════════════════════════════════════════');

        return true;

    } catch (error) {
        console.error('\n❌ TEST FAILED:', error.message);
        return false;
    }
}

// Execute
testSystemPost()
    .then(success => process.exit(success ? 0 : 1))
    .catch(() => process.exit(1));
