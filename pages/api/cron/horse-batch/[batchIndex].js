/**
 * BATCH HORSE CRON - Handles 10 horses per batch
 * 
 * Each batch covers 10 horses:
 * - Batch 0: Horses 0-9
 * - Batch 1: Horses 10-19
 * - ...
 * - Batch 9: Horses 90-99
 * 
 * 10 batches × 10 horses = 100 horses per day
 * Each batch runs at a different hour spread across 24 hours
 */

import { createClient } from '../../../../src/lib/supabaseServerClient';
import Parser from 'rss-parser';
import { getGrokClient } from '../../../../src/lib/grokClient.js';

// ClipLibrary for poker video clips - loaded dynamically
let getRandomClip, CLIP_LIBRARY, clipLibraryLoaded = false;

async function loadClipLibrary() {
    if (clipLibraryLoaded) return true;
    try {
        const lib = await import('../../../../src/content-engine/pipeline/ClipLibrary.js');
        getRandomClip = lib.getRandomClip;
        CLIP_LIBRARY = lib.CLIP_LIBRARY;
        clipLibraryLoaded = true;
        return true;
    } catch (e) {
        console.error('❌ Failed to load ClipLibrary:', e.message);
        return false;
    }
}

// Validate YouTube video actually exists before posting
async function validateYouTubeVideo(url) {
    if (!url) return false;
    const patterns = [
        /youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/,
        /youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/,
        /youtu\.be\/([a-zA-Z0-9_-]+)/,
        /youtube\.com\/embed\/([a-zA-Z0-9_-]+)/
    ];
    let videoId = null;
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) { videoId = match[1]; break; }
    }
    if (!videoId) return false;

    try {
        const response = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
        return response.ok;
    } catch {
        return false;
    }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const grok = getGrokClient();

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

// AGGRESSIVE caption cleanup - strip ALL banned patterns
function cleanCaption(text, horseIndex) {
    if (!text) return '';

    // Strip ALL emojis
    const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2300}-\u{23FF}]|[\u{2B50}]|[\u{1F004}]|[\u{1F0CF}]|[\u{1F170}-\u{1F251}]/gu;
    let clean = text.replace(emojiRegex, '');

    // NUKE "yo" at start (any casing, with optional comma/space)
    clean = clean.replace(/^[Yy][Oo][,\s]*/i, '');
    clean = clean.replace(/^[Yy][Oo][,\s]*/i, ''); // double-check

    // Remove banned phrases (case insensitive)
    const bannedPatterns = [
        /\byo\b[,\s]*/gi,
        /\bjust saw this\b/gi,
        /\bcheck out\b/gi,
        /\bcheck this\b/gi,
        /\bpretty cool\b/gi,
        /\bwild stuff\b/gi,
        /\bwilddddd+\b/gi,
        /\bbruh\b/gi,
        /\bgotta check\b/gi,
        /\blook at this\b/gi,
        /\bcool stuff\b/gi,
        /\bawesome stuff\b/gi,
        /\bso cool\b/gi,
        /\bthis is fire\b/gi,
        /\bfire content\b/gi,
        /\bong\b/gi,
        /\btbh\b/gi,
        /\bfrfr\b/gi,
        /\bno cap\b/gi,
        /\bvibin\b/gi,
        /\bvibes\b/gi,
        /\bhey,\s*/gi
    ];

    for (const pattern of bannedPatterns) {
        clean = clean.replace(pattern, '');
    }

    // Clean up whitespace and punctuation
    clean = clean.replace(/^[\s,.\-:!]+/, ''); // strip leading punctuation
    clean = clean.replace(/\s+/g, ' ').trim();

    // Capitalize first letter
    if (clean.length > 0) {
        clean = clean.charAt(0).toUpperCase() + clean.slice(1);
    }

    return clean;
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

// POST VIDEO CLIP (with unique voice + GLOBAL DEDUPLICATION + POKER/SPORTS SUPPORT)
async function postVideoClip(horse, assignedSources, horseIndex, clipType = 'sports') {

    let clips = [];
    let clip = null;

    if (clipType === 'poker') {
        if (!clipLibraryLoaded || typeof getRandomClip !== 'function') {
            console.error(`   ClipLibrary not loaded for poker clips`);
            return { success: false, error: 'ClipLibrary not available' };
        }

        const maxAttempts = 20;
        for (let i = 0; i < maxAttempts; i++) {
            const candidate = getRandomClip();
            if (!candidate) continue;

            const videoId = candidate.video_id || candidate.id;
            const embedUrl = convertToEmbedUrl(candidate.source_url);

            const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
            const { data: recentVideos } = await supabase
                .from('social_posts')
                .select('media_urls')
                .eq('content_type', 'video')
                .gte('created_at', since48h)
                .limit(100);

            const usedUrls = new Set();
            (recentVideos || []).forEach(p => {
                if (p.media_urls) p.media_urls.forEach(url => usedUrls.add(url));
            });

            if (!usedUrls.has(embedUrl) && !usedUrls.has(candidate.source_url)) {
                const isValid = await validateYouTubeVideo(candidate.source_url);
                if (isValid) {
                    clip = candidate;
                    break;
                } else {
                }
            }
        }

        if (!clip) {
            return { success: false, error: 'All poker clips already posted' };
        }

    } else {
        if (assignedSources.length > 0) {
            const { data } = await supabase.from('sports_clips').select('*').in('source', assignedSources).limit(200);
            if (data?.length) clips = data;
        }
        if (!clips.length) {
            const offset = Math.floor(Math.random() * 5000);
            const { data } = await supabase.from('sports_clips').select('*').range(offset, offset + 200);
            if (data?.length) clips = data;
        }
        if (!clips.length) return { success: false, error: 'No sports clips' };

        const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
        const { data: recentVideos } = await supabase
            .from('social_posts')
            .select('media_urls')
            .eq('content_type', 'video')
            .gte('created_at', since48h)
                .limit(100);

        const usedUrls = new Set();
        (recentVideos || []).forEach(p => {
            if (p.media_urls) p.media_urls.forEach(url => usedUrls.add(url));
        });

        const freshClips = clips.filter(c => {
            const embedUrl = convertToEmbedUrl(c.source_url);
            return !usedUrls.has(embedUrl) && !usedUrls.has(c.source_url);
        });

        if (!freshClips.length) {
            return { success: false, error: 'All sports clips already posted' };
        }

        const maxValidationAttempts = 10;
        for (let i = 0; i < maxValidationAttempts && freshClips.length > 0; i++) {
            const idx = Math.floor(Math.random() * freshClips.length);
            const candidate = freshClips[idx];
            const isValid = await validateYouTubeVideo(candidate.source_url);
            if (isValid) {
                clip = candidate;
                break;
            } else {
                freshClips.splice(idx, 1);
            }
        }

        if (!clip) {
            return { success: false, error: 'No valid sports clips found' };
        }
    }

    const voice = getHorseVoice(horseIndex);

    let caption = '';
    try {
        const clipTitle = clip.title || clip.description || 'video clip';
        const response = await grok.chat.completions.create({
            model: 'grok-3-mini',
            messages: [{
                role: 'user',
                content: `Write a ${voice.style} reaction to this ${clipType} video title in 3-10 words. NO emojis. NO "yo", "check out", "pretty cool". Just ${voice.style}. Example: "${voice.example}". Title: "${clipTitle}"`
            }],
            max_tokens: 30
        });
        caption = response.choices[0]?.message?.content?.trim() || clipTitle.slice(0, 50);
    } catch (e) {
        caption = (clip.title || clip.description || 'Worth watching').slice(0, 50);
    }

    caption = voice.opener + cleanCaption(caption, horseIndex);

    const { data: post, error } = await supabase.from('social_posts').insert({
        author_id: horse.profile_id,
        content: caption,
        content_type: 'video',
        media_urls: [convertToEmbedUrl(clip.source_url)],
        visibility: 'public',
        metadata: {
            clip_type: clipType,
            clip_id: clip.id || clip.video_id
        }
    }).select().single();

    if (error) return { success: false, error: error.message };
    return { success: true, postId: post.id, type: `${clipType}_video`, caption: caption.slice(0, 50) };
}

// POST NEWS LINK (with unique voice + GLOBAL DEDUPLICATION)
async function postNewsLink(horse, horseIndex, newsType) {

    const sources = newsType === 'poker' ? POKER_NEWS_SOURCES : SPORTS_NEWS_SOURCES;
    const sourceIndex = horseIndex % sources.length;
    const source = sources[sourceIndex];

    try {
        const feed = await rssParser.parseURL(source.rss);
        const allArticles = (feed.items || []).slice(0, 20);
        if (!allArticles.length) return { success: false, error: 'No articles' };

        const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
        const { data: recentPosts } = await supabase
            .from('social_posts')
            .select('link_url')
            .not('link_url', 'is', null)
            .gte('created_at', since48h)
                .limit(100);

        const usedLinks = new Set((recentPosts || []).map(p => p.link_url));

        const freshArticles = allArticles.filter(a => !usedLinks.has(a.link))
            .limit(100);

        if (!freshArticles.length) {
            return { success: false, error: 'All articles already posted' };
        }

        const article = freshArticles[Math.floor(Math.random() * freshArticles.length)];
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

// Process a single horse
async function processHorse(horse, horseIndex, horses) {

    // CONTENT: 75% POKER / 25% SPORTS SPLIT
    const hour = new Date().getUTCHours();
    const isPokerHour = (hour % 4 !== 3);
    const contentCategory = isPokerHour ? 'poker' : 'sports';


    const assignedSources = await getHorseSources(horse.profile_id);

    let result;
    if (isPokerHour) {
        result = await postNewsLink(horse, horseIndex, 'poker');
        if (!result.success) {
            result = await postVideoClip(horse, assignedSources, horseIndex, 'poker');
        }
    } else {
        result = await postNewsLink(horse, horseIndex, 'sports');
        if (!result.success) {
            result = await postVideoClip(horse, assignedSources, horseIndex, 'sports');
        }
    }

    return { horse: horse.name, index: horseIndex, ...result };
}

// MAIN HANDLER - Process 10 horses in batch
export default async function handler(req, res) {
    // Verify cron secret
    if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const { batchIndex } = req.query;
    const batch = parseInt(batchIndex, 10);

    if (isNaN(batch) || batch < 0 || batch > 9) {
        return res.status(400).json({ error: 'batchIndex must be 0-9' });
    }

    const startIndex = batch * 10;
    const endIndex = startIndex + 9;

    try {

        // Load ClipLibrary for poker video clips
        await loadClipLibrary();

        // Get all active horses
        const { data: horses, error: horseError } = await supabase
            .from('content_authors')
            .select('*')
            .eq('is_active', true)
            .not('profile_id', 'is', null)
            .order('profile_id')
                .limit(100);

        if (horseError || !horses?.length) {
            return res.status(200).json({ success: false, error: 'No horses found' });
        }

        if (!horses?.length) {
            return res.status(200).json({ success: false, error: 'No horses found' });
        }


        // Process horses in this batch
        const results = [];
        for (let i = startIndex; i <= endIndex && i < horses.length; i++) {
            const horse = horses[i];
            if (!horse) continue;

            try {
                const result = await processHorse(horse, i, horses);
                results.push(result);

                // Small delay between horses to avoid rate limiting
                await new Promise(r => setTimeout(r, 500));
            } catch (err) {
                console.error(`Error processing horse ${i}:`, err.message);
                results.push({ horse: horse?.name, index: i, success: false, error: err.message });
            }
        }

        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success).length;


        return res.status(200).json({
            success: true,
            batch,
            horsesRange: `${startIndex}-${endIndex}`,
            successCount,
            failCount,
            results
        });

    } catch (error) {
        console.error('Batch horse cron error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
