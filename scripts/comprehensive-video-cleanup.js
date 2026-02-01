#!/usr/bin/env node

/**
 * Comprehensive cleanup - Hide ALL posts with deleted YouTube videos
 * This will check every YouTube video in the database
 */

const { createClient } = require('@supabase/supabase-js');
const https = require('https');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

function getYouTubeVideoId(url) {
    if (!url) return null;
    const patterns = [
        /youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/,
        /youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/,
        /youtu\.be\/([a-zA-Z0-9_-]+)/,
        /youtube\.com\/embed\/([a-zA-Z0-9_-]+)/
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    return null;
}

async function checkYouTubeVideo(videoId) {
    return new Promise((resolve) => {
        const url = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
        https.get(url, (res) => {
            resolve(res.statusCode === 200);
        }).on('error', () => resolve(false));
    });
}

async function comprehensiveCleanup() {
    console.log('🧹 COMPREHENSIVE VIDEO CLEANUP\n');
    console.log('This will check ALL YouTube videos in the database...\n');

    try {
        // Get ALL video posts
        console.log('Fetching all video posts...');
        const { data: allPosts } = await supabase
            .from('social_posts')
            .select('id, media_urls, content, author_id')
            .eq('content_type', 'video')
            .eq('visibility', 'public');

        console.log(`✅ Found ${allPosts?.length || 0} public video posts\n`);

        const brokenPostIds = [];
        let checked = 0;
        let skipped = 0;

        for (const post of (allPosts || [])) {
            if (!post.media_urls || post.media_urls.length === 0) {
                console.log(`⚠️  No media URL: ${post.id}`);
                brokenPostIds.push(post.id);
                continue;
            }

            const firstUrl = post.media_urls[0];
            const videoId = getYouTubeVideoId(firstUrl);

            if (!videoId) {
                // Not a YouTube video (might be uploaded video)
                skipped++;
                continue;
            }

            checked++;
            const exists = await checkYouTubeVideo(videoId);

            if (!exists) {
                console.log(`❌ BROKEN [${checked}/${allPosts.length}]: ${videoId} - ${post.content?.substring(0, 50) || 'No content'}...`);
                brokenPostIds.push(post.id);
            } else {
                if (checked % 10 === 0) {
                    console.log(`✅ Checked ${checked} videos...`);
                }
            }

            // Rate limit
            await new Promise(r => setTimeout(r, 150));
        }

        console.log(`\n${'='.repeat(60)}`);
        console.log('RESULTS');
        console.log('='.repeat(60));
        console.log(`Total posts: ${allPosts?.length || 0}`);
        console.log(`YouTube videos checked: ${checked}`);
        console.log(`Non-YouTube skipped: ${skipped}`);
        console.log(`Broken videos found: ${brokenPostIds.length}`);

        if (brokenPostIds.length > 0) {
            console.log(`\n🔄 Hiding ${brokenPostIds.length} broken posts...`);

            const { error } = await supabase
                .from('social_posts')
                .update({ visibility: 'private' })
                .in('id', brokenPostIds);

            if (error) {
                console.error('❌ Error:', error.message);
            } else {
                console.log(`✅ Successfully hidden ${brokenPostIds.length} posts with broken videos\n`);
            }
        } else {
            console.log('\n✅ No broken videos found!\n');
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

comprehensiveCleanup();
