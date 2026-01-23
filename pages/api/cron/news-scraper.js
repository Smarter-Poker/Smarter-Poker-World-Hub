/**
 * 📰 SMARTER.POKER NEWS SCRAPER - 6 Box System
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * BOX 1: PokerNews.com (RSS)
 * BOX 2: MSPT.com (direct scrape)
 * BOX 3: CardPlayer.com (RSS)
 * BOX 4: WSOP.com (direct scrape)
 * BOX 5: Poker.org (RSS)
 * BOX 6: Pokerfuse.com (direct scrape)
 *
 * SCHEDULE: Runs every 2 hours via Vercel cron
 * RETENTION: 3 days before archive
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

const CONFIG = {
    MAX_ARTICLES_PER_SOURCE: 5,
    RETENTION_DAYS: 3,
    REQUEST_TIMEOUT: 10000
};

// ═══════════════════════════════════════════════════════════════════════════
// THE 6 NEWS SOURCES
// ═══════════════════════════════════════════════════════════════════════════
const NEWS_SOURCES = [
    {
        box: 1,
        name: 'PokerNews',
        type: 'hybrid',  // Try RSS first, then scrape
        url: 'https://www.pokernews.com/news.rss',
        scrapeUrl: 'https://www.pokernews.com/news/',
        baseUrl: 'https://www.pokernews.com',
        icon: '🃏',
        category: 'news'
    },
    {
        box: 2,
        name: 'MSPT',
        type: 'scrape',
        url: 'https://msptpoker.com/pages/Magazine.aspx',
        baseUrl: 'https://msptpoker.com/pages',
        icon: '🎰',
        category: 'tournament'
    },
    {
        box: 3,
        name: 'CardPlayer',
        type: 'scrape',
        url: 'https://www.cardplayer.com/poker-news',
        baseUrl: 'https://www.cardplayer.com',
        icon: '♠️',
        category: 'news'
    },
    {
        box: 4,
        name: 'WSOP',
        type: 'scrape',
        url: 'https://www.wsop.com/news/',
        baseUrl: 'https://www.wsop.com',
        icon: '🏆',
        category: 'tournament'
    },
    {
        box: 5,
        name: 'Poker.org',
        type: 'scrape',
        url: 'https://www.poker.org/',
        baseUrl: 'https://www.poker.org',
        icon: '♦️',
        category: 'news'
    },
    {
        box: 6,
        name: 'Pokerfuse',
        type: 'scrape',
        url: 'https://pokerfuse.com/',
        baseUrl: 'https://pokerfuse.com',
        icon: '🔥',
        category: 'industry'
    }
];

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

async function fetchPage(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);

    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5'
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

function extractArticleImage(html, baseUrl = '') {
    if (!html) return null;

    // Helper to extract image URL from various attributes
    function getImageFromTag(imgTag) {
        // Try srcset first (usually has high-res images)
        let match = imgTag.match(/srcset=["']([^"']+)["']/i);
        if (match) {
            // Get the largest image from srcset (last one or the one with largest w descriptor)
            const srcset = match[1].split(',').map(s => s.trim());
            const lastSrc = srcset[srcset.length - 1].split(' ')[0];
            if (lastSrc && !lastSrc.includes('data:')) return lastSrc;
        }

        // Try data-src (lazy loading)
        match = imgTag.match(/data-src=["']([^"']+)["']/i);
        if (match?.[1] && !match[1].includes('data:')) return match[1];

        // Try data-lazy-src
        match = imgTag.match(/data-lazy-src=["']([^"']+)["']/i);
        if (match?.[1] && !match[1].includes('data:')) return match[1];

        // Try data-original
        match = imgTag.match(/data-original=["']([^"']+)["']/i);
        if (match?.[1] && !match[1].includes('data:')) return match[1];

        // Try data-lazy
        match = imgTag.match(/data-lazy=["']([^"']+)["']/i);
        if (match?.[1] && !match[1].includes('data:')) return match[1];

        // Try regular src last
        match = imgTag.match(/src=["']([^"']+)["']/i);
        if (match?.[1] && !match[1].includes('data:')) return match[1];

        return null;
    }

    // 1. Try og:image meta tag (most reliable)
    let match = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    if (!match) match = html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (match?.[1]) return match[1].replace(/&amp;/g, '&');

    // 2. Try twitter:image meta tag
    match = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
    if (!match) match = html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
    if (match?.[1]) return match[1].replace(/&amp;/g, '&');

    // 3. Try JSON-LD structured data (all scripts, not just first)
    const jsonLdMatches = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    for (const jsonLdMatch of jsonLdMatches) {
        try {
            const jsonData = JSON.parse(jsonLdMatch[1]);
            // Handle both single objects and arrays
            const items = Array.isArray(jsonData) ? jsonData : [jsonData];
            for (const item of items) {
                if (item.image) {
                    if (typeof item.image === 'string') return item.image;
                    if (item.image.url) return item.image.url;
                    if (Array.isArray(item.image) && item.image[0]) {
                        return typeof item.image[0] === 'string' ? item.image[0] : item.image[0].url;
                    }
                }
                // Also check thumbnailUrl
                if (item.thumbnailUrl) return item.thumbnailUrl;
            }
        } catch (e) { /* ignore JSON parse errors */ }
    }

    // 4. Try featured image classes with lazy-loading support
    const featuredPatterns = [
        /<img[^>]+class=["'][^"']*(?:featured|hero|article-image|post-image|entry-image|main-image|wp-post-image|attachment-full|size-full|post-thumbnail)[^"']*["'][^>]*>/gi,
        /<figure[^>]*class=["'][^"']*(?:featured|hero|post-thumbnail|wp-block-image)[^"']*["'][^>]*>[\s\S]*?<img[^>]*>/gi
    ];
    for (const pattern of featuredPatterns) {
        const matches = html.matchAll(pattern);
        for (const imgMatch of matches) {
            const imgUrl = getImageFromTag(imgMatch[0]);
            if (imgUrl) return resolveUrl(imgUrl, baseUrl);
        }
    }

    // 5. Try first large image in article/main content area with lazy-loading support
    const contentAreas = [
        /<article[^>]*>([\s\S]*?)<\/article>/i,
        /<main[^>]*>([\s\S]*?)<\/main>/i,
        /<div[^>]+class=["'][^"']*(?:content|article|post|entry|story|news)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
        /<div[^>]+id=["'][^"']*(?:content|article|post|entry|story|main)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
    ];
    for (const areaPattern of contentAreas) {
        const contentMatch = html.match(areaPattern);
        if (contentMatch) {
            // Find all images in this area
            const imgMatches = contentMatch[1].matchAll(/<img[^>]+>/gi);
            for (const imgTag of imgMatches) {
                const imgUrl = getImageFromTag(imgTag[0]);
                if (imgUrl && !imgUrl.includes('icon') && !imgUrl.includes('logo') && !imgUrl.includes('avatar')) {
                    return resolveUrl(imgUrl, baseUrl);
                }
            }
        }
    }

    // 6. Try picture elements (often used for responsive images)
    const pictureMatch = html.match(/<picture[^>]*>[\s\S]*?<source[^>]+srcset=["']([^"']+)["']/i);
    if (pictureMatch?.[1]) {
        const srcset = pictureMatch[1].split(',')[0].split(' ')[0];
        if (srcset) return resolveUrl(srcset, baseUrl);
    }

    // 7. Fallback: first reasonable image on the page with lazy-loading support
    const allImages = html.matchAll(/<img[^>]+>/gi);
    for (const img of allImages) {
        const imgUrl = getImageFromTag(img[0]);
        if (!imgUrl) continue;

        // Skip small images, icons, logos, tracking pixels
        if (imgUrl.includes('icon') || imgUrl.includes('logo') || imgUrl.includes('avatar') ||
            imgUrl.includes('pixel') || imgUrl.includes('tracking') || imgUrl.includes('badge') ||
            imgUrl.includes('1x1') || imgUrl.includes('spacer') || imgUrl.includes('blank') ||
            imgUrl.includes('spinner') || imgUrl.includes('loading') ||
            imgUrl.endsWith('.gif') || imgUrl.includes('data:image') ||
            imgUrl.includes('gravatar') || imgUrl.includes('emoji')) continue;

        return resolveUrl(imgUrl, baseUrl);
    }

    return null;
}

// Helper to resolve relative URLs
function resolveUrl(url, baseUrl) {
    if (!url) return null;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (url.startsWith('//')) return 'https:' + url;
    if (url.startsWith('/') && baseUrl) {
        const base = new URL(baseUrl);
        return base.origin + url;
    }
    return url;
}

// Keep old function name for compatibility
function extractOgImage(html, baseUrl) {
    return extractArticleImage(html, baseUrl);
}

function extractRssImage(item) {
    // Try enclosure (most common for podcasts/media RSS)
    if (item.enclosure?.url) return item.enclosure.url;
    if (item.enclosure?.$?.url) return item.enclosure.$.url;

    // Try media:content (multiple formats)
    if (item['media:content']?.$?.url) return item['media:content'].$.url;
    if (item['media:content']?.url) return item['media:content'].url;
    if (Array.isArray(item['media:content'])) {
        for (const media of item['media:content']) {
            if (media?.$?.url) return media.$.url;
            if (media?.url) return media.url;
        }
    }

    // Try media:thumbnail (multiple formats)
    if (item['media:thumbnail']?.$?.url) return item['media:thumbnail'].$.url;
    if (item['media:thumbnail']?.url) return item['media:thumbnail'].url;
    if (Array.isArray(item['media:thumbnail'])) {
        for (const thumb of item['media:thumbnail']) {
            if (thumb?.$?.url) return thumb.$.url;
            if (thumb?.url) return thumb.url;
        }
    }

    // Try media:group > media:content
    if (item['media:group']?.['media:content']?.$?.url) {
        return item['media:group']['media:content'].$.url;
    }

    // Try itunes:image
    if (item['itunes:image']?.$?.href) return item['itunes:image'].$.href;

    // Try image tag directly
    if (item.image?.url) return item.image.url;
    if (item.image) return item.image;

    // Try content:encoded for img tags (with lazy-loading support)
    if (item['content:encoded']) {
        // Try data-src first (lazy loading)
        let imgMatch = item['content:encoded'].match(/<img[^>]+data-src=["']([^"']+)["']/i);
        if (imgMatch) return imgMatch[1];
        // Try regular src
        imgMatch = item['content:encoded'].match(/<img[^>]+src=["']([^"']+)["']/i);
        if (imgMatch && !imgMatch[1].includes('data:')) return imgMatch[1];
    }

    // Try description for img tags
    if (item.description) {
        let imgMatch = item.description.match(/<img[^>]+data-src=["']([^"']+)["']/i);
        if (imgMatch) return imgMatch[1];
        imgMatch = item.description.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (imgMatch && !imgMatch[1].includes('data:')) return imgMatch[1];
    }

    // Try summary
    if (item.summary) {
        const imgMatch = item.summary.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (imgMatch && !imgMatch[1].includes('data:')) return imgMatch[1];
    }

    return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// RSS SCRAPER
// ═══════════════════════════════════════════════════════════════════════════

async function scrapeRSS(source) {
    const articles = [];

    try {
        const feed = await rssParser.parseURL(source.url);

        for (const item of (feed.items || []).slice(0, CONFIG.MAX_ARTICLES_PER_SOURCE)) {
            const title = cleanText(item.title);
            if (!title || title.length < 10) continue;

            let image = extractRssImage(item);

            // If no image in RSS, fetch from article page
            if (!image && item.link) {
                const articleHtml = await fetchPage(item.link);
                image = extractArticleImage(articleHtml, item.link);
            }

            // Only save articles that have real images
            if (image && item.link) {
                articles.push({
                    url: item.link,
                    title,
                    image,
                    source
                });
            }
        }
    } catch (error) {
        console.log(`   RSS Error: ${error.message}`);
    }

    return articles;
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE SCRAPERS
// ═══════════════════════════════════════════════════════════════════════════

async function scrapeMSPT(html, source) {
    const articles = [];
    const seen = new Set();

    // MSPT uses ../Magazine/title~ID.aspx format
    const matches = html.matchAll(/href=["'](?:\.\.\/)?(?:\.\/)?([^"']*Magazine\/[^"']+\.aspx)["'][^>]*>([^<]+)/gi);

    for (const match of matches) {
        if (articles.length >= CONFIG.MAX_ARTICLES_PER_SOURCE) break;

        let url = match[1];
        const title = cleanText(match[2]);

        if (!title || title.length < 10 || seen.has(url)) continue;
        if (url.includes('javascript:') || url.includes('#')) continue;

        // Build full URL - MSPT uses relative paths from /pages/
        if (!url.startsWith('http')) {
            url = url.replace(/^\.\.\//, '').replace(/^\.\//, '');
            url = source.baseUrl + '/' + url;
        }

        seen.add(url);
        console.log(`   Checking MSPT: ${title.substring(0, 40)}...`);

        const articleHtml = await fetchPage(url);
        const image = extractArticleImage(articleHtml, url);

        // Only save articles with real images
        if (image) {
            articles.push({ url, title, image, source });
        }
    }

    return articles;
}

async function scrapeWSOP(html, source) {
    const articles = [];
    const seen = new Set();

    // WSOP has multiple URL formats - try several patterns
    const patterns = [
        // /news/YYYY/MM/title or /news/title format
        /href=["']((?:https?:\/\/www\.wsop\.com)?\/news\/[^"']+)["'][^>]*>([^<]+)/gi,
        // /article/title format
        /href=["']((?:https?:\/\/www\.wsop\.com)?\/article\/[^"']+)["'][^>]*>([^<]+)/gi,
        // Headlines with h2/h3 containing links
        /<h[23][^>]*>\s*<a[^>]+href=["']((?:https?:\/\/www\.wsop\.com)?\/[^"']+)["'][^>]*>([^<]+)/gi,
        // Look for card/article containers with links
        /<div[^>]*class=["'][^"']*(?:card|article|news-item|post)[^"']*["'][^>]*>[\s\S]*?<a[^>]+href=["']((?:https?:\/\/www\.wsop\.com)?\/[^"']+)["'][^>]*>[\s\S]*?<[^>]*>([^<]{15,})/gi
    ];

    for (const pattern of patterns) {
        if (articles.length >= CONFIG.MAX_ARTICLES_PER_SOURCE) break;
        const matches = html.matchAll(pattern);

        for (const match of matches) {
            if (articles.length >= CONFIG.MAX_ARTICLES_PER_SOURCE) break;

            let url = match[1];
            const title = cleanText(match[2]);

            if (!title || title.length < 15 || seen.has(url)) continue;
            // Skip non-article links
            if (url.includes('/category/') || url.includes('/tag/') || url.includes('/author/')) continue;
            if (url.includes('#') || url.includes('javascript:')) continue;
            // Skip player profiles and schedule pages
            if (url.includes('/players/') || url.includes('/schedule/') || url.includes('/circuit/')) continue;

            if (!url.startsWith('http')) {
                url = source.baseUrl + url;
            }

            seen.add(url);
            console.log(`   Checking WSOP: ${title.substring(0, 40)}...`);

            const articleHtml = await fetchPage(url);
            const image = extractArticleImage(articleHtml, url);

            // Only save articles with real images
            if (image) {
                articles.push({ url, title, image, source });
            }
        }
    }

    return articles;
}

async function scrapePokerfuse(html, source) {
    const articles = [];
    const seen = new Set();

    // Pokerfuse uses /latest-news/YYYY/M/slug/ format - look for article links with titles
    const matches = html.matchAll(/href=["']((?:https?:\/\/pokerfuse\.com)?\/latest-news\/\d{4}\/\d{1,2}\/[^"']+)["'][^>]*>([^<]+)/gi);

    for (const match of matches) {
        if (articles.length >= CONFIG.MAX_ARTICLES_PER_SOURCE) break;

        let url = match[1];
        const title = cleanText(match[2]);

        // Skip navigation links and short titles
        if (!title || title.length < 15 || seen.has(url)) continue;
        if (title.toLowerCase().includes('read more') || title.toLowerCase().includes('continue')) continue;

        if (!url.startsWith('http')) {
            url = source.baseUrl + url;
        }

        seen.add(url);
        console.log(`   Checking Pokerfuse: ${title.substring(0, 40)}...`);

        const articleHtml = await fetchPage(url);
        const image = extractArticleImage(articleHtml, url);

        // Only save articles with real images
        if (image) {
            articles.push({ url, title, image, source });
        }
    }

    return articles;
}

async function scrapeCardPlayer(html, source) {
    const articles = [];
    const seen = new Set();

    // CardPlayer has multiple URL formats - try several patterns
    const patterns = [
        // /poker-news/XXXXX/title format
        /href=["']((?:https?:\/\/www\.cardplayer\.com)?\/poker-news\/\d+\/[^"']+)["'][^>]*>([^<]+)/gi,
        // /poker-news/title format (without number)
        /href=["']((?:https?:\/\/www\.cardplayer\.com)?\/poker-news\/[^"'\/]+)["'][^>]*>([^<]+)/gi,
        // Any link with good title inside news containers
        /<a[^>]+href=["']((?:https?:\/\/www\.cardplayer\.com)?\/[^"']+)["'][^>]*>\s*<[^>]*>\s*([^<]{20,})/gi,
        // Headlines - look for h2/h3 with links
        /<h[23][^>]*>\s*<a[^>]+href=["']((?:https?:\/\/www\.cardplayer\.com)?\/[^"']+)["'][^>]*>([^<]+)/gi
    ];

    for (const pattern of patterns) {
        if (articles.length >= CONFIG.MAX_ARTICLES_PER_SOURCE) break;
        const matches = html.matchAll(pattern);

        for (const match of matches) {
            if (articles.length >= CONFIG.MAX_ARTICLES_PER_SOURCE) break;

            let url = match[1];
            const title = cleanText(match[2]);

            if (!title || title.length < 15 || seen.has(url)) continue;
            // Skip non-article links
            if (url.includes('/category/') || url.includes('/tag/') || url.includes('/author/')) continue;
            if (url.includes('#') || url.includes('javascript:')) continue;

            if (!url.startsWith('http')) {
                url = source.baseUrl + url;
            }

            seen.add(url);
            console.log(`   Checking CardPlayer: ${title.substring(0, 40)}...`);

            const articleHtml = await fetchPage(url);
            const image = extractArticleImage(articleHtml, url);

            // Only save articles with real images
            if (image) {
                articles.push({ url, title, image, source });
            }
        }
    }

    return articles;
}

async function scrapePokerOrg(html, source) {
    const articles = [];
    const seen = new Set();

    // Poker.org article links - various patterns
    const patterns = [
        /href=["']((?:https?:\/\/www\.poker\.org)?\/[^"']*(?:news|article|story)[^"']*)["'][^>]*>([^<]+)/gi,
        /href=["'](https?:\/\/www\.poker\.org\/[^"']+)["'][^>]*>([^<]{20,})/gi
    ];

    for (const pattern of patterns) {
        const matches = html.matchAll(pattern);
        for (const match of matches) {
            if (articles.length >= CONFIG.MAX_ARTICLES_PER_SOURCE) break;

            let url = match[1];
            const title = cleanText(match[2]);

            if (!title || title.length < 15 || seen.has(url)) continue;
            if (url.includes('#') || url.includes('javascript:')) continue;
            // Skip navigation/category links
            if (url.match(/\/(category|tag|author|page)\//i)) continue;

            if (!url.startsWith('http')) {
                url = source.baseUrl + url;
            }

            seen.add(url);
            console.log(`   Checking Poker.org: ${title.substring(0, 40)}...`);

            const articleHtml = await fetchPage(url);
            const image = extractArticleImage(articleHtml, url);

            // Only save articles with real images
            if (image) {
                articles.push({ url, title, image, source });
            }
        }
    }

    return articles;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN SCRAPER
// ═══════════════════════════════════════════════════════════════════════════

// PokerNews scraper fallback
async function scrapePokerNews(html, source) {
    const articles = [];
    const seen = new Set();

    // PokerNews URL patterns
    const patterns = [
        // /news/YYYY/MM/title format
        /href=["']((?:https?:\/\/www\.pokernews\.com)?\/news\/\d{4}\/\d{1,2}\/[^"']+)["'][^>]*>([^<]+)/gi,
        // Headlines in h2/h3
        /<h[23][^>]*>\s*<a[^>]+href=["']((?:https?:\/\/www\.pokernews\.com)?\/news\/[^"']+)["'][^>]*>([^<]+)/gi,
        // Article cards
        /<article[^>]*>[\s\S]*?<a[^>]+href=["']((?:https?:\/\/www\.pokernews\.com)?\/news\/[^"']+)["'][^>]*>[\s\S]*?<[^>]*>([^<]{15,})/gi
    ];

    for (const pattern of patterns) {
        if (articles.length >= CONFIG.MAX_ARTICLES_PER_SOURCE) break;
        const matches = html.matchAll(pattern);

        for (const match of matches) {
            if (articles.length >= CONFIG.MAX_ARTICLES_PER_SOURCE) break;

            let url = match[1];
            const title = cleanText(match[2]);

            if (!title || title.length < 15 || seen.has(url)) continue;
            if (url.includes('#') || url.includes('javascript:')) continue;

            if (!url.startsWith('http')) {
                url = source.baseUrl + url;
            }

            seen.add(url);
            console.log(`   Checking PokerNews: ${title.substring(0, 40)}...`);

            const articleHtml = await fetchPage(url);
            const image = extractArticleImage(articleHtml, url);

            if (image) {
                articles.push({ url, title, image, source });
            }
        }
    }

    return articles;
}

async function scrapeSource(source) {
    console.log(`📰 Scraping: ${source.name} (${source.type})...`);

    let articles = [];

    if (source.type === 'rss') {
        articles = await scrapeRSS(source);
    } else if (source.type === 'hybrid') {
        // Try RSS first
        articles = await scrapeRSS(source);
        // If RSS fails or returns no articles, try scraping
        if (articles.length === 0 && source.scrapeUrl) {
            console.log(`   RSS returned 0, trying scrape fallback...`);
            const html = await fetchPage(source.scrapeUrl);
            if (html) {
                switch (source.name) {
                    case 'PokerNews': articles = await scrapePokerNews(html, source); break;
                }
            }
        }
    } else {
        const html = await fetchPage(source.url);
        if (!html) {
            console.log(`   ✗ Failed to fetch ${source.name}`);
            return [];
        }

        switch (source.name) {
            case 'MSPT': articles = await scrapeMSPT(html, source); break;
            case 'WSOP': articles = await scrapeWSOP(html, source); break;
            case 'Pokerfuse': articles = await scrapePokerfuse(html, source); break;
            case 'CardPlayer': articles = await scrapeCardPlayer(html, source); break;
            case 'Poker.org': articles = await scrapePokerOrg(html, source); break;
        }
    }

    console.log(`   ✓ Found ${articles.length} articles with images`);
    return articles;
}

// ═══════════════════════════════════════════════════════════════════════════
// DATABASE OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

// Get the official SmarterPokerOfficial account for posting
async function getNewsPosterId() {
    // Try to find existing SmarterPokerOfficial account (Daniel@smarter.poker)
    const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .or('username.eq.SmarterPokerOfficial,email.eq.Daniel@smarter.poker')
        .single();

    if (existing) return existing.id;

    // Create the official account if doesn't exist
    const { data: created, error } = await supabase
        .from('profiles')
        .insert({
            username: 'SmarterPokerOfficial',
            full_name: 'Smarter Poker',
            avatar_url: 'https://smarter.poker/images/logo-icon.png',
            level: 99,
            is_verified: true
        })
        .select('id')
        .single();

    if (error) {
        console.error('Failed to create news poster:', error.message);
        return null;
    }
    return created?.id;
}

// Post article to social feed
async function postToSocialFeed(article, newsPosterId) {
    if (!newsPosterId) return;

    // Check if already posted (by source_url in content)
    const { data: existing } = await supabase
        .from('social_posts')
        .select('id')
        .like('content', `%${article.url}%`)
        .single();

    if (existing) return; // Already posted

    const sourceIcon = article.source.icon || '📰';
    const postContent = `${sourceIcon} **${article.title}**\n\nvia ${article.source.name}\n🔗 ${article.url}`;

    const { error } = await supabase
        .from('social_posts')
        .insert({
            author_id: newsPosterId,
            content: postContent,
            content_type: 'link',
            media_urls: article.image ? [article.image] : [],
            visibility: 'public',
            metadata: {
                news_source: article.source.name,
                news_box: article.source.box,
                article_url: article.url,
                article_image: article.image
            }
        });

    if (error) {
        console.error(`   ✗ Social post error: ${error.message}`);
    } else {
        console.log(`   📢 Posted to social feed`);
    }
}

async function saveArticle(article, newsPosterId) {
    const slug = article.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .slice(0, 100);

    const { data, error } = await supabase
        .from('poker_news')
        .upsert({
            title: article.title,
            slug: `${slug}-${Date.now()}`,
            content: '',
            excerpt: article.title.slice(0, 150),
            image_url: article.image,
            category: article.source.category,
            source_url: article.url,
            source_name: article.source.name,
            source_box: article.source.box,
            is_published: true,
            is_featured: false,
            views: 0,
            published_at: new Date().toISOString()
        }, {
            onConflict: 'source_url',
            ignoreDuplicates: true
        })
        .select()
        .single();

    if (error && !error.message.includes('duplicate')) {
        console.error(`   ✗ DB Error: ${error.message}`);
        return null;
    }

    // If article was saved (not duplicate), post to social feed
    if (data) {
        await postToSocialFeed(article, newsPosterId);
    }

    return data;
}

async function archiveOldArticles() {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - CONFIG.RETENTION_DAYS);

    const { data, error } = await supabase
        .from('poker_news')
        .update({ is_archived: true })
        .lt('published_at', cutoffDate.toISOString())
        .eq('is_archived', false)
        .select('id');

    if (error) {
        console.error('Archive error:', error.message);
        return 0;
    }

    return data?.length || 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════

export default async function handler(req, res) {
    console.log('\n');
    console.log('═'.repeat(70));
    console.log('📰 SMARTER.POKER NEWS SCRAPER - 6 Box System');
    console.log('═'.repeat(70));
    console.log(`⏰ Started at: ${new Date().toISOString()}`);

    const results = {
        sources: {},
        totalSaved: 0,
        archived: 0,
        errors: []
    };

    try {
        // Get news poster account for social feed
        const newsPosterId = await getNewsPosterId();
        console.log(`📢 News poster ID: ${newsPosterId || 'NOT FOUND'}`);

        for (const source of NEWS_SOURCES) {
            try {
                const articles = await scrapeSource(source);
                results.sources[source.name] = { found: articles.length, saved: 0 };

                for (const article of articles) {
                    const saved = await saveArticle(article, newsPosterId);
                    if (saved) {
                        results.sources[source.name].saved++;
                        results.totalSaved++;
                        console.log(`   ✓ Saved: ${article.title.substring(0, 50)}...`);
                    }
                }
            } catch (error) {
                results.errors.push(`${source.name}: ${error.message}`);
                console.error(`   ✗ ${source.name} error: ${error.message}`);
            }
        }

        results.archived = await archiveOldArticles();
        console.log(`\n📦 Archived ${results.archived} old articles`);

        console.log('\n═'.repeat(70));
        console.log('📊 SUMMARY');
        for (const [name, stats] of Object.entries(results.sources)) {
            console.log(`   ${name}: ${stats.saved}/${stats.found}`);
        }
        console.log(`   Total: ${results.totalSaved} new articles`);
        console.log('═'.repeat(70));

        return res.status(200).json({
            success: true,
            timestamp: new Date().toISOString(),
            results
        });

    } catch (error) {
        console.error('❌ Scraper error:', error);
        return res.status(500).json({ success: false, error: error.message, results });
    }
}
