/**
 * TRIVIA QUESTION POOL MANAGER
 * Ensures sufficient pre-generated questions for seamless gameplay
 * 
 * Requirements Analysis:
 * - Survival Mode: 200 questions per complete run (10 levels × 20)
 * - Mixed Mode: 15 questions per session
 * - Endless Mode: Unlimited (uses entire pool)
 * - Daily Trivia: 10 questions
 * - Category Modes: 10 questions each
 * - PvP: 5 questions per match
 * - Tournaments: 20 questions per event
 * 
 * With 60-day non-repeat, a daily player needs:
 * - ~200 Survival + ~15 Mixed + ~10 Daily = 225+ questions/day
 * - Over 60 days = 13,500 unique questions minimum
 * 
 * Target: 3,000 questions per category = 18,000 total questions
 */

import { createClient } from '@supabase/supabase-js';
import { getGrokClient } from '../../../src/lib/grokClient';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Category definitions with subcategories for variety
const CATEGORIES = [
    {
        id: 'poker_history',
        name: 'Poker History',
        subcategories: [
            'Origins and evolution of poker',
            'Important dates in poker history',
            'Historic poker venues and casinos',
            'Poker in pop culture and media',
            'Evolution of online poker',
            'Historic WSOP moments',
            'Legendary poker games'
        ]
    },
    {
        id: 'famous_hands',
        name: 'Famous Hands',
        subcategories: [
            'WSOP Main Event famous hands',
            'High Stakes Poker iconic moments',
            'Poker After Dark memorable plays',
            'Bad beats and coolers',
            'Bluffs that made history',
            'Heads-up championship hands',
            'Notable tournament final table hands'
        ]
    },
    {
        id: 'player_profiles',
        name: 'Player Profiles',
        subcategories: [
            'WSOP bracelet winners',
            'Poker Hall of Fame members',
            'International poker champions',
            'Online poker legends',
            'Cash game specialists',
            'Tournament grinders',
            'Poker commentators and personalities'
        ]
    },
    {
        id: 'tournament_facts',
        name: 'Tournament Facts',
        subcategories: [
            'WSOP history and records',
            'WPT history and champions',
            'EPT and international tours',
            'High roller events',
            'Online tournament milestones',
            'Prize pool records',
            'Biggest poker tournaments ever'
        ]
    },
    {
        id: 'rule_knowledge',
        name: 'Rules & Etiquette',
        subcategories: [
            'Hand rankings and terminology',
            'Betting rules and structures',
            'Tournament rules (TDA)',
            'Cash game procedures',
            'Dealer responsibilities',
            'Poker etiquette',
            'Angle shooting and illegal moves'
        ]
    },
    {
        id: 'gto_theory',
        name: 'GTO Theory',
        subcategories: [
            'Range construction basics',
            'Pot odds and equity',
            'Position and relative position',
            'Bet sizing theory',
            'Balance and polarization',
            'Exploitative vs GTO play',
            'Solver concepts'
        ]
    }
];

const DIFFICULTY_DISTRIBUTION = { easy: 25, medium: 50, hard: 25 }; // percentages
const TARGET_PER_CATEGORY = 3000;
const BATCH_SIZE = 30; // Questions per Grok call
const MAX_BATCHES_PER_RUN = 3; // Limit per cron execution

/**
 * Check for duplicate questions using semantic similarity
 */
async function checkForDuplicates(newQuestion, category) {
    // Get existing questions with similar keywords
    const keywords = newQuestion.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(' ')
        .filter(w => w.length > 4)
        .slice(0, 5);

    if (keywords.length === 0) return false;

    // Check against existing questions
    const { data: existing } = await supabase
        .from('trivia_questions')
        .select('question')
        .eq('category', category)
        .limit(500);

    if (!existing) return false;

    // Simple keyword overlap check
    for (const eq of existing) {
        const existingWords = eq.question.toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .split(' ')
            .filter(w => w.length > 4);

        const overlap = keywords.filter(k => existingWords.includes(k)).length;
        if (overlap >= 3 || (keywords.length <= 3 && overlap === keywords.length)) {
            return true; // Likely duplicate
        }
    }

    return false;
}

/**
 * Generate a batch of questions for a specific category and subcategory
 */
async function generateBatch(category, subcategory, difficulty, count) {
    const grok = getGrokClient();

    const prompt = `Generate ${count} unique poker trivia questions.

Category: ${category.name}
Specific Focus: ${subcategory}
Difficulty: ${difficulty}

Requirements:
- Questions must be FACTUALLY ACCURATE and VERIFIABLE
- Include specific names, dates, amounts, and details
- Make questions INTERESTING and ENGAGING for poker enthusiasts
- For ${difficulty} difficulty:
  ${difficulty === 'easy' ? '- Common knowledge that most poker fans would know' : ''}
  ${difficulty === 'medium' ? '- Requires solid poker knowledge but not obscure' : ''}
  ${difficulty === 'hard' ? '- Deep knowledge, obscure facts, requires expert-level understanding' : ''}
- Do NOT repeat commonly asked trivia facts
- Each question must have EXACTLY 4 answer options
- Provide a brief explanation for why the correct answer is right

Return ONLY a valid JSON array:
[
    {
        "question": "The exact question text",
        "options": ["Option A", "Option B", "Option C", "Option D"],
        "correct_index": 0,
        "explanation": "Brief explanation of why this is correct"
    }
]`;

    try {
        const response = await grok.chat.completions.create({
            model: 'grok-3',
            messages: [
                {
                    role: 'system',
                    content: `You are an expert poker historian, rules expert, and GTO specialist. Generate accurate, engaging trivia questions. Focus on ${subcategory}. Always return valid JSON arrays only, no markdown formatting.`
                },
                { role: 'user', content: prompt }
            ],
            response_format: { type: 'json_object' },
            temperature: 0.85, // Slightly higher for variety
            max_tokens: 4000
        });

        const content = response.choices[0]?.message?.content;
        if (!content) throw new Error('No content in Grok response');

        // Parse JSON response
        const parsed = JSON.parse(content);
        const questions = Array.isArray(parsed) ? parsed : parsed.questions || [];

        // Validate and format questions
        return questions
            .filter(q => q.question && q.options?.length === 4 && typeof q.correct_index === 'number')
            .map(q => ({
                category: category.id,
                difficulty: difficulty,
                question: q.question.trim(),
                options: q.options.map(o => o.trim()),
                correct_index: q.correct_index,
                explanation: q.explanation || '',
                subcategory: subcategory,
                source: 'grok-generated',
                created_at: new Date().toISOString(),
                last_used_at: null // For 60-day tracking
            }));
    } catch (error) {
        console.error(`[Question Pool] Generation error for ${category.name}/${subcategory}:`, error);
        return [];
    }
}

/**
 * Get current question pool statistics
 */
async function getPoolStats() {
    const stats = {};

    for (const cat of CATEGORIES) {
        const { count: total } = await supabase
            .from('trivia_questions')
            .select('*', { count: 'exact', head: true })
            .eq('category', cat.id);

        const { count: easy } = await supabase
            .from('trivia_questions')
            .select('*', { count: 'exact', head: true })
            .eq('category', cat.id)
            .eq('difficulty', 'easy');

        const { count: medium } = await supabase
            .from('trivia_questions')
            .select('*', { count: 'exact', head: true })
            .eq('category', cat.id)
            .eq('difficulty', 'medium');

        const { count: hard } = await supabase
            .from('trivia_questions')
            .select('*', { count: 'exact', head: true })
            .eq('category', cat.id)
            .eq('difficulty', 'hard');

        stats[cat.id] = {
            total: total || 0,
            easy: easy || 0,
            medium: medium || 0,
            hard: hard || 0,
            target: TARGET_PER_CATEGORY,
            progress: Math.round(((total || 0) / TARGET_PER_CATEGORY) * 100)
        };
    }

    return stats;
}

/**
 * Determine what questions are needed
 */
function determineNeededQuestions(stats) {
    const needs = [];

    for (const cat of CATEGORIES) {
        const catStats = stats[cat.id];
        if (catStats.total >= TARGET_PER_CATEGORY) continue;

        // Calculate needed per difficulty
        const totalNeeded = TARGET_PER_CATEGORY - catStats.total;

        for (const [diff, targetPercent] of Object.entries(DIFFICULTY_DISTRIBUTION)) {
            const targetCount = Math.floor(TARGET_PER_CATEGORY * (targetPercent / 100));
            const currentCount = catStats[diff];
            const needed = Math.max(0, targetCount - currentCount);

            if (needed > 0) {
                needs.push({
                    category: cat,
                    difficulty: diff,
                    needed,
                    priority: needed / totalNeeded // Higher priority for more needed
                });
            }
        }
    }

    // Sort by priority (most needed first)
    return needs.sort((a, b) => b.priority - a.priority);
}

export default async function handler(req, res) {
    // Verify cron secret
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        console.log('[Question Pool] Starting question pool management...');

        // Get current stats
        const stats = await getPoolStats();
        const totalQuestions = Object.values(stats).reduce((sum, s) => sum + s.total, 0);
        const targetTotal = CATEGORIES.length * TARGET_PER_CATEGORY;

        console.log(`[Question Pool] Current: ${totalQuestions} / ${targetTotal} total questions`);

        // Check if pool is complete
        if (totalQuestions >= targetTotal) {
            return res.status(200).json({
                success: true,
                message: 'Question pool is complete!',
                stats,
                totalQuestions,
                targetTotal
            });
        }

        // Determine what's needed
        const needs = determineNeededQuestions(stats);

        if (needs.length === 0) {
            return res.status(200).json({
                success: true,
                message: 'All categories balanced',
                stats
            });
        }

        // Generate questions in batches
        let generated = 0;
        const results = [];

        for (let batch = 0; batch < MAX_BATCHES_PER_RUN && needs.length > 0; batch++) {
            const need = needs[batch % needs.length];
            if (!need) break;

            // Pick a random subcategory for variety
            const subcategory = need.category.subcategories[
                Math.floor(Math.random() * need.category.subcategories.length)
            ];

            const batchCount = Math.min(BATCH_SIZE, need.needed);
            console.log(`[Question Pool] Generating ${batchCount} ${need.difficulty} questions for ${need.category.name}/${subcategory}`);

            const questions = await generateBatch(need.category, subcategory, need.difficulty, batchCount);

            if (questions.length > 0) {
                // Filter out potential duplicates
                const uniqueQuestions = [];
                for (const q of questions) {
                    const isDupe = await checkForDuplicates(q.question, need.category.id);
                    if (!isDupe) {
                        uniqueQuestions.push(q);
                    } else {
                        console.log(`[Question Pool] Skipping duplicate: ${q.question.slice(0, 50)}...`);
                    }
                }

                if (uniqueQuestions.length > 0) {
                    const { data, error } = await supabase
                        .from('trivia_questions')
                        .insert(uniqueQuestions)
                        .select();

                    if (error) {
                        console.error('[Question Pool] Insert error:', error);
                    } else {
                        generated += data.length;
                        results.push({
                            category: need.category.name,
                            subcategory,
                            difficulty: need.difficulty,
                            generated: data.length
                        });
                    }
                }
            }

            // Rate limiting - wait between batches
            if (batch < MAX_BATCHES_PER_RUN - 1) {
                await new Promise(r => setTimeout(r, 1000));
            }
        }

        // Get updated stats
        const updatedStats = await getPoolStats();
        const newTotal = Object.values(updatedStats).reduce((sum, s) => sum + s.total, 0);

        return res.status(200).json({
            success: true,
            message: `Generated ${generated} new questions`,
            results,
            previousTotal: totalQuestions,
            newTotal,
            targetTotal,
            progress: `${Math.round((newTotal / targetTotal) * 100)}%`,
            stats: updatedStats
        });

    } catch (error) {
        console.error('[Question Pool] Error:', error);
        return res.status(500).json({ error: error.message });
    }
}
