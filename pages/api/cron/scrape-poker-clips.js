/**
 * 🎬 FRESH POKER CLIPS SCRAPER - Fetch New Content Daily
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Daily scraper to fetch new poker clips from YouTube channels.
 * Runs at 6am UTC daily to populate fresh content.
 * 
 * Sources:
 * - Hustler Casino Live
 * - Live at the Bike
 * - PokerGO
 * - Triton Poker
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// YouTube channel IDs for poker content
const POKER_CHANNELS = [
    { id: 'UCcxKh0hpmxL7xVQAsptbGNw', name: 'Hustler Casino Live', tag: 'hcl' },
    { id: 'UCkkF_i0rlW4OuT73yzYcAKw', name: 'Live at the Bike', tag: 'latb' },
    { id: 'UCORTjwH-0F1DzLiQfvBUvpQ', name: 'PokerGO', tag: 'pokergo' },
    { id: 'UC7sL8bdz3y3_KlaNvPzP9Uw', name: 'Triton Poker', tag: 'triton' }
];

// Categories based on title keywords
function categorizeClip(title) {
    const lower = title.toLowerCase();
    if (lower.includes('bluff') || lower.includes('hero call')) return 'bluff';
    if (lower.includes('bad beat') || lower.includes('cooler') || lower.includes('outplayed')) return 'bad_beat';
    if (lower.includes('pot') || lower.includes('$') || lower.includes('all-in')) return 'massive_pot';
    if (lower.includes('drama') || lower.includes('fight') || lower.includes('angry')) return 'table_drama';
    if (lower.includes('read') || lower.includes('soul')) return 'soul_read';
    if (lower.includes('airball') || lower.includes('keating') || lower.includes('mariano')) return 'celebrity';
    if (lower.includes('funny') || lower.includes('lol') || lower.includes('hilarious')) return 'funny';
    return 'educational';
}

/**
 * Fetch recent videos from a YouTube channel via RSS
 * (Simplified approach - no API key needed)
 */
async function fetchChannelVideos(channel) {
    try {
        const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channel.id}`;
        const response = await fetch(feedUrl);

        if (!response.ok) {
            console.log(`   Failed to fetch ${channel.name}: ${response.status}`);
            return [];
        }

        const xml = await response.text();

        // Parse video IDs from XML (basic regex parsing)
        const videoMatches = xml.matchAll(/<yt:videoId>([^<]+)<\/yt:videoId>/g);
        const titleMatches = xml.matchAll(/<media:title>([^<]+)<\/media:title>/g);

        const videoIds = [...videoMatches].map(m => m[1]);
        const titles = [...titleMatches].map(m => m[1]);

        const videos = videoIds.slice(0, 10).map((id, i) => ({
            clip_id: `${channel.tag}_${id}`,
            video_id: id,
            source_url: `https://www.youtube.com/watch?v=${id}`,
            source: channel.name,
            title: titles[i] || 'Poker Clip',
            category: categorizeClip(titles[i] || ''),
            tags: [channel.tag],
            thumbnail_url: `https://img.youtube.com/vi/${id}/hqdefault.jpg`
        }));

        console.log(`   Fetched ${videos.length} videos from ${channel.name}`);
        return videos;

    } catch (error) {
        console.error(`   Error fetching ${channel.name}: ${error.message}`);
        return [];
    }
}

/**
 * Get list of clip IDs we already have in the library
 */
async function getExistingClipIds() {
    // For now, the library is static - we check against social_posts metadata
    const { data: existingPosts } = await supabase
        .from('social_posts')
        .select('metadata')
        .eq('content_type', 'video')
        .not('metadata', 'is', null)
        .limit(1000);

    const existingIds = new Set();
    (existingPosts || []).forEach(post => {
        if (post.metadata?.clip_id) existingIds.add(post.metadata.clip_id);
        if (post.metadata?.source_video_id) existingIds.add(post.metadata.source_video_id);
    });

    return existingIds;
}

export default async function handler(req, res) {
    console.log('\n🎬 FRESH CLIPS SCRAPER');
    console.log('═'.repeat(50));

    if (!SUPABASE_URL) {
        return res.status(500).json({ error: 'Missing SUPABASE_URL' });
    }

    try {
        const existingIds = await getExistingClipIds();
        console.log(`📋 Found ${existingIds.size} existing clips to avoid`);

        let totalNew = 0;
        const allNewClips = [];

        for (const channel of POKER_CHANNELS) {
            console.log(`\n📺 Scraping ${channel.name}...`);
            const videos = await fetchChannelVideos(channel);

            // Filter out existing clips
            const newVideos = videos.filter(v => !existingIds.has(v.clip_id) && !existingIds.has(v.video_id));

            console.log(`   New clips: ${newVideos.length}`);
            allNewClips.push(...newVideos);
            totalNew += newVideos.length;
        }

        // Log new clips (in future, could store in video_clips table)
        console.log(`\n✅ Found ${totalNew} new clips total`);

        if (allNewClips.length > 0) {
            console.log('\nNew clips discovered:');
            allNewClips.slice(0, 10).forEach(c => {
                console.log(`  - [${c.category}] ${c.title}`);
            });
        }

        return res.status(200).json({
            success: true,
            new_clips_found: totalNew,
            clips: allNewClips.slice(0, 20),
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Scraper error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
