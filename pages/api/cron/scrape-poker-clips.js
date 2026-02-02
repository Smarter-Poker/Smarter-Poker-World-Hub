/**
 * 🎬 DAILY POKER CLIPS SCRAPER - Auto-discovers Fresh Content
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Runs daily at 6am UTC to fetch new poker clips from 50+ YouTube channels.
 * Stores new clips in video_clips table for the horses to post.
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 50+ YouTube channel IDs for poker content
const POKER_CHANNELS = [
    // LIVE STREAMS
    { id: 'UCcxKh0hpmxL7xVQAsptbGNw', name: 'Hustler Casino Live', source: 'HCL' },
    { id: 'UCkkF_i0rlW4OuT73yzYcAKw', name: 'Live at the Bike', source: 'LATB' },
    { id: 'UCORTjwH-0F1DzLiQfvBUvpQ', name: 'PokerGO', source: 'POKERGO' },
    { id: 'UC7sL8bdz3y3_KlaNvPzP9Uw', name: 'Triton Poker', source: 'TRITON' },
    { id: 'UC9wF56KlFNwNhS1S-9iq5og', name: 'The Lodge', source: 'LODGE' },
    { id: 'UCQfcmMPhV0VFjmN2Kn6tNlA', name: 'TCH Live', source: 'TCH' },

    // MAJOR TOURS
    { id: 'UCVyIAPCmHKS5xrgxbPJeDRA', name: 'WSOP', source: 'WSOP' },
    { id: 'UClxPYB6dJL9KKpKDhYU3zzw', name: 'World Poker Tour', source: 'WPT' },
    { id: 'UCGn3-2LtsXHmsqmQ-RJh6lg', name: 'PokerStars', source: 'EPT' },
    { id: 'UC5W-mDZVjbXoC0lFT7MJIqQ', name: 'PokerNews', source: 'POKERNEWS' },

    // TOP VLOGGERS
    { id: 'UC1_gU-L4NLQK3rJnlIzBEbQ', name: 'Brad Owen', source: 'BRAD' },
    { id: 'UC7bF-b_sFlMd8V1f9xK8gAQ', name: 'Andrew Neeme', source: 'NEEME' },
    { id: 'UCGz1f3sXnMDdspLz5kh8sEA', name: 'Rampage Poker', source: 'RAMPAGE' },
    { id: 'UC5rNHRFzLLyAqHMX7s1r0Zg', name: 'Wolfgang Poker', source: 'WOLFGANG' },
    { id: 'UCE9LgPKLlZP8cVzQXt6mN7A', name: 'Mariano', source: 'MARIANO' },
    { id: 'UCvv8hpRpVjZbz_sXy8smBpA', name: 'JohnnieVibes', source: 'JOHNNIE' },
    { id: 'UCxw8bXjQp_sCbgE1smB4VGA', name: 'Jaman Burton', source: 'JAMAN' },
    { id: 'UCd3E_tXpPLvKVhg7CGv1Xdg', name: 'Boski', source: 'BOSKI' },
    { id: 'UCNn4VRf_jt2v9F9f5z2FiGA', name: 'Ryan Depaulo', source: 'RYAN' },

    // TRAINING/STRATEGY
    { id: 'UCGq7E9v_jN3QnVxH8XHGV5A', name: 'Jonathan Little', source: 'JLITTLE' },
    { id: 'UC5k4ILxP6lv7bGXI_hVL9Rg', name: 'Doug Polk', source: 'POLK' },
    { id: 'UC0y1f6JQcxn4L9LbQ6P5VnQ', name: 'Bart Hanson', source: 'BART' },
    { id: 'UC8w0F6HuJz8f1IxzYEP_jOw', name: 'Upswing Poker', source: 'UPSWING' },

    // CELEBRITIES
    { id: 'UCKb6t4aFTlXlFxIGMxGYTcg', name: 'Daniel Negreanu', source: 'DANIEL' },
    { id: 'UCjN7v3x_z4FzYyB_F3f9gAg', name: 'Lex Veldhuis', source: 'LEX_V' },
];

// Categories based on title keywords
function categorizeClip(title) {
    const lower = title.toLowerCase();
    if (lower.includes('bluff') || lower.includes('hero call')) return 'bluff';
    if (lower.includes('bad beat') || lower.includes('cooler') || lower.includes('outplayed')) return 'bad_beat';
    if (lower.includes('pot') || lower.includes('$') || lower.includes('all-in') || lower.includes('all in')) return 'massive_pot';
    if (lower.includes('drama') || lower.includes('fight') || lower.includes('angry') || lower.includes('rage')) return 'table_drama';
    if (lower.includes('read') || lower.includes('soul') || lower.includes('fold')) return 'soul_read';
    if (lower.includes('airball') || lower.includes('keating') || lower.includes('mariano') || lower.includes('ivey') || lower.includes('hellmuth') || lower.includes('negreanu') || lower.includes('dwan')) return 'celebrity';
    if (lower.includes('funny') || lower.includes('lol') || lower.includes('hilarious') || lower.includes('lmao')) return 'funny';
    if (lower.includes('wsop') || lower.includes('wpt') || lower.includes('ept') || lower.includes('tournament') || lower.includes('final table')) return 'tournament';
    if (lower.includes('million') || lower.includes('high stakes') || lower.includes('triton')) return 'high_stakes';
    if (lower.includes('vlog') || lower.includes('session')) return 'vlog';
    return 'educational';
}

/**
 * Fetch recent videos from a YouTube channel via RSS
 */
async function fetchChannelVideos(channel) {
    try {
        const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channel.id}`;
        const response = await fetch(feedUrl);

        if (!response.ok) {
            console.log(`   ⚠️ Failed to fetch ${channel.name}: ${response.status}`);
            return [];
        }

        const xml = await response.text();

        // Parse video IDs and titles from XML
        const videoMatches = xml.matchAll(/<yt:videoId>([^<]+)<\/yt:videoId>/g);
        const titleMatches = xml.matchAll(/<media:title>([^<]+)<\/media:title>/g);

        const videoIds = [...videoMatches].map(m => m[1]);
        const titles = [...titleMatches].map(m => m[1]);

        const videos = videoIds.slice(0, 15).map((id, i) => ({
            clip_id: `${channel.source.toLowerCase()}_${id}`,
            video_id: id,
            source_url: `https://www.youtube.com/watch?v=${id}`,
            source: channel.source,
            source_name: channel.name,
            title: titles[i] || 'Poker Clip',
            category: categorizeClip(titles[i] || ''),
            tags: [channel.source.toLowerCase()],
            thumbnail_url: `https://img.youtube.com/vi/${id}/hqdefault.jpg`
        }));

        console.log(`   ✅ ${channel.name}: ${videos.length} videos`);
        return videos;

    } catch (error) {
        console.error(`   ❌ Error fetching ${channel.name}: ${error.message}`);
        return [];
    }
}

/**
 * Get list of clip IDs we already have
 */
async function getExistingClipIds() {
    const existingIds = new Set();

    // Check video_clips table
    const { data: existingClips } = await supabase
        .from('video_clips')
        .select('clip_id, video_id')
        .limit(5000);

    (existingClips || []).forEach(c => {
        if (c.clip_id) existingIds.add(c.clip_id);
        if (c.video_id) existingIds.add(c.video_id);
    });

    // Also check social_posts metadata
    const { data: existingPosts } = await supabase
        .from('social_posts')
        .select('metadata')
        .eq('content_type', 'video')
        .not('metadata', 'is', null)
        .limit(1000);

    (existingPosts || []).forEach(post => {
        if (post.metadata?.clip_id) existingIds.add(post.metadata.clip_id);
        if (post.metadata?.video_id) existingIds.add(post.metadata.video_id);
    });

    return existingIds;
}

/**
 * Store new clips in video_clips table
 */
async function storeNewClips(clips) {
    if (clips.length === 0) return { inserted: 0 };

    // Prepare clips for insertion
    const clipsToInsert = clips.map(c => ({
        clip_id: c.clip_id,
        video_id: c.video_id,
        source_url: c.source_url,
        source: c.source,
        title: c.title,
        category: c.category,
        tags: c.tags,
        thumbnail_url: c.thumbnail_url,
        discovered_at: new Date().toISOString(),
        is_active: true
    }));

    const { data, error } = await supabase
        .from('video_clips')
        .insert(clipsToInsert)
        .select('clip_id');

    if (error) {
        console.error('   Insert error:', error.message);
        return { inserted: 0, error: error.message };
    }

    return { inserted: data?.length || 0 };
}

export default async function handler(req, res) {
    console.log('\n🎬 DAILY POKER CLIPS SCRAPER');
    console.log('═'.repeat(50));
    console.log(`📅 ${new Date().toISOString()}`);

    if (!SUPABASE_URL) {
        return res.status(500).json({ error: 'Missing SUPABASE_URL' });
    }

    try {
        const existingIds = await getExistingClipIds();
        console.log(`📋 Found ${existingIds.size} existing clips to avoid\n`);

        let totalNew = 0;
        const allNewClips = [];

        // Process each channel
        for (const channel of POKER_CHANNELS) {
            const videos = await fetchChannelVideos(channel);

            // Filter out existing clips
            const newVideos = videos.filter(v =>
                !existingIds.has(v.clip_id) && !existingIds.has(v.video_id)
            );

            allNewClips.push(...newVideos);
            totalNew += newVideos.length;

            // Small delay between channels to be nice
            await new Promise(r => setTimeout(r, 500));
        }

        console.log(`\n📊 SUMMARY:`);
        console.log(`   Total new clips found: ${totalNew}`);

        // Store new clips in database
        let insertResult = { inserted: 0 };
        if (allNewClips.length > 0) {
            console.log('\n💾 Storing new clips in database...');
            insertResult = await storeNewClips(allNewClips);
            console.log(`   Inserted: ${insertResult.inserted} clips`);

            console.log('\n📝 Sample new clips:');
            allNewClips.slice(0, 5).forEach(c => {
                console.log(`   - [${c.source}] ${c.title.substring(0, 50)}...`);
            });
        }

        return res.status(200).json({
            success: true,
            channels_scraped: POKER_CHANNELS.length,
            new_clips_found: totalNew,
            clips_inserted: insertResult.inserted,
            sample_clips: allNewClips.slice(0, 10).map(c => ({
                source: c.source,
                title: c.title,
                category: c.category
            })),
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Scraper error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
