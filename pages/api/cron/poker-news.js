/**
 * 📰 POKER NEWS AGGREGATOR - Automated Hourly News Posting
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Automatically scrapes and posts poker news from major sources every hour
 * Posts as the official Smarter.Poker system account
 * 
 * SOURCES:
 * - PokerNews.com
 * - CardPlayer.com  
 * - PokerListings.com
 * - Poker.org
 * 
 * SCHEDULE: Runs hourly via Vercel cron
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import Parser from 'rss-parser';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const rssParser = new Parser();

const SYSTEM_UUID = '00000000-0000-0000-0000-000000000001';

const CONFIG = {
    NEWS_COOLDOWN_HOURS: 6, // Don't repost same article within 6 hours
    MAX_SUMMARY_LENGTH: 200
};

// ═══════════════════════════════════════════════════════════════════════════
// POKER NEWS RSS FEEDS
// ═══════════════════════════════════════════════════════════════════════════
const NEWS_SOURCES = [
    {
        name: 'PokerNews',
        rss: 'https://www.pokernews.com/news.rss',
        icon: '🃏',
        priority: 1
    },
    {
        name: 'CardPlayer',
        rss: 'https://www.cardplayer.com/poker-news/rss',
        icon: '♠️',
        priority: 2
    },
    {
        name: 'PokerListings',
        rss: 'https://www.pokerlistings.com/feed',
        icon: '🎰',
        priority: 3
    },
    {
        name: 'Poker.org',
        rss: 'https://www.poker.org/feed/',
        icon: '♦️',
        priority: 4
    }
];

// ═══════════════════════════════════════════════════════════════════════════
// FETCH NEWS FROM RSS
// ═══════════════════════════════════════════════════════════════════════════
async function fetchLatestNews() {
    const allArticles = [];

    for (const source of NEWS_SOURCES) {
        try {
            console.log(`📰 Fetching from ${source.name}...`);
            const feed = await rssParser.parseURL(source.rss);

            const articles = (feed.items || []).slice(0, 5).map(item => {
                // Extract image from various RSS fields
                let imageUrl = null;

                // Try enclosure (common in RSS feeds)
                if (item.enclosure?.url) {
                    imageUrl = item.enclosure.url;
                }
                // Try media:content (Media RSS)
                else if (item['media:content']?.$?.url) {
                    imageUrl = item['media:content'].$.url;
                }
                // Try media:thumbnail
                else if (item['media:thumbnail']?.$?.url) {
                    imageUrl = item['media:thumbnail'].$.url;
                }
                // Try content:encoded for embedded images
                else if (item['content:encoded']) {
                    const imgMatch = item['content:encoded'].match(/<img[^>]+src="([^">]+)"/);
                    if (imgMatch) imageUrl = imgMatch[1];
                }
                // Try description for embedded images
                else if (item.description) {
                    const imgMatch = item.description.match(/<img[^>]+src="([^">]+)"/);
                    if (imgMatch) imageUrl = imgMatch[1];
                }

                return {
                    title: item.title,
                    link: item.link,
                    pubDate: new Date(item.pubDate || item.isoDate),
                    source: source.name,
                    icon: source.icon,
                    priority: source.priority,
                    summary: (item.contentSnippet || item.content || '').slice(0, CONFIG.MAX_SUMMARY_LENGTH),
                    category: categorizeArticle(item.title),
                    imageUrl: imageUrl
                };
            });

            allArticles.push(...articles);
            console.log(`   Found ${articles.length} recent articles`);
        } catch (error) {
            console.error(`   Error fetching ${source.name}: ${error.message}`);
        }
    }

    // Sort by priority and date
    return allArticles.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return b.pubDate - a.pubDate;
    });
}

function categorizeArticle(title) {
    const titleLower = title.toLowerCase();

    if (titleLower.includes('wsop') || titleLower.includes('wpt') || titleLower.includes('tournament')) {
        return 'tournament';
    }
    if (titleLower.includes('strategy') || titleLower.includes('how to') || titleLower.includes('tips')) {
        return 'strategy';
    }
    if (titleLower.includes('poker room') || titleLower.includes('casino') || titleLower.includes('online')) {
        return 'industry';
    }
    return 'news';
}

// ═══════════════════════════════════════════════════════════════════════════
// CHECK IF ARTICLE ALREADY SHARED
// ═══════════════════════════════════════════════════════════════════════════
async function isArticleRecentlyShared(link) {
    const cutoff = new Date(Date.now() - CONFIG.NEWS_COOLDOWN_HOURS * 60 * 60 * 1000);

    const { data } = await supabase
        .from('social_posts')
        .select('id')
        .ilike('content', `%${link}%`)
        .gte('created_at', cutoff.toISOString())
        .limit(1);

    return data && data.length > 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// POST NEWS ARTICLE
// ═══════════════════════════════════════════════════════════════════════════
async function postNewsArticle(article) {
    console.log(`\n📰 Posting: ${article.title}`);

    // Format post content with in-app viewer link
    const emoji = getCategoryEmoji(article.category);
    const viewerUrl = `/hub/article?url=${encodeURIComponent(article.link)}&source=${encodeURIComponent(article.source)}`;

    const postContent = `${emoji} **${article.title}**

${article.summary}

📖 Read full article`;

    try {
        // Prepare media URLs array with article image
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
                    viewer_url: viewerUrl
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
                        viewer_url: viewerUrl
                    },
                    created_at: new Date().toISOString()
                })
                .select()
                .single();

            if (directError) {
                throw directError;
            }

            console.log(`✅ Posted (direct): ${directPost.id}`);
            console.log(`   Image: ${article.imageUrl ? 'Yes' : 'No'}`);
            console.log(`   Viewer: ${viewerUrl}`);
            return { post_id: directPost.id, method: 'direct', has_image: !!article.imageUrl };
        }

        console.log(`✅ Posted (RPC): ${post?.id || 'success'}`);
        console.log(`   Image: ${article.imageUrl ? 'Yes' : 'No'}`);
        console.log(`   Viewer: ${viewerUrl}`);
        return { post_id: post?.id || 'created', method: 'rpc', has_image: !!article.imageUrl };

    } catch (error) {
        console.error(`   Post error: ${error.message}`);
        return null;
    }
}

function getCategoryEmoji(category) {
    const emojis = {
        tournament: '🏆',
        strategy: '📚',
        industry: '💼',
        news: '📰'
    };
    return emojis[category] || '📰';
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════
export default async function handler(req, res) {
    console.log('\n📰 POKER NEWS AGGREGATOR - Hourly News Update');
    console.log('═'.repeat(60));

    if (!SUPABASE_URL) {
        return res.status(500).json({ error: 'Missing Supabase URL' });
    }

    try {
        // Fetch latest news from all sources
        const articles = await fetchLatestNews();
        console.log(`\n📚 Total articles found: ${articles.length}`);

        if (articles.length === 0) {
            return res.status(200).json({
                success: true,
                message: 'No news available',
                posted: 0
            });
        }

        // Find a fresh article to post
        let posted = null;
        for (const article of articles) {
            const recentlyShared = await isArticleRecentlyShared(article.link);

            if (!recentlyShared) {
                posted = await postNewsArticle(article);
                if (posted) {
                    break; // Post one article per hour
                }
            }
        }

        if (!posted) {
            console.log('⚠️  All articles recently shared, skipping this hour');
            return res.status(200).json({
                success: true,
                message: 'All articles recently shared',
                posted: 0
            });
        }

        console.log('\n' + '═'.repeat(60));
        console.log(`📊 Successfully posted 1 news article`);

        return res.status(200).json({
            success: true,
            posted: 1,
            post_id: posted.post_id,
            method: posted.method,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Cron error:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
}
