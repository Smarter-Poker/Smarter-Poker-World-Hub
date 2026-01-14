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
// REALISTIC IMAGE PROMPTS - Look like REAL phone photos poker players take
// LAW: NO TEXT-ONLY POSTS - Images must look authentic, NOT AI-generated
// KEY: Messy, imperfect, casual, low-light, smartphone quality
// ═══════════════════════════════════════════════════════════════════════════
const IMAGE_PROMPTS_BY_TYPE = {
    session_result: [
        "Smartphone photo of messy poker chip stack on casino felt, slightly blurry, dim casino lighting, candid snapshot, Red Bull can in corner, realistic",
        "Casual phone photo of poker chips scattered on green table, overhead shot, some chips knocked over, half-eaten food tray nearby, dim lighting",
        "Amateur photo of small chip stack at poker table, casino carpet visible, other players hands blurred, authentic messy table, low light",
        "Quick snapshot of chip racks at cashier cage, grainy phone quality, fluorescent casino lighting, money counter in background"
    ],
    bad_beat: [
        "Phone photo of face-up cards on poker table showing bad beat, messy chips around, slightly tilted angle, frustrated energy, amateur quality",
        "Candid snapshot of poker hand showing cooler, cards on felt, dim lighting, drink cups visible, imperfect framing",
        "Blurry phone photo of cards showing river suckout, casino table, slightly out of focus, looks like taken in frustration",
        "Quick photo of board cards at poker table, player perspective, messy felt, empty coffee cup, low casino lighting"
    ],
    life_moment: [
        "Casual selfie style photo inside casino poker room, blurry background tables, fluorescent lights, authentic environment",
        "Phone snapshot of late night poker room, empty tables, scattered chips, half-eaten sandwich, tired atmosphere, dim lights",
        "Amateur photo of home poker setup, messy table, beer bottles, chips in chaos, warm lamp lighting, lived-in feel",
        "Candid photo of poker room entrance, casino carpet, blurry players walking, authentic phone camera quality"
    ],
    win_celebration: [
        "Excited snapshot of big chip stack from winning session, slightly shaky photo, messy table, other players chips visible, candid joy",
        "Phone photo of chip rack closeup after big win, grainy quality, cashier window reflection, authentic casino lighting",
        "Quick celebratory photo of stacked chips, some falling over, drink in background, messy felt, real phone snapshot feel",
        "Amateur overhead photo of huge pot won, cards visible, scattered chips, other players hands in frame, chaotic feel"
    ],
    random_thought: [
        "Aesthetic phone shot of poker table at quiet moment, empty seats, dim casino lighting, slightly grainy, contemplative mood",
        "Casual photo of cards and coffee cup on poker table, morning session vibes, soft lighting, imperfect composition",
        "Snapshot of empty poker table late at night, scattered chips left behind, dim lights, melancholy atmosphere",
        "Phone camera photo of poker room view, blurry background players, focus on felt texture, authentic candid feel"
    ],
    question: [
        "Phone photo of tricky board texture, cards face up on felt, chip stacks visible, asking for opinions vibe, casual snapshot",
        "Amateur photo of poker hand decision point, cards shown, messy table, other players watching, authentic lighting",
        "Quick snapshot of interesting flop texture, cards on casino felt, slightly blurry edges, phone camera quality",
        "Candid photo of poker scenario, community cards visible, chip stacks around, dim casino lighting, discussion starter"
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
