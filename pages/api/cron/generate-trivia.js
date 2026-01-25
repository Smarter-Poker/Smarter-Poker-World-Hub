/**
 * AI TRIVIA GENERATOR - Daily Cron Job
 * ═══════════════════════════════════════════════════════════════════════════
 * Generates 10 unique poker trivia questions daily using OpenAI
 * Runs at 11:59 PM CST via Vercel Cron (5:59 AM UTC)
 * All dates are in CST (Central Standard Time / America/Chicago)
 *
 * Categories:
 * - poker_history: The legends and milestones of poker
 * - famous_hands: Iconic hands that made history
 * - gto_theory: Game theory optimal concepts
 * - player_profiles: Know the pros and legends
 * - tournament_facts: Major tournament knowledge
 * - rule_knowledge: Official rules and table manners
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// ═══════════════════════════════════════════════════════════════════════════
// CATEGORY CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const CATEGORIES = [
    {
        id: 'poker_history',
        name: 'Poker History',
        prompt: 'Create a trivia question about poker history - the evolution of the game, historical milestones, origins of different poker variants, or important dates in poker history.'
    },
    {
        id: 'famous_hands',
        name: 'Famous Hands',
        prompt: 'Create a trivia question about a famous poker hand - memorable hands from WSOP, televised cash games, iconic bluffs, or legendary showdowns between pros.'
    },
    {
        id: 'gto_theory',
        name: 'GTO Theory',
        prompt: 'Create a trivia question about Game Theory Optimal (GTO) poker concepts - balanced ranges, minimum defense frequency, equity realization, polarization, or solver-based strategies.'
    },
    {
        id: 'player_profiles',
        name: 'Player Profiles',
        prompt: 'Create a trivia question about famous poker players - their achievements, playing styles, nicknames, notable wins, or career milestones. Include players like Phil Hellmuth, Daniel Negreanu, Phil Ivey, Doyle Brunson, etc.'
    },
    {
        id: 'tournament_facts',
        name: 'Tournament Facts',
        prompt: 'Create a trivia question about major poker tournaments - WSOP, WPT, EPT, record prize pools, field sizes, format changes, or notable tournament moments.'
    },
    {
        id: 'rule_knowledge',
        name: 'Rules & Etiquette',
        prompt: 'Create a trivia question about official poker rules or table etiquette - hand rankings edge cases, betting rules, tournament procedures, or proper poker conduct.'
    }
];

const DIFFICULTIES = ['easy', 'medium', 'hard'];

// ═══════════════════════════════════════════════════════════════════════════
// TIMEZONE HELPER - All trivia dates are in CST
// ═══════════════════════════════════════════════════════════════════════════

function getTodayCST() {
    // Get current date in CST (Central Standard Time / America/Chicago)
    const now = new Date();
    const cstDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    const year = cstDate.getFullYear();
    const month = String(cstDate.getMonth() + 1).padStart(2, '0');
    const day = String(cstDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// QUESTION GENERATOR
// ═══════════════════════════════════════════════════════════════════════════

async function generateQuestion(category, difficulty, existingQuestions = []) {
    const existingQuestionsText = existingQuestions.length > 0
        ? `\n\nAVOID THESE TOPICS (already used recently):\n${existingQuestions.map(q => `- ${q}`).join('\n')}`
        : '';

    const systemPrompt = `You are a poker trivia expert creating questions for an educational poker app.
Your questions should be:
- Accurate and fact-checked
- Educational and interesting
- Appropriate for the specified difficulty level
- Have exactly 4 answer options with only ONE correct answer

Difficulty guidelines:
- Easy: Common knowledge any casual poker player would know
- Medium: Requires some poker knowledge or history awareness
- Hard: Requires deep knowledge of poker strategy, history, or professional scene

IMPORTANT: Return ONLY valid JSON, no additional text.`;

    const userPrompt = `${category.prompt}

Difficulty: ${difficulty.toUpperCase()}
${existingQuestionsText}

Return a JSON object with this EXACT structure:
{
    "question": "The trivia question text",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct_index": 0,
    "explanation": "A brief explanation of why this is the correct answer (2-3 sentences)"
}

Remember: correct_index is 0-based (0, 1, 2, or 3).`;

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            max_tokens: 500,
            temperature: 0.8,
            response_format: { type: 'json_object' }
        });

        const content = response.choices[0].message.content;
        const parsed = JSON.parse(content);

        // Validate the response
        if (!parsed.question || !parsed.options || parsed.options.length !== 4 ||
            typeof parsed.correct_index !== 'number' || !parsed.explanation) {
            throw new Error('Invalid question format');
        }

        return {
            category: category.id,
            difficulty,
            question: parsed.question,
            options: parsed.options,
            correct_index: parsed.correct_index,
            explanation: parsed.explanation
        };
    } catch (error) {
        console.error(`Error generating question for ${category.id}:`, error);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// DAILY GENERATION
// ═══════════════════════════════════════════════════════════════════════════

async function generateDailyQuestions() {
    const today = getTodayCST();

    // Check if we already have questions for today
    const { data: existing } = await supabase
        .from('trivia_questions')
        .select('id')
        .eq('daily_date', today)
        .limit(1);

    if (existing && existing.length > 0) {
        console.log(`[Trivia] Questions already exist for ${today}`);
        return { skipped: true, date: today };
    }

    // Get recent questions to avoid repetition
    const { data: recentQuestions } = await supabase
        .from('trivia_questions')
        .select('question')
        .order('created_at', { ascending: false })
        .limit(50);

    const recentQuestionTexts = recentQuestions?.map(q => q.question) || [];

    console.log(`[Trivia] Generating 10 questions for ${today}...`);

    const questions = [];
    const questionsPerCategory = {};

    // Distribute questions across categories (at least 1 per category, 10 total)
    // 6 categories, so we'll have 1 each + 4 extra distributed
    const categoryDistribution = [
        ...CATEGORIES.map(c => c.id),
        'poker_history', 'famous_hands', 'tournament_facts', 'player_profiles'
    ];

    for (let i = 0; i < 10; i++) {
        const categoryId = categoryDistribution[i];
        const category = CATEGORIES.find(c => c.id === categoryId);

        // Rotate through difficulties
        const difficulty = DIFFICULTIES[i % 3];

        const question = await generateQuestion(category, difficulty, recentQuestionTexts);

        if (question) {
            questions.push({
                ...question,
                daily_date: today,
                order_index: i,
                created_at: new Date().toISOString()
            });
            recentQuestionTexts.push(question.question);
            console.log(`[Trivia] Generated Q${i + 1}: ${category.name} (${difficulty})`);
        }

        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Insert all questions
    if (questions.length > 0) {
        const { error } = await supabase
            .from('trivia_questions')
            .insert(questions);

        if (error) {
            console.error('[Trivia] Insert error:', error);
            return { success: false, error: error.message };
        }
    }

    console.log(`[Trivia] Successfully generated ${questions.length} questions for ${today}`);

    return {
        success: true,
        date: today,
        count: questions.length,
        categories: [...new Set(questions.map(q => q.category))]
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// API HANDLER
// ═══════════════════════════════════════════════════════════════════════════

export default async function handler(req, res) {
    // Verify cron secret for Vercel Cron jobs
    const authHeader = req.headers.authorization;
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        // Allow manual triggers in development or with POST
        if (process.env.NODE_ENV === 'production' && req.method !== 'POST') {
            return res.status(401).json({ error: 'Unauthorized' });
        }
    }

    try {
        console.log('[Trivia Generator] Starting daily generation...');

        const result = await generateDailyQuestions();

        if (result.skipped) {
            return res.status(200).json({
                success: true,
                message: 'Questions already exist for today',
                ...result
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Daily trivia generated successfully',
            ...result,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('[Trivia Generator] Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}

// Vercel Cron config - runs at 11:59 PM CST (5:59 AM UTC)
export const config = {
    maxDuration: 60
};
