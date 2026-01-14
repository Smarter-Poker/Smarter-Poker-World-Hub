/**
 * 🐴 HORSES CONTENT CRON - HUMAN-LIKE POSTS WITH MEDIA
 * ═══════════════════════════════════════════════════════════════════════════
 * Generates authentic, human-feeling posts with images
 * Posts feel like real poker players sharing their experience
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const CONFIG = {
    HORSES_PER_TRIGGER: 3,
    TOPIC_COOLDOWN_HOURS: 48,
    MAX_POSTS_PER_DAY: 100
};

// ═══════════════════════════════════════════════════════════════════════════
// REALISTIC POST TYPES - What poker players ACTUALLY post
// ═══════════════════════════════════════════════════════════════════════════
const POST_TYPES = [
    {
        type: 'session_result',
        weight: 25,
        prompts: [
            "Post your session result. Just won or lost, the amount if you want, maybe a brief feeling. 1-2 sentences max.",
            "Quick session update - how'd it go today? Keep it super brief.",
            "End of session post. Brief result, vibe check."
        ]
    },
    {
        type: 'bad_beat',
        weight: 20,
        prompts: [
            "You just got coolered or sucked out on. Vent briefly. 1-2 sentences. Be frustrated but not dramatic.",
            "Quick bad beat rant. Keep it short and real.",
            "Just lost a big pot in a gross way. Brief frustrated post."
        ]
    },
    {
        type: 'life_moment',
        weight: 20,
        prompts: [
            "Share something from your poker lifestyle - at the casino, traveling, eating, grinding late. Brief observation.",
            "Quick life update relating to poker. Where you are, what you're doing.",
            "Post about your day as a poker player. Not strategy - just life stuff."
        ]
    },
    {
        type: 'win_celebration',
        weight: 15,
        prompts: [
            "You just had a nice win or hit a big pot. Brief celebration post. Don't brag too hard.",
            "Good session! Brief happy post about your win.",
            "Quick positive update - things went well today."
        ]
    },
    {
        type: 'random_thought',
        weight: 10,
        prompts: [
            "Random poker-related thought or observation. Could be funny, weird, philosophical. Very brief.",
            "Something random on your mind about the poker life.",
            "Quick observation about something at the tables or in the poker world."
        ]
    },
    {
        type: 'question',
        weight: 10,
        prompts: [
            "Ask a genuine casual question to the community. Not technical - more like polling opinions.",
            "Quick question for poker twitter. Keep it light.",
            "Curious about something - ask the community."
        ]
    }
];

// ═══════════════════════════════════════════════════════════════════════════
// 🔒 AUTHENTIC POKER IMAGE PROMPTS - HARD LAW v1.1
// See: AUTHENTIC_POKER_IMAGERY_LAW.md for full documentation
// 
// ✓ REQUIRED: REAL CASINO CHIPS with visible denominations (Bellagio, Aria, WSOP)
// ✓ REQUIRED: Realistic session-sized stacks (not unrealistic towers)
// ✓ REQUIRED: Player POV perspective, phone camera quality
// ✗ FORBIDDEN: Generic plain colored chips (dead giveaway of AI)
// ✗ FORBIDDEN: Ridiculous unrealistic piles without story context
// ✗ FORBIDDEN: Scattered/chaotic chips, dramatic lighting, cinematic effects
// ✗ FORBIDDEN: Blackjack tables, baccarat tables, roulette, any non-poker games
// ═══════════════════════════════════════════════════════════════════════════

// Anti-AI suffix added to all prompts to ensure authenticity
// HARD LAW: POKER TABLES ONLY + REAL CASINO CHIPS WITH DENOMINATIONS
const AUTHENTICITY_SUFFIX = ", POKER TABLE ONLY not blackjack or baccarat, real casino chips with visible denomination markings not generic plain chips, casual phone photo quality, no dramatic lighting, no lens flare, no HDR, realistic amateur photography";

const IMAGE_PROMPTS_BY_TYPE = {
    session_result: [
        "Phone photo of Bellagio casino chips stacked neatly - $5 red $25 green $100 black chips with Bellagio logo, about 30 chips total showing a modest session, player seat perspective on green felt" + AUTHENTICITY_SUFFIX,
        "Overhead phone shot of Aria casino chips organized in short stacks by denomination, $1 white $5 red $25 green visible, realistic 2/5 session amount, water bottle in corner" + AUTHENTICITY_SUFFIX,
        "Casual photo at WSOP poker room cage window, Venetian chips being counted with visible denomination markers, cash bills on counter, fluorescent lighting" + AUTHENTICITY_SUFFIX,
        "Player POV looking at their MGM Grand chips - $5 reds and $25 greens in organized stacks of 20, cards face down, dealer button visible, realistic amount" + AUTHENTICITY_SUFFIX,
        "Photo cashing out at Wynn cage, chip racks with Wynn-branded chips showing denominations being exchanged for cash, money counter background" + AUTHENTICITY_SUFFIX,
        "Simple overhead photo of casino chips with printed denominations ($5 $25 $100 visible), realistic 3-hour session stack, coffee cup edge of frame" + AUTHENTICITY_SUFFIX
    ],
    bad_beat: [
        "Phone photo of pocket aces (two aces) face up on green felt next to a bad board runout, Bellagio chips with denominations visible in background" + AUTHENTICITY_SUFFIX,
        "Close-up of cooler showdown - two strong hole cards next to losing board, organized Aria chips with $25 green visible" + AUTHENTICITY_SUFFIX,
        "Player POV showing KK vs AA cooler, cards flat on felt, remaining MGM chips with denomination markers, casino table" + AUTHENTICITY_SUFFIX,
        "Candid shot of all-in runout on felt, both hands revealed, casino chips with $5 $25 denominations visible nearby" + AUTHENTICITY_SUFFIX,
        "Phone photo of river suckout board, hole cards face up, WSOP tournament chips with visible values in frame" + AUTHENTICITY_SUFFIX,
        "Close-up of bad beat board texture, remaining Venetian casino chips showing $100 black denomination, felt texture" + AUTHENTICITY_SUFFIX
    ],
    life_moment: [
        "Wide phone photo of Bellagio poker room with active tables, real players seated, overhead lights, casino carpet visible" + AUTHENTICITY_SUFFIX,
        "Casual photo from Aria poker room entrance, tables in rows, dealers dealing, typical Vegas poker room" + AUTHENTICITY_SUFFIX,
        "Phone snapshot of MGM Grand poker room late night, half-full tables, tired grinders, authentic 3am atmosphere" + AUTHENTICITY_SUFFIX,
        "Photo of home game on proper poker table, ceramic Monte Carlo style chips with denominations visible, friends playing, warm lighting" + AUTHENTICITY_SUFFIX,
        "Candid walking into Wynn poker room, check-in board visible, players waiting for seats, real casino environment" + AUTHENTICITY_SUFFIX,
        "Phone photo of WSOP at Rio poker room floor, tournament tables, visible branding, authentic event atmosphere" + AUTHENTICITY_SUFFIX
    ],
    win_celebration: [
        "Phone photo of solid Bellagio session - organized stacks of $5 red $25 green $100 black chips with visible logos, realistic big win amount" + AUTHENTICITY_SUFFIX,
        "Excited POV of Aria chips after heater session, neatly sorted $25 greens and $100 blacks with denomination markers visible" + AUTHENTICITY_SUFFIX,
        "Photo at casino cage cashing out $1200 in MGM chips, racks with denominations visible, cash being counted out" + AUTHENTICITY_SUFFIX,
        "Overhead phone photo of good 5/10 session, organized Wynn chips showing $5 $25 $100 denominations, player seat" + AUTHENTICITY_SUFFIX,
        "Photo of Venetian chips being cashed, visible $100 black $500 purple denominations, realistic tournament cash" + AUTHENTICITY_SUFFIX,
        "Phone photo of WSOP circuit score, tournament chips with clear value markings, organized win stack" + AUTHENTICITY_SUFFIX
    ],
    random_thought: [
        "Quiet phone photo of empty poker table between hands, Bellagio dealer button, waiting chips with denominatons visible, ambient lighting" + AUTHENTICITY_SUFFIX,
        "Photo of Aria poker room during slow morning hours, clean tables with chip trays, peaceful casino morning" + AUTHENTICITY_SUFFIX,
        "Casual photo of coffee cup next to organized $5 and $25 casino chips on green felt, early session, soft lighting" + AUTHENTICITY_SUFFIX,
        "Phone photo of MGM chips organized during break, cards down, contemplative moment, chips showing denominations" + AUTHENTICITY_SUFFIX,
        "Photo of poker room view from seat at Venetian, other tables visible, quiet moment during session" + AUTHENTICITY_SUFFIX,
        "Candid photo of dealer button and organized Wynn chips with visible $25 markers, felt texture close-up" + AUTHENTICITY_SUFFIX
    ],
    question: [
        "Phone photo of poker board with five cards face up, Bellagio chips with $25 $100 denominations visible, decision point" + AUTHENTICITY_SUFFIX,
        "Close-up of hole cards AK partially lifted, community board visible, organized Aria casino chips in background" + AUTHENTICITY_SUFFIX,
        "Photo of interesting flop texture on felt, organized MGM chips with denomination markers, strategic moment" + AUTHENTICITY_SUFFIX,
        "Player POV of tournament spot at WSOP, board cards visible, tournament chips with clear values showing" + AUTHENTICITY_SUFFIX,
        "Phone photo of tricky river decision, five cards on felt, Venetian chips organized showing $5 $25 denominations" + AUTHENTICITY_SUFFIX,
        "Candid photo of hand in progress, community cards visible, authentic Wynn casino chips with markings" + AUTHENTICITY_SUFFIX
    ]
};

// ═══════════════════════════════════════════════════════════════════════════
// MEMORY SERVICE
// ═══════════════════════════════════════════════════════════════════════════
const MemoryService = {
    async getMemoryContext(authorId) {
        const [memories, personality] = await Promise.all([
            this.getRecentMemories(authorId),
            this.getPersonality(authorId)
        ]);
        return { recentMemories: memories, personality };
    },

    async getRecentMemories(authorId, limit = 5) {
        try {
            const { data } = await supabase.rpc('get_horse_memories', {
                p_author_id: authorId, p_topic: null, p_limit: limit
            });
            return data || [];
        } catch { return []; }
    },

    async getPersonality(authorId) {
        try {
            const { data } = await supabase.rpc('get_horse_personality', { p_author_id: authorId });
            return data && Object.keys(data).length > 0 ? data : null;
        } catch { return null; }
    },

    async recordMemory(authorId, memoryType, contentSummary, options = {}) {
        try {
            await supabase.rpc('record_horse_memory', {
                p_author_id: authorId,
                p_memory_type: memoryType,
                p_content_summary: contentSummary,
                p_related_topic: options.relatedTopic || null,
                p_keywords: options.keywords || [],
                p_sentiment: options.sentiment || 'neutral',
                p_source_post_id: null
            });
        } catch (e) { console.error('Memory record error:', e); }
    },

    buildPromptSection(context) {
        const sections = [];
        if (context.personality) {
            const p = context.personality;
            if (p.catchphrases?.length) sections.push(`You sometimes say: "${p.catchphrases[0]}"`);
            if (p.origin_story) sections.push(`Background: ${p.origin_story}`);
        }
        if (context.recentMemories?.length > 0) {
            const recent = context.recentMemories.slice(0, 2).map(m => m.content_summary);
            sections.push(`Your recent posts were about: ${recent.join(', ')} - don't repeat these topics.`);
        }
        return sections.join('\n');
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// IMAGE GENERATION - REQUIRED FOR ALL POSTS (LAW: No text-only posts)
// ═══════════════════════════════════════════════════════════════════════════
async function generatePostImages(postType, count = 1) {
    const prompts = IMAGE_PROMPTS_BY_TYPE[postType] || IMAGE_PROMPTS_BY_TYPE.session_result;
    const images = [];

    for (let i = 0; i < count; i++) {
        try {
            const basePrompt = prompts[Math.floor(Math.random() * prompts.length)];

            console.log(`🎨 Generating image ${i + 1}/${count}...`);
            const response = await openai.images.generate({
                model: "dall-e-3",
                prompt: `${basePrompt}. High quality, photorealistic, no text, no watermarks, social media ready.`,
                n: 1,
                size: "1024x1024",
                quality: "standard"
            });

            const tempUrl = response.data[0].url;

            // Download and upload to Supabase storage
            const imageResponse = await fetch(tempUrl);
            const blob = await imageResponse.blob();
            const buffer = Buffer.from(await blob.arrayBuffer());

            const fileName = `post-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
            const filePath = `photos/horses/${fileName}`;

            const { error } = await supabase.storage
                .from('social-media')
                .upload(filePath, buffer, {
                    contentType: 'image/png',
                    upsert: false
                });

            if (!error) {
                const { data: urlData } = supabase.storage
                    .from('social-media')
                    .getPublicUrl(filePath);
                images.push(urlData.publicUrl);
                console.log(`✅ Image ${i + 1} uploaded`);
            }
        } catch (error) {
            console.error(`Image ${i + 1} generation failed:`, error.message);
        }

        // Small delay between image generations
        if (i < count - 1) await new Promise(r => setTimeout(r, 1000));
    }

    return images;
}

// ═══════════════════════════════════════════════════════════════════════════
// STORY POSTING - All media goes to stories too
// ═══════════════════════════════════════════════════════════════════════════
async function postToStory(authorId, mediaUrl, mediaType = 'image') {
    try {
        const { error } = await supabase
            .from('stories')
            .insert({
                author_id: authorId,
                media_url: mediaUrl,
                media_type: mediaType,
                expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
            });

        if (error) {
            console.error('Story post error:', error.message);
            return false;
        }
        return true;
    } catch (e) {
        console.error('Story error:', e);
        return false;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTENT GENERATION - Human-like, authentic posts
// ═══════════════════════════════════════════════════════════════════════════
async function generateHorsePost(horse) {
    const memoryContext = await MemoryService.getMemoryContext(horse.id);

    // Pick random post type
    const postType = POST_TYPES[Math.floor(Math.random() * POST_TYPES.length)];
    const prompt = postType.prompts[Math.floor(Math.random() * postType.prompts.length)];
    const memorySection = MemoryService.buildPromptSection(memoryContext);

    // Human-like system prompt - ULTRA SHORT, Twitter style
    const systemPrompt = `You are ${horse.name}, posting on poker Twitter/X.

ABOUT YOU: ${horse.stakes || '2/5'} ${horse.specialty?.replace('_', ' ') || 'cash game'} player from ${horse.location || 'Vegas'}. ${horse.voice || 'casual'} vibe.

CRITICAL RULES - FOLLOW EXACTLY:
1. MAX 1-3 SHORT SENTENCES TOTAL. Like a tweet.
2. Sound like a real person, not an AI. Be raw, unpolished.
3. Use poker slang naturally (coolered, bricked, ran it twice, punt, ship it, etc)
4. Can include: frustration, excitement, sarcasm, humor, random thoughts
5. NO paragraphs. NO explanations. NO teaching.
6. Reference real stakes, real situations, real feelings
7. Typos and informal grammar are GOOD
8. 1-2 emojis max IF it fits

EXAMPLES OF GOOD POSTS:
- "ran KK into AA for the 3rd time today. sick of this game lol"
- "2/5 session: +$1,847. Table was so soft I almost felt bad 😂"  
- "anyone else just punt off a stack then immediately regret every life choice?"
- "studying ranges at 2am. why am i like this"
- "hit a 2 outer on the river vs a reg. he didnt say a word for 20 mins 🤣"
- "1/3 to 2/5 to 5/10 this year. slow grind but we're getting there"

${memorySection}

Write ONE post. Short. Real. Raw.`;

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o',  // Using GPT-4o for more human-like output
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt }
            ],
            max_tokens: 100,
            temperature: 0.95  // Higher temp for more variety
        });

        const content = response.choices[0].message.content;

        // LAW: NO TEXT-ONLY POSTS - Generate images (1-2 random)
        const imageCount = Math.random() > 0.5 ? 2 : 1; // 50% chance of 2 images
        console.log(`🎨 Generating ${imageCount} image(s) for ${horse.name}'s ${postType.type} post...`);
        const images = await generatePostImages(postType.type, imageCount);

        // LAW ENFORCEMENT: If no images, post is rejected
        if (images.length === 0) {
            console.error(`❌ ${horse.name}: Failed to generate images - POST REJECTED (no text-only)`);
            return null;
        }

        // Record memory
        await MemoryService.recordMemory(
            horse.id,
            'POST',
            `${postType.type}: ${content.slice(0, 100)}...`,
            { relatedTopic: postType.type }
        );

        return {
            author_id: horse.profile_id,
            content: content,
            content_type: 'photo',  // Always photo since images required
            media_urls: images,
            visibility: 'public',
            _meta: {
                horse_id: horse.id,
                horse_name: horse.name,
                post_type: postType.type,
                image_count: images.length
            }
        };
    } catch (error) {
        console.error(`Error generating for ${horse.name}:`, error);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// CRON HANDLER
// ═══════════════════════════════════════════════════════════════════════════
export default async function handler(req, res) {
    console.log('🐴 Horses Cron - Human-Like Posts Started');

    if (!SUPABASE_URL || !process.env.OPENAI_API_KEY) {
        return res.status(500).json({ error: 'Missing env vars' });
    }

    try {
        // Get random active horses with profiles
        const { data: horses, error: horseError } = await supabase
            .from('content_authors')
            .select('*')
            .eq('is_active', true)
            .not('profile_id', 'is', null)
            .limit(CONFIG.HORSES_PER_TRIGGER * 2);

        if (horseError || !horses?.length) {
            return res.status(200).json({ success: true, message: 'No horses available', posted: 0 });
        }

        // Shuffle and pick
        const shuffled = horses.sort(() => Math.random() - 0.5);
        const selectedHorses = shuffled.slice(0, CONFIG.HORSES_PER_TRIGGER);

        const results = [];

        for (const horse of selectedHorses) {
            // Random delay 2-6 seconds
            await new Promise(r => setTimeout(r, Math.random() * 4000 + 2000));

            const post = await generateHorsePost(horse);

            if (post && post.author_id) {
                const { error: insertError } = await supabase
                    .from('social_posts')
                    .insert({
                        author_id: post.author_id,
                        content: post.content,
                        content_type: post.content_type,
                        media_urls: post.media_urls,
                        visibility: post.visibility
                    });

                if (!insertError) {
                    // Also post all images to stories
                    let storiesPosted = 0;
                    for (const mediaUrl of post.media_urls) {
                        const storySuccess = await postToStory(post.author_id, mediaUrl, 'image');
                        if (storySuccess) storiesPosted++;
                    }

                    console.log(`✅ ${horse.name} posted (${post._meta.post_type}) + ${storiesPosted} stories`);
                    results.push({
                        horse: horse.name,
                        type: post._meta.post_type,
                        images: post.media_urls.length,
                        stories: storiesPosted,
                        success: true
                    });
                } else {
                    console.error(`❌ ${horse.name}:`, insertError.message);
                    results.push({ horse: horse.name, success: false, error: insertError.message });
                }
            }
        }

        return res.status(200).json({
            success: true,
            posted: results.filter(r => r.success).length,
            results,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Cron error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
// force Tue Jan 13 18:36:15 CST 2026
