#!/usr/bin/env node
/**
 * LOCAL TRIVIA BOOTSTRAP SCRIPT
 * Run directly with: node scripts/bootstrap-trivia.js
 * Bypasses Vercel's 30-second timeout limit
 * 
 * Generates 250 questions per category with proper difficulty distribution:
 * - 50 Easy (for levels 1-3)
 * - 125 Medium (for levels 4-7)
 * - 75 Hard (for levels 8-10)
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

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
    }
];

// Difficulty distribution per category (250 total)
// Level 1-3: Easy, Level 4-7: Medium, Level 8-10: Hard
const DIFFICULTY_TARGETS = {
    easy: 50,    // 20% - Levels 1-3
    medium: 125, // 50% - Levels 4-7
    hard: 75     // 30% - Levels 8-10
};

const BATCH_SIZE = 15; // Questions per API call

async function getGrokClient() {
    const OpenAI = require('openai');
    return new OpenAI({
        apiKey: process.env.XAI_API_KEY,
        baseURL: 'https://api.x.ai/v1'
    });
}

async function generateBatch(grok, category, topic, difficulty, count) {
    const difficultyGuidelines = {
        easy: `
- Common knowledge most poker fans would know
- Basic facts often mentioned in poker media
- Simple statistics and dates
- Famous players everyone knows`,
        medium: `
- Requires solid poker knowledge
- Specific tournament results and statistics
- Strategy concepts that regular players understand
- Historical events poker enthusiasts would recall`,
        hard: `
- Expert-level deep knowledge required
- Obscure historical facts
- Specific hand details and exact figures
- Advanced strategy concepts
- Trivia only serious poker students would know`
    };

    const prompt = `Generate exactly ${count} unique ${difficulty.toUpperCase()} difficulty poker trivia questions.

Category: ${category.name}
Topic: ${topic}
Difficulty: ${difficulty}

DIFFICULTY GUIDELINES for ${difficulty}:
${difficultyGuidelines[difficulty]}

CRITICAL REQUIREMENTS:
- Questions must be FACTUALLY ACCURATE and VERIFIABLE
- Include specific names, dates, dollar amounts, and statistics where appropriate
- Each question has EXACTLY 4 answer options
- Only ONE answer is correct
- Include brief explanation for correct answer
- Make questions engaging and educational

Return ONLY a valid JSON array (no markdown, no explanation):
[{"question":"...","options":["A","B","C","D"],"correct_index":0,"explanation":"..."}]`;

    try {
        const response = await grok.chat.completions.create({
            model: 'grok-3',
            messages: [
                {
                    role: 'system',
                    content: `You are an expert poker historian and strategist creating ${difficulty} difficulty trivia questions. Focus on: ${topic}. Return valid JSON array only, no markdown.`
                },
                { role: 'user', content: prompt }
            ],
            temperature: 0.9,
            max_tokens: 4000
        });

        const content = response.choices[0]?.message?.content;
        if (!content) return [];

        // Parse JSON - handle potential formatting issues
        let jsonStr = content.trim();
        if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
        }

        const parsed = JSON.parse(jsonStr);
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
        console.error(`  ❌ Error generating ${difficulty} for ${topic}: ${error.message}`);
        return [];
    }
}

async function getCurrentCounts() {
    const counts = {};
    for (const cat of CATEGORIES) {
        counts[cat.id] = { easy: 0, medium: 0, hard: 0, total: 0 };

        for (const diff of ['easy', 'medium', 'hard']) {
            const { count } = await supabase
                .from('trivia_questions')
                .select('*', { count: 'exact', head: true })
                .eq('category', cat.id)
                .eq('difficulty', diff);
            counts[cat.id][diff] = count || 0;
        }
        counts[cat.id].total = counts[cat.id].easy + counts[cat.id].medium + counts[cat.id].hard;
    }
    return counts;
}

async function main() {
    console.log('\n🎲 TRIVIA QUESTION BOOTSTRAP');
    console.log('============================\n');

    // Verify API keys
    if (!process.env.XAI_API_KEY) {
        console.error('❌ XAI_API_KEY not found in .env.local');
        process.exit(1);
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        console.error('❌ SUPABASE_SERVICE_ROLE_KEY not found in .env.local');
        process.exit(1);
    }

    const grok = await getGrokClient();

    // Get current counts
    console.log('📊 Checking current question counts...\n');
    const currentCounts = await getCurrentCounts();

    let totalGenerated = 0;

    for (const category of CATEGORIES) {
        console.log(`\n📁 ${category.name}`);
        console.log(`   Current: E:${currentCounts[category.id].easy} M:${currentCounts[category.id].medium} H:${currentCounts[category.id].hard}`);

        for (const [difficulty, target] of Object.entries(DIFFICULTY_TARGETS)) {
            const current = currentCounts[category.id][difficulty];
            const needed = Math.max(0, target - current);

            if (needed === 0) {
                console.log(`   ✅ ${difficulty}: Already at target (${target})`);
                continue;
            }

            console.log(`   🔄 ${difficulty}: Generating ${needed} questions...`);

            let generated = 0;
            let batchNum = 0;

            while (generated < needed && batchNum < 20) { // Max 20 batches per difficulty
                const topic = category.topics[batchNum % category.topics.length];
                const batchSize = Math.min(BATCH_SIZE, needed - generated);

                process.stdout.write(`      Batch ${batchNum + 1}: ${topic.slice(0, 30)}... `);

                const questions = await generateBatch(grok, category, topic, difficulty, batchSize);

                if (questions.length > 0) {
                    const { data, error } = await supabase
                        .from('trivia_questions')
                        .insert(questions)
                        .select();

                    if (!error && data) {
                        generated += data.length;
                        totalGenerated += data.length;
                        console.log(`+${data.length} (${generated}/${needed})`);
                    } else {
                        console.log(`❌ Insert error: ${error?.message}`);
                    }
                } else {
                    console.log('⚠️ No questions returned');
                }

                batchNum++;

                // Rate limiting - 1 second between batches
                await new Promise(r => setTimeout(r, 1000));
            }
        }
    }

    // Final summary
    console.log('\n\n📈 FINAL SUMMARY');
    console.log('================\n');

    const finalCounts = await getCurrentCounts();
    let grandTotal = 0;

    console.log('Category              | Easy  | Medium | Hard  | Total');
    console.log('----------------------|-------|--------|-------|------');

    for (const cat of CATEGORIES) {
        const c = finalCounts[cat.id];
        grandTotal += c.total;
        console.log(`${cat.name.padEnd(21)} | ${String(c.easy).padStart(5)} | ${String(c.medium).padStart(6)} | ${String(c.hard).padStart(5)} | ${String(c.total).padStart(5)}`);
    }

    console.log('----------------------|-------|--------|-------|------');
    console.log(`TOTAL                 |       |        |       | ${grandTotal}`);
    console.log(`\n✅ Generated ${totalGenerated} new questions this run`);
    console.log(`🎯 Target: ${CATEGORIES.length * 250} questions (250 per category)\n`);
}

main().catch(console.error);
