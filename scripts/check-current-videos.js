require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkVideos() {
    console.log('Checking current video state in database...\n');

    // Check reels
    const { data: reels, error: reelsError } = await supabase
        .from('social_reels')
        .select('id, video_url, is_public, author_id')
        .order('created_at', { ascending: false });

    if (reelsError) {
        console.error('Error fetching reels:', reelsError);
    } else {
        console.log(`=== REELS (${reels.length} total) ===`);
        reels.forEach((reel, i) => {
            console.log(`${i + 1}. ID: ${reel.id}`);
            console.log(`   Public: ${reel.is_public}`);
            console.log(`   Author: ${reel.author_id}`);
            console.log(`   URL: ${reel.video_url}`);
            console.log('');
        });
    }

    // Check video posts
    const { data: posts, error: postsError } = await supabase
        .from('social_posts')
        .select('id, video_url, visibility, author_id')
        .not('video_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(20);

    if (postsError) {
        console.error('Error fetching posts:', postsError);
    } else {
        console.log(`\n=== VIDEO POSTS (showing first 20 of ${posts.length}) ===`);
        posts.forEach((post, i) => {
            console.log(`${i + 1}. ID: ${post.id}`);
            console.log(`   Visibility: ${post.visibility}`);
            console.log(`   Author: ${post.author_id}`);
            console.log(`   URL: ${post.video_url}`);
            console.log('');
        });
    }

    // Count public vs private
    const { count: publicReels } = await supabase
        .from('social_reels')
        .select('*', { count: 'exact', head: true })
        .eq('is_public', true);

    const { count: privateReels } = await supabase
        .from('social_reels')
        .select('*', { count: 'exact', head: true })
        .eq('is_public', false);

    const { count: publicPosts } = await supabase
        .from('social_posts')
        .select('*', { count: 'exact', head: true })
        .not('video_url', 'is', null)
        .eq('visibility', 'public');

    const { count: privatePosts } = await supabase
        .from('social_posts')
        .select('*', { count: 'exact', head: true })
        .not('video_url', 'is', null)
        .eq('visibility', 'private');

    console.log('\n=== SUMMARY ===');
    console.log(`Public Reels: ${publicReels}`);
    console.log(`Private Reels: ${privateReels}`);
    console.log(`Public Video Posts: ${publicPosts}`);
    console.log(`Private Video Posts: ${privatePosts}`);
}

checkVideos().catch(console.error);
