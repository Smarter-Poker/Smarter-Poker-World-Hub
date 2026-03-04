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
    REQUEST_TIMEOUT: 12000,  // Increased from 8s — MSPT ASP.NET needs extra time on Vercel
    IMAGE_PROXY_TIMEOUT: 5000
};

// Contextual fallback images based on article keywords (using reliable Pexels poker images)
// This prevents all articles from showing the same generic fallback
const KEYWORD_IMAGES = {
    // Tournament & competition keywords
    tournament: 'https://images.pexels.com/photos/6664248/pexels-photo-6664248.jpeg?auto=compress&cs=tinysrgb&w=600',
    wsop: 'https://images.pexels.com/photos/6664248/pexels-photo-6664248.jpeg?auto=compress&cs=tinysrgb&w=600',
    bracelet: 'https://images.pexels.com/photos/6664248/pexels-photo-6664248.jpeg?auto=compress&cs=tinysrgb&w=600',
    ring: 'https://images.pexels.com/photos/6664248/pexels-photo-6664248.jpeg?auto=compress&cs=tinysrgb&w=600',
    wpt: 'https://images.pexels.com/photos/3279691/pexels-photo-3279691.jpeg?auto=compress&cs=tinysrgb&w=600',
    win: 'https://images.pexels.com/photos/6664248/pexels-photo-6664248.jpeg?auto=compress&cs=tinysrgb&w=600',
    victory: 'https://images.pexels.com/photos/6664248/pexels-photo-6664248.jpeg?auto=compress&cs=tinysrgb&w=600',
    champion: 'https://images.pexels.com/photos/6664248/pexels-photo-6664248.jpeg?auto=compress&cs=tinysrgb&w=600',
    // High stakes / money keywords
    million: 'https://images.pexels.com/photos/4386366/pexels-photo-4386366.jpeg?auto=compress&cs=tinysrgb&w=600',
    'high stakes': 'https://images.pexels.com/photos/4386366/pexels-photo-4386366.jpeg?auto=compress&cs=tinysrgb&w=600',
    pot: 'https://images.pexels.com/photos/4386366/pexels-photo-4386366.jpeg?auto=compress&cs=tinysrgb&w=600',
    cash: 'https://images.pexels.com/photos/4386366/pexels-photo-4386366.jpeg?auto=compress&cs=tinysrgb&w=600',
    // Online poker keywords
    online: 'https://images.pexels.com/photos/4254890/pexels-photo-4254890.jpeg?auto=compress&cs=tinysrgb&w=600',
    ggpoker: 'https://images.pexels.com/photos/4254890/pexels-photo-4254890.jpeg?auto=compress&cs=tinysrgb&w=600',
    pokerstars: 'https://images.pexels.com/photos/4254890/pexels-photo-4254890.jpeg?auto=compress&cs=tinysrgb&w=600',
    // Legal / industry keywords
    casino: 'https://images.pexels.com/photos/3279691/pexels-photo-3279691.jpeg?auto=compress&cs=tinysrgb&w=600',
    bill: 'https://images.pexels.com/photos/4386331/pexels-photo-4386331.jpeg?auto=compress&cs=tinysrgb&w=600',
    law: 'https://images.pexels.com/photos/4386331/pexels-photo-4386331.jpeg?auto=compress&cs=tinysrgb&w=600',
    legal: 'https://images.pexels.com/photos/4386331/pexels-photo-4386331.jpeg?auto=compress&cs=tinysrgb&w=600',
    tax: 'https://images.pexels.com/photos/4386331/pexels-photo-4386331.jpeg?auto=compress&cs=tinysrgb&w=600',
    // Player-focused keywords
    player: 'https://images.pexels.com/photos/1871508/pexels-photo-1871508.jpeg?auto=compress&cs=tinysrgb&w=600',
    pro: 'https://images.pexels.com/photos/1871508/pexels-photo-1871508.jpeg?auto=compress&cs=tinysrgb&w=600'
};

// Rotate through these for variety when no keyword matches
const POKER_IMAGE_ROTATION = [
    'https://images.pexels.com/photos/1871508/pexels-photo-1871508.jpeg?auto=compress&cs=tinysrgb&w=600', // Cards
    'https://images.pexels.com/photos/3279691/pexels-photo-3279691.jpeg?auto=compress&cs=tinysrgb&w=600', // Casino chips
    'https://images.pexels.com/photos/6664248/pexels-photo-6664248.jpeg?auto=compress&cs=tinysrgb&w=600', // Tournament
    'https://images.pexels.com/photos/4254890/pexels-photo-4254890.jpeg?auto=compress&cs=tinysrgb&w=600', // Online
    'https://images.pexels.com/photos/4386366/pexels-photo-4386366.jpeg?auto=compress&cs=tinysrgb&w=600', // Money
    'https://images.pexels.com/photos/4386331/pexels-photo-4386331.jpeg?auto=compress&cs=tinysrgb&w=600'  // Industry
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

    // Rotate through variety of poker images if no keyword match
    const image = POKER_IMAGE_ROTATION[rotationIndex % POKER_IMAGE_ROTATION.length];
    rotationIndex++;
    return image;
}

// Legacy source-specific fallback (still used as ultimate fallback)
const SOURCE_FALLBACK_IMAGES = {
    'PokerNews': 'https://images.pexels.com/photos/1871508/pexels-photo-1871508.jpeg?auto=compress&cs=tinysrgb&w=600',
    'MSPT': 'https://images.pexels.com/photos/3279691/pexels-photo-3279691.jpeg?auto=compress&cs=tinysrgb&w=600',
    'CardPlayer': 'https://images.pexels.com/photos/279009/pexels-photo-279009.jpeg?auto=compress&cs=tinysrgb&w=600',
    'WSOP': 'https://images.pexels.com/photos/6664248/pexels-photo-6664248.jpeg?auto=compress&cs=tinysrgb&w=600',
    'Upswing Poker': 'https://images.pexels.com/photos/4254890/pexels-photo-4254890.jpeg?auto=compress&cs=tinysrgb&w=600',
    'Pokerfuse': 'https://images.pexels.com/photos/1871508/pexels-photo-1871508.jpeg?auto=compress&cs=tinysrgb&w=600'
};

// ═══════════════════════════════════════════════════════════════════════════
// THE 6 NEWS SOURCES
// ═══════════════════════════════════════════════════════════════════════════
const NEWS_SOURCES = [
    {
        box: 1,
        name: 'PokerNews',
        type: 'hybrid',  // Try RSS first, then scrape
        url: 'https://www.pokernews.com/rss.php',
        scrapeUrl: 'https://www.pokernews.com/news/',
        videoUrl: 'https://www.pokernews.com/video/most-recent/',  // Fallback to videos
        baseUrl: 'https://www.pokernews.com',
        icon: '🃏',
        category: 'news'
    },
    {
        box: 2,
        name: 'MSPT',
        type: 'scrape',
        url: 'https://msptpoker.com/pages/Magazine.aspx',
        baseUrl: 'https://msptpoker.com',
        icon: '🎰',
        category: 'tournament'
    },
    {
        box: 3,
        name: 'CardPlayer',
        type: 'rss',  // Changed from 'scrape' - HTML returns 403, RSS works
        url: 'https://www.cardplayer.com/poker-news.rss',
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
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
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

// Fetch article page with Googlebot-compatible UA (for sites like CardPlayer that block regular browsers)
async function fetchArticlePage(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);

    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5'
            }
        });
        clearTimeout(timeout);
        if (!response.ok) {
            // Fallback: try with regular browser UA
            return await fetchPage(url);
        }
        return await response.text();
    } catch (error) {
        clearTimeout(timeout);
        return null;
    }
}

// Fetch page with mobile Safari UA (many sites that block Googlebot still allow mobile browsers)
async function fetchWithMobileUA(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT + 5000); // Extra 5s for slow ASP.NET pages

    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive'
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

// Extract og:image via microlink.io proxy (for sites like CardPlayer that block ALL automated access)
async function fetchOgImageViaProxy(url) {
    try {
        const proxyUrl = `https://api.microlink.io/?url=${encodeURIComponent(url)}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);

        const response = await fetch(proxyUrl, {
            signal: controller.signal,
            headers: { 'Accept': 'application/json' }
        });
        clearTimeout(timeout);

        if (!response.ok) return null;

        const data = await response.json();
        const imageUrl = data?.data?.image?.url;
        if (imageUrl) {
            console.log(`   ✓ Got og:image via proxy: ${imageUrl.substring(0, 60)}...`);
            return imageUrl;
        }
        return null;
    } catch (error) {
        console.log(`   Proxy image fetch failed: ${error.message}`);
        return null;
    }
}

// Extract og:image via noembed.com proxy (secondary fallback for sites like CardPlayer)
async function fetchOgImageViaNoEmbed(url) {
    try {
        const proxyUrl = `https://noembed.com/embed?url=${encodeURIComponent(url)}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);

        const response = await fetch(proxyUrl, {
            signal: controller.signal,
            headers: { 'Accept': 'application/json' }
        });
        clearTimeout(timeout);

        if (!response.ok) return null;

        const data = await response.json();
        const imageUrl = data?.thumbnail_url || data?.url;
        if (imageUrl && (imageUrl.endsWith('.jpg') || imageUrl.endsWith('.jpeg') || imageUrl.endsWith('.png') || imageUrl.endsWith('.webp') || imageUrl.includes('cardplayer.com'))) {
            console.log(`   ✓ Got image via noembed: ${imageUrl.substring(0, 60)}...`);
            return imageUrl;
        }
        return null;
    } catch (error) {
        console.log(`   Noembed image fetch failed: ${error.message}`);
        return null;
    }
}

// Extract og:image via Google's web cache (tertiary fallback)
async function fetchOgImageViaGoogleCache(url) {
    try {
        const cacheUrl = `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(url)}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);

        const response = await fetch(cacheUrl, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html'
            }
        });
        clearTimeout(timeout);

        if (!response.ok) return null;

        const html = await response.text();
        const image = extractArticleImage(html, url);
        if (image) {
            console.log(`   ✓ Got image via Google cache: ${image.substring(0, 60)}...`);
        }
        return image;
    } catch (error) {
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// FAST-FAIL IMAGE PROXY (Promise.race with 5s hard timeout)
// Runs microlink, noembed, and Google Cache concurrently — first success wins.
// If none respond within 5s, returns null immediately.
// ═══════════════════════════════════════════════════════════════════════════
async function fastFailImageProxy(url) {
    if (!url) return null;

    const timeoutPromise = new Promise((resolve) =>
        setTimeout(() => resolve(null), CONFIG.IMAGE_PROXY_TIMEOUT)
    );

    // Run all three proxies concurrently; first non-null result wins
    const proxyRace = Promise.any([
        fetchOgImageViaProxy(url),
        fetchOgImageViaNoEmbed(url),
        fetchOgImageViaGoogleCache(url)
    ]).catch(() => null); // If ALL reject, return null

    return Promise.race([proxyRace, timeoutPromise]);
}

// ═══════════════════════════════════════════════════════════════════════════
// CARDPLAYER-SPECIFIC IMAGE EXTRACTION
// CardPlayer's RSS feed contains ZERO image data. This function extracts
// images by: (1) constructing the og:image URL from article ID patterns,
// (2) trying to fetch the article page with multiple UAs.
// ═══════════════════════════════════════════════════════════════════════════
async function extractCardPlayerImage(articleUrl) {
    if (!articleUrl) return null;

    // Step 1: Try microlink proxy FIRST — CardPlayer blocks all direct access (403)
    // but microlink.io can extract og:image from their pages
    console.log(`   Trying microlink proxy for CardPlayer: ${articleUrl.substring(0, 50)}...`);
    const proxyImage = await fetchOgImageViaProxy(articleUrl);
    if (proxyImage) {
        console.log(`   ✓ CardPlayer image via microlink: ${proxyImage.substring(0, 60)}...`);
        return proxyImage;
    }

    // Step 2: Try noembed proxy as secondary
    const noembedImage = await fetchOgImageViaNoEmbed(articleUrl);
    if (noembedImage) {
        console.log(`   ✓ CardPlayer image via noembed: ${noembedImage.substring(0, 60)}...`);
        return noembedImage;
    }

    // Step 3: Try Google cache as tertiary
    const cacheImage = await fetchOgImageViaGoogleCache(articleUrl);
    if (cacheImage) {
        console.log(`   ✓ CardPlayer image via cache: ${cacheImage.substring(0, 60)}...`);
        return cacheImage;
    }

    // Step 4: Extract article ID and try CDN patterns as last resort
    const idMatch = articleUrl.match(/poker-news\/(\d+)/);
    if (idMatch) {
        const articleId = idMatch[1];
        const candidateUrls = [
            `https://www.cardplayer.com/assets/poker-news/${articleId}/main_image.jpg`,
            `https://www.cardplayer.com/assets/poker-news/${articleId}/main.jpg`,
            `https://www.cardplayer.com/poker-news/${articleId}/image.jpg`
        ];

        for (const candidateUrl of candidateUrls) {
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 3000);
                const response = await fetch(candidateUrl, {
                    method: 'HEAD',
                    signal: controller.signal,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    }
                });
                clearTimeout(timeout);
                if (response.ok) {
                    const contentType = response.headers.get('content-type') || '';
                    if (contentType.startsWith('image/')) {
                        console.log(`   ✓ CardPlayer CDN image found: ${candidateUrl.substring(0, 60)}...`);
                        return candidateUrl;
                    }
                }
            } catch (e) { /* continue to next candidate */ }
        }
    }

    console.log(`   ✗ All CardPlayer image methods failed for: ${articleUrl.substring(0, 50)}...`);
    return null;
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

            // CardPlayer RSS has ZERO image data — use dedicated extractor
            if (!image && item.link && source.name === 'CardPlayer') {
                image = await extractCardPlayerImage(item.link);
            }

            // If no image in RSS, fetch from article page (skip for CardPlayer — already handled above)
            if (!image && item.link && source.name !== 'CardPlayer') {
                const articleHtml = await fetchArticlePage(item.link);
                image = extractArticleImage(articleHtml, item.link);
            }

            // Fast-fail proxy chain (skip for CardPlayer — already tried in extractCardPlayerImage)
            if (!image && item.link && source.name !== 'CardPlayer') {
                image = await fastFailImageProxy(item.link);
            }

            // Use source fallback if no image found
            if (!image) {
                image = getContextualFallbackImage(title);
                console.log(`   Using fallback image for: ${title.substring(0, 30)}...`);
            }

            // Save articles with images (including fallbacks)
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

    // ═══════════════════════════════════════════════════════════════════
    // MSPT Magazine.aspx uses card containers with this structure:
    //   <div class="item-2 card card2">
    //     <div class="thumb" style="background-image: url('https://msptpoker.com/images/...');"></div>
    //     <article>
    //       <h1><a href="../Magazine/slug~ID.aspx">Title</a></h1>
    //       <span>Date</span>
    //       <div>Summary</div>
    //     </article>
    //   </div>
    //
    // Strategy: Parse each card container to extract both the thumbnail
    // (from background-image CSS) and the article link+title in one pass.
    // This avoids fetching individual article pages which lack og:image.
    // ═══════════════════════════════════════════════════════════════════

    // Step 1: Extract all card containers — match thumb background-image followed by article link
    // This regex captures: (1) thumbnail URL from background-image, (2) article href, (3) title text
    const cardPattern = /class="thumb"\s*style="background-image:\s*url\('([^']+)'\)[^"]*"[\s\S]*?<h1>\s*<a\s+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi;
    const cardMatches = html.matchAll(cardPattern);

    for (const match of cardMatches) {
        if (articles.length >= CONFIG.MAX_ARTICLES_PER_SOURCE) break;

        let image = match[1]?.trim();
        let url = match[2]?.trim();
        const title = cleanText(match[3]);

        if (!title || title.length < 10) continue;
        if (!url || url.includes('javascript:') || url.includes('#')) continue;

        // Build full URL if relative (../Magazine/slug~ID.aspx -> https://msptpoker.com/Magazine/slug~ID.aspx)
        if (!url.startsWith('http')) {
            url = url.replace(/^\.\.\//, '').replace(/^\.\//, '').replace(/^\//, '');
            url = source.baseUrl + '/' + url;
        }

        // Ensure image URL is absolute
        if (image && !image.startsWith('http')) {
            image = source.baseUrl + '/' + image.replace(/^\//, '');
        }

        if (seen.has(url)) continue;
        seen.add(url);
        console.log(`   ✓ MSPT card: ${title.substring(0, 40)}... [img: ${image ? 'YES' : 'NO'}]`);

        // Use contextual fallback only if no thumbnail found in listing
        if (!image) {
            image = getContextualFallbackImage(title);
            console.log(`   Using fallback image for MSPT: ${title.substring(0, 30)}...`);
        }

        if (image) {
            articles.push({ url, title, image, source });
        }
    }

    // Fallback: If card pattern didn't match (page structure changed), try the old link-based approach
    if (articles.length === 0) {
        console.log('   ⚠ MSPT card pattern failed, falling back to link-based extraction...');
        const linkPatterns = [
            /href=["']((?:\.\.\/)?Magazine\/[^"']+\.aspx)["'][^>]*>([^<]+)/gi,
            /href=["'](https?:\/\/(?:www\.)?msptpoker\.com\/Magazine\/[^"']+\.aspx)["'][^>]*>([^<]+)/gi
        ];

        for (const pattern of linkPatterns) {
            if (articles.length >= CONFIG.MAX_ARTICLES_PER_SOURCE) break;
            const matches = html.matchAll(pattern);

            for (const match of matches) {
                if (articles.length >= CONFIG.MAX_ARTICLES_PER_SOURCE) break;

                let url = match[1];
                const title = cleanText(match[2]);
                if (!title || title.length < 10 || seen.has(url)) continue;

                if (!url.startsWith('http')) {
                    url = url.replace(/^\.\.\//, '').replace(/^\.\//, '').replace(/^\//, '');
                    url = source.baseUrl + '/' + url;
                }
                if (seen.has(url)) continue;
                seen.add(url);

                // Try fetching article page for og:image as last resort
                const articleHtml = await fetchPage(url);
                let image = extractArticleImage(articleHtml, url);
                if (!image) {
                    image = getContextualFallbackImage(title);
                }
                if (image) {
                    articles.push({ url, title, image, source });
                }
            }
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
            let image = extractArticleImage(articleHtml, url);

            // Use source fallback if no image found
            if (!image) {
                image = getContextualFallbackImage(title);
                console.log(`   Using fallback image for WSOP: ${title.substring(0, 30)}...`);
            }

            // Save articles with images (including fallbacks)
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

    // Pokerfuse uses /latest-news/YYYY/M/slug/ format - try multiple patterns
    const patterns = [
        // Direct link with title text
        /href=["']((?:https?:\/\/pokerfuse\.com)?\/latest-news\/\d{4}\/\d{1,2}\/[^"']+)["'][^>]*>([^<]+)/gi,
        // Headlines in h2/h3 with links
        /<h[23][^>]*>\s*<a[^>]+href=["']((?:https?:\/\/pokerfuse\.com)?\/latest-news\/\d{4}\/\d{1,2}\/[^"']+)["'][^>]*>([^<]+)/gi,
        // Article cards with title in nested element
        /<a[^>]+href=["']((?:https?:\/\/pokerfuse\.com)?\/latest-news\/\d{4}\/\d{1,2}\/[^"']+)["'][^>]*>[\s\S]*?<[^>]*>([^<]{15,})/gi,
        // Also try /the-rail/ and /live-poker/ sections
        /href=["']((?:https?:\/\/pokerfuse\.com)?\/(?:the-rail|live-poker)\/\d{4}\/\d{1,2}\/[^"']+)["'][^>]*>([^<]+)/gi
    ];

    for (const pattern of patterns) {
        if (articles.length >= CONFIG.MAX_ARTICLES_PER_SOURCE) break;
        const matches = html.matchAll(pattern);

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
            let image = extractArticleImage(articleHtml, url);

            // Use source fallback if no image found
            if (!image) {
                image = getContextualFallbackImage(title);
                console.log(`   Using fallback image for Pokerfuse: ${title.substring(0, 30)}...`);
            }

            // Save articles with images (including fallbacks)
            if (image) {
                articles.push({ url, title, image, source });
            }
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
            let image = extractArticleImage(articleHtml, url);

            // Use source fallback if no image found
            if (!image) {
                image = getContextualFallbackImage(title);
                console.log(`   Using fallback image for CardPlayer: ${title.substring(0, 30)}...`);
            }

            // Save articles with images (including fallbacks)
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

    // Poker.org is a JS SPA - use their sitemap instead!
    // Sitemap format: https://www.poker.org/sitemaps/article-YYYY-M.xml
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1; // 1-indexed

    // Try current month first, then previous month as fallback
    const sitemapUrls = [
        `https://www.poker.org/sitemaps/article-${year}-${month}.xml`,
        `https://www.poker.org/sitemaps/article-${year}-${month - 1 > 0 ? month - 1 : 12}.xml`
    ];

    for (const sitemapUrl of sitemapUrls) {
        if (articles.length >= CONFIG.MAX_ARTICLES_PER_SOURCE) break;

        console.log(`   Fetching Poker.org sitemap: ${sitemapUrl}`);
        const sitemapXml = await fetchPage(sitemapUrl);
        if (!sitemapXml) continue;

        // Parse sitemap XML - extract <loc> URLs for latest-news articles
        const urlMatches = sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/gi);

        for (const match of urlMatches) {
            if (articles.length >= CONFIG.MAX_ARTICLES_PER_SOURCE) break;

            const url = match[1];

            // Only include news articles (skip videos, strategy pages, etc.)
            if (!url.includes('/latest-news/')) continue;
            if (seen.has(url)) continue;
            seen.add(url);

            // Extract title from URL slug (last segment before the ID)
            const urlPath = url.replace('https://www.poker.org', '').replace(/\/$/, '');
            const segments = urlPath.split('/');
            const slugWithId = segments[segments.length - 1];
            // Remove the random ID at the end (format: title-here-aXYZ123)
            const slug = slugWithId.replace(/-[a-zA-Z0-9]{10,}$/, '');
            const title = slug
                .split('-')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ')
                .slice(0, 100);

            if (!title || title.length < 15) continue;

            console.log(`   Checking Poker.org: ${title.substring(0, 40)}...`);

            // Fetch article page for image
            const articleHtml = await fetchPage(url);
            let image = extractArticleImage(articleHtml, url);

            // Use source fallback if no image found
            if (!image) {
                image = getContextualFallbackImage(title);
                console.log(`   Using fallback image for Poker.org: ${title.substring(0, 30)}...`);
            }

            if (image) {
                articles.push({ url, title, image, source });
            }
        }
    }

    return articles;
}

// PokerNews VIDEO scraper - fallback when no new articles
async function scrapePokerNewsVideos(html, source) {
    const articles = [];
    const seen = new Set();

    // Video URL pattern: /video/title-XXXXX.htm
    const pattern = /href=["'](\/video\/[^"']+\.htm)["'][^>]*class=["']title["'][^>]*>([^<]+)/gi;
    const matches = html.matchAll(pattern);

    for (const match of matches) {
        if (articles.length >= CONFIG.MAX_ARTICLES_PER_SOURCE) break;

        let url = match[1];
        let title = cleanText(match[2]);

        if (!title || title.length < 15 || seen.has(url)) continue;

        // Clean up title (remove channel suffixes)
        title = title.replace(/\s*\|\s*PokerNews.*$/i, '').trim();

        url = source.baseUrl + url;
        seen.add(url);

        console.log(`   Checking PokerNews Video: ${title.substring(0, 40)}...`);

        const videoHtml = await fetchPage(url);
        let image = extractArticleImage(videoHtml, url);

        // Use fallback if no image
        if (!image) {
            image = getContextualFallbackImage(title);
        }

        if (image) {
            articles.push({
                url,
                title: `🎬 ${title}`,  // Mark as video
                image,
                source
            });
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
            let image = extractArticleImage(articleHtml, url);

            // Use source fallback if no image found
            if (!image) {
                image = getContextualFallbackImage(title);
                console.log(`   Using fallback image for PokerNews: ${title.substring(0, 30)}...`);
            }

            // Save articles with images (including fallbacks)
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
        // Multi-UA resilient fetch
        // MSPT (ASP.NET) responds better to mobile Safari UA — try it first
        let html;
        if (source.name === 'MSPT') {
            console.log(`   Trying mobile Safari UA first for MSPT (ASP.NET)...`);
            html = await fetchWithMobileUA(source.url);
            if (!html) {
                console.log(`   ⚠ Mobile UA failed for MSPT, trying standard UA...`);
                html = await fetchPage(source.url);
            }
        } else {
            html = await fetchPage(source.url);
            if (!html) {
                console.log(`   ⚠ Initial fetch failed for ${source.name}, trying Googlebot UA...`);
                html = await fetchArticlePage(source.url);
            }
        }
        if (!html) {
            console.log(`   ⚠ Previous methods failed for ${source.name}, trying mobile Safari UA...`);
            html = await fetchWithMobileUA(source.url);
        }
        if (!html) {
            console.log(`   ✗ All fetch methods failed for ${source.name}`);
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

// Official news poster account
const NEWS_POSTER_UUID = '2d1cd6c3-5700-4af9-a271-d4863fdab20d';

// Get the news poster account for posting to social feed
async function getNewsPosterId() {
    // Verify the account exists
    const { data: account, error } = await supabase
        .from('profiles')
        .select('id, username')
        .eq('id', NEWS_POSTER_UUID)
        .single();

    if (account) {
        console.log(`   📢 Using news poster: ${account.username}`);
        return account.id;
    }

    // Account doesn't exist - log warning but continue scraping
    console.warn('⚠️ News poster account not found!');
    console.warn('   Social feed posts will be skipped.');
    return null;
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
        .select();

    // When ignoreDuplicates skips the insert, data is an empty array
    const savedArticle = data?.[0] || null;

    if (error && !error.message.includes('duplicate')) {
        console.error(`   ✗ DB Error: ${error.message}`);
        return null;
    }

    // If article was saved (not duplicate), post to social feed
    if (savedArticle) {
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
    // Verify cron secret
    if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    // Security: validate cron auth for external callers
    const { validateCronAuth } = await import('../../../src/utils/cron-auth.js');
    if (!validateCronAuth(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

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

        // ═══════════════════════════════════════════════════════════════
        // PARALLEL EXECUTION: All 6 sources scraped concurrently
        // Promise.allSettled ensures one source failure doesn't kill others
        // ═══════════════════════════════════════════════════════════════
        const sourceResults = await Promise.allSettled(
            NEWS_SOURCES.map(async (source) => {
                try {
                    let articles = await scrapeSource(source);
                    const sourceStats = { found: articles.length, saved: 0 };

                    for (const article of articles) {
                        const saved = await saveArticle(article, newsPosterId);
                        if (saved) {
                            sourceStats.saved++;
                            console.log(`   ✓ Saved: ${article.title.substring(0, 50)}...`);
                        }
                    }

                    // PokerNews fallback: try videos if all articles were duplicates
                    if (source.name === 'PokerNews' && source.videoUrl && sourceStats.saved === 0) {
                        console.log(`   📹 No new articles, trying PokerNews videos...`);
                        const videoHtml = await fetchPage(source.videoUrl);
                        if (videoHtml) {
                            const videoArticles = await scrapePokerNewsVideos(videoHtml, source);
                            sourceStats.found += videoArticles.length;

                            for (const video of videoArticles) {
                                const saved = await saveArticle(video, newsPosterId);
                                if (saved) {
                                    sourceStats.saved++;
                                    console.log(`   ✓ Saved video: ${video.title.substring(0, 50)}...`);
                                }
                            }
                        }
                    }

                    return { name: source.name, stats: sourceStats };
                } catch (error) {
                    console.error(`   ✗ ${source.name} error: ${error.message}`);
                    throw { name: source.name, message: error.message };
                }
            })
        );

        // Aggregate results from all parallel sources
        for (const result of sourceResults) {
            if (result.status === 'fulfilled') {
                const { name, stats } = result.value;
                results.sources[name] = stats;
                results.totalSaved += stats.saved;
            } else {
                const reason = result.reason;
                results.sources[reason.name] = { found: 0, saved: 0, error: reason.message };
                results.errors.push(`${reason.name}: ${reason.message}`);
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

// Vercel config — maxDuration for Pro plan (60s hard limit)
export const config = {
    maxDuration: 60
};
