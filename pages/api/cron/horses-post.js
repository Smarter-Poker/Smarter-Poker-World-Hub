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
// HUMAN-LIKE POST TEMPLATES - Casual, authentic, varied
// ═══════════════════════════════════════════════════════════════════════════
const POST_TYPES = [
    {
        type: 'session_update',
        prompts: [
            "Share a quick update about your poker session today. Be casual, mention specific hands or situations. Include your mood and energy.",
            "Just finished a session - talk about how it went, any interesting spots, your read on the table.",
            "Post about what you're doing poker-wise right now. Could be studying, playing, watching streams, etc."
        ]
    },
    {
        type: 'hot_take',
        prompts: [
            "Share a slightly controversial poker opinion you have. Be bold but back it up with your experience.",
            "Give your honest take on something in poker that most people get wrong. Be conversational.",
            "React to something that happened at the tables recently that got you thinking."
        ]
    },
    {
        type: 'tip_drop',
        prompts: [
            "Share a quick tip you wish you knew earlier in your poker journey. Keep it real and casual.",
            "Drop some wisdom from your experience - something that clicked for you recently.",
            "Help out the newer players with something you've noticed works well for you."
        ]
    },
    {
        type: 'story_time',
        prompts: [
            "Tell a quick story from a recent session - a cool hand, a funny moment, or a tough spot.",
            "Share something memorable that happened at the poker table recently.",
            "Talk about a hand that's been living rent-free in your head lately."
        ]
    },
    {
        type: 'question',
        prompts: [
            "Ask the community a genuine poker question - something you're actually curious about.",
            "Pose a situational question to get people's thoughts. Be specific about the scenario.",
            "Share a spot you weren't sure about and ask what others would do."
        ]
    },
    {
        type: 'life_update',
        prompts: [
            "Share something about your life outside poker that relates to your grind.",
            "Talk about balance, travel, or something personal that connects to your poker journey.",
            "Share what motivates you or what's on your mind as a poker player."
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

    // Human-like system prompt - emphasis on authenticity
    const systemPrompt = `You are ${horse.name}, a real poker player posting on social media.

WHO YOU ARE:
- From ${horse.location || 'Las Vegas'}
- You play ${horse.specialty?.replace('_', ' ') || 'cash games'} at ${horse.stakes || '2/5 NLH'}
- Your vibe: ${horse.voice || 'casual and real'}
- Bio: ${horse.bio || 'Experienced poker player'}

${memorySection}

IMPORTANT - SOUND HUMAN:
- Write like you're texting a friend or posting on Twitter/X
- Use casual language, contractions, maybe a typo here and there
- Short sentences. Fragments are fine.
- Share real feelings - frustration, excitement, curiosity
- Reference specific situations, stakes, venues when relevant
- DON'T sound like a textbook or AI - be a real person
- 1-3 short paragraphs max (50-150 words total)
- Can use 1-2 emojis if it fits your personality
- NO hashtags ever`;

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o',  // Using GPT-4o for more human-like output
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt }
            ],
            max_tokens: 300,
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
