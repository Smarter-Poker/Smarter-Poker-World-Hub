/**
 * 🐴 INDIVIDUAL HORSE CRON - Multi-Track Content Posting
 * 
 * Each horse gets their own cron trigger via /api/cron/horse/[horseIndex]
 * horseIndex = 0-99 (maps to the 100 horses)
 * 
 * CONTENT ROTATION: Based on UTC hour, each horse posts different content types
 * - Hours 0,4,8,12,16,20: Video clips
 * - Hours 1,5,9,13,17,21: Poker news
 * - Hours 2,6,10,14,18,22: Sports news
 * - Hours 3,7,11,15,19,23: Stories
 */

import { createClient } from '@supabase/supabase-js';
import Parser from 'rss-parser';
import { getGrokClient } from '../../../../src/lib/grokClient.js';
import { applyWritingStyle } from '../../../../src/content-engine/pipeline/HorseScheduler.js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const grok = getGrokClient();

/**
 * EMOJI LAW: 1 emoji allowed in only 1 out of 20 posts (5%)
 * Strip ALL emojis, then maybe add 1 back if lottery hits
 */
function enforceEmojiLaw(text, horseIndex, contentType) {
    // Strip ALL emojis
    const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2300}-\u{23FF}]|[\u{2B50}]|[\u{1F004}]|[\u{1F0CF}]|[\u{1F170}-\u{1F251}]/gu;
    let cleanText = text.replace(emojiRegex, '').replace(/\s+/g, ' ').trim();

    // 1 in 20 chance (5%) to add ONE emoji back
    const lottery = (horseIndex + Date.now()) % 20;
    if (lottery === 0) {
        const rareEmojis = ['👀', '💯', '🔥'];
        const emoji = rareEmojis[Math.floor(Math.random() * rareEmojis.length)];
        cleanText = cleanText + ' ' + emoji;
    }

    return cleanText;
}

// RSS Parser for news
const rssParser = new Parser({
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
    timeout: 8000
});

// NEWS SOURCES - 1000+ sources, assign 10 per horse
const POKER_NEWS_SOURCES = [
    { name: 'CardPlayer', rss: 'https://www.cardplayer.com/poker-news.rss', icon: '♠️' },
    { name: 'Upswing Poker', rss: 'https://upswingpoker.com/feed/', icon: '📈' },
];

const SPORTS_NEWS_SOURCES = [
    { name: 'ESPN', rss: 'https://www.espn.com/espn/rss/news', icon: '🏈' },
    { name: 'ESPN NBA', rss: 'https://www.espn.com/espn/rss/nba/news', icon: '🏀' },
    { name: 'ESPN NFL', rss: 'https://www.espn.com/espn/rss/nfl/news', icon: '🏈' },
    { name: 'CBS Sports', rss: 'https://www.cbssports.com/rss/headlines/', icon: '📺' },
    { name: 'Yahoo Sports', rss: 'https://sports.yahoo.com/rss/', icon: '🏆' },
    { name: 'Bleacher Report', rss: 'https://bleacherreport.com/articles/feed', icon: '🔥' },
];

/**
 * Get sources assigned to this horse based on profile_id hash
 */
async function getHorseSources(profileId) {
    const { data: pokerSources } = await supabase
        .from('poker_clips')
        .select('source')
        .limit(1000);

    const { data: sportsSources } = await supabase
        .from('sports_clips')
        .select('source')
        .limit(1000);

    const allSources = new Set();
    (pokerSources || []).forEach(s => s.source && allSources.add(s.source));
    (sportsSources || []).forEach(s => s.source && allSources.add(s.source));

    const sourceList = [...allSources];
    if (sourceList.length === 0) return [];

    const hash = profileId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const numSources = Math.max(10, Math.floor(sourceList.length / 100));
    const startIdx = (hash % sourceList.length);

    const assigned = [];
    for (let i = 0; i < numSources; i++) {
        const idx = (startIdx + i * 7) % sourceList.length;
        assigned.push(sourceList[idx]);
    }

    return assigned;
}

/**
 * Get assigned news sources for this horse
 */
function getHorseNewsSources(profileId, sourceList) {
    const hash = profileId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const numSources = Math.max(2, Math.floor(sourceList.length / 50));
    const startIdx = hash % sourceList.length;

    const assigned = [];
    for (let i = 0; i < numSources; i++) {
        const idx = (startIdx + i * 3) % sourceList.length;
        assigned.push(sourceList[idx]);
    }
    return assigned;
}

function convertToEmbedUrl(url) {
    if (!url) return url;
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return `https://www.youtube.com/embed/${match[1]}`;
    }
    return url;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTENT TYPE 1: VIDEO CLIPS
// ═══════════════════════════════════════════════════════════════════════════
async function postVideoClip(horse, assignedSources, horseIndex) {
    console.log(`   Posting VIDEO CLIP`);

    let clips = [];
    let clipSource = 'sports_clips';

    // Try sports_clips with source filter
    if (assignedSources.length > 0) {
        const { data: sportsClips } = await supabase
            .from('sports_clips')
            .select('*')
            .in('source', assignedSources)
            .limit(100);

        if (sportsClips?.length) {
            clips = sportsClips;
        }
    }

    // Fallback to any clips
    if (!clips.length) {
        const offset = Math.floor(Math.random() * 5000);
        const { data: anyClips } = await supabase
            .from('sports_clips')
            .select('*')
            .range(offset, offset + 100);
        if (anyClips?.length) {
            clips = anyClips;
        }
    }

    if (!clips.length) {
        return { success: false, error: 'No clips available' };
    }

    const clip = clips[Math.floor(Math.random() * clips.length)];

    // Generate caption
    let caption = '';
    try {
        const response = await grok.chat.completions.create({
            model: 'grok-3-mini',
            messages: [{
                role: 'user',
                content: `Write a very short, casual social media caption (under 100 chars) for this video: "${clip.title}". Be natural, use slang. No hashtags.`
            }],
            max_tokens: 50
        });
        caption = response.choices[0]?.message?.content?.trim() || clip.title;
    } catch (e) {
        caption = clip.title?.slice(0, 80) || 'Check this out';
    }

    caption = applyWritingStyle(caption, horse.profile_id);
    caption = enforceEmojiLaw(caption, horseIndex, 'video_clip');

    const { data: post, error: postError } = await supabase
        .from('social_posts')
        .insert({
            author_id: horse.profile_id,
            content: caption,
            content_type: 'video',
            media_urls: [convertToEmbedUrl(clip.source_url)],
            visibility: 'public',
            metadata: { clip_id: clip.id, clip_source: clip.source }
        })
        .select()
        .single();

    if (postError) return { success: false, error: postError.message };

    await supabase.from(clipSource).update({ last_used_at: new Date().toISOString() }).eq('id', clip.id);

    return { success: true, postId: post.id, type: 'video_clip', title: clip.title?.slice(0, 50) };
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTENT TYPE 2: POKER NEWS
// ═══════════════════════════════════════════════════════════════════════════
async function postPokerNews(horse, horseIndex) {
    console.log(`   Posting POKER NEWS`);

    const sources = getHorseNewsSources(horse.profile_id, POKER_NEWS_SOURCES);

    for (const source of sources) {
        try {
            const feed = await rssParser.parseURL(source.rss);
            const articles = (feed.items || []).slice(0, 5);

            if (articles.length > 0) {
                const article = articles[Math.floor(Math.random() * articles.length)];

                // Generate commentary
                let commentary = '';
                try {
                    const response = await grok.chat.completions.create({
                        model: 'grok-3-mini',
                        messages: [{
                            role: 'user',
                            content: `React to this poker news headline in 5-15 words. Be casual, like texting a friend. No questions or hashtags: "${article.title}"`
                        }],
                        max_tokens: 40
                    });
                    commentary = response.choices[0]?.message?.content?.trim() || 'Interesting stuff 👀';
                } catch (e) {
                    commentary = 'Worth checking out';
                }

                commentary = applyWritingStyle(commentary, horse.profile_id);
                commentary = enforceEmojiLaw(commentary, horseIndex, 'poker_news');
                const postContent = `${commentary}\n\n${article.link}`;

                const { data: post, error: postError } = await supabase
                    .from('social_posts')
                    .insert({
                        author_id: horse.profile_id,
                        content: postContent,
                        content_type: 'link',
                        visibility: 'public',
                        link_url: article.link,
                        link_title: article.title,
                        link_site_name: source.name
                    })
                    .select()
                    .single();

                if (postError) return { success: false, error: postError.message };
                return { success: true, postId: post.id, type: 'poker_news', title: article.title?.slice(0, 50) };
            }
        } catch (e) {
            console.log(`   RSS error for ${source.name}: ${e.message}`);
        }
    }

    return { success: false, error: 'No poker news available' };
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTENT TYPE 3: SPORTS NEWS
// ═══════════════════════════════════════════════════════════════════════════
async function postSportsNews(horse, horseIndex) {
    console.log(`   Posting SPORTS NEWS`);

    const sources = getHorseNewsSources(horse.profile_id, SPORTS_NEWS_SOURCES);

    for (const source of sources) {
        try {
            const feed = await rssParser.parseURL(source.rss);
            const articles = (feed.items || []).slice(0, 5);

            if (articles.length > 0) {
                const article = articles[Math.floor(Math.random() * articles.length)];

                let commentary = '';
                try {
                    const response = await grok.chat.completions.create({
                        model: 'grok-3-mini',
                        messages: [{
                            role: 'user',
                            content: `React to this sports news headline in 5-15 words. Be casual, like texting a friend. No questions or hashtags: "${article.title}"`
                        }],
                        max_tokens: 40
                    });
                    commentary = response.choices[0]?.message?.content?.trim() || 'Big news 🏆';
                } catch (e) {
                    commentary = 'Interesting';
                }

                commentary = applyWritingStyle(commentary, horse.profile_id);
                commentary = enforceEmojiLaw(commentary, horseIndex, 'sports_news');
                const postContent = `${commentary}\n\n${article.link}`;

                const { data: post, error: postError } = await supabase
                    .from('social_posts')
                    .insert({
                        author_id: horse.profile_id,
                        content: postContent,
                        content_type: 'link',
                        visibility: 'public',
                        link_url: article.link,
                        link_title: article.title,
                        link_site_name: source.name
                    })
                    .select()
                    .single();

                if (postError) return { success: false, error: postError.message };
                return { success: true, postId: post.id, type: 'sports_news', title: article.title?.slice(0, 50) };
            }
        } catch (e) {
            console.log(`   RSS error for ${source.name}: ${e.message}`);
        }
    }

    return { success: false, error: 'No sports news available' };
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTENT TYPE 4: STORIES (Text posts)
// ═══════════════════════════════════════════════════════════════════════════
async function postStory(horse, horseIndex) {
    console.log(`   Posting STORY`);

    // Pre-written story bank for 100% reliability
    const storyBank = [
        'Just had one of those sessions where everything clicked. Love when the cards cooperate for once',
        'Been working on my game lately and starting to see results. Small wins add up',
        'Sometimes you just gotta step away from the tables and reset. Mental game is everything',
        'That feeling when you make a perfect read and it pays off. Why we play this game',
        'Tough session today but learned a lot. Every hand is a lesson if you pay attention',
        'Late night grind hitting different tonight. Focus mode activated',
        'Poker is wild. One hand can change everything. Staying patient though',
        'Good run this week. Trying not to get too excited but the cards have been kind',
        'Taking a break from the tables to watch some sports. Need to decompress',
        'Reviewed some hands from yesterday. Always room to improve'
    ];

    let story = '';
    try {
        const storyTopics = [
            'poker session update', 'day at the tables', 'poker thought',
            'tournament recap', 'cash game observation', 'sports take'
        ];
        const topic = storyTopics[Math.floor(Math.random() * storyTopics.length)];

        const response = await grok.chat.completions.create({
            model: 'grok-3-mini',
            messages: [{
                role: 'user',
                content: `Write a short, casual social media post (20-50 words) about: ${topic}. Sound like a real person. No hashtags or questions.`
            }],
            max_tokens: 80
        });
        story = response.choices[0]?.message?.content?.trim() || '';
    } catch (e) {
        console.log(`   Grok failed, using story bank`);
    }

    // Use story bank if Grok failed or returned empty
    if (!story || story.length < 10) {
        story = storyBank[horseIndex % storyBank.length];
    }

    story = applyWritingStyle(story, horse.profile_id);
    story = enforceEmojiLaw(story, horseIndex, 'story');

    const { data: post, error: postError } = await supabase
        .from('social_posts')
        .insert({
            author_id: horse.profile_id,
            content: story,
            content_type: 'text',
            visibility: 'public'
        })
        .select()
        .single();

    if (postError) return { success: false, error: postError.message };
    return { success: true, postId: post.id, type: 'story', content: story.slice(0, 50) };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════
export default async function handler(req, res) {
    const { horseIndex } = req.query;
    const index = parseInt(horseIndex, 10);

    if (isNaN(index) || index < 0 || index > 99) {
        return res.status(400).json({ error: 'horseIndex must be 0-99' });
    }

    try {
        console.log(`\n🐴 INDIVIDUAL HORSE CRON: Horse #${index}`);

        // Get all active horses
        const { data: horses, error: horseError } = await supabase
            .from('content_authors')
            .select('*')
            .eq('is_active', true)
            .not('profile_id', 'is', null)
            .order('profile_id');

        if (horseError || !horses?.length) {
            return res.status(200).json({ success: false, error: 'No horses found' });
        }

        if (index >= horses.length) {
            return res.status(200).json({ success: true, message: `Horse index ${index} exceeds available`, posted: 0 });
        }

        const horse = horses[index];
        console.log(`   🎯 Processing: ${horse.name} (${horse.alias})`);

        // CONTENT TYPE ROTATION based on UTC hour
        const hour = new Date().getUTCHours();
        const contentTypes = ['video_clip', 'poker_news', 'sports_news', 'story'];
        const contentType = contentTypes[hour % 4];

        console.log(`   📅 Hour ${hour} → Content type: ${contentType}`);

        // Get assigned sources for clips
        const assignedSources = await getHorseSources(horse.profile_id);

        // Execute based on content type with FALLBACK CHAIN for 100% reliability
        let result;
        const fallbackOrder = [contentType, 'video_clip', 'story'];

        for (const tryType of fallbackOrder) {
            console.log(`   Trying content type: ${tryType}`);

            switch (tryType) {
                case 'video_clip':
                    result = await postVideoClip(horse, assignedSources, index);
                    break;
                case 'poker_news':
                    result = await postPokerNews(horse, index);
                    break;
                case 'sports_news':
                    result = await postSportsNews(horse, index);
                    break;
                case 'story':
                    result = await postStory(horse, index);
                    break;
                default:
                    result = await postVideoClip(horse, assignedSources, index);
            }

            if (result.success) {
                result.attemptedType = contentType;
                result.usedFallback = tryType !== contentType;
                break;
            }
            console.log(`   Type ${tryType} failed, trying fallback...`);
        }

        console.log(`   ${result.success ? '✅' : '❌'} Result:`, result);

        return res.status(200).json({
            success: result.success,
            horse: horse.name,
            horseIndex: index,
            contentType,
            ...result
        });

    } catch (error) {
        console.error('Individual horse cron error:', error);
        return res.status(500).json({
            success: false,
            error: error.message,
            horseIndex: index
        });
    }
}
