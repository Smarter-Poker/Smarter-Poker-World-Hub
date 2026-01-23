/**
 * 📰 SMARTER.POKER NEWS SCRAPER - Enhanced 2-Hour Automated System
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Features:
 * - Scrapes from multiple RSS sources
 * - Google News search for "Poker News Today"
 * - YouTube video scraping for latest poker content
 * - Deduplication to prevent repeating stories
 * - Auto-posts to News page AND Social Feed
 * - Posts via official Smarter.Poker account
 *
 * SCHEDULE: Runs every 2 hours via Vercel cron
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import Parser from 'rss-parser';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const rssParser = new Parser({
    customFields: {
        item: ['media:content', 'media:thumbnail', 'content:encoded', 'enclosure']
    }
});

// Official Smarter.Poker System Account UUID
const SYSTEM_UUID = '00000000-0000-0000-0000-000000000001';

// ═══════════════════════════════════════════════════════════════════════════
// SYSTEM ACCOUNT AUTO-CREATION
// ═══════════════════════════════════════════════════════════════════════════
async function ensureSystemAccountExists() {
    try {
        // Check if system account exists
        const { data: existing, error: checkError } = await supabase
            .from('profiles')
            .select('id, username')
            .eq('id', SYSTEM_UUID)
            .single();

        if (existing) {
            console.log('✅ System account exists:', existing.username);
            return true;
        }

        // Create system account if it doesn't exist
        console.log('📝 Creating Smarter.Poker system account...');
        const { data: created, error: createError } = await supabase
            .from('profiles')
            .insert({
                id: SYSTEM_UUID,
                username: 'smarter.poker',
                full_name: 'Smarter.Poker',
                avatar_url: '/images/smarter-poker-logo.png',
                bio: 'Official Smarter.Poker News & Updates'
            })
            .select()
            .single();

        if (createError) {
            console.error('❌ Failed to create system account:', createError.message);
            return false;
        }

        console.log('✅ System account created successfully:', created.username);
        return true;
    } catch (err) {
        console.error('❌ Error ensuring system account:', err.message);
        return false;
    }
}

const CONFIG = {
    DEDUP_HOURS: 48, // Don't post same story within 48 hours
    MAX_ARTICLES_PER_RUN: 5, // Max new articles per 2-hour cycle
    MAX_VIDEOS_PER_RUN: 3, // Max new videos per 2-hour cycle
    MAX_SUMMARY_LENGTH: 300,
    TITLE_SIMILARITY_THRESHOLD: 0.7 // Fuzzy matching threshold
};

// Default category images - EVERY article MUST have an image
const DEFAULT_CATEGORY_IMAGES = {
    tournament: 'https://images.unsplash.com/photo-1609743522653-52354461eb27?w=600&q=80', // Poker chips/tournament
    strategy: 'https://images.unsplash.com/photo-1529074963764-98f45c47344b?w=600&q=80', // Cards strategy
    industry: 'https://images.unsplash.com/photo-1596838132731-3301c3fd4317?w=600&q=80', // Casino floor
    news: 'https://images.unsplash.com/photo-1511193311914-0346f16efe90?w=600&q=80', // Poker table
    online: 'https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?w=600&q=80' // Computer/online gaming
};

// ═══════════════════════════════════════════════════════════════════════════
// NEWS SOURCES - RSS Feeds
// ═══════════════════════════════════════════════════════════════════════════
const NEWS_SOURCES = [
    {
        name: 'PokerNews',
        rss: 'https://www.pokernews.com/news.rss',
        icon: '🃏',
        priority: 1,
        category: 'news'
    },
    {
        name: 'CardPlayer',
        rss: 'https://www.cardplayer.com/poker-news/rss',
        icon: '♠️',
        priority: 2,
        category: 'news'
    },
    {
        name: 'PokerListings',
        rss: 'https://www.pokerlistings.com/feed',
        icon: '🎰',
        priority: 3,
        category: 'news'
    },
    {
        name: 'Poker.org',
        rss: 'https://www.poker.org/feed/',
        icon: '♦️',
        priority: 4,
        category: 'news'
    },
    {
        name: 'Upswing Poker',
        rss: 'https://upswingpoker.com/feed/',
        icon: '📈',
        priority: 5,
        category: 'strategy'
    },
    {
        name: 'PocketFives',
        rss: 'https://www.pocketfives.com/feed/',
        icon: '🎯',
        priority: 6,
        category: 'online'
    }
];

// Google News disabled - doesn't provide images in RSS and redirect extraction is unreliable
const GOOGLE_NEWS_SOURCES = [];

// YouTube RSS for poker channels
const VIDEO_SOURCES = [
    {
        name: 'PokerGO',
        rss: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCrpQ3EYR2y3PXbmrNdLhPxA',
        channel: 'PokerGO'
    },
    {
        name: 'Jonathan Little',
        rss: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCIDBMjKOIEoOnyX8XVOUHZA',
        channel: 'Jonathan Little - Poker Coaching'
    },
    {
        name: 'Doug Polk Poker',
        rss: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCq_zG1PCJAW18IzBz7Y2w0A',
        channel: 'Doug Polk Poker'
    },
    {
        name: 'Daniel Negreanu',
        rss: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC2JZWJS0j8b4GK8DxnXefpg',
        channel: 'Daniel Negreanu'
    },
    {
        name: 'Upswing Poker',
        rss: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCqKR2vWBjcLZNf9QV_8lbHg',
        channel: 'Upswing Poker'
    },
    {
        name: 'Poker Bunny',
        rss: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCsWMXoDfVAyxfYkdKJvn0Gg',
        channel: 'Poker Bunny'
    }
];

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate similarity between two strings (for deduplication)
 */
function stringSimilarity(str1, str2) {
    const s1 = str1.toLowerCase().replace(/[^a-z0-9]/g, '');
    const s2 = str2.toLowerCase().replace(/[^a-z0-9]/g, '');

    if (s1 === s2) return 1;
    if (s1.length < 2 || s2.length < 2) return 0;

    const bigrams = new Map();
    for (let i = 0; i < s1.length - 1; i++) {
        const bigram = s1.substring(i, i + 2);
        bigrams.set(bigram, (bigrams.get(bigram) || 0) + 1);
    }

    let intersectionSize = 0;
    for (let i = 0; i < s2.length - 1; i++) {
        const bigram = s2.substring(i, i + 2);
        const count = bigrams.get(bigram) || 0;
        if (count > 0) {
            bigrams.set(bigram, count - 1);
            intersectionSize++;
        }
    }

    return (2.0 * intersectionSize) / (s1.length + s2.length - 2);
}

/**
 * Clean HTML and extract plain text
 */
function cleanHtml(text) {
    if (!text) return '';
    return text
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Extract image from RSS item
 */
function extractImage(item) {
    // Try enclosure
    if (item.enclosure?.url) return item.enclosure.url;

    // Try media:content (can be array or object)
    if (item['media:content']) {
        const media = Array.isArray(item['media:content']) ? item['media:content'][0] : item['media:content'];
        if (media?.$?.url) return media.$.url;
        if (media?.url) return media.url;
    }

    // Try media:thumbnail (can be array or object)
    if (item['media:thumbnail']) {
        const thumb = Array.isArray(item['media:thumbnail']) ? item['media:thumbnail'][0] : item['media:thumbnail'];
        if (thumb?.$?.url) return thumb.$.url;
        if (thumb?.url) return thumb.url;
    }

    // Try media:group > media:content
    if (item['media:group']?.['media:content']) {
        const media = Array.isArray(item['media:group']['media:content'])
            ? item['media:group']['media:content'][0]
            : item['media:group']['media:content'];
        if (media?.$?.url) return media.$.url;
        if (media?.url) return media.url;
    }

    // Try content:encoded for embedded images
    if (item['content:encoded']) {
        const imgMatch = item['content:encoded'].match(/<img[^>]+src=["']([^"']+)["']/i);
        if (imgMatch) return imgMatch[1];
    }

    // Try description for embedded images
    if (item.description) {
        const imgMatch = item.description.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (imgMatch) return imgMatch[1];
    }

    // Try content for embedded images
    if (item.content) {
        const imgMatch = item.content.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (imgMatch) return imgMatch[1];
    }

    return null;
}

/**
 * Extract the REAL destination URL from a Google News redirect page
 */
async function extractRealUrlFromGoogleNews(googleUrl) {
    if (!googleUrl || !googleUrl.includes('news.google.com')) {
        return googleUrl; // Not a Google News URL, return as-is
    }

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(googleUrl, {
            signal: controller.signal,
            redirect: 'manual', // Don't auto-follow, we want to inspect
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html'
            }
        });

        clearTimeout(timeout);

        // Check for HTTP redirect
        if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get('location');
            if (location && !location.includes('google.com')) {
                return location;
            }
        }

        const html = await response.text();

        // Try to find the real URL in various places:

        // 1. Meta refresh redirect
        let match = html.match(/<meta[^>]+http-equiv=["']refresh["'][^>]+content=["'][^"']*url=([^"'>\s]+)/i);
        if (match && match[1] && !match[1].includes('google.com')) {
            return decodeURIComponent(match[1]);
        }

        // 2. JavaScript redirect patterns
        match = html.match(/window\.location\s*=\s*["']([^"']+)["']/i);
        if (match && match[1] && !match[1].includes('google.com')) {
            return match[1];
        }

        // 3. data-url attribute (Google sometimes uses this)
        match = html.match(/data-url=["']([^"']+)["']/i);
        if (match && match[1] && !match[1].includes('google.com')) {
            return decodeURIComponent(match[1]);
        }

        // 4. href in article link
        match = html.match(/<a[^>]+href=["'](https?:\/\/(?!news\.google\.com)[^"']+)["'][^>]*>/i);
        if (match && match[1]) {
            return match[1];
        }

        // 5. Look for jslog with URL
        match = html.match(/jslog="[^"]*url:([^;,"]+)/i);
        if (match && match[1] && match[1].startsWith('http')) {
            return decodeURIComponent(match[1]);
        }

        return null; // Couldn't extract real URL
    } catch (error) {
        return null;
    }
}

/**
 * Fetch og:image from the ACTUAL article page (not Google's redirect)
 */
async function fetchOgImage(url) {
    if (!url) return null;

    try {
        // If it's a Google News URL, first get the REAL article URL
        let actualUrl = url;
        if (url.includes('news.google.com')) {
            const realUrl = await extractRealUrlFromGoogleNews(url);
            if (realUrl) {
                actualUrl = realUrl;
                console.log(`   → Resolved Google News to: ${actualUrl.substring(0, 60)}...`);
            } else {
                console.log(`   → Could not resolve Google News URL`);
                return null;
            }
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const response = await fetch(actualUrl, {
            signal: controller.signal,
            redirect: 'follow',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'en-US,en;q=0.5'
            }
        });

        clearTimeout(timeout);

        if (!response.ok) return null;

        const html = await response.text();

        // Extract og:image from the REAL article page
        let match = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
        if (!match) {
            match = html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
        }

        // Try twitter:image
        if (!match) {
            match = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
            if (!match) {
                match = html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
            }
        }

        if (match && match[1]) {
            let imageUrl = match[1].replace(/&amp;/g, '&');

            // Skip any Google CDN images
            if (imageUrl.includes('googleusercontent.com') ||
                imageUrl.includes('gstatic.com') ||
                imageUrl.includes('google.com')) {
                return null;
            }

            // Skip logos/icons
            if (imageUrl.includes('logo') || imageUrl.includes('icon') || imageUrl.includes('favicon')) {
                return null;
            }

            if (imageUrl.startsWith('http')) {
                return imageUrl;
            }
        }

        return null;
    } catch (error) {
        return null;
    }
}

/**
 * Get image for article - tries RSS, then og:image, then defaults
 */
async function getArticleImage(item, category) {
    // First try RSS extraction
    const extractedImage = extractImage(item);
    if (extractedImage) return extractedImage;

    // Then try fetching og:image from the article URL
    const ogImage = await fetchOgImage(item.link);
    if (ogImage) return ogImage;

    // Return category-specific default image
    return DEFAULT_CATEGORY_IMAGES[category] || DEFAULT_CATEGORY_IMAGES.news;
}

/**
 * Categorize article based on title/content
 */
function categorizeArticle(title, content = '') {
    const text = `${title} ${content}`.toLowerCase();

    if (text.match(/wsop|wpt|ept|tournament|final table|bracelet|main event/)) {
        return 'tournament';
    }
    if (text.match(/strategy|gto|tips|how to|learn|training|coach/)) {
        return 'strategy';
    }
    if (text.match(/casino|poker room|legislation|law|online poker|regulation/)) {
        return 'industry';
    }
    return 'news';
}

/**
 * Generate URL-safe slug from title
 */
function generateSlug(title) {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 100);
}

// ═══════════════════════════════════════════════════════════════════════════
// DEDUPLICATION CHECK
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if article is duplicate (by URL or similar title)
 */
async function isDuplicate(article, existingArticles) {
    // Check URL match
    for (const existing of existingArticles) {
        if (existing.source_url === article.link) {
            return { isDupe: true, reason: 'exact_url' };
        }

        // Check title similarity
        const similarity = stringSimilarity(existing.title, article.title);
        if (similarity >= CONFIG.TITLE_SIMILARITY_THRESHOLD) {
            return { isDupe: true, reason: 'similar_title', similarity };
        }
    }

    return { isDupe: false };
}

/**
 * Get recently posted articles from database for dedup check
 */
async function getRecentArticles() {
    const cutoff = new Date(Date.now() - CONFIG.DEDUP_HOURS * 60 * 60 * 1000);

    const { data, error } = await supabase
        .from('poker_news')
        .select('id, title, source_url, published_at')
        .gte('created_at', cutoff.toISOString())
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching recent articles:', error.message);
        return [];
    }

    return data || [];
}

/**
 * Get recently posted videos for dedup check
 */
async function getRecentVideos() {
    const cutoff = new Date(Date.now() - CONFIG.DEDUP_HOURS * 60 * 60 * 1000);

    const { data, error } = await supabase
        .from('poker_videos')
        .select('id, title, youtube_id, created_at')
        .gte('created_at', cutoff.toISOString())
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching recent videos:', error.message);
        return [];
    }

    return data || [];
}

// ═══════════════════════════════════════════════════════════════════════════
// NEWS FETCHING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch articles from RSS sources
 */
async function fetchNewsFromRSS() {
    const allArticles = [];
    const allSources = [...NEWS_SOURCES, ...GOOGLE_NEWS_SOURCES];

    for (const source of allSources) {
        try {
            console.log(`📰 Fetching: ${source.name}...`);
            const feed = await rssParser.parseURL(source.rss);

            // Process items and fetch images (with concurrency limit)
            const items = (feed.items || []).slice(0, 10);
            const articles = [];

            for (const item of items) {
                const summary = cleanHtml(item.contentSnippet || item.content || item.description || '');
                const category = source.category || categorizeArticle(item.title, summary);

                // Fetch image - tries RSS first, then og:image, then default
                const imageUrl = await getArticleImage(item, category);

                articles.push({
                    title: cleanHtml(item.title || ''),
                    link: item.link,
                    pubDate: new Date(item.pubDate || item.isoDate || Date.now()),
                    source: source.name,
                    icon: source.icon,
                    priority: source.priority,
                    summary: summary.slice(0, CONFIG.MAX_SUMMARY_LENGTH),
                    category: category,
                    imageUrl: imageUrl, // Real image from article
                    slug: generateSlug(item.title || '')
                });
            }

            allArticles.push(...articles);
            console.log(`   ✓ Found ${articles.length} articles`);
        } catch (error) {
            console.error(`   ✗ Error: ${error.message}`);
        }
    }

    // Sort by date (newest first), then by priority
    return allArticles.sort((a, b) => {
        const dateDiff = b.pubDate - a.pubDate;
        if (Math.abs(dateDiff) < 3600000) { // Within 1 hour, use priority
            return a.priority - b.priority;
        }
        return dateDiff;
    });
}

/**
 * Fetch videos from YouTube RSS
 */
async function fetchVideosFromYouTube() {
    const allVideos = [];

    for (const source of VIDEO_SOURCES) {
        try {
            console.log(`🎬 Fetching: ${source.name}...`);
            const feed = await rssParser.parseURL(source.rss);

            const videos = (feed.items || []).slice(0, 5).map(item => {
                // Extract video ID from YouTube URL
                const videoId = item.id?.replace('yt:video:', '') ||
                    item.link?.match(/v=([^&]+)/)?.[1] ||
                    item.link?.split('/').pop();

                return {
                    title: cleanHtml(item.title || ''),
                    youtube_id: videoId,
                    link: item.link,
                    pubDate: new Date(item.pubDate || item.isoDate || Date.now()),
                    channel: source.channel,
                    thumbnail_url: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
                    description: cleanHtml(item.contentSnippet || item.content || '').slice(0, 200)
                };
            });

            allVideos.push(...videos);
            console.log(`   ✓ Found ${videos.length} videos`);
        } catch (error) {
            console.error(`   ✗ Error: ${error.message}`);
        }
    }

    // Sort by date (newest first)
    return allVideos.sort((a, b) => b.pubDate - a.pubDate);
}

// ═══════════════════════════════════════════════════════════════════════════
// DATABASE OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Save article to poker_news table
 * REQUIRES image_url - will use category default if not provided
 */
async function saveArticle(article) {
    // Generate slug from title
    const slug = article.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .slice(0, 100);

    // Ensure image is ALWAYS present
    const imageUrl = article.imageUrl || DEFAULT_CATEGORY_IMAGES[article.category] || DEFAULT_CATEGORY_IMAGES.news;

    const { data, error } = await supabase
        .from('poker_news')
        .insert({
            title: article.title,
            slug: `${slug}-${Date.now()}`,
            content: article.summary || '',
            excerpt: article.summary ? article.summary.slice(0, 150) : '',
            image_url: imageUrl, // ALWAYS has an image
            category: article.category,
            source_url: article.link,
            source_name: article.source || 'Smarter.Poker',
            is_published: true,
            is_featured: false,
            views: 0,
            published_at: article.pubDate
        })
        .select()
        .single();

    if (error) {
        console.error(`   ✗ Article DB Error: ${error.message} | Code: ${error.code}`);
        return { error: error.message, code: error.code };
    }

    return data;
}

/**
 * Save video to poker_videos table
 */
async function saveVideo(video) {
    const { data, error } = await supabase
        .from('poker_videos')
        .insert({
            title: video.title,
            youtube_id: video.youtube_id,
            thumbnail_url: video.thumbnail_url,
            description: `${video.description} | Channel: ${video.channel}`,
            published_at: video.pubDate,
            is_published: true,
            views: 0,
            duration: '00:00'
        })
        .select()
        .single();

    if (error) {
        console.error(`   ✗ DB Error: ${error.message}`);
        return null;
    }

    return data;
}

// ═══════════════════════════════════════════════════════════════════════════
// SOCIAL FEED POSTING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Post article to Social Feed as Smarter.Poker account
 * Includes the source URL so link previews auto-populate
 */
async function postToSocialFeed(article, newsId) {
    const categoryEmojis = {
        tournament: '🏆',
        strategy: '📚',
        industry: '💼',
        news: '📰',
        online: '💻'
    };

    const emoji = categoryEmojis[article.category] || '📰';

    // Include the actual source URL for link preview auto-population
    const postContent = `${emoji} **${article.title}**

${article.summary}

🔗 ${article.link}`;

    try {
        // Prepare media URLs
        const mediaUrls = article.imageUrl ? [article.imageUrl] : [];

        // Try RPC function first
        const { data: post, error: rpcError } = await supabase
            .rpc('fn_create_social_post', {
                p_author_id: SYSTEM_UUID,
                p_content: postContent,
                p_content_type: 'news',
                p_media_urls: mediaUrls,
                p_visibility: 'public',
                p_achievement_data: {
                    article_url: article.link,
                    article_source: article.source,
                    article_title: article.title,
                    news_id: newsId
                }
            });

        if (rpcError) {
            // Fallback to direct insert
            const { data: directPost, error: directError } = await supabase
                .from('social_posts')
                .insert({
                    author_id: SYSTEM_UUID,
                    content: postContent,
                    content_type: 'news',
                    media_urls: mediaUrls,
                    visibility: 'public',
                    achievement_data: {
                        article_url: article.link,
                        article_source: article.source,
                        article_title: article.title,
                        news_id: newsId
                    },
                    created_at: new Date().toISOString()
                })
                .select()
                .single();

            if (directError) throw directError;

            // Link social post to news record
            await supabase
                .from('poker_news')
                .update({ social_post_id: directPost.id })
                .eq('id', newsId);

            return directPost;
        }

        // Link social post to news record
        if (post?.id) {
            await supabase
                .from('poker_news')
                .update({ social_post_id: post.id })
                .eq('id', newsId);
        }

        return post;
    } catch (error) {
        console.error(`   ✗ Social post error: ${error.message}`);
        return null;
    }
}

/**
 * Post video to Social Feed as Smarter.Poker account
 */
async function postVideoToSocialFeed(video, videoId) {
    const postContent = `🎬 **New Poker Video**

${video.title}

📺 Watch on YouTube: ${video.link}

#poker #pokervideo #${video.channel.replace(/\s+/g, '')}`;

    try {
        const mediaUrls = [video.thumbnail_url];

        const { data: post, error } = await supabase
            .from('social_posts')
            .insert({
                author_id: SYSTEM_UUID,
                content: postContent,
                content_type: 'video',
                media_urls: mediaUrls,
                visibility: 'public',
                achievement_data: {
                    video_url: video.link,
                    youtube_id: video.youtube_id,
                    channel: video.channel,
                    video_id: videoId
                },
                created_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) throw error;

        // Link social post to video record
        if (post?.id) {
            await supabase
                .from('poker_videos')
                .update({ social_post_id: post.id })
                .eq('id', videoId);
        }

        return post;
    } catch (error) {
        console.error(`   ✗ Video social post error: ${error.message}`);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════

export default async function handler(req, res) {
    console.log('\n');
    console.log('═'.repeat(70));
    console.log('📰 SMARTER.POKER NEWS SCRAPER - 2-Hour Automated Update');
    console.log('═'.repeat(70));
    console.log(`⏰ Started at: ${new Date().toISOString()}`);
    console.log('');

    if (!SUPABASE_URL) {
        return res.status(500).json({ error: 'Missing Supabase URL' });
    }

    const results = {
        articles: { fetched: 0, saved: 0, posted: 0, skipped: 0 },
        videos: { fetched: 0, saved: 0, posted: 0, skipped: 0 },
        errors: [],
        systemAccount: false
    };

    try {
        // ─────────────────────────────────────────────────────────────────────
        // PHASE 0: Ensure System Account Exists
        // ─────────────────────────────────────────────────────────────────────
        console.log('🔐 Phase 0: Verifying Smarter.Poker system account...');
        results.systemAccount = await ensureSystemAccountExists();
        if (!results.systemAccount) {
            console.log('⚠️  Warning: System account not available - social posts will be skipped\n');
        } else {
            console.log('');
        }

        // ─────────────────────────────────────────────────────────────────────
        // PHASE 1: Fetch existing data for deduplication
        // ─────────────────────────────────────────────────────────────────────
        console.log('📋 Phase 1: Loading existing articles for deduplication...');
        const existingArticles = await getRecentArticles();
        const existingVideos = await getRecentVideos();
        console.log(`   Found ${existingArticles.length} recent articles, ${existingVideos.length} recent videos\n`);

        // ─────────────────────────────────────────────────────────────────────
        // PHASE 2: Fetch new articles from RSS
        // ─────────────────────────────────────────────────────────────────────
        console.log('📰 Phase 2: Fetching news from RSS feeds...');
        const fetchedArticles = await fetchNewsFromRSS();
        results.articles.fetched = fetchedArticles.length;
        console.log(`\n   Total: ${fetchedArticles.length} articles fetched\n`);

        // ─────────────────────────────────────────────────────────────────────
        // PHASE 3: Process articles (dedupe, save, post)
        // ─────────────────────────────────────────────────────────────────────
        console.log('💾 Phase 3: Processing and saving articles...');
        let savedCount = 0;

        for (const article of fetchedArticles) {
            if (savedCount >= CONFIG.MAX_ARTICLES_PER_RUN) {
                console.log(`   ⏸️  Max articles (${CONFIG.MAX_ARTICLES_PER_RUN}) reached for this run`);
                break;
            }

            // Check for duplicates
            const { isDupe, reason, similarity } = await isDuplicate(article, existingArticles);
            if (isDupe) {
                results.articles.skipped++;
                continue;
            }

            // Save to database
            const savedArticle = await saveArticle(article);
            if (!savedArticle || savedArticle.error) {
                const errMsg = savedArticle?.error || 'Unknown error';
                results.errors.push(`Failed to save "${article.title.substring(0, 30)}...": ${errMsg}`);
                continue;
            }

            results.articles.saved++;
            savedCount++;
            console.log(`   ✓ Saved: ${article.title.substring(0, 50)}...`);

            // Post to Social Feed
            const socialPost = await postToSocialFeed(article, savedArticle.id);
            if (socialPost) {
                results.articles.posted++;
                console.log(`   📱 Posted to Social Feed`);
            }

            // Add to existing articles for future dedup checks in this run
            existingArticles.push({
                id: savedArticle.id,
                title: article.title,
                source_url: article.link
            });
        }

        // ─────────────────────────────────────────────────────────────────────
        // PHASE 4: Fetch videos from YouTube
        // ─────────────────────────────────────────────────────────────────────
        console.log('\n🎬 Phase 4: Fetching videos from YouTube...');
        const fetchedVideos = await fetchVideosFromYouTube();
        results.videos.fetched = fetchedVideos.length;
        console.log(`\n   Total: ${fetchedVideos.length} videos fetched\n`);

        // ─────────────────────────────────────────────────────────────────────
        // PHASE 5: Process videos (dedupe, save, post)
        // ─────────────────────────────────────────────────────────────────────
        console.log('💾 Phase 5: Processing and saving videos...');
        let savedVideoCount = 0;

        for (const video of fetchedVideos) {
            if (savedVideoCount >= CONFIG.MAX_VIDEOS_PER_RUN) {
                console.log(`   ⏸️  Max videos (${CONFIG.MAX_VIDEOS_PER_RUN}) reached for this run`);
                break;
            }

            // Check for duplicate by youtube_id
            const isDupe = existingVideos.some(v => v.youtube_id === video.youtube_id);
            if (isDupe) {
                results.videos.skipped++;
                continue;
            }

            // Save to database
            const savedVideo = await saveVideo(video);
            if (!savedVideo) {
                results.errors.push(`Failed to save video: ${video.title}`);
                continue;
            }

            results.videos.saved++;
            savedVideoCount++;
            console.log(`   ✓ Saved: ${video.title.substring(0, 50)}...`);

            // Post to Social Feed (only every 3rd video to avoid spam)
            if (savedVideoCount % 3 === 1) {
                const socialPost = await postVideoToSocialFeed(video, savedVideo.id);
                if (socialPost) {
                    results.videos.posted++;
                    console.log(`   📱 Posted to Social Feed`);
                }
            }

            // Add to existing videos for future dedup checks
            existingVideos.push({
                id: savedVideo.id,
                youtube_id: video.youtube_id
            });
        }

        // ─────────────────────────────────────────────────────────────────────
        // SUMMARY
        // ─────────────────────────────────────────────────────────────────────
        console.log('\n');
        console.log('═'.repeat(70));
        console.log('📊 SCRAPER SUMMARY');
        console.log('═'.repeat(70));
        console.log(`📰 Articles: ${results.articles.saved} saved, ${results.articles.posted} posted to feed, ${results.articles.skipped} skipped (dupes)`);
        console.log(`🎬 Videos:   ${results.videos.saved} saved, ${results.videos.posted} posted to feed, ${results.videos.skipped} skipped (dupes)`);
        if (results.errors.length > 0) {
            console.log(`⚠️  Errors:   ${results.errors.length}`);
        }
        console.log(`⏰ Completed: ${new Date().toISOString()}`);
        console.log('═'.repeat(70));

        return res.status(200).json({
            success: true,
            timestamp: new Date().toISOString(),
            results,
            message: `Processed ${results.articles.saved} articles and ${results.videos.saved} videos`
        });

    } catch (error) {
        console.error('❌ Scraper error:', error);
        results.errors.push(error.message);

        return res.status(500).json({
            success: false,
            error: error.message,
            results
        });
    }
}
