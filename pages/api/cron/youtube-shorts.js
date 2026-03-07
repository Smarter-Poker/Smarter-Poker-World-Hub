/**
 * 🎬 YOUTUBE POKER VIDEO & SHORTS SCRAPER (RSS-Based)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Scrapes latest videos from top poker YouTube channels via RSS feeds.
 * Posts to social_reels table as SmarterPokerOfficial account.
 *
 * Uses YouTube RSS feeds (https://www.youtube.com/feeds/videos.xml?channel_id=XXX)
 * which return the 15 most recent uploads in chronological order.
 * This is far more reliable than HTML scraping which returns popular/trending videos.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import Parser from 'rss-parser';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY || ANON_KEY);

const parser = new Parser({
    headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    }
});

// SmarterPokerOfficial system account UUID
const SYSTEM_ACCOUNT_UUID = '00000000-0000-0000-0000-000000000001';

const CONFIG = {
    MAX_VIDEOS_PER_CHANNEL: 3,
    MAX_TOTAL_VIDEOS: 50,
    REQUEST_DELAY: 500
};

// Verified YouTube channel IDs (extracted Feb 2026)
const POKER_CHANNELS = [
    // Major Poker Media
    { name: 'PokerGO', channelId: 'UCOPw3R-TUUNqgN2bQyidW2w' },
    { name: 'WSOP', channelId: 'UC9m6fb3RXf-W90fH3KkZAJw' },
    { name: 'PokerStars', channelId: 'UCGWkDcYbDKP9r--ym28YwAQ' },
    { name: 'World Poker Tour', channelId: 'UCEUGxpG2rkyJlCvr46PBr6g' },
    { name: 'PokerNews', channelId: 'UCSu1ww_wgD0XD66C1ESrIGQ' },

    // Popular Vloggers & Pros
    { name: 'Doug Polk Poker', channelId: 'UCyI7FNTudkyALBh9N7hwI9Q' },
    { name: 'Brad Owen Poker', channelId: 'UCxYljUelq6VBk4m8dM-7NVA' },
    { name: 'Andrew Neeme', channelId: 'UCLTP4Ns4v8EsVS0DVGugQrQ' },
    { name: 'Rampage Poker', channelId: 'UCToA-j1kPYHmllFVQ5k2rYg' },
    { name: 'Wolfgang Poker', channelId: 'UCNmJnAkKIn5ce2QLHIKk3aw' },
    { name: 'Jaman Burton', channelId: 'UCwsmVceG4i2AK6u3LicPwBA' },

    // Training & Strategy
    { name: 'Poker Coaching', channelId: 'UCOWqXBOz_hoBtaqwWN_kaQQ' },
    { name: 'Upswing Poker', channelId: 'UCHyxrwq_j4vcReGKd42tWyw' },
    { name: 'Solve For Why', channelId: 'UCfTYOriUd_yOkUUgoDZX71w' },
    { name: 'Run It Once', channelId: 'UCs_Zf4zS6x_jsvyBg7FrJnw' },

    // High Stakes & Live
    { name: 'Hustler Casino Live', channelId: 'UCQe7wB0o_cZgv1miyYB9TMA' },
    { name: 'Bally Poker Live', channelId: 'UCvOEO35ieBuL-KdV0fXiuag' },
    { name: 'Poker Bunny', channelId: 'UCtXO6IVrDZC6W9okqqaQ-wQ' },

    // Pro Players
    { name: 'Daniel Negreanu', channelId: 'UC0w4AA42ItXQEb9aZld87-w' },
    { name: 'Phil Hellmuth', channelId: 'UCmJjB85zuQcX8-uuihyOnkg' },
    { name: 'Lex Veldhuis', channelId: 'UCXbZOVqJf4DFzMSJH2heJmw' },
];

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchChannelVideos(channel) {
    const videos = [];
    const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channel.channelId}`;


    try {
        const feed = await parser.parseURL(rssUrl);

        if (!feed.items || feed.items.length === 0) {
            return videos;
        }


        // Take the most recent videos up to the per-channel limit
        for (const item of feed.items.slice(0, CONFIG.MAX_VIDEOS_PER_CHANNEL)) {
            const videoUrl = item.link;
            const title = item.title;
            const publishedAt = item.isoDate || item.pubDate;

            if (!videoUrl || !title) continue;

            // Extract video ID from URL
            const videoIdMatch = videoUrl.match(/(?:v=|\/shorts\/)([a-zA-Z0-9_-]{11})/);
            const videoId = videoIdMatch ? videoIdMatch[1] : null;

            // Also try yt:videoId from the feed
            const ytVideoId = videoId || item.id?.replace('yt:video:', '') || null;

            if (!ytVideoId) continue;

            // Build both possible URLs (regular video and shorts)
            const watchUrl = `https://www.youtube.com/watch?v=${ytVideoId}`;
            const shortsUrl = `https://www.youtube.com/shorts/${ytVideoId}`;

            videos.push({
                video_id: ytVideoId,
                video_url: watchUrl,
                shorts_url: shortsUrl,
                title: title.substring(0, 200),
                thumbnail_url: `https://i.ytimg.com/vi/${ytVideoId}/hqdefault.jpg`,
                channel_name: channel.name,
                published_at: publishedAt
            });
        }
    } catch (error) {
        console.error(`   ❌ RSS Error for ${channel.name}: ${error.message}`);
    }

    return videos;
}

async function saveVideos(videos) {
    let saved = 0;
    let skipped = 0;

    // Get ALL existing video URLs to avoid duplicates (check both watch and shorts URLs)
    const { data: existingReels } = await supabase
        .from('social_reels')
        .select('video_url');

    const existingUrls = new Set(existingReels?.map(r => r.video_url) || []);

    for (const video of videos) {
        // Skip if either the watch URL or shorts URL already exists
        if (existingUrls.has(video.video_url) || existingUrls.has(video.shorts_url)) {
            skipped++;
            continue;
        }

        const { data, error } = await supabase
            .from('social_reels')
            .insert({
                author_id: SYSTEM_ACCOUNT_UUID,
                video_url: video.video_url,
                caption: `🎬 ${video.title}\n\n📺 From: ${video.channel_name}\n#poker #pokershorts`,
                thumbnail_url: video.thumbnail_url,
                is_public: true,
                created_at: video.published_at || new Date().toISOString()
            })
            .select()
            .single();

        if (data && !error) {
            saved++;
            existingUrls.add(video.video_url);
            existingUrls.add(video.shorts_url);
        } else if (error) {
            // Silently skip unique constraint violations
            if (!error.message.includes('duplicate') && !error.message.includes('unique')) {
                console.error(`   Error saving video:`, error.message);
            }
            skipped++;
        }
    }

    return { saved, skipped };
}

export default async function handler(req, res) {
    // Verify cron secret
    if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    // Security: validate cron auth for external callers
    const { validateCronAuth } = await import('../../../src/utils/cron-auth.js');
    if (!validateCronAuth(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }


    try {
        // Verify system account exists
        const { data: systemAccount, error: accountError } = await supabase
            .from('profiles')
            .select('id, username')
            .eq('id', SYSTEM_ACCOUNT_UUID)
            .single();

        if (accountError || !systemAccount) {
            console.error('❌ System account not found!');
            return res.status(500).json({
                success: false,
                error: 'System account not found.'
            });
        }


        const allVideos = [];
        const channelResults = {};

        for (const channel of POKER_CHANNELS) {
            if (allVideos.length >= CONFIG.MAX_TOTAL_VIDEOS) {
                break;
            }

            const videos = await fetchChannelVideos(channel);
            channelResults[channel.name] = videos.length;
            allVideos.push(...videos);

            // Be respectful with rate limiting
            await delay(CONFIG.REQUEST_DELAY);
        }


        const { saved, skipped } = await saveVideos(allVideos);

        for (const [name, count] of Object.entries(channelResults)) {
        }

        return res.status(200).json({
            success: true,
            timestamp: new Date().toISOString(),
            account: systemAccount.username,
            channels_scraped: POKER_CHANNELS.length,
            found: allVideos.length,
            saved,
            skipped
        });

    } catch (error) {
        console.error('❌ Scraper error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
