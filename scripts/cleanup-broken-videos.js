#!/usr/bin/env node

/**
 * Clean up broken video entries from database
 * This script marks posts with deleted/unavailable YouTube videos as private
 */

const { createClient } = require('@supabase/supabase-js');
const https = require('https');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Extract YouTube video ID from URL
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

// Check if YouTube video exists
async function checkYouTubeVideo(videoId) {
    return new Promise((resolve) => {
        const url = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
        https.get(url, (res) => {
            // YouTube returns 404 for deleted videos
            resolve(res.statusCode === 200);
        }).on('error', () => resolve(false));
    });
}

async function cleanupBrokenVideos() {
    console.log('🧹 Cleaning up broken video entries...\n');

    try {
        // Get all public reels
        console.log('1. Checking social_reels...');
        const { data: reels } = await supabase
            .from('social_reels')
            .select('id, video_url, caption')
            .eq('is_public', true);

        console.log(`Found ${reels?.length || 0} public reels\n`);

        const brokenReelIds = [];

        // Check each reel (limit to first 50 to avoid rate limiting)
        for (const reel of (reels || []).slice(0, 50)) {
            const videoId = getYouTubeVideoId(reel.video_url);
            if (!videoId) {
                console.log(`⚠️  Invalid URL: ${reel.id}`);
                brokenReelIds.push(reel.id);
                continue;
            }

            const exists = await checkYouTubeVideo(videoId);
            if (!exists) {
                console.log(`❌ Broken: ${videoId} - ${reel.caption?.substring(0, 40) || 'No caption'}`);
                brokenReelIds.push(reel.id);
            }

            // Rate limit: wait 100ms between checks
            await new Promise(r => setTimeout(r, 100));
        }

        console.log(`\n📊 Found ${brokenReelIds.length} broken reels\n`);

        if (brokenReelIds.length > 0) {
            console.log('Marking broken reels as private...');
            const { error } = await supabase
                .from('social_reels')
                .update({ is_public: false })
                .in('id', brokenReelIds);

            if (error) {
                console.error('❌ Error updating reels:', error.message);
            } else {
                console.log(`✅ Marked ${brokenReelIds.length} reels as private\n`);
            }
        }

        // Get video posts
        console.log('2. Checking social_posts (videos)...');
        const { data: posts } = await supabase
            .from('social_posts')
            .select('id, media_urls, content')
            .eq('content_type', 'video')
            .eq('visibility', 'public')
            .limit(100);

        console.log(`Found ${posts?.length || 0} video posts\n`);

        const brokenPostIds = [];

        for (const post of (posts || [])) {
            if (!post.media_urls || post.media_urls.length === 0) {
                brokenPostIds.push(post.id);
                continue;
            }

            const videoId = getYouTubeVideoId(post.media_urls[0]);
            if (!videoId) {
                // Not a YouTube video, skip
                continue;
            }

            const exists = await checkYouTubeVideo(videoId);
            if (!exists) {
                console.log(`❌ Broken post: ${videoId} - ${post.content?.substring(0, 40) || 'No content'}`);
                brokenPostIds.push(post.id);
            }

            await new Promise(r => setTimeout(r, 100));
        }

        console.log(`\n📊 Found ${brokenPostIds.length} broken posts\n`);

        if (brokenPostIds.length > 0) {
            console.log('Marking broken posts as private...');
            const { error } = await supabase
                .from('social_posts')
                .update({ visibility: 'private' })
                .in('id', brokenPostIds);

            if (error) {
                console.error('❌ Error updating posts:', error.message);
            } else {
                console.log(`✅ Marked ${brokenPostIds.length} posts as private\n`);
            }
        }

        console.log('\n' + '='.repeat(60));
        console.log('✅ CLEANUP COMPLETE');
        console.log('='.repeat(60));
        console.log(`Reels hidden: ${brokenReelIds.length}`);
        console.log(`Posts hidden: ${brokenPostIds.length}`);
        console.log('\nBroken videos are now hidden from public view.');

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

cleanupBrokenVideos();
