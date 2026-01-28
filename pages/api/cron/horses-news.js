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
import {
    applyWritingStyle,
    getHorseWritingStyle,
    getTimeOfDayEnergy,
    getStakesVoice,
    injectTypos,
    shouldHorsePostToday,
    getHorseDailyPostLimit,
    getContentAwareReaction,
    detectContentType,
    getRandomPostDelay
} from '../../../src/content-engine/pipeline/HorseScheduler.js';

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
// NEWS & CONTENT RSS FEEDS - Poker + Sports
// Horses are sports fans too! They post about games, highlights, and hot takes
// ═══════════════════════════════════════════════════════════════════════════
const NEWS_SOURCES = [
    // ─────────────────────────────────────────────────────────────────────────
    // POKER NEWS
    // ─────────────────────────────────────────────────────────────────────────
    {
        name: 'CardPlayer',
        rss: 'https://www.cardplayer.com/poker-news.rss',
        icon: '♠️',
        type: 'poker',
        categories: ['tournaments', 'results', 'industry']
    },
    {
        name: 'Upswing Poker',
        rss: 'https://upswingpoker.com/feed/',
        icon: '📈',
        type: 'poker',
        categories: ['strategy', 'tips', 'training']
    },
    // ─────────────────────────────────────────────────────────────────────────
    // SPORTS NEWS - Major outlets
    // ─────────────────────────────────────────────────────────────────────────
    {
        name: 'ESPN',
        rss: 'https://www.espn.com/espn/rss/news',
        icon: '🏈',
        type: 'sports',
        categories: ['football', 'basketball', 'baseball', 'general']
    },
    {
        name: 'ESPN NBA',
        rss: 'https://www.espn.com/espn/rss/nba/news',
        icon: '🏀',
        type: 'sports',
        categories: ['basketball', 'nba']
    },
    {
        name: 'ESPN NFL',
        rss: 'https://www.espn.com/espn/rss/nfl/news',
        icon: '🏈',
        type: 'sports',
        categories: ['football', 'nfl']
    },
    {
        name: 'CBS Sports',
        rss: 'https://www.cbssports.com/rss/headlines/',
        icon: '📺',
        type: 'sports',
        categories: ['general', 'highlights']
    },
    {
        name: 'Yahoo Sports',
        rss: 'https://sports.yahoo.com/rss/',
        icon: '🏆',
        type: 'sports',
        categories: ['general', 'trending']
    },
    {
        name: 'Bleacher Report',
        rss: 'https://bleacherreport.com/articles/feed',
        icon: '🔥',
        type: 'sports',
        categories: ['hot-takes', 'trending', 'reactions']
    }
];

// ═══════════════════════════════════════════════════════════════════════════
// CAPTION TEMPLATES - How horses comment on news (poker + sports)
// ═══════════════════════════════════════════════════════════════════════════
// Ultra-short templates - 1-3 words max for authenticity
const CAPTION_TEMPLATES = {
    // Poker templates
    tournament: ["🏆", "huge", "W", "congrats", "damn", "shipped", "gg"],
    strategy: ["📈", "valid", "true", "noted", "this", "facts", "📚"],
    industry: ["👀", "hm", "wild", "📰", "oh", "wow", "huh"],
    lifestyle: ["🎲", "lol", "mood", "facts", "real", "fr", "same"],
    // Sports templates
    football: ["🏈", "W", "lfg", "huge", "pain", "lets go", "ball"],
    basketball: ["🏀", "bucket", "sheesh", "cooking", "hooper", "icy", "wet"],
    baseball: ["⚾", "yak", "bomb", "mash", "crushed", "oppo", "tank"],
    sports_general: ["W", "pain", "lfg", "huge", "wild", "no way", "damn"],
    default: ["👀", "🔥", "📰", "W", "this", "yo", "damn"]
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
                type: source.type || 'general',
                summary: item.contentSnippet || item.content?.slice(0, 200) || '',
                category: categorizeArticle(item.title, source.categories, source.type)
            }));

            allArticles.push(...articles);
            console.log(`   Found ${articles.length} articles`);
        } catch (error) {
            console.error(`   Error fetching ${source.name}: ${error.message}`);
        }
    }

    return allArticles;
}

function categorizeArticle(title, sourceCategories, sourceType = 'general') {
    const titleLower = title.toLowerCase();

    // ─────────────────────────────────────────────────────────────────────────
    // SPORTS DETECTION
    // ─────────────────────────────────────────────────────────────────────────
    if (sourceType === 'sports') {
        if (titleLower.includes('nfl') || titleLower.includes('football') ||
            titleLower.includes('touchdown') || titleLower.includes('super bowl') ||
            titleLower.includes('quarterback') || titleLower.includes('cowboys') ||
            titleLower.includes('chiefs') || titleLower.includes('eagles')) {
            return 'football';
        }
        if (titleLower.includes('nba') || titleLower.includes('basketball') ||
            titleLower.includes('lakers') || titleLower.includes('celtics') ||
            titleLower.includes('lebron') || titleLower.includes('dunk') ||
            titleLower.includes('triple-double') || titleLower.includes('warriors')) {
            return 'basketball';
        }
        if (titleLower.includes('mlb') || titleLower.includes('baseball') ||
            titleLower.includes('home run') || titleLower.includes('yankees') ||
            titleLower.includes('dodgers') || titleLower.includes('world series')) {
            return 'baseball';
        }
        return 'sports_general';
    }

    // ─────────────────────────────────────────────────────────────────────────
    // POKER DETECTION
    // ─────────────────────────────────────────────────────────────────────────
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
// PER-HORSE COOLDOWN - Prevent same horse from posting consecutively  
// ═══════════════════════════════════════════════════════════════════════════
const HORSE_POST_COOLDOWN_HOURS = 4; // Same horse can't post within 4 hours

async function hasHorsePostedRecently(horseProfileId) {
    const cutoff = new Date(Date.now() - HORSE_POST_COOLDOWN_HOURS * 60 * 60 * 1000);

    const { data } = await supabase
        .from('social_posts')
        .select('id')
        .eq('author_id', horseProfileId)
        .gte('created_at', cutoff.toISOString())
        .limit(1);

    return data && data.length > 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// BANNED PHRASES - Patterns that make posts look robotic/samey
// ═══════════════════════════════════════════════════════════════════════════
const BANNED_PHRASES = [
    'thoughts on how',
    'been thinking about',
    'this might change',
    'what do you think',
    'this could impact',
    'interesting to see',
    'curious how this',
    'wondering how',
    'this is worth',
    'important news',
    'big news for',
    'this is huge',
    'can\'t wait to see',
    // Added from screenshot analysis
    'could impact future',
    'could change',
    'crushing it',
    'thoughts on this',
    'been thinking',
    'mastering',
    'crucial for',
    'maximizing',
    'check out',
    'look at this'
];

// ═══════════════════════════════════════════════════════════════════════════
// 100 UNIQUE VOICE PERSONALITIES - Every horse has a distinct voice
// Combines: base archetype (20) × modifier (5) = 100 unique personalities
// ═══════════════════════════════════════════════════════════════════════════

const BASE_ARCHETYPES = [
    { type: 'deadpan', style: 'Dry, minimal. Example: "huh" / "neat" / "ok"' },
    { type: 'hyped', style: 'ALL CAPS excitement. Example: "YOOO" / "LETS GO"' },
    { type: 'skeptic', style: 'Doubtful. Example: "doubt it" / "eh"' },
    { type: 'simp', style: 'Fan energy. Example: "goat" / "legend"' },
    { type: 'degen', style: 'Gambler brain. Example: "action" / "inject this"' },
    { type: 'analyst', style: 'Strategic. Example: "meta" / "EV+"' },
    { type: 'nostalgic', style: 'Old days. Example: "back when" / "classic"' },
    { type: 'zoomer', style: 'Gen-Z. Example: "no cap" / "fr fr"' },
    { type: 'boomer', style: 'Old school. Example: "heck yeah" / "good stuff"' },
    { type: 'lurker', style: 'Minimal. Example: "👀" / "📈" / "."' },
    { type: 'contrarian', style: 'Hot takes. Example: "overrated" / "nah"' },
    { type: 'supportive', style: 'Positive. Example: "W" / "gg"' },
    { type: 'sardonic', style: 'Sarcastic. Example: "wow shocking" / "who knew"' },
    { type: 'bro', style: 'Bro culture. Example: "sick" / "lets ride"' },
    { type: 'chill', style: 'Relaxed. Example: "nice" / "cool"' },
    { type: 'intense', style: 'Serious. Example: "massive" / "huge if true"' },
    { type: 'clown', style: 'Joking. Example: "lmaooo" / "dead"' },
    { type: 'doomer', style: 'Pessimist. Example: "rip" / "pain"' },
    { type: 'grinder', style: 'Work ethic. Example: "levels" / "respect"' },
    { type: 'minimalist', style: 'Ultra brief. Example: "." / "k" / "yep"' }
];

const VOICE_MODIFIERS = [
    { mod: 'emoji_sometimes', desc: 'Maybe 1 emoji in random spot' },
    { mod: 'no_emoji', desc: 'Zero emojis, text only' },
    { mod: 'lowercase', desc: 'all lowercase no caps ever' },
    { mod: 'shouty', desc: 'RANDOM caps for EMPHASIS' },
    { mod: 'terse', desc: 'Max 2 words. Period.' }
];

// Generate 100 unique voice combinations
function getVoiceForHorse(profileId) {
    // Hash the profile ID
    let hash = 0;
    const id = profileId || '';
    for (let i = 0; i < id.length; i++) {
        hash = ((hash << 5) - hash) + id.charCodeAt(i);
        hash = hash & hash;
    }
    hash = Math.abs(hash);

    // Get base archetype (20 options)
    const baseIndex = hash % BASE_ARCHETYPES.length;
    const base = BASE_ARCHETYPES[baseIndex];

    // Get modifier (5 options) - use different hash portion
    const modIndex = Math.floor(hash / 20) % VOICE_MODIFIERS.length;
    const modifier = VOICE_MODIFIERS[modIndex];

    // Create combined style instruction
    let style = `${base.style}`;

    if (modifier.mod === 'emoji_sometimes') {
        style += ' Maybe add 1 emoji (50% chance). If used, placement varies: start OR middle OR end.';
    } else if (modifier.mod === 'no_emoji') {
        style += ' NO emojis whatsoever.';
    } else if (modifier.mod === 'lowercase') {
        style += ' All lowercase, never capitalize.';
    } else if (modifier.mod === 'shouty') {
        style += ' Randomly CAPITALIZE for emphasis.';
    } else if (modifier.mod === 'terse') {
        style += ' MAX 2 words total.';
    }

    return {
        type: `${base.type}_${modifier.mod}`,
        style: style,
        base: base.type,
        modifier: modifier.mod
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// GENERATE HORSE COMMENTARY
// ═══════════════════════════════════════════════════════════════════════════
async function generateCommentary(horse, article, timeEnergy = null) {
    // Detect content type for content-aware reactions
    const contentType = detectContentType(article.title);
    const reaction = getContentAwareReaction(contentType, horse.profile_id);

    // Get template for category (used as fallback and inspiration)
    const templates = CAPTION_TEMPLATES[article.category] || CAPTION_TEMPLATES.default;
    const template = templates[Math.floor(Math.random() * templates.length)];

    // Get this horse's unique voice (100 unique combinations)
    const voice = getVoiceForHorse(horse.profile_id);
    console.log(`   🎭 ${horse.name} voice: ${voice.type}`);

    try {
        // Use GPT to make it more personalized with ULTRA-STRICT anti-repetition rules
        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{
                role: 'system',
                content: `You are ${horse.name}, reacting to a headline.

YOUR VOICE: ${voice.type.toUpperCase()}
${voice.style}

CONTENT TYPE: ${contentType} (react with ${reaction.energy} energy)

ULTRA-STRICT RULES (FOLLOW EXACTLY):
1. MAX 4 WORDS. 1-2 words is IDEAL. 3+ words = FAIL.
2. BANNED STARTERS: "Thoughts", "Been", "This", "Interesting", "What", "Check", "Look", "Could", "How", "Wondering"
3. BANNED: questions, hashtags, colons, quotes, em-dashes, "!", formal language
4. SOUND LIKE TEXTING not a news anchor.

GOOD EXAMPLES: "yep" / "fire" / "👀" / "W" / "damn" / "sheesh" / "lol" / "wild"
BAD EXAMPLES: "Thoughts on how..." / "Been thinking..." / "This could impact..." / Any sentence over 4 words

Fallback: "${template}"`
            }, {
                role: 'user',
                content: `React: "${article.title}"`
            }],
            max_tokens: 20,
            temperature: 0.85 // Balanced for rule adherence + variety
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

        // Apply typos based on time-of-day energy (late night = more typos)
        if (timeEnergy) {
            commentary = injectTypos(commentary, timeEnergy.typoChance);
        }

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
async function postNewsArticle(horse, article, timeEnergy = null) {
    console.log(`\n📰 ${horse.alias} sharing: ${article.title}`);
    if (timeEnergy) console.log(`   🌙 Posting in ${timeEnergy.mode} mode`);

    // Generate commentary (will use time energy for typo injection)
    const commentary = await generateCommentary(horse, article, timeEnergy);

    // Create post with link - just the commentary, link metadata handles the rest
    const postContent = commentary;

    const { data: post, error } = await supabase
        .from('social_posts')
        .insert({
            author_id: horse.profile_id,
            content: postContent,
            content_type: 'link', // Link type for news articles
            visibility: 'public',
            // Link metadata for proper preview card rendering
            link_url: article.link,
            link_title: article.title,
            link_description: article.summary || null,
            link_site_name: article.source,
            link_image: null // Could fetch article image later
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

        // Get current time-of-day energy
        const timeEnergy = getTimeOfDayEnergy();
        console.log(`   ⏰ Time-of-day mode: ${timeEnergy.mode}`);

        for (const horse of shuffledHorses) {
            // Check if this horse should post today (activity variance)
            if (!shouldHorsePostToday(horse.profile_id)) {
                console.log(`   💤 ${horse.alias} is having a quiet day`);
                continue;
            }

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

            // Random delay between 1-4 seconds for natural staggering
            const delay = 1000 + Math.random() * 3000;
            await new Promise(r => setTimeout(r, delay));

            const result = await postNewsArticle(horse, article, timeEnergy);
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
