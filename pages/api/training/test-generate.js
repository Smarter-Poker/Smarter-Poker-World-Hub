/**
 * 🎰 TEST QUESTION GENERATOR — Quick Test
 * ═══════════════════════════════════════════════════════════════════════════
 * Generates 5 test questions for mtt-007 to verify the system works
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

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const gameId = 'mtt-007';
        const game = { id: 'mtt-007', name: 'Deep Stack MTT', category: 'MTT' };
        const gameConfig = getGameConfig(gameId);
        const engineType = gameConfig.engine;
        const level = 1;

        console.log(`🎮 Testing question generation for ${game.name}...`);

        const results = [];

        // Generate 5 test questions
        for (let i = 1; i <= 5; i++) {
            console.log(`\n[${i}/5] Generating question...`);

            const question = await generateQuestionWithGrok(
                gameId,
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
                        game_id: gameId,
                        engine_type: engineType.toUpperCase(),
                        game_type: gameConfig.gameType,
                        level: level,
                        question_data: question,
                        times_used: 0,
                    });

                if (error && !error.message?.includes('duplicate')) {
                    console.error(`❌ Save failed:`, error.message);
                } else {
                    console.log(`✅ Generated and cached`);
                    results.push(question);
                }
            }

            // Rate limit
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        return res.status(200).json({
            success: true,
            count: results.length,
            questions: results
        });

    } catch (error) {
        console.error('❌ Test generation error:', error);
        return res.status(500).json({ error: error.message });
    }
}

async function generateQuestionWithGrok(gameId, engineType, level, gameType, game, gameConfig) {
    try {
        const grok = getGrokClient();

        const gameName = game?.name || 'Training Game';
        const playerCount = gameConfig.players;
        const gameFormat = gameConfig.format;
        const stackDepth = getStackDepthNumber(gameConfig.stackDepth);

        const gameTypeDisplay = `${playerCount}-Max Tournament (MTT)`;

        const prompt = `You are a GTO poker solver expert. Generate a realistic poker training question for "${gameName}" at difficulty level ${level}/10.

CRITICAL REQUIREMENTS:
- Game Type: ${gameTypeDisplay}
- Player Count: ${playerCount} players (${gameFormat})
- Stack Depth: ${stackDepth}BB
- Include ICM considerations and tournament dynamics
- Provide GTO-accurate solver-style answers
- Include specific positions, board textures, and action sequences

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
  "explanation": "Raising is optimal because: (1) You have strong equity, (2) Villain's range is capped, (3) You have position, (4) ICM pressure makes villain fold more often."
}`;

        const response = await grok.chat.completions.create({
            model: 'grok-3',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.9,
            max_tokens: 1000,
        });

        const content = response.choices[0]?.message?.content || '';
        const jsonMatch = content.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            console.log(`  Generated: "${parsed.question.substring(0, 60)}..."`);
            return parsed;
        }

        return null;
    } catch (error) {
        console.error('  ❌ Grok generation failed:', error.message);
        return null;
    }
}
