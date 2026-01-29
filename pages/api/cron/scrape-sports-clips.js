/**
 * 🏈 SPORTS CLIPS SCRAPER - NBA, NFL, MLB, NHL, Soccer
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Scrapes REAL sports clips from top YouTube channels
 * Populates sports_clips table for horses to share
 *
 * Channels:
 * - ESPN, NBA, NFL, MLB, NHL, House of Highlights
 * - Bleacher Report, SportsCenter, FOX Sports, CBS Sports
 * - Premier League, UEFA, LaLiga, MLS
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY || ANON_KEY);

const CONFIG = {
    MAX_CLIPS_PER_CHANNEL: 10,
    MAX_TOTAL_CLIPS: 100,
    REQUEST_TIMEOUT: 15000,
    REQUEST_DELAY: 1500
};

// Top sports YouTube channels with their handles
const SPORTS_CHANNELS = [
    // NBA (10)
    { name: 'ESPN NBA', handle: '@ESPN', sport: 'nba', category: 'highlight' },
    { name: 'NBA', handle: '@NBA', sport: 'nba', category: 'highlight' },
    { name: 'House of Highlights', handle: '@HouseofHighlights', sport: 'nba', category: 'dunk' },
    { name: 'Bleacher Report NBA', handle: '@BleacherReport', sport: 'nba', category: 'highlight' },
    { name: 'NBA on TNT', handle: '@NBAonTNT', sport: 'nba', category: 'analysis' },
    { name: 'Lakers', handle: '@Lakers', sport: 'nba', category: 'highlight' },
    { name: 'Warriors', handle: '@Warriors', sport: 'nba', category: 'highlight' },
    { name: 'Celtics', handle: '@Celtics', sport: 'nba', category: 'highlight' },
    { name: 'Heat', handle: '@MiamiHeat', sport: 'nba', category: 'highlight' },
    { name: 'Bucks', handle: '@Bucks', sport: 'nba', category: 'highlight' },

    // NFL (10)
    { name: 'ESPN NFL', handle: '@ESPN', sport: 'nfl', category: 'highlight' },
    { name: 'NFL', handle: '@NFL', sport: 'nfl', category: 'touchdown' },
    { name: 'NFL Films', handle: '@NFLFilms', sport: 'nfl', category: 'highlight' },
    { name: 'Chiefs', handle: '@Chiefs', sport: 'nfl', category: 'touchdown' },
    { name: 'Cowboys', handle: '@DallasCowboys', sport: 'nfl', category: 'touchdown' },
    { name: 'Eagles', handle: '@Eagles', sport: 'nfl', category: 'touchdown' },
    { name: '49ers', handle: '@49ers', sport: 'nfl', category: 'touchdown' },
    { name: 'Bills', handle: '@BuffaloBills', sport: 'nfl', category: 'touchdown' },
    { name: 'Ravens', handle: '@Ravens', sport: 'nfl', category: 'touchdown' },
    { name: 'Packers', handle: '@packers', sport: 'nfl', category: 'touchdown' },

    // MLB (5)
    { name: 'ESPN MLB', handle: '@ESPN', sport: 'mlb', category: 'highlight' },
    { name: 'MLB', handle: '@MLB', sport: 'mlb', category: 'highlight' },
    { name: 'Yankees', handle: '@Yankees', sport: 'mlb', category: 'highlight' },
    { name: 'Dodgers', handle: '@Dodgers', sport: 'mlb', category: 'highlight' },
    { name: 'Red Sox', handle: '@RedSox', sport: 'mlb', category: 'highlight' },

    // NHL (5)
    { name: 'ESPN NHL', handle: '@ESPN', sport: 'nhl', category: 'goal' },
    { name: 'NHL', handle: '@NHL', sport: 'nhl', category: 'goal' },
    { name: 'Bruins', handle: '@NHLBruins', sport: 'nhl', category: 'goal' },
    { name: 'Maple Leafs', handle: '@MapleLeafs', sport: 'nhl', category: 'goal' },
    { name: 'Rangers', handle: '@NYRangers', sport: 'nhl', category: 'goal' },

    // Soccer (5)
    { name: 'ESPN FC', handle: '@ESPNFC', sport: 'soccer', category: 'goal' },
    { name: 'UEFA', handle: '@UEFA', sport: 'soccer', category: 'goal' },
    { name: 'Premier League', handle: '@PremierLeague', sport: 'soccer', category: 'goal' },
    { name: 'LaLiga', handle: '@LaLiga', sport: 'soccer', category: 'goal' },
    { name: 'MLS', handle: '@MLS', sport: 'soccer', category: 'goal' },

    // General Sports (5)
    { name: 'SportsCenter', handle: '@SportsCenter', sport: 'general', category: 'highlight' },
    { name: 'FOX Sports', handle: '@FOXSports', sport: 'general', category: 'highlight' },
    { name: 'CBS Sports', handle: '@CBSSports', sport: 'general', category: 'highlight' }
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
    const clips = [];
    const shortsUrl = `https://www.youtube.com/${channel.handle}/shorts`;

    console.log(`   🏈 Scraping ${channel.name} (${channel.sport})...`);

    const html = await fetchPage(shortsUrl);
    if (!html) {
        console.log(`   ⚠️ Could not fetch ${channel.name} shorts page`);
        return clips;
    }

    // Extract video IDs from shorts URLs
    const shortIdPattern = /\/shorts\/([a-zA-Z0-9_-]{11})/g;
    const matches = [...html.matchAll(shortIdPattern)];
    const uniqueIds = [...new Set(matches.map(m => m[1]))];

    console.log(`   Found ${uniqueIds.length} shorts for ${channel.name}`);

    // Extract titles
    const titlePattern = /"title":\s*\{"runs":\s*\[\{"text":\s*"([^"]+)"\}\]/g;
    const titles = [...html.matchAll(titlePattern)].map(m => cleanText(m[1]));

    // Build clips objects
    for (let i = 0; i < Math.min(uniqueIds.length, CONFIG.MAX_CLIPS_PER_CHANNEL); i++) {
        const videoId = uniqueIds[i];
        const title = titles[i] || `${channel.name} ${channel.sport.toUpperCase()} Clip`;

        clips.push({
            video_id: videoId,
            source_url: `https://www.youtube.com/shorts/${videoId}`,
            title: title.substring(0, 200),
            source: channel.name,
            sport_type: channel.sport,
            category: channel.category,
            channel_handle: channel.handle
        });
    }

    return clips;
}

async function saveClips(clips) {
    let saved = 0;
    let skipped = 0;

    // Get existing clips to avoid duplicates
    const { data: existingClips } = await supabase
        .from('sports_clips')
        .select('source_url');

    const existingUrls = new Set(existingClips?.map(c => c.source_url) || []);

    for (const clip of clips) {
        // Skip if already exists
        if (existingUrls.has(clip.source_url)) {
            skipped++;
            continue;
        }

        const { data, error } = await supabase
            .from('sports_clips')
            .insert({
                video_id: clip.video_id,
                source_url: clip.source_url,
                title: clip.title,
                source: clip.source,
                sport_type: clip.sport_type,
                category: clip.category,
                channel_handle: clip.channel_handle
            })
            .select()
            .single();

        if (data && !error) {
            saved++;
            existingUrls.add(clip.source_url);
        } else if (error) {
            console.error(`   Error saving clip:`, error.message);
        }
    }

    return { saved, skipped };
}

export default async function handler(req, res) {
    // Verify cron secret
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    console.log('\n');
    console.log('═'.repeat(70));
    console.log('🏈 SPORTS CLIPS SCRAPER - NBA/NFL/MLB/NHL/Soccer');
    console.log('═'.repeat(70));
    console.log(`⏰ Started at: ${new Date().toISOString()}`);

    try {
        const allClips = [];

        for (const channel of SPORTS_CHANNELS) {
            if (allClips.length >= CONFIG.MAX_TOTAL_CLIPS) {
                console.log(`   Reached max clips limit (${CONFIG.MAX_TOTAL_CLIPS})`);
                break;
            }

            const clips = await scrapeChannelShorts(channel);
            allClips.push(...clips);

            // Be respectful with rate limiting
            await delay(CONFIG.REQUEST_DELAY);
        }

        console.log(`\n🏈 Total clips found: ${allClips.length}`);

        const { saved, skipped } = await saveClips(allClips);

        console.log('\n═'.repeat(70));
        console.log(`📊 SUMMARY`);
        console.log(`   Found: ${allClips.length}`);
        console.log(`   Saved: ${saved}`);
        console.log(`   Skipped (duplicates): ${skipped}`);
        console.log('═'.repeat(70));

        return res.status(200).json({
            success: true,
            timestamp: new Date().toISOString(),
            channels_scraped: SPORTS_CHANNELS.length,
            found: allClips.length,
            saved,
            skipped
        });

    } catch (error) {
        console.error('❌ Scraper error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
