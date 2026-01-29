/**
 * GET /api/training/get-question
 * Fetches next question for a training game session
 * 
 * Query params:
 * - gameId: Game identifier
 * - userId: User ID (for no-repeat tracking)
 * - level: Current level (1-10)
 * - engineType: PIO | CHART | SCENARIO
 */

import { createClient } from '@supabase/supabase-js';
import { getGrokClient } from '../../../src/lib/grokClient';
import TRAINING_CONFIG from '../../../src/config/trainingConfig';
import { getGameConfig, getStackDepthNumber } from '../../../src/config/gameConfigs';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { gameId, userId, level = 1, engineType = 'PIO' } = req.query;

    if (!gameId) {
        return res.status(400).json({ error: 'gameId required' });
    }

    try {
        // ═══════════════════════════════════════════════════════════════════
        // STEP 1: GET COMPREHENSIVE GAME CONFIGURATION
        // ═══════════════════════════════════════════════════════════════════
        const TRAINING_LIBRARY = require('../../../src/data/TRAINING_LIBRARY').default;
        const game = TRAINING_LIBRARY.find(g => g.id === gameId);

        if (!game) {
            return res.status(404).json({ error: 'Game not found' });
        }

        // Get comprehensive game configuration
        const gameConfig = getGameConfig(gameId);
        const gameType = gameConfig.gameType; // 'cash', 'tournament', or 'sng'
        const playerCount = gameConfig.players; // 2, 3, 6, or 9
        const gameFormat = gameConfig.format; // "Heads-Up Cash", "6-Max Cash", etc.
        const stackDepth = getStackDepthNumber(gameConfig.stackDepth); // Numeric BB
        const preferredEngine = gameConfig.engine; // 'PIO', 'CHART', or 'SCENARIO'

        console.log(`[Training] 🎮 ${game.name} | ${gameFormat} (${playerCount}p) | ${stackDepth}bb | Engine: ${preferredEngine}`);

        // ═══════════════════════════════════════════════════════════════════
        // STEP 2: GET SEEN QUESTIONS (No-Repeat Logic)
        // ═══════════════════════════════════════════════════════════════════
        let seenQuestionIds = [];
        if (userId) {
            const { data: seen } = await supabase
                .from('user_seen_questions')
                .select('question_id')
                .eq('user_id', userId)
                .eq('game_id', gameId);

            seenQuestionIds = (seen || []).map(s => s.question_id);
        }

        // ═══════════════════════════════════════════════════════════════════
        // STEP 3: TRY PIO DATABASE FIRST (NEW INTEGRATION)
        // ═══════════════════════════════════════════════════════════════════
        let question = null;

        // Import PIO Query Service with proper CommonJS/ES6 handling
        let pioQueryService = null;
        try {
            const PIOModule = require('../../../src/services/PIOQueryService');
            pioQueryService = PIOModule.pioQueryService || PIOModule.default?.pioQueryService;
        } catch (err) {
            console.log('[Training] ⚠️ PIOQueryService not available:', err.message);
        }

        // Try to get question from PIO database if service is available
        if (pioQueryService && typeof pioQueryService.queryScenarios === 'function') {
            console.log('[Training] 🔍 Querying PIO database...');
            const pioScenarios = await pioQueryService.queryScenarios(gameId, level, userId);

            if (pioScenarios && pioScenarios.length > 0) {
                console.log(`[Training] ✅ Found ${pioScenarios.length} PIO scenarios`);
                question = await generateQuestionFromPIO(pioScenarios, gameId, level, game);
            } else {
                console.log('[Training] ⚠️ No PIO scenarios found, will try cache/Grok');
            }
        } else {
            console.log('[Training] ⚠️ PIOQueryService not initialized, skipping PIO query');
        }

        // ═══════════════════════════════════════════════════════════════════
        // STEP 4: FALLBACK TO CACHED QUESTIONS (Before Grok)
        // ═══════════════════════════════════════════════════════════════════
        if (!question) {
            console.log('[Training] 💾 Checking question cache...');

            const { data: cachedQuestions } = await supabase
                .from('training_question_cache')
                .select('question_data, question_id')
                .eq('game_id', gameId)
                .eq('level', level)
                .eq('engine_type', engineType.toUpperCase())
                .not('question_id', 'in', `(${seenQuestionIds.join(',') || 'null'})`)
                .limit(10); // Get 10 random candidates

            if (cachedQuestions && cachedQuestions.length > 0) {
                // Pick random question from cache
                const randomIndex = Math.floor(Math.random() * cachedQuestions.length);
                question = cachedQuestions[randomIndex].question_data;

                // Increment times_used counter
                await supabase
                    .from('training_question_cache')
                    .update({ times_used: supabase.raw('times_used + 1') })
                    .eq('question_id', cachedQuestions[randomIndex].question_id);

                console.log('[Training] ✅ Loaded from cache:', question.question);
            }
        }

        // ═══════════════════════════════════════════════════════════════════
        // STEP 5: GENERATE WITH GROK AI (Last Resort)
        // ═══════════════════════════════════════════════════════════════════
        if (!question) {
            console.log('[Training] 💡 No cached question found, generating with Grok AI...');
            question = await generateQuestionWithGrok(gameId, engineType, level, gameType, game, gameConfig);

            // Save to cache for future use
            if (question) {
                try {
                    await supabase
                        .from('training_question_cache')
                        .insert({
                            question_id: question.id,
                            game_id: gameId,
                            engine_type: engineType.toUpperCase(),
                            game_type: gameType,
                            level: parseInt(level),
                            question_data: question,
                            times_used: 1,
                        });
                    console.log('[Training] 💾 Saved to cache:', question.id);
                } catch (cacheError) {
                    // Ignore duplicate errors (question already cached)
                    if (!cacheError.message?.includes('duplicate')) {
                        console.error('[Training] ⚠️ Cache save failed:', cacheError.message);
                    }
                }
            }
        }

        if (!question) {
            return res.status(404).json({
                error: 'No questions available',
                message: 'All questions for this game have been completed'
            });
        }

        return res.status(200).json({
            success: true,
            question,
            level: parseInt(level),
            passThreshold: TRAINING_CONFIG.passThresholds[level] || 85,
            gameType, // Return game type for debugging
        });

    } catch (error) {
        console.error('[Training] ❌ Get question error:', error);
        return res.status(500).json({ error: error.message });
    }
}

/**
 * Generate question from PIO solver data
 * Transforms raw PIO scenarios into training questions
 */
async function generateQuestionFromPIO(pioScenarios, gameId, level, game) {
    try {
        // Pick a random scenario from the available ones
        const scenario = pioScenarios[Math.floor(Math.random() * pioScenarios.length)];

        console.log('[Training] 📊 Generating question from PIO scenario:', scenario.scenarioHash);

        // Extract strategy matrix
        const strategies = scenario.strategies || {};
        const strategyKeys = Object.keys(strategies);

        if (strategyKeys.length === 0) {
            console.log('[Training] ⚠️ No strategies in scenario, falling back');
            return null;
        }

        // Get a few sample hands from the strategy matrix
        const sampleHands = strategyKeys.slice(0, 5).map(key => {
            const strategy = strategies[key];
            return {
                hand: strategy.hand || key,
                action: strategy.action || 'Unknown',
                ev: strategy.ev || 0
            };
        });

        // Find the optimal action (most common action in the matrix)
        const actionCounts = {};
        strategyKeys.forEach(key => {
            const action = strategies[key].action || 'Check';
            actionCounts[action] = (actionCounts[action] || 0) + 1;
        });

        const optimalAction = Object.keys(actionCounts).reduce((a, b) =>
            actionCounts[a] > actionCounts[b] ? a : b
        );

        // Build question
        const question = {
            id: `pio_${scenario.id}_${Date.now()}`,
            type: 'PIO',
            source: 'PIO_DATABASE',
            scenario: {
                board: scenario.board.join(' '),
                street: scenario.street,
                stackDepth: scenario.stackDepth,
                gameType: scenario.gameType,
                scenarioHash: scenario.scenarioHash
            },
            question: `On the ${scenario.street}, the board is ${scenario.board.join(' ')}. You have ${scenario.stackDepth}BB. What is the GTO play?`,
            options: buildOptionsFromActions(Object.keys(actionCounts)),
            correctAnswer: optimalAction.toLowerCase().replace(/\s/g, '_'),
            explanation: `According to PIO solver data, the optimal action on this ${scenario.street} is to ${optimalAction}. This board texture favors this line based on range advantage and equity distribution.`,
            difficulty: level,
            sampleHands: sampleHands.slice(0, 3) // Include a few example hands
        };

        console.log('[Training] ✅ Generated PIO question:', question.question);
        return question;

    } catch (error) {
        console.error('[Training] ❌ Error generating PIO question:', error);
        return null;
    }
}

/**
 * Build answer options from available actions
 */
function buildOptionsFromActions(actions) {
    const allActions = ['Fold', 'Check', 'Call', 'Bet', 'Raise', 'All-In'];
    const options = [];

    // Add actions from PIO data
    actions.forEach(action => {
        options.push({
            id: action.toLowerCase().replace(/\s/g, '_'),
            text: action
        });
    });

    // Fill with other common actions if needed
    while (options.length < 4) {
        const filler = allActions.find(a => !options.some(o => o.text === a));
        if (filler) {
            options.push({
                id: filler.toLowerCase().replace(/\s/g, '_'),
                text: filler
            });
        } else {
            break;
        }
    }

    return options.slice(0, 4);
}

/**
 * DEPRECATED: Old PIO Engine (kept for reference)
 * PIO Engine: Get solver-based question from Supabase
 */
async function getPIOQuestion(gameId, level, seenIds) {
    // This function is now deprecated in favor of generateQuestionFromPIO
    // which uses the new PIO Query Service
    return null;
}

/**
 * Build options from solver template frequencies
 */
function buildPIOOptions(template) {
    const frequencies = template.frequencies || {};
    const actions = Object.keys(frequencies);

    // Ensure we have 4 options
    const allActions = ['Fold', 'Check/Call', 'Bet 33%', 'Bet 66%', 'Bet 100%', 'Raise', 'All-In'];
    const options = [];

    // Add actions from template
    actions.forEach(action => {
        options.push({
            id: action.toLowerCase().replace(/\s/g, '_'),
            text: action,
            frequency: frequencies[action],
        });
    });

    // Fill with other actions if needed
    while (options.length < 4) {
        const filler = allActions.find(a => !options.some(o => o.text === a));
        if (filler) {
            options.push({ id: filler.toLowerCase().replace(/\s/g, '_'), text: filler, frequency: 0 });
        } else {
            break;
        }
    }

    return options.slice(0, 4);
}

/**
 * CHART Engine: Get range chart question
 */
async function getChartQuestion(gameId, level, seenIds) {
    // Load from chart data files or database
    let charts;
    try {
        charts = require('../../../data/charts/push_fold_ranges.json');
    } catch {
        charts = [];
    }

    // If no charts, return null to fall back to Grok
    if (!Array.isArray(charts) || charts.length === 0) return null;

    // Find unseen chart scenario
    const available = charts.filter(c => !seenIds.includes(c.id));
    if (available.length === 0) return null;

    // Pick based on difficulty
    const chart = available[Math.floor(Math.random() * available.length)];

    return {
        id: chart.id || `chart_${Date.now()}`,
        type: 'CHART',
        scenario: {
            position: chart.position,
            stackBB: chart.stack_bb,
            chartType: chart.type,
        },
        question: chart.question || `Should you ${chart.type} with this hand from ${chart.position}?`,
        hand: chart.hand,
        options: [
            { id: 'push', text: 'Push/Raise' },
            { id: 'fold', text: 'Fold' },
            { id: 'call', text: 'Call' },
            { id: 'limp', text: 'Limp' },
        ],
        correctAnswer: chart.correct_action,
        explanation: chart.explanation,
        difficulty: level,
    };
}

/**
 * SCENARIO Engine: Get mental game question
 */
async function getScenarioQuestion(gameId, level, seenIds) {
    // Load mental game scenarios
    let scenarios;
    try {
        scenarios = require('../../../data/scenarios/mental_game.json');
    } catch {
        scenarios = [];
    }

    // If no scenarios, return null to fall back to Grok
    if (!Array.isArray(scenarios) || scenarios.length === 0) return null;

    const available = scenarios.filter(s => !seenIds.includes(s.id));
    if (available.length === 0) return null;

    const scenario = available[Math.floor(Math.random() * available.length)];

    return {
        id: scenario.id || `scenario_${Date.now()}`,
        type: 'SCENARIO',
        scenario: {
            title: scenario.title,
            context: scenario.context,
        },
        question: scenario.prompt,
        options: scenario.options.map(o => ({
            id: o.id,
            text: o.text,
            type: o.type,
        })),
        correctAnswer: scenario.options.find(o => o.correct)?.id,
        explanation: scenario.options.find(o => o.correct)?.feedback,
        difficulty: level,
        timeoutSeconds: scenario.timeout_seconds || 30,
    };
}

/**
 * Grok AI Fallback: Generate question when database is exhausted
 * PIO ENGINE IS THE SOURCE OF TRUTH - Grok generates GTO-accurate questions
 */
async function generateQuestionWithGrok(gameId, engineType, level, gameType, game, gameConfig) {
    try {
        const grok = getGrokClient();

        const gameName = game?.name || 'Training Game';
        const gameCategory = game?.category || 'CASH';

        // Map game type to readable format
        const gameTypeDisplay = gameType === 'tournament' ? 'Tournament (MTT)'
            : gameType === 'sng' ? 'Spin & Go (SNG)'
                : '6-Max Cash Game';

        const prompt = `You are a GTO poker solver expert. Generate a realistic poker training question for "${gameName}" (${gameCategory}) at difficulty level ${level}/10.

CRITICAL REQUIREMENTS:
- Game Type: ${gameTypeDisplay}
- Use REAL poker scenarios that would appear in ${gameTypeDisplay} games
- ${gameType === 'tournament' ? 'Include ICM considerations and stack depths in BB' : ''}
- ${gameType === 'cash' ? 'Use 100BB effective stacks and focus on postflop play' : ''}
- ${gameType === 'sng' ? 'Use hyper-turbo stack depths (10-25BB) and 3-max dynamics' : ''}
- Provide GTO-accurate solver-style answers
- Include specific stack depths, positions, and board textures
- Explain WHY the GTO play is optimal (equity, range advantage, ICM, etc.)

Game Context:
- Game: ${gameName}
- Category: ${gameCategory}
- Game Type: ${gameTypeDisplay}
- Difficulty: ${level}/10 (1=beginner, 10=expert)
- Engine: ${engineType}

Generate a question in this EXACT JSON format (no markdown, no code blocks):
{
  "id": "grok_${gameId}_${Date.now()}",
  "type": "${engineType}",
  "question": "What is the GTO play in this spot?",
  "scenario": {
    "heroPosition": "BTN",
    "heroStack": ${gameType === 'tournament' ? '25' : gameType === 'sng' ? '15' : '100'},
    "gameType": "${gameTypeDisplay}",
    "heroHand": "AhKs",
    "board": "Jh7s2d",
    "pot": ${gameType === 'tournament' ? '8' : gameType === 'sng' ? '5' : '12'},
    "villainPosition": "BB",
    "villainStack": ${gameType === 'tournament' ? '22' : gameType === 'sng' ? '12' : '100'},
    "action": "Villain bets ${gameType === 'tournament' ? '5bb' : gameType === 'sng' ? '3bb' : '8bb'}"
  },
  "options": [
    {"id": "a", "text": "Fold"},
    {"id": "b", "text": "Call"},
    {"id": "c", "text": "Raise to 24bb"},
    {"id": "d", "text": "All-In"}
  ],
  "correctAnswer": "c",
  "explanation": "Raising is optimal because: (1) You have strong equity with AK high + backdoor flush, (2) Villain's range is capped on this dry board, (3) You have position and can apply maximum pressure${gameType === 'tournament' ? ', (4) ICM pressure makes villain fold more often' : ''}, (4) Solver shows this as a 65% raise frequency spot."
}

IMPORTANT: Make the scenario realistic for ${gameTypeDisplay}. Use proper GTO reasoning in the explanation.`;

        const response = await grok.chat.completions.create({
            model: 'grok-3',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.8, // Higher temp for more variety
            max_tokens: 800,
        });

        const content = response.choices[0]?.message?.content || '';

        // Try to extract JSON from response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            console.log(`[Training] ✅ Grok generated ${gameTypeDisplay} question:`, parsed.question);
            return parsed;
        }
    } catch (error) {
        console.error('[Training] ❌ Grok question generation failed:', error.message);
    }

    // Return hardcoded fallback question if Grok fails
    return getHardcodedQuestion(engineType, level, gameType);
}

/**
 * Hardcoded fallback questions when all else fails
 */
function getHardcodedQuestion(engineType, level) {
    const questions = {
        PIO: [
            {
                id: `fallback_pio_${Date.now()}`,
                type: 'PIO',
                scenario: { heroPosition: 'BTN', heroStack: 100, gameType: '6-Max Cash' },
                question: 'You are on the Button with AcKs. UTG raises to 3bb. What is the optimal play?',
                options: [
                    { id: 'a', text: 'Fold' },
                    { id: 'b', text: 'Call' },
                    { id: 'c', text: '3-bet to 9bb' },
                    { id: 'd', text: 'All-In' },
                ],
                correctAnswer: 'c',
                explanation: 'AKs is a premium hand that should be 3-bet for value from the Button against a UTG open.',
            },
            {
                id: `fallback_pio2_${Date.now()}`,
                type: 'PIO',
                scenario: { heroPosition: 'BB', heroStack: 25, gameType: 'MTT' },
                question: 'You are in the BB with 25bb. BTN opens to 2.5bb. SB folds. You have QJo. What is your play?',
                options: [
                    { id: 'a', text: 'Fold' },
                    { id: 'b', text: 'Call' },
                    { id: 'c', text: '3-bet to 8bb' },
                    { id: 'd', text: 'All-In' },
                ],
                correctAnswer: 'b',
                explanation: 'With QJo and 25bb, calling is preferred to close the action. 3-betting leaves you committed.',
            },
        ],
        CHART: [
            {
                id: `fallback_chart_${Date.now()}`,
                type: 'CHART',
                scenario: { position: 'SB', stackBB: 10 },
                question: 'You have 10bb in the SB with A5s. It folds to you. Should you push or fold?',
                options: [
                    { id: 'a', text: 'Push' },
                    { id: 'b', text: 'Fold' },
                    { id: 'c', text: 'Limp' },
                    { id: 'd', text: 'Min-raise' },
                ],
                correctAnswer: 'a',
                explanation: 'A5s is a clear push from SB with 10bb according to push/fold charts.',
            },
        ],
        SCENARIO: [
            {
                id: `fallback_scenario_${Date.now()}`,
                type: 'SCENARIO',
                scenario: { title: 'Tilt Management' },
                question: 'You just lost a big pot with AA vs 72o all-in preflop. What should you do?',
                options: [
                    { id: 'a', text: 'Play faster to win it back' },
                    { id: 'b', text: 'Take a 5-minute break' },
                    { id: 'c', text: 'Move up stakes for easier games' },
                    { id: 'd', text: 'Review the hand right now' },
                ],
                correctAnswer: 'b',
                explanation: 'Taking a short break helps reset your mental state and prevents tilt-driven decisions.',
            },
        ],
    };

    const engineQuestions = questions[engineType] || questions.PIO;
    const index = Math.floor(Math.random() * engineQuestions.length);
    return engineQuestions[index];
}

// Deploy trigger Wed Jan 28 23:02:33 CST 2026
