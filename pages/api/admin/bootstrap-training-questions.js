/**
 * 🎮 TRAINING QUESTIONS BOOTSTRAP API
 * ═══════════════════════════════════════════════════════════════════════════
 * Generates 25 CORRECT, game-specific questions for Level 1 of each game.
 * 
 * CRITICAL: Each game gets unique prompts based on:
 * - Game ID, Name, Focus area
 * - Category (MTT, Cash, Spins, Psychology, Advanced)
 * - Engine type (PIO, CHART, SCENARIO)
 * - Player count (2, 3, 6, 9)
 * - Stack depth and format
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import { TRAINING_LIBRARY } from '../../../src/data/TRAINING_LIBRARY';
import { GAME_CONFIGS } from '../../../src/config/gameConfigs';
import { pioQueryService } from '../../../src/services/PIOQueryService';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Grok client
function getGrokClient() {
    const OpenAI = require('openai').default;
    return new OpenAI({
        apiKey: process.env.XAI_API_KEY,
        baseURL: 'https://api.x.ai/v1',
    });
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'POST required' });
    }

    const { gameId, questionsPerGame = 25, level = 1 } = req.body;

    // If gameId provided, bootstrap single game. Otherwise batch.
    const gamesToBootstrap = gameId
        ? TRAINING_LIBRARY.filter(g => g.id === gameId)
        : TRAINING_LIBRARY;

    if (gamesToBootstrap.length === 0) {
        return res.status(404).json({ error: `Game ${gameId} not found` });
    }

    console.log(`[Bootstrap] 🚀 Starting bootstrap for ${gamesToBootstrap.length} games`);

    const results = [];

    for (const game of gamesToBootstrap) {
        try {
            const gameConfig = GAME_CONFIGS[game.id] || {};
            const engine = getEngineType(game);

            console.log(`[Bootstrap] 🎮 ${game.id}: ${game.name} (${engine})`);

            // Generate questions based on engine type
            const questions = await generateQuestionsForGame(game, gameConfig, engine, questionsPerGame, level);

            // Save to database
            const saved = await saveQuestions(game.id, engine, level, questions);

            results.push({
                gameId: game.id,
                name: game.name,
                engine,
                questionsGenerated: questions.length,
                questionsSaved: saved,
            });

            // Rate limit - 1 game per second
            await sleep(1000);

        } catch (error) {
            console.error(`[Bootstrap] ❌ ${game.id} failed:`, error.message);
            results.push({
                gameId: game.id,
                name: game.name,
                error: error.message,
            });
        }
    }

    return res.status(200).json({
        success: true,
        gamesProcessed: results.length,
        results,
    });
}

/**
 * Determine engine type based on game configuration
 */
function getEngineType(game) {
    // CHART games (3 total)
    if (['mtt-001', 'mtt-016', 'cash-010'].includes(game.id)) {
        return 'CHART';
    }

    // SCENARIO games (Psychology category + table selection + clock management)
    if (game.category === 'PSYCHOLOGY' ||
        game.id === 'cash-020' ||
        game.id === 'mtt-022') {
        return 'SCENARIO';
    }

    // Default to PIO
    return 'PIO';
}

/**
 * Generate questions for a specific game
 */
async function generateQuestionsForGame(game, gameConfig, engine, count, level) {
    const grok = getGrokClient();
    const questions = [];

    for (let i = 0; i < count; i++) {
        try {
            let question;

            if (engine === 'SCENARIO') {
                question = await generatePsychologyQuestion(grok, game, level, i);
            } else if (engine === 'CHART') {
                question = await generateChartQuestion(grok, game, gameConfig, level, i);
            } else {
                question = await generateGTOQuestion(grok, game, gameConfig, level, i);
            }

            if (question) {
                questions.push(question);
            }

            // Rate limit between questions
            await sleep(200);

        } catch (error) {
            console.error(`[Bootstrap] Question ${i + 1} failed for ${game.id}:`, error.message);
        }
    }

    return questions;
}

/**
 * PSYCHOLOGY / MENTAL GAME QUESTIONS
 */
async function generatePsychologyQuestion(grok, game, level, index) {
    // Variety seed for uniqueness
    const varietySeed = `PSY_Q${index + 1}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

    // Scenario variety options
    const gameFormats = ['cash game', 'tournament', 'high-stakes session', 'home game', 'online grinding session'];
    const emotionalTriggers = ['bad beat', 'cooler', 'long losing streak', 'opponent taunt', 'time pressure', 'near-miss', 'big win', 'early bust-out'];

    const prompt = `You are an elite poker mental game coach. Generate a UNIQUE psychology question #${index + 1} for "${game.name}".

GAME SPECIFICATION:
- Game ID: ${game.id}
- Name: ${game.name}
- Focus: ${game.focus}
- Category: PSYCHOLOGY / MENTAL GAME
- Difficulty: Level ${level}/10

VARIETY SEED: ${varietySeed}

CRITICAL REQUIREMENTS:
1. This is MENTAL GAME only - NO poker math, NO GTO strategy, NO hand analysis
2. Create a COMPLETELY UNIQUE scenario testing: ${game.focus}
3. Use VARIED game formats: ${gameFormats.slice(0, 3).join(', ')}, etc.
4. Include DIFFERENT emotional triggers: ${emotionalTriggers.slice(0, 4).join(', ')}, etc.
5. Write a DETAILED, REALISTIC scenario (3-5 sentences minimum)
6. All 4 options must be DISTINCT behavioral responses
7. The explanation must teach WHY the optimal response works

Generate ONLY valid JSON (no markdown):
{
  "id": "${game.id}_L${level}_Q${index + 1}_${Date.now()}",
  "type": "SCENARIO",
  "question": "[GENERATE: a question about handling this situation]",
  "scenario": {
    "title": "${game.name}",
    "context": "[GENERATE: 3-5 sentence detailed realistic scenario testing ${game.focus}]",
    "emotionalState": "[GENERATE: specific emotional state the hero is experiencing]",
    "isPsychology": true
  },
  "options": [
    {"id": "a", "text": "[GENERATE: first behavioral response]"},
    {"id": "b", "text": "[GENERATE: second behavioral response]"},
    {"id": "c", "text": "[GENERATE: third behavioral response]"},
    {"id": "d", "text": "[GENERATE: fourth behavioral response]"}
  ],
  "correctAnswer": "[GENERATE: the letter of the optimal mental game response]",
  "explanation": "[GENERATE: detailed explanation of why this response optimizes ${game.focus}]"
}`;

    const response = await grok.chat.completions.create({
        model: 'grok-3',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.95,
        max_tokens: 900,
    });

    return parseGrokResponse(response);
}

/**
 * CHART / PUSH-FOLD QUESTIONS
 */
async function generateChartQuestion(grok, game, gameConfig, level, index) {
    const playerCount = gameConfig.players || 9;
    const stackDepth = gameConfig.stackDepth || '10-15bb';

    // Variety elements
    const varietySeed = `CHART_Q${index + 1}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const positions = playerCount === 9
        ? ['UTG', 'UTG+1', 'MP', 'MP+1', 'HJ', 'CO', 'BTN', 'SB', 'BB']
        : ['BTN', 'SB', 'BB'];
    const tourneyStages = ['Early', 'Middle', 'Bubble', 'ITM', 'Final Table', 'Heads-Up'];
    const handExamples = ['K9o', '55', 'QTs', 'A2s', 'JTo', '87s', 'K5s', 'A9o', '66', 'Q8s', 'T9o', 'KJo'];

    const prompt = `You are an ICM poker expert. Generate a UNIQUE push/fold question #${index + 1} for "${game.name}".

GAME SPECIFICATION:
- Game ID: ${game.id}
- Name: ${game.name}
- Focus: ${game.focus}
- Format: ${playerCount}-Max Tournament
- Stack Depth: ${stackDepth} (SHORT STACKS!)
- Difficulty: Level ${level}/10

VARIETY SEED: ${varietySeed}
AVAILABLE POSITIONS: ${positions.join(', ')}
TOURNAMENT STAGES: ${tourneyStages.join(', ')}
HAND VARIETY: ${handExamples.slice(0, 6).join(', ')}, etc.

CRITICAL REQUIREMENTS FOR UNIQUE SCENARIOS:
1. Generate a UNIQUE short-stack scenario (stack between 3-18bb)
2. Use VARIED positions (not always BTN)
3. Use VARIED hands (avoid always using premium hands)
4. Use DIFFERENT tournament stages
5. Include realistic blind levels
6. The scenario MUST test: ${game.focus}
7. Provide detailed Nash chart reasoning in explanation

Generate ONLY valid JSON (no markdown):
{
  "id": "${game.id}_L${level}_Q${index + 1}_${Date.now()}",
  "type": "CHART",
  "question": "Push or Fold?",
  "scenario": {
    "heroPosition": "[GENERATE: pick from ${positions.slice(0, 5).join('/')}]",
    "heroStack": [GENERATE: number between 3-18],
    "heroHand": "[GENERATE: unique hand from broad range]",
    "gameType": "${playerCount}-Max Tournament",
    "pot": [GENERATE: realistic pot considering antes/blinds],
    "action": "[GENERATE: varied like 'Folded to you', '2 limpers behind', 'UTG raised 2.5x']",
    "tournamentStage": "[GENERATE: pick from ${tourneyStages.slice(0, 4).join('/')}]",
    "blindLevel": "[GENERATE: realistic blind level like '300/600/75', '1000/2000/200']"
  },
  "options": [
    {"id": "push", "text": "Push All-In"},
    {"id": "fold", "text": "Fold"}
  ],
  "correctAnswer": "[GENERATE: push or fold based on Nash/ICM]",
  "explanation": "[GENERATE: detailed Nash chart reasoning explaining why this is +EV or -EV, referencing ${game.focus}]"
}`;

    const response = await grok.chat.completions.create({
        model: 'grok-3',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.95,
        max_tokens: 800,
    });

    return parseGrokResponse(response);
}

/**
 * GTO / PIO ENGINE QUESTIONS - Uses REAL PioSolver data first!
 */
async function generateGTOQuestion(grok, game, gameConfig, level, index) {
    const playerCount = gameConfig.players || 6;
    const stackDepth = gameConfig.stackDepth || '100bb';
    const format = gameConfig.format || '6-Max Cash';
    const gameType = gameConfig.gameType || 'cash';

    console.log(`[Bootstrap] 📊 Querying PIO data for ${game.id} (Question ${index + 1})...`);

    // ═══════════════════════════════════════════════════════════════════
    // STEP 1: Try to get REAL PioSolver data first
    // ═══════════════════════════════════════════════════════════════════
    try {
        const pioScenarios = await pioQueryService.queryScenarios(game.id, parseInt(level), null);

        if (pioScenarios && pioScenarios.length > 0) {
            console.log(`[Bootstrap] ✅ Found ${pioScenarios.length} PIO scenarios for ${game.id}`);

            // Pick a random scenario
            const scenario = pioScenarios[Math.floor(Math.random() * pioScenarios.length)];
            const strategyMatrix = scenario.strategies || {};
            const actions = strategyMatrix.actions || [];
            const frequencies = strategyMatrix.frequencies || {};

            if (actions.length > 0) {
                // Get all hands from the frequency data
                const sampleAction = actions[0];
                const handFreqs = frequencies[sampleAction] || {};
                const allHands = Object.keys(handFreqs).filter(h => h.match(/^[2-9TJQKA][2-9TJQKA][os]?$/));

                if (allHands.length > 0) {
                    // Pick a random hand that is NOT always being used (skip AA, KK for variety)
                    const midRangeHands = allHands.filter(h => !['AA', 'KK', 'AKs', 'AKo'].includes(h));
                    const handsToChooseFrom = midRangeHands.length > 10 ? midRangeHands : allHands;
                    const heroHand = handsToChooseFrom[Math.floor(Math.random() * handsToChooseFrom.length)];

                    // Find optimal action for this hand
                    let optimalAction = null;
                    let maxFreq = -1;
                    const handActions = {};

                    actions.forEach(action => {
                        const freq = frequencies[action]?.[heroHand] || 0;
                        if (freq >= 0 && freq <= 1) {
                            handActions[action] = freq;
                            if (freq > maxFreq) {
                                maxFreq = freq;
                                optimalAction = action;
                            }
                        }
                    });

                    // Map action codes to readable names
                    const actionNameMap = {
                        'c': 'Check', 'f': 'Fold', 'x': 'Check', 'b': 'Bet',
                        'b16': 'Bet Small (16%)', 'b25': 'Bet 25%', 'b33': 'Bet 33%',
                        'b45': 'Bet Medium (45%)', 'b50': 'Bet Half Pot', 'b66': 'Bet 2/3 Pot',
                        'b75': 'Bet 75%', 'b100': 'Bet Pot', 'b150': 'Overbet 150%',
                        'allin': 'All-In', 'r': 'Raise'
                    };

                    // Build options from real PIO actions
                    const options = actions.slice(0, 4).map((a, idx) => ({
                        id: String.fromCharCode(97 + idx), // a, b, c, d
                        text: actionNameMap[a] || a.toUpperCase(),
                        frequency: handActions[a] || 0
                    }));

                    // Find correct answer (highest frequency action)
                    const correctIdx = options.findIndex(o =>
                        o.text === (actionNameMap[optimalAction] || optimalAction?.toUpperCase())
                    );
                    const correctAnswer = String.fromCharCode(97 + (correctIdx >= 0 ? correctIdx : 0));

                    // Parse board from scenario hash
                    const board = scenario.board || pioQueryService.parseBoardCards(scenario.scenarioHash) || 'Kh8s3d';

                    const question = {
                        id: `${game.id}_L${level}_Q${index + 1}_PIO_${Date.now()}`,
                        type: 'PIO',
                        source: 'PIOSOLVER', // Mark as real PIO data!
                        question: 'What is the GTO play?',
                        scenario: {
                            heroPosition: scenario.position || 'BTN',
                            heroStack: parseInt(scenario.stackDepth) || 100,
                            heroHand: heroHand,
                            gameType: format,
                            board: Array.isArray(board) ? board.join('') : board,
                            pot: 12,
                            villainPosition: 'BB',
                            villainStack: parseInt(scenario.stackDepth) || 100,
                            action: 'Villain checks'
                        },
                        options: options.map(o => ({ id: o.id, text: o.text })),
                        correctAnswer: correctAnswer,
                        explanation: `Based on PioSolver analysis for ${game.name}: ${heroHand} should ${actionNameMap[optimalAction] || optimalAction} at ${Math.round(maxFreq * 100)}% frequency in this spot. This specifically relates to ${game.focus}.`,
                        pioFrequencies: handActions // Include real frequencies for reference
                    };

                    console.log(`[Bootstrap] ✅ Generated PIO question: ${heroHand} on ${question.scenario.board}`);
                    return question;
                }
            }
        }
    } catch (pioError) {
        console.warn(`[Bootstrap] ⚠️ PIO query failed for ${game.id}:`, pioError.message);
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 2: Fallback to Grok AI if no PIO data
    // ═══════════════════════════════════════════════════════════════════
    console.log(`[Bootstrap] 💡 No PIO data for ${game.id}, using Grok AI fallback...`);

    // Determine positions
    let positions = [];
    if (playerCount === 2) { positions = ['SB', 'BB']; }
    else if (playerCount === 3) { positions = ['BTN', 'SB', 'BB']; }
    else if (playerCount === 9) { positions = ['UTG', 'UTG+1', 'MP', 'MP+1', 'HJ', 'CO', 'BTN', 'SB', 'BB']; }
    else { positions = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB']; }

    const varietySeed = `Q${index + 1}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

    const prompt = `You are a GTO poker solver expert. Generate a UNIQUE training question for "${game.name}" (Question #${index + 1}).

GAME SPECIFICATION:
- Game: ${game.name} (Focus: ${game.focus})
- Format: ${format} (${playerCount} players)
- Stack: ${stackDepth}
- Level: ${level}/10

VARIETY SEED: ${varietySeed}

Generate ONLY valid JSON (no markdown):
{
  "id": "${game.id}_L${level}_Q${index + 1}_GROK_${Date.now()}",
  "type": "PIO",
  "source": "GROK",
  "question": "What is the GTO play?",
  "scenario": {
    "heroPosition": "[pick from: ${positions.slice(0, 4).join(', ')}]",
    "heroStack": ${stackDepth.replace(/bb/i, '')},
    "heroHand": "[unique 2-card hand like ${['T9s', '76s', 'QJo', 'A5s', 'K8o', '55'][index % 6]}]",
    "gameType": "${format}",
    "board": "[unique 3-5 cards]",
    "pot": [realistic pot],
    "villainPosition": "[different from hero]",
    "villainStack": [realistic],
    "action": "[action description]"
  },
  "options": [
    {"id": "a", "text": "[first option]"},
    {"id": "b", "text": "[second option]"},
    {"id": "c", "text": "[third option]"},
    {"id": "d", "text": "[fourth option]"}
  ],
  "correctAnswer": "[a, b, c, or d]",
  "explanation": "[GTO reasoning for ${game.focus}]"
}`;

    const response = await grok.chat.completions.create({
        model: 'grok-3',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.95,
        max_tokens: 900,
    });

    return parseGrokResponse(response);
}

/**
 * Parse Grok response into JSON
 */
function parseGrokResponse(response) {
    const content = response.choices[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
    }
    return null;
}

/**
 * Save questions to database
 */
async function saveQuestions(gameId, engineType, level, questions) {
    let saved = 0;

    for (const question of questions) {
        if (!question || !question.id) continue;

        const { error } = await supabase
            .from('training_question_cache')
            .upsert({
                question_id: question.id,
                game_id: gameId,
                engine_type: engineType,
                game_type: getGameType(gameId),
                level: level,
                question_data: question,
                generated_at: new Date().toISOString(),
                times_used: 0,
            }, { onConflict: 'question_id' });

        if (!error) saved++;
    }

    return saved;
}

/**
 * Get game type from game ID
 */
function getGameType(gameId) {
    if (gameId.startsWith('mtt-')) return 'tournament';
    if (gameId.startsWith('spins-')) return 'sng';
    return 'cash';
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
