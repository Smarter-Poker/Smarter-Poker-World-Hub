/**
 * 🎯 CONTENT COMMANDER ENGINE
 * ═══════════════════════════════════════════════════════════════════════════
 * Autonomous content generation system for seeding the Smarter.Poker platform.
 * 
 * MODULES:
 * 1. AGGREGATOR - Fetches poker news/content from external sources
 * 2. GENERATOR  - Creates original content in persona voices
 * 3. SCHEDULER  - Posts content on configurable intervals
 * ═══════════════════════════════════════════════════════════════════════════
 */

import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const CONFIG = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,

    // Content settings
    POSTS_PER_DAY: 20,
    MIN_DELAY_MINUTES: 30,
    MAX_DELAY_MINUTES: 120,

    // Content types
    CONTENT_TYPES: [
        'strategy_tip',
        'hand_analysis',
        'mindset_post',
        'news_commentary',
        'beginner_guide',
        'advanced_concept',
        'bankroll_advice',
        'tournament_tip'
    ]
};

// Initialize clients
const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
const openai = new OpenAI({ apiKey: CONFIG.OPENAI_API_KEY });

// Load personas
const personasPath = path.join(__dirname, 'personas.json');
const { personas } = JSON.parse(fs.readFileSync(personasPath, 'utf-8'));

// ═══════════════════════════════════════════════════════════════════════════
// PERSONA VOICE PROMPTS
// ═══════════════════════════════════════════════════════════════════════════

const VOICE_PROMPTS = {
    analytical: "You write with precision and data. Use statistics and logical breakdowns.",
    enthusiastic: "You're excited about poker! Use energy and encouragement.",
    experienced: "You've seen it all. Share wisdom from years at the table.",
    technical: "You focus on GTO concepts and solver outputs. Be precise.",
    street_smart: "You learned poker the hard way. Share real-world exploits.",
    casual: "Keep it light and conversational. Poker should be fun.",
    motivational: "Inspire players to improve. Focus on growth mindset.",
    philosophical: "Connect poker to life lessons. Deep thoughts.",
    disciplined: "Emphasize bankroll management and emotional control.",
    friendly: "Be warm and welcoming to all skill levels.",
    aggressive: "You believe in betting and raising. Push edges.",
    laid_back: "Chill vibes. Don't stress the variance.",
    humorous: "Make poker fun with wit and jokes.",
    wise: "Share old-school wisdom with gravitas.",
    educational: "Teach concepts clearly for learners.",
    confident: "You know your game. Project certainty.",
    practical: "Focus on what works in real games.",
    blue_collar: "Hard work beats talent. Grind it out.",
    nostalgic: "Remember when poker was pure? Share old stories.",
    youthful: "Fresh perspective from the new generation.",
    community: "Build connections. Poker is social.",
    strategic: "Everything is a calculated decision.",
    intuitive: "Trust your reads. Feel the game.",
    southern: "Southern charm with competitive fire.",
    underdog: "Represent the small scenes and underdogs.",
    dedicated: "Commit fully. No half measures.",
    competitive: "Winning is everything. Second place is first loser.",
    relaxed: "Don't let the game stress you out.",
    academic: "Apply rigorous study methods to poker.",
    gritty: "Embrace the grind. No shortcuts.",
    diverse: "Celebrate all forms of poker.",
    working_class: "Poker is a job. Treat it like one.",
    balanced: "Find equilibrium in all things.",
    veteran: "Decades of experience speaking.",
    ambitious: "Always climbing to higher stakes.",
    humble: "Stay grounded despite success.",
    local_pride: "Rep your home poker scene.",
    action_junkie: "More cards = more fun.",
    calculated: "Every decision has expected value.",
    suburban: "Poker life outside the big cities.",
    precise: "Accuracy in everything.",
    adaptable: "Change your game to beat the game.",
    creative: "Think outside the box.",
    welcoming: "Everyone belongs at the table.",
    bilingual: "Bridge cultures through poker.",
    resilient: "Bounce back from downswings.",
    isolated: "Grind from anywhere.",
    deceptive: "Poker is a game of deception.",
    hardworking: "Outwork everyone.",
    optimistic: "The future of poker is bright.",
    soulful: "Poker has a rhythm. Feel it."
};

// ═══════════════════════════════════════════════════════════════════════════
// CONTENT TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════

const CONTENT_TEMPLATES = {
    strategy_tip: {
        prompt: "Write a poker strategy tip about {topic}. Be specific and actionable.",
        topics: [
            "3-betting light from the button",
            "sizing your continuation bets",
            "playing pocket pairs in multiway pots",
            "check-raising the flop as a bluff",
            "when to slow play vs fast play",
            "exploiting tight players preflop",
            "river bet sizing for value",
            "defending your big blind",
            "position awareness in cash games",
            "stack-to-pot ratio decisions"
        ]
    },
    hand_analysis: {
        prompt: "Analyze this poker hand scenario: {topic}. Discuss the decision points.",
        topics: [
            "Hero has AKo on a K-7-2 rainbow flop, facing a check-raise",
            "Holding 77 on a 9-8-6 two-tone board against aggression",
            "AQs facing a 4-bet from a tight player",
            "Flopped set on a wet board, how to maximize value",
            "Bluff catching with middle pair on the river",
            "Playing AA after the flop comes all low cards",
            "Turning your hand into a bluff with missed draws",
            "Multiway pot with top pair weak kicker",
            "Short stack decisions with 15 big blinds",
            "Three-way all-in scenario in a tournament"
        ]
    },
    mindset_post: {
        prompt: "Write about poker mindset and mental game regarding: {topic}",
        topics: [
            "staying focused during long sessions",
            "handling bad beats gracefully",
            "avoiding tilt triggers",
            "building confidence at the table",
            "managing expectations and variance",
            "the importance of study away from the table",
            "knowing when to quit a session",
            "separating results from decisions",
            "dealing with intimidating opponents",
            "celebrating small wins"
        ]
    },
    beginner_guide: {
        prompt: "Explain this poker concept for beginners: {topic}",
        topics: [
            "understanding position at the table",
            "starting hand selection basics",
            "pot odds explained simply",
            "reading the board texture",
            "betting and raising fundamentals",
            "when to fold preflop",
            "the importance of bankroll management",
            "table etiquette for new players",
            "understanding hand rankings",
            "live poker vs online differences"
        ]
    },
    advanced_concept: {
        prompt: "Dive deep into this advanced poker concept: {topic}",
        topics: [
            "range construction and balance",
            "GTO vs exploitative play",
            "multi-street planning",
            "blockers and card removal effects",
            "polarized vs merged ranges",
            "geometric bet sizing",
            "ICM considerations in tournaments",
            "minimum defense frequency",
            "node locking in solvers",
            "understanding equity realization"
        ]
    },
    bankroll_advice: {
        prompt: "Give bankroll management advice about: {topic}",
        topics: [
            "proper buy-in requirements for stakes",
            "moving up in stakes responsibly",
            "handling downswings without going broke",
            "separating poker money from life money",
            "taking shots at higher stakes",
            "when to move down in stakes",
            "tracking results and hourly rate",
            "setting stop-loss limits",
            "bankroll for tournaments vs cash",
            "building your first poker bankroll"
        ]
    },
    tournament_tip: {
        prompt: "Share tournament poker advice about: {topic}",
        topics: [
            "early stage tournament strategy",
            "approaching the bubble",
            "final table adjustments",
            "playing short stacked effectively",
            "accumulating chips without showdown",
            "ICM pressure decisions",
            "heads-up tournament play",
            "satellite vs main event strategy",
            "managing energy in long tournaments",
            "re-entry and rebuy strategy"
        ]
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// CONTENT GENERATOR
// ═══════════════════════════════════════════════════════════════════════════

class ContentGenerator {

    /**
     * Generate a single piece of content
     */
    async generateContent(persona, contentType) {
        const template = CONTENT_TEMPLATES[contentType];
        const topic = this.randomChoice(template.topics);
        const voiceGuide = VOICE_PROMPTS[persona.voice] || VOICE_PROMPTS.casual;

        const systemPrompt = `You are ${persona.name}, a poker player from ${persona.location}. 
Your specialty is ${persona.specialty.replace('_', ' ')} at ${persona.stakes}.
Bio: ${persona.bio}

VOICE STYLE: ${voiceGuide}

Write as this person would naturally write - authentic, personal, and based on real experience.
Keep posts between 100-300 words. No hashtags. No emojis unless they fit naturally.
Reference your background when relevant.`;

        const userPrompt = template.prompt.replace('{topic}', topic);

        try {
            const response = await openai.chat.completions.create({
                model: 'gpt-4o',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                max_tokens: 500,
                temperature: 0.8
            });

            const content = response.choices[0].message.content;

            return {
                persona_id: persona.id,
                author_name: persona.name,
                author_alias: persona.alias,
                author_location: persona.location,
                content_type: contentType,
                topic: topic,
                body: content,
                created_at: new Date().toISOString()
            };
        } catch (error) {
            console.error(`Error generating content for ${persona.name}:`, error);
            return null;
        }
    }

    /**
     * Generate a batch of content
     */
    async generateBatch(count = 20) {
        const results = [];

        for (let i = 0; i < count; i++) {
            const persona = this.randomChoice(personas);
            const contentType = this.randomChoice(CONFIG.CONTENT_TYPES);

            const content = await this.generateContent(persona, contentType);
            if (content) {
                results.push(content);
                console.log(`✅ Generated: ${content.author_name} - ${content.content_type}`);
            }

            // Small delay to avoid rate limits
            await this.sleep(1000);
        }

        return results;
    }

    /**
     * Post content to Supabase
     */
    async postToDatabase(content) {
        const { data, error } = await supabase
            .from('seeded_content')
            .insert(content)
            .select();

        if (error) {
            console.error('Database insert error:', error);
            return null;
        }

        return data;
    }

    /**
     * Run the content seeding loop
     */
    async runSeedingLoop(totalPosts = 100) {
        console.log(`\n🚀 CONTENT COMMANDER: Starting seed of ${totalPosts} posts\n`);

        const batchSize = 10;
        const batches = Math.ceil(totalPosts / batchSize);

        for (let i = 0; i < batches; i++) {
            const remaining = totalPosts - (i * batchSize);
            const currentBatch = Math.min(batchSize, remaining);

            console.log(`\n📦 Batch ${i + 1}/${batches} (${currentBatch} posts)`);

            const content = await this.generateBatch(currentBatch);

            // Post to database
            for (const post of content) {
                await this.postToDatabase(post);
            }

            // Delay between batches
            if (i < batches - 1) {
                console.log('⏳ Waiting before next batch...');
                await this.sleep(5000);
            }
        }

        console.log(`\n✅ CONTENT COMMANDER: Seeding complete! ${totalPosts} posts created.\n`);
    }

    // Utility functions
    randomChoice(array) {
        return array[Math.floor(Math.random() * array.length)];
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS & CLI
// ═══════════════════════════════════════════════════════════════════════════

export const contentGenerator = new ContentGenerator();

// CLI execution
if (process.argv[2] === 'seed') {
    const count = parseInt(process.argv[3]) || 100;
    contentGenerator.runSeedingLoop(count);
}

export default ContentGenerator;
