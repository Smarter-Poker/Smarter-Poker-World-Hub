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

// Image prompts for poker content
const IMAGE_PROMPTS = [
    "Poker table with cards and chips, dramatic casino lighting, professional photography",
    "Close up of poker chips stacked on green felt, cinematic depth of field",
    "Poker hand being dealt, cards on table, atmospheric lighting",
    "Casino poker room ambiance, soft lighting, professional quality",
    "Poker cards face down on felt with chip stacks, professional photo",
    "Player's view of poker table with community cards, dramatic lighting",
    "Stack of poker chips with ace of spades, dark background, studio lighting",
    "Poker tournament setting, green felt table, cinematic shot"
];

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
// IMAGE GENERATION
// ═══════════════════════════════════════════════════════════════════════════
async function generatePostImage(topic) {
    try {
        // Pick a random base prompt and add topic context
        const basePrompt = IMAGE_PROMPTS[Math.floor(Math.random() * IMAGE_PROMPTS.length)];

        const response = await openai.images.generate({
            model: "dall-e-3",
            prompt: `${basePrompt}. High quality, photorealistic, no text or watermarks.`,
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
        const filePath = `social-media/photos/horses/${fileName}`;

        const { data, error } = await supabase.storage
            .from('social-media')
            .upload(filePath, buffer, {
                contentType: 'image/png',
                upsert: false
            });

        if (error) {
            console.error('Image upload error:', error);
            return null;
        }

        const { data: urlData } = supabase.storage
            .from('social-media')
            .getPublicUrl(filePath);

        return urlData.publicUrl;
    } catch (error) {
        console.error('Image generation error:', error.message);
        return null;
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

        // Generate image for the post
        console.log(`🎨 Generating image for ${horse.name}'s post...`);
        const imageUrl = await generatePostImage(postType.type);

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
            content_type: imageUrl ? 'photo' : 'text',
            media_urls: imageUrl ? [imageUrl] : [],
            visibility: 'public',
            _meta: {
                horse_id: horse.id,
                horse_name: horse.name,
                post_type: postType.type
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
                    console.log(`✅ ${horse.name} posted (${post._meta.post_type})`);
                    results.push({
                        horse: horse.name,
                        type: post._meta.post_type,
                        hasImage: post.media_urls.length > 0,
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
