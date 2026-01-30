/**
 * INDIVIDUAL HORSE CRON - UNIQUE VOICE + MEDIA REQUIRED
 * 
 * RULES:
 * 1. EVERY post must have VIDEO or LINK attached (no text-only)
 * 2. 100 unique voice patterns - NO repetition
 * 3. NO emojis (except 1 in 20 posts)
 * 4. BANNED phrases: yo, check out, pretty cool, wild stuff, etc.
 * 
 * Content types: video_clip OR news_link ONLY
 */

import { createClient } from '@supabase/supabase-js';
import Parser from 'rss-parser';
import { getGrokClient } from '../../../../src/lib/grokClient.js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const grok = getGrokClient();

// BANNED PHRASES - never use these
const BANNED_PHRASES = [
    'yo,', 'yo ', 'check out', 'check this', 'pretty cool', 'wild stuff', 'bruh',
    'gotta check', 'look at this', 'cool stuff', 'awesome stuff', 'so cool',
    'this is fire', 'fire content', 'bro ', 'dude ', 'literally', 'honestly',
    'thoughts on', 'been thinking', 'interesting', 'crazy'
];

// 100 UNIQUE VOICE PATTERNS - each horse gets ONE pattern
const VOICE_PATTERNS = [
    { opener: '', style: 'direct and matter-of-fact', example: 'Negreanu giving away WSOP seat' },
    { opener: '', style: 'observational', example: 'Another big pot at high stakes tables' },
    { opener: '', style: 'analytical', example: 'Interesting line here from the chip leader' },
    { opener: '', style: 'understated', example: 'Solid run so far this week' },
    { opener: '', style: 'dry wit', example: 'Called it. Again.' },
    { opener: '', style: 'veteran perspective', example: 'Old school move paying off here' },
    { opener: 'Not surprised - ', style: 'knowing', example: 'Not surprised - this was expected' },
    { opener: '', style: 'brief reaction', example: 'Makes sense given the stack sizes' },
    { opener: '', style: 'casual observation', example: 'Spot on with that read' },
    { opener: '', style: 'appreciative', example: 'Good to see this finally happening' },
    { opener: 'Well - ', style: 'thoughtful', example: 'Well - that changes things' },
    { opener: '', style: 'straightforward', example: 'Standard play in this spot' },
    { opener: '', style: 'terse', example: 'Big if true' },
    { opener: '', style: 'measured', example: 'Worth following this development' },
    { opener: '', style: 'laconic', example: 'About time' },
    { opener: '', style: 'grounded', example: 'Results speak for themselves' },
    { opener: 'Finally - ', style: 'relieved', example: 'Finally - some good news' },
    { opener: '', style: 'pragmatic', example: 'Makes you think about the meta' },
    { opener: '', style: 'reserved', example: 'Noted' },
    { opener: '', style: 'wry', example: 'Of course this would happen today' },
    { opener: 'Hmm - ', style: 'contemplative', example: 'Hmm - not what I expected' },
    { opener: '', style: 'stoic', example: 'Part of the game' },
    { opener: '', style: 'seasoned', example: 'Seen this pattern before' },
    { opener: '', style: 'level-headed', example: 'Keeping perspective on this one' },
    { opener: '', style: 'crisp', example: 'Clean execution' },
    { opener: '', style: 'subtle approval', example: 'Respect the approach' },
    { opener: '', style: 'neutral observation', example: 'Developing story here' },
    { opener: '', style: 'patient', example: 'Waiting to see how this plays out' },
    { opener: '', style: 'sardonic', example: 'Sure, why not' },
    { opener: '', style: 'composed', example: 'Handled it well' },
    { opener: 'Look - ', style: 'frank', example: 'Look - it is what it is' },
    { opener: '', style: 'watchful', example: 'Eyes on this one' },
    { opener: '', style: 'accepting', example: 'Fair enough' },
    { opener: '', style: 'knowing nod', example: 'Expected nothing less' },
    { opener: '', style: 'deadpan', example: 'And there it is' },
    { opener: '', style: 'succinct', example: 'Done deal' },
    { opener: '', style: 'calm assessment', example: 'Reasonable outcome' },
    { opener: '', style: 'sparse', example: 'Says it all' },
    { opener: 'Alright - ', style: 'conceding', example: 'Alright - fair point' },
    { opener: '', style: 'minimal', example: 'Speaks for itself' },
    { opener: '', style: 'quiet confidence', example: 'Called this weeks ago' },
    { opener: '', style: 'even-keeled', example: 'On pace as expected' },
    { opener: '', style: 'restrained', example: 'Keeping tabs on this' },
    { opener: '', style: 'muted', example: 'Tracking' },
    { opener: '', style: 'guarded optimism', example: 'Early days but promising' },
    { opener: 'So - ', style: 'transitional', example: 'So - here we are' },
    { opener: '', style: 'practical', example: 'Works for the situation' },
    { opener: '', style: 'sober', example: 'Reality check incoming' },
    { opener: '', style: 'reflective', example: 'Something to think about' },
    { opener: '', style: 'gruff', example: 'Get it done' },
    { opener: '', style: 'no-nonsense', example: 'Moving on' },
    { opener: '', style: 'unflappable', example: 'Business as usual' },
    { opener: '', style: 'concise approval', example: 'Good call' },
    { opener: '', style: 'temperate', example: 'Measured response here' },
    { opener: '', style: 'realist', example: 'That tracks' },
    { opener: 'Right - ', style: 'confirmatory', example: 'Right - makes sense now' },
    { opener: '', style: 'economical', example: 'Point taken' },
    { opener: '', style: 'collected', example: 'Staying the course' },
    { opener: '', style: 'veteran tone', example: 'Been here before' },
    { opener: '', style: 'detached', example: 'Interesting development' },
    { opener: '', style: 'pithy', example: 'Tough spot, handled it' },
    { opener: '', style: 'grave', example: 'This matters' },
    { opener: '', style: 'stark', example: 'No other way to read this' },
    { opener: 'Okay - ', style: 'accepting reality', example: 'Okay - adjusting expectations' },
    { opener: '', style: 'plain-spoken', example: 'It happened' },
    { opener: '', style: 'unfazed', example: 'Next hand' },
    { opener: '', style: 'controlled', example: 'Managed well' },
    { opener: '', style: 'spare', example: 'On the money' },
    { opener: '', style: 'low-key', example: 'Solid' },
    { opener: '', style: 'flat', example: 'There you go' },
    { opener: '', style: 'unadorned', example: 'Done' },
    { opener: '', style: 'blunt', example: 'True' },
    { opener: '', style: 'impassive', example: 'Expected' },
    { opener: '', style: 'curt', example: 'Noted this' },
    { opener: '', style: 'brief acknowledgment', example: 'Acknowledged' },
    { opener: 'Figured - ', style: 'knowing', example: 'Figured this would happen' },
    { opener: '', style: 'mild', example: 'Fair play' },
    { opener: '', style: 'steady', example: 'Holding the line' },
    { opener: '', style: 'unhurried', example: 'All in due time' },
    { opener: '', style: 'lean', example: 'Straight to the point' },
    { opener: '', style: 'grounded take', example: 'Feet on the ground here' },
    { opener: '', style: 'quiet observation', example: 'Worth noting' },
    { opener: '', style: 'seasoned calm', example: 'Another day at the tables' },
    { opener: '', style: 'focused', example: 'Eyes on the prize' },
    { opener: 'Yeah - ', style: 'casual agreement', example: 'Yeah - that adds up' },
    { opener: '', style: 'subdued', example: 'Quietly impressive' },
    { opener: '', style: 'hard-nosed', example: 'Numbers dont lie' },
    { opener: '', style: 'stripped down', example: 'Bare facts' },
    { opener: '', style: 'taciturn', example: 'Says enough' },
    { opener: '', style: 'workmanlike', example: 'Job done' },
    { opener: '', style: 'unsentimental', example: 'Moving forward' },
    { opener: '', style: 'taut', example: 'Tight spot' },
    { opener: '', style: 'clipped', example: 'Clear' },
    { opener: '', style: 'bare', example: 'As stated' },
    { opener: '', style: 'unembellished', example: 'Plain and simple' },
    { opener: '', style: 'crisp delivery', example: 'Sharp move' },
    { opener: '', style: 'frank take', example: 'Straight talk' },
    { opener: '', style: 'compact', example: 'In brief' },
    { opener: '', style: 'understated pride', example: 'Quietly getting it done' },
    { opener: '', style: 'reserved approval', example: 'Cant argue with results' }
];

// Get this horse's unique voice pattern
function getHorseVoice(horseIndex) {
    return VOICE_PATTERNS[horseIndex % VOICE_PATTERNS.length];
}

// Strip emojis and clean text
function cleanCaption(text, horseIndex) {
    // Strip ALL emojis
    const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2300}-\u{23FF}]|[\u{2B50}]|[\u{1F004}]|[\u{1F0CF}]|[\u{1F170}-\u{1F251}]/gu;
    let clean = text.replace(emojiRegex, '').replace(/\s+/g, ' ').trim();

    // Remove banned phrases
    const lower = clean.toLowerCase();
    for (const banned of BANNED_PHRASES) {
        if (lower.includes(banned)) {
            clean = clean.replace(new RegExp(banned, 'gi'), '').trim();
        }
    }

    // 1 in 20 chance for ONE emoji
    if ((horseIndex + Date.now()) % 20 === 0) {
        clean = clean + ' ';
    }

    return clean.replace(/\s+/g, ' ').trim();
}

const rssParser = new Parser({
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    timeout: 8000
});

const POKER_NEWS_SOURCES = [
    { name: 'CardPlayer', rss: 'https://www.cardplayer.com/poker-news.rss' },
    { name: 'Upswing Poker', rss: 'https://upswingpoker.com/feed/' },
];

const SPORTS_NEWS_SOURCES = [
    { name: 'ESPN', rss: 'https://www.espn.com/espn/rss/news' },
    { name: 'ESPN NBA', rss: 'https://www.espn.com/espn/rss/nba/news' },
    { name: 'ESPN NFL', rss: 'https://www.espn.com/espn/rss/nfl/news' },
    { name: 'CBS Sports', rss: 'https://www.cbssports.com/rss/headlines/' },
];

async function getHorseSources(profileId) {
    const { data: sportsSources } = await supabase.from('sports_clips').select('source').limit(1000);
    const allSources = new Set();
    (sportsSources || []).forEach(s => s.source && allSources.add(s.source));
    const sourceList = [...allSources];
    if (sourceList.length === 0) return [];
    const hash = profileId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const numSources = Math.max(10, Math.floor(sourceList.length / 100));
    const assigned = [];
    for (let i = 0; i < numSources; i++) {
        assigned.push(sourceList[(hash + i * 7) % sourceList.length]);
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

// POST VIDEO CLIP (with unique voice)
async function postVideoClip(horse, assignedSources, horseIndex) {
    console.log(`   Posting VIDEO CLIP for horse #${horseIndex}`);

    let clips = [];
    if (assignedSources.length > 0) {
        const { data } = await supabase.from('sports_clips').select('*').in('source', assignedSources).limit(100);
        if (data?.length) clips = data;
    }
    if (!clips.length) {
        const offset = Math.floor(Math.random() * 5000);
        const { data } = await supabase.from('sports_clips').select('*').range(offset, offset + 100);
        if (data?.length) clips = data;
    }
    if (!clips.length) return { success: false, error: 'No clips' };

    const clip = clips[Math.floor(Math.random() * clips.length)];
    const voice = getHorseVoice(horseIndex);

    let caption = '';
    try {
        const response = await grok.chat.completions.create({
            model: 'grok-3-mini',
            messages: [{
                role: 'user',
                content: `Write a ${voice.style} reaction to this video title in 3-10 words. NO emojis. NO "yo", "check out", "pretty cool". Just ${voice.style}. Example: "${voice.example}". Title: "${clip.title}"`
            }],
            max_tokens: 30
        });
        caption = response.choices[0]?.message?.content?.trim() || clip.title?.slice(0, 50);
    } catch (e) {
        caption = clip.title?.slice(0, 50) || 'Worth watching';
    }

    caption = voice.opener + cleanCaption(caption, horseIndex);

    const { data: post, error } = await supabase.from('social_posts').insert({
        author_id: horse.profile_id,
        content: caption,
        content_type: 'video',
        media_urls: [convertToEmbedUrl(clip.source_url)],
        visibility: 'public'
    }).select().single();

    if (error) return { success: false, error: error.message };
    return { success: true, postId: post.id, type: 'video_clip', caption: caption.slice(0, 50) };
}

// POST NEWS LINK (with unique voice)
async function postNewsLink(horse, horseIndex, newsType) {
    console.log(`   Posting ${newsType} NEWS for horse #${horseIndex}`);

    const sources = newsType === 'poker' ? POKER_NEWS_SOURCES : SPORTS_NEWS_SOURCES;
    const sourceIndex = horseIndex % sources.length;
    const source = sources[sourceIndex];

    try {
        const feed = await rssParser.parseURL(source.rss);
        const articles = (feed.items || []).slice(0, 10);
        if (!articles.length) return { success: false, error: 'No articles' };

        const article = articles[Math.floor(Math.random() * articles.length)];
        const voice = getHorseVoice(horseIndex);

        let caption = '';
        try {
            const response = await grok.chat.completions.create({
                model: 'grok-3-mini',
                messages: [{
                    role: 'user',
                    content: `Write a ${voice.style} reaction to this headline in 3-10 words. NO emojis. NO "yo", "check out", "pretty cool". Just ${voice.style}. Example: "${voice.example}". Headline: "${article.title}"`
                }],
                max_tokens: 30
            });
            caption = response.choices[0]?.message?.content?.trim() || article.title?.slice(0, 40);
        } catch (e) {
            caption = article.title?.slice(0, 40) || 'Worth reading';
        }

        caption = voice.opener + cleanCaption(caption, horseIndex);
        const postContent = `${caption}\n\n${article.link}`;

        const { data: post, error } = await supabase.from('social_posts').insert({
            author_id: horse.profile_id,
            content: postContent,
            content_type: 'link',
            visibility: 'public',
            link_url: article.link,
            link_title: article.title,
            link_site_name: source.name
        }).select().single();

        if (error) return { success: false, error: error.message };
        return { success: true, postId: post.id, type: newsType + '_news', title: article.title?.slice(0, 40) };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// MAIN HANDLER - VIDEO or NEWS LINK only (no text-only posts)
export default async function handler(req, res) {
    const { horseIndex } = req.query;
    const index = parseInt(horseIndex, 10);

    if (isNaN(index) || index < 0 || index > 99) {
        return res.status(400).json({ error: 'horseIndex must be 0-99' });
    }

    try {
        console.log(`\nHORSE CRON #${index}`);

        const { data: horses } = await supabase
            .from('content_authors')
            .select('*')
            .eq('is_active', true)
            .not('profile_id', 'is', null)
            .order('profile_id');

        if (!horses?.length || index >= horses.length) {
            return res.status(200).json({ success: false, error: 'No horse' });
        }

        const horse = horses[index];
        console.log(`   Horse: ${horse.name}`);

        // CONTENT: video_clip (even hours) or news_link (odd hours)
        const hour = new Date().getUTCHours();
        const contentTypes = ['video_clip', 'poker_news', 'video_clip', 'sports_news'];
        const contentType = contentTypes[hour % 4];

        const assignedSources = await getHorseSources(horse.profile_id);

        // Try primary, then fallback to video_clip
        let result;
        if (contentType === 'video_clip') {
            result = await postVideoClip(horse, assignedSources, index);
        } else if (contentType === 'poker_news') {
            result = await postNewsLink(horse, index, 'poker');
            if (!result.success) result = await postVideoClip(horse, assignedSources, index);
        } else if (contentType === 'sports_news') {
            result = await postNewsLink(horse, index, 'sports');
            if (!result.success) result = await postVideoClip(horse, assignedSources, index);
        } else {
            result = await postVideoClip(horse, assignedSources, index);
        }

        console.log(`   Result: ${result.success ? 'SUCCESS' : 'FAILED'}`);

        return res.status(200).json({
            success: result.success,
            horse: horse.name,
            horseIndex: index,
            contentType,
            ...result
        });

    } catch (error) {
        console.error('Horse cron error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
