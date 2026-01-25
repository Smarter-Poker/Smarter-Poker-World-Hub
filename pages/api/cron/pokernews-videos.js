/**
 * 🎬 POKERNEWS VIDEO SCRAPER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Scrapes latest videos from PokerNews.com/video/
 * Saves to poker_videos table for display on the news page
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const CONFIG = {
    MAX_VIDEOS: 20,
    REQUEST_TIMEOUT: 15000
};

async function fetchPage(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);

    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
        });
        clearTimeout(timeout);
        if (!response.ok) return null;
        return await response.text();
    } catch (error) {
        clearTimeout(timeout);
        return null;
    }
}

function cleanText(text) {
    if (!text) return '';
    return text
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

async function scrapeVideoPage(url) {
    const html = await fetchPage(url);
    if (!html) return null;

    // Extract thumbnail (og:image)
    let thumbnail = null;
    const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    if (ogMatch) thumbnail = ogMatch[1];
    if (!ogMatch) {
        const ogMatch2 = html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
        if (ogMatch2) thumbnail = ogMatch2[1];
    }

    // Try to extract YouTube video ID
    let youtubeId = null;
    const ytMatch = html.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/i);
    if (ytMatch) youtubeId = ytMatch[1];
    if (!youtubeId) {
        const ytMatch2 = html.match(/youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/i);
        if (ytMatch2) youtubeId = ytMatch2[1];
    }

    // Extract description
    let description = '';
    const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
    if (descMatch) description = cleanText(descMatch[1]);

    return { thumbnail, youtubeId, description };
}

async function scrapePokerNewsVideos() {
    console.log('🎬 Scraping PokerNews videos...');

    const videos = [];
    const seen = new Set();

    // Scrape multiple pages for more videos
    const pages = [
        'https://www.pokernews.com/video/most-recent/',
        'https://www.pokernews.com/video/popular-this-week/',
        'https://www.pokernews.com/video/world-series-of-poker/'
    ];

    for (const pageUrl of pages) {
        if (videos.length >= CONFIG.MAX_VIDEOS) break;

        const html = await fetchPage(pageUrl);
        if (!html) continue;

        // Video URL pattern: /video/title-XXXXX.htm
        const pattern = /href=["'](\/video\/[^"']+\.htm)["'][^>]*class=["']title["'][^>]*>([^<]+)/gi;
        const matches = html.matchAll(pattern);

        for (const match of matches) {
            if (videos.length >= CONFIG.MAX_VIDEOS) break;

            const path = match[1];
            let title = cleanText(match[2]);

            if (!title || title.length < 10 || seen.has(path)) continue;

            // Clean up title
            title = title.replace(/\s*\|\s*PokerNews.*$/i, '').trim();
            title = title.replace(/\s*\|\s*#\w+.*$/i, '').trim();

            const url = 'https://www.pokernews.com' + path;
            seen.add(path);

            console.log(`   Checking: ${title.substring(0, 50)}...`);

            // Get video details
            const details = await scrapeVideoPage(url);

            videos.push({
                title,
                url,
                thumbnail_url: details?.thumbnail || 'https://images.pexels.com/photos/1871508/pexels-photo-1871508.jpeg?auto=compress&cs=tinysrgb&w=600',
                youtube_id: details?.youtubeId || null,
                description: details?.description || title,
                channel: 'PokerNews',
                source: 'pokernews',
                duration: null,
                views: 0
            });
        }
    }

    return videos;
}

async function saveVideos(videos) {
    let saved = 0;

    for (const video of videos) {
        const { data, error } = await supabase
            .from('poker_videos')
            .upsert({
                title: video.title,
                url: video.url,
                thumbnail_url: video.thumbnail_url,
                youtube_id: video.youtube_id,
                description: video.description,
                channel: video.channel,
                source: video.source,
                duration: video.duration,
                views: video.views,
                is_featured: false,
                scraped_at: new Date().toISOString(),
                published_at: new Date().toISOString()
            }, {
                onConflict: 'url',
                ignoreDuplicates: true
            })
            .select()
            .single();

        if (data && !error) {
            saved++;
            console.log(`   ✓ Saved: ${video.title.substring(0, 40)}...`);
        }
    }

    return saved;
}

export default async function handler(req, res) {
    console.log('\n');
    console.log('═'.repeat(70));
    console.log('🎬 POKERNEWS VIDEO SCRAPER');
    console.log('═'.repeat(70));
    console.log(`⏰ Started at: ${new Date().toISOString()}`);

    try {
        const videos = await scrapePokerNewsVideos();
        console.log(`\n📹 Found ${videos.length} videos`);

        const saved = await saveVideos(videos);

        console.log('\n═'.repeat(70));
        console.log(`📊 SUMMARY: ${saved}/${videos.length} videos saved`);
        console.log('═'.repeat(70));

        return res.status(200).json({
            success: true,
            timestamp: new Date().toISOString(),
            found: videos.length,
            saved
        });

    } catch (error) {
        console.error('❌ Scraper error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
