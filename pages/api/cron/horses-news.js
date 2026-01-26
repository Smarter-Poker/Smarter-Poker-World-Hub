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
import { applyWritingStyle, getHorseWritingStyle } from '../../../src/content-engine/pipeline/HorseScheduler.js';

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
// POKER NEWS RSS FEEDS - Updated with working endpoints (Jan 2026)
// Note: PokerNews, PokerListings, Poker.org, WPT feeds are broken/returning errors
// ═══════════════════════════════════════════════════════════════════════════
const NEWS_SOURCES = [
    {
        name: 'CardPlayer',
        rss: 'https://www.cardplayer.com/poker-news.rss',
        icon: '♠️',
        categories: ['tournaments', 'results', 'industry']
    },
    {
        name: 'Upswing Poker',
        rss: 'https://upswingpoker.com/feed/',
        icon: '📈',
        categories: ['strategy', 'tips', 'training']
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
// BANNED PHRASES - Patterns that make posts look robotic/samey
// ═══════════════════════════════════════════════════════════════════════════
const BANNED_PHRASES = [
    'thoughts on how',
    'been thinking about this',
    'this might change',
    'what do you think about',
    'this could impact',
    'interesting to see how',
    'curious how this will',
    'wondering how this',
    'this is worth noting',
    'important news for',
    'big news for',
    'this is huge for',
    'can\'t wait to see how'
];

// ═══════════════════════════════════════════════════════════════════════════
// VOICE ARCHETYPES - Extremely different personality types
// ═══════════════════════════════════════════════════════════════════════════
const VOICE_ARCHETYPES = [
    { type: 'deadpan', style: 'Respond with dry, minimal words. No excitement. Example: "huh. okay." or "neat"' },
    { type: 'hyped', style: 'EXTREMELY excited caps energy. Example: "YOOO THIS IS FIRE" or "BRO FINALLY"' },
    { type: 'skeptic', style: 'Doubt and cynicism. Example: "we\'ll see about that" or "doubt it tbh"' },
    { type: 'simp', style: 'Fan behavior. Pick a specific player to hype. Example: "my GOAT never misses" or "legend status"' },
    { type: 'degen', style: 'Gambler brain. Make it about action. Example: "more action please" or "inject this into my veins"' },
    { type: 'analyst', style: 'Strategic lens. Example: "interesting spot" or "meta shift incoming"' },
    { type: 'nostalgic', style: 'Reference the old days. Example: "reminds me of 2010" or "back in my day..."' },
    { type: 'zoomer', style: 'Gen-Z speak. Example: "no cap fr fr" or "this hits different" or "lowkey based"' },
    { type: 'boomer', style: 'Old school vibe. Example: "now we\'re talking" or "thats what im talking about"' },
    { type: 'lurker', style: 'Barely engaged. Just emojis or single words. Example: "👀" or "📈" or "yep"' },
    { type: 'contrarian', style: 'Disagree or offer hot take. Example: "actually overrated" or "unpopular opinion but..."' },
    { type: 'supportive', style: 'Pure positivity. Example: "love to see it" or "good for them" or "W"' }
];

// ═══════════════════════════════════════════════════════════════════════════
// GENERATE HORSE COMMENTARY
// ═══════════════════════════════════════════════════════════════════════════
async function generateCommentary(horse, article) {
    // Get template for category (used as fallback and inspiration)
    const templates = CAPTION_TEMPLATES[article.category] || CAPTION_TEMPLATES.default;
    const template = templates[Math.floor(Math.random() * templates.length)];

    // Assign this horse a consistent voice archetype based on their ID hash
    let hash = 0;
    const horseId = horse.profile_id || horse.id || '';
    for (let i = 0; i < horseId.length; i++) {
        hash = ((hash << 5) - hash) + horseId.charCodeAt(i);
        hash = hash & hash;
    }
    const archetypeIndex = Math.abs(hash) % VOICE_ARCHETYPES.length;
    const archetype = VOICE_ARCHETYPES[archetypeIndex];

    try {
        // Use GPT to make it more personalized with STRICT anti-repetition rules
        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{
                role: 'system',
                content: `You are ${horse.name}, a poker player sharing news.

YOUR VOICE: ${archetype.type.toUpperCase()}
${archetype.style}

STRICT RULES:
1. MAX 8 words. Shorter is better. 1-3 words ideal.
2. NEVER start with: "Thoughts on", "Been thinking", "Interesting", "This is", "What do you"
3. NEVER ask questions.
4. NEVER use hashtags.
5. NEVER use quotation marks.
6. Sound like a real person texting, not a news anchor.
7. Match the ${archetype.type} vibe EXACTLY.

Fallback style if stuck: "${template}"`
            }, {
                role: 'user',
                content: `React to: "${article.title}"`
            }],
            max_tokens: 30,
            temperature: 1.0 // High randomness for variety
        });

        let commentary = response.choices[0].message.content || template;

        // Remove any quotes GPT might have added
        commentary = commentary.replace(/^["']|["']$/g, '').trim();

        // Check for banned phrases and use fallback if detected
        const lowerCommentary = commentary.toLowerCase();
        for (const banned of BANNED_PHRASES) {
            if (lowerCommentary.includes(banned)) {
                console.log(`   ⚠️ Banned phrase detected: "${banned}" - using template fallback`);
                commentary = template.replace('{source}', article.source);
                break;
            }
        }

        // Apply the horse's unique writing style (caps, emoji, fillers, punctuation)
        commentary = applyWritingStyle(commentary, horse.profile_id);

        return commentary;
    } catch (err) {
        console.error(`   GPT error: ${err.message}`);
        // Fallback to template with writing style applied
        const fallback = template.replace('{source}', article.source);
        return applyWritingStyle(fallback, horse.profile_id);
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
            visibility: 'public'
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
