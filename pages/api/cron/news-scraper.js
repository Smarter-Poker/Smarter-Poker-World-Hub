/**
 * 📰 SMARTER.POKER NEWS SCRAPER - 6 Box System
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * BOX 1: PokerNews.com
 * BOX 2: MSPT.com
 * BOX 3: CardPlayer.com
 * BOX 4: WSOP.com
 * BOX 5: Poker.org
 * BOX 6: Pokerfuse.com
 *
 * SCHEDULE: Runs every 2 hours via Vercel cron
 * RETENTION: 3 days before archive
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Official Smarter.Poker System Account UUID
const SYSTEM_UUID = '00000000-0000-0000-0000-000000000001';

const CONFIG = {
    MAX_ARTICLES_PER_SOURCE: 5,
    RETENTION_DAYS: 3,
    REQUEST_TIMEOUT: 10000
};

// ═══════════════════════════════════════════════════════════════════════════
// THE 6 NEWS SOURCES - Each gets its own box
// ═══════════════════════════════════════════════════════════════════════════
const NEWS_SOURCES = [
    {
        box: 1,
        name: 'PokerNews',
        baseUrl: 'https://www.pokernews.com',
        scrapeUrl: 'https://www.pokernews.com/news/',
        icon: '🃏',
        category: 'news'
    },
    {
        box: 2,
        name: 'MSPT',
        baseUrl: 'https://msptpoker.com',
        scrapeUrl: 'https://msptpoker.com/pages/Magazine.aspx',
        icon: '🎰',
        category: 'tournament'
    },
    {
        box: 3,
        name: 'CardPlayer',
        baseUrl: 'https://www.cardplayer.com',
        scrapeUrl: 'https://www.cardplayer.com/poker-news',
        icon: '♠️',
        category: 'news'
    },
    {
        box: 4,
        name: 'WSOP',
        baseUrl: 'https://www.wsop.com',
        scrapeUrl: 'https://www.wsop.com/news/',
        icon: '🏆',
        category: 'tournament'
    },
    {
        box: 5,
        name: 'Poker.org',
        baseUrl: 'https://www.poker.org',
        scrapeUrl: 'https://www.poker.org/latest-news/',
        icon: '♦️',
        category: 'news'
    },
    {
        box: 6,
        name: 'Pokerfuse',
        baseUrl: 'https://pokerfuse.com',
        scrapeUrl: 'https://pokerfuse.com/latest-news/',
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
        .replace(/\s+/g, ' ')
        .trim();
}

function extractOgImage(html) {
    let match = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    if (!match) {
        match = html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    }
    if (!match) {
        match = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
    }
    return match ? match[1].replace(/&amp;/g, '&') : null;
}

// ═══════════════════════════════════════════════════════════════════════════
// SOURCE-SPECIFIC SCRAPERS
// ═══════════════════════════════════════════════════════════════════════════

async function scrapePokerNews(html, source) {
    const articles = [];

    // Match article links from PokerNews news page
    const articleMatches = html.matchAll(/<a[^>]+href=["'](https?:\/\/www\.pokernews\.com\/news\/[^"']+)["'][^>]*>([^<]+)<\/a>/gi);
    const seen = new Set();

    for (const match of articleMatches) {
        if (articles.length >= CONFIG.MAX_ARTICLES_PER_SOURCE) break;

        const url = match[1];
        const title = cleanText(match[2]);

        if (!title || title.length < 10 || seen.has(url)) continue;
        seen.add(url);

        // Fetch the article page to get image
        const articleHtml = await fetchPage(url);
        const image = articleHtml ? extractOgImage(articleHtml) : null;

        if (image) {
            articles.push({ url, title, image, source });
        }
    }

    return articles;
}

async function scrapeMSPT(html, source) {
    const articles = [];

    // MSPT uses a magazine-style layout
    const articleMatches = html.matchAll(/<a[^>]+href=["']([^"']*(?:news|article|story)[^"']*)["'][^>]*>([^<]*)<\/a>/gi);
    const seen = new Set();

    for (const match of articleMatches) {
        if (articles.length >= CONFIG.MAX_ARTICLES_PER_SOURCE) break;

        let url = match[1];
        if (!url.startsWith('http')) {
            url = source.baseUrl + (url.startsWith('/') ? '' : '/') + url;
        }

        const title = cleanText(match[2]);
        if (!title || title.length < 10 || seen.has(url)) continue;
        seen.add(url);

        const articleHtml = await fetchPage(url);
        const image = articleHtml ? extractOgImage(articleHtml) : null;

        if (image) {
            articles.push({ url, title, image, source });
        }
    }

    return articles;
}

async function scrapeCardPlayer(html, source) {
    const articles = [];

    // CardPlayer poker-news articles
    const articleMatches = html.matchAll(/<a[^>]+href=["'](https?:\/\/www\.cardplayer\.com\/poker-news\/[^"']+)["'][^>]*>([^<]+)<\/a>/gi);
    const seen = new Set();

    for (const match of articleMatches) {
        if (articles.length >= CONFIG.MAX_ARTICLES_PER_SOURCE) break;

        const url = match[1];
        const title = cleanText(match[2]);

        if (!title || title.length < 10 || seen.has(url)) continue;
        seen.add(url);

        const articleHtml = await fetchPage(url);
        const image = articleHtml ? extractOgImage(articleHtml) : null;

        if (image) {
            articles.push({ url, title, image, source });
        }
    }

    return articles;
}

async function scrapeWSOP(html, source) {
    const articles = [];

    // WSOP news articles
    const articleMatches = html.matchAll(/<a[^>]+href=["'](https?:\/\/www\.wsop\.com\/news\/[^"']+)["'][^>]*>([^<]+)<\/a>/gi);
    const seen = new Set();

    for (const match of articleMatches) {
        if (articles.length >= CONFIG.MAX_ARTICLES_PER_SOURCE) break;

        const url = match[1];
        const title = cleanText(match[2]);

        if (!title || title.length < 10 || seen.has(url)) continue;
        seen.add(url);

        const articleHtml = await fetchPage(url);
        const image = articleHtml ? extractOgImage(articleHtml) : null;

        if (image) {
            articles.push({ url, title, image, source });
        }
    }

    return articles;
}

async function scrapePokerOrg(html, source) {
    const articles = [];

    // Poker.org latest news
    const articleMatches = html.matchAll(/<a[^>]+href=["'](https?:\/\/www\.poker\.org\/latest-news\/[^"']+)["'][^>]*>([^<]+)<\/a>/gi);
    const seen = new Set();

    for (const match of articleMatches) {
        if (articles.length >= CONFIG.MAX_ARTICLES_PER_SOURCE) break;

        const url = match[1];
        const title = cleanText(match[2]);

        if (!title || title.length < 10 || seen.has(url)) continue;
        seen.add(url);

        const articleHtml = await fetchPage(url);
        const image = articleHtml ? extractOgImage(articleHtml) : null;

        if (image) {
            articles.push({ url, title, image, source });
        }
    }

    return articles;
}

async function scrapePokerfuse(html, source) {
    const articles = [];

    // Pokerfuse latest news
    const articleMatches = html.matchAll(/<a[^>]+href=["'](https?:\/\/pokerfuse\.com\/latest-news\/[^"']+)["'][^>]*>([^<]+)<\/a>/gi);
    const seen = new Set();

    for (const match of articleMatches) {
        if (articles.length >= CONFIG.MAX_ARTICLES_PER_SOURCE) break;

        const url = match[1];
        const title = cleanText(match[2]);

        if (!title || title.length < 10 || seen.has(url)) continue;
        seen.add(url);

        const articleHtml = await fetchPage(url);
        const image = articleHtml ? extractOgImage(articleHtml) : null;

        if (image) {
            articles.push({ url, title, image, source });
        }
    }

    return articles;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN SCRAPER
// ═══════════════════════════════════════════════════════════════════════════

async function scrapeSource(source) {
    console.log(`📰 Scraping: ${source.name}...`);

    const html = await fetchPage(source.scrapeUrl);
    if (!html) {
        console.log(`   ✗ Failed to fetch ${source.name}`);
        return [];
    }

    let articles = [];

    switch (source.box) {
        case 1: articles = await scrapePokerNews(html, source); break;
        case 2: articles = await scrapeMSPT(html, source); break;
        case 3: articles = await scrapeCardPlayer(html, source); break;
        case 4: articles = await scrapeWSOP(html, source); break;
        case 5: articles = await scrapePokerOrg(html, source); break;
        case 6: articles = await scrapePokerfuse(html, source); break;
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
    console.log('');

    const results = {
        sources: {},
        totalSaved: 0,
        archived: 0,
        errors: []
    };

    try {
        // Scrape each source
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

        // Archive old articles (older than 3 days)
        results.archived = await archiveOldArticles();
        console.log(`\n📦 Archived ${results.archived} old articles`);

        console.log('\n');
        console.log('═'.repeat(70));
        console.log('📊 SCRAPER SUMMARY');
        console.log('═'.repeat(70));
        for (const [name, stats] of Object.entries(results.sources)) {
            console.log(`${name}: ${stats.saved}/${stats.found} saved`);
        }
        console.log(`Total: ${results.totalSaved} new articles`);
        console.log(`⏰ Completed: ${new Date().toISOString()}`);
        console.log('═'.repeat(70));

        return res.status(200).json({
            success: true,
            timestamp: new Date().toISOString(),
            results
        });

    } catch (error) {
        console.error('❌ Scraper error:', error);
        return res.status(500).json({
            success: false,
            error: error.message,
            results
        });
    }
}
