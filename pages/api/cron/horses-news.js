/**
 * 🐴 HORSES NEWS CRON - Repost Real Poker News
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Horses repost actual poker news and stories from legitimate sources.
 * This complements video clips with real industry content.
 * 
 * SOURCES:
 * - PokerNews.com
 * - CardPlayer.com  
 * - Poker.org
 * - PokerListings.com
 * - WSOP.com
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import Parser from 'rss-parser';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Configure RSS Parser with realistic User-Agent to avoid 403 blocks
const rssParser = new Parser({
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*'
    },
    timeout: 10000
});

const CONFIG = {
    HORSES_PER_TRIGGER: 2,
    NEWS_COOLDOWN_HOURS: 4, // Don't repost same article within 4 hours
};

// ═══════════════════════════════════════════════════════════════════════════
// POKER NEWS RSS FEEDS - Updated with working endpoints
// ═══════════════════════════════════════════════════════════════════════════
const NEWS_SOURCES = [
    {
        name: 'PokerNews',
        rss: 'https://www.pokernews.com/rss.php?sub=news',
        icon: '🃏',
        categories: ['tournaments', 'strategy', 'industry', 'lifestyle']
    },
    {
        name: 'CardPlayer',
        rss: 'https://www.cardplayer.com/poker-news.rss',
        icon: '♠️',
        categories: ['tournaments', 'results', 'industry']
    },
    {
        name: 'PokerListings',
        rss: 'https://www.pokerlistings.com/feed',
        icon: '🎰',
        categories: ['news', 'strategy', 'lifestyle']
    },
    {
        name: 'Poker.org',
        rss: 'https://poker.org/feed/',
        icon: '♦️',
        categories: ['news', 'legal', 'industry']
    }
];

// ═══════════════════════════════════════════════════════════════════════════
// CAPTION TEMPLATES - How horses comment on news
// ═══════════════════════════════════════════════════════════════════════════
const CAPTION_TEMPLATES = {
    tournament: [
        "🏆 {source} this is huge",
        "congrats to the winner! 🎉",
        "that final table was insane apparently",
        "wish i was there tbh",
        "imagine shipping this 🤑"
    ],
    strategy: [
        "📚 good read here",
        "been thinking about this lately",
        "solid advice imo",
        "saving this for later study session",
        "this is actually +EV content"
    ],
    industry: [
        "interesting news 👀",
        "this affects all of us",
        "thoughts on this?",
        "big if true",
        "the poker world is always changing"
    ],
    lifestyle: [
        "poker life 🎲",
        "relatable content right here",
        "this is the life we chose lol",
        "not wrong 😂",
        "grinder moments"
    ],
    default: [
        "worth a read 📰",
        "check this out",
        "interesting stuff",
        "👀",
        "thoughts?"
    ]
};

// ═══════════════════════════════════════════════════════════════════════════
// FETCH NEWS FROM RSS
// ═══════════════════════════════════════════════════════════════════════════
async function fetchLatestNews() {
    const allArticles = [];

    for (const source of NEWS_SOURCES) {
        try {
            console.log(`📰 Fetching from ${source.name}...`);
            const feed = await rssParser.parseURL(source.rss);

            const articles = (feed.items || []).slice(0, 10).map(item => ({
                title: item.title,
                link: item.link,
                pubDate: item.pubDate,
                source: source.name,
                icon: source.icon,
                summary: item.contentSnippet || item.content?.slice(0, 200) || '',
                category: categorizeArticle(item.title, source.categories)
            }));

            allArticles.push(...articles);
            console.log(`   Found ${articles.length} articles`);
        } catch (error) {
            console.error(`   Error fetching ${source.name}: ${error.message}`);
        }
    }

    return allArticles;
}

function categorizeArticle(title, sourceCategories) {
    const titleLower = title.toLowerCase();

    if (titleLower.includes('wsop') || titleLower.includes('wpt') || titleLower.includes('tournament') ||
        titleLower.includes('wins') || titleLower.includes('champion') || titleLower.includes('final table')) {
        return 'tournament';
    }
    if (titleLower.includes('strategy') || titleLower.includes('how to') || titleLower.includes('tips') ||
        titleLower.includes('gto') || titleLower.includes('hand analysis')) {
        return 'strategy';
    }
    if (titleLower.includes('poker room') || titleLower.includes('casino') || titleLower.includes('online') ||
        titleLower.includes('law') || titleLower.includes('regulation') || titleLower.includes('company')) {
        return 'industry';
    }
    if (titleLower.includes('life') || titleLower.includes('story') || titleLower.includes('interview')) {
        return 'lifestyle';
    }

    return 'default';
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
// GENERATE HORSE COMMENTARY
// ═══════════════════════════════════════════════════════════════════════════
async function generateCommentary(horse, article) {
    // Get template for category
    const templates = CAPTION_TEMPLATES[article.category] || CAPTION_TEMPLATES.default;
    const template = templates[Math.floor(Math.random() * templates.length)];

    try {
        // Use GPT to make it more personalized
        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{
                role: 'system',
                content: `You are ${horse.name}, a ${horse.stakes || '2/5'} poker player. 
                         Style: ${horse.voice || 'casual'}. 
                         Write a VERY brief (1 sentence max) reaction to sharing this poker news article.
                         Reference style: "${template}"
                         Be authentic, not promotional. No hashtags.`
            }, {
                role: 'user',
                content: `Article title: "${article.title}" from ${article.source}`
            }],
            max_tokens: 50,
            temperature: 0.9
        });

        return response.choices[0].message.content;
    } catch {
        // Fallback to template
        return template.replace('{source}', article.source);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// POST NEWS ARTICLE
// ═══════════════════════════════════════════════════════════════════════════
async function postNewsArticle(horse, article) {
    console.log(`\n📰 ${horse.alias} sharing: ${article.title}`);

    // Generate commentary
    const commentary = await generateCommentary(horse, article);

    // Create post with link
    const postContent = `${commentary}\n\n${article.icon} ${article.title}\n🔗 ${article.link}`;

    const { data: post, error } = await supabase
        .from('social_posts')
        .insert({
            author_id: horse.profile_id,
            content: postContent,
            content_type: 'link', // Link type for news articles
            visibility: 'public',
            link_url: article.link,
            link_title: article.title,
            link_source: article.source
        })
        .select()
        .single();

    if (error) {
        console.error(`   Post error: ${error.message}`);
        return null;
    }

    console.log(`✅ Posted: ${post.id}`);
    return {
        post_id: post.id,
        article: article.title,
        source: article.source
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════
export default async function handler(req, res) {
    console.log('\n🐴 HORSES NEWS CRON - Reposting Real Poker News');
    console.log('═'.repeat(60));

    if (!SUPABASE_URL || !process.env.OPENAI_API_KEY) {
        return res.status(500).json({ error: 'Missing env vars' });
    }

    try {
        // Fetch latest news from all sources
        const articles = await fetchLatestNews();
        console.log(`\n📚 Total articles found: ${articles.length}`);

        if (articles.length === 0) {
            return res.status(200).json({ success: true, message: 'No news available', posted: 0 });
        }

        // Get random active horses
        const { data: horses } = await supabase
            .from('content_authors')
            .select('*')
            .eq('is_active', true)
            .not('profile_id', 'is', null)
            .limit(CONFIG.HORSES_PER_TRIGGER * 2);

        if (!horses?.length) {
            return res.status(200).json({ success: true, message: 'No horses available', posted: 0 });
        }

        const shuffledHorses = horses.sort(() => Math.random() - 0.5).slice(0, CONFIG.HORSES_PER_TRIGGER);
        const results = [];

        for (const horse of shuffledHorses) {
            // Find an article not recently shared
            let article = null;
            const shuffledArticles = [...articles].sort(() => Math.random() - 0.5);

            for (const a of shuffledArticles) {
                const recentlyShared = await isArticleRecentlyShared(a.link);
                if (!recentlyShared) {
                    article = a;
                    break;
                }
            }

            if (!article) {
                console.log(`   No fresh articles for ${horse.alias}`);
                continue;
            }

            // Random delay
            await new Promise(r => setTimeout(r, Math.random() * 3000 + 1000));

            const result = await postNewsArticle(horse, article);
            if (result) {
                results.push({ horse: horse.alias, ...result, success: true });
            }
        }

        console.log('\n' + '═'.repeat(60));
        console.log(`📊 Posted ${results.length} news articles`);

        return res.status(200).json({
            success: true,
            posted: results.length,
            results,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Cron error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
