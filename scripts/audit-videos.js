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

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function auditVideos() {
    console.log('🔍 Auditing video links in database...\n');

    try {
        // Check social_reels
        console.log('1. Checking social_reels table...');
        const { data: reels, error: reelsError } = await supabase
            .from('social_reels')
            .select('id, video_url, caption, is_public, created_at, author_id')
            .eq('is_public', true)
            .order('created_at', { ascending: false })
            .limit(100);

        if (reelsError) {
            console.error('❌ Error fetching reels:', reelsError.message);
        } else {
            console.log(`✅ Found ${reels.length} public reels\n`);

            // Analyze video URLs
            const urlPatterns = {
                youtube_shorts: 0,
                youtube_watch: 0,
                youtube_embed: 0,
                youtu_be: 0,
                other: 0,
                null_or_empty: 0
            };

            const brokenUrls = [];

            reels.forEach(reel => {
                if (!reel.video_url || reel.video_url.trim() === '') {
                    urlPatterns.null_or_empty++;
                    brokenUrls.push({
                        id: reel.id,
                        issue: 'NULL or empty URL',
                        url: reel.video_url,
                        caption: reel.caption
                    });
                } else if (reel.video_url.includes('youtube.com/shorts/')) {
                    urlPatterns.youtube_shorts++;
                } else if (reel.video_url.includes('youtube.com/watch')) {
                    urlPatterns.youtube_watch++;
                } else if (reel.video_url.includes('youtube.com/embed/')) {
                    urlPatterns.youtube_embed++;
                } else if (reel.video_url.includes('youtu.be/')) {
                    urlPatterns.youtu_be++;
                } else {
                    urlPatterns.other++;
                    brokenUrls.push({
                        id: reel.id,
                        issue: 'Non-YouTube URL',
                        url: reel.video_url,
                        caption: reel.caption
                    });
                }
            });

            console.log('URL Pattern Analysis:');
            console.log(`  YouTube Shorts: ${urlPatterns.youtube_shorts}`);
            console.log(`  YouTube Watch: ${urlPatterns.youtube_watch}`);
            console.log(`  YouTube Embed: ${urlPatterns.youtube_embed}`);
            console.log(`  Youtu.be: ${urlPatterns.youtu_be}`);
            console.log(`  Other: ${urlPatterns.other}`);
            console.log(`  Null/Empty: ${urlPatterns.null_or_empty}\n`);

            if (brokenUrls.length > 0) {
                console.log(`⚠️  Found ${brokenUrls.length} potentially broken URLs:\n`);
                brokenUrls.forEach((item, i) => {
                    console.log(`${i + 1}. ID: ${item.id}`);
                    console.log(`   Issue: ${item.issue}`);
                    console.log(`   URL: ${item.url || 'NULL'}`);
                    console.log(`   Caption: ${item.caption?.substring(0, 50) || 'No caption'}...\n`);
                });
            }
        }

        // Check social_posts with videos
        console.log('\n2. Checking social_posts table (video content)...');
        const { data: posts, error: postsError } = await supabase
            .from('social_posts')
            .select('id, media_urls, content, visibility, created_at, author_id')
            .eq('content_type', 'video')
            .eq('visibility', 'public')
            .order('created_at', { ascending: false })
            .limit(100);

        if (postsError) {
            console.error('❌ Error fetching posts:', postsError.message);
        } else {
            console.log(`✅ Found ${posts.length} public video posts\n`);

            const brokenPosts = [];

            posts.forEach(post => {
                if (!post.media_urls || post.media_urls.length === 0) {
                    brokenPosts.push({
                        id: post.id,
                        issue: 'No media URLs',
                        content: post.content
                    });
                } else {
                    const firstUrl = post.media_urls[0];
                    if (!firstUrl || firstUrl.trim() === '') {
                        brokenPosts.push({
                            id: post.id,
                            issue: 'Empty media URL',
                            content: post.content
                        });
                    }
                }
            });

            if (brokenPosts.length > 0) {
                console.log(`⚠️  Found ${brokenPosts.length} posts with broken media:\n`);
                brokenPosts.forEach((item, i) => {
                    console.log(`${i + 1}. Post ID: ${item.id}`);
                    console.log(`   Issue: ${item.issue}`);
                    console.log(`   Content: ${item.content?.substring(0, 50) || 'No content'}...\n`);
                });
            }
        }

        // Summary
        console.log('\n' + '='.repeat(60));
        console.log('SUMMARY');
        console.log('='.repeat(60));
        console.log(`Total Reels: ${reels?.length || 0}`);
        console.log(`Total Video Posts: ${posts?.length || 0}`);
        console.log(`Broken Reels: ${brokenUrls.length}`);
        console.log(`Broken Posts: ${brokenPosts.length}`);

        if (brokenUrls.length > 0 || brokenPosts.length > 0) {
            console.log('\n⚠️  Action Required: Clean up broken video entries');
            console.log('\nOptions:');
            console.log('1. Delete broken entries');
            console.log('2. Mark as private (is_public = false)');
            console.log('3. Update with valid URLs');
        } else {
            console.log('\n✅ No broken video entries found!');
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

auditVideos();
