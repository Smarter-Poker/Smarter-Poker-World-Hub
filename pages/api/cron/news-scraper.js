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
        type: 'rss',
        url: 'https://www.pokernews.com/news.rss',
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

function extractOgImage(html) {
    if (!html) return null;

    // Try og:image
    let match = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    if (!match) match = html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);

    // Try twitter:image
    if (!match) match = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
    if (!match) match = html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);

    if (match && match[1]) {
        return match[1].replace(/&amp;/g, '&');
    }
    return null;
}

function extractRssImage(item) {
    // Try enclosure
    if (item.enclosure?.url) return item.enclosure.url;

    // Try media:content
    if (item['media:content']?.$?.url) return item['media:content'].$.url;
    if (item['media:content']?.url) return item['media:content'].url;

    // Try media:thumbnail
    if (item['media:thumbnail']?.$?.url) return item['media:thumbnail'].$.url;

    // Try content:encoded for img tags
    if (item['content:encoded']) {
        const imgMatch = item['content:encoded'].match(/<img[^>]+src=["']([^"']+)["']/i);
        if (imgMatch) return imgMatch[1];
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
                image = extractOgImage(articleHtml);
            }

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
        const image = extractOgImage(articleHtml);

        if (image) {
            articles.push({ url, title, image, source });
        }
    }

    return articles;
}

async function scrapeWSOP(html, source) {
    const articles = [];
    const seen = new Set();

    // WSOP news links
    const matches = html.matchAll(/href=["']((?:https?:\/\/www\.wsop\.com)?\/news\/[^"']+)["'][^>]*>([^<]+)/gi);

    for (const match of matches) {
        if (articles.length >= CONFIG.MAX_ARTICLES_PER_SOURCE) break;

        let url = match[1];
        const title = cleanText(match[2]);

        if (!title || title.length < 15 || seen.has(url)) continue;

        if (!url.startsWith('http')) {
            url = source.baseUrl + url;
        }

        seen.add(url);

        const articleHtml = await fetchPage(url);
        const image = extractOgImage(articleHtml);

        if (image) {
            articles.push({ url, title, image, source });
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
        const image = extractOgImage(articleHtml);

        if (image) {
            articles.push({ url, title, image, source });
        }
    }

    return articles;
}

async function scrapeCardPlayer(html, source) {
    const articles = [];
    const seen = new Set();

    // CardPlayer news links - /poker-news/XXXXX/title format
    const matches = html.matchAll(/href=["']((?:https?:\/\/www\.cardplayer\.com)?\/poker-news\/\d+\/[^"']+)["'][^>]*>([^<]+)/gi);

    for (const match of matches) {
        if (articles.length >= CONFIG.MAX_ARTICLES_PER_SOURCE) break;

        let url = match[1];
        const title = cleanText(match[2]);

        if (!title || title.length < 15 || seen.has(url)) continue;

        if (!url.startsWith('http')) {
            url = source.baseUrl + url;
        }

        seen.add(url);
        console.log(`   Checking CardPlayer: ${title.substring(0, 40)}...`);

        const articleHtml = await fetchPage(url);
        const image = extractOgImage(articleHtml);

        if (image) {
            articles.push({ url, title, image, source });
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
            const image = extractOgImage(articleHtml);

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

async function scrapeSource(source) {
    console.log(`📰 Scraping: ${source.name} (${source.type})...`);

    let articles = [];

    if (source.type === 'rss') {
        articles = await scrapeRSS(source);
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

async function saveArticle(article) {
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
        for (const source of NEWS_SOURCES) {
            try {
                const articles = await scrapeSource(source);
                results.sources[source.name] = { found: articles.length, saved: 0 };

                for (const article of articles) {
                    const saved = await saveArticle(article);
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
