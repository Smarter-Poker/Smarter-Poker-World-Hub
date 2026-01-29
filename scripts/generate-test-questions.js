/**
 * Test Question Generator
 * ═══════════════════════════════════════════════════════════════════════════
 * Generates test questions for 10 randomly selected games
 * 2 games from each category × 2 levels × 25 questions = 500 total questions
 */

const { createClient } = require('@supabase/supabase-js');
const { getGrokClient } = require('../src/lib/grokClient');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Game categories
const GAME_CATEGORIES = {
    MTT: ['mtt-003', 'mtt-007', 'mtt-012', 'mtt-015', 'mtt-018', 'mtt-021', 'mtt-024'],
    CASH: ['cash-001', 'cash-002', 'cash-005', 'cash-012', 'cash-014', 'cash-018', 'cash-022'],
    SPINS: ['spins-001', 'spins-003', 'spins-005', 'spins-007', 'spins-009'],
    MENTAL: ['psy-001', 'psy-003', 'psy-005', 'psy-009', 'psy-012', 'psy-015', 'psy-018'],
    ADVANCED: ['adv-001', 'adv-002', 'adv-008', 'adv-012', 'adv-017', 'adv-020']
};

// Randomly select 2 games from each category
function selectRandomGames() {
    const selected = {};

    Object.keys(GAME_CATEGORIES).forEach(category => {
        const games = GAME_CATEGORIES[category];
        const shuffled = games.sort(() => 0.5 - Math.random());
        selected[category] = shuffled.slice(0, 2);
    });

    return selected;
}

// Generate questions using Grok AI
async function generateQuestionsWithGrok(gameId, level, count) {
    const grok = getGrokClient();
    const questions = [];

    console.log(`\n🎯 Generating ${count} questions for ${gameId} Level ${level}...`);

    for (let i = 0; i < count; i++) {
        try {
            const prompt = `You are a GTO poker expert. Generate a realistic poker training question for game "${gameId}" at difficulty level ${level}/10.

Return ONLY valid JSON (no markdown, no code blocks) in this exact format:
{
  "id": "test_${gameId}_L${level}_Q${i + 1}",
  "type": "PIO",
  "question": "Detailed scenario question",
  "scenario": {
    "heroPosition": "BTN",
    "heroStack": 100,
    "gameType": "Cash",
    "heroHand": "AhKs",
    "board": "Jh7s2d",
    "pot": 12,
    "villainPosition": "BB",
    "villainStack": 100,
    "action": "Villain bets 8bb"
  },
  "options": [
    {"id": "a", "text": "Fold"},
    {"id": "b", "text": "Call"},
    {"id": "c", "text": "Raise to 24bb"},
    {"id": "d", "text": "All-In"}
  ],
  "correctAnswer": "c",
  "explanation": "Detailed GTO explanation with reasoning"
}`;

            const response = await grok.chat.completions.create({
                model: 'grok-beta',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.9,
                max_tokens: 600,
            });

            const content = response.choices[0]?.message?.content || '';
            const jsonMatch = content.match(/\{[\s\S]*\}/);

            if (jsonMatch) {
                const question = JSON.parse(jsonMatch[0]);
                questions.push(question);
                console.log(`  ✅ Generated Q${i + 1}/${count}`);
            } else {
                console.log(`  ⚠️  Failed to parse Q${i + 1}, using fallback`);
                questions.push(getFallbackQuestion(gameId, level, i + 1));
            }

            // Rate limit: wait 500ms between requests
            await new Promise(resolve => setTimeout(resolve, 500));

        } catch (error) {
            console.error(`  ❌ Error generating Q${i + 1}:`, error.message);
            questions.push(getFallbackQuestion(gameId, level, i + 1));
        }
    }

    return questions;
}

// Fallback question template
function getFallbackQuestion(gameId, level, questionNum) {
    return {
        id: `test_${gameId}_L${level}_Q${questionNum}`,
        type: 'PIO',
        question: `Test question ${questionNum} for ${gameId} at level ${level}`,
        scenario: {
            heroPosition: 'BTN',
            heroStack: 100,
            gameType: 'Cash'
        },
        options: [
            { id: 'a', text: 'Fold' },
            { id: 'b', text: 'Call' },
            { id: 'c', text: 'Raise' },
            { id: 'd', text: 'All-In' }
        ],
        correctAnswer: 'b',
        explanation: 'This is a test question.'
    };
}

// Save questions to cache
async function saveToCache(gameId, level, questions) {
    console.log(`\n💾 Saving ${questions.length} questions to cache...`);

    for (const question of questions) {
        try {
            await supabase
                .from('training_question_cache')
                .insert({
                    question_id: question.id,
                    game_id: gameId,
                    engine_type: 'PIO',
                    game_type: gameId.startsWith('mtt') ? 'tournament' :
                        gameId.startsWith('spins') ? 'sng' : 'cash',
                    level: level,
                    question_data: question,
                    times_used: 0
                });
        } catch (error) {
            // Ignore duplicate errors
            if (!error.message?.includes('duplicate')) {
                console.error(`  ⚠️  Failed to save ${question.id}:`, error.message);
            }
        }
    }

    console.log(`  ✅ Saved to cache`);
}

// Main execution
async function main() {
    console.log('🎮 ANTIGRAVITY TEST QUESTION GENERATOR');
    console.log('═'.repeat(80));

    // Select random games
    const selectedGames = selectRandomGames();

    console.log('\n📋 SELECTED GAMES:');
    console.log('─'.repeat(80));
    Object.entries(selectedGames).forEach(([category, games]) => {
        console.log(`${category}: ${games.join(', ')}`);
    });

    // Generate questions for each game
    const allGames = Object.values(selectedGames).flat();
    const results = {};

    for (const gameId of allGames) {
        results[gameId] = {
            level1: [],
            level5: []
        };

        // Level 1: 25 questions
        const level1Questions = await generateQuestionsWithGrok(gameId, 1, 25);
        results[gameId].level1 = level1Questions;
        await saveToCache(gameId, 1, level1Questions);

        // Level 5: 25 questions
        const level5Questions = await generateQuestionsWithGrok(gameId, 5, 25);
        results[gameId].level5 = level5Questions;
        await saveToCache(gameId, 5, level5Questions);
    }

    // Summary
    console.log('\n\n📊 GENERATION SUMMARY');
    console.log('═'.repeat(80));

    let totalQuestions = 0;
    Object.entries(results).forEach(([gameId, levels]) => {
        const count = levels.level1.length + levels.level5.length;
        totalQuestions += count;
        console.log(`${gameId}: ${count} questions (L1: ${levels.level1.length}, L5: ${levels.level5.length})`);
    });

    console.log(`\n✅ Total Questions Generated: ${totalQuestions}`);
    console.log('\n🎯 TEST GAMES LIST:');
    console.log('─'.repeat(80));
    allGames.forEach((game, i) => {
        console.log(`${i + 1}. ${game}`);
    });

    console.log('\n✅ All questions saved to training_question_cache table');
    console.log('═'.repeat(80));
}

main()
    .then(() => {
        console.log('\n✅ Generation complete!\n');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Error:', error);
        process.exit(1);
    });
