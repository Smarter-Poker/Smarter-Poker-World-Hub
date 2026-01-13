/**
 * 🐴 HORSES CRON TRIGGER
 * ═══════════════════════════════════════════════════════════════════════════
 * Vercel Cron Job - Triggers horses to post automatically
 * Schedule: Every 30 minutes during peak hours (9 AM - 10 PM)
 * 
 * Add to vercel.json:
 * {
 *   "crons": [
 *     { "path": "/api/cron/horses-post", "schedule": "0,30 9-22 * * *" }
 *   ]
 * }
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabase = createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const CONFIG = {
    HORSES_PER_TRIGGER: 3,           // How many horses post per cron run
    TOPIC_COOLDOWN_HOURS: 48,        // Hours before horse can repeat a topic
    MAX_POSTS_PER_DAY: 100,          // Total platform limit
    CRON_SECRET: process.env.CRON_SECRET || ''
};

const CONTENT_TYPES = [
    'strategy_tip', 'hand_analysis', 'mindset_post', 'beginner_guide',
    'advanced_concept', 'bankroll_advice', 'tournament_tip'
];

const CONTENT_TEMPLATES = {
    strategy_tip: {
        prompt: "Write a poker strategy tip about {topic}. Be specific and actionable.",
        topics: ["3-betting light", "continuation bets", "pocket pairs", "check-raising", "river sizing"]
    },
    hand_analysis: {
        prompt: "Analyze this poker scenario: {topic}",
        topics: ["AK on dry flop", "set mining math", "bluff catching rivers", "ICM pressure spots"]
    },
    mindset_post: {
        prompt: "Write about poker mindset regarding: {topic}",
        topics: ["handling bad beats", "session management", "tilt control", "confidence building"]
    },
    beginner_guide: {
        prompt: "Explain this concept for beginners: {topic}",
        topics: ["position basics", "pot odds", "starting hands", "bankroll management"]
    },
    advanced_concept: {
        prompt: "Dive deep into: {topic}",
        topics: ["range construction", "blockers", "GTO vs exploitative", "equity realization"]
    },
    bankroll_advice: {
        prompt: "Give bankroll advice about: {topic}",
        topics: ["moving up stakes", "shot taking", "stop losses", "variance management"]
    },
    tournament_tip: {
        prompt: "Share tournament advice about: {topic}",
        topics: ["bubble play", "final table", "short stack strategy", "ICM decisions"]
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// MEMORY SERVICE (Inline)
// ═══════════════════════════════════════════════════════════════════════════

const MemoryService = {
    async getMemoryContext(authorId) {
        const [memories, personality, cooldowns] = await Promise.all([
            this.getRecentMemories(authorId),
            this.getPersonality(authorId),
            this.getTopicsOnCooldown(authorId)
        ]);
        return { recentMemories: memories, personality, topicsOnCooldown: cooldowns };
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

    async getTopicsOnCooldown(authorId) {
        try {
            const { data } = await supabase
                .from('horse_topic_cooldowns')
                .select('topic, last_posted_at, cooldown_hours')
                .eq('author_id', authorId);
            if (!data) return [];
            const now = new Date();
            return data.filter(row => {
                const cooldownEnd = new Date(row.last_posted_at);
                cooldownEnd.setHours(cooldownEnd.getHours() + row.cooldown_hours);
                return cooldownEnd > now;
            }).map(row => row.topic);
        } catch { return []; }
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

    async setTopicCooldown(authorId, topic, hours = 48) {
        try {
            await supabase.rpc('set_topic_cooldown', {
                p_author_id: authorId, p_topic: topic, p_cooldown_hours: hours
            });
        } catch (e) { console.error('Cooldown error:', e); }
    },

    buildPromptSection(context) {
        const sections = [];
        if (context.personality) {
            const p = context.personality;
            sections.push(`PERSONALITY: Aggression ${p.aggression_level}/10, Humor ${p.humor_level}/10, Technical ${p.technical_depth}/10`);
            if (p.catchphrases?.length) sections.push(`CATCHPHRASES: ${p.catchphrases.join(', ')}`);
        }
        if (context.recentMemories?.length > 0) {
            const lines = context.recentMemories.slice(0, 3).map(m => `- ${m.content_summary}`);
            sections.push(`RECENT POSTS (stay consistent):\n${lines.join('\n')}`);
        }
        if (context.topicsOnCooldown?.length > 0) {
            sections.push(`AVOID TOPICS: ${context.topicsOnCooldown.join(', ')}`);
        }
        return sections.length > 0 ? '\n\n' + sections.join('\n\n') : '';
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN CONTENT GENERATION
// ═══════════════════════════════════════════════════════════════════════════

async function generateHorsePost(horse) {
    // Get memory context
    const memoryContext = await MemoryService.getMemoryContext(horse.id);

    // Pick content type and topic (avoiding cooldowns)
    const contentType = CONTENT_TYPES[Math.floor(Math.random() * CONTENT_TYPES.length)];
    const template = CONTENT_TEMPLATES[contentType];

    const availableTopics = template.topics.filter(
        t => !memoryContext.topicsOnCooldown.some(cd => t.toLowerCase().includes(cd.toLowerCase()))
    );

    if (availableTopics.length === 0) {
        console.log(`⏸️ ${horse.name}: All topics on cooldown`);
        return null;
    }

    const topic = availableTopics[Math.floor(Math.random() * availableTopics.length)];
    const memorySection = MemoryService.buildPromptSection(memoryContext);

    const systemPrompt = `You are ${horse.name}, a poker player from ${horse.location || 'Las Vegas'}.
Specialty: ${horse.specialty || 'cash games'} at ${horse.stakes || '2/5 NLH'}
Bio: ${horse.bio || 'Experienced poker player'}
Voice: ${horse.voice || 'casual'}
${memorySection}

Write authentically as this person. 100-250 words. No hashtags. Stay consistent with past posts.`;

    const userPrompt = template.prompt.replace('{topic}', topic);

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            max_tokens: 400,
            temperature: 0.85
        });

        const content = response.choices[0].message.content;

        // Record memory
        const topicKey = topic.split(' ').slice(0, 2).join('_').toLowerCase();
        await MemoryService.recordMemory(horse.id, 'POST', `Posted about ${contentType}: ${topic}`, { relatedTopic: topicKey });
        await MemoryService.setTopicCooldown(horse.id, topicKey, CONFIG.TOPIC_COOLDOWN_HOURS);

        return {
            author_id: horse.id,
            author_name: horse.name,
            author_alias: horse.alias,
            content_type: contentType,
            topic,
            body: content,
            status: 'published',
            published_at: new Date().toISOString()
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
    // Verify cron secret
    const authHeader = req.headers.authorization;
    if (CONFIG.CRON_SECRET && authHeader !== `Bearer ${CONFIG.CRON_SECRET}`) {
        if (process.env.NODE_ENV === 'production') {
            return res.status(401).json({ error: 'Unauthorized' });
        }
    }

    console.log('🐴 Horses Cron Trigger Started');

    try {
        // Check daily limit
        const today = new Date().toISOString().split('T')[0];
        const { count: todayCount } = await supabase
            .from('seeded_content')
            .select('*', { count: 'exact', head: true })
            .gte('published_at', `${today}T00:00:00Z`);

        if (todayCount >= CONFIG.MAX_POSTS_PER_DAY) {
            return res.status(200).json({
                success: true,
                message: 'Daily limit reached',
                posted: 0
            });
        }

        // Get random active horses
        const { data: horses, error: horseError } = await supabase
            .from('content_authors')
            .select('*')
            .eq('is_active', true)
            .order('RANDOM()')
            .limit(CONFIG.HORSES_PER_TRIGGER);

        if (horseError || !horses?.length) {
            console.log('No active horses found');
            return res.status(200).json({ success: true, message: 'No horses available', posted: 0 });
        }

        const results = [];

        for (const horse of horses) {
            // Add random delay (1-5 seconds) for natural feel
            await new Promise(r => setTimeout(r, Math.random() * 4000 + 1000));

            const post = await generateHorsePost(horse);
            if (post) {
                // Insert into database
                const { error: insertError } = await supabase
                    .from('seeded_content')
                    .insert(post);

                if (!insertError) {
                    console.log(`✅ ${horse.name} posted about ${post.topic}`);
                    results.push({ horse: horse.name, topic: post.topic, success: true });
                } else {
                    results.push({ horse: horse.name, success: false, error: insertError.message });
                }
            }
        }

        console.log(`🐴 Horses Cron Complete: ${results.filter(r => r.success).length} posts`);

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
// trigger rebuild Tue Jan 13 14:15:35 CST 2026
