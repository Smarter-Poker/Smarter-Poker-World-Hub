/**
 * TRIVIA BOOTSTRAP SCRIPT
 * One-time bulk generation of questions for initial pool
 * Generates 250 questions per category (1,500 total)
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { getGrokClient } from '../../../src/lib/grokClient';
import { validateBatch } from '../../../src/lib/triviaValidator';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CATEGORIES = [
    {
        id: 'poker_history',
        name: 'Poker History',
        topics: [
            'Origins of poker and card games',
            'Evolution of Texas Hold\'em',
            'Famous poker venues and casinos',
            'Televised poker history',
            'Online poker evolution',
            'Poker legislation history',
            'Historic high-stakes games'
        ]
    },
    {
        id: 'famous_hands',
        name: 'Famous Hands',
        topics: [
            'WSOP Main Event famous hands',
            'High Stakes Poker iconic moments',
            'Poker After Dark memorable plays',
            'Historic bluffs',
            'Famous bad beats',
            'Championship final table hands',
            'Million dollar pots'
        ]
    },
    {
        id: 'player_profiles',
        name: 'Player Profiles',
        topics: [
            'WSOP bracelet records',
            'Poker Hall of Fame members',
            'Famous tournament winners',
            'Online poker legends',
            'International poker champions',
            'Notable cash game players',
            'Poker personalities and commentators'
        ]
    },
    {
        id: 'tournament_facts',
        name: 'Tournament Facts',
        topics: [
            'WSOP history and statistics',
            'WPT history and champions',
            'EPT and international tours',
            'High roller events',
            'Record prize pools',
            'Notable tournament structures',
            'Online tournament milestones'
        ]
    },
    {
        id: 'rule_knowledge',
        name: 'Rules & Etiquette',
        topics: [
            'Hand rankings and terminology',
            'Betting rules and structures',
            'Tournament rules (TDA)',
            'Cash game procedures',
            'Dealer responsibilities',
            'Table etiquette',
            'Common rule disputes'
        ]
    },
    {
        id: 'gto_theory',
        name: 'GTO Theory',
        topics: [
            'Range construction',
            'Pot odds and implied odds',
            'Position strategy',
            'Bet sizing concepts',
            'Balance and polarization',
            'Exploitative adjustments',
            'ICM and tournament theory'
        ]
    },
    // NEW STRATEGY CATEGORIES - Added Feb 2026
    {
        id: 'mtt_situations',
        name: 'MTT Situations',
        topics: [
            'Bubble play and ICM pressure',
            'Short stack strategy (10-15BB)',
            'Medium stack strategy (25-40BB)',
            'Big stack bullying',
            'Final table dynamics',
            'Pay jump considerations',
            'Blind defense in tournaments',
            'Satellite tournament strategy'
        ]
    },
    {
        id: 'cash_game_situations',
        name: 'Cash Game Situations',
        topics: [
            'Deep stack postflop play (200+ BB)',
            'Set mining and implied odds',
            'Float and probe betting',
            'Stack-to-pot ratio decisions',
            '3-bet pots strategy',
            'Multi-way pot navigation',
            'Exploiting recreational players',
            'Live vs online adjustments'
        ]
    },
    {
        id: 'icm_chip_ev',
        name: 'ICM & Chip EV',
        topics: [
            'Risk premium calculations',
            'Bubble factor adjustments',
            'Nash equilibrium push/fold',
            'Final table ICM spots',
            'Satellite ICM strategy',
            'Chip EV vs dollar EV differences',
            'Deal-making and ICM chops',
            'Short stack ICM decisions'
        ]
    },
    {
        id: 'gto_scenarios',
        name: 'GTO Scenarios',
        topics: [
            'Minimum defense frequency applications',
            'Polarized vs linear betting',
            'Solver-based river decisions',
            'Optimal 3-bet and 4-bet frequencies',
            'Board texture and c-betting',
            'Blocker effects in bluffing',
            'Node locking and exploitation',
            'Mixed strategy applications'
        ]
    }
];

const TARGET_PER_CATEGORY = 250;
const BATCH_SIZE = 25; // Questions per Grok call

async function generateBatch(category, topic, difficulty, count) {
    const grok = getGrokClient();

    const prompt = `Generate exactly ${count} unique poker trivia questions.

Category: ${category.name}
Topic: ${topic}
Difficulty: ${difficulty}

CRITICAL REQUIREMENTS:
- Questions must be FACTUALLY ACCURATE and VERIFIABLE
- Include specific names, dates, dollar amounts, and statistics
- Make them ENGAGING for poker enthusiasts
- NO generic or obvious questions
- Each question has EXACTLY 4 answer options
- Include brief explanation for correct answer

Difficulty Guidelines:
${difficulty === 'easy' ? '- Common knowledge most poker fans would know' : ''}
${difficulty === 'medium' ? '- Requires solid poker knowledge' : ''}
${difficulty === 'hard' ? '- Expert-level, obscure facts' : ''}

Return ONLY valid JSON array:
[{"question":"...","options":["A","B","C","D"],"correct_index":0,"explanation":"..."}]`;

    try {
        const response = await grok.chat.completions.create({
            model: 'grok-3',
            messages: [
                {
                    role: 'system',
                    content: `You are an expert poker historian and strategist. Generate accurate, engaging trivia. Focus specifically on: ${topic}. Return valid JSON only.`
                },
                { role: 'user', content: prompt }
            ],
            response_format: { type: 'json_object' },
            temperature: 0.9,
            max_tokens: 4000
        });

        const content = response.choices[0]?.message?.content;
        if (!content) return [];

        const parsed = JSON.parse(content);
        const questions = Array.isArray(parsed) ? parsed : parsed.questions || [];

        return questions
            .filter(q => q.question && q.options?.length === 4 && typeof q.correct_index === 'number')
            .map(q => ({
                category: category.id,
                difficulty: difficulty,
                question: q.question.trim(),
                options: q.options.map(o => String(o).trim()),
                correct_index: q.correct_index,
                explanation: q.explanation || '',
                subcategory: topic,
                source: 'grok-bootstrap',
                created_at: new Date().toISOString()
            }));
    } catch (error) {
        console.error(`[Bootstrap] Error generating for ${category.name}/${topic}:`, error.message);
        return [];
    }
}

export default async function handler(req, res) {
    // Allow both GET and POST, but require auth
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        // Also allow without auth for admin testing
        const { secret } = req.query;
        if (secret !== process.env.CRON_SECRET) {
            return res.status(401).json({ error: 'Unauthorized - pass secret as query param or Bearer token' });
        }
    }

    // Get target category from query or do all
    const { category: targetCat } = req.query;
    const categoriesToProcess = targetCat
        ? CATEGORIES.filter(c => c.id === targetCat)
        : CATEGORIES;

    if (categoriesToProcess.length === 0) {
        return res.status(400).json({ error: 'Invalid category' });
    }


    const results = {
        started: new Date().toISOString(),
        targetPerCategory: TARGET_PER_CATEGORY,
        categories: {}
    };

    // Process each category
    for (const category of categoriesToProcess) {

        // Get current count
        const { count: existingCount } = await supabase
            .from('trivia_questions')
            .select('*', { count: 'exact', head: true })
            .eq('category', category.id);

        const needed = Math.max(0, TARGET_PER_CATEGORY - (existingCount || 0));

        if (needed === 0) {
            results.categories[category.id] = {
                name: category.name,
                existing: existingCount,
                generated: 0,
                message: 'Already at target'
            };
            continue;
        }


        let generated = 0;
        const difficulties = ['easy', 'medium', 'medium', 'medium', 'hard']; // 20/60/20 distribution

        // Generate in batches across topics
        let batchCount = 0;
        while (generated < needed && batchCount < 15) { // Max 15 batches per category
            const topic = category.topics[batchCount % category.topics.length];
            const difficulty = difficulties[batchCount % difficulties.length];
            const batchNeeded = Math.min(BATCH_SIZE, needed - generated);


            const questions = await generateBatch(category, topic, difficulty, batchNeeded);

            if (questions.length > 0) {
                // ═══ QA VALIDATION GATE ═══
                const { valid: validQuestions, rejected } = validateBatch(questions);
                if (rejected.length > 0) {
                    rejected.forEach(r => r.errors.forEach(e => console.log(`  → ${e}`)));
                }

                if (validQuestions.length > 0) {
                    const { data, error } = await supabase
                        .from('trivia_questions')
                        .insert(validQuestions)
                        .select();

                    if (!error && data) {
                        generated += data.length;
                    } else if (error) {
                        console.error(`[Bootstrap] Insert error:`, error.message);
                    }
                }
            }

            batchCount++;

            // Rate limiting
            await new Promise(r => setTimeout(r, 500));
        }

        results.categories[category.id] = {
            name: category.name,
            existing: existingCount || 0,
            generated,
            total: (existingCount || 0) + generated,
            target: TARGET_PER_CATEGORY
        };
    }

    // Get final counts
    let totalQuestions = 0;
    for (const cat of CATEGORIES) {
        const { count } = await supabase
            .from('trivia_questions')
            .select('*', { count: 'exact', head: true })
            .eq('category', cat.id);
        totalQuestions += count || 0;
    }

    results.completed = new Date().toISOString();
    results.totalQuestions = totalQuestions;
    results.targetTotal = CATEGORIES.length * TARGET_PER_CATEGORY;
    results.progress = `${Math.round((totalQuestions / results.targetTotal) * 100)}%`;


    return res.status(200).json(results);
}
