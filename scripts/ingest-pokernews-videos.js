/**
 * INGEST POKERNEWS VIDEOS AS REELS
 * 
 * Fetches latest videos from the official PokerNews YouTube channel via RSS.
 * Ingests them directly into the 'social_reels' table for the @PokerNews bot.
 * 
 * Channel ID: UCSu1ww_wgD0XD66C1ESrIGQ (@pokernewsdotcom)
 * RSS Feed: https://www.youtube.com/feeds/videos.xml?channel_id=UCSu1ww_wgD0XD66C1ESrIGQ
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const Parser = require('rss-parser');

// Initialize clients
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY // Service role needed for direct inserts
);

const parser = new Parser({
    headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
});

const POKERNEWS_CHANNEL_ID = 'UCSu1ww_wgD0XD66C1ESrIGQ';
const RSS_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${POKERNEWS_CHANNEL_ID}`;

async function ingestVideos() {
    console.log('🎬 Starting PokerNews Video Ingestion...');
    console.log(`📡 Fetching RSS feed: ${RSS_URL}`);

    try {
        const feed = await parser.parseURL(RSS_URL);
        console.log(`✅ Found ${feed.items.length} recent videos`);

        // Get or Create PokerNews Bot Profile
        // We'll look for a content_author with name "PokerNews" or create one linked to a system profile if needed.
        // For simplicity, we'll try to find an existing profile or just use a placeholder ID if your system allows.
        // BETTER: Let's find the "Smarter Bot" or "PokerNews" profile.

        let { data: author } = await supabase
            .from('content_authors')
            .select('id, profile_id') // We need profile_id for foreign keys usually
            .ilike('name', '%PokerNews%')
            .not('profile_id', 'is', null)
            .maybeSingle();

        if (!author) {
            console.log('⚠️ PokerNews author not found. Falling back to first valid author...');
            const { data: fallback } = await supabase
                .from('content_authors')
                .select('id, profile_id')
                .not('profile_id', 'is', null) // Ensure we get one with a profile
                .limit(1)
                .single();
            author = fallback;
        }

        if (!author || !author.profile_id) {
            console.error('❌ No valid content author found (with profile_id) to attribute videos to.');
            return;
        }

        console.log(`👤 Attributing to author: ID ${author.id} (Profile: ${author.profile_id})`);

        let newVideos = 0;
        let skipped = 0;

        for (const item of feed.items) {
            const videoId = item.id.replace('yt:video:', '');
            const videoUrl = item.link;
            const title = item.title;
            const publishedAt = item.isoDate;

            // 1. Check for duplicates in social_reels
            const { data: existing } = await supabase
                .from('social_reels')
                .select('id')
                .eq('video_url', videoUrl)
                .maybeSingle();

            if (existing) {
                skipped++;
                continue;
            }

            // 2. Insert new reel
            // Using logic similar to seed-reels.mjs
            // "social_reels" usually expects: { video_url, caption, is_public, author_id? }
            // Check table schema if unsure, but standard fields are safe.

            const { error: insertError } = await supabase
                .from('social_reels')
                .insert({
                    video_url: videoUrl,
                    caption: title,
                    is_public: true,
                    created_at: publishedAt,
                    author_id: author.profile_id
                });

            if (insertError) {
                console.error(`❌ Failed to insert "${title}":`, insertError.message);
            } else {
                console.log(`✅ Imported: ${title.substring(0, 50)}...`);
                newVideos++;
            }
        }

        console.log(`\n🎉 Sync Complete!`);
        console.log(`   🆕 Imported: ${newVideos}`);
        console.log(`   ⏭️ Skipped: ${skipped}`);

    } catch (error) {
        console.error('❌ Critical Error:', error.message);
    }
}

ingestVideos();
