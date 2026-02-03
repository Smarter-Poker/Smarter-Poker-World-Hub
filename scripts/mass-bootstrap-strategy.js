#!/usr/bin/env node
/**
 * MASS BOOTSTRAP - Generates 250 questions per new strategy category
 * Uses Grok API directly from local machine
 * Run with: node scripts/mass-bootstrap-strategy.js
 */

require('dotenv').config({ path: '.env.local' });

const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const grok = new OpenAI({
    apiKey: process.env.XAI_API_KEY,
    baseURL: 'https://api.x.ai/v1'
});

const CATEGORIES = [
    {
        id: 'mtt_situations',
        name: 'MTT Situations',
        topics: [
            'Bubble play and ICM pressure',
            'Short stack strategy (10-15 BB)',
            'Medium stack strategy (25-40 BB)',
            'Big stack bullying',
            'Final table dynamics',
            'Pay jump considerations',
            'Blind defense in tournaments',
            'Satellite tournament strategy',
            'Late registration decisions',
            'Push-fold ranges'
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
            'Pot control and thin value',
            '4-bet pots and 5-bet shoves',
            'River bluffing decisions'
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
            'Short stack ICM decisions',
            'Big stack ICM advantages',
            'Pay jump math'
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
            'Mixed strategy applications',
            'Range construction',
            'Equity denial concepts'
        ]
    }
];

const TARGET_PER_CATEGORY = 250;
const BATCH_SIZE = 15;

async function generateBatch(category, topic, difficulty, count) {
    const prompt = `Generate ${count} unique poker strategy trivia questions.

Category: ${category.name}
Specific Topic: ${topic}
Difficulty: ${difficulty}

Requirements:
- Questions must test PRACTICAL POKER KNOWLEDGE
- Include specific scenarios with stack sizes, positions, and actions
- For ${difficulty}: ${difficulty === 'easy' ? 'Basic concepts most regular players know' : difficulty === 'medium' ? 'Solid strategy understanding required' : 'Expert-level solver-based knowledge'}
- Each question has EXACTLY 4 answer options
- Provide brief explanation for correct answer

Return ONLY valid JSON array (no markdown):
[{"question":"...","options":["A","B","C","D"],"correct_index":0,"explanation":"..."}]`;

    try {
        const response = await grok.chat.completions.create({
            model: 'grok-3-mini',
            messages: [
                { role: 'system', content: `You are a world-class poker strategist. Generate practical trivia about ${topic}. Return valid JSON only.` },
                { role: 'user', content: prompt }
            ],
            temperature: 0.9,
            max_tokens: 3000
        });

        const content = response.choices[0]?.message?.content;
        if (!content) return [];

        // Clean markdown if present
        let cleaned = content.trim();
        if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
        }

        const parsed = JSON.parse(cleaned);
        const questions = Array.isArray(parsed) ? parsed : parsed.questions || [];

        return questions
            .filter(q => q.question && q.options?.length === 4 && typeof q.correct_index === 'number')
            .map(q => ({
                category: category.id,
                difficulty,
                question: q.question.trim(),
                options: q.options.map(o => String(o).trim()),
                correct_index: q.correct_index,
                explanation: q.explanation || ''
            }));
    } catch (error) {
        console.error(`  Error: ${error.message}`);
        return [];
    }
}

async function main() {
    console.log('🚀 MASS BOOTSTRAP - Generating 250 questions per category\n');

    for (const category of CATEGORIES) {
        console.log(`\n📚 ${category.name}`);

        // Check current count
        const { count: existing } = await supabase
            .from('trivia_questions')
            .select('*', { count: 'exact', head: true })
            .eq('category', category.id);

        const needed = Math.max(0, TARGET_PER_CATEGORY - (existing || 0));
        console.log(`   Current: ${existing || 0}, Need: ${needed}`);

        if (needed <= 0) {
            console.log(`   ✅ Already at target!`);
            continue;
        }

        let generated = 0;
        const difficulties = ['easy', 'medium', 'medium', 'medium', 'hard'];
        let batchNum = 0;

        while (generated < needed && batchNum < 20) {
            const topic = category.topics[batchNum % category.topics.length];
            const diff = difficulties[batchNum % 5];
            const toGenerate = Math.min(BATCH_SIZE, needed - generated);

            process.stdout.write(`   Batch ${batchNum + 1}: ${diff} ${topic.substring(0, 30)}... `);

            const questions = await generateBatch(category, topic, diff, toGenerate);

            if (questions.length > 0) {
                const { data, error } = await supabase
                    .from('trivia_questions')
                    .insert(questions)
                    .select();

                if (!error && data) {
                    generated += data.length;
                    console.log(`✅ +${data.length} (total: ${(existing || 0) + generated})`);
                } else {
                    console.log(`❌ ${error?.message}`);
                }
            } else {
                console.log(`⚠️ No valid questions`);
            }

            batchNum++;

            // Rate limit
            await new Promise(r => setTimeout(r, 1000));
        }

        console.log(`   📊 Final: ${(existing || 0) + generated} questions`);
    }

    // Summary
    console.log('\n\n📊 FINAL SUMMARY:');
    for (const cat of CATEGORIES) {
        const { count } = await supabase
            .from('trivia_questions')
            .select('*', { count: 'exact', head: true })
            .eq('category', cat.id);
        console.log(`   ${cat.name}: ${count || 0} / ${TARGET_PER_CATEGORY}`);
    }

    console.log('\n✅ Mass bootstrap complete!');
}

main().catch(console.error);
