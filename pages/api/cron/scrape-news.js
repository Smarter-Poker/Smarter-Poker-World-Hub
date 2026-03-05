/**
 * News Auto-Scraper API - Runs hourly via Vercel Cron
 * Scrapes poker news from RSS feeds and generates AI summaries
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// RSS feed sources for poker news
// NOTE: Only sources with WORKING RSS feeds are included here.
// MSPT, WSOP, Pokerfuse, and Poker.org do NOT have working RSS feeds
// and are scraped directly via /api/cron/news-scraper
const NEWS_SOURCES = [
    {
        name: 'PokerNews',
        source_name: 'PokerNews',
        url: 'https://www.pokernews.com/rss.php',  // Fixed URL - was /rss.xml (404)
        category: 'tournament'
    },
    {
        name: 'CardPlayer',
        source_name: 'CardPlayer',
        url: 'https://www.cardplayer.com/poker-news.rss',  // Fixed URL - was /poker-news/rss (403)
        category: 'news'
    }
];

// Generate unique slug from title
function generateSlug(title) {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .substring(0, 80);
}

// Estimate read time from content
function estimateReadTime(content) {
    const wordsPerMinute = 200;
    const words = content?.split(/\s+/).length || 0;
    return Math.max(1, Math.ceil(words / wordsPerMinute));
}

// Extract image URL from RSS item using multiple methods
function extractImageFromRSS(item, description) {
    // Method 1: media:content or media:thumbnail
    const mediaMatch = item.match(/<media:(?:content|thumbnail)[^>]*url="([^"]+)"/);
    if (mediaMatch) return mediaMatch[1];

    // Method 2: enclosure tag
    const enclosureMatch = item.match(/<enclosure[^>]*url="([^"]+)"[^>]*type="image/);
    if (enclosureMatch) return enclosureMatch[1];

    // Method 3: image tag inside item
    const imageTagMatch = item.match(/<image>[\s\S]*?<url>([^<]+)<\/url>/);
    if (imageTagMatch) return imageTagMatch[1];

    // Method 4: img src in description/content
    const imgMatch = description?.match(/<img[^>]+src=["']([^"']+)["']/);
    if (imgMatch) return imgMatch[1];

    // Method 5: content:encoded with image
    const contentEncoded = item.match(/<content:encoded>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/content:encoded>/);
    if (contentEncoded) {
        const imgInContent = contentEncoded[1].match(/<img[^>]+src=["']([^"']+)["']/);
        if (imgInContent) return imgInContent[1];
    }

    return null;
}

// Contextual fallback images based on article keywords (using reliable Pexels poker images)
// This prevents all articles from showing the same generic fallback
const KEYWORD_IMAGES = {
    // Tournament & competition keywords
    tournament: 'https://images.pexels.com/photos/6664248/pexels-photo-6664248.jpeg?auto=compress&cs=tinysrgb&w=800',
    wsop: 'https://images.pexels.com/photos/3279691/pexels-photo-3279691.jpeg?auto=compress&cs=tinysrgb&w=800',
    wpt: 'https://images.pexels.com/photos/6664248/pexels-photo-6664248.jpeg?auto=compress&cs=tinysrgb&w=800',
    series: 'https://images.pexels.com/photos/3279691/pexels-photo-3279691.jpeg?auto=compress&cs=tinysrgb&w=800',
    main: 'https://images.pexels.com/photos/6664248/pexels-photo-6664248.jpeg?auto=compress&cs=tinysrgb&w=800',
    event: 'https://images.pexels.com/photos/3279691/pexels-photo-3279691.jpeg?auto=compress&cs=tinysrgb&w=800',
    bracelet: 'https://images.pexels.com/photos/6664248/pexels-photo-6664248.jpeg?auto=compress&cs=tinysrgb&w=800',
    champion: 'https://images.pexels.com/photos/3279691/pexels-photo-3279691.jpeg?auto=compress&cs=tinysrgb&w=800',
    winner: 'https://images.pexels.com/photos/6664248/pexels-photo-6664248.jpeg?auto=compress&cs=tinysrgb&w=800',
    wins: 'https://images.pexels.com/photos/6664248/pexels-photo-6664248.jpeg?auto=compress&cs=tinysrgb&w=800',
    // Money keywords
    million: 'https://images.pexels.com/photos/4386366/pexels-photo-4386366.jpeg?auto=compress&cs=tinysrgb&w=800',
    pot: 'https://images.pexels.com/photos/4386366/pexels-photo-4386366.jpeg?auto=compress&cs=tinysrgb&w=800',
    cash: 'https://images.pexels.com/photos/4386366/pexels-photo-4386366.jpeg?auto=compress&cs=tinysrgb&w=800',
    // Online poker keywords
    online: 'https://images.pexels.com/photos/4254890/pexels-photo-4254890.jpeg?auto=compress&cs=tinysrgb&w=800',
    ggpoker: 'https://images.pexels.com/photos/4254890/pexels-photo-4254890.jpeg?auto=compress&cs=tinysrgb&w=800',
    pokerstars: 'https://images.pexels.com/photos/4254890/pexels-photo-4254890.jpeg?auto=compress&cs=tinysrgb&w=800',
    partypoker: 'https://images.pexels.com/photos/4254890/pexels-photo-4254890.jpeg?auto=compress&cs=tinysrgb&w=800',
    '888poker': 'https://images.pexels.com/photos/4254890/pexels-photo-4254890.jpeg?auto=compress&cs=tinysrgb&w=800',
    // Strategy keywords
    strategy: 'https://images.pexels.com/photos/279009/pexels-photo-279009.jpeg?auto=compress&cs=tinysrgb&w=800',
    tip: 'https://images.pexels.com/photos/279009/pexels-photo-279009.jpeg?auto=compress&cs=tinysrgb&w=800',
    defend: 'https://images.pexels.com/photos/279009/pexels-photo-279009.jpeg?auto=compress&cs=tinysrgb&w=800',
    bluff: 'https://images.pexels.com/photos/279009/pexels-photo-279009.jpeg?auto=compress&cs=tinysrgb&w=800',
    fold: 'https://images.pexels.com/photos/279009/pexels-photo-279009.jpeg?auto=compress&cs=tinysrgb&w=800',
    // Player-focused keywords
    player: 'https://images.pexels.com/photos/1871508/pexels-photo-1871508.jpeg?auto=compress&cs=tinysrgb&w=800',
    pro: 'https://images.pexels.com/photos/1871508/pexels-photo-1871508.jpeg?auto=compress&cs=tinysrgb&w=800'
};

// Rotate through these for variety when no keyword matches
const POKER_IMAGE_ROTATION = [
    'https://images.pexels.com/photos/1871508/pexels-photo-1871508.jpeg?auto=compress&cs=tinysrgb&w=800',
    'https://images.pexels.com/photos/279009/pexels-photo-279009.jpeg?auto=compress&cs=tinysrgb&w=800',
    'https://images.pexels.com/photos/6664248/pexels-photo-6664248.jpeg?auto=compress&cs=tinysrgb&w=800',
    'https://images.pexels.com/photos/4254890/pexels-photo-4254890.jpeg?auto=compress&cs=tinysrgb&w=800',
    'https://images.pexels.com/photos/4386366/pexels-photo-4386366.jpeg?auto=compress&cs=tinysrgb&w=800',
    'https://images.pexels.com/photos/4386331/pexels-photo-4386331.jpeg?auto=compress&cs=tinysrgb&w=800'
];
let rotationIndex = 0;

// Get contextual image based on article title
function getContextualFallbackImage(title) {
    const lowerTitle = title.toLowerCase();

    // Check for keyword matches
    for (const [keyword, imageUrl] of Object.entries(KEYWORD_IMAGES)) {
        if (lowerTitle.includes(keyword)) {
            return imageUrl;
        }
    }

    // Rotate through poker images for variety
    const image = POKER_IMAGE_ROTATION[rotationIndex % POKER_IMAGE_ROTATION.length];
    rotationIndex++;
    return image;
}

// Category-specific fallback images (used as last resort)
const CATEGORY_IMAGES = {
    tournament: 'https://images.pexels.com/photos/1871508/pexels-photo-1871508.jpeg?auto=compress&cs=tinysrgb&w=800',
    strategy: 'https://images.pexels.com/photos/279009/pexels-photo-279009.jpeg?auto=compress&cs=tinysrgb&w=800',
    industry: 'https://images.pexels.com/photos/3279691/pexels-photo-3279691.jpeg?auto=compress&cs=tinysrgb&w=800',
    news: 'https://images.pexels.com/photos/6664248/pexels-photo-6664248.jpeg?auto=compress&cs=tinysrgb&w=800',
    online: 'https://images.pexels.com/photos/4254890/pexels-photo-4254890.jpeg?auto=compress&cs=tinysrgb&w=800'
};

// Parse RSS XML to articles
async function parseRSS(url, category, sourceName) {
    try {
        const response = await fetch(url, {
            headers: { 'User-Agent': 'Smarter.Poker News Bot/1.0' },
            timeout: 10000
        });

        if (!response.ok) {
            return [];
        }

        const xml = await response.text();
        const articles = [];

        // Simple RSS parsing (item tags)
        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
        const titleRegex = /<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/;
        const linkRegex = /<link>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/link>/;
        const descRegex = /<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/;
        const pubDateRegex = /<pubDate>(.*?)<\/pubDate>/;

        let match;
        while ((match = itemRegex.exec(xml)) !== null) {
            const item = match[1];

            const titleMatch = item.match(titleRegex);
            const linkMatch = item.match(linkRegex);
            const descMatch = item.match(descRegex);
            const dateMatch = item.match(pubDateRegex);

            if (titleMatch && titleMatch[1]) {
                const title = titleMatch[1].trim();
                const rawDesc = descMatch ? descMatch[1] : '';
                const content = rawDesc.replace(/<[^>]+>/g, '').trim();

                // Get image using multiple extraction methods
                const extractedImage = extractImageFromRSS(item, rawDesc);

                articles.push({
                    title,
                    slug: generateSlug(title),
                    content: content.substring(0, 2000),
                    excerpt: content.substring(0, 200),
                    source_url: linkMatch ? linkMatch[1].trim() : null,
                    image_url: extractedImage || getContextualFallbackImage(title),
                    category,
                    source_name: sourceName || 'Smarter.Poker',
                    read_time: estimateReadTime(content),
                    author_name: 'Smarter.Poker',
                    is_featured: false,
                    is_published: true,
                    published_at: dateMatch ? new Date(dateMatch[1]).toISOString() : new Date().toISOString()
                });
            }
        }

        return articles.slice(0, 5); // Limit per source
    } catch (error) {
        console.error(`Failed to parse RSS from ${url}:`, error.message);
        return [];
    }
}



export default async function handler(req, res) {
    // Verify cron secret for Vercel Cron jobs
    const authHeader = req.headers.authorization;
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        // Allow manual triggers in development
        if (process.env.NODE_ENV === 'production' && req.method !== 'POST') {
            return res.status(401).json({ error: 'Unauthorized' });
        }
    }

    try {

        let allArticles = [];

        // Try to fetch from RSS sources
        for (const source of NEWS_SOURCES) {
            const articles = await parseRSS(source.url, source.category, source.source_name);
            allArticles = [...allArticles, ...articles];
        }

        // If no articles found from RSS, just log and return - no fake data
        if (allArticles.length === 0) {
            return res.status(200).json({
                success: true,
                message: 'No new articles found',
                scraped: 0,
                inserted: 0,
                timestamp: new Date().toISOString()
            });
        }

        // Filter out duplicates by checking existing slugs
        const { data: existingSlugs } = await supabase
            .from('poker_news')
            .select('slug')
            .in('slug', allArticles.map(a => a.slug));

        const existingSet = new Set(existingSlugs?.map(e => e.slug) || []);
        const newArticles = allArticles.filter(a => !existingSet.has(a.slug));

        // Insert new articles
        let insertedCount = 0;
        if (newArticles.length > 0) {
            const { data, error } = await supabase
                .from('poker_news')
                .insert(newArticles)
                .select();

            if (error) {
                console.error('[News Scraper] Insert error:', error);
            } else {
                insertedCount = data?.length || 0;
            }
        }


        return res.status(200).json({
            success: true,
            message: `Scraper complete`,
            scraped: allArticles.length,
            inserted: insertedCount,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('[News Scraper] Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}

// Vercel Cron config - runs every hour
export const config = {
    maxDuration: 30
};
