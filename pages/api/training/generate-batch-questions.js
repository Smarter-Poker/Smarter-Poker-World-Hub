/**
 * 🎰 BATCH QUESTION GENERATOR — Populate Cache for 10 Test Games
 * ═══════════════════════════════════════════════════════════════════════════
 * Generates 500 questions total (10 games × 2 levels × 25 questions)
 * Uses Grok AI to generate GTO questions and psychology scenarios
 * Saves all questions to training_question_cache table
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import { getGrokClient } from '../../../src/lib/grokClient';
import { getGameConfig, getStackDepthNumber } from '../../../src/config/gameConfigs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey);

// 10 Test Games
const TEST_GAMES = [
    { id: 'mtt-007', name: 'Deep Stack MTT', category: 'MTT' },
    { id: 'mtt-018', name: 'BTN Warfare', category: 'MTT' },
    { id: 'cash-002', name: '3-Bet Pots', category: 'CASH' },
    { id: 'cash-018', name: 'Blind vs Blind', category: 'CASH' },
    { id: 'spins-003', name: 'Button Limp', category: 'SPINS' },
    { id: 'spins-007', name: 'Extreme ICM', category: 'SPINS' },
    { id: 'psy-003', name: 'Cooler Cage', category: 'PSYCHOLOGY' },
    { id: 'psy-012', name: 'Snap Decision', category: 'PSYCHOLOGY' },
    { id: 'adv-001', name: 'Solver Mimicry', category: 'ADVANCED' },
    { id: 'adv-017', name: 'Capped Ranges', category: 'ADVANCED' },
];

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const results = {
            total: 0,
            generated: 0,
            cached: 0,
            failed: 0,
            games: {}
        };

        console.log('🎰 Starting batch question generation for 10 test games...');

        for (const game of TEST_GAMES) {
            console.log(`\n${'='.repeat(70)}`);
            console.log(`🎮 Game: ${game.name} (${game.id})`);
            console.log(`${'='.repeat(70)}`);

            const gameConfig = getGameConfig(game.id);
            const engineType = gameConfig.engine; // 'PIO' or 'SCENARIO'

            results.games[game.id] = {
                name: game.name,
                engine: engineType,
                levels: {}
            };

            // Generate for Level 1 and Level 2
            for (const level of [1, 2]) {
                console.log(`\n📚 Generating 25 questions for Level ${level}...`);

                const levelResults = {
                    generated: 0,
                    failed: 0
                };

                // Generate 25 questions for this level
                for (let i = 1; i <= 25; i++) {
                    try {
                        console.log(`  [${i}/25] Generating question...`);

                        const question = await generateQuestionWithGrok(
                            game.id,
                            engineType,
                            level,
                            gameConfig.gameType,
                            game,
                            gameConfig
                        );

                        if (question) {
                            // Save to cache
                            const { error } = await supabase
                                .from('training_question_cache')
                                .insert({
                                    question_id: question.id,
                                    game_id: game.id,
                                    engine_type: engineType.toUpperCase(),
                                    game_type: gameConfig.gameType,
                                    level: level,
                                    question_data: question,
                                    times_used: 0,
                                });

                            if (error) {
                                if (error.message?.includes('duplicate')) {
                                    console.log(`  ⚠️  Already cached`);
                                    results.cached++;
                                } else {
                                    console.error(`  ❌ Save failed:`, error.message);
                                    levelResults.failed++;
                                    results.failed++;
                                }
                            } else {
                                console.log(`  ✅ Generated and cached`);
                                levelResults.generated++;
                                results.generated++;
                            }

                            results.total++;
                        } else {
                            console.error(`  ❌ Generation failed`);
                            levelResults.failed++;
                            results.failed++;
                        }

                        // Rate limit: Wait 1 second between Grok calls
                        await new Promise(resolve => setTimeout(resolve, 1000));

                    } catch (error) {
                        console.error(`  ❌ Error:`, error.message);
                        levelResults.failed++;
                        results.failed++;
                    }
                }

                results.games[game.id].levels[level] = levelResults;
                console.log(`\n📊 Level ${level} Summary: ${levelResults.generated} generated, ${levelResults.failed} failed`);
            }
        }

        console.log(`\n${'='.repeat(70)}`);
        console.log(`🎉 BATCH GENERATION COMPLETE`);
        console.log(`${'='.repeat(70)}`);
        console.log(`Total: ${results.total}`);
        console.log(`Generated: ${results.generated}`);
        console.log(`Cached: ${results.cached}`);
        console.log(`Failed: ${results.failed}`);
        console.log(`${'='.repeat(70)}\n`);

        return res.status(200).json({
            success: true,
            message: 'Batch generation complete',
            results
        });

    } catch (error) {
        console.error('❌ Batch generation error:', error);
        return res.status(500).json({ error: error.message });
    }
}

/**
 * Generate question using Grok AI
 * Handles both PIO (GTO questions) and SCENARIO (psychology) engines
 */
async function generateQuestionWithGrok(gameId, engineType, level, gameType, game, gameConfig) {
    try {
        const grok = getGrokClient();

        const gameName = game?.name || 'Training Game';
        const gameCategory = game?.category || 'CASH';
        const playerCount = gameConfig.players;
        const gameFormat = gameConfig.format;
        const stackDepth = getStackDepthNumber(gameConfig.stackDepth);

        // Different prompts for PIO vs SCENARIO engines
        let prompt;

        if (engineType === 'SCENARIO') {
            // Psychology scenario prompt
            prompt = `You are a poker psychology expert. Generate a realistic mental game scenario for "${gameName}" (${gameCategory}) at difficulty level ${level}/10.

CRITICAL REQUIREMENTS:
- This is a PSYCHOLOGY game, not a GTO math game
- Focus on mental game, tilt control, decision-making under pressure
- NO poker math or GTO calculations
- Present realistic emotional/psychological situations
- Provide 4 answer choices with clear psychological reasoning
- Explain WHY the correct answer helps with mental game

Game Context:
- Game: ${gameName}
- Category: ${gameCategory}
- Difficulty: ${level}/10 (1=beginner, 10=expert)
- Engine: SCENARIO (Psychology)

Generate a scenario in this EXACT JSON format (no markdown, no code blocks):
{
  "id": "grok_${gameId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}",
  "type": "SCENARIO",
  "question": "What should you do in this situation?",
  "scenario": {
    "title": "Tilt Management",
    "context": "You just lost a big pot with AA vs 72o all-in preflop",
    "emotionalState": "Frustrated",
    "sessionLength": "2 hours"
  },
  "options": [
    {"id": "a", "text": "Play faster to win it back"},
    {"id": "b", "text": "Take a 5-minute break"},
    {"id": "c", "text": "Move up stakes"},
    {"id": "d", "text": "Review the hand now"}
  ],
  "correctAnswer": "b",
  "explanation": "Taking a short break helps reset your mental state and prevents tilt-driven decisions. Continuing to play while emotionally compromised leads to poor decision-making and further losses."
}

IMPORTANT: Make the scenario realistic and focus on mental game, NOT poker strategy.`;

        } else {
            // PIO/GTO question prompt
            const gameTypeDisplay = gameType === 'tournament' ? `${playerCount}-Max Tournament (MTT)`
                : gameType === 'sng' ? `${playerCount}-Max Spin & Go (SNG)`
                    : `${playerCount}-Max Cash Game`;

            prompt = `You are a GTO poker solver expert. Generate a realistic poker training question for "${gameName}" (${gameCategory}) at difficulty level ${level}/10.

CRITICAL REQUIREMENTS:
- Game Type: ${gameTypeDisplay}
- Player Count: ${playerCount} players (${gameFormat})
- Stack Depth: ${stackDepth}BB
- Use REAL poker scenarios that would appear in ${gameTypeDisplay} games
- ${gameType === 'tournament' ? 'Include ICM considerations and tournament dynamics' : ''}
- ${gameType === 'cash' ? 'Focus on postflop play and value extraction' : ''}
- ${gameType === 'sng' ? 'Use hyper-turbo dynamics and extreme ICM pressure' : ''}
- Provide GTO-accurate solver-style answers
- Include specific positions, board textures, and action sequences
- Explain WHY the GTO play is optimal (equity, range advantage, ICM, etc.)

Game Context:
- Game: ${gameName}
- Category: ${gameCategory}
- Format: ${gameFormat}
- Players: ${playerCount}
- Stack Depth: ${stackDepth}BB
- Difficulty: ${level}/10 (1=beginner, 10=expert)
- Engine: PIO (GTO Solver)

Generate a question in this EXACT JSON format (no markdown, no code blocks):
{
  "id": "grok_${gameId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}",
  "type": "PIO",
  "question": "What is the GTO play in this spot?",
  "scenario": {
    "heroPosition": "BTN",
    "heroStack": ${stackDepth},
    "gameType": "${gameTypeDisplay}",
    "heroHand": "AhKs",
    "board": "Jh7s2d",
    "pot": ${Math.floor(stackDepth * 0.12)},
    "villainPosition": "BB",
    "villainStack": ${stackDepth},
    "action": "Villain bets ${Math.floor(stackDepth * 0.08)}bb"
  },
  "options": [
    {"id": "a", "text": "Fold"},
    {"id": "b", "text": "Call"},
    {"id": "c", "text": "Raise to ${Math.floor(stackDepth * 0.24)}bb"},
    {"id": "d", "text": "All-In"}
  ],
  "correctAnswer": "c",
  "explanation": "Raising is optimal because: (1) You have strong equity with AK high + backdoor flush, (2) Villain's range is capped on this dry board, (3) You have position and can apply maximum pressure${gameType === 'tournament' ? ', (4) ICM pressure makes villain fold more often' : ''}, (4) Solver shows this as a 65% raise frequency spot."
}

IMPORTANT: Make the scenario realistic for ${gameTypeDisplay} with ${playerCount} players. Use proper GTO reasoning in the explanation.`;
        }

        const response = await grok.chat.completions.create({
            model: 'grok-3',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.9, // High variety
            max_tokens: 1000,
        });

        const content = response.choices[0]?.message?.content || '';

        // Try to extract JSON from response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            console.log(`    Generated: "${parsed.question.substring(0, 60)}..."`);
            return parsed;
        } else {
            console.error('    ❌ No JSON found in Grok response');
            return null;
        }
    } catch (error) {
        console.error('    ❌ Grok generation failed:', error.message);
        return null;
    }
}
