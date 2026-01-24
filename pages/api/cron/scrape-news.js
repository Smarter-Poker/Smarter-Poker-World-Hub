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
const NEWS_SOURCES = [
    {
        name: 'PokerNews',
        source_name: 'PokerNews',
        url: 'https://www.pokernews.com/rss.xml',
        category: 'tournament'
    },
    {
        name: 'PokerOrg',
        source_name: 'Poker.org',
        url: 'https://www.poker.org/feed/',
        category: 'industry'
    },
    {
        name: 'CardPlayer',
        source_name: 'CardPlayer',
        url: 'https://www.cardplayer.com/poker-news/rss',
        category: 'news'
    },
    {
        name: 'Pokerfuse',
        source_name: 'Pokerfuse',
        url: 'https://pokerfuse.com/feed/',
        category: 'industry'
    },
    {
        name: 'WSOP',
        source_name: 'WSOP',
        url: 'https://www.wsop.com/news/rss/',
        category: 'tournament'
    },
    {
        name: 'MSPT',
        source_name: 'MSPT',
        url: 'https://msptpoker.com/feed/',
        category: 'tournament'
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

// Category-specific fallback images
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
            console.log(`[RSS] ${sourceName} returned ${response.status}`);
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
                    image_url: extractedImage || CATEGORY_IMAGES[category] || CATEGORY_IMAGES.news,
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

        console.log(`[RSS] ${sourceName}: found ${articles.length} articles`);
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
        console.log('[News Scraper] Starting hourly scrape...');

        let allArticles = [];

        // Try to fetch from RSS sources
        for (const source of NEWS_SOURCES) {
            const articles = await parseRSS(source.url, source.category, source.source_name);
            allArticles = [...allArticles, ...articles];
        }

        // If no articles found from RSS, just log and return - no fake data
        if (allArticles.length === 0) {
            console.log('[News Scraper] No articles found from RSS feeds');
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

        console.log(`[News Scraper] Complete. Inserted ${insertedCount} new articles.`);

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
