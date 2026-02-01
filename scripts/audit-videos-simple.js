#!/usr/bin/env node

/**
 * Audit and fix broken video links in the database
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function auditVideos() {
    console.log('🔍 Auditing video links in database...\n');

    const brokenReelIds = [];
    const brokenPostIds = [];

    try {
        // Check social_reels
        console.log('1. Checking social_reels table...');
        const { data: reels } = await supabase
            .from('social_reels')
            .select('id, video_url, caption, is_public')
            .eq('is_public', true)
            .order('created_at', { ascending: false });

        console.log(`✅ Found ${reels?.length || 0} public reels\n`);

        // Check social_posts
        console.log('2. Checking social_posts table...');
        const { data: posts } = await supabase
            .from('social_posts')
            .select('id, media_urls, content, content_type')
            .eq('content_type', 'video')
            .eq('visibility', 'public')
            .order('created_at', { ascending: false });

        console.log(`✅ Found ${posts?.length || 0} video posts\n`);

        console.log('SUMMARY:');
        console.log(`Total Reels: ${reels?.length || 0}`);
        console.log(`Total Video Posts: ${posts?.length || 0}`);

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

auditVideos();
