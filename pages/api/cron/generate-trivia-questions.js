/**
 * GROK TRIVIA QUESTION GENERATOR
 * Generates high-quality poker trivia questions using Grok AI
 * Runs as a cron job to build up the 600+ question pool per category
 */

import { getGrokClient } from '../../../src/lib/grokClient';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CATEGORIES = [
    { id: 'poker_history', name: 'Poker History', mode: 'history' },
    { id: 'famous_hands', name: 'Famous Hands', mode: 'history' },
    { id: 'rule_knowledge', name: 'Rules & Etiquette', mode: 'rules' },
    { id: 'gto_theory', name: 'GTO Theory', mode: 'pro' },
    { id: 'player_profiles', name: 'Player Profiles', mode: 'history' },
    { id: 'tournament_facts', name: 'Tournament Facts', mode: 'history' }
];

const DIFFICULTY_WEIGHTS = {
    easy: 3,
    medium: 5,
    hard: 2
};

async function generateQuestionsForCategory(category, count = 10) {
    const grok = getGrokClient();

    const difficultyDistribution = [];
    for (const [diff, weight] of Object.entries(DIFFICULTY_WEIGHTS)) {
        const diffCount = Math.round((weight / 10) * count);
        difficultyDistribution.push(...Array(diffCount).fill(diff));
    }

    const prompt = `Generate ${count} unique poker trivia questions for the category "${category.name}".

Requirements:
- Questions must be factually accurate and verifiable
- Include a mix of difficulties: ${difficultyDistribution.join(', ')}
- Each question has exactly 4 answer options
- Provide a brief explanation for the correct answer
- Questions should NOT repeat common/obvious facts
- Focus on interesting, engaging trivia that poker enthusiasts would enjoy

Return as a JSON array with this exact structure:
[
    {
        "question": "The question text",
        "options": ["Option A", "Option B", "Option C", "Option D"],
        "correct_index": 0,
        "difficulty": "easy|medium|hard",
        "explanation": "Why this answer is correct"
    }
]

Category focus: ${category.name}
Make questions specific, not generic. Include years, names, specific details.`;

    try {
        const response = await grok.chat.completions.create({
            model: 'grok-3',
            messages: [
                {
                    role: 'system',
                    content: 'You are an expert poker historian and rules expert. Generate accurate, engaging trivia questions. Always return valid JSON arrays.'
                },
                { role: 'user', content: prompt }
            ],
            response_format: { type: 'json_object' },
            temperature: 0.8
        });

        const content = response.choices[0]?.message?.content;
        if (!content) throw new Error('No content in Grok response');

        // Parse the JSON response
        const parsed = JSON.parse(content);
        const questions = Array.isArray(parsed) ? parsed : parsed.questions || [];

        return questions.map(q => ({
            category: category.id,
            difficulty: q.difficulty || 'medium',
            question: q.question,
            options: q.options,
            correct_index: q.correct_index,
            explanation: q.explanation,
            source: 'grok-generated',
            created_at: new Date().toISOString()
        }));
    } catch (error) {
        console.error(`Error generating questions for ${category.name}:`, error);
        return [];
    }
}

async function getQuestionCounts() {
    const counts = {};
    for (const cat of CATEGORIES) {
        const { count } = await supabase
            .from('trivia_questions')
            .select('*', { count: 'exact', head: true })
            .eq('category', cat.id);
        counts[cat.id] = count || 0;
    }
    return counts;
}

export default async function handler(req, res) {
    // Verify cron secret
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        console.log('[Grok Trivia] Starting question generation...');

        // Get current question counts
        const counts = await getQuestionCounts();
        const TARGET_PER_CATEGORY = 600;

        // Find categories that need more questions
        const needsQuestions = CATEGORIES.filter(cat => counts[cat.id] < TARGET_PER_CATEGORY);

        if (needsQuestions.length === 0) {
            return res.status(200).json({
                success: true,
                message: 'All categories have sufficient questions',
                counts
            });
        }

        // Generate questions for the category with fewest questions
        const targetCategory = needsQuestions.sort((a, b) =>
            (counts[a.id] || 0) - (counts[b.id] || 0)
        )[0];

        const questionsNeeded = Math.min(20, TARGET_PER_CATEGORY - (counts[targetCategory.id] || 0));
        console.log(`[Grok Trivia] Generating ${questionsNeeded} questions for ${targetCategory.name}`);

        const newQuestions = await generateQuestionsForCategory(targetCategory, questionsNeeded);

        if (newQuestions.length > 0) {
            // Insert into database
            const { data, error } = await supabase
                .from('trivia_questions')
                .insert(newQuestions)
                .select();

            if (error) {
                console.error('[Grok Trivia] Insert error:', error);
                throw error;
            }

            console.log(`[Grok Trivia] Inserted ${data.length} questions for ${targetCategory.name}`);

            return res.status(200).json({
                success: true,
                category: targetCategory.name,
                generated: data.length,
                previousCount: counts[targetCategory.id],
                newCount: (counts[targetCategory.id] || 0) + data.length,
                target: TARGET_PER_CATEGORY
            });
        }

        return res.status(200).json({
            success: false,
            message: 'No questions generated',
            category: targetCategory.name
        });

    } catch (error) {
        console.error('[Grok Trivia] Error:', error);
        return res.status(500).json({ error: error.message });
    }
}
