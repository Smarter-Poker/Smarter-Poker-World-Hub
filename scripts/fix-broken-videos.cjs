/**
 * Fix Broken Videos in Social Feed
 * This script deletes all posts/reels with invalid YouTube URLs
 */
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const https = require('https');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

function checkYouTubeVideo(videoId) {
    return new Promise((resolve) => {
        const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
        https.get(url, (res) => {
            resolve(res.statusCode === 200);
        }).on('error', () => resolve(false));
    });
}

async function main() {
    console.log('🔧 FIXING BROKEN VIDEOS IN DATABASE');
    console.log('====================================\n');

    // 1. Fetch ALL video/link posts
    const { data: allPosts, error } = await supabase
        .from('social_posts')
        .select('id, content, media_urls, link_url, content_type, visibility')
        .or('content_type.eq.video,content_type.eq.link')
        .eq('visibility', 'public');

    if (error) { console.error(error); process.exit(1); }
    console.log(`Found ${allPosts.length} video/link posts`);

    const youtubePosts = allPosts.filter(p => {
        const url = p.media_urls?.[0] || p.link_url || '';
        return url.includes('youtube.com') || url.includes('youtu.be');
    });
    console.log(`${youtubePosts.length} posts contain YouTube URLs\n`);
    console.log('Checking each video (this may take a minute)...\n');

    const brokenPosts = [];
    let checked = 0;
    
    for (const post of youtubePosts) {
        const url = post.media_urls?.[0] || post.link_url;
        const videoId = getYouTubeVideoId(url);
        
        if (!videoId) { 
            console.log(`⚠️  Invalid URL: ${url?.substring(0, 50)}`);
            brokenPosts.push(post); 
            continue; 
        }
        
        const isValid = await checkYouTubeVideo(videoId);
        checked++;
        
        if (!isValid) {
            console.log(`❌ BROKEN [${checked}]: ${videoId} - "${post.content?.substring(0, 50) || 'no content'}"`);
            brokenPosts.push(post);
        } else {
            if (checked % 20 === 0) console.log(`✅ Checked ${checked}/${youtubePosts.length}...`);
        }
        
        await new Promise(r => setTimeout(r, 50));
    }

    console.log(`\n📊 RESULTS: ${brokenPosts.length} broken / ${youtubePosts.length} total YouTube posts\n`);

    if (brokenPosts.length > 0) {
        console.log('🗑️  Deleting broken posts...');
        const { error: delErr } = await supabase
            .from('social_posts')
            .delete()
            .in('id', brokenPosts.map(p => p.id));
        
        if (delErr) console.error('Delete error:', delErr);
        else console.log(`✅ DELETED ${brokenPosts.length} broken video posts!\n`);
    }

    // 2. Also check reels
    console.log('Checking social_reels...');
    const { data: reels } = await supabase
        .from('social_reels')
        .select('id, video_url, caption')
        .eq('is_public', true);
    
    console.log(`Found ${reels?.length || 0} public reels`);
    const brokenReels = [];
    
    for (const reel of (reels || [])) {
        const videoId = getYouTubeVideoId(reel.video_url);
        if (!videoId) { brokenReels.push(reel); continue; }
        const isValid = await checkYouTubeVideo(videoId);
        if (!isValid) {
            console.log(`❌ BROKEN REEL: ${videoId}`);
            brokenReels.push(reel);
        }
        await new Promise(r => setTimeout(r, 50));
    }

    if (brokenReels.length > 0) {
        const { error: delReelErr } = await supabase
            .from('social_reels')
            .delete()
            .in('id', brokenReels.map(r => r.id));
        if (delReelErr) console.error('Reel delete error:', delReelErr);
        else console.log(`✅ DELETED ${brokenReels.length} broken reels!\n`);
    }

    console.log('====================================');
    console.log('🎉 CLEANUP COMPLETE!');
    console.log(`   Posts deleted: ${brokenPosts.length}`);
    console.log(`   Reels deleted: ${brokenReels.length}`);
    console.log('====================================');
}

main().catch(console.error);
