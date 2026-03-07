require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkPosts() {
    // Get sample post to see structure
    const { data: sample, error } = await supabase
        .from('social_posts')
        .select('*')
        .limit(1)
        .maybeSingle();

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log('Sample post structure:');
    console.log(JSON.stringify(sample, null, 2));

    // Check for posts with YouTube URLs in media_urls
    const { data: videoPosts, error: videoError } = await supabase
        .from('social_posts')
        .select('id, author_id, content, media_urls, visibility')
        .not('media_urls', 'is', null)
        .limit(10);

    if (videoError) {
        console.error('Video posts error:', videoError);
    } else {
        console.log(`\n\nFound ${videoPosts.length} posts with media_urls`);
        videoPosts.forEach((post, i) => {
            console.log(`\n${i + 1}. Post ID: ${post.id}`);
            console.log(`   Visibility: ${post.visibility}`);
            console.log(`   Media URLs:`, post.media_urls);

            // Check if any URL is a YouTube link
            const hasYouTube = post.media_urls.some(url =>
                url.includes('youtube.com') || url.includes('youtu.be')
            );
            console.log(`   Has YouTube: ${hasYouTube}`);
        });
    }
}

checkPosts().catch(console.error);
