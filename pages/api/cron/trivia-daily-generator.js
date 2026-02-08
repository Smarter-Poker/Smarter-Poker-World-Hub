/**
 * DAILY TRIVIA QUESTION GENERATOR — Powered by Grok AI
 * Runs at 11:59:59 PM CST daily via Vercel cron
 * Generates fresh poker trivia questions for the next day
 */

import { getGrokClient } from '../../../src/lib/grokClient';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase admin client
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Categories and their descriptions for Grok
const TRIVIA_CATEGORIES = [
    { id: 'poker_history', prompt: 'a lesser-known fact about poker history, historic tournaments, or the evolution of the game' },
    { id: 'famous_hands', prompt: 'a famous televised poker hand, including the players involved, the stakes, and why it was memorable' },
    { id: 'player_profiles', prompt: 'an interesting fact about a famous professional poker player (living or deceased)' },
    { id: 'rule_knowledge', prompt: 'an official poker rule from WSOP or TDA guidelines that many players might not know' },
    { id: 'gto_theory', prompt: 'a Game Theory Optimal (GTO) poker concept or strategy principle' },
    { id: 'tournament_facts', prompt: 'an interesting fact about major poker tournaments like WSOP, WPT, or EPT' },
    // Strategy categories - Added Feb 2026
    { id: 'mtt_situations', prompt: 'a multi-table tournament situation involving ICM pressure, bubble play, short stack strategy, or final table dynamics' },
    { id: 'cash_game_situations', prompt: 'a cash game scenario involving deep stack play, implied odds, float betting, 3-bet pots, or exploiting recreational players' },
    { id: 'icm_chip_ev', prompt: 'an ICM or chip EV concept such as risk premium, bubble factor, Nash equilibrium push/fold, or deal-making calculations' },
    { id: 'gto_scenarios', prompt: 'a GTO solver scenario involving minimum defense frequency, polarized vs linear betting, blocker effects, or mixed strategies' }
];

/**
 * Generate a trivia question using Grok AI
 */
async function generateQuestion(category) {
    const grok = getGrokClient();

    const systemPrompt = `You are a poker trivia expert. Generate a challenging but fair trivia question for poker enthusiasts.
    
The question MUST be:
- Factually accurate and verifiable
- Interesting and educational
- Not too obscure (answerable by dedicated poker fans)
- Have exactly 4 answer options (A, B, C, D)
- Have only ONE correct answer

Respond in this exact JSON format (no markdown, just raw JSON):
{
    "question": "The full question text",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct_index": 0,
    "explanation": "A brief explanation of why this is the correct answer",
    "difficulty": "medium"
}

The correct_index is 0-based (0=A, 1=B, 2=C, 3=D).
Difficulty should be one of: easy, medium, hard.`;

    const userPrompt = `Generate a poker trivia question about ${category.prompt}.

Important: Make sure the question is unique and not a commonly asked trivia question. Be creative and educational.`;

    try {
        const response = await grok.chat.completions.create({
            model: 'grok-3',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.8,
            max_tokens: 500
        });

        const content = response.choices[0].message.content.trim();

        // Parse JSON response
        const parsed = JSON.parse(content);

        // Validate structure
        if (!parsed.question || !parsed.options || parsed.options.length !== 4 ||
            typeof parsed.correct_index !== 'number' || !parsed.explanation) {
            throw new Error('Invalid question structure from Grok');
        }

        return {
            category: category.id,
            question: parsed.question,
            options: parsed.options,
            correct_index: parsed.correct_index,
            explanation: parsed.explanation,
            difficulty: parsed.difficulty || 'medium',
            generated_by: 'grok-3'
        };
    } catch (error) {
        console.error(`Failed to generate question for ${category.id}:`, error);
        return null;
    }
}

/**
 * Get tomorrow's date in CST timezone
 */
function getTomorrowCST() {
    const now = new Date();
    const cst = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    cst.setDate(cst.getDate() + 1);
    const year = cst.getFullYear();
    const month = String(cst.getMonth() + 1).padStart(2, '0');
    const day = String(cst.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export default async function handler(req, res) {
    // Verify cron secret for security
    const cronSecret = req.headers['x-cron-secret'] || req.query.secret;
    if (cronSecret !== process.env.CRON_SECRET && process.env.NODE_ENV === 'production') {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('[Trivia Cron] Starting daily question generation...');

    const tomorrowDate = getTomorrowCST();
    const results = {
        date: tomorrowDate,
        generated: [],
        failed: [],
        dailySelected: null
    };

    try {
        // Generate one question per category
        for (const category of TRIVIA_CATEGORIES) {
            console.log(`[Trivia Cron] Generating ${category.id} question...`);

            const question = await generateQuestion(category);

            if (question) {
                // Insert into database
                const { data, error } = await supabase
                    .from('trivia_questions')
                    .insert({
                        category: question.category,
                        question: question.question,
                        options: question.options,
                        correct_index: question.correct_index,
                        explanation: question.explanation,
                        difficulty: question.difficulty,
                        daily_date: null, // Not assigned as daily yet
                        created_at: new Date().toISOString()
                    })
                    .select()
                    .single();

                if (error) {
                    console.error(`[Trivia Cron] DB error for ${category.id}:`, error);
                    results.failed.push({ category: category.id, error: error.message });
                } else {
                    results.generated.push({ category: category.id, id: data.id });
                }
            } else {
                results.failed.push({ category: category.id, error: 'Grok generation failed' });
            }

            // Small delay between API calls
            await new Promise(r => setTimeout(r, 500));
        }

        // Select one random question as tomorrow's DAILY question
        if (results.generated.length > 0) {
            const randomIndex = Math.floor(Math.random() * results.generated.length);
            const selectedQuestion = results.generated[randomIndex];

            // Mark as daily question
            const { error: updateError } = await supabase
                .from('trivia_questions')
                .update({ daily_date: tomorrowDate })
                .eq('id', selectedQuestion.id);

            if (!updateError) {
                results.dailySelected = {
                    id: selectedQuestion.id,
                    category: selectedQuestion.category,
                    date: tomorrowDate
                };
                console.log(`[Trivia Cron] Selected daily question: ${selectedQuestion.id} (${selectedQuestion.category})`);
            }
        }

        console.log('[Trivia Cron] Generation complete:', results);

        return res.status(200).json({
            success: true,
            message: `Generated ${results.generated.length} questions for ${tomorrowDate}`,
            ...results
        });

    } catch (error) {
        console.error('[Trivia Cron] Fatal error:', error);
        return res.status(500).json({
            success: false,
            error: error.message,
            ...results
        });
    }
}
