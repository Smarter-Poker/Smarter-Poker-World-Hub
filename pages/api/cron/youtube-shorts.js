/**
 * 🎬 YOUTUBE SHORTS POKER SCRAPER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Scrapes poker Shorts from top YouTube channels
 * Saves to poker_reels table for the Reels feature
 *
 * Channels:
 * - PokerGO, Doug Polk, Jonathan Little, Upswing Poker
 * - Daniel Negreanu, WSOP, PokerStars, partypoker
 * - Hustler Casino Live, Poker Clips channels
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const CONFIG = {
    MAX_REELS_PER_CHANNEL: 10,
    MAX_TOTAL_REELS: 50,
    REQUEST_TIMEOUT: 15000,
    REQUEST_DELAY: 1000
};

// Top poker YouTube channels with their channel handles/IDs
const POKER_CHANNELS = [
    { name: 'PokerGO', handle: '@PokerGO' },
    { name: 'Doug Polk Poker', handle: '@DougPolkVlogs' },
    { name: 'Jonathan Little', handle: '@JonathanLittlePoker' },
    { name: 'Upswing Poker', handle: '@UpswingPoker' },
    { name: 'Daniel Negreanu', handle: '@DNegs' },
    { name: 'WSOP', handle: '@WSOP' },
    { name: 'PokerStars', handle: '@PokerStars' },
    { name: 'Hustler Casino Live', handle: '@HustlerCasinoLive' },
    { name: 'Poker Bunny', handle: '@pokerbunny' },
    { name: 'Brad Owen', handle: '@TheBradOwenShow' },
    { name: 'Mariano', handle: '@maraborern' },
    { name: 'Rampage Poker', handle: '@RampagePoker' }
];

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchPage(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);

    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9'
            }
        });
        clearTimeout(timeout);
        if (!response.ok) return null;
        return await response.text();
    } catch (error) {
        clearTimeout(timeout);
        console.error(`   Failed to fetch ${url}:`, error.message);
        return null;
    }
}

function cleanText(text) {
    if (!text) return '';
    return text
        .replace(/\\u0026/g, '&')
        .replace(/\\u003c/g, '<')
        .replace(/\\u003e/g, '>')
        .replace(/\\"/g, '"')
        .replace(/\\/g, '')
        .replace(/\n/g, ' ')
        .trim();
}

async function scrapeChannelShorts(channel) {
    const shorts = [];
    const shortsUrl = `https://www.youtube.com/${channel.handle}/shorts`;

    console.log(`   📺 Scraping ${channel.name} shorts...`);

    const html = await fetchPage(shortsUrl);
    if (!html) {
        console.log(`   ⚠️ Could not fetch ${channel.name} shorts page`);
        return shorts;
    }

    // Extract video data from YouTube's initial data JSON
    // YouTube embeds video data in ytInitialData variable
    const dataMatch = html.match(/var ytInitialData = ({.+?});/s);
    if (!dataMatch) {
        // Try alternative pattern
        const altMatch = html.match(/ytInitialData["\s]*[=:]\s*({.+?});/s);
        if (!altMatch) {
            console.log(`   ⚠️ Could not find video data for ${channel.name}`);
            return shorts;
        }
    }

    // Extract video IDs from the page using regex patterns
    // Shorts URLs follow pattern: /shorts/VIDEO_ID
    const shortIdPattern = /\/shorts\/([a-zA-Z0-9_-]{11})/g;
    const matches = [...html.matchAll(shortIdPattern)];
    const uniqueIds = [...new Set(matches.map(m => m[1]))];

    console.log(`   Found ${uniqueIds.length} shorts for ${channel.name}`);

    // Extract titles - they appear near the video IDs in the JSON
    const titlePattern = /"title":\s*\{"runs":\s*\[\{"text":\s*"([^"]+)"\}\]/g;
    const titles = [...html.matchAll(titlePattern)].map(m => cleanText(m[1]));

    // Extract view counts
    const viewPattern = /"viewCountText":\s*\{"simpleText":\s*"([^"]+)"\}/g;
    const views = [...html.matchAll(viewPattern)].map(m => {
        const viewStr = m[1].replace(/[^0-9KMB.]/gi, '');
        if (viewStr.includes('K')) return Math.round(parseFloat(viewStr) * 1000);
        if (viewStr.includes('M')) return Math.round(parseFloat(viewStr) * 1000000);
        if (viewStr.includes('B')) return Math.round(parseFloat(viewStr) * 1000000000);
        return parseInt(viewStr) || 0;
    });

    // Build shorts objects
    for (let i = 0; i < Math.min(uniqueIds.length, CONFIG.MAX_REELS_PER_CHANNEL); i++) {
        const videoId = uniqueIds[i];
        const title = titles[i] || `${channel.name} Short`;
        const viewCount = views[i] || 0;

        shorts.push({
            youtube_id: videoId,
            title: title.substring(0, 200),
            thumbnail_url: `https://i.ytimg.com/vi/${videoId}/oar2.jpg`, // Shorts thumbnail
            channel_name: channel.name,
            channel_id: channel.handle,
            description: title,
            duration_seconds: 60, // Shorts are max 60 seconds
            view_count: viewCount,
            published_at: new Date().toISOString() // We don't have exact date from scraping
        });
    }

    return shorts;
}

async function saveReels(reels) {
    let saved = 0;
    let skipped = 0;

    for (const reel of reels) {
        const { data, error } = await supabase
            .from('poker_reels')
            .upsert({
                youtube_id: reel.youtube_id,
                title: reel.title,
                thumbnail_url: reel.thumbnail_url,
                channel_name: reel.channel_name,
                channel_id: reel.channel_id,
                description: reel.description,
                duration_seconds: reel.duration_seconds,
                view_count: reel.view_count,
                published_at: reel.published_at,
                scraped_at: new Date().toISOString()
            }, {
                onConflict: 'youtube_id',
                ignoreDuplicates: false // Update view counts
            })
            .select()
            .single();

        if (data && !error) {
            saved++;
        } else if (error?.code === '23505') {
            skipped++;
        } else if (error) {
            console.error(`   Error saving reel:`, error.message);
        }
    }

    return { saved, skipped };
}

export default async function handler(req, res) {
    console.log('\n');
    console.log('═'.repeat(70));
    console.log('🎬 YOUTUBE SHORTS POKER SCRAPER');
    console.log('═'.repeat(70));
    console.log(`⏰ Started at: ${new Date().toISOString()}`);

    try {
        const allReels = [];

        for (const channel of POKER_CHANNELS) {
            if (allReels.length >= CONFIG.MAX_TOTAL_REELS) {
                console.log(`   Reached max reels limit (${CONFIG.MAX_TOTAL_REELS})`);
                break;
            }

            const shorts = await scrapeChannelShorts(channel);
            allReels.push(...shorts);

            // Be respectful with rate limiting
            await delay(CONFIG.REQUEST_DELAY);
        }

        console.log(`\n📹 Total reels found: ${allReels.length}`);

        const { saved, skipped } = await saveReels(allReels);

        console.log('\n═'.repeat(70));
        console.log(`📊 SUMMARY`);
        console.log(`   Found: ${allReels.length}`);
        console.log(`   Saved/Updated: ${saved}`);
        console.log(`   Skipped: ${skipped}`);
        console.log('═'.repeat(70));

        return res.status(200).json({
            success: true,
            timestamp: new Date().toISOString(),
            channels_scraped: POKER_CHANNELS.length,
            found: allReels.length,
            saved,
            skipped
        });

    } catch (error) {
        console.error('❌ Scraper error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
